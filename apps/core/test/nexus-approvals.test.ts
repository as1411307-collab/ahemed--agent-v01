import { describe,it,expect } from 'vitest';
import { openDb } from '../src/db.js';
import { ApprovalWindows } from '../src/nexus/approvals.js';
describe('Durable exact-operation approval window',()=>{
 it('does not renew expiry on replay, refuses boundary and binds each request/run',()=>{
  const db=openDb(':memory:');try{const approvals=new ApprovalWindows(db);approvals.observe('run-a',{request_id:'one'},0);approvals.observe('run-a',{request_id:'one'},899999);approvals.observe('run-b',{request_id:'one'},900000);
   expect(()=>approvals.reserve('run-a','one','once',900000)).toThrow('expired');expect(approvals.reserve('run-b','one','deny',900001).forward).toBe(true);
  }finally{db.close();}
 });
 it('reserves once, never forwards retries or contradictory decisions after uncertain outcome',()=>{
  const db=openDb(':memory:');try{const a=new ApprovalWindows(db);a.observe('r',{request_id:'x'},0);expect(a.reserve('r','x','once',1).forward).toBe(true);const reopened=new ApprovalWindows(db);expect(reopened.reserve('r','x','once',2)).toEqual({forward:false,state:'requested'});expect(()=>reopened.reserve('r','x','deny',2)).toThrow('different');}finally{db.close();}
 });
});
