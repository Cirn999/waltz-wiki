export type BaseResource = { id?: number; name: string; image: string; amount?: number; description?: string };
export type BaseUpgrade = { id: number; from: number; to: number; seconds: number; requirements: string[]; costs: BaseResource[] };
export type BaseBuilding = {
  id: number; name: string; description: string; image: string; width: number; height: number; x: number; y: number; maxLevel: number;
  upgrades: BaseUpgrade[]; columns: { key: string; label: string; unit: string }[];
  effects: { level: number; values: Record<string, number> }[]; notes: string[];
  unlocks: { level: number; building: string; targetLevel: number; requirements: string[] }[];
};
export type BaseMilitary = {
  id: number; name: string; description: string; image: string; stationLevel: number; group: number;
  recommendedLevel: number; difficulty: number; times: { label: string; seconds: number }[];
  rewards: BaseResource[]; bonuses: { talent: string; image: string; reward: BaseResource }[];
};
export type BaseOffer = { purchaseLevel: number; amount: number; costs: BaseResource[]; slots: number[] };
export type BaseGoods = { key: string; id: number; name: string; image: string; kind: string; shop: { image: string; frame: string; backdrop: string; grade: string }; offers: BaseOffer[] };
export type BaseCatalog = {
  schemaVersion: number;
  map: { width: number; height: number; background: string; title: string; nameplate: string };
  buildings: BaseBuilding[]; military: BaseMilitary[];
  militaryLevels: { level: number; groups: number; activities: number }[];
  port: { ui: { tile: string }; levels: { level: number; slots: number; silverRefreshCosts: number[]; goods: number }[]; goods: BaseGoods[] };
};
export function baseDuration(seconds: number): string {
  if (!seconds) return "即时";
  const units = [[86400, "天"], [3600, "小时"], [60, "分钟"], [1, "秒"]] as const;
  let rest = seconds;
  return units.flatMap(([size, name]) => { const n = Math.floor(rest / size); rest %= size; return n ? [n + name] : []; }).join(" ");
}

/** A price/quantity pair has one earliest purchase-rule gate (not a refresh unlock), regardless of dock. */
export function baseGoodsOffers(offers: BaseOffer[]): Omit<BaseOffer, "slots">[] {
  const pairs = new Map<string, Omit<BaseOffer, "slots">>();
  for (const offer of offers) {
    const costs = offer.costs.map(c => [c.id ?? c.name, c.amount]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const key = JSON.stringify([offer.amount, costs]);
    const existing = pairs.get(key);
    if (!existing || offer.purchaseLevel < existing.purchaseLevel) {
      pairs.set(key, { amount: offer.amount, costs: offer.costs, purchaseLevel: offer.purchaseLevel });
    }
  }
  return [...pairs.values()].sort((a, b) => a.amount - b.amount || a.purchaseLevel - b.purchaseLevel);
}
