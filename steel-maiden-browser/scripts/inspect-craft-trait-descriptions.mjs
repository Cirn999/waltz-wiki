import fs from "node:fs/promises";
import { findCraftTech } from "../app/loadoutMath.ts";

const maidens = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const technology = JSON.parse(await fs.readFile(new URL("../public/data/technology-catalog.json", import.meta.url), "utf8"));
const descriptions = new Map();
for (const block of technology.blocks) for (const node of block.nodes) for (const trait of node.traits) {
  if (!trait.description) continue;
  const values = descriptions.get(trait.name) ?? new Set();
  values.add(trait.description);
  descriptions.set(trait.name, values);
}
const counts = {};
const missing = new Map();
for (const [category, field] of [["主炮", "allAmmunition"], ["车体", "bodyOptions"], ["引擎", "engineOptions"], ["防护", "armorOptions"]]) {
  let total = 0, own = 0, exact = 0, fallback = 0;
  for (const maiden of maidens.rows) for (const craft of maiden[field]) {
    const native = findCraftTech(technology, category, craft.id, craft.rank)?.node;
    for (const trait of craft.effects ?? craft.resistanceDetails ?? []) {
      total++;
      if (trait.description) own++;
      else if (native?.traits.some((item) => item.name === trait.name && item.description)) exact++;
      else if (descriptions.has(trait.name)) fallback++;
      else missing.set(trait.name, (missing.get(trait.name) ?? 0) + 1);
    }
  }
  counts[category] = { total, own, exact, fallback };
}
console.log(JSON.stringify({ counts, conflicts: [...descriptions].filter(([, values]) => values.size > 1).map(([name, values]) => ({ name, descriptions: [...values] })), missing: [...missing], examples: [...descriptions].slice(-10).map(([name, values]) => ({ name, description: [...values][0] })) }, null, 2));
