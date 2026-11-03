import {createHash,randomUUID} from 'node:crypto';
import {canonicalize, type JsonValue} from './canonical.js';

export type ToolClassification = 'READ_PUBLIC'|'READ_SENSITIVE'|'EXTERNAL_MUTATION';
export interface McpEndpoint {
  serverId: string;
  /** Operator-pinned HTTPS URL, not model/tool supplied. */
  url: string;
  /** Obtain a token scoped to THIS server; never forward a Core bearer. */
  getScopedToken(): Promise<string>;
}
export interface LocalToolPolicy {
  serverId: string; toolName: string;
  approvedDefinitionHash: string;
  classification: ToolClassification;
  validateArgs(args: Record<string,JsonValue>): boolean;
}
export interface ToolDefinition {
  name: string;
  inputSchema: Record<string,JsonValue>;
  description?: string;
  annotations?: Record<string,JsonValue>;
}
export function definitionDigest(definition: ToolDefinition): string {
  return createHash('sha256').update(canonicalize(definition)).digest('hex');
}

/**
 * Strict 2026-07-28 JSON-response-only adapter. For production or legacy
 * servers use official @modelcontextprotocol/client v2 SDK (SSE + negotiation).
 * This class fails closed on SSE, untrusted tool metadata, redirects and
 * non-allowlisted tools. It is not a replacement for scoped server tokens.
 */
export class HardenedMcpClient {
  constructor(
    private readonly endpoints: ReadonlyMap<string,McpEndpoint>,
    private readonly policies: ReadonlyMap<string,LocalToolPolicy>,
    private readonly request: typeof fetch = fetch,
  ) {}

  async callReadOnlyTool(input:{
    serverId: string;toolName: string;
    args: Record<string,JsonValue>;
    observedDefinition: ToolDefinition;
  }): Promise<JsonValue> {
    const endpoint = this.endpoints.get(input.serverId);
    const policy = this.policies.get(input.serverId+':'+input.toolName);
    if (!endpoint || !policy || policy.serverId!==input.serverId ||
        policy.toolName!==input.toolName) throw new Error('MCP_DENIED: UNKNOWN_TOOL');
    if (policy.classification==='EXTERNAL_MUTATION') {
      throw new Error('MCP_BYPASS_BLOCKED: BROKER_REQUIRED');
    }
    if (input.observedDefinition.name!==input.toolName ||
      definitionDigest(input.observedDefinition)!==policy.approvedDefinitionHash) {
      throw new Error('MCP_SCHEMA_TAMPERED');
    }
    if (!policy.validateArgs(input.args)) throw new Error('MCP_ARGS_DENIED');
    canonicalize(input.args);
    const url = new URL(endpoint.url);
    if (url.protocol!=='https:' || url.username || url.password || url.search ||
       url.hash || !url.hostname) throw new Error('MCP_ENDPOINT_DENIED');
    const token = await endpoint.getScopedToken();
    if (!token) throw new Error('MCP_AUTH_MISSING');
    const requestId = randomUUID();
    const body = {
      jsonrpc:'2.0', id:requestId, method:'tools/call',
      params: {
        name:input.toolName,
        arguments:input.args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion':'2026-07-28',
          'io.modelcontextprotocol/clientCapabilities':{},
          'io.modelcontextprotocol/clientInfo': {name:'ahmed-agent',version:'0.1.0'},
        },
      },
    };
    const res = await this.request(url.toString(),{
      method:'POST',
      redirect:'error',
      signal:AbortSignal.timeout(8000),
      headers:{
        'Content-Type':'application/json',
        Accept:'application/json, text/event-stream',
        'Mcp-Protocol-Version':'2026-07-28',
        'Mcp-Method':'tools/call',
        'Mcp-Name':input.toolName,
        Authorization:'Bearer '+token,
      },
      body:canonicalize(body),
    });
    if (!res.ok) throw new Error('MCP_HTTP_ERROR: '+res.status);
    if (!(res.headers.get('content-type')??'').toLowerCase().includes('application/json')) {
      throw new Error('MCP_UNSUPPORTED_CONTENT_TYPE: NEED_OFFICIAL_SDK');
    }
    const raw = await readBounded(res,1_048_576);
    let parsed: any;
    try{parsed=JSON.parse(raw);}catch{throw new Error('MCP_INVALID_JSON');}
    if (!parsed || parsed.jsonrpc!=='2.0' || parsed.id!==requestId ||
      (parsed.result===undefined && !parsed.error)) throw new Error('MCP_INVALID_RPC');
    if (parsed.error) throw new Error('MCP_REMOTE_ERROR');
    canonicalize(parsed.result);
    return parsed.result as JsonValue;
  }
}
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const reader=response.body?.getReader();
  if (!reader) throw new Error('MCP_EMPTY_RESPONSE');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let length=0, result='';
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>maxBytes)throw new Error('MCP_RESPONSE_TOO_LARGE');
      result+=decoder.decode(value,{stream:true});
    }
    return result+decoder.decode();
  } finally {reader.releaseLock();}
}