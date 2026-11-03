import {createHash, randomUUID, timingSafeEqual} from "node:crypto";
import type Database from "better-sqlite3";
import type {FastifyInstance, FastifyRequest} from "fastify";
import {ActionBrokerEnforcer, actionDigest, type ActionEnvelope} from "./security/action-broker.js";
import type {SqliteActionStore} from "./security/sqlite-action-store.js";
import {canonicalize, type JsonValue} from "./security/canonical.js";
import type {DeviceIdentity, DeviceSessions} from "./security/device-session.js";
import type {Store} from "./store.js";

/**
 * EXPERIMENTAL. Hermes proposes actions; only the phone may sign a canonical
 * broker envelope. Dispatch is a deliberate NO-OP, with NO Hermes /approval
 * forwarding and NO n8n/email credentials in this process.
 */
export interface HermesBridgeOptions {
  baseUrl: string; // HTTPS or loopback HTTP; server-controlled, never user input
  apiKey: string;  // Server-to-Hermes API key
  proposalKey: string; // Scoped key for Hermes plugin: PROPOSE + POLL only
  transport?: typeof fetch; // offline tests
}

interface Params {
  app: FastifyInstance;
  db: Database.Database;
  store: Store;
  devices: DeviceSessions;
  brokerStore: SqliteActionStore;
  deviceOwner: (req: FastifyRequest) => DeviceIdentity;
  options: HermesBridgeOptions;
  now: () => number;
}
type Launch = {mission_id:string; run_id:string|null; owner_id:string;device_id:string;
  conversation_id:string;request_id:string;input_digest:string;created_at:number};
type Proposed = {action_id:string;run_id:string;call_id:string;owner_id:string;
  device_id:string;payload_digest:string;decision:string|null};

function fail(code: string): never {throw new Error("SECURITY_REJECT: " + code);}
function validId(v:unknown):v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(v);
}
function validRun(v:unknown):v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(v);
}
function same(a:string,b:string):boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());
}
export function validBridgeBearer(header:unknown,key:string):boolean {
  return typeof header === "string" && header.startsWith("Bearer ") &&
    key.length >= 32 && same(header.slice(7),key);
}
export function isHermesProposalRoute(method:string,path:string):boolean {
  return (method === "POST" && path === "/v1/hermes/bridge/actions") ||
    (method === "GET" && /^\/v1\/hermes\/bridge\/actions\/[A-Za-z0-9_-]{8,100}$/.test(path));
}
function checkedUrl(raw:string):string {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") fail("INVALID_HERMES_BASE_URL");
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost","127.0.0.1","[::1]"].includes(url.hostname))) fail("HERMES_URL_REQUIRES_HTTPS");
  return url.origin;
}
function policy(input:{serviceId:string;operation:string;destination:string;arguments:Record<string,JsonValue>}):boolean {
  // DEMO ONLY. No arbitrary destination or tool execution.
  return (input.serviceId === "n8n" && input.operation === "trigger_workflow" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(input.destination)) ||
    (input.serviceId === "email" && input.operation === "send_email" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.destination) && input.destination.length <= 254);
}
function proposalFrom(v:unknown):{runId:string;callId:string;serviceId:string;
    operation:string;destination:string;arguments:Record<string,JsonValue>} {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail("INVALID_PROPOSAL");
  const b=v as Record<string,unknown>;
  if (!validRun(b.runId) || !validId(b.callId)) fail("INVALID_PROPOSAL_IDS");
  if (typeof b.serviceId!=="string" || typeof b.operation!=="string" ||
      typeof b.destination!=="string" || !b.arguments || typeof b.arguments!=="object" ||
      Array.isArray(b.arguments)) fail("INVALID_PROPOSAL");
  const args=canonicalize(b.arguments);
  if (Buffer.byteLength(args,"utf8")>16_384) fail("PROPOSAL_TOO_LARGE");
  const result={runId:b.runId,callId:b.callId,serviceId:b.serviceId,
    operation:b.operation,destination:b.destination,arguments:JSON.parse(args) as Record<string,JsonValue>};
  if (!policy(result)) fail("OPERATION_NOT_ALLOWLISTED");
  return result;
}

