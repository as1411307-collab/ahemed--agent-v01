import { describe,expect,it,vi } from 'vitest';
import { Integrations } from '../src/nexus/integrations.js';
import { responseText } from '../src/nexus/http.js';
import { directEvent } from '../src/nexus/director.js';
import { openDb } from '../src/db.js';
import { NexusState } from '../src/nexus/state.js';

describe('Integration contracts with HTTP fixtures; no live provider charges',()=>{
 it('does not invent Connected from a key and no-key web search fails',async()=>{
  const fetcher=vi.fn();const i=new Integrations({fetcher,tavilyKey:'private'});
  expect((await i.test('web_search')).status).toBe('blocked');expect(fetcher).not.toHaveBeenCalled();
  await expect(new Integrations().search('query')).rejects.toThrow('unavailable');
 });
 it('performs actual provider protocol and returns citations; marks connected only after successful response',async()=>{
  const fetcher=vi.fn(async()=>Response.json({results:[{url:'https://example.org/research',title:'Study',content:'Evidence'}]}));
  const i=new Integrations({fetcher,tavilyKey:'private'});const result=await i.search('energy');
  expect(result.results[0]?.url).toBe('https://example.org/research');expect(fetcher.mock.calls.length).toBe(1);
  expect(i.list().find(i=>i.id==='web_search')?.status).toBe('connected');
 });
 it('initializes MCP and discovers tools without executing them',async()=>{
  const calls:unknown[]=[];const i=new Integrations({mcpUrl:'http://127.0.0.1:9000/mcp',fetcher:async(_u,o)=>{const d=JSON.parse(o?.body as string);calls.push(d);return Response.json(d.method==='initialize'?{result:{protocolVersion:'2025-03-26'}}:d.method==='tools/list'?{result:{tools:[{name:'read_doc'}]}}:{});}});
  expect((await i.test('mcp')).status).toBe('connected');expect(calls).toHaveLength(3);expect(calls).not.toContainEqual(expect.objectContaining({method:'tools/call'}));
 });
 it('blocks arbitrary integration endpoints before any request',async()=>{
  const fetcher=vi.fn();expect((await new Integrations({ollamaUrl:'http://169.254.169.254',fetcher}).test('ollama')).status).toBe('failed');expect(fetcher).not.toHaveBeenCalled();
 });
 it('bounds chunked bytes before retaining the response',async()=>{
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(100));c.enqueue(new Uint8Array(100));}});
  await expect(responseText(new Response(body),128)).rejects.toThrow('limit');
 });
 it('director reduced motion freezes camera and does not equate tool failure with mission failure',()=>{
  const db=openDb(':memory:');try{const s=new NexusState(db),cfg=s.getConfig().config;cfg.world.reducedMotion=true;const e=s.appendEvent('test','tool.failed',{error:true});const d=directEvent(e,cfg);expect(d.camera).toBe('hold');expect(d.coreState).toBeNull();expect(d.evidence.eventId).toBe(e.eventId);}finally{db.close();}
 });
});
