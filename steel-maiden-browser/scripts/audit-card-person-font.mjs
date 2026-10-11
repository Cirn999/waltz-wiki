import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/card-person-font");
await fs.mkdir(cache, { recursive: true });
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const labels = JSON.parse(await fs.readFile(path.join(root, "public/data/card-person-labels.json"), "utf8"));
const targets = ["豹式G型", "猎虎"].map((tank) => rows.find((row) => row.tank === tank));
targets.push(rows.filter((row) => row.implemented).sort((a, b) => [...b.person].length - [...a.person].length)[0]);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const url = process.argv[2] || "http://127.0.0.1:3173";
try {
  await page.goto(url, { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable"); await session.send("CSS.enable");
  for (const maiden of targets) {
    assert.ok(maiden);
    await page.locator(".search-box input").fill(maiden.tank); await page.locator(".search-box button").click();
    const selector = `.atlas-entry[data-maiden-id="${maiden.id}"] .atlas-person-name`;
    await page.locator(selector).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const { root: dom } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: dom.nodeId, selector });
    const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
    assert.deepEqual(fonts, [], "Shipped name must not resolve to a device-dependent font");
    assert.equal(await page.locator(selector).getAttribute("src"), labels.rows[maiden.id].image);
    assert.equal(await page.locator(selector).getAttribute("alt"), maiden.person);
    assert.equal(await page.locator(selector).getAttribute("data-person-font"), "SimSun-cold-white");
    const card = page.locator(`.atlas-entry[data-maiden-id="${maiden.id}"]`);
    await card.evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); });
    await card.screenshot({ path: path.join(cache, `${maiden.id}.png`) });
    const before = await page.locator(selector).screenshot();
    const override = await page.addStyleTag({ content: ".atlas-person-name{font-family:Arial,sans-serif!important;font-weight:400!important}" });
    assert.deepEqual(await page.locator(selector).screenshot(), before, "Device font substitution must not change the visible name");
    await override.evaluate((element) => element.remove());
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.locator(selector).evaluate((element) => {
        const image = element.getBoundingClientRect(), box = element.parentElement.getBoundingClientRect();
        return image.left < box.left - 1 || image.right > box.right + 1 || image.top < box.top - 1 || image.bottom > box.bottom + 1;
      });
      assert.equal(overflow, false, `Clipped name: ${maiden.id}/${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const elephant = rows.find((row) => row.tank === "象式坦克歼击车");
  assert.ok(elephant);
  await page.locator(".search-box input").fill(elephant.tank); await page.locator(".search-box button").click();
  await page.getByRole("button", { name: "皮肤分散", exact: true }).click();
  const elephantCards = page.locator(`.atlas-entry[data-maiden-id="${elephant.id}"]`);
  assert.ok(await elephantCards.count() >= 2, "Inspect default and skin cards together");
  for (const card of await elephantCards.all()) assert.deepEqual(await card.locator(".atlas-name-line").allTextContents(), ["象式", "坦克歼击车"]);
  await page.locator(".atlas-album").evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); });
  await page.locator(".atlas-album").screenshot({ path: path.join(cache, "elephant-name-lines.png") });
  const destroyers = rows.filter((row) => row.implemented && row.tank.endsWith("坦克歼击车") && row.tank.length > 5);
  for (const maiden of destroyers) {
    await page.locator(".search-box input").fill(maiden.tank); await page.locator(".search-box button").click();
    const cards = page.locator(`.atlas-entry[data-maiden-id="${maiden.id}"]`);
    const suffix = ["轻型坦克歼击车", "空降坦克歼击车", "坦克歼击车"].find((value) => maiden.tank.endsWith(value));
    for (const card of await cards.all()) assert.deepEqual(await card.locator(".atlas-name-line").allTextContents(), [maiden.tank.slice(0, -suffix.length).trimEnd(), suffix]);
    if (maiden.id === 6301) {
      await cards.first().evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); });
      await cards.first().screenshot({ path: path.join(cache, "ferdinand-name-lines.png") });
    }
  }
  console.log(JSON.stringify({ samples: targets.map((row) => row.id), font: labels.font, deviceFontsIndependent: true, widths: [320, 390, 768, 1440, 1920], noNameClipping: true, semanticDestroyerNames: destroyers.length }, null, 2));
} finally { await browser.close(); }
