import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { DB } from '../db.js';
import type { Workspace } from '../workspace.js';
import { readFileTool } from '../tools.js';

interface Document {id:string;source:string;sha256:string;allowedAgents:string[];createdAt:string;archived:boolean;indexType:'lexical'}
/** Owner-controlled document index, deliberately separate from Hermes conversational memory.
 * Lexical retrieval is implemented; embeddings/pgvector remain explicitly unavailable.
 */
export class KnowledgeVault {
 constructor(private db:DB,private workspace:Workspace){
  db.exec(`CREATE TABLE IF NOT EXISTS nexus_documents(id TEXT PRIMARY KEY,source TEXT NOT NULL,sha256 TEXT NOT NULL,acl TEXT NOT NULL,created_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS nexus_chunks(document_id TEXT NOT NULL REFERENCES nexus_documents(id),position INTEGER NOT NULL,content TEXT NOT NULL,PRIMARY KEY(document_id,position));`);
 }
 async ingest(source:string,allowedAgents:string[]):Promise<Document>{
  if(!Array.isArray(allowedAgents)||!allowedAgents.length||allowedAgents.some(a=>typeof a!=='string'||!a||a.length>100))throw new Error('Explicit document agent ACL required.');
  const absolute=this.workspace.resolve(source);if(statSync(absolute).size>1_048_576)throw new Error('Knowledge document exceeds 1 MiB.');
  const bytes=readFileSync(absolute);const sha256=createHash('sha256').update(bytes).digest('hex');
  const read=await readFileTool(this.workspace,{path:source});
  // Detect changed source while parsing; never cite a hash for different content.
  if(createHash('sha256').update(readFileSync(absolute)).digest('hex')!==sha256)throw new Error('Source changed while indexing.');
  const doc:Document={id:randomUUID(),source:read.path,sha256,allowedAgents:[...new Set(allowedAgents)],createdAt:new Date().toISOString(),archived:false,indexType:'lexical'};
  this.db.transaction(()=>{
   this.db.prepare('INSERT INTO nexus_documents(id,source,sha256,acl,created_at) VALUES (?,?,?,?,?)').run(doc.id,doc.source,doc.sha256,JSON.stringify(doc.allowedAgents),doc.createdAt);
   const insert=this.db.prepare('INSERT INTO nexus_chunks(document_id,position,content) VALUES (?,?,?)');
   for(let i=0,pos=0;i<read.content.length;i+=1200,pos++)insert.run(doc.id,pos,read.content.slice(i,i+1400));
  })();return doc;
 }
 list():Document[]{return (this.db.prepare('SELECT * FROM nexus_documents ORDER BY created_at,id').all() as Record<string,unknown>[]).map(row=>({id:String(row.id),source:String(row.source),sha256:String(row.sha256),allowedAgents:JSON.parse(String(row.acl)),createdAt:String(row.created_at),archived:!!row.archived,indexType:'lexical'}));}
 archive(id:string){const result=this.db.prepare('UPDATE nexus_documents SET archived=1 WHERE id=?').run(id);if(!result.changes)throw new Error('Document not found.');return{archived:true,originalRetained:true};}
 search(agentId:string,query:string){
  if(!query.trim()||query.length>500)throw new Error('Query must be 1..500 characters.');
  const escaped=query.replace(/[\\%_]/g,'\\$&');
  // json_each ACL predicate filters before content leaves the database / reaches any model.
  const rows=this.db.prepare(`SELECT d.id,d.source,d.sha256,c.position,c.content FROM nexus_documents d JOIN nexus_chunks c ON d.id=c.document_id
   WHERE d.archived=0 AND EXISTS(SELECT 1 FROM json_each(d.acl) WHERE value=?) AND c.content LIKE ? ESCAPE '\\' LIMIT 20`).all(agentId,`%${escaped}%`) as {id:string;source:string;sha256:string;position:number;content:string}[];
  return rows.map(r=>({text:r.content,citation:{documentId:r.id,source:r.source,sha256:r.sha256,chunk:r.position},retrieval:'lexical' as const}));
 }
}
