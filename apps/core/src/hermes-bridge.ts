import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
import type Database from "better-sqlite3";
import type {FastifyInstance,FastifyRequest} from "fastify";
import {
  ActionBrokerEnforcer,actionDigest,computeIntentHash,
  type ActionEnvelope,type ApprovalContext,type FrozenRegistrySpec,type LockedActionIntent
} from "./security/action-broker.js";
import type {SqliteActionStore} from "./security/sqlite-action-store.js";
import {canonicalize,type JsonValue} from "./security/canonical.js";
import type {DeviceIdentity,DeviceSessions} from "./security/device-session.js";
import type {Store} from "./store.js";

/**
 * Demo-only Hermes boundary. The plugin can PROPOSE and POLL only.
 * The iPhone signs a new 90-second review snapshot on demand.
 * NO Hermes native approval, NO n8n/email dispatch, NO automatic resume.
 */
export interface HermesBridgeOptions {
  baseUrl:string;
  apiKey:string;
  proposalKey:string;
  /** Mock-only transport. Live Hermes runs remain BLOCKED. */
  transport?:typeof fetch;
}
interface Params {
  app:FastifyInstance;db:Database.Database;store:Store;
  devices:DeviceSessions;brokerStore:SqliteActionStore;
  deviceOwner:(req:FastifyRequest)=>DeviceIdentity;
  options:HermesBridgeOptions;now:()=>number;
}
type Launch={mission_id:string;run_id:string|null;owner_id:string;device_id:string;
  conversation_id:string;request_id:string;input_digest:string;created_at:number};
type Proposed={action_id:string;run_id:string;call_id:string;owner_id:string;
  device_id:string;payload_digest:string;intent_hash:string|null;decision:string|null;
  intent_json:string|null;deadline_at:number|null;created_at:number|null};
type MissionRun={mission_id:string;session_id:string;run_id:string|null;
  state:"STARTING"|"ACTIVE"|"AWAITING_SIGNATURE"|"COMPLETED"|"REVOKED";
  proposals_count:number;max_proposals:number;created_at:number};
type Preview={proposal_id:string;broker_action_id:string;created_at:number};
type Proposal={sessionId:string;runId?:string;callId:string;serviceId:string;
  operation:string;destination:string;arguments:Record<string,JsonValue>};
const PROPOSAL_TTL_MS=2*60*60*1000;
const SIGNATURE_TTL_MS=90_000;
const REGISTRY_VERSION="nexus-demo-registry-v1";

