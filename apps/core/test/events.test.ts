import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoreEvent, EventsPage, StreamReadyData, StreamResetData } from "@ahmed/contract";
import type { Core } from "../src/server.js";
import { parseCursor } from "../src/events.js";
import { createCore, type CoreOptions } from "../src/server.js";
import { AUTH, TOKEN, approval, decide, makeEnv, scriptedModel, send, sendAndWait, type Env } from "./helpers.js";

const CONV = "conv-events";
const REPORT = { name: "report.txt", content: "Secret quarterly numbers: revenue grew 12%.", type: "text/plain" };

let env: Env;
let core: Core;

async function start(extra: Partial<CoreOptions> = {}): Promise<Core> {
  env = makeEnv();
  core = await createCore({
    dbFile: env.dbFile,
    workspaceRoot: env.wsRoot,
    appToken: TOKEN,
    model: scriptedModel(),
    clock: env.clock,
    ...extra,
  });
  return core;
}

afterEach(async () => {
  await core?.close().catch(() => {});
  env?.cleanup();
});

// ---------- SSE helpers ----------

interface Frame {
  id?: string;
  event?: string;
  data?: string;
  comment?: string;
  retry?: string;
}

/** Minimal WHATWG-style parser for the frames this Core writes. */
function parseFrames(text: string): Frame[] {
  const frames: Frame[] = [];
  for (const block of text.split("\n\n")) {
    if (!block) continue;
    const f: Frame = {};
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) f.comment = line.slice(1).trim();
      else {
        const i = line.indexOf(":");
        const key = line.slice(0, i) as keyof Frame;
        f[key] = line.slice(i + 2);
      }
    }
    frames.push(f);
  }
  return frames;
}

interface Stream {
  text(): string;
  frames(): Frame[];
  events(): CoreEvent[];
  ended(): boolean;
  disconnect(): void;
  statusCode: number;
  headers: Record<string, unknown>;
}

/** Opens /v1/events through app.inject with a streamed body. */
async function openStream(c: Core, query = "", headers: Record<string, string> = {}): Promise<Stream> {
  const res = await c.app.inject({
    method: "GET",
    url: `/v1/events${query}`,
    headers: { ...AUTH, ...headers },
    payloadAsStream: true,
  });
  let buf = "";
  let ended = false;
  const body = res.stream();
  body.on("data", (chunk: Buffer) => (buf += chunk.toString("utf8")));
  body.on("end", () => (ended = true));
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    text: () => buf,
    frames: () => parseFrames(buf),
    events: () =>
      parseFrames(buf)
        .filter((f) => f.id !== undefined && f.event && !f.event.startsWith("stream."))
        .map((f) => JSON.parse(f.data!) as CoreEvent),
    ended: () => ended,
    // Destroying the client side of inject does not reach the server; destroy the server response.
    disconnect: () => (res.raw.res as http.ServerResponse).destroy(),
  };
}

function readyOf(s: Stream): StreamReadyData {
  const f = s.frames().find((x) => x.event === "stream.ready");
  return JSON.parse(f!.data!) as StreamReadyData;
}

// ---------- tests ----------

describe("event cursor parsing", () => {
  it("prefers Last-Event-ID, accepts digits only", () => {
    expect(parseCursor(undefined, undefined)).toBeUndefined();
    expect(parseCursor("", undefined)).toBeUndefined();
    expect(parseCursor("7", "3")).toBe(7);
    expect(parseCursor(undefined, "3")).toBe(3);
    expect(parseCursor(["9"], undefined)).toBe(9);
    for (const bad of ["-1", "1.5", "abc", "1e3", " 1", "9".repeat(16)]) expect(parseCursor(bad, undefined)).toBeNull();
  });
});

