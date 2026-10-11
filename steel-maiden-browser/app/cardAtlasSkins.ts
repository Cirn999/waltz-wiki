import type { MaidenSkin } from "./maidenSkinData";

export const atlasSkinStorageKey = "steel-maiden:atlas-skins:v1";
export type AtlasSkinSelections = Record<string, number>;
export type CardAtlasSkinMode = "merged" | "separate";

// Expand after vehicle filtering/sorting, but before card pagination. The default
// artwork always leads each vehicle's skins; saved choices only affect merged mode.
export function atlasSkinEntries<T extends { id: number }>(
  orderedRows: readonly T[], mode: CardAtlasSkinMode,
  skinsById: Record<string, MaidenSkin[]>, selections: AtlasSkinSelections,
): { key: string; maiden: T; skin: MaidenSkin | undefined }[] {
  return orderedRows.flatMap((maiden) => {
    const skins = skinsById[maiden.id] ?? [];
    const variants = mode === "separate" ? [undefined, ...skins] : [selectedAtlasSkin(skins, selections[maiden.id])];
    return variants.map((skin) => ({ key: `${maiden.id}:${skin?.id ?? 0}`, maiden, skin }));
  });
}

export function parseAtlasSkinSelections(raw: string | null): AtlasSkinSelections {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([id, skinId]) =>
      /^\d+$/u.test(id) && typeof skinId === "number" && Number.isSafeInteger(skinId) && skinId > 0));
  } catch { return {}; }
}

export function selectedAtlasSkin(skins: readonly MaidenSkin[], id: number | undefined): MaidenSkin | undefined {
  return skins.find((skin) => skin.id === id);
}

export function withAtlasSkin(selections: AtlasSkinSelections, maidenId: number, skinId: number): AtlasSkinSelections {
  const next = { ...selections };
  if (skinId === 0) delete next[maidenId];
  else next[maidenId] = skinId;
  return next;
}
