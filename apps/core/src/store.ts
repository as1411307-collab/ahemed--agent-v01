import { randomUUID } from "node:crypto";
import type { Attachment, CoreEventType, DecisionValue, ErrorCode, RiskLevel, TaskStatus } from "@ahmed/contract";
import type { DB } from "./db.js";
import { assertTransition } from "./stateMachine.js";

export type Clock = () => Date;

export interface TaskRow {
  id: string;
  conversation_id: string;
  request_id: string;
  user_message: string;
  status: TaskStatus;
  used_tool: string | null;
  result_message: string | null;
  error_code: ErrorCode | null;
  error_message: string | null;
  attachments: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  seq: number;
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  attachments: string;
  task_id: string | null;
  created_at: string;
}

export interface ActionRow {
  id: string;
  task_id: string;
  idempotency_key: string;
  tool: string;
  operation: string;
  description: string;
  risk_level: RiskLevel;
  affected_resource: string;
  destination: string | null;
  input: string;
  created_at: string;
  expires_at: string;
  decision: DecisionValue | "EXPIRED" | null;
  decided_at: string | null;
  verified: number | null;
}

export interface ExecutionRow {
  idempotency_key: string;
  action_id: string;
  task_id: string;
  reserved_at: string;
}

export interface AuditRow {
  id: number;
  ts: string;
  event: string;
  task_id: string | null;
  action_id: string | null;
  detail: string | null;
}

export interface EventRow {
  id: number;
  ts: string;
  type: CoreEventType;
  conversation_id: string | null;
  task_id: string | null;
  action_id: string | null;
  data: string;
}

export interface TaskPatch {
  used_tool?: string | null;
  result_message?: string | null;
  error_code?: ErrorCode | null;
  error_message?: string | null;
}

export class ConcurrentTransitionError extends Error {
  constructor(taskId: string, expected: TaskStatus) {
    super(`Task ${taskId} was no longer in ${expected}`);
    this.name = "ConcurrentTransitionError";
  }
}

/** All persistence goes through here. State lives in SQLite, never in memory. */
export class Store {
  private readonly eventListeners = new Set<() => void>();
  private notifyScheduled = false;

  constructor(
    readonly db: DB,
    readonly clock: Clock,
  ) {}

  now(): string {
    return this.clock().toISOString();
  }

  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  audit(event: string, ref: { taskId?: string | null; actionId?: string | null } = {}, detail?: unknown): void {
    this.db
      .prepare("INSERT INTO audit_log (ts, event, task_id, action_id, detail) VALUES (?, ?, ?, ?, ?)")
      .run(this.now(), event, ref.taskId ?? null, ref.actionId ?? null, detail === undefined ? null : JSON.stringify(detail));
  }

  listAudit(taskId?: string): AuditRow[] {
    return taskId
      ? (this.db.prepare("SELECT * FROM audit_log WHERE task_id = ? ORDER BY id").all(taskId) as AuditRow[])
      : (this.db.prepare("SELECT * FROM audit_log ORDER BY id").all() as AuditRow[]);
  }

  // ---- client-facing event log (GET /v1/events) ----

  /**
   * Appends a public event. Call it in the same transaction as the change it describes, so an event
   * exists if and only if that change was committed.
   */
  appendEvent(
    type: CoreEventType,
    ref: { conversationId?: string | null; taskId?: string | null; actionId?: string | null },
    data: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare("INSERT INTO events (ts, type, conversation_id, task_id, action_id, data) VALUES (?, ?, ?, ?, ?, ?)")
      .run(this.now(), type, ref.conversationId ?? null, ref.taskId ?? null, ref.actionId ?? null, JSON.stringify(data));
    this.scheduleEventNotify();
  }

  /** Events with id > after, oldest first. */
  eventsAfter(after: number, limit = 500): EventRow[] {
    return this.db.prepare("SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?").all(after, limit) as EventRow[];
  }

  lastEventId(): number {
    const row = this.db.prepare("SELECT MAX(id) AS id FROM events").get() as { id: number | null };
    return row.id ?? 0;
  }

