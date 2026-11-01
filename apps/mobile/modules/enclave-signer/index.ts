/**
 * Local Expo module. No JavaScript signing-key fallback is allowed.
 * Requires iOS development build and verified device enrollment.
 */
import {requireNativeModule} from 'expo-modules-core';
export interface EnclaveSignerAPI {
  ensureHardwareKey(): Promise<string>;
  signApprovalBytes(bytesUtf8: string): Promise<string>;
}
export default requireNativeModule<EnclaveSignerAPI>('EnclaveSigner');