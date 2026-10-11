import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function prepareTablePortraits(rows) {
  const cache = path.join(appRoot, ".cache/table-portraits");
  await fs.mkdir(cache, { recursive: true });
  const rowsPath = path.join(cache, "rows.json");
  await fs.writeFile(rowsPath, JSON.stringify(rows.map(({ id, modelId, classId, ammo }) => ({ id, modelId, classId, ammo }))));
  execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(appRoot, "scripts/prepare-table-portraits.py"), rowsPath, appRoot], { stdio: "inherit", windowsHide: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(await fs.readFile(path.join(appRoot, "public/data/maidens.json"), "utf8"));
  await prepareTablePortraits(data.rows);
}
