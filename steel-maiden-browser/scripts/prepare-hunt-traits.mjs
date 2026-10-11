import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyHuntTraits } from "./hunt-traits.mjs";

const builder = fileURLToPath(new URL("../../analysis_apk/tools/build_hunt_special_rosters.py", import.meta.url));
execFileSync("python", ["-X", "utf8", builder], { stdio: "inherit" });
const dataPath = new URL("../public/data/maidens.json", import.meta.url);
const reportPath = new URL("../../analysis_apk/output/hunt_special_lineups/狩猎任务特殊阵容_游戏判定.json", import.meta.url);
const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
const before = structuredClone(data);
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
applyHuntTraits(data, report);
const changed = data.rows.filter((row, i) => JSON.stringify(row.huntTraits) !== JSON.stringify(before.rows[i].huntTraits)).length;
// Prove the scoped refresh preserves stats, icons, costs and every other field.
const unrelated = (value) => {
  const copy = structuredClone(value);
  delete copy.facets.huntTraits;
  for (const row of copy.rows) delete row.huntTraits;
  return copy;
};
assert.deepEqual(unrelated(data), unrelated(before));
const twice = structuredClone(data);
applyHuntTraits(twice, report);
assert.deepEqual(twice, data, "hunting refresh must be idempotent");
await fs.writeFile(dataPath, JSON.stringify(data));
execFileSync("python", ["-X", "utf8", builder, "--check"], { stdio: "inherit" });
console.log(JSON.stringify({ changedRows: changed, otherFieldsPreserved: true }));
