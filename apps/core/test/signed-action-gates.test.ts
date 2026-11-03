import {describe,it,expect,vi} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {ActionBrokerEnforcer,InMemoryActionStore,approvalBytes} from '../src/security/action-broker.js';
import {SqliteActionStore} from '../src/security/sqlite-action-store.js';
import {HardenedMcpClient,definitionDigest} from '../src/security/mcp-client-v2026.js';
import {joinLabels,assertMemorySink,assertExternalEgress} from '../src/security/ifc.js';
import {canonicalize} from '../src/security/canonical.js';

const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const device={deviceId:'iphone-1',ownerId:'owner',publicKeySpkiPem:keys.publicKey.export({type:'spki',format:'pem'}).toString(),revoked:false};
const allow=(i:{serviceId:string;operation:string;destination:string;arguments:Record<string,unknown>})=>
  i.serviceId==='email'&&i.operation==='send'&&i.destination==='owner@example.test';
function fixture(dispatch=vi.fn(async()=>({confirmedReceipt:'upstream-receipt'}))) {
  const store=new InMemoryActionStore();
  const broker=new ActionBrokerEnforcer(store,new Map([[device.deviceId,device]]),{dispatch},allow,()=>1000);
  const e=broker.issue({taskId:'t1',ownerId:'owner',deviceId:device.deviceId,serviceId:'email',
    operation:'send',destination:'owner@example.test',arguments:{subject:'hello'},
    policyVersion:'v1',ttlMs:60_000});
  const signatureDerBase64=sign('sha256',approvalBytes(e),keys.privateKey).toString('base64');
  return {store,broker,e,dispatch,signatureDerBase64};
}

