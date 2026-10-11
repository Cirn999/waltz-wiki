export type StoryCharacter = { id:number; modelId:number; name:string; expressionId:number; actionId:number; image:string; avatar:string; avatarFromPortrait:boolean; avatarCrop?:{x:number;y:number;size:number;sourceWidth:number} };
export type StoryFrame = { id:string; scriptId:number; kind:"dialogue"|"narration"|"notice"; text:string; speaker:string; player?:boolean; head:number|null; side:"left"|"right"|null; left:number|null; right:number|null; background:string; dialogue:string; section:number; shake:boolean; item?:string };
export type StorySection = { id:string; name:string; scripts:number[]; start:number; count:number };
export type StoryContent = { schemaVersion:1; id:number; frames:StoryFrame[]; sections:StorySection[]; summaries:string[] };
export type StoryMap = { id:number; name:string; category:string; group:string; volume:number|null; code:string; image:string; imageKind:string; mode:string; simulation:boolean; frameCount:number; sectionCount:number; summaryOnly:boolean; preview:string };
export type StoryCategory = { id:string; name:string; description:string; image:string; titleImage:string; mapCount:number };
export type StoryCatalog = { schemaVersion:1; categories:StoryCategory[]; maps:StoryMap[]; characters:Record<string,StoryCharacter>; dialogues:Record<string,string>; meta:{ audio:false; uniqueScripts:number } };

export function clampStoryIndex(index:number, count:number) { return Math.max(0,Math.min(Math.max(0,count-1),index)); }
export function storyMapTitle(map:StoryMap) { return map.volume ? `${map.code} · ${map.name}` : map.name; }
