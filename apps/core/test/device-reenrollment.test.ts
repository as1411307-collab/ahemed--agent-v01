import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {openDb,type DB} from '../src/db.js';
import {DeviceSessions,deviceChallengeBytes} from '../src/security/device-session.js';
import {makeEnv,type Env} from './helpers.js';

const OWNER='owner-secure-001';
const DEVICE='iphone-safe-silent-0001';
const OTHER='iphone-other-00000001';
const BOOTSTRAP='original-one-time-bootstrap-secret-0123456789';
const old=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const fresh=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const oldPem=old.publicKey.export({type:'spki',format:'pem'}).toString();
const freshPem=fresh.publicKey.export({type:'spki',format:'pem'}).toString();
let env:Env,db:DB,devices:DeviceSessions;
function signature(bytes:Buffer,key:typeof old){
  return sign('sha256',bytes,key.privateKey).toString('base64');
}
beforeEach(()=>{
  env=makeEnv();db=openDb(env.dbFile);
  devices=new DeviceSessions(db,OWNER,BOOTSTRAP,()=>env.nowMs);
});
afterEach(()=>{db.close();env.cleanup();});
function enroll(code:string,pem:string,key:typeof old,deviceId=DEVICE){
  const challenge=devices.enrollmentChallenge({pairingCode:code,deviceId,publicKeySpkiPem:pem});
  return devices.enroll({challengeId:challenge.challengeId,deviceId,
    signatureDerBase64:signature(deviceChallengeBytes('enroll',challenge),key)});
}
function session(key:typeof old){
  const challenge=devices.sessionChallenge(DEVICE);
  return devices.openSession({challengeId:challenge.challengeId,deviceId:DEVICE,
    signatureDerBase64:signature(deviceChallengeBytes('session',challenge),key)});
}
describe('local-only silent Secure Enclave device re-enrollment contract',()=>{
  it('does not reset bootstrap or revoke existing sessions until new-key proof is valid',()=>{
    expect(enroll(BOOTSTRAP,oldPem,old)).toEqual({ownerId:OWNER,deviceId:DEVICE});
    const oldSession=session(old);
    expect(devices.authenticate('Bearer '+oldSession.accessToken)?.deviceId).toBe(DEVICE);
    const recovery=devices.issueLocalRotationCode(DEVICE);
    expect(recovery.code.length).toBeGreaterThanOrEqual(40);
    expect(recovery.expiresAt-env.nowMs).toBe(600_000);
    expect(devices.authenticate('Bearer '+oldSession.accessToken)?.deviceId).toBe(DEVICE);
    expect(()=>devices.enrollmentChallenge({
      pairingCode:recovery.code,deviceId:DEVICE,publicKeySpkiPem:oldPem
    })).toThrow('KEY_NOT_ROTATED');
    expect(()=>devices.enrollmentChallenge({
      pairingCode:recovery.code,deviceId:OTHER,publicKeySpkiPem:freshPem
    })).toThrow('PAIRING_DENIED');
    const challenge=devices.enrollmentChallenge({
      pairingCode:recovery.code,deviceId:DEVICE,publicKeySpkiPem:freshPem
    });
    expect(()=>devices.enroll({challengeId:challenge.challengeId,deviceId:DEVICE,
      signatureDerBase64:signature(deviceChallengeBytes('enroll',challenge),old)
    })).toThrow('INVALID_SIGNATURE');
    expect(devices.getDevice(DEVICE)?.publicKeySpkiPem).toBe(oldPem);
    expect(devices.authenticate('Bearer '+oldSession.accessToken)?.deviceId).toBe(DEVICE);
    // Failed proof rolls back challenge consumption atomically.
    expect(devices.enroll({challengeId:challenge.challengeId,deviceId:DEVICE,
      signatureDerBase64:signature(deviceChallengeBytes('enroll',challenge),fresh)
    })).toMatchObject({deviceId:DEVICE});
    expect(devices.getDevice(DEVICE)?.publicKeySpkiPem).toBe(freshPem);
    expect(devices.authenticate('Bearer '+oldSession.accessToken)).toBeUndefined();
    expect(()=>session(old)).toThrow('INVALID_DEVICE_PROOF');
    expect(session(fresh).deviceId).toBe(DEVICE);
    expect(()=>devices.enrollmentChallenge({
      pairingCode:recovery.code,deviceId:DEVICE,publicKeySpkiPem:freshPem
    })).toThrow('PAIRING_DENIED');
    expect(()=>enroll(BOOTSTRAP,oldPem,old,OTHER)).toThrow('PAIRING_DENIED');
  });
  it('expires one-time recovery codes without altering the stored public key',()=>{
    enroll(BOOTSTRAP,oldPem,old);
    const code=devices.issueLocalRotationCode(DEVICE);
    env.nowMs=code.expiresAt;
    expect(()=>devices.enrollmentChallenge({
      pairingCode:code.code,deviceId:DEVICE,publicKeySpkiPem:freshPem
    })).toThrow('PAIRING_DENIED');
    expect(devices.getDevice(DEVICE)?.publicKeySpkiPem).toBe(oldPem);
  });
  it('invalidates an older unconsumed recovery code upon local reissuance',()=>{
    enroll(BOOTSTRAP,oldPem,old);
    const a=devices.issueLocalRotationCode(DEVICE);
    const b=devices.issueLocalRotationCode(DEVICE);
    expect(a.code).not.toBe(b.code);
    expect(()=>devices.enrollmentChallenge({
      pairingCode:a.code,deviceId:DEVICE,publicKeySpkiPem:freshPem
    })).toThrow('PAIRING_DENIED');
    const c=devices.enrollmentChallenge({
      pairingCode:b.code,deviceId:DEVICE,publicKeySpkiPem:freshPem
    });
    expect(c.deviceId).toBe(DEVICE);
    // A pending challenge also fails if the code expires before final signature.
    env.nowMs=b.expiresAt;
    expect(()=>devices.enroll({challengeId:c.challengeId,deviceId:DEVICE,
      signatureDerBase64:signature(deviceChallengeBytes('enroll',c),fresh)
    })).toThrow();
  });
});
