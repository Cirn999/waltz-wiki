import fs from "node:fs/promises";
import { organizeMagicCosts } from "./magic-cost-groups.mjs";

const url = new URL("../public/data/maidens.json", import.meta.url);
const data = JSON.parse(await fs.readFile(url, "utf8"));
const report = organizeMagicCosts(data.rows, data.magicProgression.progression);
const byId = new Map(report.cards.map((card) => [card.id, card.group]));
for (const row of data.rows) row.magicCostGroup = byId.get(row.id);
await fs.writeFile(url, JSON.stringify(data));
await fs.writeFile(new URL("../public/data/magic-cost-groups.json", import.meta.url), JSON.stringify(report));
console.log(JSON.stringify({ cards: report.cards.length, groups: report.groups, exceptions: report.exceptions }, null, 2));