export function registerHermesBridge(p:Params):void {
  const {app,db,store,devices,brokerStore,deviceOwner,options,now}=p;
  const base=checkedUrl(options.baseUrl);
  if (options.apiKey.length < 24 || options.proposalKey.length < 32) throw new Error("HERMES_BRIDGE_KEYS_TOO_SHORT");
  const transport=options.transport ?? fetch;
  db.exec(
    "CREATE TABLE IF NOT EXISTS hermes_launches ("+
    "mission_id TEXT PRIMARY KEY,run_id TEXT UNIQUE,owner_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
    "conversation_id TEXT NOT NULL,request_id TEXT UNIQUE NOT NULL,input_digest TEXT NOT NULL,"+
    "created_at INTEGER NOT NULL);"+
    "CREATE TABLE IF NOT EXISTS hermes_action_proposals ("+
    "action_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES hermes_launches(run_id),"+
    "call_id TEXT NOT NULL,owner_id TEXT NOT NULL,device_id TEXT NOT NULL,"+
    "payload_digest TEXT NOT NULL,decision TEXT CHECK(decision IN ('REJECTED','DEMO_VERIFIED')),"+
    "UNIQUE(run_id,call_id));"
  );
  function launchByRun(runId:string):Launch|undefined {
    return db.prepare("SELECT * FROM hermes_launches WHERE run_id=?").get(runId) as Launch|undefined;
  }
  function proposed(id:string):Proposed|undefined {
    return db.prepare("SELECT * FROM hermes_action_proposals WHERE action_id=?").get(id) as Proposed|undefined;
  }
  function enforcer(deviceId:string):ActionBrokerEnforcer {
    const device=devices.getDevice(deviceId);
    if (!device || device.revoked) fail("DEVICE_REVOKED");
    return new ActionBrokerEnforcer(brokerStore,new Map([[deviceId,device]]),
      {dispatch:async(e)=>({confirmedReceipt:"DEMO_ONLY_NO_EFFECT:"+actionDigest(e)})},policy,now);
  }
  function owned(id:string,identity:DeviceIdentity):{record:Proposed;envelope:ActionEnvelope} {
    const record=proposed(id);
    if (!record || record.owner_id!==identity.ownerId || record.device_id!==identity.deviceId) fail("ACTION_NOT_OWNED");
    const launch=launchByRun(record.run_id);
    if (!launch || launch.owner_id!==identity.ownerId || launch.device_id!==identity.deviceId) fail("RUN_NOT_OWNED");
    const broker=brokerStore.find(id);
    if (!broker || broker.envelope.ownerId!==identity.ownerId || broker.envelope.deviceId!==identity.deviceId ||
        broker.envelope.taskId!==launch.mission_id) fail("BROKER_MISMATCH");
    return {record,envelope:broker.envelope};
  }
  function authorizedPlugin(req:FastifyRequest):void {
    if (!validBridgeBearer(req.headers.authorization,options.proposalKey)) fail("HERMES_PLUGIN_AUTH");
  }
  function status(rec:Proposed):string {
    const broker=brokerStore.find(rec.action_id);
    if (!broker) return "UNKNOWN";
    if (rec.decision === "REJECTED") return "REJECTED";
    // Broker reservation/result is durable before the UI projection is updated.
    // If a process crashed between those writes, never show it as still pending.
    if (broker.status === "COMPLETED" || rec.decision === "DEMO_VERIFIED")
      return "DEMO_VERIFIED_NO_EFFECT";
    if (broker.status !== "PENDING") return "UNKNOWN";
    return now() >= broker.envelope.expiresAt ? "EXPIRED" : "AWAITING_OWNER";
  }
  function error(reply:{code:(n:number)=>{send:(v:unknown)=>unknown}},e:unknown):unknown {
    const msg=e instanceof Error?e.message:"BRIDGE_ERROR";
    const code=msg.startsWith("SECURITY_REJECT:")?403:msg.startsWith("HERMES_UNAVAILABLE:")?502:409;
    return reply.code(code).send({error:{code:"HERMES_BRIDGE_DENIED",message:msg.slice(0,100)}});
  }
  async function hermes(path:string,method:"GET"|"POST",body?:unknown,idempotency?:string):Promise<Record<string,unknown>> {
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),9000);
    try {
      // A live Hermes Runs API can execute its native terminal/MCP/browser
      // tools without our Broker. Offline tests inject a mocked transport.
      // Until an isolated read-only Hermes profile is verified, fail closed.
      if(method==="POST" && path==="/v1/runs" && !options.transport)
        fail("LIVE_HERMES_RUN_START_BLOCKED_UNTIL_SANDBOX_VERIFIED");
      const response=await transport(base+path,{
        method,redirect:"error",signal:ctrl.signal,
        headers:{"Authorization":"Bearer "+options.apiKey,"Content-Type":"application/json",
          ...(idempotency?{"Idempotency-Key":idempotency}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
      });
      if (!response.ok) throw new Error("HERMES_UNAVAILABLE: HTTP_"+response.status);
      const data=await response.json() as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data)) fail("INVALID_HERMES_RESPONSE");
      return data as Record<string,unknown>;
    }catch(e){
      if(e instanceof Error && e.message.startsWith("SECURITY_REJECT:"))throw e;
      if(e instanceof Error && e.message.startsWith("HERMES_UNAVAILABLE:"))throw e;
      throw new Error("HERMES_UNAVAILABLE: REQUEST_FAILED");
    }finally {clearTimeout(timer);}
  }

  // Phone -> Gateway -> actual Hermes Runs API. Replay is bound to request ID.
  // A transport-unknown launch is NOT blindly retried (Hermes reserves keys for
  // 24 hours, not forever); a separate reconciliation flow is required.
  app.post("/v1/hermes/runs",async(req,reply)=>{
    try {
      const owner=deviceOwner(req);
      const b=req.body as {requestId?:unknown;conversationId?:unknown;input?:unknown}|null;
      if(!validId(b?.requestId)||!validId(b?.conversationId)||
         typeof b?.input!=="string"||b.input.trim().length<1||b.input.length>4_000)fail("INVALID_RUN_REQUEST");
      // Check before reserving mission IDs: a blocked demo must not create
      // an unrecoverable "unknown start" row.
      if(!options.transport)fail("LIVE_HERMES_RUN_START_BLOCKED_UNTIL_SANDBOX_VERIFIED");
      const digest=createHash("sha256").update(b.input).digest("hex");
      const existing=db.prepare("SELECT * FROM hermes_launches WHERE request_id=?").get(b.requestId) as Launch|undefined;
      if (existing) {
        if(existing.owner_id!==owner.ownerId||existing.device_id!==owner.deviceId||
           existing.conversation_id!==b.conversationId||existing.input_digest!==digest)fail("RUN_REQUEST_CONFLICT");
        if (!existing.run_id) fail("RUN_START_OUTCOME_UNKNOWN_RECONCILE_MANUALLY");
        return {mode:"DEMO_NO_EXECUTION",missionId:existing.mission_id,runId:existing.run_id,replayed:true};
      }
      const missionId=randomUUID();
      db.transaction(()=>{
        devices.claimConversation(b.conversationId as string,owner.ownerId);
        store.ensureConversation(b.conversationId as string);
        db.prepare("INSERT INTO hermes_launches (mission_id,run_id,owner_id,device_id,conversation_id,request_id,input_digest,created_at) VALUES(?,NULL,?,?,?,?,?,?)")
          .run(missionId,owner.ownerId,owner.deviceId,b.conversationId,b.requestId,digest,now());
      })();
      const key=createHash("sha256").update("nexus-hermes-run-v1:"+owner.ownerId+":"+b.requestId).digest("hex");
      const out=await hermes("/v1/runs","POST",{input:b.input,session_id:b.conversationId},key);
      if(!validRun(out.run_id))fail("INVALID_HERMES_RUN_ID");
      db.prepare("UPDATE hermes_launches SET run_id=? WHERE mission_id=? AND run_id IS NULL").run(out.run_id,missionId);
      return reply.code(202).send({mode:"DEMO_NO_EXECUTION",missionId,runId:out.run_id,replayed:false});
    }catch(e){return error(reply,e);}
  });
  app.get<{Params:{runId:string}}>("/v1/hermes/runs/:runId",async(req,reply)=>{
    try {
      const identity=deviceOwner(req),row=launchByRun(req.params.runId);
      if(!row||row.owner_id!==identity.ownerId||row.device_id!==identity.deviceId)fail("RUN_NOT_OWNED");
      const out=await hermes("/v1/runs/"+encodeURIComponent(row.run_id!),"GET");
      return {missionId:row.mission_id,runId:row.run_id,workerStatus:
        typeof out.status==="string"?out.status:"UNKNOWN",authority:"GATEWAY_FOR_ACTIONS"};
    }catch(e){return error(reply,e);}
  });
  app.post("/v1/hermes/bridge/actions",async(req,reply)=>{
    try {
      authorizedPlugin(req);
      const proposal=proposalFrom(req.body);
      const run=launchByRun(proposal.runId);
      if(!run)fail("UNREGISTERED_RUN");
      const pd=actionDigestInput(proposal);
      const found=db.prepare("SELECT * FROM hermes_action_proposals WHERE run_id=? AND call_id=?")
        .get(proposal.runId,proposal.callId) as Proposed|undefined;
      if(found){
        if(found.payload_digest!==pd)fail("TOOL_CALL_CHANGED");
        return {actionId:found.action_id,status:status(found),execution:"NONE",replayed:true};
      }
      const number=db.prepare("SELECT COUNT(*) AS n FROM hermes_action_proposals WHERE run_id=?")
        .get(proposal.runId) as {n:number};
      if(number.n>=3)fail("RUN_PROPOSAL_LIMIT");
      const e=db.transaction(()=>{
        const issued=enforcer(run.device_id).issue({
          taskId:run.mission_id,ownerId:run.owner_id,deviceId:run.device_id,
          serviceId:proposal.serviceId,operation:proposal.operation,destination:proposal.destination,
          arguments:proposal.arguments,policyVersion:"hermes-demo-no-effect-v1",ttlMs:300_000,
        });
        db.prepare("INSERT INTO hermes_action_proposals(action_id,run_id,call_id,owner_id,device_id,payload_digest) VALUES(?,?,?,?,?,?)")
          .run(issued.actionId,proposal.runId,proposal.callId,run.owner_id,run.device_id,pd);
        return issued;
      })();
      store.audit("HERMES_BROKER_PROPOSED",{taskId:run.mission_id,actionId:e.actionId},
        {runId:run.run_id,digest:actionDigest(e),mode:"DEMO"});
      return reply.code(202).send({actionId:e.actionId,status:"AWAITING_OWNER",execution:"NONE",replayed:false});
    }catch(e){return error(reply,e);}
  });
  function actionDigestInput(p:ReturnType<typeof proposalFrom>):string {
    return createHash("sha256").update(canonicalize({
      serviceId:p.serviceId,operation:p.operation,destination:p.destination,arguments:p.arguments
    })).digest("hex");
  }
  app.get<{Params:{actionId:string}}>("/v1/hermes/bridge/actions/:actionId",async(req,reply)=>{
    try {
      authorizedPlugin(req);
      const rec=proposed(req.params.actionId);
      if(!rec)fail("UNKNOWN_PROPOSAL");
      return {actionId:rec.action_id,status:status(rec),execution:"NONE"};
    }catch(e){return error(reply,e);}
  });
  app.get("/v1/hermes/approvals",async(req,reply)=>{
    try {
      const who=deviceOwner(req);
      const rows=db.prepare("SELECT * FROM hermes_action_proposals WHERE owner_id=? AND device_id=? AND decision IS NULL ORDER BY rowid")
        .all(who.ownerId,who.deviceId) as Proposed[];
      const items=rows.flatMap(r=>{
        const e=brokerStore.find(r.action_id);
        return e && e.status==="PENDING" && e.envelope.expiresAt>now()?
          [{actionId:r.action_id,runId:r.run_id,mode:"DEMO_NO_EXECUTION",envelope:e.envelope,digest:actionDigest(e.envelope)}]:[];
      });
      return {items};
    }catch(e){return error(reply,e);}
  });
  app.post<{Params:{actionId:string}}>("/v1/hermes/approvals/:actionId/reject",async(req,reply)=>{
    try {
      const who=deviceOwner(req),{record,envelope}=owned(req.params.actionId,who);
      if(record.decision!==null||now()>=envelope.expiresAt ||
         brokerStore.find(record.action_id)?.status!=="PENDING")fail("PROPOSAL_NOT_PENDING");
      const changed=db.prepare("UPDATE hermes_action_proposals SET decision='REJECTED' WHERE action_id=? AND decision IS NULL")
        .run(record.action_id);
      if(changed.changes!==1)fail("PROPOSAL_ALREADY_DECIDED");
      return {status:"REJECTED",execution:"NONE"};
    }catch(e){return error(reply,e);}
  });
  app.post<{Params:{actionId:string}}>("/v1/hermes/approvals/:actionId/approve",async(req,reply)=>{
    try {
      const who=deviceOwner(req),{record,envelope}=owned(req.params.actionId,who);
      if(record.decision!==null||now()>=envelope.expiresAt)fail("PROPOSAL_NOT_PENDING");
      const signature=(req.body as {signatureDerBase64?:unknown}|null)?.signatureDerBase64;
      if(typeof signature!=="string")fail("SIGNATURE_REQUIRED");
      const result=await enforcer(who.deviceId).executeOrReject({
        actionId:record.action_id,deviceId:who.deviceId,signatureDerBase64:signature
      });
      db.prepare("UPDATE hermes_action_proposals SET decision='DEMO_VERIFIED' WHERE action_id=? AND decision IS NULL")
        .run(record.action_id);
      store.audit("HERMES_APPROVAL_DEMO_VERIFIED",{taskId:envelope.taskId,actionId:record.action_id},
        {digest:actionDigest(envelope),mode:"DEMO_ONLY_NO_EFFECT"});
      return {status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE",receipt:result.receipt};
    }catch(e){return error(reply,e);}
  });
}
