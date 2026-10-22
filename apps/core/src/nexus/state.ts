import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';

export interface NexusConfig {
  schemaVersion: 1;
  world: {
    scene: 'SKY_SANCTUARY' | 'FUTURE_MEGACITY' | 'COSMIC_OBSERVATORY';
    preset: 'Calm' | 'Executive' | 'Analytical' | 'Explorative';
    reducedMotion: boolean;
    camera: { mode: 'cinematic' | 'free'; sensitivity: number; motionSpeed: number; autoFocus: boolean };
    quality: 'Cinematic' | 'Balanced' | 'Performance';
  };
  agents: Array<{ id: string; role: string; enabled: boolean; modelRef: string; systemPrompt: string; toolAllowlist: string[] }>;
  models: Array<{ id: string; provider: 'anthropic' | 'ollama' | 'hermes'; model: string; secretRef?: string }>;
  integrations: Array<{ id: string; kind: 'mcp' | 'composio' | 'n8n' | 'ollama' | 'web_search' | 'mail'; enabled: boolean; secretRef?: string }>;
  governance: { dailyLimitMicroUsd: number; missionLimitMicroUsd: number; requireWriteApproval: boolean };
}
export interface ConfigVersion { revision: number; config: NexusConfig }
export interface NexusEvent {
  schemaVersion: 1; eventId: string; streamId: string; sequence: number;
  type: string; occurredAt: string; receivedAt: string;
  missionId: string | null; runId: string | null; agentId: string | null;
  correlationId: string | null; causationId: string | null; source: 'gateway';
  payload: unknown; configRevision: number;
}
export interface MissionRecord {
  id: string; goal: string; agentId: string; requestId: string; configRevision: number;
  status: string; runId: string | null; detail: unknown; createdAt: string; updatedAt: string;
}
export interface BudgetReservation {
  missionId: string; day: string; reservedMicroUsd: number; actualMicroUsd: number | null;
  reservedAt: string; settledAt: string | null;
}
export interface BudgetSnapshot {
  day: string; dailyLimitMicroUsd: number; missionLimitMicroUsd: number;
  reservedMicroUsd: number; spentMicroUsd: number; remainingMicroUsd: number; overrunMicroUsd: number;
  currency: 'USD'; source: 'gateway_reservations';
}
export class NexusStateError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 400) { super(message); this.name = 'NexusStateError'; }
}

