import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateSimStats, defaultSimConfig, defaultAmmo, researchCraftKey, technologyProperties } from '../app/loadoutMath.ts';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const { rows } = load('maidens');
const technology = load('technology-catalog');
const equipment = load('equipment-catalog');
const rules = load('loadout-rules');
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/plz05-live-panel.json', import.meta.url), 'utf8'));
const maiden = rows.find((m) => m.id === fixture.cardId);
const config = { ...defaultSimConfig(maiden), level: fixture.level, engineId: fixture.engineId, bodyId: fixture.bodyId, armorId: fixture.armorId };
const tech = { ...fixture.technologyLevels, ...Object.fromEntries(fixture.researchedCrafts.map((id) => [researchCraftKey(id), 1])) };
const calculate = (settings) => calculateSimStats(maiden, config, equipment, technology, settings, rules).values;
assert.deepEqual(calculate(fixture.technologyLevels), fixture.withoutResearch, 'Branch levels alone reproduce the originally reported discrepancy');
assert.deepEqual(calculate(tech), fixture.expected, 'Research bonuses must reproduce all eight independently observed in-game values');
assert.equal(maiden.baseAmmunition.name, '155mm|试验型榴弹炮|试验型炮体');
for (const tank of ['PLZ05', 'T39', '缪']) {
  const row = rows.find((m) => m.tank === tank);
  assert.equal(defaultAmmo(row)?.type, row.baseAmmunition.type, `${tank}: default image must follow its native ammunition type`);
}
for (const row of rows) assert.ok(row.baseAmmunition?.name && !row.baseAmmunition.name.startsWith('基础'), `${row.tank}: original default weapon name required`);

// A permanent bonus depends on research status, not the equipped item or how
// many UI nodes reference that craft. Its integer precision must be preserved.
const properties = technologyProperties(technology, tech);
assert.equal(properties[8122], 15687);
assert.equal(properties[8153], 8627);
assert.equal(properties[18291], 6480);
const duplicated = { ...technology, blocks: technology.blocks.map((b) => ({ ...b, nodes: [...b.nodes, ...b.nodes] })) };
assert.deepEqual(technologyProperties(duplicated, tech), properties, 'Duplicate display nodes cannot award the same research twice');
const unlearned = { ...tech, [researchCraftKey(5401)]: 0 };
assert.equal(technologyProperties(technology, unlearned)[8122], properties[8122] - 187);
const noLevel = { ...tech, '榴弹-1': 0 };
assert.equal(technologyProperties(technology, noLevel)[8122] ?? 0, 0, 'Inaccessible saved research cannot remain active');
const baseline = calculateSimStats(maiden, defaultSimConfig(maiden), equipment, technology, tech, rules).values;
const noHigherResearch = Object.fromEntries(Object.entries(tech).filter(([key]) => !key.startsWith('craft:') || technology.blocks.some((b) => b.generation === 1 && b.nodes.some((n) => key === researchCraftKey(n.craftId)))));
assert.deepEqual(calculateSimStats(maiden, defaultSimConfig(maiden), equipment, technology, noHigherResearch, rules).values, baseline, 'Later-period research must not leak into phase one');
let nodeCount = 0;
for (const block of technology.blocks) for (const node of block.nodes) {
  assert.ok(Array.isArray(node.researchAttributes));
  for (const attribute of node.researchAttributes) { assert.ok(Number.isInteger(attribute.value)); assert.equal(attribute.effectType, 0); }
  nodeCount += Boolean(node.researchAttributes.length);
}
console.log(JSON.stringify({ observedPanel: fixture.expected, namedDefaultWeapons: rows.length, nodesWithPanelBonuses: nodeCount, researchTogglesAndPhaseIsolation: 'passed' }));
