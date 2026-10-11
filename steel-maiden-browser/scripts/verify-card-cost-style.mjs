import fs from "node:fs/promises";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cardCostCanvas, cardCostFrames, cardCostGroups, cardCostSprites, cardCostStyle, cardRarityLeft } from "../app/cardAtlasCost.ts";

const manifest = JSON.parse(await fs.readFile(new URL("../public/art/card-atlas/cost-style/manifest.json", import.meta.url), "utf8"));
const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
assert.equal(cardCostGroups.length, 13);
assert.deepEqual([...new Set(rows.map(row => row.magicCostGroup))].sort(), [...cardCostGroups].sort());
for (const invalid of ["", "N0", "N7", "N1+", "N2-", "N3-", "N4++", "N5−", "bad"]) assert.equal(cardCostStyle(invalid), null);
const files = new Set(Object.values(cardCostFrames).map(frame => frame.image));
for (const label of cardCostGroups) {
  const cost = cardCostStyle(label), sprites = cardCostSprites(cost);
  assert.equal(cost.metal, cost.tier <= 2 ? "copper" : cost.tier <= 4 ? "silver" : "gold");
  const stars = sprites.filter(s => s.role === "star"), fill = sprites.find(s => s.role === "fill");
  assert.equal(stars.length, Number(label[1]));
  const sign = sprites.find(s => s.role === "modifier-sign"), ring = sprites.find(s => s.role === "modifier-ring");
  assert.equal(Boolean(sign), label.length === 3);
  if (sign) {
    assert.ok(sign.image.endsWith(cost.modifier + ".webp"));
    assert.ok(ring.image.endsWith(`rim-${cost.metal}.webp`));
    assert.equal(sprites.find(s => s.role === "modifier-fill").image, fill.image);
    for (const star of stars) {
      const nearX = Math.max(star.x - star.width / 2, Math.min(ring.x, star.x + star.width / 2));
      const nearY = Math.max(star.y - star.height / 2, Math.min(ring.y, star.y + star.height / 2));
      assert.ok(Math.hypot(ring.x - nearX, ring.y - nearY) >= Math.max(ring.width, ring.height) / 2, label + " plaque must not hide a star");
    }
  }
  for (const sprite of sprites) {
    files.add(sprite.image);
    assert.ok(sprite.x - sprite.width / 2 >= 0 && sprite.x + sprite.width / 2 <= cardCostCanvas.width);
    assert.ok(sprite.y - sprite.height / 2 >= 0 && sprite.y + sprite.height / 2 <= cardCostCanvas.height);
  }
  // +/- changes only the plaque, never the size or arrangement of the stars.
  assert.deepEqual(stars, cardCostSprites(cardCostStyle(label.slice(0, 2))).filter(s => s.role === "star"));
}
for (const metal of ["copper", "silver", "gold"]) for (const [icon, bounds] of Object.entries(manifest.rarities)) {
  const boxW = 1024 * .06, boxH = 1536 * .073, fit = Math.min(boxW / bounds.width, boxH / bounds.height);
  const paintedCenter = cardRarityLeft(metal, icon) / 100 * 1024 + boxW / 2 + (bounds.visibleCenterX - bounds.width / 2) * fit;
  assert.ok(Math.abs(paintedCenter - cardCostFrames[metal].shoulderX) < 1e-8);
}
for (const image of files) {
  const bytes = await fs.readFile(new URL(`../public${image}`, import.meta.url));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(info.width > 0 && info.height > 0);
  if (image.includes("frame-")) {
    assert.equal(info.width, 1024); assert.equal(info.height, 1536);
    assert.equal(data[(768 * info.width + 512) * 4 + 3], 0, "Artwork window must stay transparent");
  }
  if (image.includes("rim-")) assert.equal(data[(Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4 + 3], 0);
}
console.log({ groups: cardCostGroups.length, rows: rows.length, usedAssets: files.size, centeredRarityCombinations: 9, signsPreserveStars: true, noStarOverlap: true });
