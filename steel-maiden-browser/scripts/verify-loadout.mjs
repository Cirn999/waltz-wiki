import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  baseStatsAtLevel, calculateSimStats as calculateOriginalSimStats, craftGeneration, craftLockReason, defaultSimConfig, defaultAmmo,
  findCraftTech, normalizeSimConfig, relevantTechBranches, simStats, starCount,
} from "../app/loadoutMath.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) => JSON.parse(fs.readFileSync(path.join(root, "public/data", `${name}.json`), "utf8"));
const maidens = load("maidens");
const equipment = load("equipment-catalog");
const technology = load("technology-catalog");
const colonization = load("colonization-catalog");
const growth = load("growth-curves");
const nativeRules = load("loadout-rules");
const calculateSimStats = (maiden, config, equipment, technology, tech) => calculateOriginalSimStats(maiden, config, equipment, technology, tech, nativeRules);
const missing = { ammoBranches: [], craftNodes: [], slots: [] };
let checkedCrafts = 0;
for (const maiden of maidens.rows) {
  const growthRow = growth.rows[String(maiden.id)];
  assert.ok(growthRow, `${maiden.tank}: missing 1–99 growth data`);
  for (let level = 1; level <= 99; level++) {
    const base = baseStatsAtLevel(maiden, level, growthRow);
    for (const key of ["durability", "power", "piercing", "armor"]) assert.equal(base[key], growthRow[key][level - 1], `${maiden.tank}: level ${level} ${key} must use the exact growth curve`);
    for (const key of ["accuracy", "evasion", "stealth", "recon"]) assert.equal(base[key], maiden.stats["1"][key], `${maiden.tank}: level ${level} ${key} must retain its fixed base value`);
  }
  const initial = defaultSimConfig(maiden);
  assert.equal(initial.level, 1);
  assert.equal(initial.ammoId, 0, `${maiden.tank}: default ammo must not add crafted ammo stats`);
  assert.equal(initial.equipment.length, maiden.slotDetails.length);
  const config = normalizeSimConfig(maiden, initial, equipment, technology, {}, maidens.magicProgression);
  const result = calculateSimStats(maiden, config, equipment, technology, {}, colonization.rows[String(maiden.id)], maidens.magicProgression);
  for (const value of Object.values(result.values)) assert.ok(Number.isFinite(value), `${maiden.tank}: invalid stat`);
  for (const { key } of simStats) assert.equal(result.values[key], maiden.stats["1"][key] ?? 0, `${maiden.tank}: blank configuration should match level-one base ${key}`);
  for (const key of ["fireproof", "homogeneity", "coverage"]) if (maiden.grades[key].value !== null) {
    assert.equal(result.grades[key].value, maiden.grades[key].value, `${maiden.tank}: blank configuration should retain base ${key}`);
    assert.equal(result.grades[key].grade, maiden.grades[key].grade, `${maiden.tank}: ${key} rating bands should match the client card`);
  }
  const branches = relevantTechBranches(maiden, config, technology);
  if (!branches.some((branch) => branch.category === "主炮")) missing.ammoBranches.push(maiden.tank);
  for (const [category, crafts] of [["主炮", maiden.allAmmunition], ["引擎", maiden.engineOptions], ["车体", maiden.bodyOptions], ["防护", maiden.armorOptions]]) {
    for (const craft of crafts) {
      checkedCrafts++;
      if (!findCraftTech(technology, category, craft.id, craft.rank)) missing.craftNodes.push(`${maiden.tank}/${category}/${craft.name}`);
      if (craft.rank > 1) assert.ok(craftLockReason(maiden, technology, {}, category, craft, 1), `${maiden.tank}: advanced craft unlocked at level 1`);
    }
  }
  for (const slot of maiden.slotDetails) {
    if (!equipment.slots.some((item) => item.icon === slot.image && equipment.families.some((family) => family.slotTag === item.tag))) missing.slots.push(`${maiden.tank}/${slot.name}`);
  }
}
const ground = maidens.rows.find((row) => row.tank === "T39");
const blank = defaultSimConfig(ground);
const starter = defaultAmmo(ground);
const starterTech = findCraftTech(technology, "主炮", starter.id, starter.rank);
assert.ok(starterTech);
assert.equal(blank.ammoId, 0);
assert.ok(craftLockReason(ground, technology, {}, "主炮", starter, 1));
const unlocked = { [starterTech.block.id]: starterTech.requiredLevel };
assert.equal(craftLockReason(ground, technology, unlocked, "主炮", starter, 1), "");
assert.equal(starCount(34), 1);
assert.equal(starCount(35), 2);
assert.equal(starCount(70), 3);
const rankTwo = ground.allAmmunition.find((ammo) => ammo.rank === 2);
assert.ok(craftLockReason(ground, technology, unlocked, "主炮", rankTwo, 1));
const wrongFamily = equipment.families.find((family) => family.slotTag !== equipment.slots.find((slot) => slot.icon === ground.slotDetails[0].image)?.tag);
const wrongSlotConfig = normalizeSimConfig(ground, { ...blank, equipment: blank.equipment.map((choice, index) => index === 0 ? { familyId: wrongFamily.id, level: 10 } : choice) }, equipment, technology, {}, maidens.magicProgression);
assert.equal(wrongSlotConfig.equipment[0].familyId, null);
const aircraft = maidens.rows.find((row) => row.tank === "Bf-109F");
assert.deepEqual(aircraft.engineOptions.map((craft) => craftGeneration(technology, "引擎", craft)), [1, 2, 3]);
const mu = maidens.rows.find((row) => row.tank === "缪");
assert.ok(mu, "缪 should exist in the catalog");
const muLevel40 = { ...defaultSimConfig(mu), level: 40 };
assert.throws(() => calculateOriginalSimStats(mu, muLevel40, equipment, technology, {}), /原生配装规则尚未加载/, "missing native rules must never silently become zero");
const muAt40 = calculateSimStats(mu, muLevel40, equipment, technology, {}, colonization.rows[String(mu.id)], maidens.magicProgression, growth.rows[String(mu.id)]);
for (const key of ["durability", "power", "piercing", "armor"]) assert.ok(muAt40.values[key] >= growth.rows[String(mu.id)][key][39], `缪: level-40 must include base growth and native promotion bonus`);
assert.ok(muAt40.breakdown[2][0] > 0, "level 40 must include second-star durability bonus");
const rocket = mu.allAmmunition.find((ammo) => ammo.type.includes("火箭") && ammo.rank === 1);
assert.ok(rocket, "缪 should have first-generation rocket ammunition");
assert.ok(craftLockReason(mu, technology, {}, "主炮", rocket, 1), "rocket ammunition should be locked without research");
const allAmmoTech = Object.fromEntries(technology.blocks.filter((block) => block.category === "主炮" && block.generation === 1).map((block) => [block.id, 6]));
assert.equal(craftLockReason(mu, technology, allAmmoTech, "主炮", rocket, 1), "", "a shared main-gun level should unlock the rocket branch");
const firepowerTactic = maidens.magicProgression.tactics.find((tactic) => tactic.name === "火力构造定制");
assert.ok(firepowerTactic);
const equipped = { ...blank, ammoId: starter.id };
const withTactic = { ...equipped, tactics: { trendId: firepowerTactic.trendId, level: 1 } };
const tacticalResult = calculateSimStats(ground, withTactic, equipment, technology, {}, colonization.rows[String(ground.id)], maidens.magicProgression);
const ammoPower = starter.stats.find((stat) => stat.key === "火力")?.value ?? 0;
const ammoPiercing = starter.stats.find((stat) => stat.key === "穿甲")?.value ?? 0;
assert.equal(tacticalResult.values.power, ground.stats["1"].power + Math.trunc(ground.stats["1"].power * .92) + ammoPower, "tactic base bonus is truncated separately; crafted ammunition is not slot equipment");
assert.equal(tacticalResult.values.piercing, ground.stats["1"].piercing + Math.trunc(ground.stats["1"].piercing * .8) + ammoPiercing, "ammunition piercing must not be reduced by the slot-equipment modifier");
const firstSlotTag = equipment.slots.find((slot) => slot.icon === ground.slotDetails[0].image)?.tag;
const powerEquipment = equipment.families.find((family) => family.slotTag === firstSlotTag && family.levels[0].stats.some((stat) => stat.key === "火力"));
assert.ok(powerEquipment);
const equipmentPower = powerEquipment.levels[0].stats.find((stat) => stat.key === "火力").value;
const withTacticAndEquipment = { ...withTactic, equipment: blank.equipment.map((slot, index) => index === 0 ? { familyId: powerEquipment.id, level: 1 } : slot) };
const equippedTacticalResult = calculateSimStats(ground, withTacticAndEquipment, equipment, technology, {}, colonization.rows[String(ground.id)], maidens.magicProgression);
assert.equal(equippedTacticalResult.values.power, tacticalResult.values.power + Math.trunc(equipmentPower * .35), "equipment-slot power must use the tactic's 35% contribution and native truncation");
const innerWall = equipment.slots.find((slot) => slot.name === "内壁");
const modification = equipment.slots.find((slot) => slot.name === "改装");
const equipmentFamily = (name, tag) => equipment.families.find((family) => family.name === name && family.slotTag === tag && !family.advanced);
const gradeFamilies = [
  equipmentFamily("灭火器", innerWall.tag),
  equipmentFamily("弹药水套", innerWall.tag),
  equipmentFamily("燃油清滤器", innerWall.tag),
  equipmentFamily("增固护板", modification.tag),
];
assert(gradeFamilies.every(Boolean), "client grade-affecting equipment should exist");
const innerWallIndices = ground.slotDetails.flatMap((slot, index) => slot.name === "内壁" ? [index] : []);
const modificationIndex = ground.slotDetails.findIndex((slot) => slot.name === "改装");
assert.equal(innerWallIndices.length, 3);
const gradeSlots = [innerWallIndices[0], innerWallIndices[1], innerWallIndices[2], modificationIndex];
const gradeConfig = { ...blank, equipment: blank.equipment.map((slot, index) => {
  const selection = gradeSlots.indexOf(index);
  return selection < 0 ? slot : { familyId: gradeFamilies[selection].id, level: 1 };
}) };
const gradeResult = calculateSimStats(ground, gradeConfig, equipment, technology, {}, colonization.rows[String(ground.id)], maidens.magicProgression);
assert.deepEqual(gradeResult.gradeBonuses, { fireproof: 8, homogeneity: 8, coverage: 4 }, "hidden grade attributes must add across compatible equipment slots");
for (const key of ["fireproof", "homogeneity", "coverage"]) {
  assert.equal(gradeResult.grades[key].value, ground.grades[key].value + gradeResult.gradeBonuses[key], `${key} should include static native contributions, not battle-triggered skills`);
}
const waterS10 = { ...gradeConfig, equipment: gradeConfig.equipment.map((slot, index) => index === innerWallIndices[1] ? { ...slot, level: 10 } : slot) };
const waterS10Result = calculateSimStats(ground, waterS10, equipment, technology, {}, colonization.rows[String(ground.id)], maidens.magicProgression);
assert(waterS10Result.grades.fireproof.value > gradeResult.grades.fireproof.value, "higher-level ammunition water jackets must increase fireproof preview");
const fuelTank = equipment.families.find((family) => family.name === "副油箱" && !family.advanced);
const fuelCarrier = maidens.rows.find((row) => row.grades.fireproof.value !== null && row.slotDetails.some((slot) => slot.name === "挂载"));
assert(fuelTank && fuelCarrier, "the aircraft fuel-tank penalty fixture should exist");
const fuelSlot = fuelCarrier.slotDetails.findIndex((slot) => slot.name === "挂载");
const withFuelTank = defaultSimConfig(fuelCarrier);
withFuelTank.equipment[fuelSlot] = { familyId: fuelTank.id, level: 1 };
const fuelResult = calculateSimStats(fuelCarrier, withFuelTank, equipment, technology, {}, colonization.rows[String(fuelCarrier.id)], maidens.magicProgression);
assert.equal(fuelResult.grades.fireproof.value, fuelCarrier.grades.fireproof.value - 4, "negative hidden equipment modifiers must lower the previewed rating value");
console.log(JSON.stringify({ maidens: maidens.rows.length, checkedCrafts, missing: Object.fromEntries(Object.entries(missing).map(([key, values]) => [key, { count: values.length, sample: values.slice(0, 4) }])) }, null, 2));
assert.deepEqual(missing, { ammoBranches: [], craftNodes: [], slots: [] });
