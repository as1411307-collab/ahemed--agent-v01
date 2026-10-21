import { responseText } from './http.js';
/** Official Hermes v0.22.2 public Runs API adapter. No agent loop or provider fallback. */
export interface RunState { run_id: string; status: string; output?: string; approval?: Record<string,unknown>; usage?: unknown; [key:string]:unknown }
export interface EngineCapabilities { platform?:string; features:Record<string,boolean>; [key:string]:unknown }
export interface Engine {
  capabilities():Promise<EngineCapabilities>;
  start(input:{input:string;instructions:string;model?:string},idempotencyKey:string):Promise<RunState>;
  status(runId:string):Promise<RunState>;
  stop(runId:string):Promise<RunState>;
  steer(runId:string,input:string):Promise<unknown>;
  approval(runId:string,requestId:string,choice:'once'|'deny'):Promise<unknown>;
  events(runId:string,after:number,signal:AbortSignal):AsyncIterable<{id:string|null;data:Record<string,unknown>}>;
}
export class HermesError extends Error {
  constructor(message:string,public readonly statusCode=503){super(message);this.name='HermesError';}
}
export class HermesClient implements Engine {
  private readonly base:string;
  private readonly fetcher:typeof fetch;
  constructor(private readonly options:{url:string;key:string;fetcher?:typeof fetch}) {
    const url = new URL(options.url);
    // Operator-only loopback sidecar. No user supplied URL, redirect or DNS target.
    if(url.protocol!=='http:' || !['127.0.0.1','[::1]','localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname!=='/' || !options.key) {
      throw new Error('Hermes must be an authenticated loopback sidecar origin.');
    }
    this.base=url.origin;this.fetcher=options.fetcher??fetch;
  }
  private async request(path:string,method='GET',body?:unknown,extra:Record<string,string>={}) {
    let response:Response;
    try { response=await this.fetcher(this.base+path,{method,headers:{Authorization:`Bearer ${this.options.key}`,'Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15_000)}); }
    catch { throw new HermesError('Hermes connection unavailable; outcome may be unknown.'); }
    if(!response.ok)throw new HermesError(`Hermes HTTP ${response.status}`, response.status<500?response.status:503);
    const text=await responseText(response); if(text.length>2_000_000)throw new HermesError('Hermes response exceeds limit.');
    try{return JSON.parse(text);}catch{throw new HermesError('Invalid Hermes response.');}
  }
  async capabilities():Promise<EngineCapabilities>{const c=await this.request('/v1/capabilities');if(!c.features||typeof c.features!=='object'||Array.isArray(c.features)||Object.values(c.features).some(v=>typeof v!=='boolean'))throw new HermesError('Unsupported Hermes capabilities response.');return c;}
  start(input:{input:string;instructions:string;model?:string},key:string):Promise<RunState>{return this.request('/v1/runs','POST',input,{'Idempotency-Key':key});}
  status(id:string):Promise<RunState>{return this.request(`/v1/runs/${encodeURIComponent(id)}`);}
  stop(id:string):Promise<RunState>{return this.request(`/v1/runs/${encodeURIComponent(id)}/stop`,'POST',{});}
  steer(id:string,input:string){return this.request(`/v1/runs/${encodeURIComponent(id)}/steer`,'POST',{input});}
  async approval(id:string,requestId:string,choice:'once'|'deny'){
    if(!requestId || !['once','deny'].includes(choice))throw new HermesError('Exact approval request and once/deny required.',400);
    return this.request(`/v1/runs/${encodeURIComponent(id)}/approval`,'POST',{request_id:requestId,choice});
  }
  async *events(id:string,after:number,signal:AbortSignal){
    const response=await this.fetcher(`${this.base}/v1/runs/${encodeURIComponent(id)}/events`,{headers:{Authorization:`Bearer ${this.options.key}`,'Last-Event-ID':String(after)},redirect:'error',signal});
    if(!response.ok||!response.body)throw new HermesError(`Hermes events HTTP ${response.status}`);
    yield* parseSse(response.body);
  }
}
/** Bounded parser: ignores keepalives, preserves cursor, handles split UTF-8/CRLF. */
export async function *parseSse(stream:ReadableStream<Uint8Array>):AsyncGenerator<{id:string|null;data:Record<string,unknown>}> {
  const reader=stream.getReader(), decoder=new TextDecoder();let pending='';
  try {
    while(true){const {done,value}=await reader.read();if(done)break;
      pending+=decoder.decode(value,{stream:true});
      let match:RegExpExecArray|null;
      while((match=/\r?\n\r?\n/.exec(pending))){
        const frame=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);
        if(frame.length>1_048_576)throw new HermesError('SSE frame exceeds limit.');
        let id:string|null=null;const data:string[]=[];
        for(const line of frame.split(/\r?\n/)){if(line.startsWith('id:'))id=line.slice(3).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}
        if(data.length){let parsed;try{parsed=JSON.parse(data.join('\n'));}catch{throw new HermesError('Invalid Hermes event.');}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new HermesError('Invalid Hermes event.');yield{id,data:parsed};}
      }
      if(pending.length>1_048_576)throw new HermesError('SSE frame exceeds limit.');
    }
    if(pending.trim())throw new HermesError('Truncated Hermes event stream.');
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
