import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNexus } from '../src/nexus/server.js';
import { makeEnv } from './helpers.js';
import type { Engine, RunState } from '../src/nexus/hermes.js';
const envs:ReturnType<typeof makeEnv>[]=[];const servers:Awaited<ReturnType<typeof createNexus>>[]=[];
afterEach(async()=>{for(const s of servers.splice(0))await s.close();for(const e of envs.splice(0))e.cleanup();});
const auth={authorization:'Bearer testing'};
const engine=()=>({capabilities:vi.fn(async()=>({features:{run_submission:true,run_status:true,run_events_sse:true,run_stop:true,run_steer:true,run_approval_response:true}})),start:vi.fn(async()=>({run_id:'run-a',status:'running'})),status:vi.fn(async():Promise<RunState>=>({run_id:'run-a',status:'running'})),stop:vi.fn(async()=>({run_id:'run-a',status:'stopping'})),steer:vi.fn(async()=>({accepted:true})),approval:vi.fn(async()=>({resolved:1})),events:async function*():AsyncGenerator<{id:string|null;data:Record<string,unknown>}> {}} satisfies Engine);
async function setup(options:Record<string,unknown>={}){const e=makeEnv();envs.push(e);const s=await createNexus({dbFile:e.dbFile,workspaceRoot:e.wsRoot,appToken:'testing',...options});servers.push(s);return s;}
describe('NEXUS Gateway',()=>{
 it('requires auth for settings, streaming and world bridge; missing Hermes is unavailable',async()=>{
  const s=await setup();for(const url of ['/nexus/v1/health','/nexus/v1/events/stream','/nexus/v1/world/snapshot'])expect((await s.app.inject({url})).statusCode).toBe(401);
  expect((await s.app.inject({url:'/nexus/v1/health',headers:auth})).json().engine.status).toBe('unavailable');
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'research',agentId:'principal',requestId:'req'}});expect(r.statusCode).toBe(503);expect(r.json().mission.status).toBe('blocked');
 });
 it('does not start a live engine without proven policy and budget enforcement',async()=>{
  const h=engine(),s=await setup({engine:h});const r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'research',agentId:'principal',requestId:'req'}});
  expect(r.statusCode).toBe(503);expect(h.start).not.toHaveBeenCalled();expect(r.json().error.code).toBe('EXECUTION_POLICY_UNVERIFIED');
 });
 it('persists idempotency, confirms stop using terminal status, isolates read-only replay',async()=>{
  const h=engine(),s=await setup({engine:h,authorizeExecution:async()=>({allowed:true,maxCostMicroUsd:1000000,evidence:'test fixture only'})});
  const payload={goal:'research',agentId:'principal',requestId:'req'};
  let r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload});expect(r.statusCode).toBe(202);const id=r.json().mission.id;
  r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload});expect(h.start).toHaveBeenCalledTimes(1);expect(r.json().mission.id).toBe(id);
  r=await s.app.inject({method:'POST',url:`/nexus/v1/missions/${id}/stop`,headers:auth,payload:{}});expect(r.json().mission.status).toBe('stopping');
  h.status.mockResolvedValue({run_id:'run-a',status:'cancelled'});r=await s.app.inject({url:`/nexus/v1/missions/${id}`,headers:auth});expect(r.json().mission.status).toBe('cancelled');
  await s.app.inject({url:`/nexus/v1/events?streamId=${id}&after=0`,headers:auth});expect(h.start).toHaveBeenCalledTimes(1);expect(h.approval).not.toHaveBeenCalled();
  expect(s.state.budget().reservedMicroUsd).toBe(1000000);
 });
 it('requires exact active approval id and never forwards session-wide approval',async()=>{
  const h=engine(),s=await setup({engine:h,authorizeExecution:async()=>({allowed:true,maxCostMicroUsd:1000000,evidence:'test fixture only'})});
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'read',agentId:'principal',requestId:'approval'}});const id=r.json().mission.id;
  h.status.mockResolvedValue({run_id:'run-a',status:'waiting_for_approval',approval:{request_id:'exact',choices:['once','deny']}});
  const wrong=await s.app.inject({method:'POST',url:`/nexus/v1/missions/${id}/approval`,headers:auth,payload:{approvalId:'wrong',decision:'once'}});expect(wrong.statusCode).toBe(409);expect(h.approval).not.toHaveBeenCalled();
  const correct=await s.app.inject({method:'POST',url:`/nexus/v1/missions/${id}/approval`,headers:auth,payload:{approvalId:'exact',decision:'once'}});expect(correct.statusCode).toBe(200);expect(h.approval).toHaveBeenCalledWith('run-a','exact','once');
 });
 it('validates and applies settings with optimistic versions, exports config without runtime state',async()=>{
  const s=await setup();const initial=s.state.getConfig();initial.config.world.reducedMotion=true;
  const apply=await s.app.inject({method:'POST',url:'/nexus/v1/config/apply',headers:auth,payload:{expectedRevision:initial.revision,config:initial.config}});expect(apply.statusCode).toBe(200);
  const stale=await s.app.inject({method:'POST',url:'/nexus/v1/config/apply',headers:auth,payload:{expectedRevision:initial.revision,config:initial.config}});expect(stale.statusCode).toBe(409);
  const exported=await s.app.inject({url:'/nexus/v1/config/export',headers:auth});expect(exported.headers['content-disposition']).toContain('nexus.config.json');expect(exported.json()).not.toHaveProperty('missions');
 });
});

