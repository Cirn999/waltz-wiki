/** Recover the native model coordinate system without modifying any artwork.
 * See analysis_apk/tools/inspect_native_portrait_layout.py for native evidence.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { nativeStaticGeometry, roundCoordinate as round } from "./native-portrait-geometry.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const root = path.resolve(appRoot, "..");
const auditPath = path.join(root, "analysis_apk/output/native_portrait_layout.json");
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(root, "analysis_apk/tools/inspect_native_portrait_layout.py"), "--output", auditPath], { cwd: root, stdio: "pipe", windowsHide: true });
const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const { rows: maidens } = JSON.parse(await fs.readFile(path.join(appRoot, "public/data/maidens.json"), "utf8"));
const byId = new Map(maidens.map((row) => [row.id, row]));
const rows = {};
const fallback = [];
for (const { id, model } of audit.rows) {
  const geometry = nativeStaticGeometry(model);
  if (geometry.reason) { fallback.push({ id, reason: geometry.reason }); continue; }
  const { left, top, width, height, bitmapWidth, bitmapHeight } = geometry;
  const maiden = byId.get(id);
  if (!maiden?.image) { fallback.push({ id, reason: "missing-image" }); continue; }
  const exported = await sharp(path.join(appRoot, "public", maiden.image)).metadata();
  if (Math.abs(exported.width / exported.height - bitmapWidth / bitmapHeight) > .003) {
    fallback.push({ id, reason: "export-aspect-mismatch" }); continue;
  }
  rows[id] = { modelId: model.modelId, source: "native-static", left: round(left), top: round(top), width: round(width), height: round(height) };
}
const output = { version: 1, uiScale: .35, rows, fallback };
await fs.writeFile(path.join(appRoot, "public/data/card-framing.json"), JSON.stringify(output));
console.log(JSON.stringify({ native: Object.keys(rows).length, fallback, examples: [6203, 6214, 9903, 9924].map((id) => ({ id, ...rows[id] })) }, null, 2));
