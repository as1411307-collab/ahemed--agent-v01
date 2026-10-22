import type { ServerResponse } from "node:http";
import {
  CONTRACT_VERSION,
  type CoreEvent,
  type EventsPage,
  type StreamedCoreEvent,
  type StreamReadyData,
  type StreamResetData,
} from "@ahmed/contract";
import type { FastifyInstance } from "fastify";
import { errorResponse } from "./responses.js";
import type { EventRow, Store } from "./store.js";

export interface EventStreamOptions {
  /** Comment line sent this often so dead Wi-Fi/NAT paths are noticed. */
  heartbeatMs: number;
  /** Open streams allowed at once. At the limit the OLDEST stream is closed, so a phone whose old
   *  connection went half-open on a Wi-Fi drop can always reconnect. */
  maxStreams: number;
  /** A stream whose socket stops draining for this long is closed; the client resumes by cursor. */
  stallMs: number;
  /** Events read per database query while catching up, and the max page size of /v1/events/page. */
  batchSize: number;
  /** Streams are ended after this long; the client reconnects with its cursor, which re-checks the
   *  token and keeps the resume path exercised in daily use. */
  maxLifetimeMs: number;
  /** Reconnect delay hint sent as the SSE `retry:` field. */
  retryMs: number;
}

/** Longest ?wait= for /v1/events/page: under Unreal's 30 s HTTP activity timeout. */
export const MAX_PAGE_WAIT_S = 25;

/** iOS may hold the first ~1 KB of a streamed body for content sniffing; this comment pushes past it. */
const IOS_SNIFF_PADDING = `:${" ".repeat(2048)}\n\n`;

export const DEFAULT_EVENT_STREAM_OPTIONS: EventStreamOptions = {
  heartbeatMs: 15_000,
  maxStreams: 8,
  stallMs: 60_000,
  batchSize: 500,
  maxLifetimeMs: 30 * 60_000,
  retryMs: 3_000,
};

export interface EventStreams {
  openCount(): number;
}

export function toCoreEvent(row: EventRow): CoreEvent {
  return {
    contract_version: CONTRACT_VERSION,
    id: row.id,
    type: row.type,
    ts: row.ts,
    conversation_id: row.conversation_id,
    task_id: row.task_id,
    action_id: row.action_id,
    data: JSON.parse(row.data),
  } as CoreEvent;
}

