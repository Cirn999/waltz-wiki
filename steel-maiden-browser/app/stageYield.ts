import { mergeScoreRanges, sumIncome } from "./stageIncome.ts";
import type { IncomeResult, ScoreRange } from "./stageIncome.ts";
import type { Reward, StageCatalog, StageMap } from "./stageTypes.ts";

export type YieldEquipment = Reward & { ranges: ScoreRange[] };
export type StageYieldRow = {
  map: StageMap; number: number; fuel: number; income: IncomeResult;
  silver: number; codons: number; silverPerFuel: number | null; codonsPerFuel: number | null;
  equipment: YieldEquipment[];
};
export type YieldSortKey = "number" | "fuel" | "silver" | "codons" | "silverPerFuel" | "codonsPerFuel";

/** Use exactly the same per-node results as map details; fuel is paid once per map. */
export function buildStageYieldRows(catalog: StageCatalog, nodeIncome: Record<string, IncomeResult>): StageYieldRow[] {
  return catalog.maps.filter((map) => map.mode === "VOL_FARM" && !map.simulation).map((map) => {
    const nodes = map.nodes.map((id) => catalog.nodes[id]);
    const income = sumIncome(map.nodes.map((id) => nodeIncome[id]));
    const fuel = map.entryCosts.filter((cost) => cost.fundId === 4).reduce((sum, cost) => sum + cost.amount, 0);
    const equipment = [...new Set(nodes.flatMap((node) => node.drops))]
      .filter((id) => catalog.rewards[id]?.kind === "装备")
      .map((id) => ({ ...catalog.rewards[id], ranges: mergeScoreRanges(nodes.flatMap((node) => node.dropScores[id] ?? [])) }));
    const [, silver, codons] = income.amount;
    return { map, number: Number(map.code), fuel, income, silver, codons,
      silverPerFuel: fuel > 0 ? silver / fuel : null, codonsPerFuel: fuel > 0 ? codons / fuel : null, equipment };
  }).sort((a, b) => a.number - b.number || a.map.id - b.map.id);
}

/** Filter by exact Fund ID, not name: different equipment slots are distinct drops. */
export function filterStageYieldRows(rows: StageYieldRow[], equipmentIds: string[], query: string): StageYieldRow[] {
  const selected = new Set(equipmentIds);
  const text = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (!selected.size || row.equipment.some((item) => selected.has(item.id)))
    && (!text || `捷径${row.number} ${row.map.name} ${row.equipment.map((item) => `${item.name} ${item.slotName}`).join(" ")}`.toLocaleLowerCase().includes(text)));
}

export function sortStageYieldRows(rows: StageYieldRow[], key: YieldSortKey, descending: boolean): StageYieldRow[] {
  return rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    // Undefined unit yields stay at the bottom, in either direction.
    if (av === null || bv === null) return av === bv ? a.number - b.number : av === null ? 1 : -1;
    return (av - bv) * (descending ? -1 : 1) || a.number - b.number;
  });
}
