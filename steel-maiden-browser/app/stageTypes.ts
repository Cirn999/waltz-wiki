import type { IncomeCatalog, NodeIncome, ScoreRange } from "./stageIncome";

export type Category = { id: string; name: string; description: string; image: string; titleImage: string; mapCount: number; nodeCount: number };
export type EntryRequirement = { key: string; kind: string; text: string; image: string; parts?: { text: string; image?: string }[]; refs?: { mapId: number; nodeId: number; name: string }[] };
export type EntryCost = { fundId: number; name: string; image: string; amount: number };
export type FormationReward = { grade: "S"; requirements: EntryRequirement[]; rewards: EntryCost[]; ruleId: number };
export type StageMap = { id: number; name: string; category: string; group: string; outputGroup?: string; challengeGroup?: string; mode: string; volume: number | null; code: string; image: string; imageKind: "map" | "terrain"; nodes: number[]; simulation: boolean; levels: number[]; requirements: EntryRequirement[]; entryCosts: EntryCost[]; formationReward?: FormationReward };
export type Enemy = { id: number; name: string; level: number; className: string; classIcon: string; image: string };
export type StageNode = { id: number; name: string; fieldId: number; enemies: { id: number; position: number }[]; drops: string[]; dropScores: Record<string, ScoreRange[]>; income: NodeIncome; hasRewardConfig: boolean };
export type TerrainEffect = { name: string; description: string; image: string };
export type Terrain = { id: number; name: string; image: string; distances: number[]; distanceIcon: string; altitudes: number[]; altitudeIcon: string; effects: TerrainEffect[]; airEffects: TerrainEffect[] };
export type Reward = { id: string; name: string; image: string; kind: string; slotName: string; slotIcon: string; outfit?: { capsuleId: number; headImage: string; baseSize: [number, number]; headSize: [number, number] } };
export type StageCatalog = { schemaVersion: number; categories: Category[]; maps: StageMap[]; nodes: Record<string, StageNode>; income: IncomeCatalog; enemies: Record<string, Enemy>; terrains: Record<string, Terrain>; rewards: Record<string, Reward>; meta: { sourceNodes: number } };
