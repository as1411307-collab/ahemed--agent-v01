import path from 'node:path';
import { existsSync } from 'node:fs';
import { createNexus } from './server.js';
import { HermesClient } from './hermes.js';

// Optional environment file loaded server-side only. No dotenv or browser substitution.
const envFile=path.resolve('.env');
if(existsSync(envFile))process.loadEnvFile(envFile);
const appToken=process.env.APP_TOKEN;
if(!appToken)throw new Error('Set private APP_TOKEN before starting NEXUS Gateway.');
const engine=process.env.HERMES_URL&&process.env.HERMES_API_KEY?new HermesClient({url:process.env.HERMES_URL,key:process.env.HERMES_API_KEY}):undefined;
const nexus=await createNexus({dbFile:path.resolve(process.env.NEXUS_DB_FILE??'nexus.db'),workspaceRoot:path.resolve(process.env.WORKSPACE_ROOT??'workspace'),appToken,engine,configFile:path.resolve(process.env.NEXUS_CONFIG_FILE??'../../nexus.config.json'),
 integrations:{tavilyKey:process.env.TAVILY_API_KEY,mcpUrl:process.env.NEXUS_MCP_URL,mcpToken:process.env.NEXUS_MCP_TOKEN,ollamaUrl:process.env.OLLAMA_URL,n8nUrl:process.env.N8N_URL},
 searchQuoteMicroUsd:process.env.TAVILY_SEARCH_QUOTE_MICRO_USD?Number(process.env.TAVILY_SEARCH_QUOTE_MICRO_USD):undefined});
// Binding private by default. External exposure requires a separate authenticated TLS boundary.
await nexus.app.listen({host:'127.0.0.1',port:Number(process.env.NEXUS_PORT??8788)});
console.log('NEXUS Gateway listening on http://127.0.0.1:'+String(process.env.NEXUS_PORT??8788));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void nexus.close().then(()=>process.exit(0));});
