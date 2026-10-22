// Incremental Server-Sent Events parser for GET /v1/events (V0_CONTRACT.md section 6), following the
// WHATWG event-stream rules. Shared by every TypeScript client: feed it decoded text as it arrives.

export interface SseFrame {
  /** `event:` field, "message" when absent. */
  event: string;
  /** `data:` lines joined with "\n". */
  data: string;
  /** Last event ID after this frame (persists across frames, like EventSource.lastEventId). */
  lastEventId: string;
}

export interface SseHandlers {
  onFrame(frame: SseFrame): void;
  onComment?(text: string): void;
  onRetry?(ms: number): void;
}

export class SseParser {
  private buffer = "";
  private data: string[] = [];
  private event = "";
  private started = false;
  private skipLf = false;
  lastEventId = "";

  constructor(private readonly handlers: SseHandlers) {}

  /** Feeds the next decoded chunk. Lines and CRLF pairs may be split across chunks. */
  push(chunk: string): void {
    if (!chunk) return;
    let buf = this.buffer + chunk;
    if (!this.started && buf.length) {
      this.started = true;
      if (buf.charCodeAt(0) === 0xfeff) buf = buf.slice(1);
    }
    let start = 0;
    // A CR that ended the previous chunk may be the first half of a CRLF split across chunks.
    if (this.skipLf && buf[0] === "\n") start = 1;
    this.skipLf = false;
    for (let i = start; i < buf.length; i++) {
      const c = buf[i];
      if (c !== "\n" && c !== "\r") continue;
      this.line(buf.slice(start, i));
      if (c === "\r") {
        if (i + 1 === buf.length) this.skipLf = true;
        else if (buf[i + 1] === "\n") i++;
      }
      start = i + 1;
    }
    this.buffer = buf.slice(start);
  }

  private line(line: string): void {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) {
      this.handlers.onComment?.(line.slice(1).trimStart());
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        this.event = value;
        break;
      case "data":
        this.data.push(value);
        break;
      case "id":
        if (!value.includes("\u0000")) this.lastEventId = value;
        break;
      case "retry":
        if (/^\d+$/.test(value)) this.handlers.onRetry?.(Number(value));
        break;
      default:
        // Unknown fields are ignored.
        break;
    }
  }

  private dispatch(): void {
    const event = this.event;
    const data = this.data;
    this.event = "";
    this.data = [];
    if (data.length === 0) return;
    this.handlers.onFrame({ event: event || "message", data: data.join("\n"), lastEventId: this.lastEventId });
  }
}