const MAX_DAILY = 5_000_000;
const MAX_MISSION = 1_000_000;
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const STATUSES = new Set(['created', 'starting', 'running', 'waiting', 'waiting_approval', 'waiting_for_approval', 'stopping', 'cancel_requested', 'completed', 'failed', 'cancelled', 'interrupted', 'unavailable', 'blocked']);
const DEFAULT: NexusConfig = {
  schemaVersion: 1,
  world: { scene: 'SKY_SANCTUARY', preset: 'Calm', reducedMotion: false, camera: { mode: 'cinematic', sensitivity: 0.5, motionSpeed: 0.5, autoFocus: true }, quality: 'Balanced' },
  agents: ['principal', 'research', 'engineering', 'automation', 'memory', 'analysis', 'communications'].map(role => ({
    id: role, role, enabled: role === 'principal', modelRef: 'hermes-default',
    systemPrompt: role === 'principal' ? 'Coordinate the requested mission using only authorized tools. Report sources and uncertainty. Never infer approval.' : `Act as the ${role} specialist within the assigned scope and granted permissions.`,
    toolAllowlist: [],
  })),
  models: [{ id: 'hermes-default', provider: 'hermes', model: 'default' }],
  integrations: [],
  governance: { dailyLimitMicroUsd: MAX_DAILY, missionLimitMicroUsd: MAX_MISSION, requireWriteApproval: true },
};
const SCHEMA = `
CREATE TABLE IF NOT EXISTS nexus_config_versions (
 revision INTEGER PRIMARY KEY AUTOINCREMENT, config TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nexus_missions (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, goal TEXT NOT NULL, agent_id TEXT NOT NULL,
 config_revision INTEGER NOT NULL REFERENCES nexus_config_versions(revision), status TEXT NOT NULL,
 run_id TEXT UNIQUE, detail TEXT NOT NULL DEFAULT 'null', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nexus_events (
 event_id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, sequence INTEGER NOT NULL, type TEXT NOT NULL,
 occurred_at TEXT NOT NULL, mission_id TEXT, run_id TEXT, config_revision INTEGER NOT NULL,
 payload TEXT NOT NULL, envelope TEXT NOT NULL, UNIQUE(stream_id, sequence)
);
CREATE INDEX IF NOT EXISTS nexus_events_stream ON nexus_events(stream_id, sequence);
CREATE TABLE IF NOT EXISTS nexus_budget_reservations (
 mission_id TEXT PRIMARY KEY REFERENCES nexus_missions(id), day TEXT NOT NULL, reserved_micro_usd INTEGER NOT NULL CHECK(reserved_micro_usd >= 0),
 actual_micro_usd INTEGER CHECK(actual_micro_usd >= 0), reserved_at TEXT NOT NULL, settled_at TEXT,
 CHECK((actual_micro_usd IS NULL AND settled_at IS NULL) OR (actual_micro_usd IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS nexus_events_no_update BEFORE UPDATE ON nexus_events
 BEGIN SELECT RAISE(ABORT, 'nexus_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS nexus_events_no_delete BEFORE DELETE ON nexus_events
 BEGIN SELECT RAISE(ABORT, 'nexus_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS nexus_config_no_update BEFORE UPDATE ON nexus_config_versions
 BEGIN SELECT RAISE(ABORT, 'configuration history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS nexus_config_no_delete BEFORE DELETE ON nexus_config_versions
 BEGIN SELECT RAISE(ABORT, 'configuration history is append-only'); END;
`;

/** Adds independent Nexus tables; never owns/closes the shared legacy database. */
export class NexusState {
  constructor(private readonly db: DB, private readonly clock: () => Date = () => new Date()) {
    db.exec(SCHEMA);
    this.atomic(() => {
      if (!db.prepare('SELECT 1 FROM nexus_config_versions LIMIT 1').get()) {
        db.prepare('INSERT INTO nexus_config_versions(config, created_at) VALUES (?,?)').run(JSON.stringify(DEFAULT), this.now());
      }
    });
  }

  getConfig(): ConfigVersion {
    const row = this.db.prepare('SELECT revision,config FROM nexus_config_versions ORDER BY revision DESC LIMIT 1').get() as { revision: number; config: string };
    // Refuse malformed persisted desired configuration instead of serving it to an engine.
    return { revision: row.revision, config: this.validateConfig(JSON.parse(row.config)) };
  }

