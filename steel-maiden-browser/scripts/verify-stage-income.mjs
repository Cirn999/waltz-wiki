import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { calculateNodeIncome, dropGradeLabels, fixedCurrencyDrops, mergeScoreRanges, normalizeIncomeSettings, scoreAllows, sumIncome, visibleIncomeIndices } from "../app/stageIncome.ts";

const data = JSON.parse(await fs.readFile(new URL("../public/data/stage-catalog.json", import.meta.url), "utf8"));
const { income } = data;
assert.equal(data.schemaVersion, 2);
assert.deepEqual(income.progress.map((p) => p.value), Array.from({ length: 25 }, (_, i) => i * 4));
console.log("Native assessments:", income.assessments);
assert.deepEqual(income.assessments.map((a) => a.grade), ["E", "D", "C", "B", "A", "S", "S"]);
const map = data.maps.find((m) => m.id === 106);
assert.equal(map.name, "哈尔科夫");
function node(id, progress, score = 100) { return calculateNodeIncome(data.nodes[id].income, income, { progress, score }); }
for (let rank = 0; rank <= 104; rank++) {
  const n = Math.min(Math.floor(rank / 4), 24);
  for (const score of [51, 70, 92, 100]) {
    const rows = map.nodes.map((id) => node(id, rank, score));
    assert.deepEqual(rows.map((r) => r.amount), [0, 0, 600, 0, 0, 600].map((bonus) => [300 + 50 * n + bonus, 400 + 200 * n, 0]));
    assert.deepEqual(sumIncome(rows), { amount: [3000 + 300 * n, 2400 + 1200 * n, 0], variable: false, dynamic: false });
  }
}
assert.deepEqual(normalizeIncomeSettings({ progress: 101, score: 92 }, income), { progress: 96, score: 92 });
assert.deepEqual(normalizeIncomeSettings({ progress: 95, score: 70 }, income), { progress: 92, score: 70 });
assert.deepEqual(normalizeIncomeSettings({ progress: 96, score: 100 }, income), { progress: 96, score: 92 }, "Legacy perfect S merges into S");
const first244 = data.maps.find((m) => m.group === "主线战役" && m.code === "24-4").nodes[0];
assert.deepEqual(node(first244, 96).amount, [1345, 3750, 30]);
const serverMaps = data.maps.filter((m) => ["assault", "air"].includes(m.category) && !m.simulation);
assert.equal(serverMaps.length, 80);
for (const map of serverMaps) {
  for (const score of [51, 70, 92, 100]) for (const progress of [0, 48, 96]) {
    const result = sumIncome(map.nodes.map((id) => node(id, progress, score)));
    assert.equal(result.serverExperience, true, `${map.name}: absent local XP must not be presented as zero`);
  }
}
assert.equal(node(first244, 96).serverExperience, undefined);
assert.equal(sumIncome([node(first244, 96), node(serverMaps[0].nodes[0], 96)]).serverExperience, true, "Unknown server XP propagates to a mixed total");
assert.deepEqual(visibleIncomeIndices({ amount: [100, 0, 0], variable: false, dynamic: false }), [0]);
assert.deepEqual(visibleIncomeIndices({ amount: [100, 0, 2500], variable: false, dynamic: false, serverExperience: true }), [2]);
assert.deepEqual(visibleIncomeIndices({ amount: [100, 0, 2500], variable: false, dynamic: false, serverExperience: true }, true), []);
assert.deepEqual(visibleIncomeIndices({ amount: [0, 0, 0], variable: false, dynamic: false }, false, true), [], "Empty activity income is hidden");
assert.deepEqual(visibleIncomeIndices({ amount: [0, 500, 20], variable: false, dynamic: false }, false, true), [1, 2], "Hide only zero XP, not positive currencies");
assert.deepEqual(visibleIncomeIndices({ amount: [100, 0, 0], variable: false, dynamic: false }, false, true), [0], "Positive activity XP is preserved");
assert.deepEqual(visibleIncomeIndices({ amount: [0, 0, 0], variable: false, dynamic: false }), [0], "Other categories retain their XP display policy");
for (const map of data.maps.filter((m) => m.category === "event")) for (const progress of [0, 48, 96]) for (const score of [51, 70, 92]) {
  for (const result of [...map.nodes.map((id) => node(id, progress, score)), sumIncome(map.nodes.map((id) => node(id, progress, score)))]) {
    assert.deepEqual(visibleIncomeIndices(result, false, true), [0, 1, 2].filter((i) => result.amount[i] > 0));
  }
}
assert.deepEqual(mergeScoreRanges([[92, 100], [70, 91], [92, 100], [0, 5]]), [[0, 5], [70, 100]]);
const raid5 = data.maps.find((m) => m.mode === "VOL_EXPANSION_05");
const raid5Drops = fixedCurrencyDrops(raid5.nodes.map((id) => data.nodes[id].income), income, { progress: 0, score: 92 });
assert.ok(raid5Drops.some((d) => d.index === 2 && d.amount === 2500), "Raid 5 codons come from the original income calculation");
for (const map of serverMaps) for (const progress of [0, 48, 96]) for (const score of [51, 70, 92]) {
  const native = sumIncome(map.nodes.map((id) => node(id, progress, score)));
  const loot = fixedCurrencyDrops(map.nodes.map((id) => data.nodes[id].income), income, { progress, score });
  assert.equal(new Set(loot.map((d) => d.index)).size, loot.length);
  for (const drop of loot) {
    assert.ok(drop.amount > 0, "Never render a zero currency drop");
    if (scoreAllows(drop.ranges, score)) assert.equal(drop.amount, native.amount[drop.index], `${map.name}: no duplicate or inflated currency amount`);
    else assert.equal(native.amount[drop.index], 0);
  }
  for (const index of [1, 2]) if (native.amount[index] > 0) assert.ok(loot.some((d) => d.index === index));
}
for (const raw of [null, {}, "bad", { progress: "96", score: "100" }, { progress: -1, score: -1 }, { progress: Infinity, score: NaN }]) {
  assert.deepEqual(normalizeIncomeSettings(raw, income), { progress: 0, score: 92 });
}
assert.deepEqual(dropGradeLabels([[51, 100]], income), ["S", "A", "B"]);
assert.deepEqual(dropGradeLabels([[70, 100]], income), ["S", "A"]);
assert.deepEqual(dropGradeLabels([[92, 100]], income), ["S"]);
assert.deepEqual(dropGradeLabels([[100, 100]], income), ["S（100分）"]);
assert.deepEqual(dropGradeLabels([[0, 3]], income), ["E（0–3分）"]);
assert.deepEqual(dropGradeLabels([[0, 100]], income), ["不限评价"]);
assert.equal(scoreAllows([[100, 100]], 92), false);
assert.equal(scoreAllows([[100, 100]], 100), true);
const assessmentCounts = {};
const perfectDifferences = [];
for (const n of Object.values(data.nodes)) {
  assert.deepEqual(Object.keys(n.dropScores).sort(), n.drops.slice().sort());
  for (const ranges of Object.values(n.dropScores)) {
    assert.ok(ranges.length);
    ranges.forEach(([lo, hi], i) => {
      assert.ok(lo >= 0 && hi <= 100 && lo <= hi);
      if (i) assert.ok(lo > ranges[i - 1][1] + 1, "Merged union without overlaps");
    });
    const label = dropGradeLabels(ranges, income).join("/");
    assessmentCounts[label] = (assessmentCounts[label] ?? 0) + 1;
  }
  for (const tier of income.progress) for (const score of [51, 70, 92, 100]) {
    const result = node(n.id, tier.value, score);
    assert.ok(result.amount.every((v) => Number.isSafeInteger(v) && v >= 0));
  }
  if (income.progress.some((tier) => JSON.stringify(node(n.id, tier.value, 92)) !== JSON.stringify(node(n.id, tier.value, 100)))) perfectDifferences.push(n.id);
}
assert.deepEqual(perfectDifferences, [], "A unified S option requires identical fixed income for every node and reward tier");
assert.ok(Object.values(data.nodes).every((n) => Object.values(n.dropScores).every((ranges) => scoreAllows(ranges, 92) === scoreAllows(ranges, 100))), "Ordinary S and perfect S have identical visible drops");
// Alternative draws and zero-currency outcomes must not inflate fixed income.
const random = Object.values(income.pools).find((p) => !p.deterministic);
assert.ok(random);
const variable = calculateNodeIncome({ sources: [{ poolId: random.id, minScore: 0, maxScore: 100, guaranteedTable: true }], dynamic: false }, income, { progress: 96, score: 100 });
assert.deepEqual(variable.amount, [0, 0, 0]);
assert.equal(variable.variable, true);
const fixed = Object.values(income.pools).find((p) => p.deterministic && p.variants.length === 1 && p.variants[0].amount.some(Boolean));
assert.deepEqual(calculateNodeIncome({ sources: [{ poolId: fixed.id, minScore: 92, maxScore: 100, guaranteedTable: true }], dynamic: false }, income, { progress: 96, score: 70 }).amount, [0, 0, 0]);
assert.deepEqual(calculateNodeIncome({ sources: [{ poolId: fixed.id, minScore: 0, maxScore: 100, guaranteedTable: false }], dynamic: false }, income, { progress: 96, score: 100 }).amount, [0, 0, 0]);
console.log(JSON.stringify({ ok: true, audit: income.audit, assessmentCounts, perfectDifferences, specialMax: sumIncome(map.nodes.map((id) => node(id, 96))).amount }, null, 2));
