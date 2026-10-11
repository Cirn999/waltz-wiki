import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { nativeStaticGeometry, trimNativeGeometry, roundCoordinate } from "./native-portrait-geometry.mjs";

const appRoot = path.resolve(import.meta.dirname, "..");
const root = path.resolve(appRoot, "..");
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(root, "analysis_apk/tools/inspect_skin_portrait_layout.py")], { cwd: root, stdio: "pipe", windowsHide: true });
const audit = JSON.parse(await fs.readFile(path.join(root, "analysis_apk/output/skin_portrait_layout.json"), "utf8"));
const adjustments = JSON.parse(await fs.readFile(path.join(appRoot, "scripts/skin-framing-adjustments.json"), "utf8"));
const roots = ["patch/_1.18", "package/preinitial", "Resources"].map((base) => path.join(root, base));
const rows = {};
const fallback = [];
const reviewed = {};
for (const skin of audit.rows) {
  const { model } = skin;
  const geometry = nativeStaticGeometry(model);
  if (geometry.reason) { fallback.push({ modelId: model.modelId, reason: geometry.reason }); continue; }
  let source;
  for (const base of roots) {
    const file = path.join(base, "char", model.fold, `${model.pngName}.pn_`);
    try { await fs.access(file); source = file; break; } catch { /* Next native resource root. */ }
  }
  if (!source) throw new Error(`Missing static skin source: ${model.modelId}`);
  let pipeline = sharp(source);
  if (geometry.rotated) pipeline = pipeline.rotate(270);
  const upright = await pipeline.png().toBuffer();
  const size = await sharp(upright).metadata();
  if (size.width !== geometry.bitmapWidth || size.height !== geometry.bitmapHeight) {
    fallback.push({ modelId: model.modelId, reason: "atlas-size-mismatch", actual: [size.width, size.height], expected: [geometry.bitmapWidth, geometry.bitmapHeight] });
    continue;
  }
  // Match prepare-skins exactly, but only inspect pixels; never rewrite art.
  const { info: trim } = await sharp(upright).trim({ background: "#00000000", threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const exported = await sharp(path.join(appRoot, "public", skin.image)).metadata();
  if (Math.abs(exported.width / exported.height - trim.width / trim.height) > .003) throw new Error(`Skin trim/export mismatch: ${model.modelId}`);
  const bounds = trimNativeGeometry(geometry, trim);
  rows[model.modelId] = { source: "native-static-trimmed", ...Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, roundCoordinate(value)])),
    trim: { left: -(trim.trimOffsetLeft ?? 0), top: -(trim.trimOffsetTop ?? 0), width: trim.width, height: trim.height } };
}
for (const [modelId, region] of Object.entries(adjustments.regions)) {
  const skin = audit.rows.find((skin) => skin.model.modelId === Number(modelId));
  if (!skin || !(region.bottom > region.top && region.top >= 0 && region.bottom <= 1 && region.centerX > 0 && region.centerX < 1)) throw new Error(`Invalid reviewed region: ${modelId}`);
  const meta = await sharp(path.join(appRoot, "public", skin.image)).metadata();
  // Place the inspected subject region from 3% to 86% of the same art window.
  // These are explicitly reviewed card adaptations, not inferred native values.
  const height = 83 / (region.bottom - region.top);
  const width = height * (meta.width / meta.height) / (.927 / (1.5 * .9315));
  reviewed[modelId] = { x: roundCoordinate(47 - (region.centerX - .5) * width), height: roundCoordinate(height),
    bottom: roundCoordinate(97 - height * (1 - region.top)), reason: region.reason };
}
for (const modelId of Object.keys(adjustments.fitModels)) if (!audit.rows.some((skin) => skin.model.modelId === Number(modelId))) throw new Error(`Unknown compact model: ${modelId}`);
await fs.writeFile(path.join(appRoot, "public/data/skin-card-framing.json"), JSON.stringify({ version: 1, uiScale: .35, rows, fallback, reviewed, fitModels: adjustments.fitModels }));
console.log(JSON.stringify({ native: Object.keys(rows).length, reviewed: Object.keys(reviewed).length, compactFit: Object.keys(adjustments.fitModels).length, fallback, target278: rows[61589] }, null, 2));
