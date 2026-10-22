import { describe, expect, it } from "vitest";
import { SseParser, type SseFrame } from "@ahmed/contract";

function parse(chunks: string[]) {
  const frames: SseFrame[] = [];
  const comments: string[] = [];
  const retries: number[] = [];
  const p = new SseParser({
    onFrame: (f) => frames.push(f),
    onComment: (c) => comments.push(c),
    onRetry: (ms) => retries.push(ms),
  });
  for (const c of chunks) p.push(c);
  return { frames, comments, retries, parser: p };
}

const STREAM =
  "retry: 3000\n\n" +
  'event: stream.ready\ndata: {"cursor":4}\n\n' +
  ": hb\n\n" +
  'id: 5\nevent: task.created\ndata: {"id":5,"note":"عربي ✓"}\n\n' +
  "data: line one\ndata: line two\n\n";

describe("SseParser (shared by the app and future TS clients)", () => {
  it("parses events, ids, comments, retry and multi-line data", () => {
    const { frames, comments, retries } = parse([STREAM]);
    expect(retries).toEqual([3000]);
    expect(comments).toEqual(["hb"]);
    expect(frames).toEqual([
      { event: "stream.ready", data: '{"cursor":4}', lastEventId: "" },
      { event: "task.created", data: '{"id":5,"note":"عربي ✓"}', lastEventId: "5" },
      // The last event id persists across frames, like EventSource.lastEventId.
      { event: "message", data: "line one\nline two", lastEventId: "5" },
    ]);
  });

  it("gives the same result however the bytes are split, including one character at a time", () => {
    const whole = parse([STREAM]).frames;
    expect(parse(STREAM.split("")).frames).toEqual(whole);
    for (let cut = 1; cut < STREAM.length; cut++) {
      expect(parse([STREAM.slice(0, cut), STREAM.slice(cut)]).frames).toEqual(whole);
    }
  });

  it("accepts CRLF and CR line endings, also when CRLF is split across chunks", () => {
    const crlf = STREAM.replace(/\n/g, "\r\n");
    const cr = STREAM.replace(/\n/g, "\r");
    const whole = parse([STREAM]).frames;
    expect(parse([crlf]).frames).toEqual(whole);
    expect(parse([cr]).frames).toEqual(whole);
    expect(parse(crlf.split("")).frames).toEqual(whole);
    expect(parse(crlf.split("").flatMap((c) => [c, ""])).frames).toEqual(whole);
  });

  it("ignores unknown fields, empty events, bad retry values and ids containing NUL; strips a BOM", () => {
    const { frames, retries, parser } = parse([
      "﻿foo: bar\nretry: soon\n\n",
      "event: x\n\n",
      "id: 7\n\n",
      "id: a\u0000b\ndata: y\n\n",
      "data\n\n",
    ]);
    expect(retries).toEqual([]);
    expect(frames).toEqual([
      { event: "message", data: "y", lastEventId: "7" },
      { event: "message", data: "", lastEventId: "7" },
    ]);
    expect(parser.lastEventId).toBe("7");
  });

  it("does not emit a frame until its terminating blank line arrives", () => {
    const { frames, parser } = parse(["id: 1\nevent: a\ndata: {}\n"]);
    expect(frames).toEqual([]);
    // WHATWG: the id becomes the last event ID only when the frame is dispatched.
    expect(parser.lastEventId).toBe("");
    parser.push("\n");
    expect(parser.lastEventId).toBe("1");
  });
});