  /**
   * Subscribes to "new events may exist". Listeners pull with eventsAfter(their cursor), so they never
   * see a row from a rolled-back transaction: the poke runs in a microtask, after the synchronous
   * better-sqlite3 transaction that appended the event has committed or rolled back.
   */
  onEvents(listener: () => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  eventListenerCount(): number {
    return this.eventListeners.size;
  }

  private scheduleEventNotify(): void {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      for (const listener of [...this.eventListeners]) listener();
    });
  }

  ensureConversation(id: string): void {
    this.db.prepare("INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)").run(id, this.now());
  }

  conversationExists(id: string): boolean {
    return this.db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id) !== undefined;
  }

  addMessage(m: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    attachments?: Attachment[];
    taskId?: string | null;
  }): void {
    const id = randomUUID();
    this.tx(() => {
      this.db
        .prepare(
          "INSERT INTO messages (id, conversation_id, role, content, attachments, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, m.conversationId, m.role, m.content, JSON.stringify(m.attachments ?? []), m.taskId ?? null, this.now());
      this.appendEvent("message.created", { conversationId: m.conversationId, taskId: m.taskId }, { message_id: id, role: m.role });
    });
  }

  listMessages(conversationId: string): MessageRow[] {
    return this.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq")
      .all(conversationId) as MessageRow[];
  }

  createTask(t: { conversationId: string; requestId: string; userMessage: string; attachments: Attachment[] }): TaskRow {
    const id = randomUUID();
    const now = this.now();
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, conversation_id, request_id, user_message, status, attachments, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'RECEIVED', ?, ?, ?)`,
        )
        .run(id, t.conversationId, t.requestId, t.userMessage, JSON.stringify(t.attachments), now, now);
      this.appendEvent("task.created", { conversationId: t.conversationId, taskId: id }, { request_id: t.requestId, status: "RECEIVED" });
    });
    return this.getTask(id)!;
  }

  getTask(id: string): TaskRow | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  }

  getTaskByRequestId(requestId: string): TaskRow | undefined {
    return this.db.prepare("SELECT * FROM tasks WHERE request_id = ?").get(requestId) as TaskRow | undefined;
  }

  listTasks(conversationId: string): TaskRow[] {
    return this.db
      .prepare("SELECT * FROM tasks WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC")
      .all(conversationId) as TaskRow[];
  }

  listTasksByStatus(status: TaskStatus): TaskRow[] {
    return this.db.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at").all(status) as TaskRow[];
  }

  transition(taskId: string, to: TaskStatus, patch: TaskPatch = {}): TaskRow {
    return this.tx(() => {
      const task = this.getTask(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      assertTransition(task.status, to);
      const sets = ["status = ?", "updated_at = ?"];
      const values: unknown[] = [to, this.now()];
      for (const [k, v] of Object.entries(patch)) {
        sets.push(`${k} = ?`);
        values.push(v ?? null);
      }
      const res = this.db
        .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND status = ?`)
        .run(...values, taskId, task.status);
      if (res.changes !== 1) throw new ConcurrentTransitionError(taskId, task.status);
      this.audit("STATUS_CHANGED", { taskId }, { from: task.status, to });
      const updated = this.getTask(taskId)!;
      this.appendEvent(
        "task.status_changed",
        { conversationId: updated.conversation_id, taskId },
        { from: task.status, to, error_code: updated.error_code },
      );
      return updated;
    });
  }

  createAction(a: Omit<ActionRow, "id" | "idempotency_key" | "created_at" | "decision" | "decided_at" | "verified">): ActionRow {
    const id = randomUUID();
    this.tx(() => {
      this.db
        .prepare(
          `INSERT INTO actions (id, task_id, idempotency_key, tool, operation, description, risk_level,
             affected_resource, destination, input, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          a.task_id,
          randomUUID(),
          a.tool,
          a.operation,
          a.description,
          a.risk_level,
          a.affected_resource,
          a.destination,
          a.input,
          this.now(),
          a.expires_at,
        );
      this.appendEvent(
        "approval.requested",
        { conversationId: this.getTask(a.task_id)?.conversation_id, taskId: a.task_id, actionId: id },
        { operation: a.operation, tool: a.tool, risk_level: a.risk_level, expires_at: a.expires_at },
      );
    });
    return this.getAction(id)!;
  }

  getAction(id: string): ActionRow | undefined {
    return this.db.prepare("SELECT * FROM actions WHERE id = ?").get(id) as ActionRow | undefined;
  }

  getActionByTask(taskId: string): ActionRow | undefined {
    return this.db
      .prepare("SELECT * FROM actions WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(taskId) as ActionRow | undefined;
  }

  listPendingActions(): ActionRow[] {
    return this.db
      .prepare(
        `SELECT a.* FROM actions a JOIN tasks t ON t.id = a.task_id
         WHERE t.status = 'WAITING_FOR_APPROVAL' AND a.decision IS NULL`,
      )
      .all() as ActionRow[];
  }

  recordDecision(actionId: string, decision: DecisionValue | "EXPIRED", decidedAt = this.now()): boolean {
    return this.tx(() => {
      const res = this.db
        .prepare("UPDATE actions SET decision = ?, decided_at = ? WHERE id = ? AND decision IS NULL")
        .run(decision, decidedAt, actionId);
      if (res.changes !== 1) return false;
      this.appendEvent("approval.decided", this.actionRef(actionId), { decision });
      return true;
    });
  }

  setVerified(actionId: string, verified: boolean): void {
    this.tx(() => {
      this.db.prepare("UPDATE actions SET verified = ? WHERE id = ?").run(verified ? 1 : 0, actionId);
      this.appendEvent("action.verified", this.actionRef(actionId), { verified });
    });
  }

  private actionRef(actionId: string): { conversationId?: string; taskId?: string; actionId: string } {
    const action = this.getAction(actionId);
    const task = action ? this.getTask(action.task_id) : undefined;
    return { conversationId: task?.conversation_id, taskId: action?.task_id, actionId };
  }

  insertExecution(action: ActionRow): void {
    this.db
      .prepare("INSERT INTO executions (idempotency_key, action_id, task_id, reserved_at) VALUES (?, ?, ?, ?)")
      .run(action.idempotency_key, action.id, action.task_id, this.now());
  }

  getExecution(idempotencyKey: string): ExecutionRow | undefined {
    return this.db.prepare("SELECT * FROM executions WHERE idempotency_key = ?").get(idempotencyKey) as
      | ExecutionRow
      | undefined;
  }
}
