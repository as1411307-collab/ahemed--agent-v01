import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface MemoryRecord {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string;
  created_at: string;
}

export class MemoryService {
  private readonly db: Database.Database;

  constructor(dbFile: string) {
    this.db = new Database(dbFile);
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS memory_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES memory_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_memory_messages_session_id
      ON memory_messages(session_id, created_at);
    `);
  }

  ensureSession(sessionId: string, metadata: Record<string, unknown> = {}): string {
    const existing = this.db
      .prepare("SELECT id FROM memory_sessions WHERE id = ?")
      .get(sessionId) as { id: string } | undefined;

    if (existing) {
      this.db
        .prepare("UPDATE memory_sessions SET updated_at = CURRENT_TIMESTAMP, metadata = ? WHERE id = ?")
        .run(JSON.stringify(metadata), sessionId);
      return sessionId;
    }

    this.db
      .prepare("INSERT INTO memory_sessions (id, metadata) VALUES (?, ?)")
      .run(sessionId, JSON.stringify(metadata));

    return sessionId;
  }

  createSession(metadata: Record<string, unknown> = {}): string {
    const id = randomUUID();
    this.ensureSession(id, metadata);
    return id;
  }

  appendMessage(
    sessionId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, unknown> = {},
  ): MemoryRecord {
    const id = randomUUID();
    const record = {
      id,
      session_id: this.ensureSession(sessionId),
      role,
      content,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO memory_messages (id, session_id, role, content, metadata, created_at)
         VALUES (@id, @session_id, @role, @content, @metadata, @created_at)`,
      )
      .run(record);

    return {
      id: record.id,
      session_id: record.session_id,
      role: record.role,
      content: record.content,
      metadata: record.metadata,
      created_at: record.created_at,
    };
  }

  listSession(sessionId: string): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, metadata, created_at
         FROM memory_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`,
      )
      .all(sessionId) as MemoryRecord[];

    return rows;
  }

  search(sessionId: string, query: string): MemoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, metadata, created_at
         FROM memory_messages
         WHERE session_id = ? AND lower(content) LIKE lower(?)
         ORDER BY created_at DESC
         LIMIT 20`,
      )
      .all(sessionId, `%${query}%`) as MemoryRecord[];

    return rows;
  }

  close(): void {
    this.db.close();
  }
}
