// Runs the phone app's real event client (apps/mobile/src/events.ts) against a real Core over a real
// socket. Only react-native (AppState) and expo-file-system are replaced; fetch is Node's.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreEvent } from "@ahmed/contract";
import { createCore, type Core } from "../src/server.js";
import { TOKEN, makeEnv, scriptedModel, sendAndWait, type Env } from "./helpers.js";

const appState = vi.hoisted(() => ({
  currentState: "active",
  listeners: [] as Array<(s: string) => void>,
}));

vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return appState.currentState;
    },
    addEventListener: (_: string, fn: (s: string) => void) => {
      appState.listeners.push(fn);
      return { remove: () => appState.listeners.splice(appState.listeners.indexOf(fn), 1) };
    },
  },
}));
vi.mock("expo-file-system", () => ({ File: class {} }));

// A variable path keeps the Core's tsc from type-checking the React Native sources.
const EVENTS_MODULE = new URL("../../mobile/src/events.ts", import.meta.url).href;
// Declared here instead of `typeof import(...)`, which would pull React Native's globals into this tsc.
interface EventsModule {
  connectEvents(handlers: {
    onReady(): void;
    onReset(): void;
    onEvent(e: CoreEvent): void;
    onState(s: string): void;
    onFatal(e: Error): void;
  }): { stop(): void };
}

const CONV = "conv-phone";
/** With Math.random mocked to 0 the earliest reconnect is 500 ms (clean end) or 1 s (failure). */
const NO_RETRY_WINDOW_MS = 1_500;
let env: Env;
let core: Core;
let stop: (() => void) | undefined;

async function loadClient(token: string, port: number): Promise<EventsModule> {
  vi.resetModules();
  process.env.EXPO_PUBLIC_CORE_URL = `http://127.0.0.1:${port}`;
  process.env.EXPO_PUBLIC_APP_TOKEN = token;
  return (await import(/* @vite-ignore */ EVENTS_MODULE)) as EventsModule;
}

function record() {
  const r = {
    states: [] as string[],
    events: [] as CoreEvent[],
    ready: 0,
    resets: 0,
    fatal: [] as string[],
  };
  return {
    r,
    handlers: {
      onReady: () => r.ready++,
      onReset: () => r.resets++,
      onEvent: (e: CoreEvent) => r.events.push(e),
      onState: (s: string) => r.states.push(s),
      onFatal: (e: Error) => r.fatal.push(e.message),
    },
  };
}

beforeEach(async () => {
  env = makeEnv();
  appState.currentState = "active";
  appState.listeners.length = 0;
  core = await createCore({
    dbFile: env.dbFile,
    workspaceRoot: env.wsRoot,
    appToken: TOKEN,
    model: scriptedModel(),
    clock: env.clock,
    events: { retryMs: 50 },
  });
  await core.app.listen({ port: 0, host: "127.0.0.1" });
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  core.app.server.closeAllConnections();
  await core.close().catch(() => {});
  env.cleanup();
});

const port = () => (core.app.server.address() as AddressInfo).port;

