import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { calculateNodeIncome } from "../app/stageIncome.ts";
import { buildStageYieldRows, filterStageYieldRows, sortStageYieldRows } from "../app/stageYield.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/stage-catalog.json"), "utf8"));
function rowsAt(progress, score) { return buildStageYieldRows(data, Object.fromEntries(Object.values(data.nodes).map((node) => [node.id, calculateNodeIncome(node.income, data.income, { progress, score })]))); }
const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const url = process.argv[2] || "http://127.0.0.1:3101";
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  async function section(name) {
    await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
    await page.getByRole("heading", { name, exact: true }).waitFor();
  }
  await page.goto(url, { waitUntil: "networkidle" });
  await section("收益一览");
  const table = page.getByRole("table", { name: "战役捷径收益一览" });
  const global = page.locator(".stage-global-income");
  await table.locator("tbody tr[data-map-id]").first().waitFor();
  async function rowIds() { return table.locator("tbody tr[data-map-id]").evaluateAll((elements) => elements.map((el) => Number(el.dataset.mapId))); }
  async function checkValues(progress, score) {
    for (const expected of rowsAt(progress, score)) {
      const row = table.locator(`tr[data-map-id="${expected.map.id}"]`);
      for (const key of ["fuel", "silver", "codons", "silverPerFuel", "codonsPerFuel"]) {
        const text = await row.locator(`[data-column="${key}"]`).innerText();
        assert.equal(Number(text.replaceAll(",", "")), Number(expected[key].toFixed(key.endsWith("PerFuel") ? 2 : 0)), `${expected.map.code} ${key}`);
      }
    }
  }
  assert.deepEqual(await rowIds(), Array.from({ length: 28 }, (_, i) => i + 130));
  await global.getByLabel("收益通关进度").selectOption("96");
  await checkValues(96, 92);
  const nativeRows = rowsAt(96, 92);
  for (const [label, key] of [["燃油消耗", "fuel"], ["总银币收益", "silver"], ["总密码子收益", "codons"], ["银币 / 燃油", "silverPerFuel"], ["密码子 / 燃油", "codonsPerFuel"]]) {
    await table.getByRole("button", { name: `按${label}排序`, exact: true }).click();
    assert.deepEqual(await rowIds(), sortStageYieldRows(nativeRows, key, true).map((row) => row.map.id));
    await table.getByRole("button", { name: `按${label}排序`, exact: true }).click();
    assert.deepEqual(await rowIds(), sortStageYieldRows(nativeRows, key, false).map((row) => row.map.id));
  }
  await table.getByRole("button", { name: "按地图排序", exact: true }).click();
  await page.getByRole("button", { name: /^掉落装备筛选/ }).click();
  const filter = page.getByRole("region", { name: "掉落装备筛选", exact: true });
  assert.equal(await filter.getByRole("checkbox").count(), 78);
  await filter.getByLabel("查找掉落装备").fill("强化火药");
  assert.equal(await filter.getByRole("checkbox").count(), 3);
  await filter.getByRole("checkbox", { name: "强化火药（特殊）", exact: true }).check();
  assert.deepEqual(await rowIds(), filterStageYieldRows(nativeRows, ["fund:8171"], "").map((row) => row.map.id));
  assert.ok(!(await rowIds()).includes(130));
  await filter.getByLabel("查找掉落装备").fill("");
  await filter.getByLabel("筛选装备部位").selectOption("先战");
  await filter.getByRole("checkbox", { name: "车载热茶机（先战）", exact: true }).check();
  assert.deepEqual(await rowIds(), filterStageYieldRows(nativeRows, ["fund:8171", "fund:28505"], "").map((row) => row.map.id));
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  assert.equal(await table.locator("tbody tr[data-map-id]").count(), 28);
  await filter.getByLabel("查找掉落装备").fill("没有这种装备");
  assert.equal(await filter.getByRole("checkbox").count(), 0);
  await filter.getByRole("button", { name: "收起", exact: true }).click();
  await table.locator('tr[data-map-id="130"]').getByRole("button", { name: "筛选 强化火药（炮座）", exact: true }).click();
  assert.deepEqual(await rowIds(), filterStageYieldRows(nativeRows, ["fund:8172"], "").map((row) => row.map.id));
  await page.getByRole("button", { name: "移除筛选 强化火药（炮座）", exact: true }).click();
  await page.getByLabel("搜索收益地图或装备").fill("不存在的关卡");
  assert.match(await table.innerText(), /没有匹配/);
  await table.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.getByLabel("搜索收益地图或装备").fill("捷径28");
  assert.deepEqual(await rowIds(), [157]);
  await page.getByLabel("搜索收益地图或装备").fill("");
  // Details use the same global controls, not a second calculator.
  await table.getByRole("button", { name: /^查看捷径1 / }).click();
  const dialog = page.locator(".stage-dialog");
  assert.deepEqual((await dialog.locator('.stage-income-values b').allTextContents()).map((n) => Number(n.replaceAll(",", ""))), [2935, 18750, 186]);
  await dialog.getByLabel("收益通关进度").selectOption("0");
  await dialog.getByLabel("收益结算评价").selectOption("51");
  await page.keyboard.press("Escape");
  await checkValues(0, 51);
  assert.ok(await table.locator('.stage-yield-drop[data-eligible="false"]').count() > 0);
  assert.match(await table.innerText(), /当前不可掉落/);
  await section("关卡一览");
  assert.equal(await page.locator(".stage-category").count(), 6);
  assert.equal(await global.getByLabel("收益结算评价").inputValue(), "51");
  await section("收益一览");
  await checkValues(0, 51);
  await global.getByLabel("收益通关进度").selectOption("96");
  await global.getByLabel("收益结算评价").selectOption("92");
  await page.reload({ waitUntil: "networkidle" });
  await section("收益一览");
  assert.equal(await global.getByLabel("收益通关进度").inputValue(), "96");
  await checkValues(96, 92);
  await table.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => { img.loading = "eager"; return img.decode(); })));
  for (const width of [1440, 1152, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 1000 ? 950 : 760 });
    await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
    await page.locator("#stage-section-menu").evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {}))));
    const menuBox = await page.locator("#stage-section-menu").boundingBox();
    assert.ok(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width, `Stage submenu fits ${width}: ${JSON.stringify(menuBox)}`);
    await page.getByRole("menuitem", { name: /^收益一览/ }).click();
    const flow = page.locator(".stage-yield-table-flow");
    await flow.evaluate((el) => { el.scrollTop = 0; el.scrollLeft = 0; window.scrollTo({ top: 0, behavior: "instant" }); });
    const layout = await page.evaluate(() => {
      const el = document.querySelector(".stage-yield-table-flow");
      const table = document.querySelector(".stage-yield-table");
      return { body: document.documentElement.scrollWidth, screen: window.innerWidth, width: el.clientWidth, full: el.scrollWidth, height: el.clientHeight, totalHeight: el.scrollHeight, display: getComputedStyle(el).display, maxHeight: getComputedStyle(el).maxHeight, tableHeight: table.getBoundingClientRect().height, screenHeight: window.innerHeight };
    });
    assert.ok(layout.body <= layout.screen + 1, `No page-level horizontal overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.equal(layout.maxHeight, "none", "Table has no height limit at any viewport");
    assert.ok(layout.totalHeight <= layout.height + 1, "No internal vertical scrolling");
    assert.ok(layout.tableHeight > layout.screenHeight, "All maps expand into normal page flow");
    if (width > 1150) assert.equal(layout.display, "contents", "No desktop table container box");
    else assert.ok(layout.full > layout.width, "Small screens retain horizontal scrolling only");
    const collisions = await table.locator(".stage-yield-drop").evaluateAll((drops) => drops.flatMap((el) => {
      const icon = el.querySelector(".stage-yield-item-icon").getBoundingClientRect();
      const text = el.querySelector(".stage-yield-item-text").getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return icon.right > text.left + 1 || text.right > box.right + 1 || el.scrollWidth > el.clientWidth + 1 ? [el.textContent] : [];
    }));
    assert.deepEqual(collisions, [], `No equipment overlap at ${width}`);
    await page.screenshot({ path: path.join(root, `.cache/stage-yield-${width}.png`) });
    const last = table.locator('tr[data-map-id="157"]');
    await last.scrollIntoViewIfNeeded();
    await flow.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    const bottom = await last.boundingBox();
    assert.ok(bottom && bottom.y >= 0 && bottom.y + bottom.height <= (await page.viewportSize()).height + 1, "Last map is reachable by scrolling the page");
    assert.ok(await page.evaluate(() => window.scrollY > 0));
    assert.equal(await flow.evaluate((el) => el.scrollTop), 0, "The table does not create a nested vertical scroller");
    if (width > 1150) {
      const headerBox = await table.locator("thead th").first().boundingBox();
      const navigationBox = await page.locator(".site-header").boundingBox();
      assert.ok(headerBox && navigationBox && Math.abs(headerBox.y - navigationBox.y - navigationBox.height) <= 1, "Desktop table header remains beneath the navigation");
    }
    await page.screenshot({ path: path.join(root, `.cache/stage-yield-bottom-${width}.png`) });
    await page.getByRole("button", { name: /^掉落装备筛选/ }).click();
    const filterBounds = await page.locator(".stage-yield-filter-options").evaluate((el) => ({ height: el.clientHeight, scroll: el.scrollHeight, width: el.clientWidth, full: el.scrollWidth }));
    assert.ok(filterBounds.scroll > filterBounds.height, "Equipment picker scrolls");
    assert.ok(filterBounds.full <= filterBounds.width + 1, "Equipment picker stays within screen");
    await page.screenshot({ path: path.join(root, `.cache/stage-yield-filter-${width}.png`) });
    await page.getByRole("region", { name: "掉落装备筛选", exact: true }).getByRole("button", { name: "收起", exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, maps: 28, equipment: 78, tests: "navigation; all row totals and rates; six numeric sorts; slot-specific OR filters; chip/search/empty states; grade eligibility; shared detail controls and reload; native sprites; 1440/1152/390/320px natural page flow, sticky desktop headers, no vertical table container and no overlap" }, null, 2));
} finally { await browser.close(); }
