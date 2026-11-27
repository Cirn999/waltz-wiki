import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createCraftMetadata } from "./craft-metadata.mjs";

const app = path.resolve(import.meta.dirname, "..");
const target = path.join(app, "public/data/maidens.json");
const data = JSON.parse(await fs.readFile(target, "utf8"));
const technology = JSON.parse(await fs.readFile(path.join(app, "public/data/technology-catalog.json"), "utf8"));
const enrich = createCraftMetadata(technology);
let changed = 0;
for (const row of data.rows) for (const key of ["engineOptions", "bodyOptions", "armorOptions"]) {
  const options = enrich(row[key]);
  if (JSON.stringify(options) !== JSON.stringify(row[key])) changed++;
  row[key] = options;
}
if (process.argv.includes("--check")) assert.equal(changed, 0, "Craft generations or descriptions differ from the current client technology catalogue");
else if (changed) await fs.writeFile(target, JSON.stringify(data));
console.log(JSON.stringify({ checked: data.rows.length, changedGroups: changed, checkOnly: process.argv.includes("--check") }));
