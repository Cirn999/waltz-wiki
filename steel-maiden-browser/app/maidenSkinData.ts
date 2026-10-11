import { isArchiveArtPath } from "./archiveAssets.ts";

export type MaidenSkin = { id: number; name: string; painter: string; modelId: number; image: string; headImage?: string };
type SkinDataset = { version: 1; rows: Record<string, MaidenSkin[]> };
let pending: Promise<SkinDataset> | null = null;

function isSkin(value: unknown): value is MaidenSkin {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<MaidenSkin>;
  return Number.isInteger(row.id) && Number.isInteger(row.modelId)
    && typeof row.name === "string" && typeof row.painter === "string"
    && isArchiveArtPath(row.image, "skins", /^\d+\.webp$/)
    && (row.headImage === undefined || isArchiveArtPath(row.headImage, "skin-portraits", /^[a-zA-Z0-9_-]+\.webp$/));
}

export function loadMaidenSkins(): Promise<SkinDataset> {
  if (!pending) {
    pending = fetch("/data/maiden-skins.json").then(async (response) => {
      if (!response.ok) throw new Error(`皮肤资料加载失败：HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1
        || !("rows" in data) || !data.rows || typeof data.rows !== "object"
        || !Object.values(data.rows).every((row) => Array.isArray(row) && row.every(isSkin))) {
        throw new Error("皮肤资料格式不正确");
      }
      return data as SkinDataset;
    }).catch((error: unknown) => { pending = null; throw error; });
  }
  return pending;
}
