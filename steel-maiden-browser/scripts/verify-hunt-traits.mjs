import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { applyHuntTraits, createHuntTraitsIndex } from "./hunt-traits.mjs";

const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const report = JSON.parse(await fs.readFile(new URL("../../analysis_apk/output/hunt_special_lineups/狩猎任务特殊阵容_游戏判定.json", import.meta.url), "utf8"));
const expectedCounts = Object.fromEntries(report.tasks.map((task) => [task.task, task.qualifying_count]));
const regenerated = structuredClone(data);
applyHuntTraits(regenerated, report);
assert.deepEqual(regenerated, data, "all filter consumers must receive the corrected shared roster");
for (const [task, count] of Object.entries(expectedCounts)) {
  assert.equal(data.rows.filter((row) => row.huntTraits.some((trait) => trait.task === task)).length, count, task);
}
const tasksOf = (id) => data.rows.find((row) => row.id === id).huntTraits.map((trait) => trait.task);
assert.deepEqual(tasksOf(6328), ["P-30"], "IV号G液力 is beast-eared, not the entire glasses roster");
assert.deepEqual(tasksOf(6331), ["P-31"], "T-34-2 belongs to black hair");
assert.deepEqual(tasksOf(6156), ["P-32"], "M3李I belongs to glasses, not black hair");
assert.deepEqual(tasksOf(6021), ["P-30", "P-32"], "a maiden can qualify for more than one task");
assert.deepEqual(tasksOf(8401), ["P-32"], "aviation alone must not qualify as beast ears");
assert.deepEqual(tasksOf(9825), ["P-31"], "BTR-60P M1961/1 has the native black-hair tag");
assert.deepEqual(tasksOf(9827), ["P-31"], "EG MBT has the native black-hair tag");
for (const mutate of [
  (copy) => { copy.tasks[0].capsule_tag_id = 4718; },
  (copy) => { copy.tasks[0].minimum = 0; },
  (copy) => { copy.tasks[1].description = copy.tasks[2].description; },
  (copy) => { copy.tasks[2].roster[1] = copy.tasks[2].roster[0]; },
]) {
  const stale = structuredClone(report);
  mutate(stale);
  assert.throws(() => createHuntTraitsIndex(stale), "reject a stale/misbound report before writing data");
}
console.log(JSON.stringify({ cards: data.rows.length, counts: expectedCounts, regressionCases: 11 }));
