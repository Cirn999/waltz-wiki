import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { matchesCraftResistances } from "../app/resistanceFilters.ts";

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const plz = rows.find((row) => row.id === 9865);
const wz = rows.find((row) => row.id === 6132);
assert.equal(plz.tank, "PLZ05");
assert.equal(matchesCraftResistances(plz.bodyOptions, ["抗泥沼", "广阔适应"]), false);
assert.equal(matchesCraftResistances(plz.bodyOptions, ["抗泥沼", "广阔适应"], true), true);
assert.equal(matchesCraftResistances(plz.bodyOptions, ["抗泥沼", "抗灌木"]), true);
assert.equal(matchesCraftResistances(plz.bodyOptions, ["抗泥沼"]), true);
assert.equal(matchesCraftResistances(wz.engineOptions, ["抗冻结", "抗起伏"]), false);
assert.equal(matchesCraftResistances(wz.engineOptions, ["抗冻结", "抗起伏"], true), true);
assert.equal(matchesCraftResistances(wz.engineOptions, ["抗冻结", "抗潮湿"]), true);
assert.equal(matchesCraftResistances(wz.engineOptions, ["抗冻结"]), true);
for (const mode of [false, true]) {
  assert.equal(matchesCraftResistances([], [], mode), true);
  assert.equal(matchesCraftResistances([], ["抗泥沼"], mode), false);
  assert.equal(matchesCraftResistances(plz.engineOptions, ["抗泥沼"], mode), false, "engine and body families must stay separate");
  assert.equal(matchesCraftResistances(plz.bodyOptions, ["不存在的抗性"], mode), false);
}
console.log(JSON.stringify({ regressionCars: [plz.id, wz.id], defaultSameCraft: true, optInAcrossCrafts: true, singleAndEmptySelection: true, familiesIndependent: true }));
