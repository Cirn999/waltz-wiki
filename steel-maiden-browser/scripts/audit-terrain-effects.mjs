import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/stage-catalog.json"), "utf8"));
// Independently transcribed visible wording from the native manual (13),
// reviewed ENV definitions (4), and the 迟钝 ANTI status (1).
const expected = [
  [150, "广阔", "到炮击阶段结束为止火力大幅下降"],
  [151, "起伏", "从接近阶段开始之后回避大幅下降"],
  [152, "灌木", "整个战斗过程中火力有所下降"],
  [153, "突袭", "整个战斗过程中更容易受到暴击"],
  [154, "暴露", "整个战斗过程中隐蔽大幅下降"],
  [155, "积雪", "整个战斗过程中回避有所下降"],
  [156, "冻结", "整个战斗过程中受到伤害有所提升"],
  [157, "泥沼", "整个战斗过程中穿甲有所下降"],
  [158, "潮湿", "整个战斗过程中侦察大幅下降"],
  [159, "风沙", "整个战斗过程中受到伤害有所提升"],
  [160, "燥热", "整个战斗过程中阻燃性能大幅下降"],
  [161, "硬地", "整个战斗过程中装甲有所下降"],
  [162, "碎块", "整个战斗过程中命中有所下降"],
  [163, "涉水", "穿甲下降"],
  [164, "远隔", "命中与火力下降"],
  [165, "潮气", "阻燃上升"],
  [166, "昏睡", "每回合开火前有概率无法开火"],
  [167, "迟钝", "易被暴击"],
];
const byId = new Map();
assert.equal(Object.keys(data.terrains).length, 39);
for (const terrain of Object.values(data.terrains)) {
  assert.ok(terrain.effects.length > 0);
  assert.equal(new Set(terrain.effects.map((e) => e.styleId)).size, terrain.effects.length);
  for (const effect of terrain.effects) {
    assert.deepEqual([effect.styleId, effect.name, effect.description], expected.find(([id]) => id === effect.styleId));
    assert.ok(effect.nameStringId > 0 && effect.descriptionStringId > 0);
    assert.equal(effect.descriptionSource, effect.styleId < 163 ? "MANUAL" : effect.styleId === 167 ? "ANTI" : "ENV");
    if (effect.descriptionSource === "MANUAL") assert.equal(effect.descriptionStringId, 701256);
    assert.ok(!/[<>]/.test(effect.description));
    if (byId.has(effect.styleId)) assert.deepEqual(effect, byId.get(effect.styleId));
    byId.set(effect.styleId, effect);
    await fs.access(path.join(root, "public", effect.image));
  }
}
assert.equal(byId.size, 18);
assert.equal(data.terrains[1].name, "草地平原");
assert.equal(data.terrains[6].name, "岩地巷战");
assert.ok(Object.values(data.terrains).every((terrain) => !terrain.name.includes("·")));
assert.deepEqual(data.terrains[1].effects.map((e) => e.name), ["广阔"]);
assert.deepEqual(data.terrains[2].effects.map((e) => e.name), ["广阔", "积雪", "冻结"]);
assert.deepEqual(data.terrains[20].effects.map((e) => e.name), ["灌木", "风沙", "潮湿"]);
assert.deepEqual(data.terrains[21].effects.map((e) => e.name), ["起伏", "风沙", "潮湿"]);
assert.deepEqual(data.terrains[25].effects.map((e) => e.name), ["暴露", "涉水", "潮气"]);

const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(process.argv[2] || "http://127.0.0.1:3100", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
  await page.getByRole("menuitem", { name: /^关卡一览/ }).click();
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const fieldId of [1, 2, 6, 25, 30, 55]) {
    const map = data.maps.find((m) => !m.simulation && m.category !== "appendix" && m.nodes.some((id) => data.nodes[id].fieldId === fieldId));
    assert.ok(map, `Real map for terrain ${fieldId}`);
    const category = data.categories.find((c) => c.id === map.category);
    await page.getByRole("button", { name: `浏览${category.name}`, exact: true }).click();
    if (map.category === "event") await page.getByLabel("行动类型").selectOption(map.group);
    if (map.category === "campaign") await page.getByRole("button", { name: map.group, exact: true }).click();
    await page.getByLabel("搜索关卡").fill(map.name);
    await page.locator(".stage-map-card").filter({ hasText: map.name }).first().click();
    const dialog = page.locator(".stage-dialog");
    await dialog.locator(".stage-node-nav button").nth(map.nodes.findIndex((id) => data.nodes[id].fieldId === fieldId)).click();
    for (const width of [1440, 1152, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const panel = dialog.locator(".stage-terrain-panel");
      await panel.scrollIntoViewIfNeeded();
      assert.equal(await panel.locator(".stage-terrain-name h4").textContent(), data.terrains[fieldId].name);
      const shown = await panel.locator(".stage-effects>div").evaluateAll((rows) => rows.map((el) => [el.querySelector("b").textContent, el.querySelector("p").textContent]));
      assert.deepEqual(shown, data.terrains[fieldId].effects.map((e) => [e.name, e.description]));
      assert.ok(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `Terrain ${fieldId} at ${width}px fits`);
      await panel.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
      if ([1, 2, 30].includes(fieldId)) await panel.screenshot({ path: path.join(root, `.cache/terrain-${fieldId}-${width}.png`) });
    }
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, terrains: 39, uniqueEffects: byId.size, renderedTerrains: 6, widths: [1440, 1152, 390] }));
} finally {
  await browser.close();
}
