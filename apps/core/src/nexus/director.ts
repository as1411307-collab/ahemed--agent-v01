import type { NexusConfig, NexusEvent } from './state.js';
/** Pure visual policy. It has no tool registry, credentials or executable action bus. */
export function directEvent(event:NexusEvent,config:NexusConfig){
 const waiting=event.type==='approval.requested';
 const states:Record<string,string>={'mission.created':'Waiting','mission.started':'Planning','agent.started':'Executing','tool.called':'Executing','approval.requested':'Waiting','mission.completed':'Success','mission.failed':'Warning','connection.lost':'Warning'};
 return {eventId:event.eventId,missionId:event.missionId,coreState:states[event.type]??null,
  camera:waiting||config.world.reducedMotion?'hold':event.type==='mission.completed'?'mission_focus':'none',
  motion:config.world.reducedMotion?'reduced':'standard',light:waiting?'amber':event.type==='tool.failed'?'warning':'event',
  evidence:{eventId:event.eventId,type:event.type},preview:false};
}
