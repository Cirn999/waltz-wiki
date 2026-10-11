import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { assessmentIcon, equipmentAssessment, magicAssessment } from "../app/loadoutAssessment.ts";

const data = JSON.parse(await fs.readFile(new URL("../public/data/equipment-catalog.json", import.meta.url), "utf8"));
const ordinary = data.families.find((family) => !family.advanced && family.levels.length === 10);
const advanced = data.families.find((family) => family.advanced && family.levels.length === 10);
assert.ok(ordinary && advanced);
const fill = (family, level, count = 8) => Array.from({ length: count }, () => ({ familyId: family?.id ?? null, level }));
assert.equal(equipmentAssessment(8, fill(null, 10), data), 0);
assert.equal(equipmentAssessment(0, fill(advanced, 10), data), 0);
assert.equal(equipmentAssessment(8, [{ familyId: "missing", level: 10 }], data), 0);
assert.equal(equipmentAssessment(8, fill(ordinary, 99), data), 0);
for (let level = 1; level <= 10; level++) {
  assert.equal(equipmentAssessment(8, fill(ordinary, level), data), Math.min(6, Math.floor(level / 2) + 1));
  assert.equal(equipmentAssessment(8, fill(advanced, level), data), Math.min(6, Math.floor((level + 2) / 2) + 1));
}
// Empty slots lower the RMS; a single high-level item must not be treated as a full loadout.
assert.equal(equipmentAssessment(8, fill(ordinary, 10, 1), data), 2);
assert.equal(equipmentAssessment(8, fill(advanced, 10, 1), data), 3);
assert.equal(equipmentAssessment(8, [...fill(ordinary, 6, 4), ...fill(null, 1, 4)], data), 3);
assert.equal(equipmentAssessment(8, [...fill(null, 1), ...fill(advanced, 10)], data), 0);

const choice = (level) => ({ trendId: 1, level });
for (let ordnance = 0; ordnance <= 10; ordnance++) {
  for (let tactics = 0; tactics <= 10; tactics++) {
    const total = ordnance + 2 * tactics;
    const expected = total === 0 ? 0 : total < 5 ? 1 : total < 10 ? 2 : total < 15 ? 3 : total < 20 ? 4 : total < 25 ? 5 : 6;
    assert.equal(magicAssessment(choice(ordnance), choice(tactics)), expected);
  }
}
assert.equal(magicAssessment(choice(10), choice(0)), 3);
assert.equal(magicAssessment(choice(0), choice(10)), 5);
assert.equal(magicAssessment({ trendId: null, level: 10 }, { trendId: null, level: 10 }), 0);
assert.equal(magicAssessment(choice(NaN), choice(0)), 0);
for (const kind of ["equipment", "magic"]) {
  assert.equal(assessmentIcon(kind, 0), "");
  for (let grade = 1; grade <= 6; grade++) {
    const icon = await fs.readFile(new URL(`../public${assessmentIcon(kind, grade)}`, import.meta.url));
    assert.equal(icon.subarray(1, 4).toString(), "PNG");
  }
}
console.log("Loadout assessments verified: equipment levels/empty slots/advanced bonus, all 121 magic combinations, 12 native PNG badges.");
