import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (name) => JSON.parse(await fs.readFile(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));
const data = await read("maidens");
const byId = new Map(data.rows.map((row) => [row.id, row]));
assert.equal(byId.size, data.rows.length);
for (const [id, tank] of [[9825, "BTR-60P M1961/1"], [9826, "T3F试验型"], [9827, "EG MBT"]]) {
  const row = byId.get(id);
  assert.equal(row?.tank, tank);
  assert.equal(row.implemented, true);
  assert.ok(row.magicOrdnance.length && row.magicCostGroup);
  assert.equal(row.slotDetails.length, 8);
  for (const image of [row.image, row.headImage]) {
    assert.ok(image && !image.includes("placeholder"));
    await fs.access(new URL(`../public${image}`, import.meta.url));
  }
}
const stats = {
  6068: { power: 739, piercing: 362, armor: 298 },
  6764: { durability: 1001, armor: 379 },
  6731: { durability: 700, evasion: 60, recon: 50 },
  6732: { durability: 825, armor: 255, stealth: 40, recon: 60 },
  6783: { durability: 1010, armor: 394 },
  6881: { armor: 332 },
  9944: { durability: 983, armor: 367 },
};
for (const [id, expected] of Object.entries(stats)) for (const [key, value] of Object.entries(expected)) assert.equal(byId.get(Number(id)).stats[1][key], value, `${id}/${key}`);
assert.equal(byId.get(6068).stats[99].armor, 1150, "Leopard armor growth is not a constant +16");
assert.ok(!byId.get(6764).armorOptions.some((row) => row.name === "重装弧形铸造合金装甲"));
for (const id of [6731, 6732, 6783, 6881, 9822, 9944]) {
  const rows = byId.get(id).bodyOptions.filter((row) => [7017, 7043, 7074].includes(row.id));
  assert.ok(rows.length, `${id} multi-turret body`);
  for (const body of rows) {
    assert.ok(body.resistance.includes("抗伏击"));
    assert.ok(!body.resistance.includes("抗泥沼"));
  }
}
assert.ok(byId.get(9822).allAmmunition.some((row) => row.id === 5458));
assert.ok(byId.get(9984).allAmmunition.some((row) => row.id === 5702));
assert.ok(!byId.get(9984).allAmmunition.some((row) => row.id === 5401));
const research = await read("research-tree");
const recipe = research.recipes.find((row) => row.targetId === 9826);
assert.deepEqual(recipe.requirements.map((r) => [r.cardId, r.generation, r.level]), [[6068, 3, 90], [6577, 3, 90]]);
assert.deepEqual(recipe.resourcePlans.map((p) => p.ruleIds), [[4598261], [4598262]]);
assert.ok(recipe.resourcePlans.every((p) => p.commanderLevel === 64));
assert.deepEqual(recipe.resourcePlans.map((p) => Object.fromEntries(p.resources.map((r) => [r.fundId, r.amount]))), [
  { 1: 6286000, 3106: 43, 13344: 1, 12: 108, 3002: 552 },
  { 1: 5070, 3106: 7, 4285: 25 },
]);
assert.equal(recipe.resourcePlans[0].resources.find((r) => r.fundId === 13344).equipmentGrade, "S6");
assert.ok(byId.get(9826).acquisition.some((route) => route.kind === "research"));
assert.match(JSON.stringify(byId.get(9825).acquisition), /巴塔鼓/);
assert.match(JSON.stringify(byId.get(9827).acquisition), /特种精英礼包/);
const tech = await read("technology-catalog");
for (const id of [7017, 7043, 7074]) {
  const node = tech.blocks.flatMap((b) => b.nodes).find((n) => n.craftId === id);
  assert.ok(node.traits.some((t) => t.name === "抗伏击" && t.image));
  assert.ok(!node.traits.some((t) => t.name === "抗泥沼"));
}
const stages = await read("stage-catalog");
for (const id of [60, 61]) {
  const effect = stages.terrains[id].effects.find((e) => e.name === "伏击");
  assert.equal(effect.description, "整个战斗过程中更容易受到暴击");
  assert.equal(effect.descriptionStringId, 701289);
}
const items = await read("item-catalog");
for (const id of [4445, 4446]) {
  const ticket = items.items.find((r) => r.id === id);
  assert.ok(ticket.image && ticket.description);
  assert.equal(ticket.sale, null);
  assert.equal(ticket.kind, "转服道具");
  assert.deepEqual(ticket.uses, [ticket.description]);
}
for (const [id, name, amount] of [[6489, "茱萸果", 49], [6858, "巴塔鼓", 20], [6859, "茱萸果", 40], [6860, "巴塔鼓", 29], [6861, "代金券", 290]]) {
  assert.deepEqual(items.exchanges.find((r) => r.id === id).costs.map((r) => [r.name, r.amount]), [[name, amount]]);
}
const ids = [...byId.keys()].sort((a, b) => a - b);
for (const [name, key] of [["equipment-slot-unlocks", "cards"], ["star-promotions", "cards"], ["loadout-rules", "cards"], ["colonization-catalog", "rows"]]) {
  assert.deepEqual(Object.keys((await read(name))[key]).map(Number).sort((a,b) => a-b), ids, name);
}
assert.deepEqual((await read("maiden-quotes-index")).cards, ids);
console.log(JSON.stringify({ cards: data.rows.length, added: [9825, 9826, 9827], sevenStatChanges: true, nativeResearch: true, currentBodyTraits: true, ambushManual: true, ticketsPresenceOnly: true, perCardCoverage: true }));