describe("GET /v1/events", () => {
  it("requires the app token and a valid cursor", async () => {
    await start();
    const noAuth = await core.app.inject({ method: "GET", url: "/v1/events" });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().error.code).toBe("UNAUTHORIZED");

    const badQuery = await core.app.inject({ method: "GET", url: "/v1/events?after=abc", headers: AUTH });
    expect(badQuery.statusCode).toBe(400);
    const badHeader = await core.app.inject({ method: "GET", url: "/v1/events", headers: { ...AUTH, "last-event-id": "-4" } });
    expect(badHeader.statusCode).toBe(400);
    expect(core.events.openCount()).toBe(0);
  });

  it("sends SSE headers, no compression, a retry hint and stream.ready from now when there is no cursor", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    const last = core.store.lastEventId();
    expect(last).toBeGreaterThan(0);

    const s = await openStream(core, "", { "accept-encoding": "gzip, br" });
    expect(s.statusCode).toBe(200);
    expect(s.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    expect(s.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(s.headers["content-encoding"]).toBeUndefined();
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));
    expect(s.text().startsWith("retry: 3000\n\n")).toBe(true);
    expect(readyOf(s)).toEqual({ contract_version: "0.1", stream_id: core.store.streamId(), cursor: last, last_event_id: last });
    // No replay without a cursor: history is loaded over REST after the stream is open.
    expect(s.events()).toEqual([]);
  });

  it("streams a read task live, in order, with minimal payloads", async () => {
    await start();
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));

    const sent = await send(core, CONV, "لخص لي هذا الملف", REPORT);
    const taskId = sent.body.task_id!;
    await core.drain();
    await vi.waitFor(() => expect(s.events().some((e) => e.type === "task.status_changed" && e.data.to === "COMPLETED")).toBe(true));
    await vi.waitFor(() => expect(s.events().at(-1)?.type).toBe("message.created"));

    const events = s.events();
    expect(events.map((e) => (e.type === "task.status_changed" ? `${e.type}:${e.data.to}` : e.type))).toEqual([
      "task.created",
      "message.created",
      "task.status_changed:PROCESSING",
      "task.status_changed:COMPLETED",
      "message.created",
    ]);
    expect(events.every((e) => e.task_id === taskId && e.conversation_id === CONV && e.contract_version === "0.1")).toBe(true);
    const ids = events.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    // SSE id line equals the payload id.
    for (const f of s.frames().filter((x) => x.id)) expect(JSON.parse(f.data!).id).toBe(Number(f.id));
    // Message text and file contents are never streamed; clients fetch them over REST.
    expect(s.text()).not.toContain("Secret quarterly");
    expect(s.text()).not.toContain("لخص");
    expect(s.text()).not.toContain("SUMMARY");
  });

  it("streams the approval flow: request, decision, execution, verification", async () => {
    await start();
    await sendAndWait(core, CONV, "لخص لي هذا الملف", REPORT);
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));

    const move = await sendAndWait(core, CONV, "انقل الملف إلى مجلد archive");
    const a = approval(move);
    await vi.waitFor(() => expect(s.events().some((e) => e.type === "approval.requested")).toBe(true));
    const requested = s.events().find((e) => e.type === "approval.requested")!;
    expect(requested.action_id).toBe(a.action_id);
    expect(requested.data).toEqual({ operation: "move_file", tool: "move_file", risk_level: "write", expires_at: a.expires_at });

    expect((await decide(core, move.task_id!, a.action_id, "APPROVE")).body.status).toBe("COMPLETED");
    await vi.waitFor(() => expect(s.events().some((e) => e.type === "action.verified")).toBe(true));
    await vi.waitFor(() => expect(s.events().some((e) => e.type === "task.status_changed" && e.data.to === "COMPLETED")).toBe(true));

    const flow = s.events().map((e) => (e.type === "task.status_changed" ? `status:${e.data.to}` : e.type));
    expect(flow).toEqual([
      "task.created",
      "message.created",
      "status:PROCESSING",
      "approval.requested",
      "status:WAITING_FOR_APPROVAL",
      "message.created",
      "approval.decided",
      "status:APPROVED",
      "status:EXECUTING",
      "status:VERIFYING",
      "action.verified",
      "status:COMPLETED",
      "message.created",
    ]);
    expect(s.events().find((e) => e.type === "approval.decided")!.data).toEqual({ decision: "APPROVE" });
    expect(s.events().find((e) => e.type === "action.verified")!.data).toEqual({ verified: true });
    expect(s.text()).not.toContain("archive/");
  });

  it("replays from a cursor and lets Last-Event-ID win over ?after", async () => {
    await start();
    await sendAndWait(core, CONV, "first");
    await sendAndWait(core, CONV, "second");
    const all = core.store.eventsAfter(0).map((r) => r.id);
    expect(all.length).toBeGreaterThanOrEqual(8);

    const full = await openStream(core, "?after=0");
    await vi.waitFor(() => expect(full.events().map((e) => e.id)).toEqual(all));

    const mid = all[3];
    const resumed = await openStream(core, "?after=0", { "last-event-id": String(mid) });
    await vi.waitFor(() => expect(resumed.events().map((e) => e.id)).toEqual(all.filter((id) => id > mid)));
    expect(readyOf(resumed).cursor).toBe(mid);

    // Live events continue after the replay with no gap and no repeat.
    await sendAndWait(core, CONV, "third");
    const now = core.store.eventsAfter(0).map((r) => r.id);
    await vi.waitFor(() => expect(resumed.events().map((e) => e.id)).toEqual(now.filter((id) => id > mid)));
  });

  it("sends stream.reset when the cursor is ahead of the database (database replaced)", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    const last = core.store.lastEventId();
    const s = await openStream(core, "", { "last-event-id": String(last + 1000) });
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));
    const reset = s.frames().find((f) => f.event === "stream.reset")!;
    expect(Number(reset.id)).toBe(last);
    expect(JSON.parse(reset.data!) as StreamResetData).toEqual({
      contract_version: "0.1",
      stream_id: core.store.streamId(),
      last_event_id: last,
    });
    expect(readyOf(s).cursor).toBe(last);

    await sendAndWait(core, CONV, "after reset");
    await vi.waitFor(() => expect(s.events().length).toBeGreaterThan(0));
    expect(s.events()[0].id).toBe(last + 1);
  });

  it("never delivers an event whose transaction rolled back", async () => {
    await start();
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));
    const before = core.store.lastEventId();

    expect(() =>
      core.store.tx(() => {
        core.store.appendEvent("task.created", { conversationId: "ghost", taskId: "ghost" }, { request_id: "ghost", status: "RECEIVED" });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // A nested savepoint that rolls back inside a transaction that commits.
    core.store.tx(() => {
      try {
        core.store.tx(() => {
          core.store.appendEvent("task.created", { taskId: "ghost-2" }, { request_id: "ghost-2", status: "RECEIVED" });
          throw new Error("inner");
        });
      } catch {
        // swallowed on purpose
      }
      core.store.appendEvent("task.created", { taskId: "real" }, { request_id: "real", status: "RECEIVED" });
    });

    await vi.waitFor(() => expect(s.events().length).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(s.events().map((e) => e.task_id)).toEqual(["real"]);
    expect(core.store.eventsAfter(before).map((r) => r.task_id)).toEqual(["real"]);
    expect(s.text()).not.toContain("ghost");
  });

  it("cleans up listeners and timers when the client disconnects", async () => {
    await start();
    const base = core.store.eventListenerCount();
    const s = await openStream(core);
    await vi.waitFor(() => expect(core.events.openCount()).toBe(1));
    expect(core.store.eventListenerCount()).toBe(base + 1);
    s.disconnect();
    await vi.waitFor(() => expect(core.events.openCount()).toBe(0));
    expect(core.store.eventListenerCount()).toBe(base);
    // The Core keeps working after a client vanished mid-stream.
    expect((await sendAndWait(core, CONV, "still here")).status).toBe("COMPLETED");
  });

  it("closes the oldest stream at the limit so a reconnecting phone is never locked out", async () => {
    await start({ events: { maxStreams: 2 } });
    const first = await openStream(core);
    const second = await openStream(core);
    await vi.waitFor(() => expect(core.events.openCount()).toBe(2));
    const third = await openStream(core);
    await vi.waitFor(() => expect(first.ended()).toBe(true));
    expect(second.ended()).toBe(false);
    expect(third.statusCode).toBe(200);
    expect(core.events.openCount()).toBe(2);
  });

  it("ends a stream after its maximum lifetime so the client reconnects and re-authenticates", async () => {
    await start({ events: { maxLifetimeMs: 50 } });
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.ended()).toBe(true));
    expect(core.events.openCount()).toBe(0);
    expect(core.store.eventListenerCount()).toBe(0);
  });

  it("expires a pending approval on a timer, so a listening client sees it without polling", async () => {
    await start({ expirySweepMs: 20 });
    await sendAndWait(core, CONV, "لخص لي هذا الملف", REPORT);
    const move = await sendAndWait(core, CONV, "انقل الملف إلى مجلد archive");
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));

    env.nowMs = Date.parse(approval(move).expires_at) + 1;
    await vi.waitFor(() => expect(s.events().some((e) => e.type === "task.status_changed" && e.data.to === "REJECTED")).toBe(true));
    const decided = s.events().find((e) => e.type === "approval.decided")!;
    expect(decided.data).toEqual({ decision: "EXPIRED" });
    const rejected = s.events().find((e) => e.type === "task.status_changed")!;
    expect(rejected.type === "task.status_changed" && rejected.data.error_code).toBe("APPROVAL_EXPIRED");
  });

  it("chains prev_id so a client can detect a lost frame", async () => {
    await start();
    await sendAndWait(core, CONV, "first");
    const s = await openStream(core, "?after=2");
    await sendAndWait(core, CONV, "second");
    await vi.waitFor(() => expect(s.events().length).toBe(core.store.lastEventId() - 2));
    const streamed = s.frames().filter((f) => f.id).map((f) => JSON.parse(f.data!) as { id: number; prev_id: number });
    expect(streamed[0].prev_id).toBe(2);
    for (let i = 1; i < streamed.length; i++) expect(streamed[i].prev_id).toBe(streamed[i - 1].id);
  });

  it("sends nosniff and a padding comment so iOS does not hold back the first events", async () => {
    await start();
    const s = await openStream(core);
    await vi.waitFor(() => expect(s.text()).toContain("stream.ready"));
    expect(s.headers["x-content-type-options"]).toBe("nosniff");
    expect(s.text().indexOf("stream.ready")).toBeGreaterThan(2048);
  });

  it("identifies its database with a stream_id and resets a cursor from another database", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    const id = core.store.streamId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const same = await openStream(core, `?stream_id=${id}&after=1`);
    await vi.waitFor(() => expect(same.text()).toContain("stream.ready"));
    expect(readyOf(same).stream_id).toBe(id);
    expect(same.text()).not.toContain("stream.reset");

    const other = await openStream(core, "?stream_id=some-old-db&after=1");
    await vi.waitFor(() => expect(other.text()).toContain("stream.ready"));
    const reset = JSON.parse(other.frames().find((f) => f.event === "stream.reset")!.data!) as StreamResetData;
    expect(reset).toEqual({ contract_version: "0.1", stream_id: id, last_event_id: core.store.lastEventId() });

    // Survives a restart on the same file; a new database file gets a new one.
    const dbFile = env.dbFile;
    await core.close();
    core = await createCore({ dbFile, workspaceRoot: env.wsRoot, appToken: TOKEN, model: scriptedModel(), clock: env.clock });
    expect(core.store.streamId()).toBe(id);
    const other2 = makeEnv();
    const core2 = await createCore({ dbFile: other2.dbFile, workspaceRoot: other2.wsRoot, appToken: TOKEN, model: scriptedModel() });
    expect(core2.store.streamId()).not.toBe(id);
    await core2.close();
    other2.cleanup();
  });

  it("refuses appendEvent outside a transaction, and survives a throwing listener", async () => {
    await start();
    expect(() => core.store.appendEvent("task.created", {}, {})).toThrow(/inside Store.tx/);
    const calls: string[] = [];
    const off1 = core.store.onEvents(() => {
      throw new Error("listener blew up");
    });
    const off2 = core.store.onEvents(() => calls.push("second"));
    core.store.tx(() => core.store.appendEvent("task.created", { taskId: "x" }, { request_id: "x", status: "RECEIVED" }));
    await vi.waitFor(() => expect(calls).toEqual(["second"]));
    expect(core.store.listAudit().some((a) => a.event === "ERROR" && a.detail?.includes("listener blew up"))).toBe(true);
    off1();
    off2();
  });

  it("never puts message text, file names, file contents or paths into any event", async () => {
    await start();
    const MARK = "ZQX7MARK";
    const file = { name: `${MARK}-file.txt`, content: `${MARK} content line`, type: "text/plain" };
    await sendAndWait(core, CONV, `لخص ${MARK}`, file);
    const move = await sendAndWait(core, CONV, `انقل ${MARK} إلى مجلد archive`);
    await decide(core, move.task_id!, approval(move).action_id, "APPROVE");
    const rows = core.store.eventsAfter(0);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(MARK);
      expect(row.data).not.toMatch(/inbox|archive/);
    }
    // The audit log keeps the full detail; only the public events are minimal.
    expect(core.store.listAudit().some((a) => a.detail?.includes(MARK))).toBe(true);
  });

  it("events are append-only in SQLite", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    expect(() => core.store.db.prepare("UPDATE events SET type = 'x'").run()).toThrow(/append-only/);
    expect(() => core.store.db.prepare("DELETE FROM events").run()).toThrow(/append-only/);
  });
});

