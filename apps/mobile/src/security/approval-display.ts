import {canonicalize} from "../../../core/src/security/canonical";
import type {ApprovalContext} from "../../../core/src/security/action-broker";
/** Render only structured broker envelopes. No model-provided description. */
export interface DisplayEnvelope {
  type:'ahmed.action.approval.v1'; audience:'ahmed-action-broker';
  actionId:string;taskId:string;ownerId:string;deviceId:string;
  serviceId:string;operation:string;destination:string;
  arguments:Record<string,unknown>;idempotencyKey:string;
  nonce:string;policyVersion:string;issuedAt:number;expiresAt:number;
  approvalContext?:ApprovalContext;
  canonicalPayloadHash?:string;
}
const KEYS=[
  'actionId','arguments','audience','destination','deviceId','expiresAt',
  'idempotencyKey','issuedAt','nonce','operation','ownerId',
  'policyVersion','serviceId','taskId','type',
];
export function assertDisplayEnvelope(v:unknown): asserts v is DisplayEnvelope {
  if (!v || typeof v!=='object' || Array.isArray(v)) throw new Error('APPROVAL_INVALID');
  const o=v as Record<string,unknown>;
  const isHermes=o.approvalContext!==undefined || o.canonicalPayloadHash!==undefined;
  const allowed=isHermes?[...KEYS,'approvalContext','canonicalPayloadHash'].sort():KEYS;
  if (JSON.stringify(Object.keys(o).sort())!==JSON.stringify(allowed))
    throw new Error('APPROVAL_UNSUPPORTED_FIELDS');
  if(isHermes){
    if(typeof o.canonicalPayloadHash!=='string' || !/^[a-f0-9]{64}$/.test(o.canonicalPayloadHash))
      throw new Error('APPROVAL_INVALID_PAYLOAD_HASH');
    const c=o.approvalContext as Record<string,unknown>|null;
    if(!c || typeof c!=='object' || Array.isArray(c) ||
       JSON.stringify(Object.keys(c).sort())!==JSON.stringify([
         'source','proposalId','runId','callId','registryVersion','workflowDisplayName',
         'workflowDescription','declaredEffects','workflowConfigDigest',
         'effectIdempotencyKey','proposalDeadlineAt','registryTrust'].sort()) ||
       c.source!=='hermes'||c.registryTrust!=='DEMO_UNVERIFIED' ||
       !Array.isArray(c.declaredEffects)||c.declaredEffects.length<1||c.declaredEffects.length>8)
      throw new Error('APPROVAL_INVALID_CONTEXT');
    for(const key of ['proposalId','runId','callId','registryVersion','workflowDisplayName',
      'workflowDescription','workflowConfigDigest']){
      if(typeof c[key]!=='string'||!(c[key] as string).trim()||(c[key] as string).length>1024)
        throw new Error('APPROVAL_INVALID_CONTEXT_FIELD');
    }
    if(typeof c.effectIdempotencyKey!=='string' ||
       !/^nexus_[a-f0-9-]{36}$/.test(c.effectIdempotencyKey) ||
       !Number.isSafeInteger(c.proposalDeadlineAt) || Number(c.proposalDeadlineAt)<=0)
      throw new Error('APPROVAL_INVALID_EFFECT_ID');
    if(!c.declaredEffects.every((v:unknown)=>typeof v==='string'&&v.length<=150&&v.length>0))
      throw new Error('APPROVAL_INVALID_EFFECTS');
  }
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
    ...(e.approvalContext ? [
      {label:'نوع الموافقة',value:'محاكاة غير موثقة على n8n Cloud — لا يوجد تنفيذ خارجي'},
      {label:'الاسم المسجل في Gateway',value:e.approvalContext.workflowDisplayName},
      {label:'شرح العملية',value:e.approvalContext.workflowDescription},
      {label:'التأثيرات المعلنة',value:e.approvalContext.declaredEffects.join(' | ')},
      {label:'مصدر الطلب',value:e.approvalContext.runId+' / '+e.approvalContext.callId},
      {label:'ينتهي طلب الموافقة',value:new Date(e.approvalContext.proposalDeadlineAt).toISOString()},
      {label:'معرّف التنفيذ الموحد',value:e.approvalContext.effectIdempotencyKey},
      {label:'إصدار سجل التعريف',value:e.approvalContext.registryVersion},
      {label:'بصمة إعداد Workflow',value:e.approvalContext.workflowConfigDigest},
      {label:'بصمة طلب الموافقة',value:e.canonicalPayloadHash ?? ''},
    ] : []),
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
  return 'AHMED-ACTION-APPROVAL-V1\n'+approvalCanonicalText(e);
}
