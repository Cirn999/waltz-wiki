import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.resolve(appRoot, "..", "analysis_apk", "output", "equipment_catalog", "equipment_catalog.json");
const preparedPath = path.join(appRoot, "public", "data", "equipment-catalog.json");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const prepared = JSON.parse(await fs.readFile(preparedPath, "utf8"));

assert.equal(source.summary.unresolvedEnhancementRuleCount, 0, "every enhancement production line must resolve");
assert.equal(source.summary.unresolvedEquipmentSkillTemplateCount, 0, "every equipment skill template must resolve");
assert.equal(prepared.slots.length, source.summary.slotCount, "prepared slot count differs from parsed client data");
assert.equal(prepared.families.length, source.summary.familyCount, "prepared family count differs from parsed client data");
assert.equal(source.summary.familyWithDescriptionCount, source.summary.familyCount, "every equipment family must expose a flavour description");

const levels = source.families.flatMap((family) => family.levels);
const byFundId = new Map(levels.map((level) => [level.fundId, level]));
assert.equal(byFundId.size, source.summary.equipmentFundCount, "equipment fund IDs must be unique");
assert(levels.every((level) => level.stats.every((stat) => Number.isFinite(stat.value))), "equipment stats must contain finite values");
const effects = levels.flatMap((level) => level.effects ?? []);
assert.equal(effects.length, source.summary.equipmentEffectCount, "effect count differs from parsed client data");
assert(effects.every((effect) => Number.isFinite(effect.value) && effect.name && effect.description), "equipment effects must be complete");
assert(effects.every((effect) => !/[<#]\$?\d|<font/i.test(effect.description)), "equipment effects must not expose client markup or placeholders");
const hiddenKeys = ["fireproof", "homogeneity", "coverage"];
let hiddenLevels = 0;
for (const family of source.families) {
  const preparedFamily = prepared.families.find((item) => item.id === family.id);
  assert(preparedFamily, `${family.name}: prepared equipment family missing`);
  for (const level of family.levels) {
    const preparedLevel = preparedFamily.levels.find((item) => item.level === level.level);
    assert(preparedLevel, `${family.name} S${level.level}: prepared equipment level missing`);
    for (const key of hiddenKeys) assert.equal(preparedLevel.hiddenStats?.[key], level.hiddenStats?.[key] ?? 0, `${family.name} S${level.level}: ${key} differs from client growth template`);
    if (hiddenKeys.some((key) => level.hiddenStats?.[key])) hiddenLevels++;
  }
}
assert(hiddenLevels > 0, "equipment hidden rating attributes were not extracted");
const s1Hidden = (name, slotTag) => source.families.find((family) => family.name === name && family.slotTag === slotTag)?.levels.find((level) => level.level === 1)?.hiddenStats;
assert.equal(s1Hidden("灭火器", 453)?.fireproof, 2);
assert.equal(s1Hidden("弹药水套", 453)?.fireproof, 6);
assert.equal(s1Hidden("燃油清滤器", 453)?.homogeneity, 7);
assert.equal(s1Hidden("增固护板", 452)?.coverage, 4);

const infantryRail = source.families.find((family) => family.name === "步兵扶手" && !family.advanced);
assert(infantryRail, "步兵扶手 family is missing");
assert(infantryRail.description.includes("可以让步兵们攀爬的扶手"), "步兵扶手 flavour text differs from FundAchievementInfo");
assert.equal(infantryRail.levels.find((level) => level.level === 1)?.effects[0]?.value, 1225, "步兵扶手 S1 effect must use the client skill intensity");
assert(infantryRail.levels.find((level) => level.level === 10)?.effects[0]?.value > 1225, "步兵扶手 effect must grow with equipment level");
const rammer = source.families.find((family) => family.name === "输弹机" && !family.advanced);
assert(rammer, "输弹机 family is missing");
assert(rammer.levels.every((level) => !(level.effects ?? []).length), "输弹机 must not gain an invented special effect");

const recipes = levels.filter((level) => level.recipe).map((level) => level.recipe);
assert.equal(recipes.length, source.summary.recipeCount, "recipe count differs from parsed client data");
assert(recipes.every((recipe) => recipe.targetAmount === 1), "cumulative expansion currently requires single-output enhancement recipes");
assert(recipes.some((recipe) => new Set(recipe.materials.filter((item) => item.equipment).map((item) => item.fundId)).size >= 2), "catalog must preserve at least one mixed 2A+1B-style recipe");

const cache = new Map();
function expand(fundId, active = new Set()) {
  if (cache.has(fundId)) return new Map(cache.get(fundId));
  assert(!active.has(fundId), `recipe cycle at fund ${fundId}`);
  const level = byFundId.get(fundId);
  if (!level?.recipe) return new Map([[fundId, 1]]);
  const nextActive = new Set(active).add(fundId);
  const total = new Map();
  for (const material of level.recipe.materials) {
    const entries = material.equipment ? expand(material.fundId, nextActive) : new Map([[material.fundId, 1]]);
    for (const [terminalId, amount] of entries) total.set(terminalId, (total.get(terminalId) ?? 0) + amount * material.amount);
  }
  cache.set(fundId, total);
  return new Map(total);
}

for (const level of levels) {
  const expected = [...expand(level.fundId)].sort((a, b) => a[0] - b[0]);
  const actual = level.cumulative.map((item) => [item.fundId, item.amount]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(actual, expected, `cumulative materials differ for fund ${level.fundId}`);
  for (const item of level.cumulative.filter((material) => material.equipment)) {
    assert.equal(byFundId.get(item.fundId)?.level, 1, `cumulative equipment ${item.fundId} is not folded to S1`);
  }
}

const missingSlotIcons = prepared.slots.filter((slot) => !slot.icon).map((slot) => slot.name);
const missingFamilyIcons = prepared.families.filter((family) => !family.icon).map((family) => family.name);
const missingLevelIcons = prepared.families.flatMap((family) =>
  family.levels.filter((level) => !level.icon).map((level) => `${family.name} S${level.level}`),
);
const missingMaterialIcons = prepared.families.flatMap((family) => family.levels.flatMap((level) => [
  ...(level.recipe?.materials ?? []),
  ...level.cumulative,
].filter((material) => !material.icon).map((material) => `${family.name} S${level.level}: ${material.name} #${material.fundId}`)));
assert.deepEqual(missingSlotIcons, [], `missing slot icons: ${missingSlotIcons.join(", ")}`);
assert.deepEqual(missingFamilyIcons, [], `missing equipment icons: ${missingFamilyIcons.slice(0, 10).join(", ")}`);
assert.deepEqual(missingLevelIcons, [], `missing level icons: ${missingLevelIcons.slice(0, 10).join(", ")}`);
assert.deepEqual(missingMaterialIcons, [], `missing material icons: ${missingMaterialIcons.slice(0, 10).join(", ")}`);

console.log(JSON.stringify({
  slots: prepared.slots.length,
  families: prepared.families.length,
  equipmentFunds: byFundId.size,
  recipes: recipes.length,
  mixedRecipes: recipes.filter((recipe) => new Set(recipe.materials.filter((item) => item.equipment).map((item) => item.fundId)).size >= 2).length,
  cumulativeEntriesChecked: levels.length,
  equipmentEffects: effects.length,
  hiddenAttributeLevels: hiddenLevels,
  describedFamilies: source.summary.familyWithDescriptionCount,
}, null, 2));
