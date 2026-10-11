import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maidens = JSON.parse(await fs.readFile(path.join(root, "public", "data", "maidens.json"), "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(root, "public", "data", "colonization-catalog.json"), "utf8"));
const keys = ["durability", "evasion", "accuracy", "armor", "piercing", "power"];
const ids = new Set(maidens.rows.map((row) => String(row.id)));
if (catalog.maxLevel !== 12 || Object.keys(catalog.rows).length !== ids.size) throw new Error("Colonization card coverage or maximum level is wrong");
for (const id of ids) {
  const entry = catalog.rows[id];
  if (!entry) throw new Error(`Missing colonization card ${id}`);
  for (const key of keys) {
    const values = entry[key];
    if (!Array.isArray(values) || values.length !== 12 || values.some((value, index) => !Number.isInteger(value) || value < (values[index - 1] ?? 0))) {
      throw new Error(`Invalid colonization curve ${id}:${key}`);
    }
  }
}
const sample = catalog.rows["9858"];
if (!sample || keys.some((key, index) => sample[key][0] !== [45, 5, 5, 12, 18, 60][index])) throw new Error("Client template sample 9858 does not match");
const profileCount = new Set(Object.values(catalog.rows).map((entry) => JSON.stringify(entry))).size;
console.log(JSON.stringify({ maidens: ids.size, levels: catalog.maxLevel, profileCount, sample: Object.fromEntries(keys.map((key) => [key, { level1: sample[key][0], level12: sample[key][11] }])) }, null, 2));
