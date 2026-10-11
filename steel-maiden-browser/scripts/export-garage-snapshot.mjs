// Build the minimal local interchange file; deliberately does not apply it to UI storage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { calculateNativePanel } from '../app/nativeLoadout.ts';

if (!process.argv[2]) throw new Error('Pass a decoded garage capture');
const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rules = JSON.parse(fs.readFileSync(new URL('../public/data/loadout-rules.json', import.meta.url), 'utf8'));
assert.equal(source.issues.length, 0, 'Do not export unresolved vehicle mappings');
assert.ok(source.globalTech && source.capturedPropertyDeltas, 'Global panel inputs are required');
assert.equal(source.volatileProperties.length, 0, 'Unresolved dynamic properties');
const payload = {
  format: 'steel-maiden-player-snapshot', version: 1, capturedAt: source.capturedAt,
  provenance: { sourceBinarySha256: source.sourceBinarySha256, calculatorRulesSha256: source.rulesBinarySha256,
    sourceCapture: source.sourceCapture, readOnly: true, verifiedScope: 'See separate screenshot checks; not every card was visually verified' },
  global: { technologyLevels: source.globalTech, panelPropertyDeltas: source.capturedPropertyDeltas },
  maidens: source.cards.map((c) => ({ instanceId: c.instanceId, templateId: c.templateId, tank: c.tank,
    phase: c.generation, configuration: c.config,
    // Keep non-UI fields, actual phase and baseline tactic. Reconstructing only
    // UI choices would discard state and can change the player's panel.
    nativeState: c.nativeState, panel: c.capturedInputValues,
    names: { equipment: c.equipmentNames, crafts: c.craftNames, magic: c.magicNames } })),
  excludedNonCatalogCards: source.excluded.length,
};
const output = path.join(path.dirname(process.argv[2]), `${path.basename(process.argv[2], '.json')}.garage.json`);
fs.writeFileSync(output, JSON.stringify(payload, null, 2), { flag: 'wx' });
// Exercise the actual file boundary, not an in-memory object only.
const restored = JSON.parse(fs.readFileSync(output, 'utf8'));
let checked = 0;
assert.equal(restored.maidens.length, source.cards.length);
for (const c of restored.maidens) {
  const result = calculateNativePanel(rules, rules.cards[c.templateId].phases[c.phase], c.nativeState, restored.global.panelPropertyDeltas);
  for (const [id, key] of Object.entries(rules.attributes)) {
    assert.equal(result.totals[id], c.panel[key], `${c.tank} import replay ${key}`);
    checked++;
  }
}
console.log(JSON.stringify({ output: path.resolve(output), maidens: restored.maidens.length, restoredValuesChecked: checked,
  automaticallyImported: false }, null, 2));
