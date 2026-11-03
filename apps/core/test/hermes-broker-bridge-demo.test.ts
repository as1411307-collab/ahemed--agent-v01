import {beforeEach,afterEach,describe,expect,it} from "vitest";
import {generateKeyPairSync,sign} from "node:crypto";
import Database from "better-sqlite3";
import {createCore,type Core} from "../src/server.js";
import {approvalBytes,canonicalPayloadHash,type ActionEnvelope} from "../src/security/action-broker.js";
import {deviceChallengeBytes,type DeviceChallenge} from "../src/security/device-session.js";
import {approvalSignedText,approvalDisplayRows} from "../../mobile/src/security/approval-display.js";
import {makeEnv,scriptedModel,type Env} from "./helpers.js";

const ownerId="owner-hermes-001",deviceId="iphone-hermes-0001";
const code="one-time-trial-code-for-hermes-9876543210";
const bridgeKey="demo-hermes-scoped-proposal-key-9876543210";
const hermesKey="demo-hermes-api-server-key-9876543210";
const runId="run_hermes_demo_0001";
const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const pem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
let core:Core,env:Env;
let hermesCalls:{url:string;method:string;idempotency:string|null}[];
function sig(bytes:Buffer):string{return sign("sha256",bytes,keys.privateKey).toString("base64");}
async function post(url:string,payload:unknown,token?:string){
 return core.app.inject({method:"POST",url,headers:{"content-type":"application/json",
   ...(token?{authorization:"Bearer "+token}:{})},payload:JSON.stringify(payload)});
}
async function get(url:string,token?:string){
 return core.app.inject({method:"GET",url,headers:token?{authorization:"Bearer "+token}:{}});
}
async function phone():Promise<string>{
 const challenge=await post("/v1/security/enroll/challenge",{pairingCode:code,deviceId,publicKeySpkiPem:pem});
 expect(challenge.statusCode).toBe(200);
 const e=challenge.json().payload as DeviceChallenge;
 const enroll=await post("/v1/security/enroll",{
   challengeId:e.challengeId,deviceId,signatureDerBase64:sig(deviceChallengeBytes("enroll",e))
 });
 expect(enroll.statusCode).toBe(200);
 const challenge2=await post("/v1/security/session/challenge",{deviceId});
 const s=challenge2.json().payload as DeviceChallenge;
 const session=await post("/v1/security/session",{
   challengeId:s.challengeId,deviceId,signatureDerBase64:sig(deviceChallengeBytes("session",s))
 });
 expect(session.statusCode).toBe(200);
 return session.json().accessToken as string;
}
async function renewedSession():Promise<string>{
 const response=await post("/v1/security/session/challenge",{deviceId});
 expect(response.statusCode).toBe(200);
 const p=response.json().payload as DeviceChallenge;
 const auth=await post("/v1/security/session",{
   deviceId,challengeId:p.challengeId,
   signatureDerBase64:sig(deviceChallengeBytes("session",p))
 });
 expect(auth.statusCode).toBe(200);
 return auth.json().accessToken as string;
}
async function launch(phoneToken:string){
 return post("/v1/hermes/runs",{
   requestId:"req_hermes_start_001",conversationId:"conversation_hermes_001",
   input:"Prepare a safe demonstration of a workflow, without executing it."
 },phoneToken);
}
function proposal(callId="call_hermes_001"){
 return {runId,callId,serviceId:"n8n",operation:"trigger_workflow",
   destination:"workflow_demo_001",arguments:{text:"safe demonstration"}};
}
async function createProposal(callId?:string){
 const res=await post("/v1/hermes/bridge/actions",proposal(callId),bridgeKey);
 expect(res.statusCode).toBe(202);
 return res.json().proposalId as string;
}
async function preview(token:string,proposalId:string){
 const res=await post("/v1/hermes/approvals/"+proposalId+"/preview",{},token);
 expect([200,201]).toContain(res.statusCode);
 return res.json().envelope as ActionEnvelope;
}
beforeEach(async()=>{
 env=makeEnv();hermesCalls=[];
 const fakeTransport=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
   const url=String(input),h=new Headers(init?.headers);
   hermesCalls.push({url,method:init?.method??"GET",idempotency:h.get("Idempotency-Key")});
   if(url.endsWith("/v1/runs")&&init?.method==="POST")
     return new Response(JSON.stringify({run_id:runId,status:"started"}),{
       status:202,headers:{"content-type":"application/json"}});
   if(url.endsWith("/v1/runs/"+runId))
     return new Response(JSON.stringify({run_id:runId,status:"running"}),{
       status:200,headers:{"content-type":"application/json"}});
   return new Response("{}",{status:404});
 };
 core=await createCore({dbFile:env.dbFile,workspaceRoot:env.wsRoot,
   deviceSecurity:{ownerId,pairingCode:code},model:scriptedModel(),clock:env.clock,
   hermesBridge:{baseUrl:"http://127.0.0.1:8642",apiKey:hermesKey,proposalKey:bridgeKey,
     transport:fakeTransport as typeof fetch}});
});
afterEach(async()=>{await core.close();env.cleanup();});