  validateConfig(input: unknown): NexusConfig {
    const root = object(input, ['schemaVersion', 'world', 'agents', 'models', 'integrations', 'governance'], 'configuration');
    if (root.schemaVersion !== 1) invalid('Unsupported configuration schemaVersion.');
    const world = object(root.world, ['scene', 'preset', 'reducedMotion', 'camera', 'quality'], 'world');
    oneOf(world.scene, ['SKY_SANCTUARY', 'FUTURE_MEGACITY', 'COSMIC_OBSERVATORY'], 'world.scene');
    oneOf(world.preset, ['Calm', 'Executive', 'Analytical', 'Explorative'], 'world.preset');
    oneOf(world.quality, ['Cinematic', 'Balanced', 'Performance'], 'world.quality');
    boolean(world.reducedMotion, 'world.reducedMotion');
    const camera = object(world.camera, ['mode', 'sensitivity', 'motionSpeed', 'autoFocus'], 'world.camera');
    oneOf(camera.mode, ['cinematic', 'free'], 'camera.mode');
    bounded(camera.sensitivity, 0, 1, 'camera.sensitivity');
    bounded(camera.motionSpeed, 0, 1, 'camera.motionSpeed');
    boolean(camera.autoFocus, 'camera.autoFocus');
    const models = array(root.models, 'models', 32);
    const modelIds = new Set<string>();
    for (const entry of models) {
      const m = object(entry, ['id', 'provider', 'model', 'secretRef'], 'model', ['secretRef']);
      uniqueId(m.id, modelIds, 'model');
      oneOf(m.provider, ['anthropic', 'ollama', 'hermes'], 'model.provider');
      string(m.model, 'model.model', 200);
      secretReference(m.secretRef);
    }
    const agentIds = new Set<string>();
    const agents = array(root.agents, 'agents', 32);
    for (const entry of agents) {
      const a = object(entry, ['id', 'role', 'enabled', 'modelRef', 'systemPrompt', 'toolAllowlist'], 'agent');
      uniqueId(a.id, agentIds, 'agent');
      string(a.role, 'agent.role', 80);
      boolean(a.enabled, 'agent.enabled');
      if (typeof a.modelRef !== 'string' || !modelIds.has(a.modelRef)) invalid('Agent modelRef must reference an existing model.');
      string(a.systemPrompt, 'agent.systemPrompt', 16_000, true);
      const toolIds = new Set<string>();
      for (const t of array(a.toolAllowlist, 'agent.toolAllowlist', 128)) uniqueId(t, toolIds, 'tool');
    }
    if (!agentIds.has('principal')) invalid('A principal agent configuration is required.');
    const integrationIds = new Set<string>();
    for (const entry of array(root.integrations, 'integrations', 64)) {
      const i = object(entry, ['id', 'kind', 'enabled', 'secretRef'], 'integration', ['secretRef']);
      uniqueId(i.id, integrationIds, 'integration');
      oneOf(i.kind, ['mcp', 'composio', 'n8n', 'ollama', 'web_search', 'mail'], 'integration.kind');
      boolean(i.enabled, 'integration.enabled');
      secretReference(i.secretRef);
    }
    const g = object(root.governance, ['dailyLimitMicroUsd', 'missionLimitMicroUsd', 'requireWriteApproval'], 'governance');
    money(g.dailyLimitMicroUsd, 'dailyLimitMicroUsd', MAX_DAILY);
    money(g.missionLimitMicroUsd, 'missionLimitMicroUsd', MAX_MISSION);
    if ((g.missionLimitMicroUsd as number) > (g.dailyLimitMicroUsd as number)) invalid('Mission limit cannot exceed daily limit.');
    boolean(g.requireWriteApproval, 'governance.requireWriteApproval');
    const serialized = json(input);
    if (serialized.length > 256_000) invalid('Configuration exceeds 256000 characters.');
    return JSON.parse(serialized) as NexusConfig;
  }

  applyConfig(input: unknown, expectedRevision: number): ConfigVersion {
    const config = this.validateConfig(input);
    return this.atomic(() => {
      if (this.getConfig().revision !== expectedRevision) throw new NexusStateError('REVISION_CONFLICT', 'Configuration revision has changed.', 409);
      const result = this.db.prepare('INSERT INTO nexus_config_versions(config, created_at) VALUES (?,?)').run(JSON.stringify(config), this.now());
      const revision = Number(result.lastInsertRowid);
      this.appendEvent('config', 'config.changed', { revision, previousRevision: expectedRevision, application: 'desired_saved' }, { configRevision: revision });
      return { revision, config };
    });
  }

  restoreConfig(revision: number, expectedRevision: number): ConfigVersion {
    const row = this.db.prepare('SELECT config FROM nexus_config_versions WHERE revision=?').get(revision) as { config: string } | undefined;
    if (!row) throw new NexusStateError('NOT_FOUND', 'Configuration revision does not exist.', 404);
    return this.applyConfig(JSON.parse(row.config), expectedRevision);
  }

