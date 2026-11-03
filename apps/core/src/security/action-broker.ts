import {randomUUID, randomBytes, createHash, verify as verifySignature} from 'node:crypto';
import {canonicalize, type JsonValue} from './canonical.js';

export interface ApprovalContext {
  readonly source: 'hermes';
  readonly proposalId: string;
  readonly runId: string;
  readonly callId: string;
  // Registry data is resolved by Gateway, NEVER supplied by the model.
  readonly registryVersion: string;
  readonly workflowDisplayName: string;
  readonly workflowDescription: string;
  readonly declaredEffects: readonly string[];
  readonly workflowConfigDigest: string;
  readonly registryTrust: 'DEMO_UNVERIFIED';
}

export interface ActionEnvelope {
  readonly type: 'ahmed.action.approval.v1';
  readonly audience: 'ahmed-action-broker';
  readonly actionId: string; readonly taskId: string; readonly ownerId: string;
  readonly deviceId: string; readonly serviceId: string; readonly operation: string;
  readonly destination: string; readonly arguments: Record<string, JsonValue>;
  readonly idempotencyKey: string; readonly nonce: string;
  readonly policyVersion: string; readonly issuedAt: number; readonly expiresAt: number;
  readonly approvalContext?: ApprovalContext;
  /** SHA256 of complete canonical signed intent EXCLUDING this field itself. */
  readonly canonicalPayloadHash?: string;
}
export type ActionState = 'PENDING' | 'EXECUTING' | 'UNKNOWN' | 'COMPLETED';
export interface ActionRecord {envelope: ActionEnvelope; status: ActionState; receipt?: string}
export interface ActionStore {
  insert(record: ActionRecord): void;
  find(id: string): ActionRecord | undefined;
  reserve(id: string): boolean; // durable atomic PENDING => EXECUTING
  markUnknown(id: string): void;
  markCompleted(id: string, receipt: string): void;
  quarantineInterrupted(): void; // never automatically replay uncertain effects
}
export interface TrustedDevice {
  readonly deviceId: string;
  readonly ownerId: string;
  readonly publicKeySpkiPem: string;
  readonly revoked: boolean;
}
export interface ActionDispatcher {
  dispatch(envelope: Readonly<ActionEnvelope>): Promise<{confirmedReceipt: string}>;
}
export type ServicePolicy = (input: {
  serviceId: string; operation: string; destination: string;
  arguments: Record<string, JsonValue>;
  approvalContext?: ApprovalContext;
}) => boolean;

export function approvalBytes(envelope: ActionEnvelope): Buffer {
  return Buffer.from('AHMED-ACTION-APPROVAL-V1\n' + canonicalize(envelope), 'utf8');
}
export function canonicalPayloadHash(envelope: ActionEnvelope): string {
  // No self-referential hash. Includes run/call IDs, arguments and expiration.
  const {canonicalPayloadHash: _ignored, ...intent} = envelope;
  return createHash('sha256')
    .update('AHMED-ACTION-INTENT-V1\n' + canonicalize(intent), 'utf8').digest('hex');
}
export function actionDigest(envelope: ActionEnvelope): string {
  return createHash('sha256').update(approvalBytes(envelope)).digest('hex');
}

/**
 * Broker reference core. Do not expose issue() or device enrollment directly
 * to LLM/tools. Production requires an authenticated owner + isolated broker
 * process with exclusive access to destination credentials.
 */
export class ActionBrokerEnforcer {
  constructor(
    private readonly store: ActionStore,
    private readonly devices: ReadonlyMap<string, TrustedDevice>,
    private readonly dispatcher: ActionDispatcher,
    private readonly authorize: ServicePolicy,
    private readonly now: () => number = Date.now,
  ) {}

  issue(input: {
    taskId: string; ownerId: string; deviceId: string;
    serviceId: string; operation: string; destination: string;
    arguments: Record<string, JsonValue>;
    policyVersion: string; ttlMs: number;
    approvalContext?: ApprovalContext;
  }): ActionEnvelope {
    const device = this.devices.get(input.deviceId);
    if (!device || device.revoked || device.ownerId !== input.ownerId) throw new Error('SECURITY_REJECT: DEVICE_NOT_ENROLLED');
    if (!Number.isSafeInteger(input.ttlMs) || input.ttlMs <= 0 || input.ttlMs > 300_000) {
      throw new Error('SECURITY_REJECT: INVALID_TTL');
    }
    for (const s of [input.taskId, input.ownerId, input.deviceId, input.serviceId,
       input.operation, input.destination, input.policyVersion]) {
      if (typeof s !== 'string' || !s.trim() || s.length > 1024) throw new Error('SECURITY_REJECT: INVALID_FIELD');
    }
    // A fixed service policy is necessary; arbitrary tool names are not authority.
    if (!this.authorize(input)) throw new Error('SECURITY_REJECT: POLICY_DENIED');
    const bytes = canonicalize(input.arguments);
    if (Buffer.byteLength(bytes, 'utf8') > 65_536) throw new Error('SECURITY_REJECT: TOO_LARGE');
    const unsigned: ActionEnvelope = {
      type: 'ahmed.action.approval.v1', audience: 'ahmed-action-broker',
      actionId: randomUUID(), taskId: input.taskId,
      ownerId: input.ownerId, deviceId: input.deviceId,
      serviceId: input.serviceId, operation: input.operation,
      destination: input.destination,
      arguments: JSON.parse(bytes) as Record<string, JsonValue>,
      idempotencyKey: randomUUID(), nonce: randomBytes(24).toString('base64url'),
      policyVersion: input.policyVersion, issuedAt: this.now(),
      expiresAt: this.now() + input.ttlMs,
      ...(input.approvalContext ? {approvalContext: structuredClone(input.approvalContext)} : {}),
    };
    const e: ActionEnvelope = input.approvalContext
      ? {...unsigned,canonicalPayloadHash:canonicalPayloadHash(unsigned)} : unsigned;
    canonicalize(e);
    this.store.insert({envelope:e,status:'PENDING'});
    return structuredClone(e);
  }

