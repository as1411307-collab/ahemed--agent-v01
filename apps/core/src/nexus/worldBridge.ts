/** Wire contract for the purchased Unreal scene. This is not an Unreal build. */
export const WORLD_BRIDGE_VERSION=1 as const;
export const CORE_STATES=['Listening','Planning','Delegating','Executing','Waiting','Speaking','Success','Warning'] as const;
export interface WorldSceneManifest {
 schemaVersion:1;
 scene:'SKY_SANCTUARY'|'FUTURE_MEGACITY'|'COSMIC_OBSERVATORY';
 asset:{listingUrl:string|null;purchaseApproved:boolean;acquired:boolean;engineVersion:string|null};
 build:{verified:boolean;hardware:string|null;fps1080p:number|null;evidence:string[]};
}
export const SCENE_MANIFEST:WorldSceneManifest={schemaVersion:1,scene:'SKY_SANCTUARY',asset:{listingUrl:null,purchaseApproved:false,acquired:false,engineVersion:null},build:{verified:false,hardware:null,fps1080p:null,evidence:[]}};
/** No tool.execute or raw command bridge. Stop/approve/etc belong to authenticated Gateway mission APIs. */
export type VisualWorldIntent={type:'scene.select';scene:WorldSceneManifest['scene']}|{type:'camera.select';mode:'free'|'cinematic'}|{type:'replay.seek';sequence:number};
