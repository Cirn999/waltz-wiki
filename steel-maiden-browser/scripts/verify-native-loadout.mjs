import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateNativePanel } from '../app/nativeLoadout.ts';
import { calculateSimStats, defaultSimConfig, nativeInputsForConfig, relevantTechBranches } from '../app/loadoutMath.ts';

const rules = JSON.parse(fs.readFileSync(new URL('../public/data/loadout-rules.json', import.meta.url), 'utf8'));
const load = (file) => JSON.parse(fs.readFileSync(new URL(`../public/data/${file}.json`, import.meta.url), 'utf8'));
const maidens = load('maidens').rows;
const equipment = load('equipment-catalog');
const tech = load('technology-catalog');
const fixture = JSON.parse(fs.readFileSync(new URL(`./fixtures/native-loadout${process.argv.includes('--quick') ? '-quick' : ''}.json`, import.meta.url), 'utf8'));
assert.equal(rules.clientSha256, fixture.provenance.elfSha256, 'Native test binary version must match the exported rules');
let values = 0;
let uiScenarios = 0;
for (const c of fixture.cases) {
  const result = calculateNativePanel(rules, rules.cards[c.card].phases[c.phase], c.state, c.properties);
  for (const [id, expected] of Object.entries(c.expected)) {
    assert.equal(result.totals[id] ?? 0, expected, `${c.name}: ${rules.attributes[id]} (native=${expected}, port=${result.totals[id]})`);
    values++;
  }
  if (c.name.startsWith('all-base:') || c.name.startsWith('base:')) {
    const maiden = maidens.find((m) => m.id === c.card);
    const config = { ...defaultSimConfig(maiden), level: c.state[1].level };
    const actual = calculateSimStats(maiden, config, equipment, tech, {}, rules);
    for (const [id, expected] of Object.entries(c.expected)) {
      const key = rules.attributes[id];
      assert.equal(actual.values[key] ?? actual.grades[key]?.value, expected, `UI mapping ${c.name}: ${key}`);
    }
  }
  // Reconstruct selectable UI configurations independently from native statuses
  // to catch mistaken craft IDs, S-level fund/trend IDs or research property IDs.
  if (!c.name.startsWith('tactic:200:') && (c.name.startsWith('tactic:') || c.name.startsWith('equipped:') || c.name.startsWith('magic:') || c.name.startsWith('research'))) {
    const maiden = maidens.find((m) => m.id === c.card);
    const config = { ...defaultSimConfig(maiden), level: c.state[1].level };
    for (const [field, category] of [['ammoId', 3], ['engineId', 4], ['bodyId', 5], ['armorId', 6]]) {
      if (c.state[category].trend > 1) config[field] = c.state[category].trend;
    }
    for (const [key, category] of [['durability', 21], ['power', 22], ['piercing', 23], ['armor', 24], ['accuracy', 25], ['evasion', 26]]) config.colonization[key] = c.state[category].level;
    for (const [kind, category] of [['ordnance', 17], ['tactics', 18]]) if (c.state[category].trend > 1 && c.state[category].trend !== 200) config[kind] = { trendId: c.state[category].trend, level: c.state[category].level };
    let complete = true;
    rules.cards[c.card].slots.forEach((category, index) => {
      const trend = c.state[category].trend;
      if (trend <= 1) return;
      const tags = equipment.slots.filter((s) => s.icon === maiden.slotDetails[index].image).map((s) => s.tag);
      const family = equipment.families.find((f) => tags.includes(f.slotTag) && f.levels.some((l) => rules.equipmentTrends[l.fundId] === trend));
      if (!family) { complete = false; return; }
      config.equipment[index] = { familyId: family.id, level: family.levels.find((l) => rules.equipmentTrends[l.fundId] === trend).level };
    });
    if (complete) {
      const levels = Object.fromEntries(tech.blocks.map((b) => [b.id, b.levels.find((l) => l.attributes.every((a) => Math.round(a.value * 100) === c.properties[a.propertyId]))?.level ?? 0]));
      const actual = calculateSimStats(maiden, config, equipment, tech, levels, rules);
      for (const [id, expected] of Object.entries(c.expected)) {
        const key = rules.attributes[id];
        assert.equal(actual.values[key] ?? actual.grades[key]?.value, expected, `UI scenario ${c.name}: ${key}`);
      }
      uiScenarios++;
    }
  }
}
console.log(`Original ARM64/Lua equivalence: ${fixture.cases.length} panels, ${values} exact integer matches; ${uiScenarios} complex UI configurations matched.`);
// Check every UI-offered selection can be mapped to a REAL client trend.
let mappedEquipment = 0, mappedCrafts = 0;
for (const m of maidens) {
  const config = { ...defaultSimConfig(m), level: 99 };
  const card = rules.cards[m.id];
  const phase = card.phases[Math.max(...Object.keys(card.phases).map(Number))];
  const branches = relevantTechBranches(m, config, tech, rules);
  assert.equal(branches.length, 5, `${m.id}: native effective research branches`);
  for (const [field, crafts] of [['ammoId', m.allAmmunition], ['engineId', m.engineOptions], ['bodyId', m.bodyOptions], ['armorId', m.armorOptions]]) {
    for (const craft of crafts) {
      nativeInputsForConfig(m, { ...config, [field]: craft.id }, equipment, tech, {}, rules);
      mappedCrafts++;
    }
  }
  m.slotDetails.forEach((slot, index) => {
    const tags = new Set(equipment.slots.filter((s) => s.icon === slot.image).map((s) => s.tag));
    for (const family of equipment.families.filter((f) => tags.has(f.slotTag))) {
      for (const level of family.levels) {
        const trend = rules.equipmentTrends[level.fundId];
        assert.ok(rules.groups[phase.categories[card.slots[index]].group]?.items[trend], `${m.id} slot ${index} fund ${level.fundId}`);
        mappedEquipment++;
      }
    }
  });
}
console.log(`UI mapping: ${mappedCrafts} crafts and ${mappedEquipment} compatible slot/level choices checked.`);
if (!process.argv.includes('--quick')) {
  const components = JSON.parse(fs.readFileSync(new URL('./fixtures/native-components.json', import.meta.url), 'utf8'));
  assert.equal(components.provenance.elfSha256, rules.clientSha256);
  for (const c of components.cases) {
    const result = calculateNativePanel(rules, rules.cards[c.card].phases[c.phase], components.states[c.stateIndex], components.properties);
    for (const [id, expected] of Object.entries(c.expected)) {
      assert.equal(result.breakdown[c.category]?.[id] ?? 0, expected, `${c.name}: ${rules.attributes[id]}`);
    }
  }
  console.log(`Original component equivalence: ${components.cases.length} equipment/craft cases, ${components.cases.length * 11} exact integer matches.`);
}
