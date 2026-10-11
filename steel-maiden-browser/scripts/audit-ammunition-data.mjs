import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preparedPath = path.join(appRoot, "public", "data", "maidens.json");

const prepared = JSON.parse(await fs.readFile(preparedPath, "utf8"));
const preparedRow = prepared.rows.find((row) => row.person === "缪");
const losat = prepared.rows.find((row) => row.tank === "LOSAT");

if (!preparedRow) throw new Error("未找到缪的数据记录");

const target = preparedRow.ammunition.find((item) => item.name === "尾翼蜂巢型火箭弹(中口径)");
if (!target) throw new Error("未找到尾翼蜂巢型火箭弹(中口径)");

const actual = Object.fromEntries(target.stats.map((stat) => [stat.key, stat.value]));
const expected = { 火力: 1500, 穿甲: 460, 命中: 185, 射程: 11000 };
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`缪的弹药属性不符：${JSON.stringify(actual)}`);
}

const allAmmunition = prepared.rows.flatMap((row) => row.ammunition ?? []);
const statCountDistribution = Object.fromEntries([...allAmmunition.reduce((counts, item) => {
  counts.set(item.stats.length, (counts.get(item.stats.length) ?? 0) + 1);
  return counts;
}, new Map()).entries()].sort((left, right) => left[0] - right[0]));

console.log(JSON.stringify({
  checked: `${preparedRow.person} / ${target.name}`,
  stats: actual,
  ammunitionCards: allAmmunition.length,
  statCountDistribution,
  losat: (losat?.ammunition ?? []).map((item) => ({
    id: item.id,
    stats: Object.fromEntries(item.stats.map((stat) => [stat.key, stat.value])),
  })),
}, null, 2));
