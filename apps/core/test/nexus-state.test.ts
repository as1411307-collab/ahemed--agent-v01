import { mkdtempSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../src/db.js';
import { NexusState } from '../src/nexus/state.js';

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function fixture(clock?: () => Date) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nexus-state-'));
  const file = path.join(dir, 'state.db');
  let db = openDb(file);
  let state = new NexusState(db, clock);
  cleanup.push(() => { if (db.open) db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { file, get state() { return state; }, get db(): DB { return db; }, reopen() { db.close(); db = openDb(file); state = new NexusState(db, clock); } };
}
function mission(state: NexusState, id = 'm1', requestId = id) {
  return state.createMission({ id, requestId, goal: 'Research a question', agentId: 'principal', configRevision: state.getConfig().revision });
}

describe('Nexus desired configuration', () => {
  it('persists versions across restarts and restores as a new version', () => {
    const f = fixture();
    const first = f.state.getConfig();
    expect(first.revision).toBe(1);
    expect(first.config.world.scene).toBe('SKY_SANCTUARY');
    expect(first.config.agents.filter(a => a.enabled).map(a => a.id)).toEqual(['principal']);
    const changed = structuredClone(first.config);
    changed.world.reducedMotion = true;
    expect(f.state.applyConfig(changed, 1).revision).toBe(2);
    f.reopen();
    expect(f.state.getConfig().config.world.reducedMotion).toBe(true);
    expect(() => f.state.applyConfig(changed, 1)).toThrow(/revision/i);
    expect(f.state.restoreConfig(1, 2).revision).toBe(3);
    expect(f.state.getConfig().config.world.reducedMotion).toBe(false);
    expect(f.state.listVersions()).toHaveLength(3);
    expect(f.state.events('config').map(e => e.type)).toEqual(['config.changed', 'config.changed']);
  });
  it('rejects secrets, runtime state, arbitrary commands and invalid limits without modifying current config', () => {
    const f = fixture();
    const base = f.state.getConfig().config;
    for (const patch of [
      { apiKey: 'private' }, { runtime: { status: 'running' } },
      { integrations: [{ id: 'bad', kind: 'mcp', enabled: true, command: 'sh' }] },
      { governance: { ...base.governance, dailyLimitMicroUsd: 5_000_001 } },
      { governance: { ...base.governance, missionLimitMicroUsd: -1 } },
      { world: { ...base.world, camera: { ...base.world.camera, motionSpeed: Infinity } } },
      { models: [{ id: 'x', provider: 'anthropic', model: 'm', token: 'private' }] },
    ]) expect(() => f.state.applyConfig({ ...base, ...patch }, 1)).toThrow();
    expect(f.state.getConfig().revision).toBe(1);
    expect(f.state.events('config')).toHaveLength(0);
  });
  it('validates references and duplicate agent identifiers', () => {
    const f = fixture();
    const base = f.state.getConfig().config;
    const duplicate = { ...base, agents: [base.agents[0], base.agents[0]] };
    expect(() => f.state.validateConfig(duplicate)).toThrow(/duplicate/i);
    expect(() => f.state.validateConfig({ ...base, agents: [{ ...base.agents[0], modelRef: 'missing' }] })).toThrow(/model/i);
  });
});

describe('durable mission event store', () => {
  it('looks up idempotency keys and source cursors beyond the first API page', () => {
    const f = fixture();
    for (let i=0;i<1002;i++) {
      mission(f.state, `m${i}`);
      f.state.appendEvent('source', 'tool.result', {sourceSequence:i});
    }
    expect(f.state.listMissions()).toHaveLength(1000);
    expect(f.state.listMissions().some(m => m.id === 'm0')).toBe(false);
    expect(f.state.activeMissions()).toHaveLength(1002);
    expect(f.state.activeMissions().some(m => m.id === 'm0')).toBe(true);
    for (const [id,status] of [['m1','completed'],['m2','failed'],['m3','cancelled'],['m4','interrupted']]) f.state.updateMission(id,{status});
    expect(f.state.activeMissions()).toHaveLength(998);
    expect(f.state.activeMissions().some(m => m.id === 'm0')).toBe(true);
    expect(f.state.getMissionByRequestId('m0')?.id).toBe('m0');
    expect(f.state.getMissionByRequestId('absent')).toBeUndefined();
    expect(f.state.events('source',0)).toHaveLength(1000);
    expect(f.state.lastSourceSequence('source')).toBe(1001);
    f.reopen();
    expect(f.state.lastSourceSequence('source')).toBe(1001);
    expect(f.state.activeMissions()).toHaveLength(998);
    expect(f.state.activeMissions().some(m => m.id === 'm0')).toBe(true);
  });
  it('rejects event identifiers that could inject SSE framing', () => {
    const f = fixture();
    expect(() => f.state.appendEvent('m1', 'tool.called', {}, {eventId: 'x\ndata: forged'})).toThrow(/line breaks/);
    expect(() => f.state.appendEvent('m1', 'tool.called\ndata: forged', {})).toThrow();
    expect(f.state.events('m1')).toHaveLength(0);
  });
  it('assigns per-stream sequence numbers and deduplicates persisted events', () => {
    const f = fixture();
    const first = f.state.appendEvent('m1', 'tool.called', { tool: 'web_search' }, { eventId: 'source-1' });
    expect(first.sequence).toBe(1);
    expect(f.state.appendEvent('m2', 'mission.started', {}).sequence).toBe(1);
    f.reopen();
    expect(f.state.appendEvent('m1', 'tool.called', { tool: 'web_search' }, { eventId: 'source-1' })).toEqual(first);
    expect(() => f.state.appendEvent('m2', 'tool.called', {}, { eventId: 'source-1' })).toThrow(/event/i);
    expect(f.state.appendEvent('m1', 'tool.result', {}).sequence).toBe(2);
    expect(f.state.events('m1', 1).map(e => e.type)).toEqual(['tool.result']);
    expect(() => f.db.prepare("UPDATE nexus_events SET type='forged'").run()).toThrow(/append-only/);
    expect(() => f.db.prepare('DELETE FROM nexus_events').run()).toThrow(/append-only/);
  });
  it('persists run mapping and commits mission state with the event in one transaction', () => {
    const f = fixture();
    const original = mission(f.state);
    expect(mission(f.state, 'ignored', 'm1')).toEqual(original);
    expect(() => f.state.createMission({ ...original, goal: 'different' })).toThrow(/request/i);
    f.state.updateMission('m1', { runId: 'hermes-run-1', status: 'running' });
    f.reopen();
    expect(f.state.getMission('m1')?.runId).toBe('hermes-run-1');
    expect(f.state.events('m1').map(e => e.type)).toEqual(['mission.created', 'mission.started']);
    expect(f.state.listMissions()).toHaveLength(1);
    f.db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON nexus_events BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
    expect(() => f.state.updateMission('m1', { status: 'completed' })).toThrow(/test failure/);
    expect(f.state.getMission('m1')?.status).toBe('running');
  });
  it('rejects unknown revisions and does not invent a successful terminal state', () => {
    const f = fixture();
    expect(() => f.state.createMission({ id: 'm1', requestId: 'r1', goal: 'Goal', agentId: 'principal', configRevision: 999 })).toThrow(/revision/);
    mission(f.state);
    f.state.updateMission('m1', { status: 'stopping' });
    expect(f.state.getMission('m1')?.status).toBe('stopping');
    f.state.updateMission('m1', { status: 'cancelled' });
    expect(() => f.state.updateMission('m1', { status: 'running' })).toThrow(/terminal/);
  });
});

describe('budget reservations', () => {
  it('serializes competing reservations from separate processes against the same SQLite budget', async () => {
    const f = fixture();
    const current = f.state.getConfig();
    current.config.governance.dailyLimitMicroUsd = 1_000_000;
    f.state.applyConfig(current.config, current.revision);
    mission(f.state, 'm1'); mission(f.state, 'm2');
    const stateUrl = new URL('../src/nexus/state.ts', import.meta.url).href;
    const dbUrl = new URL('../src/db.ts', import.meta.url).href;
    const script = `import {NexusState} from ${JSON.stringify(stateUrl)}; import {openDb} from ${JSON.stringify(dbUrl)};
      const db=openDb(process.argv[1]); const s=new NexusState(db);
      try {s.reserve(process.argv[2],1000000);s.updateMission(process.argv[2],{detail:{reservation:'reserved'}});} catch(e) {s.updateMission(process.argv[2],{detail:{reservation:e.code}});} finally {db.close();}`;
    const run = (id: string) => promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, f.file, id], { cwd: fileURLToPath(new URL('../../../', import.meta.url)) });
    await Promise.all([run('m1'), run('m2')]);
    expect(f.state.listMissions().map(m => (m.detail as {reservation:string}).reservation).sort()).toEqual(['DAILY_BUDGET', 'reserved']);
    expect(f.state.budget().reservedMicroUsd).toBe(1_000_000);
  });
  it('reserves multiple mission liabilities and enforces daily and mission limits', () => {
    const f = fixture();
    for (let i = 0; i < 6; i++) mission(f.state, `m${i}`);
    expect(() => f.state.reserve('m0', 1_000_001)).toThrow(/mission/i);
    for (let i = 0; i < 5; i++) f.state.reserve(`m${i}`, 1_000_000);
    expect(() => f.state.reserve('m5', 1)).toThrow(/daily/i);
    expect(f.state.budget().reservedMicroUsd).toBe(5_000_000);
    expect(f.state.reserve('m0', 1_000_000).reservedMicroUsd).toBe(1_000_000);
    expect(() => f.state.reserve('m0', 900_000)).toThrow(/reservation/i);
    f.state.settle('m0', 200_000);
    f.state.reserve('m5', 800_000);
    expect(f.state.budget().remainingMicroUsd).toBe(0);
    expect(f.state.budget().spentMicroUsd).toBe(200_000);
  });
  it('does not release unresolved spend on timeout, restart or UTC rollover', () => {
    let now = new Date('2026-10-21T23:59:59.000Z');
    const f = fixture(() => now);
    for (let i = 0; i < 6; i++) { mission(f.state, `m${i}`); if (i < 5) f.state.reserve(`m${i}`, 1_000_000); }
    now = new Date('2026-10-22T00:00:01.000Z');
    f.reopen();
    expect(f.state.budget().day).toBe('2026-10-22');
    expect(f.state.budget().reservedMicroUsd).toBe(5_000_000);
    expect(() => f.state.reserve('m5', 1)).toThrow(/daily/i);
    expect(() => f.state.settle('m0', undefined as unknown as number)).toThrow();
    expect(f.state.budget().reservedMicroUsd).toBe(5_000_000);
    f.state.settle('m0', 300_000);
    expect(f.state.budget().spentMicroUsd).toBe(300_000);
    expect(f.state.budget().reservedMicroUsd).toBe(4_000_000);
  });
  it('records overrun truthfully and refuses contradictory settlement or borrowing above a reduced cap', () => {
    const f = fixture();
    mission(f.state);
    f.state.reserve('m1', 100_000);
    f.state.settle('m1', 1_200_000);
    expect(f.state.settle('m1', 1_200_000).actualMicroUsd).toBe(1_200_000);
    expect(() => f.state.settle('m1', 1)).toThrow(/settlement/i);
    const current = f.state.getConfig();
    current.config.governance.dailyLimitMicroUsd = 1_000_000;
    current.config.governance.missionLimitMicroUsd = 1_000_000;
    f.state.applyConfig(current.config, current.revision);
    mission(f.state, 'm2');
    expect(() => f.state.reserve('m2', 1)).toThrow(/daily/i);
    expect(f.state.budget().overrunMicroUsd).toBe(200_000);
  });
});