describe("Hermes proposal bridge - async signed demo and no external effects",()=>{
 it("accepts signed phone only, uses Hermes run idempotency, never infers signed approval from worker status",async()=>{
   expect((await post("/v1/hermes/runs",{input:"hello"})).statusCode).toBe(401);
   const token=await phone();
   const first=await launch(token);
   expect(first.statusCode).toBe(202);
   expect(first.json()).toMatchObject({runId,mode:"DEMO_NO_EXECUTION"});
   expect(hermesCalls[0].url).toBe("http://127.0.0.1:8642/v1/runs");
   expect(hermesCalls[0].idempotency).toMatch(/^[0-9a-f]{64}$/);
   expect((await launch(token)).json().replayed).toBe(true);
   expect(hermesCalls).toHaveLength(1);
   const status=await get("/v1/hermes/runs/"+runId,token);
   expect(status.json()).toMatchObject({workerStatus:"running",authority:"GATEWAY_FOR_ACTIONS"});
   expect(status.json().approvalStatus).toBeUndefined();
 });
 it("uses a trusted Gateway registry, proposal-only auth, immutable run/call/arguments and no sign-on-ID",async()=>{
   const token=await phone();await launch(token);
   expect((await post("/v1/hermes/bridge/actions",proposal(),token)).statusCode).toBe(401);
   expect((await post("/v1/hermes/bridge/actions",
     {...proposal(),runId:"run_foreign_1234"},bridgeKey)).statusCode).toBe(403);
   expect((await post("/v1/hermes/bridge/actions",
     {...proposal(),destination:"wf_unknown_1234"},bridgeKey)).statusCode).toBe(403);
   expect((await post("/v1/hermes/bridge/actions",
     {...proposal(),serviceId:"terminal",operation:"run_shell"},bridgeKey)).statusCode).toBe(403);
   expect((await post("/v1/hermes/bridge/actions",
     {...proposal(),arguments:{text:"good",script:"rm -rf"}},bridgeKey)).statusCode).toBe(403);
   const proposalId=await createProposal();
   const replay=await post("/v1/hermes/bridge/actions",proposal(),bridgeKey);
   expect(replay.json()).toMatchObject({actionId:proposalId,replayed:true,
     status:"PENDING_USER_SIGNATURE_ON_IPHONE",execution:"NONE"});
   expect((await post("/v1/hermes/bridge/actions",
     {...proposal(),arguments:{text:"tampered"}},bridgeKey)).statusCode).toBe(403);
   const items=(await get("/v1/hermes/approvals",token)).json().items;
   expect(items).toHaveLength(1);
   expect(items[0]).toMatchObject({actionId:proposalId,
     displayName:"NEXUS test workflow — NOT LINKED TO n8n"});
   expect(items[0].envelope).toBeUndefined(); // Nothing signable until iPhone opens review.
   const envlp=await preview(token,proposalId);
   const c=envlp.approvalContext!;
   expect(c.runId).toBe(runId);
   expect(c.callId).toBe("call_hermes_001");
   expect(c.proposalId).toBe(proposalId);
   expect(c.effectIdempotencyKey).toBe("nexus_"+proposalId);
   expect(c.registryTrust).toBe("DEMO_UNVERIFIED");
   expect(envlp.canonicalPayloadHash).toBe(canonicalPayloadHash(envlp));
   expect(Buffer.from(approvalSignedText(envlp),"utf8")).toEqual(approvalBytes(envlp));
   expect(approvalDisplayRows(envlp).map(x=>x.value).join(" ")).toContain("NOT LINKED TO n8n");
   const old=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes({...envlp,arguments:{text:"tampered"}}))
   },token);
   expect(old.statusCode).toBe(403);
   const changedCall=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes({...envlp,
       approvalContext:{...c,callId:"call_attacker_002"}}))
   },token);
   expect(changedCall.statusCode).toBe(403);
   const changedExpiry=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes({...envlp,expiresAt:envlp.expiresAt+60_000}))
   },token);
   expect(changedExpiry.statusCode).toBe(403);
   const okay=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes(envlp))
   },token);
   expect(okay.statusCode).toBe(200);
   expect(okay.json()).toMatchObject({status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE"});
   expect(okay.json().receipt).toBe("DEMO_ONLY_NO_EFFECT:"+(
     await import("../src/security/action-broker.js")).actionDigest(envlp));
   const poll=await get("/v1/hermes/bridge/actions/"+proposalId,bridgeKey);
   expect(poll.json()).toMatchObject({status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE",
     continuationMode:"ASYNC_POLL_ONLY_NO_AUTO_RESUME"});
   expect((await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes(envlp))
   },token)).statusCode).toBe(403);
   expect((await get("/v1/hermes/approvals",token)).json().items).toHaveLength(0);
   expect(hermesCalls).toHaveLength(1); // No native Hermes /approval, n8n or email dispatch.
 });
 it("accepts signature after 30 minutes; regenerates a 90s review and rejects its old signature",async()=>{
   const token=await phone();await launch(token);
   const proposalId=await createProposal();
   env.nowMs+=30*60_000;
   const renewedToken=await renewedSession();
   const status=await get("/v1/hermes/bridge/actions/"+proposalId,bridgeKey);
   expect(status.json().status).toBe("PENDING_USER_SIGNATURE_ON_IPHONE");
   const first=await preview(renewedToken,proposalId);
   expect(first.expiresAt-env.nowMs).toBe(90_000);
   env.nowMs+=120_000;
   const second=await preview(renewedToken,proposalId);
   expect(second.actionId).not.toBe(first.actionId);
   expect(second.expiresAt).toBe(env.nowMs+90_000);
   expect(second.approvalContext?.effectIdempotencyKey).toBe(first.approvalContext?.effectIdempotencyKey);
   const stale=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes(first))
   },renewedToken);
   expect(stale.statusCode).toBe(403);
   const good=await post("/v1/hermes/approvals/"+proposalId+"/approve",{
     signatureDerBase64:sig(approvalBytes(second))
   },renewedToken);
   expect(good.statusCode).toBe(200);
   expect((await get("/v1/hermes/bridge/actions/"+proposalId,bridgeKey)).json().status)
     .toBe("DEMO_VERIFIED_NO_EFFECT");
 });
 it("holds approval for an hour without open HTTP, then rejects expired proposals",async()=>{
   const token=await phone();await launch(token);
   const prop=await createProposal();
   env.nowMs+=60*60_000;
   const renewedToken=await renewedSession();
   expect((await get("/v1/hermes/bridge/actions/"+prop,bridgeKey)).json().status)
     .toBe("PENDING_USER_SIGNATURE_ON_IPHONE");
   const envlp=await preview(renewedToken,prop);
   expect(envlp.approvalContext?.proposalDeadlineAt).toBeGreaterThan(env.nowMs);
   env.nowMs+=61*60_000;
   const endToken=await renewedSession();
   expect((await get("/v1/hermes/bridge/actions/"+prop,bridgeKey)).json().status).toBe("EXPIRED");
   expect((await post("/v1/hermes/approvals/"+prop+"/preview",{},endToken)).statusCode).toBe(403);
   expect((await post("/v1/hermes/approvals/"+prop+"/approve",{
     signatureDerBase64:sig(approvalBytes(envlp))
   },endToken)).statusCode).toBe(403);
 });
 it("quarantines an uncertain broker state and never refreshes/replays it",async()=>{
   const token=await phone();await launch(token);
   const prop=await createProposal();
   const envlp=await preview(token,prop);
   const db=new Database(env.dbFile);
   try{
     db.prepare("UPDATE broker_action_outbox SET status='UNKNOWN' WHERE action_id=?").run(envlp.actionId);
   }finally{db.close();}
   expect((await get("/v1/hermes/bridge/actions/"+prop,bridgeKey)).json().status)
     .toBe("OUTCOME_UNKNOWN");
   expect((await get("/v1/hermes/approvals",token)).json().items).toHaveLength(0);
   expect((await post("/v1/hermes/approvals/"+prop+"/preview",{},token)).statusCode).toBe(403);
   expect((await post("/v1/hermes/approvals/"+prop+"/approve",{
     signatureDerBase64:sig(approvalBytes(envlp))
   },token)).statusCode).toBe(403);
   expect(hermesCalls).toHaveLength(1);
 });
 it("handles reject and revoked owner session without executing anything",async()=>{
   const token=await phone();await launch(token);
   const prop=await createProposal();
   const first=await preview(token,prop);
   expect((await post("/v1/hermes/approvals/"+prop+"/reject",{},token)).statusCode).toBe(200);
   expect((await get("/v1/hermes/bridge/actions/"+prop,bridgeKey)).json().status).toBe("REJECTED");
   expect((await post("/v1/hermes/approvals/"+prop+"/approve",{
     signatureDerBase64:sig(approvalBytes(first))
   },token)).statusCode).toBe(403);
   expect((await post("/v1/security/device/revoke",{},token)).statusCode).toBe(200);
   expect((await get("/v1/hermes/approvals",token)).statusCode).toBe(401);
 });
});
