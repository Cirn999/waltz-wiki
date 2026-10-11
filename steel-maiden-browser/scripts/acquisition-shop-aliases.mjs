const shopName = (row) => String(row.shopName ?? "").replace(/\s+/g, "");
const namedExchangeShops = new Set(["预备队标兵", "特勤局精英"]);
const sorted = (items = []) => [...items].sort();

function offerKey(row) {
  if (!(Number(row.cardId) > 0 && Number(row.commodityId) > 0 && Number(row.produceRuleId) > 0)) return null;
  if (!Array.isArray(row.costs) || !row.costs.length || row.costs.some((cost) => !(Number(cost.fundId) > 0) || !Number.isFinite(Number(cost.amount)))) return null;
  return JSON.stringify([
    Number(row.cardId), Number(row.commodityId), Number(row.produceRuleId),
    sorted(row.costs.map((cost) => `${Number(cost.fundId)}:${Number(cost.amount)}`)),
    sorted(row.deliveryModes), sorted(row.outfitFundIds), Boolean(row.directCardConfigured),
  ]);
}

// These named menus and the generic exchange menu reference the same native
// commodity/produce rule. Match the complete offer, not just its displayed cost:
// different shops can legitimately charge the same materials for different offers.
export function deduplicateAcquisitionShops(rows) {
  const removed = new Set();
  const namedAliases = new Set();
  for (const generic of rows) {
    if (shopName(generic) !== "兑换处") continue;
    const key = offerKey(generic);
    if (!key) continue;
    const named = rows.find((row) => namedExchangeShops.has(shopName(row)) && offerKey(row) === key
      && (generic.campaignLabels ?? []).every((label) => (row.campaignLabels ?? []).includes(label)));
    if (!named) continue;
    removed.add(generic);
    namedAliases.add(named);
  }
  return rows.filter((row) => !removed.has(row)).map((row) => namedAliases.has(row) ? { ...row, hasGenericExchangeAlias: true } : row);
}
