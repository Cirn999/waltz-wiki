import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(baseUrl, { waitUntil: "networkidle" });

if (await page.locator(".hero").count()) throw new Error("Promotional hero is still present");
await page.locator(".table-archive").waitFor();
if (!(await page.locator(".primary-nav-trigger.active").innerText()).includes("钢舞姬")) throw new Error("Default navigation group is not 钢舞姬");

const maidenGroup = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
await maidenGroup.locator(".primary-nav-trigger").hover();
await maidenGroup.locator(".primary-nav-menu").waitFor();
const maidenItems = await maidenGroup.locator(".primary-nav-menu b").allTextContents();
assert.deepEqual(maidenItems, ["属性表", "卡牌图鉴", "研发配方", "研发路线"]);
assert.deepEqual(await page.locator(".primary-nav-trigger > span").allTextContents(), ["钢舞姬", "手册", "关卡", "攻略链接"]);
await maidenGroup.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
await page.locator(".cards-archive.archive-visible").waitFor();
assert.equal(await page.locator(".control-panel").count(), 1);

async function openSection(groupName, itemName) {
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: groupName, exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  const item = group.getByRole("menuitem", { name: new RegExp(`^${itemName}`), includeHidden: true });
  await item.click();
  assert.equal(await page.locator(".primary-nav-trigger.active > span").innerText(), groupName);
  assert.match(await item.getAttribute("class"), /active/);
  assert.equal(await page.locator(".control-panel").count(), ["属性表", "卡牌图鉴"].includes(itemName) ? 1 : 0);
}
await openSection("钢舞姬", "研发配方");
await page.locator(".research-archive").waitFor();
await page.getByRole("heading", { name: "研发配方", exact: true }).waitFor();
await openSection("钢舞姬", "研发路线");
await page.locator(".research-graph-archive, .research-chain-mode .chain-archive").first().waitFor();
await page.getByRole("heading", { name: "研发路线", exact: true }).waitFor();

const manualItems = await page.locator("#manual-section-menu b").allTextContents();
assert.deepEqual(manualItems, ["装备", "科技", "任务", "道具", "地形"]);
await openSection("手册", "装备");
await page.locator(".equipment-atlas").waitFor();
await openSection("手册", "科技");
await page.locator(".technology-mode").waitFor();
await openSection("手册", "任务");
await page.locator(".task-table").waitFor();
await openSection("手册", "地形");
await page.locator(".terrain-card").first().waitFor();

const stageItems = await page.locator("#stage-section-menu b").allTextContents();
assert.deepEqual(stageItems, ["关卡一览", "收益一览", "剧情一览"]);
await openSection("关卡", "关卡一览");
await page.locator(".stage-category").first().waitFor();
await openSection("关卡", "收益一览");
await page.locator(".stage-yield-overview").waitFor();
await openSection("关卡", "剧情一览");
await page.getByRole("heading", { name: "剧情一览", exact: true }).waitFor();
await page.getByRole("button", { name: "浏览战役剧情", exact: true }).click();
await page.getByRole("searchbox", { name: "搜索剧情关卡" }).fill("不存在的剧情关卡");
assert.equal(await page.locator(".story-map-card").count(), 0);
await page.getByRole("button", { name: "清除筛选", exact: true }).click();
assert.ok(await page.locator(".story-map-card").count() > 0, "Story-specific filters remain functional");
assert.equal(await page.locator(".control-panel").count(), 0, "Story has no maiden filters");

await openSection("钢舞姬", "属性表");
await page.locator(".table-archive").waitFor();

await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const desktopPath = path.join(appRoot, ".cache", "primary-navigation-desktop.png");
await maidenGroup.locator(".primary-nav-trigger").hover();
await maidenGroup.locator(".primary-nav-menu").evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {}))));
await page.screenshot({ path: desktopPath, fullPage: false });

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
await maidenGroup.locator(".primary-nav-trigger").click();
const mobileMenu = maidenGroup.locator(".primary-nav-menu");
await mobileMenu.waitFor();
const mobileBox = await mobileMenu.boundingBox();
if (!mobileBox || mobileBox.x < 0 || mobileBox.x + mobileBox.width > 390) throw new Error(`Mobile menu exceeds viewport: ${JSON.stringify(mobileBox)}`);
const mobilePath = path.join(appRoot, ".cache", "primary-navigation-mobile.png");
await page.screenshot({ path: mobilePath, fullPage: false });

