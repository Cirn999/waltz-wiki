import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { equipmentSlotUnlock, slotUnlockIcons } from "../app/equipmentSlotUnlocks.ts";

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const data = JSON.parse(await fs.readFile(new URL("../public/data/equipment-slot-unlocks.json", import.meta.url), "utf8"));
assert.equal(Object.keys(data.cards).length, rows.length);
const get = (id, i) => equipmentSlotUnlock(id, i, rows.find((m) => m.id === id).slotDetails[i].name);
let total = 0;
const special = [];
for (const maiden of rows) {
  assert.equal(data.cards[maiden.id].tags.length, maiden.slotDetails.length);
  maiden.slotDetails.forEach((slot, i) => {
    const rule = data.rules[data.cards[maiden.id].tags[i]];
    const unlock = equipmentSlotUnlock(maiden.id, i, slot.name);
    assert.ok(unlock, `${maiden.id}/${i} missing unlock conditions`);
    assert.ok([1, 2, 3].includes(unlock.stars));
    assert.ok([0, 1, 70, 95].includes(unlock.marks));
    assert.equal(unlock.initial, rule.nativeIndex <= 2);
    assert.equal(unlock.honor, rule.honor || unlock.stars > data.cards[maiden.id].baseStars);
    if (unlock.marks) assert.match(unlock.description, /不消耗鹰标/);
    if (unlock.honor) assert.match(unlock.description, /完成授勋/);
    if (unlock.stars > 1) assert.ok(unlock.description.includes(`亮 ${unlock.stars} 星`));
    if (unlock.marks || rule.honor) special.push({ id: maiden.id, tank: maiden.tank, slot: i + 1, ...unlock });
    total++;
  });
}
assert.deepEqual([get(9879, 7).stars, get(9879, 7).marks, get(9879, 7).honor], [3, 95, false], "缪");
assert.deepEqual([get(9858, 7).stars, get(9858, 7).marks, get(9858, 7).honor], [3, 1, false], "LOSAT");
assert.deepEqual([get(6006, 7).stars, get(6006, 7).marks, get(6006, 7).honor], [3, 70, false], "丘吉尔Mk-VI");
assert.deepEqual([get(6034, 7).stars, get(6034, 7).marks, get(6034, 7).honor], [3, 70, true], "T-34/85: honor is required to reach the third star");
assert.equal(get(6841, 0).initial, true, "雷诺FT-17 initially has two slots");
assert.deepEqual([get(6841, 2).stars, get(6841, 2).honor], [2, true]);
assert.deepEqual([get(6841, 7).stars, get(6841, 7).marks, get(6841, 7).honor], [3, 0, true], "Ordinary eighth slot is not necessarily eagle gated");
assert.deepEqual([get(6261, 8).stars, get(6261, 8).marks, get(6261, 8).honor], [3, 1, true], "蟋蟀17 exclusive slot requires BOTH honor and 1 mark");
assert.equal(get(6064, 6).marks, 95, "豹式G型's seventh displayed slot is an extra slot, not an ordinary seventh slot");
assert.equal(equipmentSlotUnlock(-1, 0, "炮座"), null);
assert.equal(equipmentSlotUnlock(9879, 99, "炮座"), null);
assert.equal(equipmentSlotUnlock(9879, 0, "wrong slot order"), null);
for (const url of Object.values(slotUnlockIcons)) {
  assert.ok((await fs.stat(new URL(`../public${url}`, import.meta.url))).size > 0);
}
console.log(JSON.stringify({ cards: rows.length, slots: total, specialSlots: special.length, regressions: 10, allIconsPresent: true, honor70Examples: special.filter((s) => s.marks === 70 && s.honor).slice(0, 3) }));
