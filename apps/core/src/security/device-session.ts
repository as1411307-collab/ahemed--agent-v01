import {createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify} from 'node:crypto';
import type Database from 'better-sqlite3';
import {canonicalize} from './canonical.js';
import type {TrustedDevice} from './action-broker.js';

export type Purpose = 'enroll' | 'session';
export interface DeviceIdentity {readonly ownerId: string; readonly deviceId: string}
export interface DeviceChallenge {
  type: 'ahmed.device.enroll.v1' | 'ahmed.device.session.v1';
  audience: 'ahmed-core';
  challengeId: string; deviceId: string; nonce: string;
  issuedAt: number; expiresAt: number; publicKeySpkiPem?: string;
}
const PREFIX: Record<Purpose, string> = {
  enroll: 'AHMED-DEVICE-ENROLL-V1\n',
  session: 'AHMED-DEVICE-SESSION-V1\n',
};
export function deviceChallengeBytes(purpose: Purpose, payload: DeviceChallenge): Buffer {
  if (payload.type !== `ahmed.device.${purpose}.v1` || payload.audience !== 'ahmed-core') throw new Error('SECURITY_REJECT: CHALLENGE_TYPE');
  return Buffer.from(PREFIX[purpose] + canonicalize(payload), 'utf8');
}
function reject(code: string): never {throw new Error('SECURITY_REJECT: ' + code);}
function digest(s: string): Buffer {return createHash('sha256').update(s, 'utf8').digest();}
function same(a: string, b: string): boolean {return timingSafeEqual(digest(a), digest(b));}
function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
}
function checkedPem(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1500) return reject('INVALID_PUBLIC_KEY');
  try {
    const key = createPublicKey(value);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return reject('NOT_P256');
    return key.export({type:'spki',format:'pem'}).toString();
  } catch {return reject('INVALID_PUBLIC_KEY');}
}
function verifyP256(pem: string, bytes: Buffer, signature: unknown): boolean {
  if (typeof signature !== 'string' || signature.length < 64 || signature.length > 200 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try {return verify('sha256', bytes, pem, Buffer.from(signature, 'base64'));} catch {return false;}
}

/**
 * Trial-only signed device sessions. Key material stays in Secure Enclave.
 * No client-bundled long-lived bearer, no trust in a client-supplied ownerId.
 * Enrollment code is a one-use high-entropy secret, entered by the owner,
 * delivered ONLY over HTTPS and consumed durably.
 */
export class DeviceSessions {
  constructor(
    private readonly db: Database.Database,
    private readonly ownerId: string,
    private readonly pairingCode: string | null,
    private readonly now: () => number = Date.now,
  ) {
    if (!validId(ownerId)) throw new Error('CORE_OWNER_ID must be 8-100 ASCII identifier characters');
    if (pairingCode && pairingCode.length < 24) throw new Error('CORE_PAIRING_CODE must have 24+ unpredictable characters');
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_devices (
        device_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, public_key_pem TEXT NOT NULL,
        revoked_at INTEGER, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_challenges (
        challenge_id TEXT PRIMARY KEY, purpose TEXT NOT NULL, device_id TEXT NOT NULL,
        payload_json TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS security_sessions (
        token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, device_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL, revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS security_conversation_owners (
        conversation_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS security_bootstrap (single_id INTEGER PRIMARY KEY CHECK(single_id=1), used_at INTEGER);
      INSERT OR IGNORE INTO security_bootstrap(single_id,used_at) VALUES(1,NULL);
      CREATE TABLE IF NOT EXISTS security_device_recovery (
        code_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL, used_at INTEGER
      );
    `);
    const challengeColumns=(db.pragma('table_info(security_challenges)') as {name:string}[]).map(x=>x.name);
    if(!challengeColumns.includes('recovery_code_hash'))
      db.exec('ALTER TABLE security_challenges ADD COLUMN recovery_code_hash TEXT');

  }
  /**
   * Local maintenance only. Not exposed through a Core HTTP route, LLM tool,
   * Hermes handler or mobile API. Caller must have write access to the Core DB.
   * The old public key and active sessions remain valid UNTIL successful re-pair.
   */
  issueLocalRotationCode(deviceId: string): {code:string;expiresAt:number} {
    if(!validId(deviceId)) return reject('INVALID_DEVICE_ID');
    const device=this.getDevice(deviceId);
    if(!device || device.ownerId!==this.ownerId || device.revoked) return reject('DEVICE_NOT_ENROLLED');
    const code=randomBytes(32).toString('base64url');
    const expiresAt=this.now()+10*60_000, codeHash=digest(code).toString('hex');
    this.db.transaction(()=>{
      this.db.prepare('UPDATE security_device_recovery SET used_at=? WHERE device_id=? AND used_at IS NULL')
        .run(this.now(),deviceId);
      this.db.prepare('INSERT INTO security_device_recovery(code_hash,device_id,expires_at) VALUES(?,?,?)')
        .run(codeHash,deviceId,expiresAt);
    })();
    return {code,expiresAt};
  }

  private createChallenge(purpose: Purpose, deviceId: string,
    publicKeySpkiPem?: string, recoveryCodeHash?:string): DeviceChallenge {
    const now = this.now();
    const payload: DeviceChallenge = {
      type: purpose === 'enroll' ? 'ahmed.device.enroll.v1' : 'ahmed.device.session.v1',
      audience: 'ahmed-core', challengeId: randomUUID(), deviceId,
      nonce: randomBytes(32).toString('base64url'), issuedAt: now, expiresAt: now + 60_000,
      ...(publicKeySpkiPem === undefined ? {} : {publicKeySpkiPem}),
    };
    this.db.prepare('INSERT INTO security_challenges(challenge_id,purpose,device_id,payload_json,expires_at,recovery_code_hash) VALUES(?,?,?,?,?,?)')
      .run(payload.challengeId,purpose,deviceId,canonicalize(payload),payload.expiresAt,recoveryCodeHash??null);
    return payload;
  }
  enrollmentChallenge(input: {pairingCode: unknown; deviceId: unknown; publicKeySpkiPem: unknown}): DeviceChallenge {
    if(!validId(input.deviceId)) return reject('INVALID_DEVICE_ID');
    if(typeof input.pairingCode!=='string'||input.pairingCode.length<24)return reject('PAIRING_DENIED');
    const bootstrap=this.db.prepare('SELECT used_at FROM security_bootstrap WHERE single_id=1')
      .get() as {used_at:number|null}|undefined;
    const initial=bootstrap?.used_at===null && !!this.pairingCode &&
      same(this.pairingCode,input.pairingCode);
    const existing=this.getDevice(input.deviceId);
    let recoveryCodeHash:string|undefined;
    if(initial){
      if(existing)return reject('DEVICE_ALREADY_ENROLLED');
    }else{
      const hash=digest(input.pairingCode).toString('hex');
      const recovered=this.db.prepare('SELECT code_hash FROM security_device_recovery'+
        ' WHERE code_hash=? AND device_id=? AND used_at IS NULL AND expires_at>?')
        .get(hash,input.deviceId,this.now()) as {code_hash:string}|undefined;
      if(!recovered||!existing||existing.revoked||existing.ownerId!==this.ownerId)
        return reject('PAIRING_DENIED');
      recoveryCodeHash=recovered.code_hash;
    }
    const newPem=checkedPem(input.publicKeySpkiPem);
    if(recoveryCodeHash&&existing?.publicKeySpkiPem===newPem)return reject('KEY_NOT_ROTATED');
    return this.createChallenge('enroll',input.deviceId,newPem,recoveryCodeHash);
  }
  private consumeChallenge(purpose: Purpose, challengeId: unknown, deviceId: unknown): DeviceChallenge {
    if (!validId(challengeId) || !validId(deviceId)) return reject('INVALID_CHALLENGE');
    const row = this.db.prepare('SELECT payload_json,expires_at,consumed_at,purpose,device_id FROM security_challenges WHERE challenge_id=?')
      .get(challengeId) as {payload_json:string;expires_at:number;consumed_at:number|null;purpose:string;device_id:string}|undefined;
    if (!row || row.purpose !== purpose || row.device_id !== deviceId ||
       row.consumed_at !== null || this.now() >= row.expires_at) return reject('CHALLENGE_EXPIRED_OR_USED');
    const payload = JSON.parse(row.payload_json) as DeviceChallenge;
    if (payload.expiresAt !== row.expires_at || payload.deviceId !== deviceId) return reject('CHALLENGE_CORRUPT');
    const done = this.db.prepare('UPDATE security_challenges SET consumed_at=? WHERE challenge_id=? AND consumed_at IS NULL AND expires_at>?')
      .run(this.now(),challengeId,this.now());
    if (done.changes !== 1) return reject('CHALLENGE_REPLAY');
    return payload;
  }
  enroll(input: {challengeId: unknown; deviceId: unknown; signatureDerBase64: unknown}): DeviceIdentity {
    return this.db.transaction(() => {
      const stored=this.db.prepare('SELECT recovery_code_hash FROM security_challenges'+
        ' WHERE challenge_id=? AND purpose=\'enroll\' AND device_id=?')
        .get(input.challengeId,input.deviceId) as {recovery_code_hash:string|null}|undefined;
      const payload = this.consumeChallenge('enroll', input.challengeId, input.deviceId);
      const pem = payload.publicKeySpkiPem;
      if (!pem || !verifyP256(pem, deviceChallengeBytes('enroll', payload), input.signatureDerBase64)) return reject('INVALID_SIGNATURE');
      if(stored?.recovery_code_hash){
        const spent=this.db.prepare('UPDATE security_device_recovery SET used_at=?'+
          ' WHERE code_hash=? AND device_id=? AND used_at IS NULL AND expires_at>?')
          .run(this.now(),stored.recovery_code_hash,input.deviceId,this.now());
        if(spent.changes!==1)return reject('RECOVERY_EXPIRED_OR_USED');
        const replaced=this.db.prepare('UPDATE security_devices SET public_key_pem=?'+
          ' WHERE device_id=? AND owner_id=? AND revoked_at IS NULL AND public_key_pem<>?')
          .run(pem,input.deviceId,this.ownerId,pem);
        if(replaced.changes!==1)return reject('DEVICE_ROTATION_DENIED');
        // All previously issued sessions become invalid only AFTER proof of
        // possession of the new Secure Enclave key has been verified.
        this.db.prepare('UPDATE security_sessions SET revoked_at=?'+
          ' WHERE device_id=? AND owner_id=? AND revoked_at IS NULL')
          .run(this.now(),input.deviceId,this.ownerId);
      }else{
        const spent=this.db.prepare('UPDATE security_bootstrap SET used_at=? WHERE single_id=1 AND used_at IS NULL')
          .run(this.now());
        if (spent.changes !== 1) return reject('PAIRING_CONSUMED');
        this.db.prepare('INSERT INTO security_devices(device_id,owner_id,public_key_pem,created_at) VALUES(?,?,?,?)')
          .run(input.deviceId,this.ownerId,pem,this.now());
      }
      return {ownerId:this.ownerId,deviceId:input.deviceId as string};
    })();
  }
  getDevice(deviceId: string): TrustedDevice | undefined {
    const row = this.db.prepare('SELECT device_id,owner_id,public_key_pem,revoked_at FROM security_devices WHERE device_id=?')
      .get(deviceId) as {device_id:string;owner_id:string;public_key_pem:string;revoked_at:number|null}|undefined;
    return row ? {deviceId:row.device_id,ownerId:row.owner_id,publicKeySpkiPem:row.public_key_pem,revoked:row.revoked_at !== null} : undefined;
  }
  sessionChallenge(deviceId: unknown): DeviceChallenge {
    if (!validId(deviceId)) return reject('INVALID_DEVICE_ID');
    const device = this.getDevice(deviceId);
    if (!device || device.revoked) return reject('DEVICE_NOT_ENROLLED');
    return this.createChallenge('session',deviceId);
  }
  openSession(input: {challengeId: unknown; deviceId: unknown; signatureDerBase64: unknown}): {accessToken:string;expiresAt:number;ownerId:string;deviceId:string} {
    return this.db.transaction(() => {
      const payload = this.consumeChallenge('session',input.challengeId,input.deviceId);
      const device = this.getDevice(payload.deviceId);
      if (!device || device.revoked || !verifyP256(device.publicKeySpkiPem,deviceChallengeBytes('session',payload),input.signatureDerBase64)) return reject('INVALID_DEVICE_PROOF');
      const accessToken = randomBytes(32).toString('base64url');
      const expiresAt = this.now() + 5 * 60_000;
      this.db.prepare('INSERT INTO security_sessions(token_hash,owner_id,device_id,expires_at) VALUES(?,?,?,?)')
        .run(digest(accessToken).toString('hex'),device.ownerId,device.deviceId,expiresAt);
      return {accessToken,expiresAt,ownerId:device.ownerId,deviceId:device.deviceId};
    })();
  }
  authenticate(header: unknown): DeviceIdentity | undefined {
    if (typeof header !== 'string') return;
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
    if (!match) return;
    const row = this.db.prepare(`
      SELECT s.owner_id,s.device_id FROM security_sessions s
      JOIN security_devices d ON d.device_id=s.device_id AND d.owner_id=s.owner_id
      WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND d.revoked_at IS NULL
    `).get(digest(match[1]).toString('hex'),this.now()) as {owner_id:string;device_id:string}|undefined;
    return row && {ownerId:row.owner_id,deviceId:row.device_id};
  }
  revoke(identity: DeviceIdentity): void {
    this.db.transaction(() => {
      const changed = this.db.prepare('UPDATE security_devices SET revoked_at=? WHERE device_id=? AND owner_id=? AND revoked_at IS NULL')
        .run(this.now(),identity.deviceId,identity.ownerId);
      if (changed.changes !== 1) return reject('DEVICE_REVOKED');
      this.db.prepare('UPDATE security_sessions SET revoked_at=? WHERE device_id=? AND owner_id=? AND revoked_at IS NULL')
        .run(this.now(),identity.deviceId,identity.ownerId);
    })();
  }
  canReadConversation(id: string, ownerId: string): boolean {
    const row=this.db.prepare('SELECT owner_id FROM security_conversation_owners WHERE conversation_id=?').get(id) as {owner_id:string}|undefined;
    if (row) return row.owner_id === ownerId;
    // New conversations can be read as empty before first message; preexisting unowned legacy conversations cannot be adopted.
    return !this.db.prepare('SELECT 1 AS x FROM conversations WHERE id=?').get(id);
  }
  claimConversation(id: string, ownerId: string): void {
    if (!validId(id) || !this.canReadConversation(id,ownerId)) return reject('CONVERSATION_NOT_OWNED');
    this.db.prepare('INSERT OR IGNORE INTO security_conversation_owners(conversation_id,owner_id) VALUES(?,?)')
      .run(id,ownerId);
    if (!this.canReadConversation(id,ownerId)) return reject('CONVERSATION_NOT_OWNED');
  }
  ownsTask(taskId: string, ownerId: string): boolean {
    return !!this.db.prepare(`SELECT 1 AS x FROM tasks t
      JOIN security_conversation_owners o ON o.conversation_id=t.conversation_id
      WHERE t.id=? AND o.owner_id=?`).get(taskId,ownerId);
  }
}
