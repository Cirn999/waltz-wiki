export const atlasTeamCapacity = 6;
export type AtlasTeamPlan = { id: number; name: string; memberIds: number[] };
export type AtlasTeamWorkspace = { plans: AtlasTeamPlan[]; activeId: number; nextId: number };
export type AtlasTeamAction =
  | { type: "create" }
  | { type: "select"; id: number }
  | { type: "toggle"; maidenId: number }
  | { type: "clear" }
  | { type: "delete" };

export function createAtlasTeamWorkspace(): AtlasTeamWorkspace {
  return { plans: [{ id: 1, name: "方案 1", memberIds: [] }], activeId: 1, nextId: 2 };
}

export function activeAtlasTeam(workspace: AtlasTeamWorkspace): AtlasTeamPlan {
  return workspace.plans.find((plan) => plan.id === workspace.activeId) ?? workspace.plans[0];
}

// The workspace belongs to the page, not the filtered rows or a skin entry.
// Functional updates keep rapid clicks safe; a maiden's skins share one ID.
export function updateAtlasTeam(workspace: AtlasTeamWorkspace, action: AtlasTeamAction): AtlasTeamWorkspace {
  const active = activeAtlasTeam(workspace);
  if (action.type === "create") {
    const id = workspace.nextId;
    return { plans: [...workspace.plans, { id, name: `方案 ${id}`, memberIds: [] }], activeId: id, nextId: id + 1 };
  }
  if (action.type === "select") {
    return workspace.plans.some((plan) => plan.id === action.id) ? { ...workspace, activeId: action.id } : workspace;
  }
  if (action.type === "delete") {
    if (workspace.plans.length === 1) return workspace;
    const index = workspace.plans.indexOf(active);
    const plans = workspace.plans.filter((plan) => plan.id !== active.id);
    return { ...workspace, plans, activeId: plans[Math.min(index, plans.length - 1)].id };
  }
  let memberIds: number[];
  if (action.type === "clear") memberIds = [];
  else {
    if (!Number.isSafeInteger(action.maidenId) || action.maidenId <= 0) return workspace;
    if (active.memberIds.includes(action.maidenId)) memberIds = active.memberIds.filter((id) => id !== action.maidenId);
    else if (active.memberIds.length < atlasTeamCapacity) memberIds = [...active.memberIds, action.maidenId];
    else return workspace;
  }
  return { ...workspace, plans: workspace.plans.map((plan) => plan.id === active.id ? { ...plan, memberIds } : plan) };
}

export function sumAtlasTeamTalents(members: readonly { talents: readonly { name: string; level: number }[] }[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const member of members) for (const talent of member.talents) {
    if (Number.isFinite(talent.level) && talent.level > 0) sums[talent.name] = (sums[talent.name] ?? 0) + talent.level;
  }
  return sums;
}
