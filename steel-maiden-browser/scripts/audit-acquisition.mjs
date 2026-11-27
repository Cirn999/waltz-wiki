import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(import.meta.dirname, "..");
const load = async (file) => JSON.parse(await fs.readFile(path.resolve(appRoot, file), "utf8"));
const [dataset, research, acquisition] = await Promise.all([
  load("public/data/maidens.json"), load("public/data/research-tree.json"),
  load("../analysis_apk/output/acquisition_analysis_v2_outfits/acquisition_paths_preliminary.json"),
]);
const ids = (rows, key) => rows.map((row) => Number(row[key])).sort((a, b) => a - b);
assert.equal(new Set(dataset.rows.map((row) => row.id)).size, dataset.rows.length);
assert.deepEqual(ids(dataset.rows, "id"), ids(acquisition.cards, "cardId"), "Acquisition source must cover the current client roster");
const researchTargets = new Set(research.recipes.map((recipe) => Number(recipe.targetId)));
for (const maiden of dataset.rows) {
  const routes = maiden.acquisition;
  assert.equal(routes.some((route) => route.kind === "research"), researchTargets.has(maiden.id), maiden.tank + ": research follows client recipes");
  assert.equal(new Set(routes.map((route) => route.kind + ":" + route.label)).size, routes.length, maiden.tank + ": unique acquisition entries");
  for (const route of routes) {
    assert.ok(route.label.trim());
    assert.equal(new Set(route.details).size, route.details.length, maiden.tank + ": unique details");
  }
}
// Re-running against the current decoded client must reproduce every route,
// including removal of old offers when the client configuration changes.
const report = JSON.parse(execFileSync(process.execPath, ["scripts/prepare-data.mjs", "--acquisition-only", "--check"], {
  cwd: appRoot, encoding: "utf8", windowsHide: true,
}));
assert.deepEqual(report.changed, [], "Generated routes must match the current client configuration");
console.log(JSON.stringify({ records: dataset.rows.length, researchTargets: researchTargets.size, clientRoutesReproduced: true }));
