import {beforeEach,afterEach,describe,expect,it} from "vitest";
import {generateKeyPairSync,sign} from "node:crypto";
import {createCore,type Core} from "../src/server.js";
import {approvalBytes,type ActionEnvelope} from "../src/security/action-broker.js";
import {deviceChallengeBytes,type DeviceChallenge} from "../src/security/device-session.js";
import {approvalSignedText} from "../../mobile/src/security/approval-display.js";
import {makeEnv,scriptedModel,type Env} from "./helpers.js";

const ownerId="owner-hermes-001",deviceId="iphone-hermes-0001";
const code="one-time-trial-code-for-hermes-9876543210";
const bridgeKey="demo-hermes-scoped-proposal-key-9876543210";
const hermesKey="demo-hermes-api-server-key-9876543210";
const runId="run_hermes_demo_0001";
const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const pem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
let core:Core, env:Env;
let hermesCalls:{url:string;method:string;idempotency:string|null}[];
function sig(bytes:Buffer):string{return sign("sha256",bytes,keys.privateKey).toString("base64");}
async function post(url:string,payload:unknown,token?:string){
 return core.app.inject({method:"POST",url,headers:{
   "content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})
 },payload:JSON.stringify(payload)});
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
async function launch(phoneToken:string){
 return post("/v1/hermes/runs",{
   requestId:"req_hermes_start_001",conversationId:"conversation_hermes_001",
   input:"Prepare a safe demonstration of a workflow, without executing it."
 },phoneToken);
}
function proposal(){
 return {runId,callId:"call_hermes_001",serviceId:"n8n",operation:"trigger_workflow",
   destination:"workflow_demo_001",arguments:{text:"safe demonstration"}};
}

beforeEach(async()=>{
 env=makeEnv();hermesCalls=[];
 const fakeTransport=async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
   const url=String(input),headers=new Headers(init?.headers);
   hermesCalls.push({url,method:init?.method??"GET",idempotency:headers.get("Idempotency-Key")});
   if(url.endsWith("/v1/runs") && init?.method==="POST"){
     return new Response(JSON.stringify({run_id:runId,status:"started"}),{
       status:202,headers:{"content-type":"application/json"}});
   }
   if(url.endsWith("/v1/runs/"+runId)){
     return new Response(JSON.stringify({run_id:runId,status:"waiting_for_approval"}),{
       status:200,headers:{"content-type":"application/json"}});
   }
   return new Response("{}",{status:404});
 };
 core=await createCore({dbFile:env.dbFile,workspaceRoot:env.wsRoot,
   deviceSecurity:{ownerId,pairingCode:code},model:scriptedModel(),clock:env.clock,
   hermesBridge:{baseUrl:"http://127.0.0.1:8642",apiKey:hermesKey,proposalKey:bridgeKey,
     transport:fakeTransport as typeof fetch}});
});
afterEach(async()=>{await core.close();env.cleanup();});
describe("Hermes Gateway bridge: proposal-only and NO effects",()=>{
 it("requires a signed phone to start runs and keeps Hermes worker state separate",async()=>{
   const missing=await post("/v1/hermes/runs",{input:"hello"});
   expect(missing.statusCode).toBe(401);
   const phoneToken=await phone();
   const started=await launch(phoneToken);
   expect(started.statusCode).toBe(202);
   expect(started.json()).toMatchObject({runId,mode:"DEMO_NO_EXECUTION"});
   expect(hermesCalls[0].url).toBe("http://127.0.0.1:8642/v1/runs");
   expect(hermesCalls[0].idempotency).toMatch(/^[0-9a-f]{64}$/);
   const duplicate=await launch(phoneToken);
   expect(duplicate.statusCode).toBe(200);
   expect(duplicate.json().replayed).toBe(true);
   expect(hermesCalls).toHaveLength(1);
   const status=await get("/v1/hermes/runs/"+runId,phoneToken);
   expect(status.statusCode).toBe(200);
   expect(status.json()).toMatchObject({workerStatus:"waiting_for_approval",
     authority:"GATEWAY_FOR_ACTIONS"});
   expect((status.json() as Record<string,unknown>).approvalStatus).toBeUndefined();
 });
 it("rejects forged proposals, replays and tampering; a signed approval is demonstrably no-op",async()=>{
   const token=await phone();await launch(token);
   const wrong=await post("/v1/hermes/bridge/actions",proposal(),token);
   expect(wrong.statusCode).toBe(401);
   const unregistered=await post("/v1/hermes/bridge/actions",
      {...proposal(),runId:"run_foreign_1234"},bridgeKey);
   expect(unregistered.statusCode).toBe(403);
   const denied=await post("/v1/hermes/bridge/actions",
      {...proposal(),operation:"run_shell",serviceId:"terminal"},bridgeKey);
   expect(denied.statusCode).toBe(403);
   const created=await post("/v1/hermes/bridge/actions",proposal(),bridgeKey);
   expect(created.statusCode).toBe(202);
   expect(created.json()).toMatchObject({status:"AWAITING_OWNER",execution:"NONE"});
   const actionId=created.json().actionId as string;
   const repeat=await post("/v1/hermes/bridge/actions",proposal(),bridgeKey);
   expect(repeat.json()).toMatchObject({actionId,replayed:true});
   const changed=await post("/v1/hermes/bridge/actions",
       {...proposal(),destination:"different_workflow"},bridgeKey);
   expect(changed.statusCode).toBe(403);
   const approvals=await get("/v1/hermes/approvals",token);
   expect(approvals.statusCode).toBe(200);
   const envelope=approvals.json().items[0].envelope as ActionEnvelope;
   expect(Buffer.from(approvalSignedText(envelope),"utf8")).toEqual(approvalBytes(envelope));
   expect(envelope.destination).toBe("workflow_demo_001");
   const tampered=await post("/v1/hermes/approvals/"+actionId+"/approve",{
     signatureDerBase64:sig(approvalBytes({...envelope,destination:"other"}))
   },token);
   expect(tampered.statusCode).toBe(403);
   const approve=await post("/v1/hermes/approvals/"+actionId+"/approve",{
     signatureDerBase64:sig(approvalBytes(envelope))
   },token);
   expect(approve.statusCode).toBe(200);
   expect(approve.json()).toMatchObject({status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE"});
   expect(approve.json().receipt).toContain("DEMO_ONLY_NO_EFFECT");
   const pluginStatus=await get("/v1/hermes/bridge/actions/"+actionId,bridgeKey);
   expect(pluginStatus.json()).toMatchObject({status:"DEMO_VERIFIED_NO_EFFECT",execution:"NONE"});
   const again=await post("/v1/hermes/approvals/"+actionId+"/approve",{
     signatureDerBase64:sig(approvalBytes(envelope))
   },token);
   expect(again.statusCode).toBe(403);
   const empty=await get("/v1/hermes/approvals",token);
   expect(empty.json().items).toHaveLength(0);
   expect(hermesCalls).toHaveLength(1); // No Hermes /approval or n8n calls.
 });
 it("rejects a proposal and refuses later approvals; revoked device cannot sign",async()=>{
   const token=await phone();await launch(token);
   const created=await post("/v1/hermes/bridge/actions",proposal(),bridgeKey);
   const actionId=created.json().actionId as string;
   const pending=(await get("/v1/hermes/approvals",token)).json().items[0].envelope as ActionEnvelope;
   const reject=await post("/v1/hermes/approvals/"+actionId+"/reject",{},token);
   expect(reject.statusCode).toBe(200);
   expect((await get("/v1/hermes/bridge/actions/"+actionId,bridgeKey)).json().status).toBe("REJECTED");
   const tooLate=await post("/v1/hermes/approvals/"+actionId+"/approve",{
     signatureDerBase64:sig(approvalBytes(pending))
   },token);
   expect(tooLate.statusCode).toBe(403);
   const revoked=await post("/v1/security/device/revoke",{},token);
   expect(revoked.statusCode).toBe(200);
   const after=await get("/v1/hermes/approvals",token);
   expect(after.statusCode).toBe(401);
 });
});