describe('Security review regressions',()=>{
 it('search obeys agent and integration policy before any paid provider request',async()=>{
  const provider=vi.fn();const s=await setup({integrations:{tavilyKey:'private',fetcher:provider},searchQuoteMicroUsd:1000});
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/search',headers:auth,payload:{query:'energy',requestId:'paid'}});
  expect(r.statusCode).toBe(403);expect(provider).not.toHaveBeenCalled();expect(s.state.budget().reservedMicroUsd).toBe(0);
 });
 it('does not confirm emergency stop when submission run identity is unknown',async()=>{
  const h=engine();h.start.mockRejectedValue(new Error('network interrupted'));
  const s=await setup({engine:h,authorizeExecution:async()=>({allowed:true,maxCostMicroUsd:1000000,evidence:'test only'})});
  await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'research',agentId:'principal',requestId:'unknown'}});
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/emergency-stop',headers:auth,payload:{}});
  expect(r.json().allConfirmed).toBe(false);expect(r.json().results[0].requested).toBe(false);expect(h.stop).not.toHaveBeenCalled();
 });
 it('native lifecycle evidence yields exactly one normalized outcome and survives close',async()=>{
  const h=engine();h.status.mockResolvedValue({run_id:'run-a',status:'completed'});
  h.events=async function*(){yield{id:'0',data:{event:'run.completed',run_id:'run-a',seq:0,output:'Done'}};};
  const s=await setup({engine:h,authorizeExecution:async()=>({allowed:true,maxCostMicroUsd:1000000,evidence:'test only'})});
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'research',agentId:'principal',requestId:'event'}});const id=r.json().mission.id;
  await new Promise(resolve=>setImmediate(resolve));
  const events=s.state.events(id);expect(events.filter(e=>e.type==='mission.completed')).toHaveLength(1);expect(s.state.getMission(id)?.status).toBe('completed');
 });
 it('never forwards an approval with malformed native expiration',async()=>{
  const h=engine(),s=await setup({engine:h,authorizeExecution:async()=>({allowed:true,maxCostMicroUsd:1000000,evidence:'test only'})});
  const r=await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers:auth,payload:{goal:'read',agentId:'principal',requestId:'bad-time'}});const id=r.json().mission.id;
  h.status.mockResolvedValue({run_id:'run-a',status:'waiting_for_approval',approval:{request_id:'exact',expires_at:'nonsense'}});
  const result=await s.app.inject({method:'POST',url:`/nexus/v1/missions/${id}/approval`,headers:auth,payload:{approvalId:'exact',decision:'once'}});expect(result.statusCode).toBe(410);expect(h.approval).not.toHaveBeenCalled();
 });
});

describe('Unreal read-only boundary',()=>{
 it('issues a short-lived read-only ticket which cannot execute or change configuration',async()=>{
  const s=await setup();const issue=await s.app.inject({method:'POST',url:'/nexus/v1/world/viewer-ticket',headers:auth,payload:{}});const ticket=issue.json();expect(ticket.executionAllowed).toBe(false);
  const headers={authorization:`Bearer ${ticket.token}`};expect((await s.app.inject({url:'/nexus/v1/world/snapshot',headers})).statusCode).toBe(200);
  expect((await s.app.inject({url:'/nexus/v1/config',headers})).statusCode).toBe(401);
  expect((await s.app.inject({method:'POST',url:'/nexus/v1/missions',headers,payload:{}})).statusCode).toBe(401);
  const snapshot=(await s.app.inject({url:'/nexus/v1/world/snapshot',headers})).json();expect(snapshot.sceneManifest.asset.acquired).toBe(false);expect(snapshot.worldBuildVerified).toBe(false);
 });
});

it('streams persisted events over a real authenticated HTTP connection and closes cleanly',async()=>{
 const s=await setup();const address=await s.app.listen({host:'127.0.0.1',port:0});const controller=new AbortController();
 const response=await fetch(address+'/nexus/v1/events/stream?streamId=stream-test',{headers:auth,signal:controller.signal});expect(response.headers.get('content-type')).toBe('text/event-stream');
 const reader=response.body!.getReader();
 try{await reader.read();s.state.appendEvent('stream-test','config.changed',{verified:true});const chunk=await reader.read();expect(new TextDecoder().decode(chunk.value)).toContain('config.changed');}finally{await reader.cancel();controller.abort();}
});
