import { ApprovalWindows } from './approvals.js';
import { SCENE_MANIFEST, WORLD_BRIDGE_VERSION } from './worldBridge.js';
import { ensureDesiredFile, saveDesiredFile } from './configFile.js';
import Fastify from 'fastify';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { openDb } from '../db.js';
import { Workspace } from '../workspace.js';
import { MemoryService } from '../services/memoryService.js';
import { NexusState, NexusStateError, type MissionRecord, type NexusConfig } from './state.js';
import { HermesError, type Engine, type EngineCapabilities, type RunState } from './hermes.js';
import { Integrations, type IntegrationOptions } from './integrations.js';
import { KnowledgeVault } from './knowledge.js';
import { directEvent } from './director.js';

export interface NexusOptions {
 dbFile:string;workspaceRoot:string;appToken:string;engine?:Engine;integrations?:IntegrationOptions;
 /** Dependency for a proven, fail-closed execution broker. Production has no enforcer yet: admission stays blocked. */
 authorizeExecution?:(mission:MissionRecord,config:NexusConfig)=>Promise<{allowed:boolean;maxCostMicroUsd:number;evidence:string}>;
 searchQuoteMicroUsd?:number;configFile?:string;
}
const TERMINAL=new Set(['completed','failed','cancelled','interrupted']);
export async function createNexus(options:NexusOptions){
 if(!options.appToken||options.appToken.length<7)throw new Error('Private APP_TOKEN required.');
 const db=openDb(options.dbFile), state=new NexusState(db),workspace=new Workspace(options.workspaceRoot),memory=new MemoryService(db),knowledge=new KnowledgeVault(db,workspace),integrations=new Integrations(options.integrations);
 let configFileStatus: 'applied'|'failed'|'not_configured'=options.configFile?'applied':'not_configured';
 if(options.configFile)try{ensureDesiredFile(state,options.configFile);}catch{configFileStatus='failed';state.appendEvent('config','config.rejected',{reason:'Desired file invalid or unreadable; last known-good version retained. File preserved.'});}
 const saveConfig=(input:unknown,expectedRevision:number)=>db.transaction(()=>{const version=state.applyConfig(input,expectedRevision);if(options.configFile){saveDesiredFile(options.configFile,version.config);configFileStatus='applied';}return version;}).immediate();
 const approvalWindows=new ApprovalWindows(db);
 const streamClosers=new Set<()=>void>();
 const app=Fastify({bodyLimit:1_048_576,logger:false});const jobs=new Map<string,AbortController>();const backgroundJobs=new Set<Promise<void>>();let closing=false;
 const viewerTickets=new Map<string,number>();
 const expected=createHash('sha256').update(`Bearer ${options.appToken}`).digest();
 app.addHook('onRequest',async(req,reply)=>{const received=createHash('sha256').update(req.headers.authorization??'').digest();if(timingSafeEqual(received,expected))return;const ticket=(req.headers.authorization??'').replace(/^Bearer /,'');const expires=viewerTickets.get(ticket);const route=req.url.split('?')[0];if(expires&&expires>Date.now()&&req.method==='GET'&&[`${prefix}/world/snapshot`,`${prefix}/events`,`${prefix}/events/stream`].includes(route!))return;if(expires&&expires<=Date.now())viewerTickets.delete(ticket);return reply.code(401).send({error:{code:'UNAUTHORIZED',message:'Private Gateway authentication required.'}});});
 app.setErrorHandler((err:Error&{statusCode?:number;code?:string},_req,reply)=>{const status=err instanceof NexusStateError||err instanceof HermesError?err.statusCode:(err.statusCode&&err.statusCode<500?err.statusCode:500);return reply.code(status).send({error:{code:err.code??(status===500?'INTERNAL':'REQUEST_FAILED'),message:status===500?'Internal Gateway error.':err.message}});});
 const prefix='/nexus/v1';
 const requireMission=(id:string)=>{const m=state.getMission(id);if(!m)throw new HermesError('Mission not found.',404);return m;};
 const context=(m:MissionRecord)=>({missionId:m.id,runId:m.runId??undefined,configRevision:m.configRevision});
 const capabilities=async():Promise<EngineCapabilities|null>=>options.engine?options.engine.capabilities().catch(()=>null):null;
 const requireCapability=async(feature:string)=>{const c=await capabilities();if(c?.features[feature]!==true)throw new HermesError(`Hermes capability ${feature} unavailable.`,409);};
 async function reconcile(m:MissionRecord){
  if(!options.engine||!m.runId||TERMINAL.has(m.status))return m;
  try {const r=await options.engine.status(m.runId);if(r.run_id!==m.runId)throw new Error('Run mismatch');const current=requireMission(m.id);if(TERMINAL.has(current.status))return current;let status=normalizeStatus(r.status);if(['stopping','cancel_requested'].includes(current.status)&&status&&!TERMINAL.has(status))status=current.status;if(status)state.updateMission(m.id,{status,detail:r});return requireMission(m.id);}
  catch {state.appendEvent(m.id,'connection.lost',{reason:'Status reconciliation failed; last observed state retained.'},context(m));return requireMission(m.id);}
 }
 function watch(m:MissionRecord){
  if(!options.engine||!m.runId||jobs.has(m.id)||closing||TERMINAL.has(m.status))return;
  const controller=new AbortController();jobs.set(m.id,controller);
  const job=(async()=>{
   const after=state.lastSourceSequence(m.id);
   try{
    for await(const event of options.engine!.events(m.runId!,after,controller.signal)){
     if(controller.signal.aborted)break;const d=event.data;
     if(d.run_id!==m.runId)throw new Error('Run event ownership mismatch');
     const seq=Number(event.id??d.seq);if(!Number.isSafeInteger(seq)||seq<0){state.appendEvent(m.id,'connection.lost',{reason:'Unsequenced source event; reconciliation required.'},context(m));continue;}
     const type=mapEvent(String(d.event),d);if(type==='approval.requested')approvalWindows.observe(m.runId!,d);
     db.transaction(()=>{
      state.appendEvent(m.id,String(d.event).startsWith('run.')?`hermes.${d.event}`:type,{...d,sourceSequence:seq},{...context(m),eventId:`hermes:${m.runId}:${seq}`});
      // State and source evidence commit together; one normalized lifecycle event.
      if(String(d.event).startsWith('run.')){let status=normalizeStatus(String(d.event).slice(4));const current=requireMission(m.id);if(status&&!TERMINAL.has(current.status)){if(['stopping','cancel_requested'].includes(current.status)&&!TERMINAL.has(status))status=current.status;state.updateMission(m.id,{status,detail:d});}}
     }).immediate();
    }
   }catch{if(!controller.signal.aborted)state.appendEvent(m.id,'connection.lost',{reason:'Event source unavailable. Persisted history retained; source gaps are not fabricated.'},context(m));}
   finally{jobs.delete(m.id);if(!closing)await reconcile(requireMission(m.id));}
  })();backgroundJobs.add(job);void job.catch(()=>{}).finally(()=>backgroundJobs.delete(job));
 }
 app.get(`${prefix}/health`,async()=>{const c=await capabilities();return {service:'NEXUS ONE Gateway',engine:{status:c?'connected':'unavailable',capabilities:c,expectedVersion:'v0.22.2',executionStatus:options.authorizeExecution?'broker_configured':'blocked',reason:!c?'Hermes endpoint or credentials unavailable.':'Public Runs API reached. Paid execution remains gated on policy and budget enforcement.'},world:{status:'unavailable',reason:'Purchased Unreal scene and GPU/build evidence not available.'},scheduledAutomations:'stopped',storage:{driver:'sqlite',pgvector:'unavailable'},voice:{status:'unavailable'},budget:state.budget()};});
 app.get(`${prefix}/config`,async()=>({...state.getConfig(),application:{sourceFile:configFileStatus,world:'pending_connection',engine:'next_session'}}));
 app.get(`${prefix}/config/export`,async(_req,reply)=>reply.header('Content-Disposition','attachment; filename="nexus.config.json"').send(state.getConfig().config));
 app.post<{Body:{config:unknown}}>(`${prefix}/config/validate`,async req=>({valid:true,config:state.validateConfig(req.body?.config)}));
 app.post<{Body:{config:unknown;expectedRevision:number}}>(`${prefix}/config/apply`,async req=>{const result=saveConfig(req.body?.config,req.body?.expectedRevision);return{...result,application:{desired:'applied',world:'pending_connection',engine:'next_session',permissions:'enforced_at_admission',restartRequired:false}};});
 app.get(`${prefix}/config/versions`,async()=>({versions:state.listVersions()}));
 app.post<{Body:{revision:number;expectedRevision:number}}>(`${prefix}/config/restore`,async req=>{const old=state.listVersions().find(v=>v.revision===req.body?.revision);if(!old)throw new HermesError('Configuration version not found.',404);return{...saveConfig(old.config,req.body.expectedRevision),application:{desired:'applied',world:'pending_connection',engine:'next_session'}};});
 app.get(`${prefix}/budget`,async()=>({...state.budget(),measurement:'reservations',gpu:{status:'unknown',approved:false},upstreamHardCap:'unverified_execution_blocked'}));
 app.get(`${prefix}/agents`,async()=>({agents:state.getConfig().config.agents.map(a=>({...a,executionStatus:'unverified',delegation:'requires_native_engine_capability_and_policy'}))}));
 app.get(`${prefix}/missions`,async()=>({missions:state.listMissions()}));
 app.post<{Body:{goal:string;agentId:string;requestId:string}}>(`${prefix}/missions`,async(req,reply)=>{
  const body=req.body;if(!body||typeof body.goal!=='string'||!body.goal.trim()||body.goal.length>20000||typeof body.requestId!=='string'||!body.requestId||body.requestId.length>100)throw new HermesError('goal, agentId and bounded requestId are required.',400);
  const {config,revision}=state.getConfig();const a=config.agents.find(a=>a.id===body.agentId&&a.enabled);if(!a)throw new HermesError('Agent disabled or not configured.',403);
  const requestKey=`mission:${body.requestId}`;const existing=state.getMissionByRequestId(requestKey);
  if(existing){if(existing.goal!==body.goal||existing.agentId!==body.agentId)throw new HermesError('requestId already used for a different mission.',409);return reply.code(existing.status==='blocked'?503:200).send({mission:existing});}
  const m=state.createMission({id:randomUUID(),goal:body.goal,agentId:a.id,requestId:requestKey,configRevision:revision});
  const block=(code:string,message:string)=>{state.updateMission(m.id,{status:'blocked',detail:{code,message}});return reply.code(503).send({mission:requireMission(m.id),error:{code,message}});};
  if(!options.engine)return block('ENGINE_UNAVAILABLE','Hermes is not configured. No alternate loop or paid request was started.');
  if(!options.authorizeExecution)return block('EXECUTION_POLICY_UNVERIFIED','Fail-closed tool permissions and upstream budget enforcement are not yet proven. No run submitted.');
  await requireCapability('run_submission');
  const authorization=await options.authorizeExecution(m,config);if(!authorization.allowed||!authorization.evidence)return block('EXECUTION_POLICY_DENIED','Execution broker did not authorize this mission.');
  state.reserve(m.id,authorization.maxCostMicroUsd);state.updateMission(m.id,{status:'starting',detail:{enforcementEvidence:authorization.evidence}});
  try{
   const model=config.models.find(model=>model.id===a.modelRef);
   const run=await options.engine.start({input:m.goal,instructions:a.systemPrompt,...(model?.model&&model.model!=='default'?{model:model.model}:{})},m.requestId);
   if(typeof run.run_id!=='string'||!run.run_id)throw new Error('Invalid run identity.');
   state.updateMission(m.id,{runId:run.run_id,status:normalizeStatus(run.status)??'starting',detail:run});memory.ensureSession(run.run_id,{missionId:m.id,agentId:a.id});memory.appendMessage(run.run_id,'user',m.goal);
   watch(requireMission(m.id));return reply.code(202).send({mission:requireMission(m.id)});
  }catch{state.appendEvent(m.id,'connection.lost',{reason:'Submission outcome unknown. Reservation retained. No automatic resubmission.'},context(m));return reply.code(503).send({mission:requireMission(m.id),error:{code:'SUBMISSION_UNKNOWN',message:'Run outcome unknown; retained request identity and budget reservation require reconciliation.'}});}
 });
 app.get<{Params:{id:string}}>(`${prefix}/missions/:id`,async req=>{const m=await reconcile(requireMission(req.params.id));watch(m);return{mission:m};});
 app.post<{Params:{id:string}}>(`${prefix}/missions/:id/stop`,async req=>{
  let m=requireMission(req.params.id);if(TERMINAL.has(m.status))return{mission:m};if(!m.runId||!options.engine)throw new HermesError('No bound Hermes run to stop.',409);
  await requireCapability('run_stop');state.updateMission(m.id,{status:'cancel_requested'});state.appendEvent(m.id,'mission.cancel_requested',{confirmed:false},context(m));
  const ack=await options.engine.stop(m.runId);state.updateMission(m.id,{status:normalizeStatus(ack.status)??'cancel_requested',detail:ack});m=await reconcile(requireMission(m.id));return{mission:m,stopConfirmed:['cancelled','interrupted'].includes(m.status),terminalObserved:TERMINAL.has(m.status)};
 });
 app.post<{Params:{id:string};Body:{input:string}}>(`${prefix}/missions/:id/steer`,async req=>{
  const m=await reconcile(requireMission(req.params.id));if(!m.runId||m.status!=='running'||!options.engine)throw new HermesError('Mission is not accepting guidance.',409);await requireCapability('run_steer');const input=req.body?.input;if(typeof input!=='string'||!input.trim()||input.length>10000)throw new HermesError('Bounded guidance input required.',400);
  const ack=await options.engine.steer(m.runId,input);state.appendEvent(m.id,'mission.steer_requested',{accepted:true,appliesAt:'next_supported_boundary'},context(m));return{ack,applied:false,mission:m};
 });
 app.post<{Params:{id:string};Body:{approvalId:string;decision:'once'|'deny'}}>(`${prefix}/missions/:id/approval`,async req=>{
  const m=await reconcile(requireMission(req.params.id));const body=req.body;
  if(!m.runId||!options.engine||!['once','deny'].includes(body?.decision))throw new HermesError('Exact once/deny approval required.',400);
  await requireCapability('run_approval_response');const detail=m.detail as RunState;const approval=detail?.approval;
  if(m.status!=='waiting_for_approval'||!approval||approval.request_id!==body.approvalId)throw new HermesError('Exact pending approval does not match this run.',409);
  approvalWindows.observe(m.runId,approval);const reservation=approvalWindows.reserve(m.runId,body.approvalId,body.decision);if(!reservation.forward)return{mission:m,decisionState:reservation.state,forwarded:false};
  const ack=await options.engine.approval(m.runId,body.approvalId,body.decision);approvalWindows.resolved(m.runId,body.approvalId);state.appendEvent(m.id,'approval.resolved',{approvalId:body.approvalId,decision:body.decision,ack},context(m));return{mission:await reconcile(m),ack};
 });
 app.post(`${prefix}/emergency-stop`,async()=>{
  const results=[];for(const m of state.activeMissions().filter(m=>m.runId||m.status==='starting')){try{if(!m.runId||!options.engine)throw new HermesError('Submission outcome unknown; cannot confirm stop.',409);await requireCapability('run_stop');state.updateMission(m.id,{status:'cancel_requested'});await options.engine!.stop(m.runId!);results.push({mission:await reconcile(requireMission(m.id)),requested:true});}catch{results.push({mission:m,requested:false,reason:'Stop request unavailable or failed.'});}}return{results,allConfirmed:results.every(r=>TERMINAL.has(r.mission.status))};
 });
 app.get<{Querystring:{streamId?:string;after?:string}}>(`${prefix}/events`,async req=>({events:state.events(req.query.streamId??'global',cursor(req.query.after)),mode:'read-only',toolsReexecuted:false}));
 app.get<{Querystring:{streamId?:string;after?:string}}>(`${prefix}/events/stream`,async(req,reply)=>{
  let after=cursor(req.query.after);const stream=req.query.streamId??'global';reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','X-Accel-Buffering':'no'});reply.raw.write(': connected\n\n');
  const viewerTicket=(req.headers.authorization??'').replace(/^Bearer /,'');const viewerDeadline=viewerTickets.get(viewerTicket);
  const send=()=>{if(viewerDeadline&&Date.now()>=viewerDeadline){reply.raw.end();return;}for(const event of state.events(stream,after)){if(!reply.raw.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`)){reply.raw.end();return;}after=event.sequence;}};send();const interval=setInterval(send,1000);const keepalive=setInterval(()=>reply.raw.write(': keepalive\n\n'),10000);const end=()=>reply.raw.end();streamClosers.add(end);reply.raw.on('close',()=>{clearInterval(interval);clearInterval(keepalive);streamClosers.delete(end);});
 });
 app.get(`${prefix}/integrations`,async()=>({integrations:integrations.list()}));
 app.post<{Params:{id:string}}>(`${prefix}/integrations/:id/test`,async req=>integrations.test(req.params.id));
 app.post<{Body:{query:string;requestId:string}}>(`${prefix}/search`,async(req,reply)=>{
  if(!options.integrations?.tavilyKey)throw new HermesError('Web search unavailable: TAVILY_API_KEY missing.');
  const config=state.getConfig().config;const research=config.agents.find(a=>a.id==='research'&&a.enabled);if(!research?.toolAllowlist.includes('web_search')||!config.integrations.some(i=>i.kind==='web_search'&&i.enabled))throw new HermesError('Web search disabled by agent or integration permissions.',403);
  if(!Number.isSafeInteger(options.searchQuoteMicroUsd)||options.searchQuoteMicroUsd!<=0)throw new HermesError('Search blocked: provider price quote and cost reservation are required.');
  if(!req.body||typeof req.body.query!=='string'||!req.body.query.trim()||req.body.query.length>2000||typeof req.body.requestId!=='string'||!req.body.requestId||req.body.requestId.length>100)throw new HermesError('Bounded query and unique requestId required.',400);
  const requestKey=`search:${req.body.requestId}`;const old=state.getMissionByRequestId(requestKey);if(old){if(old.goal!==req.body.query)throw new HermesError('requestId conflict.',409);return{mission:old,result:old.detail};}
  const {revision}=state.getConfig();const m=state.createMission({id:randomUUID(),goal:req.body.query,agentId:'research',requestId:requestKey,configRevision:revision});state.reserve(m.id,options.searchQuoteMicroUsd!);state.updateMission(m.id,{status:'running'});state.appendEvent(m.id,'tool.called',{tool:'web_search'},context(m));
  try{const result=await integrations.search(req.body.query);state.appendEvent(m.id,'tool.result',{tool:'web_search',result},context(m));state.updateMission(m.id,{status:'completed',detail:result});return{mission:requireMission(m.id),result,cost:{source:'operator_quote',measurement:'estimated',reservedMicroUsd:options.searchQuoteMicroUsd,settled:false}};}catch{state.updateMission(m.id,{status:'failed',detail:{reason:'Search failed; possible cost remains reserved.'}});return reply.code(503).send({mission:requireMission(m.id),error:{code:'SEARCH_FAILED'}});}
 });
 app.get(`${prefix}/knowledge`,async()=>({documents:knowledge.list(),embeddingStatus:'unavailable',retrieval:'lexical'}));
 app.post<{Body:{source:string;allowedAgents:string[]}}>(`${prefix}/knowledge`,async req=>knowledge.ingest(req.body?.source,req.body?.allowedAgents));
 app.post<{Params:{id:string}}>(`${prefix}/knowledge/:id/archive`,async req=>knowledge.archive(req.params.id));
 app.get<{Querystring:{agentId:string;query:string}}>(`${prefix}/knowledge/search`,async req=>({results:knowledge.search(req.query.agentId,req.query.query),retrieval:'lexical'}));
 app.get<{Params:{sessionId:string}}>(`${prefix}/memory/:sessionId`,async req=>({messages:memory.listSession(req.params.sessionId),scope:'conversational_memory',rag:false}));
 app.post(`${prefix}/world/viewer-ticket`,async()=>{for(const [key,deadline]of viewerTickets)if(deadline<=Date.now())viewerTickets.delete(key);if(viewerTickets.size>=100)throw new HermesError('Viewer ticket limit reached.',429);const token=randomUUID()+randomUUID();const expiresAt=Date.now()+60_000;viewerTickets.set(token,expiresAt);return{token,expiresAt:new Date(expiresAt).toISOString(),scope:'world:read',executionAllowed:false};});
 app.get(`${prefix}/world/snapshot`,async()=>{const cfg=state.getConfig();return{bridgeVersion:WORLD_BRIDGE_VERSION,sceneManifest:SCENE_MANIFEST,config:cfg,missions:state.listMissions(),connection:'unavailable',worldBuildVerified:false,director:state.events('global',0).map(e=>directEvent(e,cfg.config)),capabilities:{sensitiveToolExecution:false,replay:'read-only',scenes:['SKY_SANCTUARY','FUTURE_MEGACITY','COSMIC_OBSERVATORY']}};});
 // Recover observation only; never replay tools or resubmit an uncertain mission.
 for(const m of state.activeMissions()) { watch(m); if(m.runId){const recovery=reconcile(m).then(()=>{});backgroundJobs.add(recovery);void recovery.finally(()=>backgroundJobs.delete(recovery));} }
 return{app,state,knowledge,integrations,workspace,close:async()=>{closing=true;for(const c of jobs.values())c.abort();jobs.clear();for(const end of streamClosers)end();streamClosers.clear();await Promise.allSettled([...backgroundJobs]);await app.close();memory.close();db.close();}};
}
function cursor(raw:string|undefined){if(raw===undefined)return 0;const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw new HermesError('Invalid event cursor.',400);return n;}
function normalizeStatus(status:string){if(status==='queued')return 'starting';return ['starting','running','waiting_for_approval','stopping','completed','failed','cancelled','interrupted'].includes(status)?status:null;}
function mapEvent(type:string,d:Record<string,unknown>){const map:Record<string,string>={'run.queued':'mission.created','run.running':'mission.started','run.completed':'mission.completed','run.failed':'mission.failed','run.cancelled':'mission.cancelled','run.interrupted':'mission.failed','tool.started':'tool.called','tool.completed':d.error?'tool.failed':'tool.result','approval.request':'approval.requested','approval.responded':'approval.resolved','subagent.start':'agent.started','subagent.complete':'agent.completed','replay.truncated':'connection.lost'};return map[type]??`hermes.${type}`;}