const guideLinks = [
  ["钢铁华尔兹BWIKI", "https://wiki.biligame.com/metalwaltz/%E9%A6%96%E9%A1%B5"],
  ["钢舞姬评分表", "https://wiki.biligame.com/metalwaltz/%E9%92%A2%E8%88%9E%E5%A7%AC%E8%AF%84%E5%88%86%E8%A1%A8"],
  ["新车评测", "https://wiki.biligame.com/metalwaltz/%E8%BD%A6%E8%BE%86%E8%AF%84%E6%B5%8B"],
  ["外服WIKI", "https://www.metalmaidendepot.ovh/"],
  ["日服WIKI", "https://seesaawiki.jp/metalwaltz/"],
];
// Test actual new-tab navigation locally without depending on BWIKI uptime.
await context.route("https://wiki.biligame.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External link test</title>" }));
for (const pattern of ["https://www.metalmaidendepot.ovh/**", "https://seesaawiki.jp/**"]) {
  await context.route(pattern, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External link test</title>" }));
}
const guides = page.locator(".primary-nav-guides");
for (const width of [1440, 1280, 980, 768, 620, 390, 320]) {
  console.log(`Checking navigation at ${width}px`);
  await page.setViewportSize({ width, height: 900 });
  for (const groupName of ["钢舞姬", "手册", "关卡"]) {
    const trigger = page.getByRole("button", { name: groupName, exact: true });
    await trigger.hover();
    const menu = page.locator(`#${await trigger.getAttribute("aria-controls")}`);
    await menu.waitFor();
    await menu.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {}))));
    const box = await menu.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${groupName} menu fits ${width}: ${JSON.stringify(box)}`);
  }
  await guides.locator(".primary-nav-trigger").hover();
  await guides.locator(".primary-nav-menu").waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".primary-nav-menu")].filter((el) => getComputedStyle(el).visibility === "visible").length === 1);
  if (await page.locator(".primary-nav-menu:visible").count() !== 1) throw new Error("Only the current navigation menu should be visible");
  const bounds = await page.locator(".primary-nav-trigger").evaluateAll((elements) => elements.map((el) => {
    const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width };
  }));
  if (bounds.some((b) => b.left < 0 || b.right > width)) throw new Error(`Navigation overflows at ${width}: ${JSON.stringify(bounds)}`);
  const menuBox = await guides.locator(".primary-nav-menu").boundingBox();
  if (!menuBox || menuBox.x < 0 || menuBox.x + menuBox.width > width) throw new Error(`Guide menu overflows at ${width}: ${JSON.stringify(menuBox)}`);
  if (width === 1440 || width === 390) await page.screenshot({ path: path.join(appRoot, ".cache", `guide-links-${width}.png`) });
}
await page.setViewportSize({ width: 1440, height: 900 });
const originalUrl = page.url();
const originalRows = await page.locator(".maiden-table tbody tr").count();
for (const [label, href] of guideLinks) {
  console.log(`Checking new-tab link: ${label}`);
  await guides.locator(".primary-nav-trigger").hover();
  const link = guides.getByRole("menuitem", { name: new RegExp(label) });
  if (await link.getAttribute("href") !== href || await link.getAttribute("target") !== "_blank") throw new Error(`Wrong link: ${label}`);
  if (!(await link.getAttribute("rel")).includes("noopener")) throw new Error(`Unsafe opener: ${label}`);
  const popupPromise = page.waitForEvent("popup");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  if (popup.url() !== href || !(await popup.evaluate(() => window.opener === null))) throw new Error(`Incorrect new tab: ${label}`);
  if (page.url() !== originalUrl || await page.locator(".maiden-table tbody tr").count() !== originalRows) throw new Error("External link replaced or reset the archive page");
  await popup.close();
}
const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const touchPage = await touchContext.newPage();
await touchPage.goto(baseUrl, { waitUntil: "networkidle" });
for (const [group, item, content] of [["手册", "装备", ".equipment-atlas"], ["关卡", "剧情一览", ".story-archive"], ["钢舞姬", "研发配方", ".research-archive"], ["钢舞姬", "属性表", ".table-archive"]]) {
  console.log(`Checking touch navigation: ${group} / ${item}`);
  await touchPage.getByRole("button", { name: group, exact: true }).tap();
  await touchPage.getByRole("menuitem", { name: new RegExp(`^${item}`) }).tap();
  await touchPage.locator(content).waitFor();
  assert.equal(await touchPage.locator(".primary-nav-trigger.active > span").innerText(), group);
}
await touchPage.getByRole("button", { name: "攻略链接", exact: true }).tap();
await touchPage.locator("#guide-links-menu").waitFor();
if (await touchPage.locator("#guide-links-menu a").count() !== guideLinks.length) throw new Error("Touch guide links missing");
await touchContext.close();

assert.deepEqual(errors, []);
console.log(JSON.stringify({ maidenItems, manualItems, stageItems, guideLinks, newTabsVerified: true, touchVerified: true, storyFiltersRemoved: true, defaultView: "table", heroRemoved: true, desktopPath, mobilePath }, null, 2));
await browser.close();
