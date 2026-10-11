import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { cardArtFraming, cardArtUsesContain, defaultCardArtFraming, nativeCardViewport } from "../app/cardAtlasFraming.ts";

const read = async (file) => JSON.parse(await fs.readFile(new URL(file, import.meta.url), "utf8"));
const { rows: maidens } = await read("../public/data/maidens.json");
const metadata = await read("../public/data/card-framing.json");
const fallback = new Map(metadata.fallback.map((row) => [row.id, row.reason]));
const ids = new Set(maidens.map((row) => row.id));
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < .0001, `${label}: ${actual} != ${expected}`);
assert.equal(metadata.version, 1);
assert.equal(metadata.uiScale, .35);
assert.equal(fallback.size, metadata.fallback.length);
assert.equal(Object.keys(metadata.rows).length + fallback.size, maidens.length);
for (const id of [...Object.keys(metadata.rows).map(Number), ...fallback.keys()]) assert.ok(ids.has(id), `Stale model entry: ${id}`);

for (const maiden of maidens) {
  const bounds = metadata.rows[maiden.id];
  const framing = cardArtFraming(maiden.id);
  assert.ok(Object.values(framing).every(Number.isFinite), `Non-finite placement: ${maiden.id}`);
  if (!bounds) {
    assert.ok(fallback.has(maiden.id), `Undocumented fallback: ${maiden.id}`);
    assert.deepEqual(framing, defaultCardArtFraming);
    continue;
  }
  assert.ok(!fallback.has(maiden.id), `Conflicting fallback: ${maiden.id}`);
  assert.equal(bounds.modelId, maiden.modelId, `Model changed: ${maiden.id}; regenerate framing`);
  assert.equal(bounds.source, "native-static");
  assert.ok([bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite));
  assert.ok(bounds.width > 0 && bounds.height > 0);
  const image = await sharp(fileURLToPath(new URL(`../public${maiden.image}`, import.meta.url))).metadata();
  assert.ok(Math.abs(image.width / image.height - bounds.width / bounds.height) < .003, `Changed image aspect: ${maiden.id}`);
  const view = nativeCardViewport;
  // Round-trip CSS percentages to native coordinates. Large guns may extend
  // outside the viewport; clipping is intentional, distorting the image is not.
  close(framing.height / 100 * view.height, bounds.height, `height ${maiden.id}`);
  close((framing.x / 100 - view.originX) * view.width - bounds.width / 2, bounds.left, `left ${maiden.id}`);
  close((1 - framing.bottom / 100) * view.height - view.originY - bounds.height, bounds.top, `top ${maiden.id}`);
}

// Native RMC + XML anchor + plist trim/rotation regression fixtures.
for (const [id, expected] of [
  [6203, [-194.0972, -399.8505, 381.15, 677.985]],
  [6214, [-182.27, -171.5197, 646.0125, 520.03]],
  [9903, [-263.9155, -197.5747, 424.62, 573.3]],
  [9924, [-273.0535, -191.9533, 398.055, 527.765]],
]) {
  const bounds = metadata.rows[id];
  for (const [index, field] of ["left", "top", "width", "height"].entries()) close(bounds[field], expected[index], `${id}.${field}`);
}
assert.deepEqual(cardArtFraming(-1), defaultCardArtFraming);
const copy = cardArtFraming(-1); copy.x = 0;
assert.equal(cardArtFraming(-1).x, 50, "Fallback must not be mutable across cards");
assert.deepEqual(maidens.filter((maiden) => cardArtUsesContain(maiden.id)).map((maiden) => maiden.id), [7002], "Only Epsilon classic uses the reviewed compact-art exception");
assert.equal(cardArtUsesContain(-1), false);
console.log(JSON.stringify({ rows: maidens.length, native: Object.keys(metadata.rows).length, fallback: metadata.fallback.length, coordinateRoundTrip: true, targetFixtures: 4 }, null, 2));