  listVersions(): Array<ConfigVersion & { createdAt: string }> {
    return (this.db.prepare('SELECT revision,config,created_at FROM nexus_config_versions ORDER BY revision DESC').all() as Array<{ revision: number; config: string; created_at: string }>).map(r => ({ revision: r.revision, config: JSON.parse(r.config), createdAt: r.created_at }));
  }

  events(streamId: string, after = 0): NexusEvent[] {
    string(streamId, 'streamId', 200);
    if (!Number.isSafeInteger(after) || after < 0) invalid('Invalid event cursor.');
    return (this.db.prepare('SELECT envelope FROM nexus_events WHERE stream_id=? AND sequence>? ORDER BY sequence LIMIT 1000').all(streamId, after) as Array<{ envelope: string }>).map(r => JSON.parse(r.envelope));
  }

  appendEvent(streamId: string, type: string, payload: unknown, context: { missionId?: string; runId?: string; configRevision?: number; eventId?: string } = {}): NexusEvent {
    string(streamId, 'streamId', 200); string(type, 'event type', 120);
    if (!/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(type)) invalid('Event type contains unsupported characters.');
    if (context.missionId !== undefined) string(context.missionId, 'missionId', 200);
    if (context.runId !== undefined) string(context.runId, 'runId', 200);
    const body = json(payload);
    if (body.length > 1_000_000) invalid('Event payload exceeds limit.');
    if (context.eventId !== undefined) {
      string(context.eventId, 'eventId', 240);
      if (/[\r\n]/.test(context.eventId)) invalid('Event ID cannot contain line breaks.');
    }
    return this.atomic(() => {
      const existing = context.eventId ? this.db.prepare('SELECT envelope FROM nexus_events WHERE event_id=?').get(context.eventId) as { envelope: string } | undefined : undefined;
      if (existing) {
        const e = JSON.parse(existing.envelope) as NexusEvent;
        if (e.streamId !== streamId || e.type !== type || json(e.payload) !== body || e.missionId !== (context.missionId ?? null) || e.runId !== (context.runId ?? null) || (context.configRevision !== undefined && e.configRevision !== context.configRevision)) {
          throw new NexusStateError('EVENT_CONFLICT', 'Event ID already represents a different event.', 409);
        }
        return e;
      }
      const revision = context.configRevision ?? this.getConfig().revision;
      if (!this.db.prepare('SELECT 1 FROM nexus_config_versions WHERE revision=?').get(revision)) invalid('Event configuration revision does not exist.');
      const { sequence } = this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM nexus_events WHERE stream_id=?').get(streamId) as { sequence: number };
      const timestamp = this.now();
      const e: NexusEvent = { schemaVersion: 1, eventId: context.eventId ?? randomUUID(), streamId, sequence, type, occurredAt: timestamp, receivedAt: timestamp, missionId: context.missionId ?? null, runId: context.runId ?? null, agentId: null, correlationId: null, causationId: null, source: 'gateway', payload: JSON.parse(body), configRevision: revision };
      this.db.prepare('INSERT INTO nexus_events(event_id,stream_id,sequence,type,occurred_at,mission_id,run_id,config_revision,payload,envelope) VALUES (?,?,?,?,?,?,?,?,?,?)').run(e.eventId, streamId, sequence, type, timestamp, e.missionId, e.runId, revision, body, JSON.stringify(e));
      return e;
    });
  }

