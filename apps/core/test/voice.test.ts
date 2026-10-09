import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import type WebSocket from "ws";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceSessionAnswer } from "@ahmed/contract";
import { createCore, type Core } from "../src/server.js";
import type { ModelClient } from "../src/model.js";
import { OpenAIVoiceProvider, realtimeConfig, type VoiceCall, type VoiceEvent, type VoiceProvider } from "../src/voiceProvider.js";
import { AUTH, TOKEN, approval, countEvents, decide, getConversation, makeEnv, scriptedModel, sendAndWait, type Env } from "./helpers.js";

const SDP = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
class FakeVoice implements VoiceProvider {
  readonly calls: Array<VoiceCall & { sent: VoiceEvent[]; ended: number; emit(event: VoiceEvent): void; disconnect(): void }> = [];
  async start(_sdp: string, onEvent: (event: VoiceEvent) => void, onDisconnect: () => void): Promise<VoiceCall> {
    const call = { sdp: SDP, sent: [] as VoiceEvent[], ended: 0, emit: onEvent, disconnect: onDisconnect,
      send: (event: VoiceEvent) => { call.sent.push(event); }, close: async () => { call.ended++; } };
    this.calls.push(call); return call;
  }
  say(text: string, id = "item_1", call = this.calls[0]) {
    call.emit({ type: "input_audio_buffer.speech_started", item_id: id });
    call.emit({ type: "input_audio_buffer.speech_stopped", item_id: id });
    call.emit({ type: "input_audio_buffer.committed", item_id: id });
    call.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: id, transcript: text });
  }
}

