import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryService } from "../src/services/memoryService.js";

const tempDirs: string[] = [];

function makeMemory() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ahmed-memory-test-"));
  tempDirs.push(dir);
  const dbFile = path.join(dir, "memory.db");
  return { dbFile, memory: new MemoryService(dbFile) };
}

function readSessionMetadata(dbFile: string, sessionId: string): Record<string, unknown> {
  const db = new Database(dbFile, { readonly: true });
  try {
    const row = db
      .prepare("SELECT metadata FROM memory_sessions WHERE id = ?")
      .get(sessionId) as { metadata: string } | undefined;
    if (!row) throw new Error(`Session not found: ${sessionId}`);
    return JSON.parse(row.metadata) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("MemoryService session metadata", () => {
  it("keeps existing metadata when appending messages or ensuring without metadata", () => {
    const { dbFile, memory } = makeMemory();
    const sessionId = memory.createSession({ userId: "user-1", workspace: "investing" });

    try {
      memory.appendMessage(sessionId, "user", "Find opportunities.");
      memory.appendMessage(sessionId, "assistant", "Plan ready.");

      expect(memory.listSession(sessionId)).toHaveLength(2);
      expect(readSessionMetadata(dbFile, sessionId)).toEqual({
        userId: "user-1",
        workspace: "investing",
      });

      memory.ensureSession(sessionId);
      expect(readSessionMetadata(dbFile, sessionId)).toEqual({
        userId: "user-1",
        workspace: "investing",
      });
    } finally {
      memory.close();
    }
  });

  it("replaces metadata only when a value is explicitly provided", () => {
    const { dbFile, memory } = makeMemory();
    const sessionId = memory.createSession({ userId: "user-1", retained: true });

    try {
      memory.ensureSession(sessionId, { userId: "user-2", source: "explicit-update" });
      expect(readSessionMetadata(dbFile, sessionId)).toEqual({
        userId: "user-2",
        source: "explicit-update",
      });

      memory.ensureSession(sessionId, {});
      expect(readSessionMetadata(dbFile, sessionId)).toEqual({});
    } finally {
      memory.close();
    }
  });
});

describe("MemoryService restart", () => {
  it("retains metadata and messages after reopening", () => {
    const { dbFile, memory } = makeMemory();
    const sessionId = memory.createSession({ userId: "user-42" });
    memory.appendMessage(sessionId, "user", "Research request");
    memory.close();
    const reopened = new MemoryService(dbFile);
    try {
      reopened.appendMessage(sessionId, "assistant", "Source result", { type: "result" });
      expect(reopened.listSession(sessionId).map(m=>m.role)).toEqual(["user", "assistant"]);
      expect(readSessionMetadata(dbFile,sessionId)).toEqual({ userId:"user-42" });
    } finally { reopened.close(); }
  });
});
