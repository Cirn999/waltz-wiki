/** Direct native award amounts; alternative/conditional draws are never summed. */
export type IncomeAmount = [number, number, number];
export type IncomeSettings = { progress: number; score: number };
export type ScoreRange = [number, number];
type IncomeVariant = { groupId: number; amount: IncomeAmount; minProgress: number; maxProgress: number; conditions: string[] };
export type NodeIncome = { sources: { poolId: number; minScore: number; maxScore: number; guaranteedTable: boolean }[]; dynamic: boolean; serverExperience?: boolean };
export type IncomeCatalog = {
  resources: { key: string; name: string; image: string }[];
  progress: { value: number; label: string }[];
  assessments: { score: number; name: string; grade: string; win: boolean }[];
  pools: Record<string, { deterministic: boolean; variants: IncomeVariant[] }>;
};
export type IncomeResult = { amount: IncomeAmount; variable: boolean; dynamic: boolean; serverExperience?: boolean };
export const INCOME_STORAGE_KEY = "steel-maiden-stage-income-v1";
export const DEFAULT_INCOME_SETTINGS: IncomeSettings = { progress: 0, score: 92 };

export function incomeAssessments(catalog: IncomeCatalog) {
  // All exported nodes were checked: ordinary S and perfect S have identical
  // visible drops and direct income. Keep only the first row for each letter.
  return catalog.assessments.filter((a, i, rows) => a.win && rows.findIndex((row) => row.grade === a.grade) === i).slice().reverse();
}

export function normalizeIncomeSettings(value: unknown, catalog: IncomeCatalog): IncomeSettings {
  const raw = value && typeof value === "object" ? value as Partial<IncomeSettings> : {};
  // An older, more precise progress value is safely folded into its reward tier.
  const progress = typeof raw.progress === "number" && Number.isInteger(raw.progress) && raw.progress >= 0 && raw.progress <= 104
    ? catalog.progress.reduce((p, option) => option.value <= raw.progress! ? Math.max(p, option.value) : p, 0) : 0;
  const selected = catalog.assessments.find((a) => a.win && a.score === raw.score);
  const score = incomeAssessments(catalog).find((a) => a.grade === selected?.grade)?.score ?? DEFAULT_INCOME_SETTINGS.score;
  return { progress, score };
}

export function readIncomeSettings(catalog: IncomeCatalog): IncomeSettings {
  try { return normalizeIncomeSettings(JSON.parse(localStorage.getItem(INCOME_STORAGE_KEY) ?? "null"), catalog); }
  catch { return { ...DEFAULT_INCOME_SETTINGS }; }
}

export function calculateNodeIncome(node: NodeIncome, catalog: IncomeCatalog, settings: IncomeSettings): IncomeResult {
  const amount: IncomeAmount = [0, 0, 0];
  let variable = false;
  for (const source of node.sources) {
    if (settings.score < source.minScore || settings.score > source.maxScore) continue;
    const pool = catalog.pools[source.poolId];
    const variants = pool.variants.filter((v) => v.minProgress <= settings.progress && settings.progress <= v.maxProgress);
    if (source.guaranteedTable && pool.deterministic && variants.length === 1) {
      variants[0].amount.forEach((n, i) => { amount[i] += n; });
    } else if (variants.some((v) => v.amount.some((n) => n > 0))) variable = true;
  }
  return { amount, variable, dynamic: node.dynamic, ...(node.serverExperience ? { serverExperience: true } : {}) };
}

export function sumIncome(results: IncomeResult[]): IncomeResult {
  return results.reduce<IncomeResult>((total, result) => ({
    amount: total.amount.map((n, i) => n + result.amount[i]) as IncomeAmount,
    variable: total.variable || result.variable, dynamic: total.dynamic || result.dynamic,
    ...(total.serverExperience || result.serverExperience ? { serverExperience: true } : {}),
  }), { amount: [0, 0, 0], variable: false, dynamic: false });
}

/** Activity maps omit zero XP; raid/air XP stays hidden regardless of its value. */
export function visibleIncomeIndices(result: IncomeResult, currenciesInLoot = false, hideZeroExperience = false): number[] {
  return [0, 1, 2].filter((i) => i === 0
    ? !result.serverExperience && (!hideZeroExperience || result.amount[i] > 0)
    : !currenciesInLoot && result.amount[i] > 0);
}

export function mergeScoreRanges(ranges: ScoreRange[]): ScoreRange[] {
  const result: ScoreRange[] = [];
  for (const [low, high] of ranges.slice().sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && low <= last[1] + 1) last[1] = Math.max(last[1], high);
    else result.push([low, high]);
  }
  return result;
}

/** Same native fixed-income calculation, presented as item drops on raid maps.
 * Keep grade-ineligible drops in the preview with their positive quantity and
 * grade requirements, never a misleading x0. Random amounts are not invented.
 */
export function fixedCurrencyDrops(nodes: NodeIncome[], catalog: IncomeCatalog, settings: IncomeSettings) {
  const bounds = [...new Set([0, 101, ...nodes.flatMap((n) => n.sources.flatMap((s) => [s.minScore, s.maxScore + 1]))])].sort((a, b) => a - b);
  const segments = bounds.slice(0, -1).map((low, i) => ({
    range: [low, bounds[i + 1] - 1] as ScoreRange,
    income: sumIncome(nodes.map((n) => calculateNodeIncome(n, catalog, { ...settings, score: low }))),
  }));
  const current = sumIncome(nodes.map((n) => calculateNodeIncome(n, catalog, settings)));
  return [1, 2].flatMap((index) => {
    const positive = segments.filter((s) => s.income.amount[index] > 0);
    if (!positive.length) return [];
    return [{ index, amount: current.amount[index] || Math.max(...positive.map((s) => s.income.amount[index])),
      ranges: mergeScoreRanges(positive.map((s) => s.range)) }];
  });
}

export function scoreAllows(ranges: ScoreRange[], score: number) {
  return ranges.some(([low, high]) => low <= score && score <= high);
}

/** Merge both native S rows, but preserve a 100-only or partial-grade condition. */
export function dropGradeLabels(ranges: ScoreRange[], catalog: IncomeCatalog): string[] {
  if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 100) return ["不限评价"];
  const gradeRanges: { grade: string; low: number; high: number }[] = [];
  catalog.assessments.forEach((a, i) => {
    const high = (catalog.assessments[i + 1]?.score ?? 101) - 1;
    const last = gradeRanges.at(-1);
    if (last?.grade === a.grade) last.high = high;
    else gradeRanges.push({ grade: a.grade, low: a.score, high });
  });
  return gradeRanges.reverse().flatMap(({ grade, low, high }) => {
    const valid = ranges.map(([l, h]) => [Math.max(l, low), Math.min(h, high)]).filter(([l, h]) => l <= h);
    if (!valid.length) return [];
    if (valid.length === 1 && valid[0][0] === low && valid[0][1] === high) return [grade];
    return [`${grade}（${valid.map(([l, h]) => l === h ? l : `${l}–${h}`).join("、")}分）`];
  });
}
