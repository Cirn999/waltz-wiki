import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const { rows: maidens } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const labels = JSON.parse(await fs.readFile(path.join(root, "public/data/card-person-labels.json"), "utf8"));
assert.equal(labels.version, 1); assert.equal(labels.font, "SimSun"); assert.equal(labels.style, "cold-white-serif"); assert.equal(labels.em, 96);
const files = new Set();
let bytes = 0;
for (const maiden of maidens.filter((row) => row.person)) {
  const label = labels.rows[maiden.id];
  assert.ok(label, `Missing name: ${maiden.id}`);
  assert.equal(label.person, maiden.person, `Stale name: ${maiden.id}`);
  assert.match(label.image, /^\/art\/card-atlas\/person-names\/[0-9a-f]{16}\.png$/);
  if (files.has(label.image)) continue;
  files.add(label.image);
  const file = path.join(root, "public", label.image);
  const image = sharp(file);
  const meta = await image.metadata();
  assert.equal(meta.width, label.width); assert.equal(meta.height, label.height); assert.equal(meta.hasAlpha, true);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let fill = 0, stroke = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    if (data[index + 3] < 200) continue;
    if (Math.abs(data[index] - 246) <= 2 && Math.abs(data[index + 1] - 248) <= 2 && Math.abs(data[index + 2] - 252) <= 2) fill++;
    if (Math.abs(data[index] - 37) <= 2 && Math.abs(data[index + 1] - 55) <= 2 && Math.abs(data[index + 2] - 71) <= 2) stroke++;
  }
  assert.ok(fill > 0 && stroke > 0, `Missing approved cold-white fill / navy outline: ${label.person}`);
  bytes += (await fs.stat(file)).size;
}
console.log(JSON.stringify({ maidens: Object.keys(labels.rows).length, uniqueNames: files.size, bytes, namesAndColorsVerified: true, fontFilesBundled: false }, null, 2));
