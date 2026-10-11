import assert from "node:assert/strict";
import fs from "node:fs/promises";
const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const roster = JSON.parse(await fs.readFile(new URL("../public/data/implementation-roster.json", import.meta.url), "utf8"));
const byId = new Map(roster.rows.map((row) => [row.id, row]));
assert.equal(byId.size, roster.rows.length, "Roster IDs must be unique");
assert.equal(data.rows.length, roster.counts.archive, "Unreleased records must remain in the archive");
for (const row of data.rows) {
  assert.equal(typeof row.implemented, "boolean", String(row.id));
  assert.equal(row.implemented, byId.get(row.id)?.implemented, String(row.id));
}
assert.equal(data.rows.filter((row) => row.implemented).length, roster.counts.implemented);
assert.deepEqual(data.implementation.counts, roster.counts);
assert.equal(data.rows.find((row) => row.tank === "YW306")?.implemented, false, "YW306 has no handbook entry");
assert.equal(data.rows.find((row) => row.id === 6279)?.implemented, true, "Empty acquisition routes are not release status");
for (const id of [8401, 8901, 9875]) {
  assert.equal(byId.get(id)?.implemented, true);
  assert.equal(byId.get(id)?.aircraft, true);
  assert.equal(byId.get(id)?.specialRecruitment, true);
}
const gated = byId.get(6932);
assert.equal(gated.inHandbook, true);
if (Date.parse(roster.asOf) < Date.parse("2029-12-31T16:00:00Z")) {
  assert.equal(gated.implemented, false);
  assert.equal(gated.reason, "time-gated");
  assert.equal(gated.closedRules[0].ruleId, 4569321);
}
console.log(JSON.stringify({ ...roster.counts, distinctIds: byId.size, evidence: "handbook, empty acquisition, special aircraft and time gate verified" }, null, 2));
