import {actionDigest, type ActionRecord, type ActionState, type ActionStore, type ActionEnvelope} from './action-broker.js';
import type Database from 'better-sqlite3';

/** Dedicated DB must be owned by the broker OS account, not readable by LLM workers. */
export class SqliteActionStore implements ActionStore {
  constructor(private readonly db: Database.Database) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS broker_action_outbox (" +
      "action_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE," +
      " owner_id TEXT NOT NULL, device_id TEXT NOT NULL," +
      " envelope_json TEXT NOT NULL, digest TEXT NOT NULL," +
      " status TEXT NOT NULL CHECK(status IN ('PENDING','EXECUTING','UNKNOWN','COMPLETED'))," +
      " receipt TEXT, updated_at INTEGER NOT NULL);" +
      "CREATE INDEX IF NOT EXISTS broker_outbox_status ON broker_action_outbox(status);"
    );
  }
  insert(record: ActionRecord): void {
    const e = record.envelope;
    this.db.prepare(
      'INSERT INTO broker_action_outbox (action_id,idempotency_key,owner_id,device_id,envelope_json,digest,status,updated_at)' +
      ' VALUES (?,?,?,?,?,?,?,?)'
    ).run(e.actionId,e.idempotencyKey,e.ownerId,e.deviceId,JSON.stringify(e),actionDigest(e),record.status,Date.now());
  }
  find(id: string): ActionRecord | undefined {
    const row = this.db.prepare(
      'SELECT envelope_json,digest,status,receipt FROM broker_action_outbox WHERE action_id=?'
    ).get(id) as {envelope_json: string; digest: string; status: ActionState; receipt: string|null}|undefined;
    if (!row) return undefined;
    const envelope = JSON.parse(row.envelope_json) as ActionEnvelope;
    if (actionDigest(envelope) !== row.digest) throw new Error('SECURITY_REJECT: ENVELOPE_CHANGED');
    return {envelope,status:row.status,receipt:row.receipt??undefined};
  }
  reserve(id: string): boolean {
    return this.db.prepare(
      "UPDATE broker_action_outbox SET status='EXECUTING',updated_at=? WHERE action_id=? AND status='PENDING'"
    ).run(Date.now(),id).changes === 1;
  }
  markUnknown(id: string): void {
    const result = this.db.prepare(
      "UPDATE broker_action_outbox SET status='UNKNOWN',updated_at=? WHERE action_id=? AND status='EXECUTING'"
    ).run(Date.now(),id);
    if (result.changes !== 1) throw new Error('INVALID_STATE');
  }
  markCompleted(id: string, receipt: string): void {
    const result = this.db.prepare(
      "UPDATE broker_action_outbox SET status='COMPLETED',receipt=?,updated_at=? WHERE action_id=? AND status='EXECUTING'"
    ).run(receipt,Date.now(),id);
    if (result.changes !== 1) throw new Error('INVALID_STATE');
  }
  quarantineInterrupted(): void {
    this.db.prepare(
      "UPDATE broker_action_outbox SET status='UNKNOWN',updated_at=? WHERE status='EXECUTING'"
    ).run(Date.now());
  }
}