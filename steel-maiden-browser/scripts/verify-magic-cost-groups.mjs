import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { organizeMagicCosts } from "./magic-cost-groups.mjs";

const load = async (relative) => JSON.parse(await fs.readFile(new URL(relative, import.meta.url), "utf8"));
const [data, report, client] = await Promise.all([
  load("../public/data/maidens.json"), load("../public/data/magic-cost-groups.json"),
  load("../../analysis_apk/output/magic_ordnance/magic_progression_catalog.json"),
]);
const expected = organizeMagicCosts(data.rows, client.progression);
assert.equal(data.rows.length, Object.keys(client.selectorsByCard).length);
assert.equal(new Set(report.cards.map((card) => card.id)).size, data.rows.length);
assert.deepEqual(report.cards, expected.cards);
assert.deepEqual(report.groups, expected.groups);
assert.equal(report.groups.reduce((sum, group) => sum + group.count, 0), data.rows.length);
const byId = new Map(report.cards.map((card) => [card.id, card]));
for (const row of data.rows) {
  assert.deepEqual(row.magicSelectors, client.selectorsByCard[row.id], `${row.tank}: source selectors`);
  assert.equal(row.magicCostGroup, byId.get(row.id).group);
  for (const kind of ["ordnance", "tactics"]) {
    const recipe = report.recipes[row.magicSelectors[kind]];
    const raw = expected.recipes[row.magicSelectors[kind]];
    assert.equal(recipe.kind, kind);
    assert.equal(recipe.stage, byId.get(row.id).costStage);
    assert.equal(recipe.recipe.levels.length, 10);
    for (let level = 0; level < 10; level++) {
      const entry = recipe.recipe.levels[level];
      assert.equal(entry.scoutLevel, raw.recipe.levels[level].scoutLevel);
      assert.equal(entry.marks, raw.recipe.levels[level].marks);
      assert.deepEqual(entry.materials.map(({ fundId, name, amount }) => ({ fundId, name, amount })), raw.recipe.levels[level].materials.map(({ fundId, name, amount }) => ({ fundId, name, amount })));
    }
  }
}
const counts = Object.fromEntries(report.groups.map((group) => [group.id, group.count]));
assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), data.rows.length);
assert.equal(byId.get(9881).group, "N5+", "M26(T99) must follow its actual N5-high recipe, not the displayed N1 blueprint");
assert.equal(byId.get(8411).group, "N3", "no-blueprint aircraft still has a concrete magic recipe");

// Check ordered tiers against resource totals, not an arbitrary sum of unlike currencies.
const totals = (recipe) => recipe.levels.reduce((sums, level) => {
  for (const material of level.materials) sums[material.fundId] = (sums[material.fundId] ?? 0) + material.amount;
  return sums;
}, {});
for (const stage of ["N4", "N5", "N6"]) {
  const recipes = ["-", "", "+"].map((suffix) => {
    const card = report.cards.find((card) => card.group === `${stage}${suffix}` && card.vehicle === "ground");
    return totals(report.recipes[card.ordnance].recipe);
  });
  for (let index = 1; index < recipes.length; index++) {
    for (const [fund, amount] of Object.entries(recipes[index - 1])) assert.ok(recipes[index][fund] >= amount, `${stage}: tier costs must increase per resource`);
  }
}
console.log(JSON.stringify({ verifiedCards: data.rows.length, verifiedLevelRecipes: data.rows.length * 20, activeGroups: report.groups.filter((group) => group.count).length, counts, exceptions: report.exceptions }));
