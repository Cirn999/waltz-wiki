import assert from "node:assert/strict";
import fs from "node:fs/promises";

const load = async (relative) => JSON.parse(await fs.readFile(new URL(relative, import.meta.url), "utf8"));
const [
  source,
  maidens,
  growthSource,
  growthPublic,
  loadout,
  colonization,
  magicCosts,
  magicOrdnance,
  magicProgression,
  acquisition,
] = await Promise.all([
  load("../../analysis_apk/output/steel_maiden_catalog_v4/钢舞姬汇总数据.json"),
  load("../public/data/maidens.json"),
  load("../../analysis_apk/output/growth_curves/growth_curves.json"),
  load("../public/data/growth-curves.json"),
  load("../public/data/loadout-rules.json"),
  load("../public/data/colonization-catalog.json"),
  load("../public/data/magic-cost-groups.json"),
  load("../../analysis_apk/output/magic_ordnance/magic_ordnance_catalog.json"),
  load("../../analysis_apk/output/magic_ordnance/magic_progression_catalog.json"),
  load("../../analysis_apk/output/acquisition_analysis_v2_outfits/acquisition_paths_preliminary.json"),
]);

const normalize = (ids) => ids.map(Number).sort((a, b) => a - b);
const canonicalIds = normalize(source.rows.map((row) => row["钢舞姬卡牌ID"]));
assert.equal(new Set(canonicalIds).size, canonicalIds.length, "主目录存在重复卡牌 ID");

const datasets = new Map([
  ["网页钢舞姬目录", maidens.rows.map((row) => row.id)],
  ["成长曲线源数据", Object.keys(growthSource.rows)],
  ["网页成长曲线", Object.keys(growthPublic.rows)],
  ["装配规则", Object.keys(loadout.cards)],
  ["强殖数据", Object.keys(colonization.rows)],
  ["魔改费用分组", magicCosts.cards.map((card) => card.id)],
  ["魔改军械", Object.keys(magicOrdnance.rows)],
  ["魔改成长选择器", Object.keys(magicProgression.selectorsByCard)],
  ["获取途径", acquisition.cards.map((card) => card.cardId)],
]);

const checks = [];
for (const [name, rawIds] of datasets) {
  const ids = normalize(rawIds);
  assert.equal(new Set(ids).size, ids.length, `${name}存在重复卡牌 ID`);
  assert.deepEqual(ids, canonicalIds, `${name}与主目录卡牌 ID 集合不一致`);
  checks.push({ name, cards: ids.length });
}

assert.equal(acquisition.meta.maidenCount, canonicalIds.length, "获取途径元数据数量不一致");
for (const row of maidens.rows) {
  assert.ok(row.stats?.[60], `${row.id} 缺少 60 级属性`);
  assert.ok(Array.isArray(row.magicOrdnance) && row.magicOrdnance.length > 0, `${row.id} 缺少魔改军械`);
  assert.ok(row.magicSelectors?.ordnance && row.magicSelectors?.tactics, `${row.id} 缺少魔改选择器`);
  assert.ok(row.magicCostGroup, `${row.id} 缺少魔改费用分组`);
}

for (const id of [9822, 9823, 9824]) {
  assert.ok(canonicalIds.includes(id), `主目录缺少本次新增卡牌 ${id}`);
  for (const [name, rawIds] of datasets) {
    assert.ok(rawIds.map(Number).includes(id), `${name}缺少本次新增卡牌 ${id}`);
  }
}

console.log(JSON.stringify({
  canonicalCards: canonicalIds.length,
  exactIdSetChecks: checks,
  newCardsChecked: [9822, 9823, 9824],
  perCardFieldsChecked: ["stats.60", "magicOrdnance", "magicSelectors", "magicCostGroup"],
}));
