/**
 * Existing Secure Enclave key is reused for both approval and device challenges.
 * A physical iOS development client is required; Expo Go must fail closed.
 */
import {requireOptionalNativeModule} from 'expo-modules-core';
export interface EnclaveSignerAPI {
  ensureHardwareKey(): Promise<string>;
  signApprovalBytes(bytesUtf8: string): Promise<string>;
  signChallengeBytes(bytesUtf8: string): Promise<string>;
}
const native=requireOptionalNativeModule<EnclaveSignerAPI>('EnclaveSigner');
function available():EnclaveSignerAPI{
  if(!native)throw new Error('Secure Enclave signer unavailable. Install an iOS Development Client (not Expo Go).');
  return native;
}
export default {
  ensureHardwareKey:()=>available().ensureHardwareKey(),
  signApprovalBytes:(bytes:string)=>available().signApprovalBytes(bytes),
  signChallengeBytes:(bytes:string)=>available().signChallengeBytes(bytes),
};
