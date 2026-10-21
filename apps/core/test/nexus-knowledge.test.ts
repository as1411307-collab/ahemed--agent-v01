import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { Workspace } from '../src/workspace.js';
import { KnowledgeVault } from '../src/nexus/knowledge.js';

describe('Knowledge Vault lexical index (not vector RAG)',()=>{
 it('enforces ACL before retrieval and preserves immutable source citations',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'nexus-kb-'));const db=openDb(':memory:');const ws=new Workspace(root);
  try{
   writeFileSync(path.join(root,'inbox','memo.md'),'Private research about orbital energy.');
   const kb=new KnowledgeVault(db,ws);const doc=await kb.ingest('inbox/memo.md',['principal']);
   expect(kb.search('research','energy')).toEqual([]);
   const hits=kb.search('principal','energy');expect(hits).toHaveLength(1);
   expect(hits[0]?.citation).toMatchObject({documentId:doc.id,source:'inbox/memo.md',sha256:doc.sha256,chunk:0});
   writeFileSync(path.join(root,'inbox','memo.md'),'Updated energy document.');
   const newer=await kb.ingest('inbox/memo.md',['principal']);expect(newer.id).not.toBe(doc.id);
   expect(kb.list()).toHaveLength(2);kb.archive(doc.id);expect(kb.search('principal','orbital')).toEqual([]);
   expect(kb.list()).toHaveLength(2);
   await expect(kb.ingest('../outside.md',['principal'])).rejects.toThrow();
  }finally{db.close();rmSync(root,{recursive:true,force:true});}
 });
});
