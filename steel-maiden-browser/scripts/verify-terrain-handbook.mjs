import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { handbookTerrains, matchesTerrain } from "../app/terrainHandbook.ts";
import { loadStageCatalog } from "../app/stageCatalogData.ts";

const catalog = JSON.parse(await fs.readFile(new URL("../public/data/stage-catalog.json", import.meta.url), "utf8"));
const before = JSON.stringify(catalog.terrains);
const rows = handbookTerrains(catalog.terrains);
assert.equal(rows.length, 35);
const airRows = handbookTerrains(catalog.terrains, "air");
assert.equal(airRows.length, 37, "Retain two same-name aircraft effect variants");
for (const [perspective, entries] of [["ground", rows], ["air", airRows]]) {
  assert.equal(entries.flatMap((row) => row.ids).length, 39);
  assert.deepEqual(entries.flatMap((row) => row.ids).sort((a, b) => a - b), Object.values(catalog.terrains).map((row) => row.id).sort((a, b) => a - b));
  for (const row of entries) {
    for (const id of row.ids) {
      const source = catalog.terrains[id];
      assert.equal(row.name, source.name);
      assert.ok(!row.name.includes("·"), "Use native terrain name order without separators");
      assert.deepEqual(row.effects, perspective === "air" ? source.airEffects : source.effects);
      assert.deepEqual(row.range, perspective === "air" ? source.altitudes : source.distances);
      assert.equal(row.rangeIcon, perspective === "air" ? source.altitudeIcon : source.distanceIcon);
    }
    assert.equal(row.image, catalog.terrains[row.ids[0]].image, "Exactly one representative terrain image");
    for (const image of [row.image, row.rangeIcon, ...row.effects.map((effect) => effect.image)]) {
      assert.ok(image.startsWith("/art/stages/"));
      await fs.access(new URL(`../public${image}`, import.meta.url));
    }
  }
}
assert.deepEqual(rows.find((row) => row.ids.includes(8)).ids, [8, 51]);
assert.deepEqual(rows.find((row) => row.ids.includes(30)).ids, [30, 53]);
assert.equal(rows.find((row) => row.ids.includes(30)).image, "/art/stages/pvp-135.webp", "Spore terrain uses one representative image");
assert.deepEqual(airRows.find((row) => row.ids.includes(30)).ids, [30, 53]);
assert.deepEqual(airRows.find((row) => row.ids.includes(51)).ids, [51]);
assert.equal(new Set(rows.flatMap((row) => row.effects.map((effect) => effect.name))).size, 18);
assert.equal(new Set(airRows.flatMap((row) => row.effects.map((effect) => effect.name))).size, 17);
assert.equal(catalog.terrains[1].name, "草地平原");
assert.equal(catalog.terrains[6].name, "岩地巷战");
assert.deepEqual(catalog.terrains[1].airEffects.map((effect) => effect.name), ["干燥", "深寒", "风偏"]);
const hills = Object.values(catalog.terrains).find((terrain) => terrain.name === "草地丘陵");
assert.deepEqual(hills.airEffects.map((effect) => effect.name), ["干燥", "静电", "风阻"]);
const canyon = Object.values(catalog.terrains).find((terrain) => terrain.name === "岩地裂谷");
assert.deepEqual(canyon.airEffects.map((effect) => effect.name), ["夜幕", "积云", "电波", "湍流"]);
assert.equal(catalog.terrains[4].effects.find((effect) => effect.name === "风沙").description, "整个战斗过程中受到伤害有所提升");
// Independently transcribed from aircraft MANUAL 701279 / 701281, including
// exact image codes. ENV/ANTI wording and images are not the help-page display.
const aircraftDefinitions = [
  [180, "深寒", "tjsx-079", "每个阶段开始前，都有一定概率攻击失败"],
  [181, "风偏", "tjsx-066", "整个战斗过程中命中有所下降"],
  [182, "湍流", "tjsx-071", "每个阶段开始前，都有一定概率攻击失败"],
  [183, "电波", "tjsx-073", "整个战斗过程中隐蔽大幅下降"],
  [184, "静电", "tjsx-078", "每个阶段行动结束后，都有一定概率削减HP"],
  [185, "风阻", "tjsx-077", "从接近阶段开始之后回避大幅下降"],
  [186, "植被", "tjsx-026", "整个战斗过程中武器的对地效能有所下降"],
  [187, "地障", "tjsx-068", "每个阶段开始前，都有一定概率攻击失败"],
  [188, "干燥", "tjsx-020", "整个战斗过程中阻燃性能大幅下降"],
  [189, "雨幕", "tjsx-070", "整个战斗过程中侦察大幅下降"],
  [190, "浸蚀", "tjsx-075", "整个战斗过程中装甲有所下降"],
  [191, "积冰", "tjsx-076", "整个战斗过程中火力有所下降"],
  [192, "低温", "tjsx-074", "整个战斗过程中受到伤害有所提升"],
  [193, "风沙", "tjsx-017", "整个战斗过程中受到伤害有所提升"],
  [194, "昏暗", "tjsx-072", "整个战斗过程中命中有所下降"],
  [195, "夜幕", "tjsx-069", "整个战斗过程中命中有所下降"],
  [196, "积云", "tjsx-067", "整个战斗过程中更容易受到暴击"],
];
// Keep field membership from the independent ENV_ITEM audit, not its old
// ENV prose. Do not replace special variants with generic manual examples.
const evidence = JSON.parse(await fs.readFile(new URL("../../analysis_apk/terrain_debuff_research/evidence.json", import.meta.url), "utf8"));
for (const terrain of Object.values(catalog.terrains)) {
  const expected = evidence.effects.filter((effect) => effect.scope === "air" && effect.fields.includes(terrain.id));
  assert.deepEqual(terrain.airEffects.map((effect) => effect.styleId).sort(), expected.map((effect) => effect.styleId).sort());
  for (const effect of terrain.airEffects) {
    const [id, name, icon, description] = aircraftDefinitions.find(([id]) => id === effect.styleId);
    assert.deepEqual([effect.styleId, effect.name, effect.image, effect.description], [id, name, `/art/stages/${icon}.webp`, description]);
    assert.equal(effect.nameSource, "MANUAL");
    assert.equal(effect.iconSource, "MANUAL");
    assert.equal(effect.descriptionSource, "MANUAL");
    assert.ok([701279, 701281].includes(effect.descriptionStringId));
    assert.equal(effect.nameStringId, effect.descriptionStringId);
  }
}
assert.equal(JSON.stringify(catalog.terrains), before, "Grouping does not change the source data");
assert.deepEqual(handbookTerrains({}), []);
assert.equal(handbookTerrains({ a: catalog.terrains[1], b: { ...catalog.terrains[1], id: 100, effects: [] } }).length, 2, "Do not merge a same-name terrain with different effects");
assert.equal(handbookTerrains({ a: catalog.terrains[1], b: { ...catalog.terrains[1], id: 100, distances: [1, 2, 3] } }).length, 2, "Do not merge different battle distances");
assert.ok(matchesTerrain(rows[0], "草地 广阔"));
assert.ok(matchesTerrain(rows[0], "  炮击  火力  "));
assert.ok(matchesTerrain(rows[0], " "));
assert.ok(!matchesTerrain(rows[0], "冻结"));

// Errors can retry; successful stage/handbook visits reuse the same request.
const originalFetch = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = async () => { requests++; return new Response("offline", { status: 503 }); };
  await assert.rejects(loadStageCatalog(), /503/);
  globalThis.fetch = async () => { requests++; return Response.json({ schemaVersion: 1 }); };
  await assert.rejects(loadStageCatalog(), /格式不完整/);
  globalThis.fetch = async () => { requests++; return Response.json(catalog); };
  const [one, two] = await Promise.all([loadStageCatalog(), loadStageCatalog()]);
  assert.strictEqual(one, two);
  assert.strictEqual(await loadStageCatalog(), one);
  assert.equal(requests, 3);
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ terrainConfigurations: 39, groundCards: rows.length, airCards: airRows.length, groundEffects: 18, airEffects: 17, nativeNames: true, nativeAircraftManual: true, oneTerrainIcon: true, independentScopeEvidence: true, ranges: true, search: true, sharedLoadingAndRetry: true }));
