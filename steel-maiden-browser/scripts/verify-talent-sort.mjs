import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { compareTalentLevels } from "../app/talentSort.ts";

const row = (id, talents) => ({ id, talents: talents.map(([name, level]) => ({ name, level })) });
const fixtures = [row(1, [["绘画", 99], ["烹饪", 2]]), row(2, [["烹饪", 10]]), row(3, [["烹饪", 2]]), row(4, []), row(5, [["绘画", 101]]), row(6, [["烹饪", 0]]), row(7, [["烹饪", NaN]])];
const ids = (rows) => rows.map(({ id }) => id);
assert.deepEqual(ids([...fixtures].sort((a, b) => compareTalentLevels(a, b, "烹饪", false))), [6, 1, 3, 2, 4, 5, 7]);
assert.deepEqual(ids([...fixtures].sort((a, b) => compareTalentLevels(a, b, "烹饪", true))), [2, 1, 3, 6, 4, 5, 7]);
assert.deepEqual(ids([...fixtures].reverse().sort((a, b) => compareTalentLevels(a, b, "无此才艺", true))), ids(fixtures));

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const names = [...new Set(rows.flatMap((maiden) => maiden.talents.map((talent) => talent.name)))];
for (const name of names) {
  const groups = new Map();
  const missing = [];
  for (const maiden of rows) {
    const value = maiden.talents.find((talent) => talent.name === name)?.level;
    if (!Number.isFinite(value)) missing.push(maiden.id);
    else groups.set(value, [...(groups.get(value) ?? []), maiden.id]);
  }
  for (const descending of [false, true]) {
    const levels = [...groups.keys()].sort((a, b) => descending ? b - a : a - b);
    const expected = [...levels.flatMap((level) => groups.get(level).sort((a, b) => a - b)), ...missing.sort((a, b) => a - b)];
    assert.deepEqual(ids([...rows].sort((a, b) => compareTalentLevels(a, b, name, descending))), expected, `${name}: ${descending ? "descending" : "ascending"}`);
  }
}
console.log(JSON.stringify({ vehicles: rows.length, talents: names, directions: ["ascending", "descending"], missing: "always last", edgeCases: "secondary talent, numeric 2/10, zero, equal levels, missing and invalid levels" }));
