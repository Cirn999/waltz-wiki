import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const dataset = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const expected = dataset.rows.filter((row) => row.implemented).length;
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3100", { waitUntil: "networkidle" });
  const count = page.locator(".table-filter-row .column-tank .table-result-summary strong");
  await count.waitFor();
  const assertCount = async (value) => {
    assert.equal(Number(await count.textContent()), value);
    assert.equal(await page.locator("tbody tr[data-maiden-id]").count(), value);
  };
  await assertCount(expected);
  assert.equal(await page.locator(".table-archive .table-toolbar, .table-view-controls, .header-meta").count(), 0);
  assert.equal(await page.locator(".table-controls-target .table-column-settings-trigger").count(), 1);
  const geometry = [];
  for (const [width, height] of [[1900, 900], [1536, 720], [860, 900], [390, 850]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const scatter = await page.getByRole("button", { name: "散点图", exact: true }).boundingBox();
    const settings = await page.getByRole("button", { name: /列设置/ }).boundingBox();
    assert.ok(settings.x >= scatter.x + scatter.width, "Column settings must be to the right of scatter");
    assert.ok(Math.abs(settings.y + settings.height / 2 - scatter.y - scatter.height / 2) < 2);
    const header = await page.locator(".table-heading-row .column-tank").boundingBox();
    const result = await count.boundingBox();
    assert.ok(result.y >= header.y + header.height && result.x >= header.x && result.x + result.width <= header.x + header.width);
    await page.getByRole("button", { name: /列设置/ }).click();
    const panel = await page.getByRole("dialog", { name: "属性表列设置" }).boundingBox();
    assert.ok(panel.x >= 0 && panel.x + panel.width <= width, "Column settings must fit the viewport horizontally");
    assert.ok(panel.y >= 0 && panel.y + panel.height <= height, "Column settings must fit the viewport vertically");
    const reset = await page.getByRole("button", { name: "恢复默认列" }).boundingBox();
    assert.ok(reset.y + reset.height <= height, "The reset button must remain reachable without page scrolling");
    // The relocated panel must stay above the table, not behind the sticky header.
    const setting = page.locator(".table-column-setting").filter({ hasText: "国籍" }).locator("input");
    await setting.check();
    assert.ok(await page.locator(".table-heading-row .column-nation").isVisible());
    await setting.uncheck();
    await page.getByRole("button", { name: "关闭列设置" }).click();
    geometry.push({ width, height, scatter, settings, panel });
  }
  await page.setViewportSize({ width: 1900, height: 900 });
  const power = page.getByRole("spinbutton", { name: "火力最小值" });
  await power.fill("900");
  await page.waitForTimeout(100);
  const above = dataset.rows.filter((row) => row.implemented && row.stats["1"].power >= 900).length;
  assert.ok(above > 0 && above < expected);
  await assertCount(above);
  await power.fill("99999999");
  await page.waitForTimeout(100);
  await assertCount(0);
  assert.ok(await power.isVisible(), "The empty result must retain its filter inputs");
  await power.fill("");
  await page.waitForTimeout(100);
  await assertCount(expected);
  await page.locator(".search-box input").fill("__no_such_maiden__");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.waitForTimeout(100);
  await assertCount(0);
  assert.ok(await page.getByRole("button", { name: /列设置/ }).isVisible());
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await page.waitForTimeout(100);
  await assertCount(expected);
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await page.screenshot({ path: path.join(root, ".cache/table-layout-audit.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ expected, above, geometry, screenshot: ".cache/table-layout-audit.png" }, null, 2));
} finally {
  await browser.close();
}