describe("phone event client against a real Core", () => {
  it("goes live, loads state once ready, and receives this task's events in order", async () => {
    const { connectEvents } = await loadClient(TOKEN, port());
    const { r, handlers } = record();
    stop = connectEvents(handlers).stop;
    await vi.waitFor(() => expect(r.ready).toBe(1));
    expect(r.states.at(-1)).toBe("live");

    await sendAndWait(core, CONV, "hello");
    await vi.waitFor(() => expect(r.events.filter((e) => e.type === "message.created")).toHaveLength(2));
    const ids = r.events.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(r.events.every((e) => e.conversation_id === CONV)).toBe(true);
  });

  it("resumes after a dropped connection without losing or repeating events", async () => {
    const { connectEvents } = await loadClient(TOKEN, port());
    const { r, handlers } = record();
    stop = connectEvents(handlers).stop;
    await vi.waitFor(() => expect(r.ready).toBe(1));
    await sendAndWait(core, CONV, "before the drop");
    await vi.waitFor(() => expect(r.events.length).toBeGreaterThan(0));
    const before = r.events.length;

    // Wi-Fi drop: the socket dies; meanwhile the Core keeps committing events.
    core.app.server.closeAllConnections();
    core.store.tx(() => {
      core.store.appendEvent("message.created", { conversationId: CONV }, { message_id: "while-offline-1", role: "user" });
      core.store.appendEvent("message.created", { conversationId: CONV }, { message_id: "while-offline-2", role: "assistant" });
    });

    await vi.waitFor(() => expect(r.ready).toBe(2), { timeout: 5000 });
    await vi.waitFor(() => expect(r.events.length).toBe(before + 2));
    const all = core.store.eventsAfter(0).map((e) => e.id);
    expect(r.events.map((e) => e.id)).toEqual(all.slice(all.length - r.events.length));
    expect(new Set(r.events.map((e) => e.id)).size).toBe(r.events.length);
    expect(r.states).toContain("offline");
    expect(r.states.at(-1)).toBe("live");
  });

  it("stops on a wrong token instead of retrying, and reports it", async () => {
    const { connectEvents } = await loadClient("wrong-token", port());
    const { r, handlers } = record();
    stop = connectEvents(handlers).stop;
    await vi.waitFor(() => expect(r.fatal).toHaveLength(1));
    expect(r.fatal[0]).toContain("app token");
    // Longer than the earliest possible retry (1 s floor x 0.5 jitter with Math.random mocked to 0).
    await new Promise((res) => setTimeout(res, NO_RETRY_WINDOW_MS));
    expect(r.states.filter((x) => x === "connecting")).toHaveLength(1);
    expect(r.ready).toBe(0);
    expect(r.states.at(-1)).toBe("offline");
    expect(core.events.openCount()).toBe(0);
  });

  it("drops the stream in the background and catches up when the app is active again", async () => {
    const { connectEvents } = await loadClient(TOKEN, port());
    const { r, handlers } = record();
    stop = connectEvents(handlers).stop;
    await vi.waitFor(() => expect(r.ready).toBe(1));

    appState.listeners.forEach((fn) => fn("background"));
    await vi.waitFor(() => expect(core.events.openCount()).toBe(0));
    expect(r.states.at(-1)).toBe("offline");
    await sendAndWait(core, CONV, "while the phone was locked");

    appState.listeners.forEach((fn) => fn("active"));
    await vi.waitFor(() => expect(r.ready).toBe(2));
    await vi.waitFor(() => expect(r.events.filter((e) => e.type === "message.created")).toHaveLength(2));
    expect(r.states.at(-1)).toBe("live");
  });

  it("notices a lost or mangled frame and resumes from the last good id", async () => {
    // A fake Core that misbehaves like a lossy transport (the expo/fetch chunk race) on the first two
    // connections, then serves the stream correctly.
    const seen: Array<{ lastEventId?: string; streamId: string | null }> = [];
    const ev = (id: number, prev: number) =>
      `id: ${id}\nevent: message.created\ndata: ${JSON.stringify({ contract_version: "0.1", id, prev_id: prev, type: "message.created", ts: "t", conversation_id: CONV, task_id: null, action_id: null, data: { message_id: `m${id}`, role: "user" } })}\n\n`;
    const ready = (cursor: number) =>
      `retry: 50\n\nevent: stream.ready\ndata: ${JSON.stringify({ contract_version: "0.1", stream_id: "db-1", cursor, last_event_id: 3 })}\n\n`;
    const fake = http.createServer((req, res) => {
      const n = seen.push({
        lastEventId: req.headers["last-event-id"] as string | undefined,
        streamId: new URL(req.url!, "http://x").searchParams.get("stream_id"),
      });
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      if (n === 1) res.write(ready(0) + ev(1, 0) + ev(3, 2)); // event 2 lost in transit
      else if (n === 2) res.write(ready(1) + "event: message.created\ndata: {broken\n\n"); // mangled frame
      else res.write(ready(Number(req.headers["last-event-id"] ?? 0)) + ev(2, 1) + ev(3, 2));
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
    try {
      const { connectEvents } = await loadClient(TOKEN, (fake.address() as AddressInfo).port);
      const { r, handlers } = record();
      const s = connectEvents(handlers);
      await vi.waitFor(() => expect(r.events.map((e) => e.id)).toEqual([1, 2, 3]), { timeout: 8000 });
      s.stop();
      expect(seen.map((x) => x.lastEventId)).toEqual([undefined, "1", "1"]);
      expect(seen.slice(1).every((x) => x.streamId === "db-1")).toBe(true);
      expect(r.ready).toBe(3);
    } finally {
      fake.closeAllConnections();
      await new Promise((r) => fake.close(r));
    }
  });

  it("falls back to polling quietly when the Core has no event stream (404)", async () => {
    let requests = 0;
    const fake = http.createServer((_req, res) => {
      requests++;
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found." } }));
    });
    await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
    try {
      const { connectEvents } = await loadClient(TOKEN, (fake.address() as AddressInfo).port);
      const { r, handlers } = record();
      stop = connectEvents(handlers).stop;
      await vi.waitFor(() => expect(r.states.at(-1)).toBe("offline"));
      await new Promise((res) => setTimeout(res, NO_RETRY_WINDOW_MS));
      expect(requests).toBe(1);
      expect(r.states.filter((x) => x === "connecting")).toHaveLength(1);
      expect(r.fatal).toEqual([]);
    } finally {
      fake.closeAllConnections();
      await new Promise((r) => fake.close(r));
    }
  });

  it("stop() closes the connection for good", async () => {
    const { connectEvents } = await loadClient(TOKEN, port());
    const { r, handlers } = record();
    const s = connectEvents(handlers);
    await vi.waitFor(() => expect(core.events.openCount()).toBe(1));
    s.stop();
    await vi.waitFor(() => expect(core.events.openCount()).toBe(0));
    await new Promise((res) => setTimeout(res, NO_RETRY_WINDOW_MS));
    expect(core.events.openCount()).toBe(0);
    expect(r.states.filter((x) => x === "connecting")).toHaveLength(1);
    expect(r.ready).toBe(1);
  });
});