describe('signed action boundary (reference, not deployment certification)',()=>{
  it('rejects model-supplied approved=true without signature',async()=>{
    const f=fixture();
    await expect(f.broker.executeOrReject({actionId:f.e.actionId,deviceId:device.deviceId,signatureDerBase64:'',approved:true} as never)).rejects.toThrow('SECURITY_REJECT');
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('valid signature executes once, repeated approval cannot replay',async()=>{
    const f=fixture();
    const req={actionId:f.e.actionId,deviceId:device.deviceId,signatureDerBase64:f.signatureDerBase64};
    await expect(f.broker.executeOrReject(req)).resolves.toEqual({status:'COMPLETED',receipt:'upstream-receipt'});
    await expect(f.broker.executeOrReject(req)).rejects.toThrow('EXECUTION_HALTED');
    expect(f.dispatch).toHaveBeenCalledTimes(1);
  });
  it('changing broker-stored action destination invalidates signature',async()=>{
    const f=fixture();
    (f.store.find(f.e.actionId)!.envelope as any).destination='attacker@example.test';
    await expect(f.broker.executeOrReject({actionId:f.e.actionId,deviceId:device.deviceId,
      signatureDerBase64:f.signatureDerBase64})).rejects.toThrow('SECURITY_REJECT');
    expect(f.dispatch).not.toHaveBeenCalled();
  });
  it('does not trust an expired or revoked device',async()=>{
    const f=fixture();
    const revoked={...device,revoked:true};
    const broker=new ActionBrokerEnforcer(f.store,new Map([[device.deviceId,revoked]]),{dispatch:f.dispatch},allow,()=>1000);
    await expect(broker.executeOrReject({actionId:f.e.actionId,deviceId:device.deviceId,
      signatureDerBase64:f.signatureDerBase64})).rejects.toThrow('SECURITY_REJECT');
  });
  it('an uncertain upstream result remains quarantined across real SQLite reconnect',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'ahmed-outbox-'));
    let db: Database.Database | undefined;
    try {
      const file=join(dir,'broker.db');
      db=new Database(file);db.pragma('journal_mode = WAL');
      const store=new SqliteActionStore(db);
      const dispatch=vi.fn(async()=>{throw new Error('network failed after provider committed');});
      const broker=new ActionBrokerEnforcer(store,new Map([[device.deviceId,device]]),{dispatch},allow,()=>1000);
      const e=broker.issue({taskId:'t2',ownerId:'owner',deviceId:device.deviceId,serviceId:'email',
        operation:'send',destination:'owner@example.test',arguments:{subject:'x'},policyVersion:'v1',ttlMs:60_000});
      const req={actionId:e.actionId,deviceId:device.deviceId,signatureDerBase64:sign('sha256',approvalBytes(e),keys.privateKey).toString('base64')};
      await expect(broker.executeOrReject(req)).rejects.toThrow('OUTCOME_UNKNOWN');
      db.close();db=undefined;
      db=new Database(file);
      const reopened=new SqliteActionStore(db);reopened.quarantineInterrupted();
      const broker2=new ActionBrokerEnforcer(reopened,new Map([[device.deviceId,device]]),{dispatch},allow,()=>1000);
      await expect(broker2.executeOrReject(req)).rejects.toThrow('EXECUTION_HALTED');
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally{db?.close();rmSync(dir,{recursive:true,force:true});}
  });
  it('never promotes retrieved data to trusted directives or external egress',()=>{
    const taint=joinLabels({confidentiality:'PRIVATE_VAULT',integrity:'TRUSTED_OWNER',sourceIds:['a']},
      {confidentiality:'PUBLIC',integrity:'UNTRUSTED_EXTERNAL',sourceIds:['b']});
    expect(()=>assertMemorySink('TRUSTED_DIRECTIVES',taint)).toThrow('IFC_VIOLATION');
    expect(()=>assertExternalEgress(taint)).toThrow('IFC_VIOLATION');
  });
  it('RFC8785 property permutation is identical and lone surrogate rejected',()=>{
    expect(canonicalize({a:1,z:{b:2,a:1}})).toBe(canonicalize({z:{a:1,b:2},a:1}));
    expect(()=>canonicalize({bad:'\uD800'})).toThrow('INVALID_JCS_UNICODE');
  });
  it('MCP mutation blocked even if server annotates readOnly',async()=>{
    const def={name:'delete',inputSchema:{type:'object'},annotations:{readOnlyHint:true}};
    const client=new HardenedMcpClient(new Map([['crm',{serverId:'crm',url:'https://mcp.example.test/rpc',getScopedToken:async()=> 'scope'}]]),
      new Map([['crm:delete',{serverId:'crm',toolName:'delete',approvedDefinitionHash:definitionDigest(def),
      classification:'EXTERNAL_MUTATION' as const,validateArgs:()=>true}]]));
    await expect(client.callReadOnlyTool({serverId:'crm',toolName:'delete',args:{},observedDefinition:def})).rejects.toThrow('MCP_BYPASS_BLOCKED');
  });
  it('modern MCP call sets routing headers and _meta',async()=>{
    const def={name:'search',inputSchema:{type:'object'}};
    let observed=false;
    const fake=vi.fn(async (_url: string|URL|Request, init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body));
      observed=init?.headers!==undefined&&
        (init.headers as Record<string,string>)['Mcp-Method']==='tools/call'&&
        (init.headers as Record<string,string>)['Mcp-Name']==='search'&&
        body.params._meta['io.modelcontextprotocol/protocolVersion']==='2026-07-28';
      return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{ok:true}}),{
        status:200,headers:{'content-type':'application/json'}
      });
    });
    const client=new HardenedMcpClient(new Map([['s',{serverId:'s',url:'https://mcp.example.test/rpc',getScopedToken:async()=> 'scope'}]]),
      new Map([['s:search',{serverId:'s',toolName:'search',approvedDefinitionHash:definitionDigest(def),
      classification:'READ_PUBLIC' as const,validateArgs:()=>true}]]),fake as typeof fetch);
    await expect(client.callReadOnlyTool({serverId:'s',toolName:'search',args:{},observedDefinition:def})).resolves.toEqual({ok:true});
    expect(observed).toBe(true);
  });
});