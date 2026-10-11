import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { atlasSkinEntries, parseAtlasSkinSelections, selectedAtlasSkin, withAtlasSkin } from "../app/cardAtlasSkins.ts";

const read = async (file) => JSON.parse(await fs.readFile(new URL(file, import.meta.url), "utf8"));
const skins = await read("../public/data/maiden-skins.json");
const { rows } = await read("../public/data/maidens.json");
let total = 0;
for (const [id, variants] of Object.entries(skins.rows)) {
  assert.ok(rows.some((row) => String(row.id) === id), `Unknown maiden: ${id}`);
  assert.equal(new Set(variants.map((skin) => skin.id)).size, variants.length);
  for (const skin of variants) {
    assert.match(skin.image, /^\/art\/skins\/\d+\.webp$/u);
    assert.match(skin.headImage, /^\/art\/skin-portraits\/[a-zA-Z0-9_-]+\.webp$/u);
    for (const field of ["image", "headImage"]) {
      const meta = await sharp(fileURLToPath(new URL(`../public${skin[field]}`, import.meta.url))).metadata();
      assert.ok(meta.width > 0 && meta.height > 0 && (field === "headImage" || meta.hasAlpha), `Invalid ${field}: ${skin.id}`);
    }
    assert.equal(selectedAtlasSkin(variants, skin.id), skin);
    total++;
  }
  assert.equal(selectedAtlasSkin(variants, -1), undefined);
  assert.equal(selectedAtlasSkin(variants, 0), undefined);
}
for (const raw of [null, "bad", "null", "[]", "3", '"text"']) assert.deepEqual(parseAtlasSkinSelections(raw), {});
assert.deepEqual(parseAtlasSkinSelections('{"7002":86644146,"6001":-1,"6002":"2","x":3,"6003":1.5}'), { 7002: 86644146 });
const original = { 7002: 86644146 };
const next = withAtlasSkin(original, 6015, 86644103);
assert.deepEqual(original, { 7002: 86644146 });
assert.deepEqual(next, { 7002: 86644146, 6015: 86644103 });
assert.deepEqual(withAtlasSkin(next, 7002, 0), { 6015: 86644103 });
assert.equal(skins.rows[7002].length, 3);
const ordered = [...rows].sort((a, b) => a.id - b.id);
const merged = atlasSkinEntries(ordered, "merged", skins.rows, original);
const separate = atlasSkinEntries(ordered, "separate", skins.rows, original);
assert.equal(merged.length, rows.length);
assert.equal(separate.length, rows.length + total);
assert.equal(new Set(separate.map((entry) => entry.key)).size, separate.length);
assert.deepEqual(merged.map((entry) => entry.maiden.id), ordered.map((row) => row.id));
assert.equal(merged.find((entry) => entry.maiden.id === 7002).skin.id, original[7002]);
for (const maiden of ordered) {
  const entries = separate.filter((entry) => entry.maiden.id === maiden.id);
  assert.deepEqual(entries.map((entry) => entry.skin?.id ?? 0), [0, ...(skins.rows[maiden.id] ?? []).map((skin) => skin.id)]);
  assert.ok(entries.every((entry) => entry.maiden === maiden));
}
assert.deepEqual(atlasSkinEntries(ordered, "separate", skins.rows, {}), separate, "Separate mode must ignore saved selections");
assert.deepEqual(atlasSkinEntries([], "separate", skins.rows, original), []);
assert.equal(atlasSkinEntries(ordered, "separate", {}, original).length, rows.length, "Missing data keeps defaults");
const filtered = ordered.filter((row) => row.rarityId === 3);
assert.deepEqual(atlasSkinEntries(filtered, "separate", skins.rows, original), separate.filter((entry) => entry.maiden.rarityId === 3));
const paginated = Array.from({ length: Math.ceil(separate.length / 48) }, (_, index) => separate.slice(index * 48, (index + 1) * 48)).flat();
assert.deepEqual(paginated, separate, "No skins lost at card pagination boundaries");
console.log(JSON.stringify({ cards: Object.keys(skins.rows).length, skins: total, nativeHeads: total, selectionsValidated: true, merged: merged.length, separate: separate.length, filteredAndPaginated: true }, null, 2));
