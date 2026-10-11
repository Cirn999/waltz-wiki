import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { cardCostFrames, cardCostGroups, cardCostSprites, cardCostStyle } from "../app/cardAtlasCost.ts";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/card-cost-style");
await fs.mkdir(cache, { recursive: true });
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "public/art/card-atlas/cost-style/manifest.json"), "utf8"));
const sampleIds = [6111, 6073, 6114, 6301, 6082, 6275, 6032, 6066, 6064, 6065, 6302, 6201, 6143];
const samples = sampleIds.map(id => rows.find(row => row.id === id));
assert.deepEqual(samples.map(row => row.magicCostGroup), [...cardCostGroups]);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter(name => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [], failedAssets = [], results = [], gallery = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (response.status() >= 400 && /\/art\//u.test(response.url())) failedAssets.push({ url: response.url(), status: response.status() });
});
const search = async row => {
  await page.locator(".search-box input").fill(row.tank);
  await page.locator(".search-box button").click();
};
async function check(row) {
  const card = page.locator(`.atlas-entry[data-maiden-id="${row.id}"] .atlas-card-face`);
  await card.scrollIntoViewIfNeeded();
  await card.evaluate(async element => {
    await Promise.all([...element.querySelectorAll("img")].map(image => image.decode()));
    await document.fonts.ready;
  });
  const cost = cardCostStyle(row.magicCostGroup), frame = cardCostFrames[cost.metal];
  assert.equal(await card.getAttribute("data-frame-metal"), cost.metal);
  assert.equal(await card.locator(".atlas-frame").getAttribute("src"), frame.image);
  assert.equal(await card.locator(".atlas-cost").getAttribute("aria-label"), `魔改费用 ${row.magicCostGroup}`);
  assert.equal(await card.locator(".atlas-cost").innerText(), "");
  assert.equal(await card.locator(".atlas-cost-glyph").count(), 0);
  const geometry = await card.evaluate((element, rarity) => {
    const box = element.getBoundingClientRect(), icon = element.querySelector(".atlas-rarity").getBoundingClientRect();
    const fit = Math.min(icon.width / rarity.width, icon.height / rarity.height);
    const wrapper = getComputedStyle(element.querySelector(".atlas-cost"));
    return {
      card: box.toJSON(),
      paintedRarityCenter: icon.left - box.left + icon.width / 2 + (rarity.visibleCenterX - rarity.width / 2) * fit,
      frameZ: getComputedStyle(element.querySelector(".atlas-frame")).zIndex,
      wrapperZ: wrapper.zIndex, wrapperFilter: wrapper.filter,
      sprites: [...element.querySelectorAll(".atlas-cost-sprite")].map(image => {
        const rect = image.getBoundingClientRect();
        return { image: image.getAttribute("src"), role: image.dataset.costRole,
          x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2,
          width: rect.width, height: rect.height, layer: Number(getComputedStyle(image).zIndex) };
      }),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  }, manifest.rarities[row.rarityIcon]);
  const scale = geometry.card.width / 1024, expected = cardCostSprites(cost);
  assert.equal(geometry.sprites.length, expected.length);
  assert.equal(geometry.sprites.filter(sprite => sprite.role === "star").length, cost.tier);
  assert.equal(geometry.frameZ, "4");
  assert.equal(geometry.wrapperZ, "auto");
  assert.equal(geometry.wrapperFilter, "none");
  assert.equal(geometry.overflow, false);
  assert.ok(Math.abs(geometry.paintedRarityCenter - frame.shoulderX * scale) < .1, "Chevrons must be centered on the shoulder board");
  geometry.sprites.forEach((actual, index) => {
    const sprite = expected[index];
    assert.equal(actual.image, sprite.image);
    assert.equal(actual.role, sprite.role);
    assert.equal(actual.layer, sprite.layer);
    for (const field of ["x", "y", "width", "height"]) assert.ok(Math.abs(actual[field] - sprite[field] * scale) < .1, `${row.magicCostGroup} ${sprite.role} ${field}`);
    assert.ok(actual.x - actual.width / 2 >= -.1 && actual.x + actual.width / 2 <= geometry.card.width + .1);
    assert.ok(actual.y - actual.height / 2 >= -.1 && actual.y + actual.height / 2 <= geometry.card.height + .1);
  });
  const ring = geometry.sprites.find(sprite => sprite.role === "modifier-ring");
  if (ring) for (const star of geometry.sprites.filter(sprite => sprite.role === "star")) {
    const nearX = Math.max(star.x - star.width / 2, Math.min(ring.x, star.x + star.width / 2));
    const nearY = Math.max(star.y - star.height / 2, Math.min(ring.y, star.y + star.height / 2));
    assert.ok(Math.hypot(ring.x - nearX, ring.y - nearY) >= Math.max(ring.width, ring.height) / 2 - .1, "Plaque overlaps a star");
  }
  results.push({ id: row.id, cost: cost.label, viewport: page.viewportSize().width, ...geometry });
  return card;
}
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3174", { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await page.mouse.move(0, 0);
  for (const row of samples) {
    await search(row);
    const card = await check(row);
    await card.screenshot({ path: path.join(cache, `${row.magicCostGroup}-${row.id}.png`) });
    gallery.push({ label: `${row.magicCostGroup} · ${row.tank}`, html: await card.evaluate(element => element.outerHTML) });
  }
  for (const width of [1920, 980, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const row of samples) { await search(row); await check(row); }
  }
  // Snapshot the actual rendered components together, not a second mockup implementation.
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.evaluate(gallery => {
    const main = document.createElement("main"); main.id = "cost-style-review";
    for (const { label, html } of gallery) {
      const cell = document.createElement("div"); cell.innerHTML = html;
      const caption = document.createElement("p"); caption.textContent = label; cell.append(caption); main.append(cell);
    }
    document.body.replaceChildren(main);
    for (const image of main.querySelectorAll("img")) image.loading = "eager";
  }, gallery);
  await page.addStyleTag({ content: "body{margin:0;background:#edf0e7!important}#cost-style-review{padding:22px;width:1120px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px 16px}#cost-style-review p{text-align:center;margin:6px 0 0;color:#25372e;font-size:12px}" });
  await page.locator("#cost-style-review").evaluate(async element => {
    await Promise.all([...element.querySelectorAll("img")].map(image => image.decode()));
    await document.fonts.ready;
  });
  await page.locator("#cost-style-review").screenshot({ path: path.join(cache, "all-thirteen.png") });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  await fs.writeFile(path.join(cache, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ groups: samples.length, checks: results.length, centeredShoulders: true, responsive: true, noStarOverlap: true, errors, failedAssets, output: cache }, null, 2));
} finally { await browser.close(); }
