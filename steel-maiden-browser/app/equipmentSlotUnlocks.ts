import data from "../public/data/equipment-slot-unlocks.json" with { type: "json" };

type SlotRule = { name: string; stars: number; marks: number; honor: boolean };
type SlotCard = { baseStars: number; tags: number[] };
const rules: Record<string, SlotRule> = data.rules;
const cards: Record<string, SlotCard> = data.cards;

export const slotUnlockIcons = data.icons;

/** Match native slot tags, never infer requirements from the displayed index. */
export function equipmentSlotUnlock(cardId: number, index: number, name: string) {
  const card = cards[cardId];
  const rule = card && rules[card.tags[index]];
  if (!rule || rule.name !== name) return null;
  const honor = rule.honor || rule.stars > card.baseStars;
  const initial = rule.stars === 1 && !rule.marks && !honor;
  const requirements = [
    ...(honor ? ["完成授勋（命运之勋）"] : []),
    ...(rule.stars > 1 ? [`亮 ${rule.stars} 星`] : []),
    ...(rule.marks ? [`鹰标总和达到 ${rule.marks}（不消耗鹰标）`] : []),
  ];
  return { stars: rule.stars, marks: rule.marks, honor, initial, description: initial ? "初始开放" : requirements.join("，且") };
}
