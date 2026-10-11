import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(app, "public/data/maidens.json"), "utf8"));
const assets = JSON.parse(await fs.readFile(path.join(app, "public/data/table-portraits.json"), "utf8"));
const files = new Set();
for (const row of data.rows) {
  for (const url of [assets.rows[row.id], assets.classes[row.classId], assets.frames[row.rarityId], assets.rarities[row.rarityId], assets.bottomMask]) {
    assert.ok(url?.startsWith("/art/table-portraits/"), `Missing game portrait layer for ${row.id}`);
    files.add(url);
  }
}
for (const url of files) await fs.access(path.join(app, "public", url));
for (const url of new Set(Object.values(assets.rows))) {
  const { width, height } = await sharp(path.join(app, "public", url)).metadata();
  assert.ok(width / height > 0.8 && width / height < 1.25, `Not a Head_Square sprite: ${url} (${width}x${height})`);
}
for (const url of Object.values(assets.frames)) {
  const { width, height } = await sharp(path.join(app, "public", url)).metadata();
  assert.deepEqual([width, height], [109, 102]);
}
const mask = await sharp(path.join(app, "public", assets.bottomMask)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.deepEqual([mask.info.width, mask.info.height], [95, 21]);
const center = (10 * 95 + 47) * 4;
assert.deepEqual([...mask.data.subarray(center, center + 4)], [0, 0, 0, 191], "Original mask alpha must be preserved");
const ammunition = JSON.parse(await fs.readFile(path.join(app, "public/data/table-ammunition.json"), "utf8"));
const background = await sharp(path.join(app, "public", ammunition.background)).metadata();
assert.deepEqual([background.width, background.height], [52, 31]);
assert.equal(ammunition.iconScale, 0.45);
for (const type of new Set(data.rows.flatMap((row) => row.ammo))) {
  const icon = ammunition.types[type];
  assert.ok(icon, "Missing detail ammunition sprite for " + type);
  const image = await sharp(path.join(app, "public", icon.image)).metadata();
  assert.deepEqual([image.width, image.height], [icon.width, icon.height]);
}
console.log(JSON.stringify({ ammunitionTypes: Object.keys(ammunition.types).length, rows: data.rows.length, sprites: files.size, classes: Object.keys(assets.classes).length, maskAlpha: 191 / 255 }));
