import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { TASK_STATUSES } from "@ahmed/contract";
import { InvalidTransitionError, TRANSITIONS, assertTransition } from "../src/stateMachine.js";
import { TOOL_REGISTRY, planMove } from "../src/tools.js";
import { Workspace } from "../src/workspace.js";

describe("state machine", () => {
  it("allows the read and write task paths", () => {
    const read = ["RECEIVED", "PROCESSING", "COMPLETED"] as const;
    const write = ["RECEIVED", "PROCESSING", "WAITING_FOR_APPROVAL", "APPROVED", "EXECUTING", "VERIFYING", "COMPLETED"] as const;
    for (const p of [read, write]) for (let i = 1; i < p.length; i++) expect(() => assertTransition(p[i - 1], p[i])).not.toThrow();
    expect(() => assertTransition("VERIFYING", "FAILED")).not.toThrow();
    expect(() => assertTransition("WAITING_FOR_APPROVAL", "REJECTED")).not.toThrow();
  });

  it("throws on anything not listed", () => {
    expect(() => assertTransition("WAITING_FOR_APPROVAL", "EXECUTING")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("EXECUTING", "COMPLETED")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("EXECUTING", "EXECUTING")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("REJECTED", "APPROVED")).toThrow(InvalidTransitionError);
    for (const s of ["COMPLETED", "FAILED", "REJECTED"] as const) {
      for (const to of TASK_STATUSES) expect(() => assertTransition(s, to)).toThrow(InvalidTransitionError);
    }
  });

  it("covers exactly the contract statuses", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...TASK_STATUSES].sort());
  });
});

describe("tool registry", () => {
  it("risk is defined in code: read_file is read, move_file is write, nothing deletes", () => {
    expect(TOOL_REGISTRY.read_file.risk).toBe("read");
    expect(TOOL_REGISTRY.move_file.risk).toBe("write");
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual(["move_file", "read_file"]);
  });
});

describe("workspace path validation", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ahmed-ws-test-"));
  const ws = new Workspace(path.join(dir, "ws"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts paths inside the workspace", () => {
    expect(ws.resolve("inbox/a.txt")).toBe(path.join(ws.root, "inbox", "a.txt"));
    expect(ws.resolve("inbox\\a.txt")).toBe(path.join(ws.root, "inbox", "a.txt"));
    expect(ws.resolve("archive/new/folder")).toBe(path.join(ws.root, "archive", "new", "folder"));
  });

  it("rejects '..', absolute paths, drive letters and empty paths", () => {
    for (const p of ["..", "../x", "inbox/../../x", "a/../b", "/etc/passwd", "C:\\Windows\\win.ini", "c:x", "\\\\server\\share\\x", "", "  "]) {
      expect(() => ws.resolve(p), p).toThrow(/rejected/);
    }
  });

  it("rejects junctions/symlinks that leave the workspace", () => {
    const outside = path.join(dir, "outside");
    mkdirSync(outside);
    writeFileSync(path.join(outside, "s.txt"), "x");
    symlinkSync(outside, path.join(ws.root, "link"), "junction");
    expect(() => ws.resolve("link/s.txt")).toThrow(/link points outside/);
    expect(() => ws.resolve("link/new-dir/new.txt")).toThrow(/link points outside/);
  });

  it("planMove refuses to overwrite and refuses missing sources", () => {
    mkdirSync(path.join(ws.root, "archive"), { recursive: true });
    writeFileSync(path.join(ws.root, "inbox", "dup.txt"), "a");
    writeFileSync(path.join(ws.root, "archive", "dup.txt"), "b");
    expect(() => planMove(ws, { source: "inbox/dup.txt", destination_dir: "archive" })).toThrow(/already exists/);
    expect(() => planMove(ws, { source: "inbox/missing.txt", destination_dir: "archive" })).toThrow(/not found/);
  });
});