describe("GET /v1/events/page", () => {
  it("returns the same events as JSON with a cursor, and flags a reset", async () => {
    await start({ events: { batchSize: 3 } });
    await sendAndWait(core, CONV, "first");
    await sendAndWait(core, CONV, "second");
    const all = core.store.eventsAfter(0).map((r) => r.id);

    const get = async (q: string) => core.app.inject({ method: "GET", url: `/v1/events/page${q}`, headers: AUTH });
    const seen: number[] = [];
    let cursor = 0;
    for (;;) {
      const page = (await get(`?after=${cursor}`)).json() as EventsPage;
      expect(page.reset).toBe(false);
      expect(page.events.length).toBeLessThanOrEqual(3);
      seen.push(...page.events.map((e) => e.id));
      if (page.next_cursor === cursor) break;
      cursor = page.next_cursor;
    }
    expect(seen).toEqual(all);

    const ahead = (await get(`?after=${all.at(-1)! + 50}`)).json() as EventsPage;
    expect(ahead).toMatchObject({ reset: true, events: [], next_cursor: all.at(-1), last_event_id: all.at(-1) });

    expect((await get("?limit=4")).statusCode).toBe(400);
    expect((await get("?limit=0")).statusCode).toBe(400);
    expect((await get("?after=x")).statusCode).toBe(400);
    expect((await core.app.inject({ method: "GET", url: "/v1/events/page" })).statusCode).toBe(401);
  });
});

