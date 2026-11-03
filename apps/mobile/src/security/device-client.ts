import AsyncStorage from '@react-native-async-storage/async-storage';
import EnclaveSigner from '../../modules/enclave-signer';
import {canonicalize} from '../../../core/src/security/canonical';

const CORE_URL=(process.env.EXPO_PUBLIC_CORE_URL??'').replace(/\/+$/,'');
const DEVICE_ID_KEY='ahmed.secure.device_id.v1';
let cached:{accessToken:string;expiresAt:number}|null=null;
let pending:Promise<string>|null=null;

interface Challenge {
  type:'ahmed.device.enroll.v1'|'ahmed.device.session.v1';
  audience:'ahmed-core';challengeId:string;deviceId:string;nonce:string;
  issuedAt:number;expiresAt:number;publicKeySpkiPem?:string;
}
function endpoint():string {
  // Authenticated enrollment and bearer tokens MUST NOT cross the LAN in plaintext.
  if (!/^https:\/\//i.test(CORE_URL)) throw new Error('CORE_HTTPS_REQUIRED: Configure an HTTPS Core endpoint.');
  return CORE_URL;
}
async function post<T>(path:string,body:unknown,token?:string):Promise<T>{
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const res=await fetch(endpoint()+path,{method:'POST',headers:{
      'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
    },body:JSON.stringify(body),signal:ctrl.signal});
    const parsed=await res.json().catch(()=>null) as (T & {error?:{message:string}})|null;
    if(!res.ok)throw new Error(parsed?.error?.message||'Core returned HTTP '+res.status);
    if(!parsed)throw new Error('Empty Core response');
    return parsed;
  }finally{clearTimeout(timer);}
}
export async function hasPairedDevice():Promise<boolean>{
  return !!await AsyncStorage.getItem(DEVICE_ID_KEY);
}
/** Device identifier is public routing metadata, NOT a secret or an auth token. */
function newDeviceId():string{
  return 'iphone-'+Date.now().toString(36)+'-'+Array.from({length:6},()=>Math.floor(Math.random()*0x10000).toString(16).padStart(4,'0')).join('');
}
function signedChallengeBytes(p:Challenge,purpose:'enroll'|'session'):string{
  if(p.audience!=='ahmed-core'||p.type!==`ahmed.device.${purpose}.v1`||p.expiresAt<=Date.now())
    throw new Error('Invalid or expired Core challenge');
  return `AHMED-DEVICE-${purpose.toUpperCase()}-V1\n`+canonicalize(p);
}
export async function enrollDevice(pairingCode:string):Promise<void>{
  if(pairingCode.trim().length<24)throw new Error('Enter the 24+ character one-time code from Core.');
  // Do not persist the pairing code or export Secure Enclave private key material.
  const publicKeySpkiPem=await EnclaveSigner.ensureHardwareKey();
  const deviceId=(await AsyncStorage.getItem(DEVICE_ID_KEY))||newDeviceId();
  const challenge=await post<{payload:Challenge}>('/v1/security/enroll/challenge',
    {deviceId,publicKeySpkiPem,pairingCode:pairingCode.trim()});
  const signatureDerBase64=await EnclaveSigner.signChallengeBytes(signedChallengeBytes(challenge.payload,'enroll'));
  const out=await post<{deviceId:string;ownerId:string}>('/v1/security/enroll',{
    challengeId:challenge.payload.challengeId,deviceId,signatureDerBase64,
  });
  if(out.deviceId!==deviceId)throw new Error('Core returned the wrong device');
  await AsyncStorage.setItem(DEVICE_ID_KEY,deviceId);
  cached=null;
}
async function openSession():Promise<string>{
  const deviceId=await AsyncStorage.getItem(DEVICE_ID_KEY);
  if(!deviceId)throw new Error('PAIRING_REQUIRED');
  const challenge=await post<{payload:Challenge}>('/v1/security/session/challenge',{deviceId});
  const signatureDerBase64=await EnclaveSigner.signChallengeBytes(signedChallengeBytes(challenge.payload,'session'));
  const session=await post<{accessToken:string;expiresAt:number;deviceId:string}>('/v1/security/session',{
    deviceId,challengeId:challenge.payload.challengeId,signatureDerBase64,
  });
  if(session.deviceId!==deviceId || typeof session.accessToken!=='string' || session.expiresAt<=Date.now())
    throw new Error('Invalid device session from Core');
  cached={accessToken:session.accessToken,expiresAt:session.expiresAt};
  return session.accessToken;
}
export async function getDeviceAccessToken():Promise<string>{
  if(cached && cached.expiresAt>Date.now()+15_000)return cached.accessToken;
  if(!pending)pending=openSession().finally(()=>{pending=null;});
  return pending;
}
export function clearDeviceSession():void{cached=null;}
export async function revokeOwnDevice():Promise<void>{
  const token=await getDeviceAccessToken();
  await post('/v1/security/device/revoke',{},token);
  clearDeviceSession();
  await AsyncStorage.removeItem(DEVICE_ID_KEY);
}
