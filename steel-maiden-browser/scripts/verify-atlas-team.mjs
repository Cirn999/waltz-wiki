import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { activeAtlasTeam, atlasTeamCapacity, createAtlasTeamWorkspace, updateAtlasTeam, sumAtlasTeamTalents } from "../app/atlasTeamState.ts";

const initial = createAtlasTeamWorkspace();
let workspace = initial;
const action = (a) => { workspace = updateAtlasTeam(workspace, a); };
for (let id = 1; id <= 7; id++) action({ type: "toggle", maidenId: id });
assert.deepEqual(activeAtlasTeam(workspace).memberIds, [1, 2, 3, 4, 5, 6]);
assert.equal(atlasTeamCapacity, 6);
assert.deepEqual(activeAtlasTeam(initial).memberIds, [], "Previous states are immutable");
action({ type: "toggle", maidenId: 1 });
action({ type: "toggle", maidenId: 7 });
assert.deepEqual(activeAtlasTeam(workspace).memberIds, [2, 3, 4, 5, 6, 7]);
const first = workspace.plans[0];
action({ type: "create" });
assert.equal(workspace.activeId, 2);
assert.deepEqual(activeAtlasTeam(workspace).memberIds, []);
action({ type: "toggle", maidenId: 2 });
assert.deepEqual(workspace.plans[0], first, "Different plans may use the same maiden independently");
assert.deepEqual(activeAtlasTeam(workspace).memberIds, [2]);
action({ type: "select", id: 1 });
assert.deepEqual(activeAtlasTeam(workspace), first);
action({ type: "select", id: 999 });
assert.equal(workspace.activeId, 1);
action({ type: "clear" });
assert.deepEqual(workspace.plans[0].memberIds, []);
assert.deepEqual(workspace.plans[1].memberIds, [2]);
action({ type: "delete" });
assert.equal(workspace.activeId, 2);
action({ type: "delete" });
assert.equal(workspace.plans.length, 1);
action({ type: "create" });
assert.equal(workspace.activeId, 3, "Deleted plan IDs/names are not reused");
for (const id of [NaN, -1, 0, 2.5]) action({ type: "toggle", maidenId: id });
assert.deepEqual(activeAtlasTeam(workspace).memberIds, []);
assert.deepEqual(sumAtlasTeamTalents([]), {});
assert.deepEqual(sumAtlasTeamTalents([{ talents: [{ name: "料理", level: 3 }, { name: "护理", level: 1 }] }, { talents: [{ name: "料理", level: 2 }, { name: "技工", level: 3 }, { name: "未知", level: NaN }] }]), { 料理: 5, 护理: 1, 技工: 3 });

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
for (let index = 0; index < rows.length; index += 6) {
  const members = rows.slice(index, index + 6);
  const sums = sumAtlasTeamTalents(members);
  const names = new Set(members.flatMap((row) => row.talents.map((talent) => talent.name)));
  for (const name of names) assert.equal(sums[name], members.reduce((sum, row) => sum + row.talents.filter((talent) => talent.name === name).reduce((sum, talent) => sum + talent.level, 0), 0));
}
console.log(JSON.stringify({ capacity: 6, immutable: true, independentPlans: true, sumsCheckedAcrossMaidenCount: rows.length, invalidIds: true, planDeletion: true }));
