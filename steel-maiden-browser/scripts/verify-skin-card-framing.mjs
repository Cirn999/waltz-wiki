import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { cardSkinFraming, nativeCardViewport, framingFromNativeBounds } from "../app/cardAtlasFraming.ts";
import { nativeStaticGeometry, trimNativeGeometry } from "./native-portrait-geometry.mjs";

const read = async (file) => JSON.parse(await fs.readFile(new URL(file, import.meta.url), "utf8"));
const metadata = await read("../public/data/skin-card-framing.json");
const { rows: skins } = await read("../public/data/maiden-skins.json");
const audit = await read("../../analysis_apk/output/skin_portrait_layout.json");
const baseAudit = await read("../../analysis_apk/output/native_portrait_layout.json");
const baseOutput = await read("../public/data/card-framing.json");
const close = (a, b, label) => assert.ok(Math.abs(a - b) < .00011, `${label}: ${a} != ${b}`);
let native = 0, reviewed = 0, fit = 0;
for (const skin of Object.values(skins).flat()) {
  const source = audit.rows.find((row) => row.model.modelId === skin.modelId);
  assert.ok(source, `Missing source: ${skin.modelId}`);
  const bounds = metadata.rows[skin.modelId];
  assert.ok(bounds || metadata.fallback.some((row) => row.modelId === skin.modelId), `No native/fallback decision: ${skin.modelId}`);
  if (bounds) {
    const original = nativeStaticGeometry(source.model);
    assert.ok(!original.reason);
    const calculated = trimNativeGeometry(original, { trimOffsetLeft: -bounds.trim.left, trimOffsetTop: -bounds.trim.top, width: bounds.trim.width, height: bounds.trim.height });
    for (const field of ["left", "top", "width", "height"]) close(bounds[field], calculated[field], `${skin.modelId}.${field}`);
    const image = await sharp(fileURLToPath(new URL(`../public${skin.image}`, import.meta.url))).metadata();
    assert.ok(Math.abs(bounds.width / bounds.height - image.width / image.height) < .003, `Distorted portrait: ${skin.modelId}`);
  }
  const placement = cardSkinFraming(skin.modelId);
  if (metadata.fitModels[skin.modelId]) assert.equal(placement, null);
  if (placement) {
    assert.ok(Object.values(placement).every(Number.isFinite));
    assert.ok(placement.height > 0);
    if (metadata.reviewed[skin.modelId]) reviewed++;
    else { native++; assert.deepEqual(placement, framingFromNativeBounds(bounds)); }
  } else fit++;
}
// The shared extraction helper must not move any of the existing base cards.
for (const row of baseAudit.rows) {
  const saved = baseOutput.rows[row.id];
  if (!saved) continue;
  const calculated = nativeStaticGeometry(row.model);
  for (const field of ["left", "top", "width", "height"]) close(saved[field], calculated[field], `base ${row.id}.${field}`);
}
const target = metadata.rows[61589];
assert.ok(target, "278 must use its own native skin model");
close(target.left, -264.426, "278 left"); close(target.top, -183.1166, "278 top");
assert.equal(target.trim.left, 12); assert.equal(target.trim.top, 2);
const oldFitHeight = Math.min(nativeCardViewport.height * .86, nativeCardViewport.width / (target.width / target.height));
assert.ok(target.height / oldFitHeight > 1.25, "278 must no longer shrink to fit background props");
assert.equal(metadata.fallback.find((row) => row.modelId === 61563).reason, "atlas-size-mismatch");
assert.ok(metadata.reviewed[61563], "KV-5 mismatch must have an inspected subject region");
assert.equal(cardSkinFraming(-1), null);
assert.equal(native + reviewed + fit, 88);
console.log(JSON.stringify({ skins: 88, native, reviewed, centeredFit: fit, baseCardsUnchanged: Object.keys(baseOutput.rows).length, target278ScaleIncrease: target.height / oldFitHeight }, null, 2));