describe("GET /v1/events/page?wait= (long-poll)", () => {
  const page = (q: string) => core.app.inject({ method: "GET", url: `/v1/events/page${q}`, headers: AUTH });

  it("waits for the next committed event and returns it", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    const last = core.store.lastEventId();
    const pending = page(`?after=${last}&wait=10`);
    await new Promise((r) => setTimeout(r, 50));
    core.store.tx(() => core.store.appendEvent("task.created", { taskId: "late" }, { request_id: "late", status: "RECEIVED" }));
    const body = (await pending).json() as EventsPage;
    expect(body.events.map((e) => e.task_id)).toEqual(["late"]);
    expect(body.next_cursor).toBe(last + 1);
  });

  it("returns an empty page after the wait, answers at once when events exist, and validates wait", async () => {
    await start();
    await sendAndWait(core, CONV, "hello");
    const last = core.store.lastEventId();
    const t0 = Date.now();
    const empty = (await page(`?after=${last}&wait=1`)).json() as EventsPage;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(empty).toMatchObject({ events: [], next_cursor: last, reset: false });

    const t1 = Date.now();
    expect(((await page("?after=0&wait=25")).json() as EventsPage).events.length).toBe(last);
    expect(Date.now() - t1).toBeLessThan(500);

    for (const bad of ["26", "-1", "1.5", "x"]) expect((await page(`?wait=${bad}`)).statusCode).toBe(400);
    const otherDb = (await page(`?after=${last}&wait=25&stream_id=old`)).json() as EventsPage;
    expect(otherDb.reset).toBe(true);
  });

  it("lets close() finish while a long-poll is pending", async () => {
    await start();
    const pending = page(`?after=${core.store.lastEventId()}&wait=25`);
    await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    await core.close();
    expect(Date.now() - t0).toBeLessThan(2000);
    await pending.catch(() => {});
  });
});

