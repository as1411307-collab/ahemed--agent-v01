import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { NexusState, NexusConfig } from './state.js';
/** Desired config file only: runtime, history, keys and provider credentials never enter it. */
export function importDesiredFile(state:NexusState,file:string){
 const desired=state.validateConfig(JSON.parse(readFileSync(file,'utf8')));
 const current=state.getConfig();
 if(JSON.stringify(desired)!==JSON.stringify(current.config))state.applyConfig(desired,current.revision);
 return state.getConfig();
}
export function saveDesiredFile(file:string,config:NexusConfig){
 const temporary=`${file}.${randomUUID()}.tmp`;
 writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
 // Same-directory rename avoids partial JSON; previous immutable versions remain in SQLite.
 renameSync(temporary,file);
}
export function ensureDesiredFile(state:NexusState,file:string){if(existsSync(file))return importDesiredFile(state,file);saveDesiredFile(file,state.getConfig().config);return state.getConfig();}
