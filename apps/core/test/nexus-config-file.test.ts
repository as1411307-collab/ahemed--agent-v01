import { describe,it,expect } from 'vitest';
import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { NexusState } from '../src/nexus/state.js';
import { ensureDesiredFile, importDesiredFile } from '../src/nexus/configFile.js';
import { createNexus } from '../src/nexus/server.js';

describe('nexus.config.json desired configuration only',()=>{
 it('imports validated changes, rejects corrupt file without losing known-good history',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'nexus-config-'));const db=openDb(':memory:');
  try{const state=new NexusState(db),file=path.join(root,'nexus.config.json');ensureDesiredFile(state,file);const config=JSON.parse(readFileSync(file,'utf8'));config.world.reducedMotion=true;writeFileSync(file,JSON.stringify(config));importDesiredFile(state,file);expect(state.getConfig().revision).toBe(2);writeFileSync(file,'invalid');expect(()=>importDesiredFile(state,file)).toThrow();expect(state.getConfig().config.world.reducedMotion).toBe(true);expect(state.listVersions()).toHaveLength(2);}finally{db.close();rmSync(root,{recursive:true,force:true});}
 });
 it('APPLY saves desired file; preview validation does not mutate it',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'nexus-file-api-'));const file=path.join(root,'nexus.config.json');const app=await createNexus({dbFile:path.join(root,'core.db'),workspaceRoot:path.join(root,'ws'),appToken:'testing',configFile:file});
  try{const v=app.state.getConfig(),before=readFileSync(file,'utf8');v.config.world.reducedMotion=true;const headers={authorization:'Bearer testing'};await app.app.inject({method:'POST',url:'/nexus/v1/config/validate',headers,payload:{config:v.config}});expect(readFileSync(file,'utf8')).toBe(before);const r=await app.app.inject({method:'POST',url:'/nexus/v1/config/apply',headers,payload:{config:v.config,expectedRevision:v.revision}});expect(r.statusCode).toBe(200);expect(JSON.parse(readFileSync(file,'utf8')).world.reducedMotion).toBe(true);}finally{await app.close();rmSync(root,{recursive:true,force:true});}
 });
});

it('Gateway survives corrupt desired file using last-known-good configuration and reports failed application',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'nexus-recover-config-'));const file=path.join(root,'nexus.config.json'),dbFile=path.join(root,'core.db');
 let gateway=await createNexus({dbFile,workspaceRoot:path.join(root,'ws'),appToken:'testing',configFile:file});
 try{const saved=gateway.state.getConfig();await gateway.close();writeFileSync(file,'corrupt');gateway=await createNexus({dbFile,workspaceRoot:path.join(root,'ws'),appToken:'testing',configFile:file});const r=await gateway.app.inject({url:'/nexus/v1/config',headers:{authorization:'Bearer testing'}});expect(r.json().revision).toBe(saved.revision);expect(r.json().application.sourceFile).toBe('failed');expect(readFileSync(file,'utf8')).toBe('corrupt');}finally{await gateway.close();rmSync(root,{recursive:true,force:true});}
});