  createMission(input: { id: string; goal: string; agentId: string; requestId: string; configRevision: number }): MissionRecord {
    string(input.id, 'missionId', 200); string(input.requestId, 'requestId', 200); string(input.goal, 'goal', 32_000); string(input.agentId, 'agentId', 100);
    return this.atomic(() => {
      const existing = this.db.prepare('SELECT * FROM nexus_missions WHERE request_id=?').get(input.requestId) as MissionRow | undefined;
      if (existing) {
        if (existing.goal !== input.goal || existing.agent_id !== input.agentId || existing.config_revision !== input.configRevision) throw new NexusStateError('REQUEST_CONFLICT', 'Mission request ID already has different input.', 409);
        return missionFromRow(existing);
      }
      const configRow = this.db.prepare('SELECT config FROM nexus_config_versions WHERE revision=?').get(input.configRevision) as { config: string } | undefined;
      if (!configRow) invalid('Mission configuration revision does not exist.');
      const agent = (JSON.parse(configRow.config) as NexusConfig).agents.find(a => a.id === input.agentId);
      if (!agent || !agent.enabled) throw new NexusStateError('AGENT_DISABLED', 'Mission agent is unavailable or disabled.', 409);
      const now = this.now();
      this.db.prepare('INSERT INTO nexus_missions(id,request_id,goal,agent_id,config_revision,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(input.id, input.requestId, input.goal, input.agentId, input.configRevision, 'created', now, now);
      this.appendEvent(input.id, 'mission.created', { goal: input.goal, agentId: input.agentId }, { missionId: input.id, configRevision: input.configRevision });
      return this.getMission(input.id)!;
    });
  }

  getMissionByRequestId(requestId: string): MissionRecord | undefined {
    string(requestId, 'requestId', 200);
    const row = this.db.prepare('SELECT * FROM nexus_missions WHERE request_id=?').get(requestId) as MissionRow | undefined;
    return row ? missionFromRow(row) : undefined;
  }

  lastSourceSequence(streamId: string): number {
    string(streamId, 'streamId', 200);
    const row = this.db.prepare(`SELECT COALESCE(MAX(json_extract(payload,'$.sourceSequence')),-1) AS sequence FROM nexus_events WHERE stream_id=? AND json_type(payload,'$.sourceSequence')='integer'`).get(streamId) as { sequence: number };
    return row.sequence;
  }

  getMission(id: string): MissionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM nexus_missions WHERE id=?').get(id) as MissionRow | undefined;
    return row ? missionFromRow(row) : undefined;
  }

  listMissions(): MissionRecord[] { return (this.db.prepare('SELECT * FROM nexus_missions ORDER BY created_at DESC,id DESC LIMIT 1000').all() as MissionRow[]).map(missionFromRow); }

  /** Recovery and emergency stop must never inherit the UI list's page limit. */
  activeMissions(): MissionRecord[] {
    return (this.db.prepare("SELECT * FROM nexus_missions WHERE status NOT IN ('completed','failed','cancelled','interrupted') ORDER BY created_at,id").all() as MissionRow[]).map(missionFromRow);
  }


  updateMission(id: string, patch: { runId?: string; status?: string; detail?: unknown }): MissionRecord {
    if (patch.status !== undefined && !STATUSES.has(patch.status)) invalid('Unsupported mission status.');
    if (patch.runId !== undefined) string(patch.runId, 'runId', 200);
    const detail = patch.detail === undefined ? undefined : json(patch.detail);
    return this.atomic(() => {
      const previous = this.getMission(id);
      if (!previous) throw new NexusStateError('NOT_FOUND', 'Mission does not exist.', 404);
      if (TERMINAL.has(previous.status) && patch.status !== undefined && patch.status !== previous.status) throw new NexusStateError('TERMINAL_STATE', 'A terminal mission cannot be restarted or overwritten.', 409);
      if (previous.runId && patch.runId && previous.runId !== patch.runId) throw new NexusStateError('RUN_CONFLICT', 'Mission is already bound to another run.', 409);
      this.db.prepare('UPDATE nexus_missions SET run_id=?,status=?,detail=?,updated_at=? WHERE id=?').run(patch.runId ?? previous.runId, patch.status ?? previous.status, detail ?? JSON.stringify(previous.detail), this.now(), id);
      const current = this.getMission(id)!;
      if (current.status !== previous.status) {
        const eventType = ({ running: 'mission.started', completed: 'mission.completed', failed: 'mission.failed', interrupted: 'mission.interrupted', stopping: 'mission.cancel_requested', cancel_requested: 'mission.cancel_requested', cancelled: 'mission.cancelled' } as Record<string, string>)[current.status] ?? 'mission.state_changed';
        this.appendEvent(id, eventType, { previousStatus: previous.status, status: current.status }, { missionId: id, runId: current.runId ?? undefined, configRevision: current.configRevision });
      }
      return current;
    });
  }

