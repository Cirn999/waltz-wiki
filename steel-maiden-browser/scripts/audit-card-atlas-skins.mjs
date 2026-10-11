import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { atlasSkinStorageKey } from "../app/cardAtlasSkins.ts";
import { cardSkinFraming, defaultCardArtFraming } from "../app/cardAtlasFraming.ts";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/card-atlas-skins");
await fs.mkdir(cache, { recursive: true });
const skins = JSON.parse(await fs.readFile(path.join(root, "public/data/maiden-skins.json"), "utf8"));
const portraits = JSON.parse(await fs.readFile(path.join(root, "public/data/table-portraits.json"), "utf8"));
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const url = process.argv[2] || "http://127.0.0.1:3173";
const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const nav = async (name) => {
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: new RegExp(name) }).click();
};
const search = async (id) => {
  await page.locator(".search-box input").fill(rows.find((row) => row.id === id).tank);
  await page.locator(".search-box button").click();
};
const entry = (id = 7002) => page.locator(`.atlas-entry[data-maiden-id="${id}"]`);
const menu = () => page.getByRole("menu", { name: /皮肤$/ });
const open = async (id = 7002) => { await entry(id).locator("button").click({ button: "right" }); await menu().waitFor(); };
const mode = async (name) => page.getByRole("button", { name, exact: true }).click();
const screenshot = async (name) => {
  await page.locator(".card-atlas").evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((img) => img.decode())); });
  await page.screenshot({ path: path.join(cache, `${name}.png`), fullPage: true });
};
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await nav("卡牌图鉴"); await search(7002);
  await open();
  assert.equal(await menu().getByRole("menuitemradio").count(), 4);
  await page.screenshot({ path: path.join(cache, "menu.png") });
  await page.keyboard.press("Escape");
  assert.equal(await menu().count(), 0);
  assert.equal(await entry().locator("button").evaluate((button) => button === document.activeElement), true);
  await page.keyboard.press("Shift+F10"); await menu().waitFor();
  await page.keyboard.press("End");
  assert.equal(await page.locator(":focus").innerText(), skins.rows[7002].at(-1).name);
  await page.keyboard.press("Escape");

  for (const [index, skin] of skins.rows[7002].entries()) {
    await open(); await menu().getByRole("menuitemradio", { name: skin.name, exact: true }).click();
    assert.equal(await menu().count(), 0);
    assert.equal(await page.getByRole("dialog").count(), 0, "Skin selection must not open detail");
    assert.equal(await entry().getAttribute("data-skin-id"), String(skin.id));
    assert.equal(await entry().locator(".atlas-hero").getAttribute("src"), skin.image);
    const framing = await entry().locator(".atlas-card-face").evaluate((element) => element.style.getPropertyValue("--atlas-hero-height"));
    assert.equal(framing, `${(cardSkinFraming(skin.modelId) ?? defaultCardArtFraming).height}%`, "Use the skin model's own placement");
    await screenshot(`portrait-${index + 1}`);
    await mode("方形头像");
    assert.equal(await entry().locator(".table-portrait-head").getAttribute("src"), skin.headImage);
    for (const selector of [".table-portrait-frame", ".table-portrait-rarity", ".table-portrait-mask", ".table-portrait-class", ".table-portrait-cost"]) assert.equal(await entry().locator(selector).count(), 1);
    await screenshot(`avatar-${index + 1}`);
    await open();
    assert.equal(await menu().getByRole("menuitemradio", { name: skin.name, exact: true }).getAttribute("aria-checked"), "true");
    await page.keyboard.press("Escape");
    await mode("竖版卡牌");
    assert.equal(await entry().locator(".atlas-hero").getAttribute("src"), skin.image);
  }
  // A second vehicle must have an independent preference.
  await search(6015); await open(6015);
  await menu().getByRole("menuitemradio", { name: skins.rows[6015][0].name, exact: true }).click();
  await search(7002);
  assert.equal(await entry().getAttribute("data-skin-id"), String(skins.rows[7002].at(-1).id));
  await page.reload({ waitUntil: "networkidle" }); await nav("卡牌图鉴"); await search(7002);
  assert.equal(await entry().getAttribute("data-skin-id"), String(skins.rows[7002].at(-1).id));
  await mode("方形头像"); await open();
  await menu().getByRole("menuitemradio", { name: skins.rows[7002][0].name, exact: true }).click();
  assert.equal(await entry().locator(".table-portrait-head").getAttribute("src"), skins.rows[7002][0].headImage);
  await mode("竖版卡牌");
  assert.equal(await entry().locator(".atlas-hero").getAttribute("src"), skins.rows[7002][0].image);
  await entry().locator("button").click();
  const detail = page.getByRole("dialog", { name: `${rows.find((row) => row.id === 7002).tank} 详细档案`, exact: true });
  await detail.waitFor(); await detail.getByRole("button", { name: "关闭", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 640 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await entry().evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 386, clientY: 636, button: 2 })));
  await menu().waitFor();
  const rect = await menu().boundingBox();
  await page.screenshot({ path: path.join(cache, "mobile-menu.png") });
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 390 && rect.y + rect.height <= 640, JSON.stringify(rect));
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 960 });
  await open(); await page.locator(".search-box input").click(); assert.equal(await menu().count(), 0);
  await open(); await menu().getByRole("menuitemradio", { name: "默认立绘", exact: true }).click();
  assert.equal(await entry().locator(".atlas-hero").getAttribute("src"), rows.find((row) => row.id === 7002).image);
  await mode("方形头像"); assert.equal(await entry().locator(".table-portrait-head").getAttribute("src"), portraits.rows[7002]);
  const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), atlasSkinStorageKey));
  assert.equal(stored[7002], undefined); assert.equal(stored[6015], skins.rows[6015][0].id);
  const noSkin = rows.find((row) => row.implemented && !skins.rows[row.id]);
  await search(noSkin.id); await entry(noSkin.id).locator("button").click({ button: "right" }); assert.equal(await menu().count(), 0);

  // Verify failure/retry without relying on a warmed module-level data cache.
  const failure = await context.newPage();
  await failure.route("**/data/maiden-skins.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await failure.goto(url, { waitUntil: "networkidle" });
  const group = failure.locator(".primary-nav-group").filter({ has: failure.getByRole("button", { name: "钢舞姬", exact: true }) });
  const failedResponse = failure.waitForResponse((response) => response.url().endsWith("/data/maiden-skins.json") && response.status() === 503);
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await failedResponse;
  await failure.locator('.atlas-entry[data-maiden-id="6015"] button').scrollIntoViewIfNeeded();
  await failure.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await failure.locator('.atlas-entry[data-maiden-id="6015"] button').click({ button: "right" });
  const retry = failure.getByRole("menuitem", { name: "重新加载" }); await retry.waitFor();
  await failure.unroute("**/data/maiden-skins.json"); await retry.click();
  await failure.getByRole("menuitemradio", { name: skins.rows[6015][0].name, exact: true }).waitFor();
  await failure.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ modes: 2, skinsCycled: 3, independentSelections: true, persisted: true, defaultRestored: true, avatarLayersPreserved: true, keyboard: true, viewportClamped: true, loadRetry: true, errors }, null, 2));
} finally { await browser.close(); }
