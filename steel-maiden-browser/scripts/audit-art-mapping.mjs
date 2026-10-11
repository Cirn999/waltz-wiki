import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
const modelIds = new Set(process.argv.slice(2).map(Number).filter(Number.isFinite));
const rows = dataset.rows.filter((row) => modelIds.has(row.modelId) || ["BT-5快速坦克", "BT-2快速坦克"].includes(row.tank));
console.log(JSON.stringify(rows.map((row) => ({
  id: row.id,
  tank: row.tank,
  person: row.person,
  modelId: row.modelId,
  appearanceId: row.appearanceId,
  image: row.image,
  headImage: row.headImage,
})), null, 2));