  reserve(missionId: string, microUsd: number): BudgetReservation {
    money(microUsd, 'reservation', Number.MAX_SAFE_INTEGER);
    return this.atomic(() => {
      if (!this.getMission(missionId)) throw new NexusStateError('NOT_FOUND', 'Mission does not exist.', 404);
      const existing = this.reservation(missionId);
      if (existing) {
        if (existing.reservedMicroUsd !== microUsd) throw new NexusStateError('RESERVATION_CONFLICT', 'Mission reservation already has another amount.', 409);
        return existing;
      }
      const b = this.budget();
      if (microUsd > b.missionLimitMicroUsd) throw new NexusStateError('MISSION_BUDGET', 'Mission reservation exceeds mission budget.', 409);
      if (microUsd > b.remainingMicroUsd || b.overrunMicroUsd > 0) throw new NexusStateError('DAILY_BUDGET', 'Reservation exceeds daily budget including outstanding liabilities.', 409);
      this.db.prepare('INSERT INTO nexus_budget_reservations(mission_id,day,reserved_micro_usd,reserved_at) VALUES (?,?,?,?)').run(missionId, b.day, microUsd, this.now());
      const m = this.getMission(missionId)!;
      this.appendEvent(missionId, 'cost.updated', { measurement: 'reservation', reservedMicroUsd: microUsd, currency: 'USD' }, { missionId, runId: m.runId ?? undefined, configRevision: m.configRevision });
      return this.reservation(missionId)!;
    });
  }

  /** Only call with final measured usage. Missing usage remains an outstanding liability. */
  settle(missionId: string, actualMicroUsd: number): BudgetReservation {
    money(actualMicroUsd, 'actual cost', Number.MAX_SAFE_INTEGER);
    return this.atomic(() => {
      const existing = this.reservation(missionId);
      if (!existing) throw new NexusStateError('NOT_FOUND', 'Mission reservation does not exist.', 404);
      if (existing.actualMicroUsd !== null) {
        if (existing.actualMicroUsd !== actualMicroUsd) throw new NexusStateError('SETTLEMENT_CONFLICT', 'Final settlement is already recorded.', 409);
        return existing;
      }
      this.db.prepare('UPDATE nexus_budget_reservations SET actual_micro_usd=?,settled_at=? WHERE mission_id=?').run(actualMicroUsd, this.now(), missionId);
      const m = this.getMission(missionId)!;
      this.appendEvent(missionId, 'cost.updated', { measurement: 'measured', actualMicroUsd, reservedMicroUsd: existing.reservedMicroUsd, overrunMicroUsd: Math.max(0, actualMicroUsd - existing.reservedMicroUsd), currency: 'USD' }, { missionId, runId: m.runId ?? undefined, configRevision: m.configRevision });
      return this.reservation(missionId)!;
    });
  }

  budget(): BudgetSnapshot {
    const day = this.now().slice(0, 10);
    const g = this.getConfig().config.governance;
    const { reserved } = this.db.prepare('SELECT COALESCE(SUM(reserved_micro_usd),0) AS reserved FROM nexus_budget_reservations WHERE settled_at IS NULL').get() as { reserved: number };
    // Charge delayed provider usage to the day it becomes known; no liability disappears at midnight.
    const { spent } = this.db.prepare('SELECT COALESCE(SUM(actual_micro_usd),0) AS spent FROM nexus_budget_reservations WHERE substr(settled_at,1,10)=?').get(day) as { spent: number };
    return { day, dailyLimitMicroUsd: g.dailyLimitMicroUsd, missionLimitMicroUsd: g.missionLimitMicroUsd, reservedMicroUsd: reserved, spentMicroUsd: spent, remainingMicroUsd: Math.max(0, g.dailyLimitMicroUsd - spent - reserved), overrunMicroUsd: Math.max(0, spent + reserved - g.dailyLimitMicroUsd), currency: 'USD', source: 'gateway_reservations' };
  }

