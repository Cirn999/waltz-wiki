import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Import the approved raster layers. This only trims transparent sprite margins
// and encodes WebP; no recoloring, repainted symbols, or generated SVG artwork.
const previewRoot = process.argv[2];
if (!previewRoot) throw new Error("Usage: node scripts/prepare-card-cost-assets.mjs <approved-preview-directory>");
const root = path.resolve(import.meta.dirname, "..");
const approved = JSON.parse(await fs.readFile(path.join(previewRoot, "assets/round-cost-card-samples/samples.json"), "utf8"));
const output = path.join(root, "public/art/card-atlas/cost-style");
await fs.mkdir(output, { recursive: true });
const web = "/art/card-atlas/cost-style/";
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const manifest = { version: 1, canvas: { width: 1024, height: 1536 }, frames: {}, sprites: {}, rarities: {} };
const provenance = { description: "Approved thirteen-cost star medals, round +/- plaques and centered shoulder insignia", files: [] };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metalNames = ["copper", "silver", "gold"];
for (const [index, metal] of metalNames.entries()) {
  const file = path.join(path.dirname(approved.sources.star.path), approved.frameSources[index]);
  const bytes = await fs.readFile(file);
  const info = await sharp(bytes).metadata();
  assert.equal(info.width, 1024); assert.equal(info.height, 1536); assert.ok(info.hasAlpha);
  const name = `frame-${metal}.webp`;
  await sharp(bytes).webp({ lossless: true }).toFile(path.join(output, name));
  manifest.frames[metal] = { image: web + name, medalX: [846, 842, 846][index], medalY: [1340, 1330, 1330][index], shoulderX: approved.shoulderCenters[index] };
  provenance.files.push({ output: name, original: path.basename(file), sha256: hash(bytes) });
}
for (const [key, source] of Object.entries(approved.sources)) {
  const bytes = await fs.readFile(source.path);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, `${key}: expected transparent sprite canvas`);
  if (key.startsWith("rim-")) assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 0);
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 80) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  // Same alpha threshold and one-pixel safety margin as the approved preview.
  left = Math.max(0, left - 1); top = Math.max(0, top - 1);
  const width = Math.min(info.width, right + 2) - left, height = Math.min(info.height, bottom + 2) - top;
  assert.ok(width > 0 && height > 0);
  const name = `${key.toLowerCase()}.webp`;
  await sharp(bytes).extract({ left, top, width, height }).resize({ width: 320, withoutEnlargement: true }).webp({ lossless: true }).toFile(path.join(output, name));
  manifest.sprites[key] = { image: web + name, width, height };
  provenance.files.push({ output: name, original: path.basename(source.path), sha256: hash(bytes), crop: { left, top, width, height } });
}
for (const icon of new Set(rows.map(row => row.rarityIcon).filter(Boolean))) {
  const { data, info } = await sharp(path.join(root, "public", icon)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] >= 80) { left = Math.min(left, x); right = Math.max(right, x); }
  manifest.rarities[icon] = { width: info.width, height: info.height, visibleCenterX: (left + right + 1) / 2 };
}
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await fs.writeFile(path.join(output, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
const bytes = (await Promise.all((await fs.readdir(output)).map(async file => (await fs.stat(path.join(output, file))).size))).reduce((sum, size) => sum + size, 0);
console.log({ frames: Object.keys(manifest.frames).length, sprites: Object.keys(manifest.sprites).length, rarityIcons: Object.keys(manifest.rarities).length, bytes });
