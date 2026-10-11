import type { GameTask, TaskReward } from "./taskTypes";

// Archive visibility is separate from account-specific eligibility. Keep the
// complete catalog and let the user opt back into every hidden record.
export function taskHiddenReason(task: GameTask, nowMs: number): string {
  if (task.retiredReason) return task.retiredReason;
  if (task.disabled) return "配置等级门槛超过客户端上限";
  const windows = [...task.prerequisites, ...task.requirements].flatMap((c) => c.timeWindow ? [c.timeWindow] : []);
  const now = nowMs / 1000;
  if (windows.some((w) => w.end !== null && now >= w.end)) return "已超过配置开放时间";
  if (windows.some((w) => now < w.start)) return "尚未到配置开放时间";
  return "";
}

export function taskRewardLabel(reward: TaskReward): string {
  return reward.equipmentLevel ? `${reward.name} S${reward.equipmentLevel}` : reward.name;
}
