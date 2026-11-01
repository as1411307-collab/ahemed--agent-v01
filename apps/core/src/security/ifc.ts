/**
 * Integrity/confidentiality labels attached to artifacts, NOT a global
 * sticky flag on the entire agent session. XML tags are not a security boundary.
 */
export type Confidentiality = 'PUBLIC' | 'PRIVATE_VAULT';
export type Integrity = 'TRUSTED_OWNER' | 'UNTRUSTED_EXTERNAL';
export interface Labels {
  confidentiality: Confidentiality;
  integrity: Integrity;
  sourceIds: readonly string[];
}
export function joinLabels(...labels: readonly Labels[]): Labels {
  return Object.freeze({
    confidentiality: labels.some(x=>x.confidentiality==='PRIVATE_VAULT')?'PRIVATE_VAULT':'PUBLIC',
    integrity: labels.some(x=>x.integrity==='UNTRUSTED_EXTERNAL')?'UNTRUSTED_EXTERNAL':'TRUSTED_OWNER',
    sourceIds: Object.freeze([...new Set(labels.flatMap(x=>[...x.sourceIds]))].sort()),
  });
}
export function assertMemorySink(kind:'TRUSTED_DIRECTIVES'|'UNTRUSTED_CLAIMS', labels: Labels): void {
  if (kind==='TRUSTED_DIRECTIVES' && labels.integrity!=='TRUSTED_OWNER') {
    throw new Error('IFC_VIOLATION: UNTRUSTED_CANNOT_WRITE_OWNER_DIRECTIVES');
  }
  // Trusted label is NOT sufficient: owner signature is separately required.
}
export function assertExternalEgress(labels: Labels): void {
  if (labels.confidentiality==='PRIVATE_VAULT') {
    throw new Error('IFC_VIOLATION: PRIVATE_DATA_OUTBOUND_BLOCKED');
  }
  // Explicit declassification must be action-specific and approved by broker.
}
export function assertAuthorizationInfluence(labels:Labels):void {
  if (labels.integrity!=='TRUSTED_OWNER') {
    throw new Error('IFC_VIOLATION: DOCUMENT_CANNOT_AUTHORIZE_ACTION');
  }
}