describe("event stream over a real socket", () => {
  function listen(c: Core): Promise<number> {
    return c.app.listen({ port: 0, host: "127.0.0.1" }).then(() => (c.app.server.address() as AddressInfo).port);
  }

  /** node:http with agent:false: aborted fetch() leaves an idle socket that would block app.close(). */
  function connect(port: number, query = "") {
    let buf = "";
    let ended = false;
    let response: http.IncomingMessage | undefined;
    const req = http.get({ host: "127.0.0.1", port, path: `/v1/events${query}`, headers: AUTH, agent: false }, (res) => {
      response = res;
      res.setEncoding("utf8");
      res.on("data", (c: string) => (buf += c));
      res.on("end", () => (ended = true));
      res.on("error", () => (ended = true));
    });
    req.on("error", () => (ended = true));
    return { req, text: () => buf, ended: () => ended, response: () => response };
  }

  it("sends heartbeats and lets close() finish with a stream open, telling the client why", async () => {
    await start({ events: { heartbeatMs: 30 } });
    const port = await listen(core);
    const client = connect(port);
    await vi.waitFor(() => expect(client.text()).toContain(": hb"));

    const closed = core.close();
    await expect(closed).resolves.toBeUndefined();
    await vi.waitFor(() => expect(client.ended()).toBe(true));
    expect(client.text()).toContain("event: stream.shutdown");
  });

  it("closes a stream whose reader stopped reading, without buffering without limit", async () => {
    await start({ events: { stallMs: 200 } });
    const pad = "x".repeat(2000);
    core.store.tx(() => {
      for (let i = 0; i < 6000; i++) core.store.appendEvent("message.created", { taskId: `t${i}` }, { message_id: `m${i}`, role: "user", pad });
    });
    const port = await listen(core);
    const client = connect(port, "?after=0");
    await vi.waitFor(() => expect(client.response()).toBeDefined());
    client.response()!.pause();
    await vi.waitFor(() => expect(core.events.openCount()).toBe(1));
    await vi.waitFor(() => expect(core.events.openCount()).toBe(0), { timeout: 5000 });
    expect(core.store.eventListenerCount()).toBe(0);
    client.req.destroy();
  });
});
