import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { cardNameLayout, cardRarityBackgrounds, orderedAtlasRows } from "../app/cardAtlasLayout.ts";
import { cardCostFrames, cardCostStyle, cardCostSprites, cardRarityLeft } from "../app/cardAtlasCost.ts";

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const original = rows.map((row) => row.id);
const ordered = orderedAtlasRows(rows);
assert.deepEqual(rows.map((row) => row.id), original, "Atlas sorting must not change table order");
assert.ok(ordered.every((row, index) => !index || row.id > ordered[index - 1].id));
const files = new Set(Object.values(cardCostFrames).map(frame => frame.image));
let multiline = 0;
for (const row of rows) {
  assert.ok(cardRarityBackgrounds[row.rarityId], `Unknown rarity: ${row.id}`);
  files.add(cardRarityBackgrounds[row.rarityId]);
  for (const field of ["image", "nationIcon", "classIcon", "rarityIcon"]) if (row[field]) files.add(row[field]);
  const cost = cardCostStyle(row.magicCostGroup);
  assert.ok(cost, `Unknown medal cost: ${row.id} ${row.magicCostGroup}`);
  const sprites = cardCostSprites(cost);
  assert.equal(sprites.filter(sprite => sprite.role === "star").length, cost.tier);
  assert.equal(sprites.filter(sprite => sprite.role === "modifier-sign").length, cost.modifier ? 1 : 0);
  assert.ok(Number.isFinite(cardRarityLeft(cost.metal, row.rarityIcon)));
  for (const sprite of sprites) files.add(sprite.image);
  const layout = cardNameLayout(row.tank);
  assert.equal(layout.lines.join("").replace(/\s/gu, ""), row.tank.replace(/\s/gu, ""));
  assert.ok(layout.lines.length <= 2 && layout.fontSize > 0 && Number.isFinite(layout.fontSize));
  if (layout.lines.length > 1) multiline++;
}
for (const file of files) await fs.access(new URL(`../public${file}`, import.meta.url));
assert.deepEqual(cardNameLayout("Sd.Kfz.251 Calliope").lines, ["Sd.Kfz.251", "Calliope"]);
assert.deepEqual(cardNameLayout("VBPA Centauro轮式自行火炮").lines, ["VBPA Centauro", "轮式自行火炮"]);
assert.deepEqual(cardNameLayout("谢尔曼m4a3火箱发射器型").lines, ["谢尔曼m4a3", "火箱发射器型"]);
assert.equal(cardNameLayout("谢尔曼Mk-I").lines.length, 1);
assert.deepEqual(cardNameLayout("象式坦克歼击车").lines, ["象式", "坦克歼击车"]);
assert.deepEqual(cardNameLayout("象式坦克歼击车", (text) => text.length * 1.1).lines, ["象式", "坦克歼击车"], "Approved semantic break must survive browser text measurement");
assert.deepEqual(cardNameLayout("斐迪南坦克歼击车").lines, ["斐迪南", "坦克歼击车"]);
const destroyers = rows.filter((row) => row.tank.endsWith("坦克歼击车") && row.tank.length > 5);
for (const row of destroyers) {
  const suffix = ["轻型坦克歼击车", "空降坦克歼击车", "坦克歼击车"].find((value) => row.tank.endsWith(value));
  assert.deepEqual(cardNameLayout(row.tank).lines, [row.tank.slice(0, -suffix.length).trimEnd(), suffix]);
}
console.log(JSON.stringify({ destroyerNames: destroyers.map(({ id, tank }) => ({ id, tank, lines: cardNameLayout(tank).lines })) }, null, 2));
console.log(JSON.stringify({ rows: rows.length, implemented: rows.filter((row) => row.implemented).length, assets: files.size, multiline, ascending: true, sourceOrderPreserved: true }, null, 2));
