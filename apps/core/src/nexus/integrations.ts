import { responseText } from './http.js';
import { HermesError } from './hermes.js';
export interface ConnectionHealth {id:string;status:'unavailable'|'connected'|'failed'|'blocked';reason:string;checkedAt:string|null;capabilities?:unknown}
export interface IntegrationOptions { tavilyKey?:string; mcpUrl?:string; mcpToken?:string; ollamaUrl?:string; n8nUrl?:string; fetcher?:typeof fetch }
const IDS=['web_search','mcp','composio','n8n','ollama','mail'] as const;
/** Fixed operator-configured origins, never a URL or secret accepted from browser configuration. */
export class Integrations {
 private health=new Map<string,ConnectionHealth>();private fetcher:typeof fetch;
 constructor(private options:IntegrationOptions={}){this.fetcher=options.fetcher??fetch;}
 list():ConnectionHealth[]{return IDS.map(id=>this.health.get(id)??{id,status:'unavailable',reason:id==='mail'?'Read-only mail adapter not configured.':id==='composio'?'Account binding and provider contract not verified.':'Connection has not passed a real test.',checkedAt:null});}
 async test(id:string):Promise<ConnectionHealth>{
  if(!IDS.includes(id as typeof IDS[number]))throw new HermesError('Unknown integration.',404);
  let result:ConnectionHealth={id,status:'unavailable',reason:'Provider credentials or endpoint not configured.',checkedAt:new Date().toISOString()};
  try{
   if(id==='ollama'&&this.options.ollamaUrl){const models=await this.json(loopback(this.options.ollamaUrl)+'/api/tags');if(!Array.isArray(models.models))throw new Error();result={...result,status:'connected',reason:'Ollama model inventory fetched. This endpoint is the server machine, not automatically Ahmed’s laptop.',capabilities:{models:models.models}};}
   if(id==='n8n'&&this.options.n8nUrl){await this.json(loopback(this.options.n8nUrl)+'/healthz');result={...result,status:'connected',reason:'Health endpoint responded; workflow execution remains disabled pending permission and callback contract.'};}
   if(id==='mcp'&&this.options.mcpUrl){
    const url=loopback(this.options.mcpUrl,true);const headers:Record<string,string>={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};if(this.options.mcpToken)headers.Authorization=`Bearer ${this.options.mcpToken}`;
    const request=async (body:unknown)=>{const r=await this.fetcher(url,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();const sid=r.headers.get('mcp-session-id');if(sid)headers['Mcp-Session-Id']=sid;const t=await responseText(r,1_048_576);if(t.length>1_048_576)throw new Error();if(r.status===202||!t)return null;if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('MCP SSE response requires a streaming adapter.');const d=JSON.parse(t);if(d.error)throw new Error();return d;};
    const init=await request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'nexus-one',version:'0.1.0'}}});
    if(!init?.result?.protocolVersion)throw new Error();headers['MCP-Protocol-Version']=init.result.protocolVersion;
    await request({jsonrpc:'2.0',method:'notifications/initialized'});const inventory=await request({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
    if(!Array.isArray(inventory?.result?.tools))throw new Error();result={...result,status:'connected',reason:'MCP initialized and tools discovered. Tool execution is disabled pending per-tool permission enforcement.',capabilities:{tools:inventory.result.tools.map((t:{name:string;description?:string})=>({name:t.name,description:t.description}))}};
   }
   if(id==='web_search'&&this.options.tavilyKey)result={...result,status:'blocked',reason:'Search key present; a user-requested budgeted search must succeed before Connected. No paid test issued.'};
  }catch{result={...result,status:'failed',reason:'Connection or protocol test failed. Upstream details redacted.'};}
  this.health.set(id,result);return result;
 }
 async search(query:string):Promise<{results:{title:string;url:string;content:string}[];provider:'tavily'}>{
  if(!this.options.tavilyKey)throw new HermesError('Web search unavailable: TAVILY_API_KEY is not configured.');
  if(typeof query!=='string'||!query.trim()||query.length>2000)throw new HermesError('Invalid search query.',400);
  const r=await this.fetcher('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.options.tavilyKey}`},body:JSON.stringify({query,search_depth:'basic',max_results:5,include_answer:false}),redirect:'error',signal:AbortSignal.timeout(15_000)});
  if(!r.ok)throw new HermesError(`Search provider HTTP ${r.status}`);
  const raw=await responseText(r,1_048_576);if(raw.length>2_000_000)throw new HermesError('Search response exceeds limit.');const d=JSON.parse(raw);if(!Array.isArray(d.results))throw new HermesError('Invalid search response.');
  const results=d.results.filter((x:Record<string,unknown>)=>typeof x.url==='string'&&/^https?:\/\//.test(x.url)).map((x:Record<string,unknown>)=>({title:String(x.title??''),url:String(x.url),content:String(x.content??'').slice(0,20_000)}));
  this.health.set('web_search',{id:'web_search',status:'connected',reason:'A real provider search completed.',checkedAt:new Date().toISOString()});return{results,provider:'tavily'};
 }
 private async json(url:string){const r=await this.fetcher(url,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error();const t=await responseText(r,1_048_576);if(t.length>1_048_576)throw new Error();return JSON.parse(t);}
}
function loopback(raw:string,pathAllowed=false){const url=new URL(raw);if(url.protocol!=='http:'||!['127.0.0.1','[::1]','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||(!pathAllowed&&url.pathname!=='/'))throw new Error('Only explicit loopback operator endpoints supported.');return pathAllowed?url.href:url.origin;}