const DEMO_WORKFLOWS:Readonly<Record<string,{
 displayName:string;description:string;declaredEffects:readonly string[];
 allowedKeys:readonly string[];
}>>=Object.freeze({
 "workflow_demo_001":Object.freeze({
   displayName:"NEXUS test workflow — NOT LINKED TO n8n",
   description:"Simulates an n8n workflow request locally. No email, file, payment or cloud action.",
   declaredEffects:Object.freeze(["NONE: demo receipt only, external execution disabled"]),
   allowedKeys:Object.freeze(["text"]),
 })
});
function fail(code:string):never{throw new Error("SECURITY_REJECT: "+code);}
function id(v:unknown):v is string{
 return typeof v==="string"&&/^[A-Za-z0-9_-]{8,100}$/.test(v);
}
function runId(v:unknown):v is string{
 return typeof v==="string"&&/^[A-Za-z0-9_-]{4,128}$/.test(v);
}
function sha(s:string):string{return createHash("sha256").update(s,"utf8").digest("hex");}
function same(a:string,b:string):boolean{
 return timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
}
export function validBridgeBearer(header:unknown,key:string):boolean{
 return typeof header==="string"&&header.startsWith("Bearer ")&&key.length>=32&&same(header.slice(7),key);
}
export function isHermesProposalRoute(method:string,path:string):boolean{
 return (method==="POST"&&path==="/v1/hermes/bridge/actions")||
   (method==="GET"&&/^\/v1\/hermes\/bridge\/actions\/[A-Za-z0-9_-]{8,100}$/.test(path));
}
function checkedUrl(raw:string):string{
 const u=new URL(raw);
 if(u.username||u.password||u.search||u.hash||u.pathname!=="/")fail("INVALID_HERMES_BASE_URL");
 if(u.protocol!=="https:"&&!(u.protocol==="http:"&&
   ["localhost","127.0.0.1","[::1]"].includes(u.hostname)))fail("HERMES_URL_REQUIRES_HTTPS");
 return u.origin;
}
function registry(p:Pick<Proposal,"serviceId"|"operation"|"destination"|"arguments">){
 if(p.serviceId!=="n8n"||p.operation!=="trigger_workflow")fail("OPERATION_NOT_ALLOWLISTED");
 const entry=DEMO_WORKFLOWS[p.destination];
 if(!entry)fail("WORKFLOW_NOT_REGISTERED");
 const keys=Object.keys(p.arguments).sort();
 if(JSON.stringify(keys)!==JSON.stringify([...entry.allowedKeys].sort())||
    typeof p.arguments.text!=="string"||(p.arguments.text as string).length>256)
   fail("WORKFLOW_ARGUMENT_SCHEMA_DENIED");
 return entry;
}
function freezeRegistry(p:Pick<Proposal,"serviceId"|"operation"|"destination"|"arguments">):FrozenRegistrySpec{
 const entry=registry(p);
 // This is a local no-effect demonstration definition, NOT a verified n8n Cloud digest.
 return {
   registryVersion:REGISTRY_VERSION,title:entry.displayName,
   humanSummary:entry.description,declaredSideEffects:[...entry.declaredEffects],
   riskLevel:"L0",allowedKeys:[...entry.allowedKeys],
   workflowConfigDigest:"UNVERIFIED_NO_REMOTE_N8N_CONFIGURATION",
   registryTrust:"DEMO_UNVERIFIED"
 };
}
function parseProposal(v:unknown):Proposal{
 if(!v||typeof v!=="object"||Array.isArray(v))fail("INVALID_PROPOSAL");
 const x=v as Record<string,unknown>;
 const fields=Object.keys(x).sort();
 const required=["sessionId","callId","serviceId","operation","destination","arguments"].sort();
 const withRun=[...required,"runId"].sort();
 if(JSON.stringify(fields)!==JSON.stringify(required)&&
    JSON.stringify(fields)!==JSON.stringify(withRun))fail("INVALID_PROPOSAL_FIELDS");
 if(!id(x.sessionId)||(x.runId!==undefined&&!runId(x.runId))||
    !id(x.callId)||typeof x.serviceId!=="string"||
    typeof x.operation!=="string"||typeof x.destination!=="string"||
    !x.arguments||typeof x.arguments!=="object"||Array.isArray(x.arguments))
   fail("INVALID_PROPOSAL");
 const canonical=canonicalize(x.arguments);
 if(Buffer.byteLength(canonical,"utf8")>16_384)fail("PROPOSAL_TOO_LARGE");
 return {sessionId:x.sessionId,...(x.runId?{runId:x.runId}:{}),
   callId:x.callId,serviceId:x.serviceId,operation:x.operation,destination:x.destination,
   arguments:JSON.parse(canonical) as Record<string,JsonValue>};
}
function readIntent(row:Proposed):LockedActionIntent{
 // Do not retrofit legacy V2 rows with a fabricated/unstable registry snapshot.
 if(!row.intent_json||!row.deadline_at||!row.intent_hash)fail("LEGACY_PROPOSAL_QUARANTINED");
 const intent=JSON.parse(row.intent_json) as LockedActionIntent;
 if(computeIntentHash(intent)!==row.intent_hash||row.payload_digest!==row.intent_hash||
    intent.proposalId!==row.action_id||intent.runId!==row.run_id||
    intent.callId!==row.call_id||intent.ownerId!==row.owner_id||
    intent.deviceId!==row.device_id||intent.proposalDeadlineAt!==row.deadline_at||
    intent.proposalCreatedAt!==row.created_at||
    intent.effectIdempotencyKey!=="nexus_"+row.action_id)
   fail("PROPOSAL_TAMPERED");
 return intent;
}
export function registerHermesBridge(p:Params):void{
 const {app,db,store,devices,brokerStore,deviceOwner,options,now}=p;
 const base=checkedUrl(options.baseUrl);
 if(options.apiKey.length<24||options.proposalKey.length<32)throw new Error("HERMES_BRIDGE_KEYS_TOO_SHORT");
 const transport=options.transport??fetch;
 db.exec(
   "CREATE TABLE IF NOT EXISTS hermes_launches("+
   "mission_id TEXT PRIMARY KEY,run_id TEXT UNIQUE,owner_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
   "conversation_id TEXT NOT NULL,request_id TEXT UNIQUE NOT NULL,input_digest TEXT NOT NULL,"+
   "created_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS mission_runs("+
   "mission_id TEXT PRIMARY KEY REFERENCES hermes_launches(mission_id),"+
   "session_id TEXT NOT NULL,run_id TEXT UNIQUE,"+
   "state TEXT NOT NULL CHECK(state IN ('STARTING','ACTIVE','AWAITING_SIGNATURE','COMPLETED','REVOKED')),"+
   "proposals_count INTEGER NOT NULL DEFAULT 0 CHECK(proposals_count>=0),"+
   "max_proposals INTEGER NOT NULL DEFAULT 3 CHECK(max_proposals BETWEEN 1 AND 10),"+
   "created_at INTEGER NOT NULL);"+
   "CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_run_per_session "+
     "ON mission_runs(session_id) WHERE state IN ('STARTING','ACTIVE','AWAITING_SIGNATURE');"+
   "CREATE TABLE IF NOT EXISTS hermes_action_proposals("+
   "action_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES hermes_launches(run_id),"+
   "call_id TEXT NOT NULL,owner_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
   "payload_digest TEXT NOT NULL,decision TEXT CHECK(decision IN ('REJECTED','DEMO_VERIFIED')),"+
   "intent_hash TEXT,intent_json TEXT,deadline_at INTEGER,created_at INTEGER,"+
   "UNIQUE(run_id,call_id));"+
   "CREATE TABLE IF NOT EXISTS hermes_proposal_previews("+
   "proposal_id TEXT NOT NULL REFERENCES hermes_action_proposals(action_id),"+
   "broker_action_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS hermes_preview_lookup ON hermes_proposal_previews(proposal_id,created_at);"+
   "CREATE TABLE IF NOT EXISTS hermes_continuation_outbox("+
   "proposal_id TEXT PRIMARY KEY REFERENCES hermes_action_proposals(action_id),"+
   "run_id TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('REJECTED','DEMO_VERIFIED')),"+
   "receipt_digest TEXT,created_at INTEGER NOT NULL);"
 );
 // Existing PR #9 demo data has no trustworthy immutable intent or deadline.
 // Preserve but quarantine these old records instead of guessing new authority.
 const fields=(db.pragma("table_info(hermes_action_proposals)") as {name:string}[]).map(f=>f.name);
 for(const col of ["intent_hash TEXT","intent_json TEXT","deadline_at INTEGER","created_at INTEGER"]){
   if(!fields.includes(col.split(" ")[0]))db.exec("ALTER TABLE hermes_action_proposals ADD COLUMN "+col);
 }
 const launchByRun=(id:string):Launch|undefined=>
   db.prepare("SELECT * FROM hermes_launches WHERE run_id=?").get(id) as Launch|undefined;
 const missionBySession=(sessionId:string):MissionRun|undefined=>
   db.prepare("SELECT * FROM mission_runs WHERE session_id=?"+
     " AND state IN ('STARTING','ACTIVE','AWAITING_SIGNATURE')").get(sessionId) as MissionRun|undefined;
 const missionByRun=(runIdValue:string):MissionRun|undefined=>
   db.prepare("SELECT * FROM mission_runs WHERE run_id=?").get(runIdValue) as MissionRun|undefined;
 const proposed=(id:string):Proposed|undefined=>
   db.prepare("SELECT * FROM hermes_action_proposals WHERE action_id=?").get(id) as Proposed|undefined;
 const latest=(id:string):Preview|undefined=>
   db.prepare("SELECT * FROM hermes_proposal_previews WHERE proposal_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1")
    .get(id) as Preview|undefined;

 function policy(intent:{serviceId:string;operation:string;destination:string;
   arguments:Record<string,JsonValue>;approvalContext?:ApprovalContext}):boolean{
   try{
     const entry=registry(intent);
     const c=intent.approvalContext;
     if(!c||c.source!=="hermes"||c.registryVersion!==REGISTRY_VERSION||
       c.registryTrust!=="DEMO_UNVERIFIED"||
       c.workflowDisplayName!==entry.displayName||c.workflowDescription!==entry.description||
       JSON.stringify(c.declaredEffects)!==JSON.stringify(entry.declaredEffects)||
       c.workflowConfigDigest!=="UNVERIFIED_NO_REMOTE_N8N_CONFIGURATION"||
       c.effectIdempotencyKey!=="nexus_"+c.proposalId)return false;
     const row=proposed(c.proposalId);
     if(!row||!row.deadline_at||row.run_id!==c.runId||row.call_id!==c.callId||
       row.deadline_at!==c.proposalDeadlineAt)return false;
     const p=readIntent(row);
     return p.serviceId===intent.serviceId&&p.operation===intent.operation&&
       p.destination===intent.destination&&
       canonicalize(p.arguments)===canonicalize(intent.arguments);
   }catch{return false;}
 }
 function enforcer(deviceId:string):ActionBrokerEnforcer{
   const device=devices.getDevice(deviceId);
   if(!device||device.revoked)fail("DEVICE_REVOKED");
   return new ActionBrokerEnforcer(brokerStore,new Map([[deviceId,device]]),
     {dispatch:async(e)=>({confirmedReceipt:"DEMO_ONLY_NO_EFFECT:"+actionDigest(e)})},
     policy,now);
 }
 function authorizedPlugin(req:FastifyRequest):void{
   if(!validBridgeBearer(req.headers.authorization,options.proposalKey))fail("HERMES_PLUGIN_AUTH");
 }
 function owned(proposalId:string,who:DeviceIdentity):Proposed{
   const row=proposed(proposalId);
   if(!row||row.owner_id!==who.ownerId||row.device_id!==who.deviceId)fail("PROPOSAL_NOT_OWNED");
   if(!row.deadline_at||!row.intent_json)fail("LEGACY_PROPOSAL_QUARANTINED");
   const run=launchByRun(row.run_id);
   if(!run||run.owner_id!==who.ownerId||run.device_id!==who.deviceId)fail("RUN_NOT_OWNED");
   readIntent(row);return row;
 }
 function currentPreview(row:Proposed):{preview:Preview;envelope:ActionEnvelope;state:string;receipt?:string}|undefined{
   const preview=latest(row.action_id);
   if(!preview)return;
   const record=brokerStore.find(preview.broker_action_id);
   if(!record||record.envelope.approvalContext?.proposalId!==row.action_id||
      record.envelope.approvalContext?.runId!==row.run_id||
      record.envelope.approvalContext?.callId!==row.call_id)fail("PREVIEW_TAMPERED");
   return {preview,envelope:record.envelope,state:record.status,receipt:record.receipt};
 }
 function completeDemo(row:Proposed,receipt:string,envelope:ActionEnvelope):void{
   // Repair a crash after broker confirmed but before projection/outbox update.
   if(receipt!=="DEMO_ONLY_NO_EFFECT:"+actionDigest(envelope))fail("BROKER_RECEIPT_MISMATCH");
   db.transaction(()=>{
     db.prepare("UPDATE hermes_action_proposals SET decision='DEMO_VERIFIED' "+
       "WHERE action_id=? AND decision IS NULL").run(row.action_id);
     db.prepare("INSERT OR IGNORE INTO hermes_continuation_outbox"+
       "(proposal_id,run_id,outcome,receipt_digest,created_at) VALUES(?,?,?,?,?)")
       .run(row.action_id,row.run_id,"DEMO_VERIFIED",sha(receipt),now());
   })();
 }
 function proposalStatus(row:Proposed):string{
   if(!row.intent_json||!row.deadline_at)return "LEGACY_QUARANTINED";
   if(row.decision==="REJECTED")return "REJECTED";
   const curr=currentPreview(row);
   if(curr?.state==="COMPLETED"){
     if(!curr.receipt)return "OUTCOME_UNKNOWN";
     completeDemo(row,curr.receipt,curr.envelope);
     return "DEMO_VERIFIED_NO_EFFECT";
   }
   if(row.decision==="DEMO_VERIFIED")return "DEMO_VERIFIED_NO_EFFECT";
   if(curr&&(curr.state==="EXECUTING"||curr.state==="UNKNOWN"))return "OUTCOME_UNKNOWN";
   if(now()>=row.deadline_at)return "EXPIRED";
   return "PENDING_USER_SIGNATURE_ON_IPHONE";
 }
 function error(reply:{code:(n:number)=>{send:(v:unknown)=>unknown}},e:unknown):unknown{
   const message=e instanceof Error?e.message:"HERMES_BRIDGE_ERROR";
   const status=message.startsWith("HERMES_UNAVAILABLE:")?502:
      message.startsWith("SECURITY_REJECT:")?403:409;
   return reply.code(status).send({error:{code:"HERMES_BRIDGE_DENIED",message:message.slice(0,105)}});
 }
 async function hermes(path:string,method:"GET"|"POST",body?:unknown,idem?:string):Promise<Record<string,unknown>>{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
   try{
     if(method==="POST"&&path==="/v1/runs"&&!options.transport)
       fail("LIVE_HERMES_RUN_START_BLOCKED_UNTIL_SANDBOX_VERIFIED");
     const response=await transport(base+path,{method,redirect:"error",signal:ctrl.signal,
       headers:{"Authorization":"Bearer "+options.apiKey,"Content-Type":"application/json",
         ...(idem?{"Idempotency-Key":idem}:{})},
       ...(body===undefined?{}:{body:JSON.stringify(body)})});
     if(!response.ok)throw new Error("HERMES_UNAVAILABLE: HTTP_"+response.status);
     const out=await response.json() as unknown;
     if(!out||typeof out!=="object"||Array.isArray(out))fail("INVALID_HERMES_RESPONSE");
     return out as Record<string,unknown>;
   }catch(e){
     if(e instanceof Error&&(/^(SECURITY_REJECT|HERMES_UNAVAILABLE):/.test(e.message)))throw e;
     throw new Error("HERMES_UNAVAILABLE: REQUEST_FAILED");
   }finally{clearTimeout(timer);}
 }
 app.post("/v1/hermes/runs",async(req,reply)=>{
   try{
     const who=deviceOwner(req);
     const b=req.body as {requestId?:unknown;conversationId?:unknown;input?:unknown}|null;
     if(!id(b?.requestId)||!id(b?.conversationId)||
       typeof b?.input!=="string"||!b.input.trim()||b.input.length>4000)fail("INVALID_RUN_REQUEST");
     // Check BEFORE durable reservation: blocked live start must not strand a run.
     if(!options.transport)fail("LIVE_HERMES_RUN_START_BLOCKED_UNTIL_SANDBOX_VERIFIED");
     const digest=sha(b.input);
     const previous=db.prepare("SELECT * FROM hermes_launches WHERE request_id=?").get(b.requestId) as Launch|undefined;
     if(previous){
       if(previous.owner_id!==who.ownerId||previous.device_id!==who.deviceId||
          previous.conversation_id!==b.conversationId||previous.input_digest!==digest)fail("RUN_REQUEST_CONFLICT");
       if(!previous.run_id)fail("RUN_START_OUTCOME_UNKNOWN_RECONCILE_MANUALLY");
       return {mode:"DEMO_NO_EXECUTION",missionId:previous.mission_id,runId:previous.run_id,replayed:true};
     }
     const missionId=randomUUID();
     db.transaction(()=>{
       devices.claimConversation(b.conversationId as string,who.ownerId);
       store.ensureConversation(b.conversationId as string);
       db.prepare("INSERT INTO hermes_launches"+
         "(mission_id,run_id,owner_id,device_id,conversation_id,request_id,input_digest,created_at)"+
         " VALUES(?,NULL,?,?,?,?,?,?)")
         .run(missionId,who.ownerId,who.deviceId,b.conversationId,b.requestId,digest,now());
     })();
     const idem=sha("nexus-hermes-run-v1:"+who.ownerId+":"+b.requestId);
     const out=await hermes("/v1/runs","POST",{input:b.input,session_id:b.conversationId},idem);
     if(!runId(out.run_id))fail("INVALID_HERMES_RUN_ID");
     db.prepare("UPDATE hermes_launches SET run_id=? WHERE mission_id=? AND run_id IS NULL")
       .run(out.run_id,missionId);
     return reply.code(202).send({mode:"DEMO_NO_EXECUTION",missionId,runId:out.run_id,replayed:false});
   }catch(e){return error(reply,e);}
 });
 app.get<{Params:{runId:string}}>("/v1/hermes/runs/:runId",async(req,reply)=>{
   try{
     const who=deviceOwner(req),row=launchByRun(req.params.runId);
     if(!row||row.owner_id!==who.ownerId||row.device_id!==who.deviceId)fail("RUN_NOT_OWNED");
     const out=await hermes("/v1/runs/"+encodeURIComponent(row.run_id!),"GET");
     return {missionId:row.mission_id,runId:row.run_id,
       workerStatus:typeof out.status==="string"?out.status:"UNKNOWN",
       authority:"GATEWAY_FOR_ACTIONS"};
   }catch(e){return error(reply,e);}
 });
 app.post("/v1/hermes/bridge/actions",async(req,reply)=>{
   try{
     authorizedPlugin(req);
     const x=parseProposal(req.body);
     const run=launchByRun(x.runId);
     if(!run)fail("UNREGISTERED_RUN");
     const digest=sha("NEXUS-PROPOSAL-V2\n"+canonicalProposal(x));
     const found=db.prepare("SELECT * FROM hermes_action_proposals WHERE run_id=? AND call_id=?")
       .get(x.runId,x.callId) as Proposed|undefined;
     if(found){
       if(found.payload_digest!==digest)fail("TOOL_CALL_CHANGED");
       return {actionId:found.action_id,proposalId:found.action_id,
         status:proposalStatus(found),deadlineAt:found.deadline_at,execution:"NONE",replayed:true};
     }
     const count=db.prepare("SELECT COUNT(*) AS n FROM hermes_action_proposals WHERE run_id=?")
       .get(x.runId) as {n:number};
     if(count.n>=3)fail("RUN_PROPOSAL_LIMIT");
     const proposalId=randomUUID(),deadlineAt=now()+PROPOSAL_TTL_MS;
     db.prepare("INSERT INTO hermes_action_proposals"+
       "(action_id,run_id,call_id,owner_id,device_id,payload_digest,decision,intent_json,deadline_at,created_at)"+
       " VALUES(?,?,?,?,?,?,NULL,?,?,?)")
       .run(proposalId,x.runId,x.callId,run.owner_id,run.device_id,
          digest,canonicalize(x),deadlineAt,now());
     store.audit("HERMES_PROPOSAL_RECORDED",{taskId:run.mission_id,actionId:proposalId},
       {runId:x.runId,callId:x.callId,payloadDigest:digest,deadlineAt,mode:"DEMO_ONLY"});
     // Return promptly; no HTTP request hangs while waiting for the phone.
     return reply.code(202).send({actionId:proposalId,proposalId,
       status:"PENDING_USER_SIGNATURE_ON_IPHONE",deadlineAt,execution:"NONE",replayed:false});
   }catch(e){return error(reply,e);}
 });
 app.get<{Params:{actionId:string}}>("/v1/hermes/bridge/actions/:actionId",async(req,reply)=>{
   try{
     authorizedPlugin(req);
     const row=proposed(req.params.actionId);
     if(!row)fail("UNKNOWN_PROPOSAL");
     const status=proposalStatus(row);
     return {actionId:row.action_id,status,execution:"NONE",
       deadlineAt:row.deadline_at,continuationMode:"ASYNC_POLL_ONLY_NO_AUTO_RESUME"};
   }catch(e){return error(reply,e);}
 });
 app.get("/v1/hermes/approvals",async(req,reply)=>{
   try{
     const who=deviceOwner(req);
     const rows=db.prepare("SELECT * FROM hermes_action_proposals WHERE owner_id=? AND device_id=?"+
       " AND decision IS NULL ORDER BY rowid").all(who.ownerId,who.deviceId) as Proposed[];
     const items=rows.flatMap(r=>{
       if(proposalStatus(r)!=="PENDING_USER_SIGNATURE_ON_IPHONE")return [];
       const x=readIntent(r),workflow=registry(x);
       return [{actionId:r.action_id,proposalId:r.action_id,runId:r.run_id,
         mode:"DEMO_NO_EXECUTION",deadlineAt:r.deadline_at,displayName:workflow.displayName,
         description:workflow.description,declaredEffects:workflow.declaredEffects,
         destination:x.destination,operation:x.operation}];
     });
     return {items};
   }catch(e){return error(reply,e);}
 });
 app.post<{Params:{actionId:string}}>("/v1/hermes/approvals/:actionId/preview",async(req,reply)=>{
   try{
     const who=deviceOwner(req),row=owned(req.params.actionId,who);
     if(proposalStatus(row)!=="PENDING_USER_SIGNATURE_ON_IPHONE")fail("PROPOSAL_NOT_PENDING");
     const prev=currentPreview(row);
     if(prev&&prev.state==="PENDING"&&now()>=prev.envelope.issuedAt&&now()<prev.envelope.expiresAt)
       return {mode:"DEMO_NO_EXECUTION",proposalId:row.action_id,
         envelope:prev.envelope,canonicalPayloadHash:prev.envelope.canonicalPayloadHash,
         digest:actionDigest(prev.envelope),deadlineAt:row.deadline_at,reused:true};
     const x=readIntent(row),entry=registry(x);
     const launch=launchByRun(row.run_id);
     if(!launch||!row.deadline_at)fail("UNREGISTERED_RUN");
     const context:ApprovalContext={
       source:"hermes",proposalId:row.action_id,runId:row.run_id,callId:row.call_id,
       registryVersion:REGISTRY_VERSION,registryTrust:"DEMO_UNVERIFIED",
       workflowDisplayName:entry.displayName,workflowDescription:entry.description,
       declaredEffects:[...entry.declaredEffects],
       workflowConfigDigest:"UNVERIFIED_NO_REMOTE_N8N_CONFIGURATION",
       effectIdempotencyKey:"nexus_"+row.action_id,proposalDeadlineAt:row.deadline_at
     };
     const envelope=db.transaction(()=>{
       const issued=enforcer(row.device_id).issue({
         taskId:launch.mission_id,ownerId:row.owner_id,deviceId:row.device_id,
         serviceId:x.serviceId,operation:x.operation,destination:x.destination,arguments:x.arguments,
         policyVersion:"hermes-demo-no-effect-v2",
         ttlMs:Math.min(SIGNATURE_TTL_MS,row.deadline_at!-now()),approvalContext:context
       });
       db.prepare("INSERT INTO hermes_proposal_previews(proposal_id,broker_action_id,created_at) VALUES(?,?,?)")
         .run(row.action_id,issued.actionId,now());
       return issued;
     })();
     store.audit("HERMES_APPROVAL_PREVIEW",{taskId:launch.mission_id,actionId:row.action_id},
       {envelopeActionId:envelope.actionId,canonicalPayloadHash:envelope.canonicalPayloadHash,mode:"DEMO_ONLY"});
     return reply.code(201).send({mode:"DEMO_NO_EXECUTION",proposalId:row.action_id,
       envelope,canonicalPayloadHash:envelope.canonicalPayloadHash,
       digest:actionDigest(envelope),deadlineAt:row.deadline_at,reused:false});
   }catch(e){return error(reply,e);}
 });
 app.post<{Params:{actionId:string}}>("/v1/hermes/approvals/:actionId/reject",async(req,reply)=>{
   try{
     const who=deviceOwner(req),row=owned(req.params.actionId,who);
     if(proposalStatus(row)!=="PENDING_USER_SIGNATURE_ON_IPHONE")fail("PROPOSAL_NOT_PENDING");
     const prev=currentPreview(row);
     if(prev&&prev.state!=="PENDING")fail("PROPOSAL_OUTCOME_UNCERTAIN");
     db.transaction(()=>{
       const result=db.prepare("UPDATE hermes_action_proposals SET decision='REJECTED'"+
         " WHERE action_id=? AND decision IS NULL").run(row.action_id);
       if(result.changes!==1)fail("PROPOSAL_ALREADY_DECIDED");
       db.prepare("INSERT OR IGNORE INTO hermes_continuation_outbox"+
         "(proposal_id,run_id,outcome,receipt_digest,created_at) VALUES(?,?,?,?,?)")
         .run(row.action_id,row.run_id,"REJECTED",null,now());
     })();
     return {status:"REJECTED",execution:"NONE"};
   }catch(e){return error(reply,e);}
 });
 app.post<{Params:{actionId:string}}>("/v1/hermes/approvals/:actionId/approve",async(req,reply)=>{
   try{
     const who=deviceOwner(req),row=owned(req.params.actionId,who);
     if(proposalStatus(row)!=="PENDING_USER_SIGNATURE_ON_IPHONE")fail("PROPOSAL_NOT_PENDING");
     const prev=currentPreview(row);
     if(!prev||prev.state!=="PENDING"||now()>=prev.envelope.expiresAt)fail("PREVIEW_EXPIRED");
     const signature=(req.body as {signatureDerBase64?:unknown}|null)?.signatureDerBase64;
     if(typeof signature!=="string")fail("SIGNATURE_REQUIRED");
     const result=await enforcer(who.deviceId).executeOrReject({
       actionId:prev.envelope.actionId,deviceId:who.deviceId,signatureDerBase64:signature
     });
     completeDemo(row,result.receipt,prev.envelope);
     const run=launchByRun(row.run_id);
     store.audit("HERMES_APPROVAL_DEMO_VERIFIED",{
       taskId:run?.mission_id??null,actionId:row.action_id
     },{digest:actionDigest(prev.envelope),canonicalPayloadHash:prev.envelope.canonicalPayloadHash,
       effectIdempotencyKey:prev.envelope.approvalContext?.effectIdempotencyKey,
       mode:"DEMO_ONLY_NO_EFFECT"});
     return {status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE",receipt:result.receipt};
   }catch(e){return error(reply,e);}
 });
}
