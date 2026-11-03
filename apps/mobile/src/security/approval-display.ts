import {canonicalize} from "../../../core/src/security/canonical";
/** Render only structured broker envelopes. No model-provided description. */
export interface DisplayEnvelope {
  type:'ahmed.action.approval.v1'; audience:'ahmed-action-broker';
  actionId:string;taskId:string;ownerId:string;deviceId:string;
  serviceId:string;operation:string;destination:string;
  arguments:Record<string,unknown>;idempotencyKey:string;
  nonce:string;policyVersion:string;issuedAt:number;expiresAt:number;
}
const KEYS=[
  'actionId','arguments','audience','destination','deviceId','expiresAt',
  'idempotencyKey','issuedAt','nonce','operation','ownerId',
  'policyVersion','serviceId','taskId','type',
];
export function assertDisplayEnvelope(v:unknown): asserts v is DisplayEnvelope {
  if (!v || typeof v!=='object' || Array.isArray(v)) throw new Error('APPROVAL_INVALID');
  const o=v as Record<string,unknown>;
  if (JSON.stringify(Object.keys(o).sort())!==JSON.stringify(KEYS)) throw new Error('APPROVAL_UNSUPPORTED_FIELDS');
  if (o.type!=='ahmed.action.approval.v1'||o.audience!=='ahmed-action-broker') throw new Error('APPROVAL_WRONG_AUDIENCE');
  for (const name of ['actionId','taskId','ownerId','deviceId','serviceId','operation','destination','idempotencyKey','nonce','policyVersion']) {
    if(typeof o[name]!=='string'||!o[name])throw new Error('APPROVAL_INVALID_FIELD');
  }
  if(!Number.isSafeInteger(o.issuedAt)||!Number.isSafeInteger(o.expiresAt) ||
    Number(o.expiresAt)<=Number(o.issuedAt)||Number(o.expiresAt)>8.64e15)throw new Error('APPROVAL_INVALID_TIME');
  if(!o.arguments||typeof o.arguments!=='object'||Array.isArray(o.arguments))throw new Error('APPROVAL_INVALID_ARGS');
}
export function approvalDisplayRows(e:DisplayEnvelope):{label:string;value:string}[]{
  assertDisplayEnvelope(e);
  const params=JSON.stringify(e.arguments,null,2);
  if(params.length>65536)throw new Error('APPROVAL_TOO_LARGE');
  return [
    {label:'الخدمة',value:e.serviceId},
    {label:'الأمر',value:e.operation},
    {label:'الوجهة / المستفيد',value:e.destination},
    {label:'كل المعاملات الفعلية',value:params},
    {label:'المهمة',value:e.taskId},
    {label:'تنتهي الموافقة',value:new Date(e.expiresAt).toISOString()},
    {label:'معرّف العملية',value:e.actionId},
  ];
}
/** Exact bytes displayed and signed. Every envelope field is included. */
export function approvalCanonicalText(e:DisplayEnvelope):string{
  assertDisplayEnvelope(e);
  return canonicalize(e);
}
export function approvalSignedText(e:DisplayEnvelope):string{
  return 'AHMED-ACTION-APPROVAL-V1\\n'+approvalCanonicalText(e);
}
