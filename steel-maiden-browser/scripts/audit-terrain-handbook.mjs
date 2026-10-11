import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { handbookTerrains, matchesTerrain } from "../app/terrainHandbook.ts";

const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(await fs.readFile(path.join(root, "public/data/stage-catalog.json"), "utf8"));
const expected = handbookTerrains(catalog.terrains);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const baseUrl = process.argv[2] || "http://127.0.0.1:56501";
const openTerrain = async (page) => {
  await page.getByRole("button", { name: "手册", exact: true }).click();
  await page.getByRole("menuitem", { name: /^地形/ }).click();
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  let stageRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().endsWith("/data/stage-catalog.json")) stageRequests++; });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(stageRequests, 0, "Terrain data is loaded on demand");
  await openTerrain(page);
  await page.locator(".terrain-card").first().waitFor();
  assert.equal(await page.locator(".primary-nav-trigger.active > span").innerText(), "手册");
  assert.equal(await page.locator(".control-panel").count(), 0, "Terrain page does not show maiden filters");
  const cards = page.locator(".terrain-card");
  assert.equal(await cards.count(), expected.length);
  const checkCards = async (perspective) => {
    const expected = handbookTerrains(catalog.terrains, perspective);
    const actual = await cards.evaluateAll((elements) => elements.map((element) => ({
    ids: element.dataset.terrainIds.split(",").map(Number),
    name: element.querySelector("h2").textContent,
    image: element.querySelector(".terrain-icons img").getAttribute("src"),
    range: element.querySelector(".terrain-combat-range").dataset.values.split(",").map(Number),
    rangeIcon: element.querySelector(".terrain-range-label img").getAttribute("src"),
    effects: [...element.querySelectorAll(".terrain-effect-list li")].map((effect) => ({ name: effect.querySelector("h4").textContent, description: effect.querySelector("p").textContent, image: effect.querySelector("img").getAttribute("src") })),
    })));
    assert.deepEqual(actual, expected.map((terrain) => ({ ...terrain, effects: terrain.effects.map(({ name, description, image }) => ({ name, description, image })) })));
    assert.equal(await page.locator(".terrain-icons img").count(), expected.length, "Exactly one terrain icon per card, including spores");
    assert.equal(await page.locator(`.terrain-combat-range[data-kind="${perspective === "air" ? "altitude" : "distance"}"]`).count(), expected.length);
    await page.locator(".terrain-card img").evaluateAll(async (images) => { for (const image of images) image.loading = "eager"; await Promise.all(images.map((image) => image.decode())); });
  };
  await checkCards("ground");
  const search = page.getByRole("searchbox", { name: "搜索地形", exact: true });
  for (const query of ["草地", "广阔", "炮击", "山脉 雪地", "孢子", "不存在的地形"]) {
    await search.fill(query);
    const ids = await cards.evaluateAll((elements) => elements.map((element) => Number(element.dataset.terrainIds.split(",")[0])));
    assert.deepEqual(ids, expected.filter((row) => matchesTerrain(row, query)).map((row) => row.ids[0]));
  }
  await page.getByRole("heading", { name: "没有符合条件的地形", exact: true }).waitFor();
  await page.locator(".terrain-empty").getByRole("button", { name: "清除搜索", exact: true }).click();
  assert.equal(await cards.count(), expected.length);
  await fs.mkdir(path.join(root, ".cache/terrain-handbook"), { recursive: true });
  const checkGeometry = async () => {
    const issues = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push("page overflow");
      for (const element of document.querySelectorAll(".terrain-card,.terrain-card-heading,.terrain-effect-list li")) {
        if (element.scrollWidth > element.clientWidth + 1) issues.push(`clipped content: ${element.className}`);
      }
      return [...new Set(issues)];
    });
    assert.deepEqual(issues, []);
  };
  for (const [perspective, label] of [["ground", "陆钢"], ["air", "空钢"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.locator(".terrain-archive").getAttribute("data-perspective"), perspective);
    await checkCards(perspective);
    if (perspective === "air") {
      await search.fill("草地丘陵");
      assert.equal(await cards.count(), 1);
      assert.deepEqual(await cards.locator(".terrain-effect-list h4").allTextContents(), ["干燥", "静电", "风阻"]);
      assert.deepEqual(await cards.locator(".terrain-effect-list img").evaluateAll((images) => images.map((image) => image.getAttribute("src"))), ["tjsx-020", "tjsx-078", "tjsx-077"].map((icon) => `/art/stages/${icon}.webp`));
      await page.setViewportSize({ width: 1440, height: 1000 });
      await cards.screenshot({ path: path.join(root, ".cache/terrain-handbook/air-grass-hills.png") });
      await search.fill("干燥");
      assert.equal(await cards.count(), handbookTerrains(catalog.terrains, "air").filter((row) => matchesTerrain(row, "干燥")).length);
      await search.fill("晴天");
      assert.equal(await cards.count(), 0, "Legacy weather title must not leak into aircraft search");
      await search.fill("");
    }
    for (const width of [1440, 1152, 980, 768, 720, 620, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await checkGeometry();
      assert.ok(await cards.evaluateAll((elements) => elements.every((element) => {
        const name = element.querySelector("h2").getBoundingClientRect();
        const range = element.querySelector(".terrain-combat-range").getBoundingClientRect();
        return range.left >= name.right && range.top < name.bottom && range.bottom > name.top;
      })), "Combat distance/altitude stays to the right of the terrain name");
      if ([1440, 390].includes(width)) {
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: path.join(root, `.cache/terrain-handbook/${perspective}-${width}.png`) });
      }
    }
  }
  await search.fill("深寒");
  assert.equal(await cards.count(), handbookTerrains(catalog.terrains, "air").filter((row) => matchesTerrain(row, "深寒")).length);
  await page.getByRole("button", { name: "陆钢", exact: true }).click();
  assert.equal(await cards.count(), 0, "Search uses only the selected scope's effects");
  await search.fill("孢子");
  assert.equal(await cards.count(), 2);
  assert.equal(await page.locator(".terrain-icons img").count(), 2);
  await search.fill("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.body.style.zoom = "1.25"; }); await checkGeometry();
  await page.evaluate(() => { document.body.style.zoom = ""; });
  await page.getByRole("button", { name: "关卡", exact: true }).click();
  await page.getByRole("menuitem", { name: /^关卡一览/ }).click();
  await page.locator(".stage-category").first().waitFor();
  await openTerrain(page); await cards.first().waitFor();
  assert.equal(stageRequests, 1, "Terrain and stage views share the cached catalog");
  assert.deepEqual(errors, []);

  const retryPage = await browser.newPage();
  let failures = 0;
  await retryPage.route("**/data/stage-catalog.json", (route) => failures++ === 0 ? route.fulfill({ status: 503, body: "temporarily unavailable" }) : route.continue());
  await retryPage.goto(baseUrl, { waitUntil: "networkidle" }); await openTerrain(retryPage);
  await retryPage.getByRole("heading", { name: "地形加载失败", exact: true }).waitFor();
  await retryPage.getByRole("button", { name: "重试加载", exact: true }).click();
  await retryPage.locator(".terrain-card").first().waitFor();
  assert.equal(await retryPage.locator(".terrain-card").count(), expected.length);
  console.log(JSON.stringify({ groundCards: expected.length, airCards: 37, oneSporeIcon: true, switchEffectsAndRanges: true, rangesRightOfName: true, completeDataAndImages: true, search: true, responsive: true, zoom125: true, navigation: true, sharedCatalog: true, retry: true, errors }, null, 2));
} finally { await browser.close(); }
