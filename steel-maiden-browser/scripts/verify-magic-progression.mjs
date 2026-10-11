import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public", "data", "maidens.json"), "utf8"));
const magic = data.magicProgression;
if (!magic || magic.tactics.length !== 11) throw new Error("Missing the 11 client-configured tactics");
if (magic.ordnanceBonuses.length !== 10) throw new Error("Missing ordnance panel bonuses");
if (!magic.markIcons?.["鹰标"]) throw new Error("Missing the client eagle-mark icon");
if (!magic.markIcons?.["金桨"]) throw new Error("Missing the client air-raid gold-propeller icon");

for (const stage of ["N1", "N2", "N3", "N4", "N5", "N6"]) {
  for (const kind of ["ordnance", "tactics"]) {
    const paths = magic.progression[stage]?.ground?.[kind] ?? [];
    if (!paths.length) throw new Error(`Missing ${stage} ${kind} upgrade paths`);
    for (const variant of paths) {
      if (variant.levels.length !== 10) throw new Error(`Incomplete upgrade path ${variant.selectorId}`);
      for (let index = 0; index < 10; index++) {
        const row = variant.levels[index];
        if (row.level !== index + 1 || row.scoutLevel <= 0 || row.marks <= 0 || !row.materials.length ||
          row.materials.some((material) => !material.image)) {
          throw new Error(`Invalid upgrade row ${variant.selectorId} level ${index + 1}`);
        }
      }
    }
  }
}

const pathsBySelector = new Map();
for (const [stage, vehicles] of Object.entries(magic.progression)) {
  for (const [vehicle, kinds] of Object.entries(vehicles)) {
    for (const [kind, paths] of Object.entries(kinds)) {
      for (const variant of paths) {
        if (pathsBySelector.has(variant.selectorId)) throw new Error(`Duplicate selector ${variant.selectorId}`);
        pathsBySelector.set(variant.selectorId, { stage, vehicle, kind, variant });
      }
    }
  }
}

for (const maiden of data.rows) {
  for (const kind of ["ordnance", "tactics"]) {
    const selectorId = maiden.magicSelectors?.[kind];
    const recipe = pathsBySelector.get(selectorId);
    if (!recipe || recipe.kind !== kind) {
      throw new Error(`Card ${maiden.id} has no unique ${kind} client recipe: ${selectorId}`);
    }
  }
}

for (const [cardId, tank, stage, first, last, ordnanceId, tacticsId, tacticMaterial] of [
  [6414, "SU-8", "N3", 3, 30, 37283701, 37284741, 3202],
  [6881, "FCM F1", "N4", 5, 50, 37283803, 37284873, 3203],
]) {
  const maiden = data.rows.find((row) => row.id === cardId);
  if (!maiden || maiden.stage !== stage) throw new Error(`Missing ${tank} ${stage}`);
  for (const [kind, selectorId] of [["ordnance", ordnanceId], ["tactics", tacticsId]]) {
    if (maiden.magicSelectors[kind] !== selectorId) throw new Error(`${tank} has wrong ${kind} selector`);
    const path = pathsBySelector.get(selectorId)?.variant;
    if (!path) throw new Error(`Missing ${tank} ${kind} path`);
    if (path.levels[0].marks !== first || path.levels[9].marks !== last) {
      throw new Error(`${tank} ${kind} marks should be ${first} to ${last}`);
    }
    const expectedScoutLevel = cardId === 6414 ? [16, 34] : [19, 37];
    if (path.levels[0].scoutLevel !== expectedScoutLevel[0] || path.levels[9].scoutLevel !== expectedScoutLevel[1]) {
      throw new Error(`${tank} ${kind} has incorrect comprehensive scouting requirements`);
    }
    if (kind === "tactics" && path.levels.some((level) => !level.materials.some((item) => item.fundId === tacticMaterial))) {
      throw new Error(`${tank} tactics should consume fund ${tacticMaterial}`);
    }
  }
}

// These client records deliberately do not follow vehicle-class or displayed
// blueprint-stage inference. The card's own selector must always win.
for (const [cardId, ordnanceId, tacticsId] of [[7481, 37285903, 37286973], [9881, 37283904, 37284974]]) {
  const maiden = data.rows.find((row) => row.id === cardId);
  if (maiden?.magicSelectors.ordnance !== ordnanceId || maiden.magicSelectors.tactics !== tacticsId) {
    throw new Error(`Special card ${cardId} lost its client magic recipe selectors`);
  }
}

for (const tactic of magic.tactics) {
  if (!tactic.image || tactic.levels.length !== 10 || tactic.levels.some((level) => !level.effects.length)) {
    throw new Error(`Incomplete tactic ${tactic.name}`);
  }
}

console.log(JSON.stringify({ tactics: magic.tactics.length, stages: Object.keys(magic.progression),
  groundPaths: Object.values(magic.progression).reduce((total, stage) => total + stage.ground.ordnance.length + stage.ground.tactics.length, 0),
  cardsWithExactRecipes: data.rows.length,
  missingMarkIcons: Object.entries(magic.markIcons).filter(([, image]) => !image).map(([name]) => name),
  sample: { su8: [3, 30], fcmF1: [5, 50] } }, null, 2));
