import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [maidens, growth] = await Promise.all([
  fs.readFile(path.join(root, "public/data/maidens.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "public/data/growth-curves.json"), "utf8").then(JSON.parse),
]);

const statKeys = ["durability", "power", "piercing", "armor"];
assert.equal(growth.minLevel, 1);
assert.equal(growth.maxLevel, 99);
assert.equal(Object.keys(growth.rows).length, maidens.rows.length);

let checked = 0;
for (const maiden of maidens.rows) {
  const row = growth.rows[String(maiden.id)];
  assert.ok(row, `Missing growth curve for card ${maiden.id}`);
  for (const key of statKeys) {
    assert.equal(row[key].length, 99, `${maiden.id} ${key} should have 99 levels`);
    assert.ok(row[key].every((value) => value === null || Number.isInteger(value)), `${maiden.id} ${key} has invalid values`);
    for (const level of maidens.levels) {
      assert.equal(row[key][level - 1], maiden.stats[String(level)][key], `${maiden.id} ${key} level ${level} differs from the attribute table`);
      checked += 1;
    }
  }
}

console.log(JSON.stringify({ cards: maidens.rows.length, levels: growth.maxLevel, checkpointValuesVerified: checked }));
