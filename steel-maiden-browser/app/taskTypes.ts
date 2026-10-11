export type TaskCondition = {
  key: string; text: string; taskId?: number; unresolved?: boolean;
  timeWindow?: { start: number; end: number | null };
};
export type TaskReward = { key: string; name: string; image: string; amount: number; kind: string; equipmentLevel?: number };
export type GameTask = {
  id: number; category: number; name: string; description: string;
  prerequisites: TaskCondition[]; requirements: TaskCondition[]; rewards: TaskReward[];
  timed: boolean; disabled: boolean;
  retiredReason?: string;
};
export type TaskCatalog = {
  schemaVersion: number;
  categories: { id: number; name: string; count: number }[];
  tasks: GameTask[];
};
