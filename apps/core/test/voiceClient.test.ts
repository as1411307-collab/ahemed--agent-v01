import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceSessionAnswer, VoiceSessionSnapshot } from "@ahmed/contract";
import { VoiceClient, type VoiceApi, type VoiceMedia, type VoiceView } from "../../mobile/src/voiceClient.js";

const answer: VoiceSessionAnswer = { session_id: "voice-1", conversation_id: "current-conversation", sdp: "answer", state: "listening", user_speaking: false, transcript: "", task: null, error: null, expires_at: "2026-10-09T12:00:00Z", revision: 1 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }

describe("iPhone voice resource controller (native media mocked)", () => {
  let client: VoiceClient;
  let api: VoiceApi;
  let media: VoiceMedia;
  let latest: VoiceView;
  let changed = vi.fn<() => void>();
  beforeEach(() => {
    vi.useFakeTimers();
    api = { start: vi.fn().mockResolvedValue(answer), get: vi.fn().mockResolvedValue(answer), end: vi.fn().mockResolvedValue({}) };
    media = { offer: vi.fn().mockResolvedValue("offer"), accept: vi.fn().mockResolvedValue(undefined), connected: vi.fn().mockResolvedValue(undefined), mute: vi.fn(), close: vi.fn() };
    changed = vi.fn<() => void>();
    client = new VoiceClient(api, async () => media, (v) => { latest = v; }, changed);
  });
  afterEach(async () => { await client.stop(); vi.useRealTimers(); });

  it("negotiates through the authenticated Core abstraction using the current conversation", async () => {
    await client.start("current-conversation");
    expect(api.start).toHaveBeenCalledWith("current-conversation", "offer");
    expect(media.accept).toHaveBeenCalledWith("answer");
    expect(media.connected).toHaveBeenCalledOnce(); expect(latest.state).toBe("listening");
  });

  it("toggles the native microphone without modifying tasks or provider config", async () => {
    await client.start("c"); client.mute(); expect(media.mute).toHaveBeenLastCalledWith(true);
    expect(latest.muted).toBe(true); client.mute(); expect(media.mute).toHaveBeenLastCalledWith(false);
  });

  it("cleans up a microphone obtained after Stop during a permission dialog", async () => {
    const pending = deferred<VoiceMedia>();
    client = new VoiceClient(api, () => pending.promise, (v) => { latest = v; }, changed);
    const start = client.start("c"); await client.stop(); pending.resolve(media); await start;
    expect(media.close).toHaveBeenCalledOnce(); expect(api.start).not.toHaveBeenCalled(); expect(latest.state).toBe("idle");
  });

  it("hangs up a late server session after Stop while negotiating", async () => {
    const pending = deferred<VoiceSessionAnswer>(); api.start = vi.fn().mockReturnValue(pending.promise);
    const start = client.start("c"); await vi.waitFor(() => expect(api.start).toHaveBeenCalled());
    await client.stop(); pending.resolve(answer); await start;
    expect(api.end).toHaveBeenCalledWith("voice-1"); expect(media.accept).not.toHaveBeenCalled(); expect(latest.state).toBe("idle");
  });

  it("releases media and the provider session on SDP answer failure", async () => {
    media.accept = vi.fn().mockRejectedValue(new Error("bad answer"));
    await client.start("c"); expect(media.close).toHaveBeenCalled(); expect(api.end).toHaveBeenCalledWith("voice-1");
    expect(latest.state).toBe("error"); expect(latest.error).toBe("bad answer");
  });

  it("does not wait on a disposed native connection after Stop during SDP acceptance", async () => {
    const accepting = deferred<void>(); media.accept = vi.fn().mockReturnValue(accepting.promise);
    const start = client.start("c"); await vi.waitFor(() => expect(media.accept).toHaveBeenCalled());
    await client.stop(); accepting.resolve(); await start;
    expect(media.connected).not.toHaveBeenCalled(); expect(latest.state).toBe("idle");
  });

  it("does not acquire two microphones from repeated Start taps", async () => {
    const makeMedia = vi.fn().mockResolvedValue(media);
    client = new VoiceClient(api, makeMedia, (v) => { latest = v; }, changed);
    await Promise.all([client.start("c"), client.start("c")]); expect(makeMedia).toHaveBeenCalledOnce();
  });

  it("refreshes the existing conversation when a voice task changes", async () => {
    const snapshot: VoiceSessionSnapshot = { ...answer, task: { contract_version: "0.1", request_id: "r", task_id: "task-current", response_type: "TASK_STATUS", status: "PROCESSING", message: null, data: null, error: null } };
    api.get = vi.fn().mockResolvedValue(snapshot);
    await client.start("c"); await vi.advanceTimersByTimeAsync(750); expect(changed).toHaveBeenCalledOnce();
    snapshot.task!.status = "WAITING_FOR_APPROVAL";
    await vi.advanceTimersByTimeAsync(750); expect(changed).toHaveBeenCalledTimes(2);
  });

  it("stops capture immediately when Core polling fails, even if remote cleanup fails", async () => {
    api.get = vi.fn().mockRejectedValue(new Error("network")); api.end = vi.fn().mockRejectedValue(new Error("offline"));
    await client.start("c"); await vi.advanceTimersByTimeAsync(0);
    expect(media.close).toHaveBeenCalled(); expect(latest.state).toBe("error");
  });

  it("does not resume a stale poll after Stop", async () => {
    const pending = deferred<VoiceSessionSnapshot>(); api.get = vi.fn().mockReturnValue(pending.promise);
    await client.start("c"); await client.stop(); pending.resolve({ ...answer, state: "speaking" });
    await vi.advanceTimersByTimeAsync(2000); expect(latest.state).toBe("idle"); expect(api.get).toHaveBeenCalledOnce();
  });

  it("releases the native microphone when the server ends the call", async () => {
    api.get = vi.fn().mockResolvedValue({ ...answer, state: "closed" });
    await client.start("c"); await vi.advanceTimersByTimeAsync(0);
    expect(media.close).toHaveBeenCalled(); expect(latest.state).toBe("idle");
  });
});
