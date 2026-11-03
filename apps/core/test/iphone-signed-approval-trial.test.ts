import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createCore,type Core} from '../src/server.js';
import {deviceChallengeBytes,type DeviceChallenge} from '../src/security/device-session.js';
import {approvalBytes,type ActionEnvelope} from '../src/security/action-broker.js';
import {approvalSignedText,approvalCanonicalText} from '../../mobile/src/security/approval-display.js';
import {makeEnv,scriptedModel,multipart,requestPayload,type Env} from './helpers.js';

const CODE='secure-pairing-code-for-tests-9876543210';
const OWNER='owner-ahmed-0001';
const DEVICE='iphone-test-device-0001';
const CONV='signed-conversation-001';
let core:Core;let env:Env;
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const publicKeySpkiPem=keys.publicKey.export({type:'spki',format:'pem'}).toString();
async function post(url:string,payload:unknown,token?:string){
  return core.app.inject({method:'POST',url,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},payload:JSON.stringify(payload)});
}
function sig(bytes:Buffer){return sign('sha256',bytes,keys.privateKey).toString('base64');}
async function pairedSession(){
  const challengeRes=await post('/v1/security/enroll/challenge',{pairingCode:CODE,deviceId:DEVICE,publicKeySpkiPem});
  expect(challengeRes.statusCode).toBe(200);
  const challenge=challengeRes.json().payload as DeviceChallenge;
  const enrolled=await post('/v1/security/enroll',{
    deviceId:DEVICE,challengeId:challenge.challengeId,
    ownerId:'attacker-must-not-set-owner',
    signatureDerBase64:sig(deviceChallengeBytes('enroll',challenge)),
  });
  expect(enrolled.statusCode).toBe(200);
  expect(enrolled.json()).toMatchObject({ownerId:OWNER,deviceId:DEVICE});
  const sessionChallenge=await post('/v1/security/session/challenge',{deviceId:DEVICE});
  expect(sessionChallenge.statusCode).toBe(200);
  const c=sessionChallenge.json().payload as DeviceChallenge;
  const session=await post('/v1/security/session',{
    deviceId:DEVICE,challengeId:c.challengeId,
    signatureDerBase64:sig(deviceChallengeBytes('session',c)),
  });
  expect(session.statusCode).toBe(200);
  return {token:session.json().accessToken as string,enrollment:challenge,session:c};
}
async function message(text:string,token:string,file?:{name:string;content:string;type:string}){
  const mp=multipart(requestPayload(CONV,text,file),file);
  const response=await core.app.inject({method:'POST',url:'/v1/messages',
    headers:{authorization:'Bearer '+token,'content-type':mp.contentType},payload:mp.body});
  expect(response.statusCode).toBe(202);
  await core.drain();
  return response.json().task_id as string;
}
async function pendingMove(token:string){
  await message('summarize this file',token,{name:'report.txt',content:'security test document',type:'text/plain'});
  const taskId=await message('move file into archive',token);
  const result=await core.app.inject({method:'GET',url:'/v1/tasks/'+taskId,headers:{authorization:'Bearer '+token}});
  expect(result.statusCode).toBe(200);
  expect(result.json().status).toBe('WAITING_FOR_APPROVAL');
  return {taskId,actionId:result.json().data.action_id as string};
}
async function preview(token:string,taskId:string,actionId:string){
  const r=await post(`/v1/tasks/${taskId}/actions/${actionId}/signed-preview`,{},token);
  expect(r.statusCode).toBe(200);
  expect(r.json().mode).toBe('DEMO_NO_EXECUTION');
  return r.json().envelope as ActionEnvelope;
}
beforeEach(async()=>{
  env=makeEnv();
  core=await createCore({dbFile:env.dbFile,workspaceRoot:env.wsRoot,
    deviceSecurity:{ownerId:OWNER,pairingCode:CODE},clock:env.clock,model:scriptedModel()});
});
afterEach(async()=>{await core.close();env.cleanup();});
describe('actual Fastify signed-device trial (offline, NOT physical iPhone)',()=>{
  it('rejects public bearer and wrong pairing proof; enrollment is single-use and owner is server-bound',async()=>{
    const unauth=await core.app.inject({method:'GET',url:'/v1/conversations/'+CONV,
      headers:{authorization:'Bearer public-static-token'}});
    expect(unauth.statusCode).toBe(401);
    const bad=await post('/v1/security/enroll/challenge',{
      pairingCode:'wrong-code',deviceId:DEVICE,publicKeySpkiPem});
    expect(bad.statusCode).toBe(403);
    const c=await post('/v1/security/enroll/challenge',{pairingCode:CODE,deviceId:DEVICE,publicKeySpkiPem});
    const challenge=c.json().payload as DeviceChallenge;
    const tampered=await post('/v1/security/enroll',{
      deviceId:DEVICE,challengeId:challenge.challengeId,
      signatureDerBase64:sig(deviceChallengeBytes('session',{...challenge,type:'ahmed.device.session.v1'})),
    });
    expect(tampered.statusCode).toBe(403);
    const ok=await post('/v1/security/enroll',{
      deviceId:DEVICE,challengeId:challenge.challengeId,
      signatureDerBase64:sig(deviceChallengeBytes('enroll',challenge)),
    });
    expect(ok.statusCode).toBe(200);
    const replay=await post('/v1/security/enroll',{
      deviceId:DEVICE,challengeId:challenge.challengeId,
      signatureDerBase64:sig(deviceChallengeBytes('enroll',challenge)),
    });
    expect(replay.statusCode).toBe(403);
    const again=await post('/v1/security/enroll/challenge',{pairingCode:CODE,deviceId:'another-device-1234',publicKeySpkiPem});
    expect(again.statusCode).toBe(403);
  });
  it('shows the exact envelope, rejects tampering, prevents replay and leaves the file unchanged',async()=>{
    const {token}=await pairedSession();
    const {taskId,actionId}=await pendingMove(token);
    const legacy=await post(`/v1/tasks/${taskId}/actions/${actionId}/decision`,
      {action_id:actionId,decision:'APPROVE'},token);
    expect(legacy.statusCode).toBe(403);
    expect(()=>core.agent.decide(taskId,actionId,'APPROVE')).toThrow('SENSITIVE_EXECUTION_DISABLED');
    const envlp=await preview(token,taskId,actionId);
    const retryPreview=await preview(token,taskId,actionId);
    expect(retryPreview).toEqual(envlp);
    expect(Buffer.from(approvalSignedText(envlp),'utf8')).toEqual(approvalBytes(envlp));
    expect(approvalCanonicalText(envlp)).toContain('archive/report.txt');
    const changed={...envlp,destination:'attacker/other-file.txt'};
    const bad=await post('/v1/security/actions/'+envlp.actionId+'/approve',
      {signatureDerBase64:sig(approvalBytes(changed))},token);
    expect(bad.statusCode).toBe(403);
    const goodSig=sig(approvalBytes(envlp));
    const good=await post('/v1/security/actions/'+envlp.actionId+'/approve',
      {signatureDerBase64:goodSig},token);
    expect(good.statusCode).toBe(200);
    expect(good.json().status).toBe('DEMO_SIGNED_NO_EXECUTION');
    expect(good.json().receipt).toContain('DEMO_ONLY_NO_EFFECT');
    const replay=await post('/v1/security/actions/'+envlp.actionId+'/approve',
      {signatureDerBase64:goodSig},token);
    expect(replay.statusCode).toBe(403);
    const afterCompletion=await post(`/v1/tasks/${taskId}/actions/${actionId}/signed-preview`,{},token);
    expect(afterCompletion.statusCode).toBe(403);
    expect(existsSync(join(env.wsRoot,'inbox/report.txt'))).toBe(true);
    expect(existsSync(join(env.wsRoot,'archive/report.txt'))).toBe(false);
  });
  it('fails on expiration, cancellation, and revoked sessions (without dispatch)',async()=>{
    const {token}=await pairedSession();
    const {taskId,actionId}=await pendingMove(token);
    const denied=await preview(token,taskId,actionId);
    const cancel=await post('/v1/security/actions/'+denied.actionId+'/reject',{},token);
    expect(cancel.statusCode).toBe(200);
    const deniedApproval=await post('/v1/security/actions/'+denied.actionId+'/approve',
      {signatureDerBase64:sig(approvalBytes(denied))},token);
    expect(deniedApproval.statusCode).toBe(403);
    const next=await pendingMove(token);
    const expired=await preview(token,next.taskId,next.actionId);
    env.nowMs=expired.expiresAt;
    const expiredApproval=await post('/v1/security/actions/'+expired.actionId+'/approve',
      {signatureDerBase64:sig(approvalBytes(expired))},token);
    expect(expiredApproval.statusCode).toBe(403);
    env.nowMs=expired.issuedAt;
    const revocation=await post('/v1/security/device/revoke',{},token);
    expect(revocation.statusCode).toBe(200);
    const sessionInvalid=await post('/v1/security/actions/'+expired.actionId+'/approve',
      {signatureDerBase64:sig(approvalBytes(expired))},token);
    expect(sessionInvalid.statusCode).toBe(401);
    const freshChallenge=await post('/v1/security/session/challenge',{deviceId:DEVICE});
    expect(freshChallenge.statusCode).toBe(403);
    expect(existsSync(join(env.wsRoot,'archive/report.txt'))).toBe(false);
  });
});
