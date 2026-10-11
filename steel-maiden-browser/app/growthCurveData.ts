export type GrowthStatKey = "durability" | "power" | "piercing" | "armor";
export type GrowthCurveRow = Record<GrowthStatKey, (number | null)[]>;
export type GrowthCurveDataset = { minLevel: number; maxLevel: number; rows: Record<string, GrowthCurveRow> };

const statKeys: GrowthStatKey[] = ["durability", "power", "piercing", "armor"];
let datasetPromise: Promise<GrowthCurveDataset> | null = null;

export function isGrowthCurveRow(value: unknown): value is GrowthCurveRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<GrowthCurveRow>;
  return statKeys.every((key) => Array.isArray(row[key]) && row[key].length === 99);
}

export function loadGrowthCurves(): Promise<GrowthCurveDataset> {
  if (!datasetPromise) {
    datasetPromise = fetch("/data/growth-curves.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`成长数据加载失败：HTTP ${response.status}`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("rows" in data) || !("minLevel" in data) || !("maxLevel" in data)
          || data.minLevel !== 1 || data.maxLevel !== 99 || !data.rows || typeof data.rows !== "object") {
          throw new Error("成长数据格式不正确");
        }
        return data as GrowthCurveDataset;
      })
      .catch((error: unknown) => {
        datasetPromise = null;
        throw error;
      });
  }
  return datasetPromise;
}