/** One SSE frame. `type` and `id` never contain CR/LF; JSON.stringify escapes newlines in `data`. */
function frame(event: string, data: unknown, id?: number): string {
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return `${idLine}event: ${event.replace(/[\r\n]/g, "")}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Parses Last-Event-ID (preferred, sent on reconnect) or ?after=. undefined = no cursor; null = invalid. */
export function parseCursor(header: string | string[] | undefined, query: string | undefined): number | undefined | null {
  const raw = Array.isArray(header) ? header[0] : (header ?? query);
  if (raw === undefined || raw === "") return undefined;
  if (!/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * GET /v1/events: a resumable Server-Sent Events stream of persisted Core events.
 *
 * Delivery is pull-by-cursor: each stream remembers the last id it wrote and, when the Store says new
 * events may exist, reads `id > cursor` from SQLite. Replay and live delivery are the same code path,
 * so nothing is lost or repeated between them, and an event is only ever sent after its transaction
 * committed. The route is registered inside createCore, behind the Bearer-token onRequest hook.
 */
export function registerEventStream(app: FastifyInstance, store: Store, opts: EventStreamOptions): EventStreams {
  const open = new Map<ServerResponse, (finalChunk?: string) => void>();
  /** Pending long-polls on /v1/events/page; each resolves early on shutdown. */
  const waiters = new Set<() => void>();

  // app.close() waits for open responses, so end every stream first (also makes Ctrl+C exit cleanly).
  // Clients treat stream.shutdown like a dropped connection: reconnect with their cursor later.
  app.addHook("preClose", async () => {
    for (const end of [...open.values()]) end(frame("stream.shutdown", { contract_version: CONTRACT_VERSION }));
    for (const wake of [...waiters]) wake();
  });

  /** Resolves when new events may exist, the client leaves, the Core stops, or `ms` passes. */
  const waitForEvents = (res: ServerResponse, ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        unsubscribe();
        waiters.delete(done);
        res.off("close", done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      const unsubscribe = store.onEvents(done);
      waiters.add(done);
      res.on("close", done);
    });

  // ---- GET /v1/events/page: the same events as plain JSON, for Replay, backfill and polling clients.
  // ?wait=<1-25 s> long-polls when nothing is new yet: near-real-time with plain HTTP (e.g. Unreal).
  app.get<{ Querystring: { after?: string; limit?: string; wait?: string; stream_id?: string } }>(
    "/v1/events/page",
    async (req, reply) => {
    const after = parseCursor(undefined, req.query.after);
    const limit = req.query.limit === undefined ? opts.batchSize : Number(req.query.limit);
    const wait = req.query.wait === undefined ? 0 : Number(req.query.wait);
    if (
      after === null ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > opts.batchSize ||
      !Number.isInteger(wait) ||
      wait < 0 ||
      wait > MAX_PAGE_WAIT_S
    ) {
      return reply
        .code(400)
        .send(
          errorResponse(
            "BAD_REQUEST",
            `'after' must be a non-negative integer, 'limit' 1-${opts.batchSize}, 'wait' 0-${MAX_PAGE_WAIT_S} seconds.`,
          ),
        );
    }
    const from = after ?? 0;
    const streamId = store.streamId();
    const otherDb = req.query.stream_id !== undefined && req.query.stream_id !== streamId;
    let last = store.lastEventId();
    if (wait > 0 && from === last && !otherDb) {
      await waitForEvents(reply.raw, wait * 1000);
      last = store.lastEventId();
    }
    const reset = otherDb || from > last;
    const rows = reset ? [] : store.eventsAfter(from, limit);
    const page: EventsPage = {
      contract_version: CONTRACT_VERSION,
      stream_id: streamId,
      events: rows.map(toCoreEvent),
      next_cursor: reset ? last : rows.length ? rows[rows.length - 1].id : from,
      last_event_id: last,
      reset,
    };
    return page;
    },
  );

  app.get<{ Querystring: { after?: string; stream_id?: string } }>("/v1/events", (req, reply) => {
    const requested = parseCursor(req.headers["last-event-id"], req.query.after);
    if (requested === null) {
      return reply.code(400).send(errorResponse("BAD_REQUEST", "Event cursor must be a non-negative integer."));
    }

    if (open.size >= opts.maxStreams) {
      const oldest = open.values().next().value;
      oldest?.();
    }

    reply.hijack();
    const res = reply.raw;
    let cursor = 0;
    let closed = false;
    let draining = false;
    let stallTimer: NodeJS.Timeout | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    let lifetime: NodeJS.Timeout | undefined;
    let unsubscribe = () => {};

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(stallTimer);
      clearTimeout(lifetime);
      unsubscribe();
      open.delete(res);
      req.log.info({ cursor, open: open.size }, "event stream closed");
    };
    const end = (finalChunk?: string) => {
      cleanup();
      if (!res.writableEnded && !res.destroyed) res.end(finalChunk);
    };

    /** Writes one chunk; false means the socket is full and the caller must wait for 'drain'. */
    const write = (chunk: string): boolean => {
      if (closed || res.destroyed || res.writableEnded) return false;
      if (res.write(chunk)) return true;
      draining = true;
      stallTimer = setTimeout(() => {
        req.log.warn({ cursor }, "event stream stalled; closing");
        cleanup();
        res.destroy();
      }, opts.stallMs);
      return false;
    };

    /** Sends every committed event after the cursor, pausing while the socket is full. */
    const pump = () => {
      try {
        pumpBatches();
      } catch (err) {
        // Only this stream fails; the client reconnects with its cursor.
        req.log.error(err);
        store.audit("ERROR", {}, { route: "/v1/events", message: (err as Error).message });
        cleanup();
        res.destroy();
      }
    };
    const pumpBatches = () => {
      while (!closed && !draining) {
        const rows = store.eventsAfter(cursor, opts.batchSize);
        for (const row of rows) {
          // prev_id lets the client notice a frame lost in transit (a known expo/fetch race).
          const event: StreamedCoreEvent = { ...toCoreEvent(row), prev_id: cursor };
          cursor = row.id;
          if (!write(frame(row.type, event, row.id))) return;
        }
        if (rows.length < opts.batchSize) return;
      }
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
    res.on("drain", () => {
      draining = false;
      clearTimeout(stallTimer);
      pump();
    });

    try {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      });
      open.set(res, end);

      const last = store.lastEventId();
      const streamId = store.streamId();
      let prelude = `retry: ${opts.retryMs}\n\n${IOS_SNIFF_PADDING}`;
      const otherDb = req.query.stream_id !== undefined && req.query.stream_id !== streamId;
      if (requested !== undefined && (requested > last || otherDb)) {
        // The client's cursor belongs to another database (replaced or restored): resync.
        const reset: StreamResetData = { contract_version: CONTRACT_VERSION, stream_id: streamId, last_event_id: last };
        prelude += frame("stream.reset", reset, last);
        cursor = last;
      } else {
        // No cursor = start from now; the client then loads current state over REST.
        cursor = requested ?? last;
      }
      const ready: StreamReadyData = { contract_version: CONTRACT_VERSION, stream_id: streamId, cursor, last_event_id: last };
      prelude += frame("stream.ready", ready);
      write(prelude);

      // Subscribe and catch up in the same synchronous turn, so no commit can slip between them.
      unsubscribe = store.onEvents(pump);
      pump();
      heartbeat = setInterval(() => {
        if (!draining) write(": hb\n\n");
      }, opts.heartbeatMs);
      heartbeat.unref();
      lifetime = setTimeout(() => end(), opts.maxLifetimeMs);
      lifetime.unref();
      req.log.info({ cursor, last, open: open.size }, "event stream opened");
    } catch (err) {
      // Errors after hijack bypass Fastify's error handler: record them here and drop the connection.
      req.log.error(err);
      store.audit("ERROR", {}, { route: "/v1/events", message: (err as Error).message });
      cleanup();
      res.destroy();
    }
  });

  return { openCount: () => open.size };
}
