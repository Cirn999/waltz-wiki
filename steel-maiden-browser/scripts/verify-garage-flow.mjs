// Private real-account validation, kept out of public fixtures and site output.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { calculateNativePanel } from '../app/nativeLoadout.ts';

if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: verify-garage-flow.mjs <decoded.json> <visible-panel-checks.json>');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const checks = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const rules = JSON.parse(fs.readFileSync(new URL('../public/data/loadout-rules.json', import.meta.url), 'utf8'));
assert.ok(report.sourceCapture.endsWith(checks.sourceCapture), 'Screenshot verification must identify its matching capture');
assert.equal(report.rulesBinarySha256, rules.clientSha256);
assert.equal(report.issues.length, 0);
assert.equal(report.volatileProperties.length, 0);
assert.ok(report.capturedPropertyDeltas);
assert.equal(new Set(report.cards.map((c) => c.instanceId)).size, report.cards.length, 'Keep separate owned instances');
let replayedValues = 0, visibleValues = 0;
for (const c of report.cards) {
  const phase = rules.cards[c.templateId].phases[c.generation];
  assert.ok(phase, `Unknown actual phase for ${c.tank}`);
  const replay = calculateNativePanel(rules, phase, c.nativeState, report.capturedPropertyDeltas);
  assert.deepEqual(replay.totals, c.rawPanel, `${c.tank}: serialized import changed values`);
  for (const [id, key] of Object.entries(rules.attributes)) {
    assert.ok(Number.isFinite(c.capturedInputValues[key]), `${c.tank}: missing ${key}`);
    assert.equal(c.capturedInputValues[key], replay.totals[id]);
    replayedValues++;
  }
}
for (const expected of checks.cases) {
  const matches = report.cards.filter((c) => c.tank === expected.tank && c.config.level === expected.level);
  assert.equal(matches.length, 1, 'Screenshot must identify one owned card');
  const c = matches[0];
  assert.equal(c.generation, expected.generation);
  for (const [key, value] of Object.entries(expected.values)) {
    assert.equal(c.capturedInputValues[key], value, `${c.tank}: visible game ${key}`);
    visibleValues++;
  }
  if (expected.colonization) assert.deepEqual(c.config.colonization, expected.colonization);
  // The screenshot may omit later, not-yet-unlocked slots; check only shown slots.
  if (expected.equipmentLevels) assert.deepEqual(c.config.equipment.slice(0, expected.equipmentLevels.length).map((e) => e.familyId ? e.level : null), expected.equipmentLevels);
  for (const kind of ['ordnance', 'tactics']) if (expected[kind]) {
    assert.equal(c.config[kind].level, expected[kind].level);
    assert.equal(c.magicNames[kind], expected[kind].name);
  }
}
console.log(JSON.stringify({ importedCardsReplayed: report.cards.length, replayedValues,
  screenshotCases: checks.cases.length, visibleValuesMatched: visibleValues,
  note: 'Replay consistency is not independent game validation; only screenshotCases are visually verified.' }, null, 2));