  async executeOrReject(input: {
    actionId: string; deviceId: string; signatureDerBase64: string;
  }): Promise<{status: 'COMPLETED'; receipt: string}> {
    const row = this.store.find(input.actionId);
    if (!row) throw new Error('SECURITY_REJECT: ACTION_NOT_FOUND');
    if (row.status !== 'PENDING') throw new Error('EXECUTION_HALTED: NOT_PENDING');
    const e = row.envelope;
    const device = this.devices.get(input.deviceId);
    if (!device || device.revoked || device.ownerId !== e.ownerId || device.deviceId !== e.deviceId) {
      throw new Error('SECURITY_REJECT: DEVICE_MISMATCH');
    }
    if (this.now() < e.issuedAt || this.now() >= e.expiresAt) {
      throw new Error('SECURITY_REJECT: EXPIRED');
    }
    if ((e.approvalContext === undefined) !== (e.canonicalPayloadHash === undefined) ||
      (e.approvalContext && e.canonicalPayloadHash !== canonicalPayloadHash(e))) {
      throw new Error('SECURITY_REJECT: APPROVAL_INTENT_HASH_MISMATCH');
    }
    if (!this.authorize(e)) throw new Error('SECURITY_REJECT: CURRENT_POLICY_DENIED');
    if (typeof input.signatureDerBase64 !== 'string' ||
      input.signatureDerBase64.length < 64 || input.signatureDerBase64.length > 200 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.signatureDerBase64)) {
      throw new Error('SECURITY_REJECT: INVALID_SIGNATURE_FORMAT');
    }
    let valid = false;
    try {
      valid = verifySignature('sha256', approvalBytes(e), device.publicKeySpkiPem,
        Buffer.from(input.signatureDerBase64, 'base64'));
    } catch {valid = false;}
    if (!valid) throw new Error('SECURITY_REJECT: INVALID_SIGNATURE');
    // CAS is durable BEFORE the dispatcher touches any external service.
    if (!this.store.reserve(e.actionId)) throw new Error('EXECUTION_HALTED: ALREADY_RESERVED');
    try {
      const result = await this.dispatcher.dispatch(structuredClone(e));
      if (typeof result.confirmedReceipt !== 'string' || !result.confirmedReceipt) {
        throw new Error('UPSTREAM_RECEIPT_MISSING');
      }
      this.store.markCompleted(e.actionId, result.confirmedReceipt);
      return {status:'COMPLETED',receipt: result.confirmedReceipt};
    } catch {
      this.store.markUnknown(e.actionId);
      throw new Error('OUTCOME_UNKNOWN: RECONCILE_MANUALLY');
    }
  }
}
export class InMemoryActionStore implements ActionStore {
  private readonly items = new Map<string, ActionRecord>();
  insert(record: ActionRecord): void {
    const id = record.envelope.actionId;
    if (this.items.has(id)) throw new Error('DUPLICATE_ACTION');
    this.items.set(id, structuredClone(record));
  }
  find(id: string): ActionRecord | undefined {return this.items.get(id);}
  reserve(id: string): boolean {
    const row = this.items.get(id);
    if (!row || row.status !== 'PENDING') return false;
    row.status = 'EXECUTING';
    return true;
  }
  markUnknown(id: string): void {
    const row = this.items.get(id);
    if (!row || row.status !== 'EXECUTING') throw new Error('INVALID_STATE');
    row.status = 'UNKNOWN';
  }
  markCompleted(id: string, receipt: string): void {
    const row = this.items.get(id);
    if (!row || row.status !== 'EXECUTING') throw new Error('INVALID_STATE');
    row.status = 'COMPLETED'; row.receipt = receipt;
  }
  quarantineInterrupted(): void {
    for (const item of this.items.values()) if (item.status === 'EXECUTING') item.status = 'UNKNOWN';
  }
}