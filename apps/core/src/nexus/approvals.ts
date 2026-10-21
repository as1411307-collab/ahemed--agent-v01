import type { DB } from '../db.js';
import { HermesError } from './hermes.js';
/** Durable exact-operation window and decision reservation. Never renewable by replay. */
export class ApprovalWindows {
 constructor(private db:DB){db.exec(`CREATE TABLE IF NOT EXISTS nexus_approval_windows(run_id TEXT NOT NULL,request_id TEXT NOT NULL,first_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL,decision TEXT,state TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(run_id,request_id));`);}
 observe(runId:string,approval:Record<string,unknown>,now=Date.now()){
  const requestId=approval.request_id;if(typeof requestId!=='string'||!requestId||requestId.length>256)throw new HermesError('Invalid native approval identity.',409);
  let deadline=now+15*60*1000;
  if(approval.expires_at!==undefined){const raw=approval.expires_at;const n=typeof raw==='number'?raw*1000:Date.parse(String(raw));if(!Number.isFinite(n))throw new HermesError('Invalid approval deadline; denied.',410);deadline=Math.min(deadline,n);}
  this.db.prepare('INSERT OR IGNORE INTO nexus_approval_windows(run_id,request_id,first_seen,expires_at) VALUES (?,?,?,?)').run(runId,requestId,now,deadline);
  // A stricter upstream deadline can shorten, never extend, the original window.
  this.db.prepare('UPDATE nexus_approval_windows SET expires_at=MIN(expires_at,?) WHERE run_id=? AND request_id=?').run(deadline,runId,requestId);
  return this.get(runId,requestId)!;
 }
 get(runId:string,requestId:string){return this.db.prepare('SELECT expires_at,decision,state FROM nexus_approval_windows WHERE run_id=? AND request_id=?').get(runId,requestId) as {expires_at:number;decision:string|null;state:string}|undefined;}
 reserve(runId:string,requestId:string,decision:'once'|'deny',now=Date.now()){
  return this.db.transaction(()=>{const row=this.get(runId,requestId);if(!row)throw new HermesError('Approval has not been observed.',409);if(now>=row.expires_at)throw new HermesError('Approval expired.',410);
   if(row.decision){if(row.decision!==decision)throw new HermesError('A different approval decision was already requested.',409);return{forward:false,state:row.state};}
   this.db.prepare("UPDATE nexus_approval_windows SET decision=?,state='requested' WHERE run_id=? AND request_id=?").run(decision,runId,requestId);return{forward:true,state:'requested'};
  }).immediate();
 }
 resolved(runId:string,requestId:string){this.db.prepare("UPDATE nexus_approval_windows SET state='resolved' WHERE run_id=? AND request_id=?").run(runId,requestId);}
}
