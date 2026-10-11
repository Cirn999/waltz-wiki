import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { taskHiddenReason, taskRewardLabel } from "../app/taskAvailability.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(root, "public/data/task-catalog.json"), "utf8"));
assert.equal(data.schemaVersion, 1);
assert.deepEqual(data.categories.map((c) => [c.name, c.count]), [["新手", 130], ["建设", 32], ["挑战", 164], ["主线", 78], ["退返", 50]]);
assert.equal(data.tasks.length, 454);
assert.equal(new Set(data.tasks.map((t) => t.id)).size, data.tasks.length);
const byId = new Map(data.tasks.map((t) => [t.id, t]));
const equipment = JSON.parse(fs.readFileSync(path.join(root, "public/data/equipment-catalog.json"), "utf8"));
const equipmentLevels = new Map(equipment.families.flatMap((f) => f.levels.map((l) => [l.fundId, l.level])));
for (const task of data.tasks) {
  assert.ok(task.name && task.description);
  assert.ok(data.categories.some((c) => c.id === task.category));
  for (const key of ["prerequisites", "requirements"]) {
    assert.equal(new Set(task[key].map((c) => c.key)).size, task[key].length);
    assert.ok(task[key].every((c) => c.text && !/<[^>]+>/.test(c.text)));
  }
  for (const reward of task.rewards) {
    assert.ok(reward.name && reward.amount > 0);
    assert.ok(!reward.key.startsWith("3:"), "Internal quest updates must not appear as loot");
    assert.ok(reward.image && fs.existsSync(path.join(root, "public", reward.image)), reward.image);
    const expectedLevel = reward.key.startsWith("1:") ? equipmentLevels.get(Number(reward.key.slice(2))) : undefined;
    assert.equal(reward.equipmentLevel, expectedLevel, reward.key);
    if (expectedLevel) {
      assert.equal(reward.kind, "装备");
      assert.equal(taskRewardLabel(reward), `${reward.name} S${expectedLevel}`);
    }
  }
}
assert.deepEqual(byId.get(321010).prerequisites, []);
assert.equal(byId.get(321010).requirements[0].text, "司令部等级 ≥ 2");
assert.equal(byId.get(321020).prerequisites[0].text, "司令部等级 ≥ 2");
assert.deepEqual(byId.get(321010).rewards.map((r) => [r.name, r.amount]), [["金币", 50]]);
assert.deepEqual(byId.get(1080010).rewards.map((r) => [r.name, r.amount]), [["时装退返币", 219], ["认购币", 73]]);
assert.ok(byId.get(1080010).requirements.some((r) => r.text.includes("夏日海豚")));
assert.ok(byId.get(1131040).requirements.some((r) => r.text === "金桨总和 ≥ 5"));
assert.equal(byId.get(1131040).disabled, true);
assert.deepEqual(byId.get(1131040).rewards, []);
assert.equal(byId.get(723010).prerequisites[0].text, "尚未触发「新手选人凭证」发放记录");
const now = Date.parse("2026-10-11T12:00:00+08:00");
const shown = data.tasks.filter((t) => !taskHiddenReason(t, now));
assert.equal(shown.length, 370);
for (const id of [831010, 651010, 1131040, 681010, 841010, 691010, 1025010]) assert.ok(taskHiddenReason(byId.get(id), now), String(id));
assert.equal(taskHiddenReason(byId.get(707220), now), "");
assert.equal(taskHiddenReason(byId.get(321010), now), "");
const nationalDay = byId.get(831010);
const window = nationalDay.prerequisites.find((c) => c.timeWindow).timeWindow;
assert.equal(window.end - window.start, 604800);
assert.ok(taskHiddenReason(nationalDay, window.start * 1000 - 1));
assert.equal(taskHiddenReason(nationalDay, window.start * 1000), "");
assert.equal(taskHiddenReason(nationalDay, window.end * 1000 - 1), "");
assert.ok(taskHiddenReason(nationalDay, window.end * 1000));
assert.equal(taskHiddenReason(byId.get(1025010), Date.parse("2030-01-01T00:00:00+08:00")), "");
assert.match(byId.get(651010).retiredReason, /沃尔夫斯凯尔/);
assert.equal(byId.get(651010).prerequisites[0].key, "3:8:1:1:2147483647");
assert.equal(data.tasks.flatMap((t) => t.rewards).filter((r) => r.equipmentLevel).length, 48);
assert.equal(byId.get(721030).rewards.find((r) => r.key === "1:8172").equipmentLevel, 1);
assert.equal(byId.get(523010).rewards.find((r) => r.key === "1:9183").equipmentLevel, 2);
assert.deepEqual(data.audit.unresolved, {});
assert.deepEqual(data.audit.missingImages, []);
console.log(JSON.stringify({ verified: data.tasks.length, defaultShown: shown.length, hiddenButRetained: data.tasks.length - shown.length, equipmentRewards: 48, categories: data.categories, disabled: data.tasks.filter((t) => t.disabled).length, timed: data.tasks.filter((t) => t.timed).length }));
