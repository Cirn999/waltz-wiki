import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const app = path.resolve(import.meta.dirname, "..");
const dataPath = path.join(app, "public/data/research-tree.json");
const load = async (name) => JSON.parse(await fs.readFile(path.join(app, "public/data", name + ".json"), "utf8"));
const [research, equipment, items, maidens] = await Promise.all([
  load("research-tree"), load("equipment-catalog"), load("item-catalog"), load("maidens"),
]);
const equipmentById = new Map(equipment.families.flatMap((family) => family.levels.map((entry) => [entry.fundId, {
  image: entry.icon || family.icon, slotIcon: family.typeIcon, level: entry.level, advanced: family.advanced,
}])));
const itemImages = new Map(items.items.map((item) => [item.id, item.image]));
const progressionImages = new Map(Object.values(maidens.magicProgression.progression).flatMap((domains) =>
  Object.values(domains).flatMap((kinds) => Object.values(kinds).flatMap((paths) => paths.flatMap((entry) =>
    entry.levels.flatMap((level) => level.materials.filter((material) => material.image).map((material) => [material.fundId, material.image])))))));
const resources = [...new Map(research.recipes.flatMap((recipe) => recipe.resourcePlans.flatMap((plan) => plan.resources)).map((resource) => [resource.fundId, resource])).values()];
const assets = {};
for (const resource of resources) {
  const asset = resource.category === "equipment" ? equipmentById.get(resource.fundId)
    : { image: itemImages.get(resource.fundId) || progressionImages.get(resource.fundId) };
  assert.ok(asset?.image, "Missing research resource artwork: " + resource.fundId + " " + resource.name);
  for (const image of [asset.image, asset.slotIcon].filter(Boolean)) {
    assert.ok(image.startsWith("/art/") && !image.includes(".."), "Invalid resource image: " + image);
    await fs.access(path.join(app, "public", image));
  }
  assets[resource.fundId] = asset;
}
if (process.argv.includes("--check")) assert.deepEqual(research.resourceAssets, assets, "Research resource artwork is stale; run prepare:research-resources");
else await fs.writeFile(dataPath, JSON.stringify({ ...research, resourceAssets: assets }));
console.log(JSON.stringify({ researchResources: resources.length, equipment: resources.filter((resource) => resource.category === "equipment").length, checkOnly: process.argv.includes("--check") }));
