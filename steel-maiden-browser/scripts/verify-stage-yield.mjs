import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { calculateNodeIncome, incomeAssessments, mergeScoreRanges, sumIncome } from "../app/stageIncome.ts";
import { buildStageYieldRows, filterStageYieldRows, sortStageYieldRows } from "../app/stageYield.ts";

const data = JSON.parse(await fs.readFile(new URL("../public/data/stage-catalog.json", import.meta.url), "utf8"));
function nodeIncome(settings) { return Object.fromEntries(Object.values(data.nodes).map((node) => [node.id, calculateNodeIncome(node.income, data.income, settings)])); }
const native = nodeIncome({ progress: 96, score: 92 });
const rows = buildStageYieldRows(data, native);
assert.equal(rows.length, 28);
assert.deepEqual(rows.map((row) => row.number), Array.from({ length: 28 }, (_, i) => i + 1));
assert.deepEqual(rows[0].income.amount, [2935, 18750, 186]);
assert.equal(rows[0].fuel, 41);
assert.equal(rows[0].silverPerFuel, 18750 / 41);
assert.equal(rows[0].codonsPerFuel, 186 / 41);
assert.deepEqual(rows.at(-1).income.amount, [12890, 82750, 564]);
assert.equal(rows.at(-1).fuel, 65);
const equipment = new Set(rows.flatMap((row) => row.equipment.map((item) => item.id)));
assert.equal(equipment.size, 78);
assert.deepEqual(rows[0].equipment.filter((item) => item.name === "强化火药").map((item) => item.slotName).sort(), ["改装", "炮座"].sort());
for (const row of rows) {
  assert.ok(row.fuel > 0);
  assert.equal(row.equipment.length, new Set(row.equipment.map((item) => item.id)).size);
  assert.ok(row.equipment.every((item) => item.kind === "装备" && item.slotName && item.image && item.slotIcon && item.ranges.length));
}
// Exact slot-specific IDs, multi-select OR, search, and no-match state.
for (const ids of [[], ["fund:8172"], ["fund:8173"], ["fund:8172", "fund:28505"]]) {
  const expected = rows.filter((row) => !ids.length || ids.some((id) => row.equipment.some((item) => item.id === id)));
  assert.deepEqual(filterStageYieldRows(rows, ids, ""), expected);
}
assert.ok(!filterStageYieldRows(rows, ["fund:8171"], "").some((row) => row.number === 1), "Same name in different slot must not match");
assert.equal(filterStageYieldRows(rows, [], "捷径28")[0].map.id, 157);
assert.deepEqual(filterStageYieldRows(rows, [], "强化火药"), rows.filter((row) => row.equipment.some((item) => item.name === "强化火药")));
assert.equal(filterStageYieldRows(rows, [], "不存在的地图").length, 0);
for (const key of ["number", "fuel", "silver", "codons", "silverPerFuel", "codonsPerFuel"]) {
  for (const desc of [false, true]) {
    const sorted = sortStageYieldRows(rows, key, desc);
    sorted.slice(1).forEach((row, i) => assert.ok(desc ? sorted[i][key] >= row[key] : sorted[i][key] <= row[key]));
  }
}
assert.equal(rows[0].number, 1, "Sorting cannot mutate the source");
let comparisons = 0;
for (const progress of data.income.progress) for (const grade of incomeAssessments(data.income)) {
  const settings = { progress: progress.value, score: grade.score };
  for (const row of buildStageYieldRows(data, nodeIncome(settings))) {
    const detail = sumIncome(row.map.nodes.map((id) => calculateNodeIncome(data.nodes[id].income, data.income, settings)));
    assert.deepEqual(row.income, detail);
    assert.equal(row.silver, detail.amount[1]);
    assert.equal(row.codons, detail.amount[2]);
    assert.equal(row.silverPerFuel, detail.amount[1] / row.fuel);
    assert.equal(row.codonsPerFuel, detail.amount[2] / row.fuel);
    comparisons++;
  }
}
// Multi-node aggregation must not duplicate equipment or charge fuel per node.
const composite = structuredClone(rows[0].map);
composite.nodes.push(...rows[1].map.nodes);
composite.entryCosts.push({ fundId: 1, name: "非燃油消耗", amount: 999 });
const multi = buildStageYieldRows({ ...data, maps: [composite] }, native)[0];
assert.equal(multi.fuel, 41);
assert.deepEqual(multi.income, sumIncome([rows[0].income, rows[1].income]));
assert.equal(multi.equipment.length, new Set([...rows[0].equipment, ...rows[1].equipment].map((item) => item.id)).size);
assert.deepEqual(multi.equipment.find((item) => item.id === "fund:8172").ranges,
  mergeScoreRanges(composite.nodes.flatMap((id) => data.nodes[id].dropScores["fund:8172"])));
composite.entryCosts = [];
const noFuel = buildStageYieldRows({ ...data, maps: [composite] }, native)[0];
assert.equal(noFuel.silverPerFuel, null);
assert.equal(noFuel.codonsPerFuel, null);
assert.equal(sortStageYieldRows([noFuel, rows[1]], "silverPerFuel", true).at(-1), noFuel);
assert.equal(sortStageYieldRows([noFuel, rows[1]], "silverPerFuel", false).at(-1), noFuel);
assert.deepEqual(buildStageYieldRows({ ...data, maps: [{ ...composite, simulation: true }] }, native), []);
console.log(JSON.stringify({ ok: true, maps: rows.length, equipment: equipment.size, comparisons, tests: "native snapshots; 25 tiers x S/A/B vs detail totals; equipment slots/OR/search; numeric sort; zero-fuel guard; multi-node union and fuel charged once" }, null, 2));
