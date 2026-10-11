// Local pipeline diagnostic. Does not modify app data, localStorage, or the game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateNativePanel } from '../app/nativeLoadout.ts';
import { defaultSimConfig, nativeInputsForConfig, calculateSimStats } from '../app/loadoutMath.ts';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const rules = load('loadout-rules'), equipment = load('equipment-catalog'), technologies = load('technology-catalog');
const catalog = load('maidens');
const maidens = new Map(catalog.rows.map((m) => [m.id, m]));
const snapshotPath = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass a private garage capture JSON path');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
if (!snapshot.validation?.two_complete_reads_equal) throw new Error('Capture has not passed duplicate-read validation');
const globals = snapshot.panel_globals;
const tech = globals && Object.fromEntries(globals.technologies.map((b) => [b.block_id, b.level]));
const observedProperties = globals && Object.fromEntries(Object.entries(globals.properties).map(([id, p]) => [id, p.role + p.campaign]));
const volatile = globals && Object.entries(globals.properties).filter(([, p]) => p.volatile_measure_ids.length);
if (globals && !snapshot.validation.global_reads_equal) throw new Error('Global input read consistency was not checked');
if (volatile?.length) throw new Error('Unresolved dynamic property adjustments: refuse to silently assume zero');
const cards = [], issues = [], excluded = [];
for (const raw of snapshot.cards) {
  const maiden = maidens.get(raw.template_id);
  if (!maiden) { excluded.push({ instanceId: raw.instance_id, templateId: raw.template_id }); continue; }
  const rule = rules.cards[raw.template_id], phase = rule?.phases[raw.generation];
  if (!phase) { issues.push({ id: raw.template_id, error: 'Unknown actual phase' }); continue; }
  const state = Object.fromEntries(Object.entries(phase.categories).map(([id, c]) => [id, {
    level: rule.initialLevels[id] ?? 0, trend: rules.groups[c.group]?.default ?? 0,
  }]));
  for (const f of raw.faculties) state[f.category] = { level: f.level, trend: f.trend };
  const config = defaultSimConfig(maiden), problems = [];
  config.level = state[1].level;
  for (const [key, id] of [['durability', 21], ['power', 22], ['piercing', 23], ['armor', 24], ['accuracy', 25], ['evasion', 26]]) {
    config.colonization[key] = state[id]?.level ?? 0;
  }
  const craftNames = {};
  for (const [field, category, options] of [['ammoId', 3, maiden.allAmmunition], ['engineId', 4, maiden.engineOptions], ['bodyId', 5, maiden.bodyOptions], ['armorId', 6, maiden.armorOptions]]) {
    const trend = state[category]?.trend ?? 0;
    const fallback = rules.groups[phase.categories[category]?.group]?.default ?? 0;
    if (trend === fallback || trend === 0) {
      craftNames[field] = field === 'ammoId' ? '基础弹种' : '未装备';
      continue;
    }
    const selected = options?.find((c) => c.id === trend);
    if (!selected) problems.push(`Unknown ${field} trend ${trend}`);
    config[field] = trend;
    craftNames[field] = selected?.name ?? `#${trend}`;
  }
  const equipmentNames = [];
  rule.slots.forEach((category, index) => {
    const trend = state[category]?.trend ?? 0;
    const fallback = rules.groups[phase.categories[category]?.group]?.default ?? 0;
    if (trend === fallback || trend === 0) { equipmentNames.push('空'); return; }
    const tags = equipment.slots.filter((s) => s.icon === maiden.slotDetails[index]?.image).map((s) => s.tag);
    const matches = equipment.families.flatMap((f) => tags.includes(f.slotTag) ? f.levels.filter((l) => rules.equipmentTrends[l.fundId] === trend).map((l) => ({ f, l })) : []);
    if (matches.length !== 1) { problems.push(`Equipment slot ${index}: ${matches.length} mappings for trend ${trend}`); equipmentNames.push(`#${trend}`); return; }
    const { f, l } = matches[0];
    config.equipment[index] = { familyId: f.id, level: l.level };
    equipmentNames.push(`${f.name} S${l.level}`);
  });
  for (const [kind, category] of [['ordnance', 17], ['tactics', 18]]) {
    const status = state[category];
    // Keep level even when no skill is currently carried: an owned upgrade is not a selection.
    if (status) config[kind] = { level: status.level, trendId: status.trend > 1 ? status.trend : null };
  }
  const magicNames = {
    ordnance: maiden.magicOrdnance?.find((s) => s.trendId === config.ordnance.trendId)?.name ?? (config.ordnance.level ? '未携带' : '未魔改'),
    // The current display catalog deliberately excludes trend 200, but it is
    // the game's basic tactic, not "no tactic" (confirmed by the user's panel).
    tactics: config.tactics.trendId === 200 ? '泛用战法定制' : catalog.magicProgression?.tactics?.find((s) => s.trendId === config.tactics.trendId)?.name ?? (config.tactics.level ? '未携带' : '未魔改'),
  };
  let calculated = null, rawPanel = null, roundtripDifferences = [], propertyDifferences = [], simulatorLimitations = [];
  if (tech && !problems.length) {
    try {
      const input = nativeInputsForConfig(maiden, config, equipment, technologies, tech, rules);
      if (input.number !== raw.generation) simulatorLimitations.push(`Simulator auto phase ${input.number} differs from actual phase ${raw.generation}`);
      roundtripDifferences = Object.keys(phase.categories).filter((id) => JSON.stringify(input.state[id]) !== JSON.stringify(state[id])).map((id) => ({ category: Number(id), captured: state[id], simulated: input.state[id] }));
      propertyDifferences = Object.entries(observedProperties).filter(([id, v]) => (input.properties[id] ?? 0) !== v).map(([id, v]) => ({ propertyId: Number(id), captured: v, fromTech: input.properties[id] ?? 0 }));
      calculated = calculateSimStats(maiden, config, equipment, technologies, tech, rules);
      rawPanel = calculateNativePanel(rules, phase, state, observedProperties).totals;
      // Preserve actual phase, omitted defaults, and all categories. This is the
      // existing evaluator, with captured inputs rather than UI assumptions.
      const restoredState = { ...input.state, ...state };
      const replay = calculateNativePanel(rules, phase, restoredState, observedProperties);
      assert.deepEqual(replay.totals, rawPanel, 'Import payload roundtrip changed the panel');
    } catch (e) { problems.push(e.message); }
  }
  const entry = { instanceId: raw.instance_id, templateId: raw.template_id, tank: maiden.tank, generation: raw.generation,
    implicitLevel: raw.level == null, config, craftNames, equipmentNames, magicNames, nativeState: state,
    calculated, rawPanel, capturedInputValues: rawPanel && Object.fromEntries(Object.entries(rawPanel).map(([id, v]) => [rules.attributes[id], v])),
    roundtripDifferences, propertyDifferences, simulatorLimitations, problems };
  cards.push(entry);
  if (problems.length) issues.push({ tank: maiden.tank, problems });
}
const report = { schemaVersion: 1, capturedAt: snapshot.captured_at, sourceCapture: path.relative(root, snapshotPath),
  status: 'diagnostic-not-imported', calculation: 'Existing simulator reused; not yet compared with visible game panel',
  rulesBinarySha256: rules.clientSha256, sourceBinarySha256: snapshot.source.binary_sha256,
  globalTech: tech ?? null, capturedPropertyDeltas: observedProperties ?? null,
  volatileProperties: volatile ?? null, cards, excluded, issues };
const output = path.join(root, '.private/garage-captures', `${path.basename(snapshotPath, '.json')}.decoded-${Date.now()}.json`);
fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, maidens: cards.length, excluded: excluded.length, issues,
  missingGlobals: !globals, volatilePropertyCount: volatile?.length,
  uiConfigLosesCategories: globals ? cards.filter((c) => c.roundtripDifferences.length).length : null,
  actualPhaseDiffersFromAuto: cards.filter((c) => c.simulatorLimitations.length).length,
  propertyDifferenceCount: cards.find((c) => c.propertyDifferences.length)?.propertyDifferences.length ?? 0,
  magicNonzero: cards.filter((c) => c.config.ordnance.level || c.config.tactics.level).map((c) => ({tank: c.tank, ordnance: c.config.ordnance, tactics: c.config.tactics, names: c.magicNames})),
  samples: [...cards].sort((a, b) => b.config.level - a.config.level).slice(0, 5).map(({ tank, config, capturedInputValues, roundtripDifferences }) => ({ tank, level: config.level, capturedInputValues, roundtripDifferences })) }, null, 2));
