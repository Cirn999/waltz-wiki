import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { applyRestoredGameIcons, restoredGameIcons } from "./restored-game-icons.mjs";

const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const icons = Object.fromEntries(restoredGameIcons.map((icon) => [icon.code, `/art/${icon.folder}/${icon.code}.webp`]));
const expectedCounts = { 13: 6, 14: 3, 15: 3, 16: 1 };
for (const icon of restoredGameIcons) {
  const url = icons[icon.code];
  const image = sharp(fileURLToPath(new URL(`../public${url}`, import.meta.url)));
  // Compare rendered pixels against the exact extracted client sprite.
  const original = sharp(fileURLToPath(new URL(`../.cache/restored-game-icons/${icon.code}.png`, import.meta.url)));
  const flatten = (source) => source.flatten({ background: "#ffffff" }).raw().toBuffer();
  assert.deepEqual(await flatten(image), await flatten(original), icon.code);
  if (icon.nationTypeId) {
    assert.equal(data.gameIcons.nations[icon.nationTypeId], url);
    const rows = data.rows.filter((row) => row.nationTypeId === icon.nationTypeId);
    assert.equal(rows.length, expectedCounts[icon.nationTypeId]);
    for (const row of rows) {
      assert.equal(row.nation, icon.nation);
      assert.equal(row.nationIcon, url, `${row.tank} must use the shared sprite`);
    }
  } else assert.equal(data.magicProgression.markIcons[icon.markKind], url);
}
assert.equal(data.rows.filter((row) => row.nation && !row.nationIcon).length, 0);
assert.deepEqual(applyRestoredGameIcons(structuredClone(data), icons), data, "reapplying the asset update must be idempotent");
// The updater may change only nation/mark image references, never calculations.
const stripped = (input) => {
  const copy = structuredClone(input);
  delete copy.gameIcons.nations;
  delete copy.magicProgression.markIcons;
  for (const row of copy.rows) delete row.nationIcon;
  return copy;
};
assert.deepEqual(stripped(applyRestoredGameIcons(structuredClone(data), icons)), stripped(data));
console.log(JSON.stringify({ icons: 5, affectedVehicles: 13, totalVehicles: data.rows.length, missingNationIcons: 0, pixelComparison: "exact" }));
