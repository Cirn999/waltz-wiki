import fs from "node:fs";
import path from "node:path";

const cliArgs = process.argv.slice(2);
const compact = cliArgs.includes("--compact");
const [oldRootArg = "dist/client/data", newRootArg = "public/data"] = cliArgs.filter((arg) => arg !== "--compact");
const oldRoot = path.resolve(oldRootArg);
const newRoot = path.resolve(newRootArg);
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const byId = (rows) => new Map(rows.map((row) => [Number(row.id), row]));

const oldMaidens = read(oldRoot, "maidens.json");
const newMaidens = read(newRoot, "maidens.json");
const oldRows = byId(oldMaidens.rows);
const newRows = byId(newMaidens.rows);
const added = [...newRows.keys()].filter((id) => !oldRows.has(id)).map((id) => newRows.get(id));
const removed = [...oldRows.keys()].filter((id) => !newRows.has(id)).map((id) => oldRows.get(id));
const changed = [];
const statChanges = [];
for (const [id, current] of newRows) {
  const previous = oldRows.get(id);
  if (!previous) continue;
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((field) => field !== "stats" && !same(previous[field], current[field]));
  const stats = [];
  for (const level of [...new Set([...Object.keys(previous.stats ?? {}), ...Object.keys(current.stats ?? {})])]) {
    for (const key of [...new Set([...Object.keys(previous.stats?.[level] ?? {}), ...Object.keys(current.stats?.[level] ?? {})])]) {
      const before = previous.stats?.[level]?.[key];
      const after = current.stats?.[level]?.[key];
      if (before !== after) stats.push({ level: Number(level), key, before, after });
    }
  }
  if (fields.length || stats.length) changed.push({ id, tank: current.tank, person: current.person, fields, statChangeCount: stats.length });
  if (stats.length) statChanges.push({ id, tank: current.tank, person: current.person, changes: stats });
}

const resistanceSet = (payload) => new Set(payload.rows.flatMap((row) => [
  ...(row.engineOptions ?? []), ...(row.bodyOptions ?? []), ...(row.armorOptions ?? []),
].flatMap((option) => option.resistance ?? [])));
const oldResistances = resistanceSet(oldMaidens);
const newResistances = resistanceSet(newMaidens);

const oldTech = read(oldRoot, "technology-catalog.json");
const newTech = read(newRoot, "technology-catalog.json");
const oldBlocks = new Map(oldTech.blocks.map((block) => [String(block.id), block]));
const newBlocks = new Map(newTech.blocks.map((block) => [String(block.id), block]));
const addedTechBlocks = [...newBlocks].filter(([id]) => !oldBlocks.has(id)).map(([, block]) => block);
const removedTechBlocks = [...oldBlocks].filter(([id]) => !newBlocks.has(id)).map(([, block]) => block);
const changedTechBlocks = [...newBlocks].filter(([id, block]) => oldBlocks.has(id) && !same(oldBlocks.get(id), block)).map(([, block]) => ({
  id: block.id,
  name: block.name,
  category: block.category,
  fields: [...new Set([...Object.keys(oldBlocks.get(String(block.id))), ...Object.keys(block)])]
    .filter((field) => !same(oldBlocks.get(String(block.id))[field], block[field])),
  nodesBefore: oldBlocks.get(String(block.id)).nodes?.length ?? 0,
  nodesAfter: block.nodes?.length ?? 0,
  addedNodes: (block.nodes ?? []).filter((node) => !(oldBlocks.get(String(block.id)).nodes ?? []).some((previous) => same(previous, node))),
  removedNodes: (oldBlocks.get(String(block.id)).nodes ?? []).filter((node) => !(block.nodes ?? []).some((current) => same(current, node))),
  linesBefore: oldBlocks.get(String(block.id)).lines?.length ?? 0,
  linesAfter: block.lines?.length ?? 0,
  levelsBefore: oldBlocks.get(String(block.id)).levels?.length ?? 0,
  levelsAfter: block.levels?.length ?? 0,
  changedLevels: (block.levels ?? []).flatMap((level) => {
    const previous = oldBlocks.get(String(block.id)).levels?.find((item) => item.level === level.level);
    if (!previous || same(previous, level)) return [];
    return [{
      level: level.level,
      fields: [...new Set([...Object.keys(previous), ...Object.keys(level)])].filter((field) => !same(previous[field], level[field])),
      before: previous,
      after: level,
    }];
  }),
}));

const summarizeCatalog = (name, key) => {
  const before = read(oldRoot, name);
  const after = read(newRoot, name);
  return { before: before[key]?.length ?? 0, after: after[key]?.length ?? 0 };
};
const oldResearch = read(oldRoot, "research-tree.json");
const newResearch = read(newRoot, "research-tree.json");

const report = {
  roots: { oldRoot, newRoot },
  maidens: {
    before: oldMaidens.rows.length,
    after: newMaidens.rows.length,
    added: added.map(({ id, tank, person, stage, className }) => ({ id, tank, person, stage, className })),
    removed: removed.map(({ id, tank, person }) => ({ id, tank, person })),
    changedCount: changed.length,
    changed,
    statChangedCount: statChanges.length,
    statChanges,
  },
  resistances: {
    before: oldResistances.size,
    after: newResistances.size,
    added: [...newResistances].filter((item) => !oldResistances.has(item)).sort(),
    removed: [...oldResistances].filter((item) => !newResistances.has(item)).sort(),
  },
  technology: {
    before: oldTech.blocks.length,
    after: newTech.blocks.length,
    addedBlocks: addedTechBlocks.map(({ id, name, category, levels }) => ({ id, name, category, levels: levels?.length ?? 0 })),
    removedBlocks: removedTechBlocks.map(({ id, name, category }) => ({ id, name, category })),
    changedBlocks: changedTechBlocks,
  },
  research: {
    nodes: { before: oldResearch.nodes?.length ?? 0, after: newResearch.nodes?.length ?? 0 },
    recipes: { before: oldResearch.recipes?.length ?? 0, after: newResearch.recipes?.length ?? 0 },
    edges: { before: oldResearch.edges?.length ?? 0, after: newResearch.edges?.length ?? 0 },
  },
  equipment: summarizeCatalog("equipment-catalog.json", "families"),
  colonization: summarizeCatalog("colonization-catalog.json", "maidens"),
};

if (compact) {
  const fieldChangeCounts = {};
  for (const row of changed) for (const field of row.fields) fieldChangeCounts[field] = (fieldChangeCounts[field] ?? 0) + 1;
  console.log(JSON.stringify({
    maidens: {
      before: report.maidens.before,
      after: report.maidens.after,
      added: report.maidens.added,
      removed: report.maidens.removed,
      changedCount: report.maidens.changedCount,
      fieldChangeCounts,
      statChanged: statChanges.map(({ id, tank, person, changes }) => ({ id, tank, person, changeCount: changes.length })),
      ammunitionChanged: changed.filter((row) => row.fields.some((field) => ["ammo", "ammoDetail", "ammunition", "allAmmunition"].includes(field))).map(({ id, tank, person }) => ({ id, tank, person })),
    },
    resistances: report.resistances,
    technology: report.technology,
    research: report.research,
    equipment: report.equipment,
    colonization: report.colonization,
  }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