  private reservation(missionId: string): BudgetReservation | undefined {
    const row = this.db.prepare('SELECT * FROM nexus_budget_reservations WHERE mission_id=?').get(missionId) as { mission_id: string; day: string; reserved_micro_usd: number; actual_micro_usd: number | null; reserved_at: string; settled_at: string | null } | undefined;
    return row ? { missionId: row.mission_id, day: row.day, reservedMicroUsd: row.reserved_micro_usd, actualMicroUsd: row.actual_micro_usd, reservedAt: row.reserved_at, settledAt: row.settled_at } : undefined;
  }
  private atomic<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
  private now(): string { return this.clock().toISOString(); }
}

interface MissionRow { id: string; request_id: string; goal: string; agent_id: string; config_revision: number; status: string; run_id: string | null; detail: string; created_at: string; updated_at: string }
function missionFromRow(r: MissionRow): MissionRecord { return { id: r.id, goal: r.goal, agentId: r.agent_id, requestId: r.request_id, configRevision: r.config_revision, status: r.status, runId: r.run_id, detail: JSON.parse(r.detail), createdAt: r.created_at, updatedAt: r.updated_at }; }
function invalid(message: string): never { throw new NexusStateError('INVALID_CONFIG_OR_INPUT', message); }
function object(value: unknown, keys: string[], name: string, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid(`${name} must be an object.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) invalid(`Unknown or sensitive field ${name}.${key}.`);
  for (const key of keys) if (!optional.includes(key) && !Object.hasOwn(record, key)) invalid(`Missing field ${name}.${key}.`);
  return record;
}
function string(value: unknown, name: string, max = 200, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid(`${name} must be a valid string of at most ${max} characters.`);
}
function array(value: unknown, name: string, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) invalid(`${name} must be an array of at most ${max} entries.`); return value; }
function boolean(value: unknown, name: string): void { if (typeof value !== 'boolean') invalid(`${name} must be boolean.`); }
function bounded(value: unknown, min: number, max: number, name: string): void { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid(`${name} must be between ${min} and ${max}.`); }
function money(value: unknown, name: string, max: number): void { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) invalid(`${name} must be integer microUSD between zero and ${max}.`); }
function oneOf(value: unknown, choices: readonly string[], name: string): void { if (typeof value !== 'string' || !choices.includes(value)) invalid(`${name} is unsupported.`); }
function uniqueId(value: unknown, seen: Set<string>, name: string): void {
  string(value, `${name}.id`, 100);
  if (!/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(value)) invalid(`${name} identifier contains unsupported characters.`);
  if (seen.has(value)) invalid(`Duplicate ${name} identifier.`);
  seen.add(value);
}
function secretReference(value: unknown): void { if (value !== undefined && (typeof value !== 'string' || !/^[A-Z][A-Z0-9_]{0,99}$/.test(value))) invalid('secretRef must be an environment variable name, never a secret value.'); }
function json(value: unknown): string {
  const seen = new Set<object>();
  function normalized(v: unknown): unknown {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v !== 'object' || !v || seen.has(v)) invalid('Value must be finite, acyclic JSON.');
    seen.add(v);
    let result: unknown;
    if (Array.isArray(v)) result = v.map(normalized);
    else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) invalid('Value must be plain JSON.');
      result = Object.fromEntries(Object.keys(v).sort().map(k => [k, normalized((v as Record<string, unknown>)[k])]));
    }
    seen.delete(v);
    return result;
  }
  return JSON.stringify(normalized(value));
}