describe("voice through the existing Core", () => {
  let core: Core | undefined, env: Env | undefined;
  afterEach(async () => { vi.useRealTimers(); await core?.close(); env?.cleanup(); core = undefined; env = undefined; });
  async function setup(model: ModelClient = scriptedModel(), sessionMs?: number) {
    env = makeEnv(); const provider = new FakeVoice();
    core = await createCore({ dbFile: env.dbFile, workspaceRoot: env.wsRoot, appToken: TOKEN, model, clock: env.clock, voice: provider, voiceSessionMs: sessionMs });
    return provider;
  }
  async function start(conversationId = "same-conversation") {
    const r = await core!.app.inject({ method: "POST", url: "/v1/voice/sessions", headers: AUTH, payload: { conversation_id: conversationId, sdp: SDP } });
    expect(r.statusCode).toBe(201); return r.json() as VoiceSessionAnswer;
  }

  it("authenticates all voice endpoints before using the provider", async () => {
    const provider = await setup();
    for (const method of ["POST", "GET", "DELETE"] as const) {
      const r = await core!.app.inject({ method, url: method === "POST" ? "/v1/voice/sessions" : "/v1/voice/sessions/unknown", payload: method === "POST" ? { conversation_id: "c", sdp: SDP } : undefined });
      expect(r.statusCode).toBe(401);
    }
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects invalid/missing/audio-less SDP and oversized conversation ids", async () => {
    const provider = await setup();
    for (const payload of [{}, { conversation_id: "c", sdp: "not an offer" }, { conversation_id: "c", sdp: "v=0\r\nm=video 9 RTP/AVP 96\r\n" }, { conversation_id: " ", sdp: SDP }, { conversation_id: "x".repeat(101), sdp: SDP }]) {
      const r = await core!.app.inject({ method: "POST", url: "/v1/voice/sessions", headers: AUTH, payload });
      expect(r.statusCode).toBe(400);
    }
    expect(provider.calls).toHaveLength(0);
  });

  it("returns only SDP and application state, with no provider credentials", async () => {
    await setup(); const answer = await start();
    expect(answer.state).toBe("listening");
    expect(Object.keys(answer).sort()).toEqual(["session_id", "conversation_id", "state", "user_speaking", "transcript", "task", "error", "expires_at", "revision", "sdp"].sort());
  });

  it("persists each transcript as one ordinary task with the existing conversation history", async () => {
    const model = scriptedModel(); const provider = await setup(model);
    await sendAndWait(core!, "same-conversation", "My earlier text message.");
    const answer = await start(); provider.say("تذكر رسالتي السابقة");
    await core!.drain();
    const snapshot = core!.voice!.get(answer.session_id);
    expect(snapshot.task?.status).toBe("COMPLETED");
    const history = await getConversation(core!, "same-conversation");
    expect(history.tasks).toHaveLength(2);
    expect(history.messages.filter((m) => m.content === "تذكر رسالتي السابقة")).toHaveLength(1);
    expect(model.requests.at(-1)?.messages[0].content).toBe("My earlier text message.");
    expect(countEvents(core!, "VOICE_TRANSCRIPT_ACCEPTED", snapshot.task!.task_id!)).toBe(1);
    expect(provider.calls[0].sent.filter((e) => e.type === "response.create")).toHaveLength(1);
  });

  it("does not create duplicate tasks or speech from repeated transcription events", async () => {
    const provider = await setup(); await start(); provider.say("مرحبا"); await core!.drain();
    provider.calls[0].emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "item_1", transcript: "مرحبا" });
    await core!.drain();
    expect((await getConversation(core!, "same-conversation")).tasks).toHaveLength(1);
    expect(provider.calls[0].sent.filter((e) => e.type === "response.create")).toHaveLength(1);
  });

  it("preserves audio order when transcriptions complete in reverse order", async () => {
    const provider = await setup(); await start(); const call = provider.calls[0];
    for (const id of ["first", "second"]) call.emit({ type: "input_audio_buffer.committed", item_id: id });
    call.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "second", transcript: "second request" });
    expect(core!.store.listTasks("same-conversation")).toHaveLength(0);
    call.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "first", transcript: "first request" });
    await core!.drain();
    const users = core!.store.listMessages("same-conversation").filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toEqual(["first request", "second request"]);
  });

  it("retains attachment context, requests approval, and executes only through the existing decision endpoint", async () => {
    const provider = await setup();
    await sendAndWait(core!, "same-conversation", "Remember this file.", { name: "notes.txt", content: "important" });
    const answer = await start(); provider.say("انقل الملف إلى archive"); await core!.drain();
    const result = core!.voice!.get(answer.session_id).task!;
    expect(result.status).toBe("WAITING_FOR_APPROVAL");
    expect(existsSync(path.join(env!.wsRoot, "inbox/notes.txt"))).toBe(true);
    expect(countEvents(core!, "EXECUTION_STARTED", result.task_id!)).toBe(0);
    const a = approval(result);
    const r = await decide(core!, result.task_id!, a.action_id, "APPROVE");
    expect(r.body.status).toBe("COMPLETED");
    await decide(core!, result.task_id!, a.action_id, "APPROVE");
    expect(countEvents(core!, "EXECUTION_STARTED", result.task_id!)).toBe(1);
    expect(existsSync(path.join(env!.wsRoot, "archive/notes.txt"))).toBe(true);
    expect(core!.voice!.get(answer.session_id).task?.status).toBe("COMPLETED");
  });

  it("does not interpret spoken approve or provider tool events as an approval", async () => {
    const provider = await setup();
    await sendAndWait(core!, "same-conversation", "file", { name: "notes.txt", content: "data" });
    await start(); provider.say("move the file"); await core!.drain();
    const task = core!.store.listTasks("same-conversation")[0];
    provider.calls[0].emit({ type: "response.function_call_arguments.done", name: "approve", arguments: JSON.stringify({ task_id: task.id }) });
    provider.say("موافق", "spoken-approval"); await core!.drain();
    expect(core!.store.getTask(task.id)?.status).toBe("WAITING_FOR_APPROVAL");
    expect(countEvents(core!, "EXECUTION_STARTED", task.id)).toBe(0);
  });

  it("keeps rejected and expired voice actions unexecuted", async () => {
    const provider = await setup();
    await sendAndWait(core!, "same-conversation", "file", { name: "notes.txt", content: "data" });
    const answer = await start(); provider.say("move"); await core!.drain();
    let task = core!.voice!.get(answer.session_id).task!;
    await decide(core!, task.task_id!, approval(task).action_id, "REJECT");
    expect(core!.voice!.get(answer.session_id).task?.status).toBe("REJECTED");
    provider.say("move", "second"); await core!.drain();
    task = core!.voice!.get(answer.session_id).task!;
    env!.nowMs += 16 * 60_000;
    const r = await decide(core!, task.task_id!, approval(task).action_id, "APPROVE");
    expect(r.statusCode).toBe(410);
    expect(existsSync(path.join(env!.wsRoot, "inbox/notes.txt"))).toBe(true);
    expect(countEvents(core!, "EXECUTION_STARTED")).toBe(0);
  });

  it("renders only Core text with no conversation context or tools", async () => {
    const provider = await setup(); await start(); provider.say("مرحبا"); await core!.drain();
    const event = provider.calls[0].sent.find((e) => e.type === "response.create")!;
    const response = event.response as { input: unknown[]; conversation: string; instructions: string; tools: unknown[] };
    expect(response.conversation).toBe("none"); expect(response.input).toEqual([]); expect(response.tools).toEqual([]);
    expect(response.instructions).toContain("Hello Ahmed.");
    const config = realtimeConfig({ apiKey: "test-secret" });
    expect(JSON.stringify(config)).not.toContain("test-secret");
    expect((config.audio as { input: { turn_detection: { create_response: boolean } } }).input.turn_detection.create_response).toBe(false);
  });

  it("barge-in cancels generation and clears playback while retaining tasks", async () => {
    const provider = await setup(); const answer = await start(); provider.say("مرحبا"); await core!.drain();
    provider.calls[0].emit({ type: "output_audio_buffer.started" });
    expect(core!.voice!.get(answer.session_id).state).toBe("speaking");
    provider.calls[0].emit({ type: "input_audio_buffer.speech_started", item_id: "next" });
    expect(provider.calls[0].sent.map((e) => e.type)).toContain("response.cancel");
    expect(provider.calls[0].sent.map((e) => e.type)).toContain("output_audio_buffer.clear");
    expect(core!.voice!.get(answer.session_id).user_speaking).toBe(true);
    expect(core!.store.listTasks("same-conversation")).toHaveLength(1);
  });

  it("drops stale speech when the user interrupts a slow Core result", async () => {
    let resolve!: () => void;
    const wait = new Promise<void>((r) => { resolve = r; }); const scripted = scriptedModel();
    const provider = await setup({ complete: async (req) => { await wait; return scripted.complete(req); } });
    await start(); provider.say("first request");
    provider.calls[0].emit({ type: "input_audio_buffer.speech_started", item_id: "second" });
    resolve(); await core!.drain();
    expect(core!.store.listTasks("same-conversation")[0].status).toBe("COMPLETED");
    expect(provider.calls[0].sent.filter((e) => e.type === "response.create")).toHaveLength(0);
  });

  it("lets an accepted Core task finish after ending the call, without speaking again", async () => {
    let resolve!: () => void; const wait = new Promise<void>((r) => { resolve = r; }); const model = scriptedModel();
    const provider = await setup({ complete: async (req) => { await wait; return model.complete(req); } });
    const answer = await start(); provider.say("remember this request");
    expect(core!.store.listTasks("same-conversation")[0].status).toBe("PROCESSING");
    await core!.voice!.end(answer.session_id); resolve(); await core!.drain();
    expect(core!.store.listTasks("same-conversation")[0].status).toBe("COMPLETED");
    expect(provider.calls[0].sent).toHaveLength(0); expect(provider.calls[0].ended).toBe(1);
  });

  it("ignores empty/failed transcripts without phantom tasks and accepts the next turn", async () => {
    const provider = await setup(); await start(); provider.say("  ");
    provider.calls[0].emit({ type: "input_audio_buffer.committed", item_id: "failed" });
    provider.calls[0].emit({ type: "conversation.item.input_audio_transcription.failed", item_id: "failed" });
    await core!.drain(); expect(core!.store.listTasks("same-conversation")).toHaveLength(0);
    provider.say("hello", "valid"); await core!.drain();
    expect(core!.store.listTasks("same-conversation")).toHaveLength(1);
  });

  it("ends idempotently, ignores late input, and bounds concurrent sessions", async () => {
    const provider = await setup(); const answer = await start();
    let r = await core!.app.inject({ method: "POST", url: "/v1/voice/sessions", headers: AUTH, payload: { conversation_id: "same-conversation", sdp: SDP } });
    expect(r.statusCode).toBe(409);
    await start("other");
    r = await core!.app.inject({ method: "POST", url: "/v1/voice/sessions", headers: AUTH, payload: { conversation_id: "third", sdp: SDP } }); expect(r.statusCode).toBe(429);
    for (let i = 0; i < 2; i++) await core!.app.inject({ method: "DELETE", url: `/v1/voice/sessions/${answer.session_id}`, headers: AUTH });
    expect(provider.calls[0].ended).toBe(1);
    provider.say("too late"); await core!.drain(); expect(core!.store.listTasks("same-conversation")).toHaveLength(0);
  });

  it("closes on provider failure without returning its raw error payload", async () => {
    const provider = await setup(); const answer = await start();
    provider.calls[0].emit({ type: "error", error: { message: "sk-test-secret" } }); await core!.drain();
    const snapshot = core!.voice!.get(answer.session_id);
    expect(snapshot.state).toBe("error"); expect(JSON.stringify(snapshot)).not.toContain("sk-test-secret");
    expect(JSON.stringify(core!.store.listAudit())).not.toContain("sk-test-secret");
    expect(provider.calls[0].ended).toBe(1);
  });

  it("closes at its time limit and on loss of the phone heartbeat", async () => {
    const provider = await setup(undefined, 60_000); vi.useFakeTimers(); const answer = await core!.voice!.start("same-conversation", SDP);
    await vi.advanceTimersByTimeAsync(35_000);
    expect(core!.voice!.get(answer.session_id).state).toBe("closed"); expect(provider.calls[0].ended).toBe(1);
    const second = await core!.voice!.start("same-conversation", SDP);
    for (let i = 0; i < 3; i++) { await vi.advanceTimersByTimeAsync(19_000); core!.voice!.get(second.session_id); }
    await vi.advanceTimersByTimeAsync(3_000);
    expect(core!.voice!.get(second.session_id).state).toBe("closed");
  });

  it("times out a missing transcript so subsequent speech does not deadlock", async () => {
    const provider = await setup(); vi.useFakeTimers(); await core!.voice!.start("same-conversation", SDP);
    provider.calls[0].emit({ type: "input_audio_buffer.committed", item_id: "lost" });
    provider.calls[0].emit({ type: "input_audio_buffer.committed", item_id: "valid" });
    provider.calls[0].emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "valid", transcript: "hello" });
    await vi.advanceTimersByTimeAsync(25_000); await core!.drain();
    expect(core!.store.listTasks("same-conversation")).toHaveLength(1);
  });

  it("makes voice optional without changing existing text processing", async () => {
    env = makeEnv(); core = await createCore({ dbFile: env.dbFile, workspaceRoot: env.wsRoot, appToken: TOKEN, model: scriptedModel(), clock: env.clock });
    const r = await core.app.inject({ method: "POST", url: "/v1/voice/sessions", headers: AUTH, payload: { conversation_id: "c", sdp: SDP } });
    expect(r.statusCode).toBe(503);
    expect((await sendAndWait(core, "c", "hello")).status).toBe("COMPLETED");
  });

  it("sanitizes provider session HTTP failures before any sideband connection", async () => {
    const request = vi.fn().mockResolvedValue(new Response("sk-secret-provider-body", { status: 401 }));
    const provider = new OpenAIVoiceProvider({ apiKey: "secret" }, request);
    await expect(provider.start(SDP, () => {}, () => {})).rejects.toThrow("Voice provider refused session (401).");
    const init = request.mock.calls[0][1] as RequestInit;
    expect((init.body as FormData).get("session")).not.toContain("secret");
    expect(init.headers).toEqual({ Authorization: "Bearer secret" });
  });

  it("attaches trusted server controls before returning SDP and authenticates remote hangup", async () => {
    const socket = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn(), terminate: vi.fn() });
    const request = vi.fn().mockResolvedValueOnce(new Response(SDP, { status: 201, headers: { location: "/v1/realtime/calls/rtc_test" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const factory = vi.fn((_url: string, _options: WebSocket.ClientOptions) => {
      queueMicrotask(() => socket.emit("open")); return socket as unknown as WebSocket;
    });
    const events = vi.fn(), disconnected = vi.fn();
    const provider = new OpenAIVoiceProvider({ apiKey: "server-only-secret" }, request, factory);
    const call = await provider.start(SDP, events, disconnected);
    expect(call.sdp).toBe(SDP);
    expect(factory.mock.calls[0][0]).toBe("wss://api.openai.com/v1/realtime?call_id=rtc_test");
    expect(factory.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer server-only-secret" });
    socket.emit("message", Buffer.from(JSON.stringify({ type: "input_audio_buffer.speech_started" })));
    expect(events).toHaveBeenCalledWith({ type: "input_audio_buffer.speech_started" });
    await call.close(); socket.emit("close");
    expect(disconnected).not.toHaveBeenCalled(); expect(socket.terminate).toHaveBeenCalledOnce();
    expect(request.mock.calls[1][0]).toBe("https://api.openai.com/v1/realtime/calls/rtc_test/hangup");
  });

  it("hangs up an allocated remote call if sideband attachment fails", async () => {
    const socket = Object.assign(new EventEmitter(), { terminate: vi.fn() });
    const request = vi.fn().mockResolvedValueOnce(new Response(SDP, { status: 201, headers: { location: "/v1/realtime/calls/rtc_test" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const provider = new OpenAIVoiceProvider({ apiKey: "secret" }, request, () => {
      queueMicrotask(() => socket.emit("error", new Error("sensitive transport detail"))); return socket as unknown as WebSocket;
    });
    await expect(provider.start(SDP, () => {}, () => {})).rejects.toThrow("Could not initialize voice server controls.");
    expect(socket.terminate).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledTimes(2);
  });
});
