import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { deduplicateAcquisitionShops } from "./acquisition-shop-aliases.mjs";

const root = path.resolve(import.meta.dirname, "..");
const source = JSON.parse(await fs.readFile(path.join(root, "../analysis_apk/output/acquisition_analysis_v2_outfits/acquisition_paths_preliminary.json"), "utf8"));
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const generic = source.cards.find((row) => row.cardId === 6242).routes.shop.find((row) => row.shopName === "兑换处");
const named = { ...generic, shopName: "预备队标兵", shopId: 5099 };
const original = structuredClone([generic, named]);
assert.deepEqual(deduplicateAcquisitionShops([generic, named]), [{ ...named, hasGenericExchangeAlias: true }]);
assert.deepEqual([generic, named], original, "Normalization does not mutate client source evidence");
assert.deepEqual(deduplicateAcquisitionShops([named, generic]), [{ ...named, hasGenericExchangeAlias: true }], "Independent of source order");
for (const different of [
  { ...named, commodityId: named.commodityId + 1 },
  { ...named, produceRuleId: named.produceRuleId + 1 },
  { ...named, costs: [{ ...named.costs[0], amount: 37 }] },
  { ...named, costs: [{ ...named.costs[0], fundId: 1000 }] },
  { ...named, costs: [...named.costs, { fundId: 1000, amount: 10 }] },
  { ...named, cardId: named.cardId + 1 },
  { ...named, deliveryModes: ["获得舞装后在仓库征召"] },
  { ...named, outfitFundIds: [123] },
  { ...named, shopName: "未知活动商店" },
]) assert.equal(deduplicateAcquisitionShops([generic, different]).length, 2, "Do not deduplicate distinct or unconfirmed offers merely because costs look the same");
assert.equal(deduplicateAcquisitionShops([{ ...generic, campaignLabels: ["另一活动"] }, named]).length, 2);
assert.equal(deduplicateAcquisitionShops([generic]).length, 1, "A standalone generic exchange remains visible");
assert.equal(deduplicateAcquisitionShops([{ ...generic, costs: [] }, { ...named, costs: [] }]).length, 2, "Incomplete evidence is not sufficient");
const alternative = { ...generic, commodityId: generic.commodityId + 1, costs: [{ ...generic.costs[0], amount: 18 }] };
assert.deepEqual(deduplicateAcquisitionShops([generic, alternative, named]), [alternative, { ...named, hasGenericExchangeAlias: true }], "Other exchange plans survive partial deduplication");

const byId = new Map(data.rows.map((row) => [row.id, row]));
const changed = [];
for (const card of source.cards) {
  const raw = card.routes.shop ?? [];
  const normalized = deduplicateAcquisitionShops(raw);
  assert.deepEqual(deduplicateAcquisitionShops(normalized), normalized, "Idempotent normalization");
  if (raw.length === normalized.length) continue;
  const maiden = byId.get(Number(card.cardId));
  if (!maiden) continue;
  changed.push(maiden.id);
  for (const alias of normalized.filter((row) => row.hasGenericExchangeAlias)) {
    const route = maiden.acquisition.find((row) => row.label === alias.shopName);
    assert.ok(route, `${maiden.tank} retains its named entry`);
    for (const cost of alias.costs) {
      const detail = `${cost.name} ×${Number(cost.amount).toLocaleString("zh-CN")}`;
      assert.ok(route.details.includes(detail), `${maiden.tank} retains ${detail}`);
      assert.equal(maiden.acquisition.flatMap((row) => row.details).filter((value) => value === detail).length, 1, `${maiden.tank}: cost shown exactly once`);
    }
  }
}
assert.equal(changed.length, 15);
assert.equal(byId.get(6242).acquisition.length, 4);
assert.ok(byId.get(7007).acquisition.some((row) => row.label === "博物馆"));
assert.ok(byId.get(7007).acquisition.some((row) => row.label === "再制商店"), "Distinct event/shop rules remain, even with identical material prices");
assert.ok(data.rows.some((row) => row.acquisition.some((route) => route.label === "兑换处" && route.details.includes("彼得洛夫特许证 ×8"))), "Unrelated exchange preserved");
console.log(JSON.stringify({ checked: data.rows.length, deduplicated: changed.length, ids: changed, distinctOffersPreserved: true }));
