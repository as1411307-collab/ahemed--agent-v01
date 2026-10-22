import { AppState } from "react-native";
import {
  SseParser,
  type CoreEvent,
  type StreamReadyData,
  type StreamResetData,
  type StreamedCoreEvent,
} from "@ahmed/contract";
import { ApiError, openStream } from "./api";

// Live updates from GET /v1/events (V0_CONTRACT.md section 6). The stream only says *when* to
// refetch; REST stays the source of truth. While it is not live, App.tsx keeps polling.

export type LiveState = "connecting" | "live" | "offline";

export interface EventStreamHandlers {
  /** The stream is live: load current state over REST now (nothing can fall in between). */
  onReady(ready: StreamReadyData): void;
  onEvent(event: CoreEvent): void;
  /** The Core's event log was replaced: reload everything. */
  onReset(reset: StreamResetData): void;
  onState(state: LiveState): void;
  /** Not retried (e.g. wrong token): show it to the user. */
  onFatal(error: ApiError): void;
}

/** No bytes for this long (heartbeats come every 15 s) means a dead Wi-Fi path: reconnect. */
const WATCHDOG_MS = 45_000;
const MAX_BACKOFF_MS = 30_000;
/** A connection that stayed live this long resets the backoff. */
const HEALTHY_MS = 60_000;
/** Bounds for the server's `retry:` hint. */
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export function connectEvents(h: EventStreamHandlers): { stop(): void } {
  let stopped = false;
  let paused = AppState.currentState !== "active" && AppState.currentState !== "unknown";
  let cursor: number | undefined;
  let streamId: string | undefined;
  let failures = 0;
  let retryMs = 3_000;
  let controller: AbortController | null = null;
  let wake: (() => void) | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(t);
        wake = null;
        resolve();
      };
    });

  /** One connection. Resolves when it ends for any reason; throws ApiError on HTTP errors. */
  async function connectOnce(): Promise<void> {
    const ctrl = new AbortController();
    controller = ctrl;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), WATCHDOG_MS);
    };
    let liveSince = 0;
    let corrupt = false;
    // A frame was lost or mangled in transit: drop this connection and resume from the last good id.
    const resync = () => {
      corrupt = true;
      ctrl.abort();
    };
    const parser = new SseParser({
      onRetry: (ms) => (retryMs = Math.min(MAX_RETRY_MS, Math.max(MIN_RETRY_MS, ms))),
      onFrame: (f) => {
        if (corrupt) return;
        let data: unknown;
        try {
          data = JSON.parse(f.data);
        } catch {
          return resync();
        }
        if (f.event === "stream.ready") {
          const ready = data as StreamReadyData;
          cursor = ready.cursor;
          streamId = ready.stream_id;
          liveSince = Date.now();
          h.onState("live");
          h.onReady(ready);
        } else if (f.event === "stream.reset") {
          const reset = data as StreamResetData;
          cursor = reset.last_event_id;
          streamId = reset.stream_id;
          h.onReset(reset);
        } else if (!f.event.startsWith("stream.")) {
          const event = data as StreamedCoreEvent;
          if (typeof event.id !== "number") return resync();
          if (cursor !== undefined && event.id <= cursor) return; // already applied
          if (cursor !== undefined && event.prev_id !== cursor) return resync();
          cursor = event.id;
          h.onEvent(event as CoreEvent); // unknown types are passed on; callers ignore what they do not know
        }
      },
    });

    try {
      kick();
      const headers: Record<string, string> = cursor === undefined ? {} : { "Last-Event-ID": String(cursor) };
      const query = streamId === undefined ? "" : `?stream_id=${encodeURIComponent(streamId)}`;
      const res = await openStream(`/v1/events${query}`, headers, ctrl.signal);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        kick();
        parser.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      controller = null;
      if (liveSince && Date.now() - liveSince >= HEALTHY_MS) failures = 0;
    }
  }

  async function run(): Promise<void> {
    while (!stopped) {
      if (paused) {
        await sleep(24 * 60 * 60_000);
        continue;
      }
      h.onState("connecting");
      let clean = false;
      try {
        await connectOnce();
        clean = true;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.code === "CONFIG")) {
          stopped = true;
          h.onState("offline");
          h.onFatal(err);
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          // An older Core without /v1/events: the app keeps polling.
          stopped = true;
          h.onState("offline");
          return;
        }
      }
      if (stopped || paused) continue;
      h.onState("offline");
      failures = clean ? 0 : failures + 1;
      // Server hint after a clean end; otherwise exponential backoff with jitter (no reconnect storms).
      const base = clean ? retryMs : Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(failures, 5));
      await sleep(base * (0.5 + Math.random()));
    }
  }

  // The OS freezes sockets in the background: drop the stream, reconnect with the cursor on return.
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      if (!paused) return;
      paused = false;
      failures = 0;
      wake?.();
    } else if (state === "background") {
      paused = true;
      controller?.abort();
      h.onState("offline");
    }
  });

  if (typeof TextDecoder === "undefined") {
    // No streaming support in this runtime: stay on polling.
    h.onState("offline");
  } else {
    void run();
  }

  return {
    stop() {
      stopped = true;
      sub.remove();
      controller?.abort();
      wake?.();
    },
  };
}
