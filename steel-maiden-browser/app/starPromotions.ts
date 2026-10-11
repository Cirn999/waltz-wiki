import data from "../public/data/star-promotions.json" with { type: "json" };

type Material = { name: string; image: string };
type Promotion = { stars: number; level: number; recipeLevel: number; honorLevel: number | null; commanderLevel: number; honor: boolean; costs: { fundId: number; amount: number }[] };
const cards: Record<string, string[]> = data.cards;
const profiles: Record<string, Promotion> = data.profiles;
const materials: Record<string, Material> = data.materials;
export const starPromotionHonorIcon = data.honorIcon;

export function starPromotions(cardId: number) {
  const promotions = (cards[cardId] ?? []).map((key) => profiles[key]);
  const firstHonor = promotions.findIndex((promotion) => promotion.honor);
  return promotions.map((promotion, index) => {
    const costs = promotion.costs.map((cost) => ({ ...cost, ...materials[cost.fundId] }));
    const description = `${promotion.level}级亮${promotion.stars}星：${costs.map((cost) => `${cost.name} ×${cost.amount.toLocaleString("zh-CN")}`).join("、")}；指挥官等级 ≥ ${promotion.commanderLevel}${promotion.honor ? `；须先完成${promotion.honorLevel}级授勋（命运之勋）` : ""}`;
    return { ...promotion, costs, description, showHonor: index === firstHonor };
  });
}
