import artwork from "../public/art/card-atlas/cost-style/manifest.json" with { type: "json" };

export const cardCostGroups = ["N1", "N2", "N3", "N3+", "N4-", "N4", "N4+", "N5-", "N5", "N5+", "N6-", "N6", "N6+"] as const;
export type CardCostGroup = typeof cardCostGroups[number];
export type CardFrameMetal = "copper" | "silver" | "gold";
export type CardCost = { label: CardCostGroup; tier: number; metal: CardFrameMetal; modifier: "plus" | "minus" | null };
type SpriteAsset = { image: string; width: number; height: number };
export type CardCostSprite = { image: string; x: number; y: number; width: number; height: number; layer: number; role: "fill" | "star" | "modifier-fill" | "modifier-ring" | "modifier-sign" };
const assets: Readonly<Record<string, SpriteAsset>> = artwork.sprites;
const rarityBounds: Readonly<Record<string, { width: number; height: number; visibleCenterX: number }>> = artwork.rarities;
export const cardCostCanvas = artwork.canvas;
export const cardCostFrames = artwork.frames;

// Approved dice-style star positions. Signs never change star count or metal.
const starPositions: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[.5, .5]],
  [[.33, .33], [.67, .67]],
  [[.28, .28], [.5, .5], [.72, .72]],
  [[.32, .32], [.68, .32], [.32, .68], [.68, .68]],
  [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
  [[.32, .26], [.68, .26], [.32, .5], [.68, .5], [.32, .74], [.68, .74]],
];
const starWidths = [.44, .29, .23, .27, .23, .23];

export function cardCostStyle(label: string): CardCost | null {
  if (!(cardCostGroups as readonly string[]).includes(label)) return null;
  const tier = Number(label[1]);
  return { label: label as CardCostGroup, tier, metal: tier <= 2 ? "copper" : tier <= 4 ? "silver" : "gold", modifier: label.endsWith("+") ? "plus" : label.endsWith("-") ? "minus" : null };
}

export function cardCostSprites(cost: CardCost): CardCostSprite[] {
  const frame = cardCostFrames[cost.metal], result: CardCostSprite[] = [];
  const add = (key: string, x: number, y: number, width: number, layer: number, role: CardCostSprite["role"]) => {
    const asset = assets[key];
    result.push({ image: asset.image, x, y, width, height: width * asset.height / asset.width, layer, role });
  };
  add(`N${cost.tier}`, frame.medalX, frame.medalY, 174, 3, "fill");
  for (const [x, y] of starPositions[cost.tier - 1]) add("star", frame.medalX + (x - .5) * 164, frame.medalY + (y - .5) * 164, 164 * starWidths[cost.tier - 1], 5, "star");
  if (cost.modifier) {
    const x = frame.medalX + 87, y = frame.medalY - 87;
    add(`N${cost.tier}`, x, y, 88 * .92, 6, "modifier-fill");
    add(`rim-${cost.metal}`, x, y, 88, 7, "modifier-ring");
    add(cost.modifier, x, y, 88 * .59, 8, "modifier-sign");
  }
  return result;
}

/** Position the painted chevrons, not the icon's transparent image box.
 * Match the unchanged 6%-wide, 7.3%-high contain box in card-atlas.css.
 */
export function cardRarityLeft(metal: CardFrameMetal, icon: string): number {
  const boxWidth = cardCostCanvas.width * .06, boxHeight = cardCostCanvas.height * .073;
  const bounds = rarityBounds[icon];
  const fit = bounds ? Math.min(boxWidth / bounds.width, boxHeight / bounds.height) : 0;
  const visibleOffset = bounds ? (bounds.visibleCenterX - bounds.width / 2) * fit : 0;
  return (cardCostFrames[metal].shoulderX - boxWidth / 2 - visibleOffset) / cardCostCanvas.width * 100;
}
