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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator(".configurable-maiden-table").waitFor();
await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
// Desktop scrolls the document; the Android export keeps both axes inside a
// viewport-sized workspace. Exercise the active scrollport in either build.
const scrollWorkspace = (left, top) => page.evaluate(([x, y]) => {
  const workspace = document.querySelector(".app-shell.table-mode");
  const dedicated = workspace && getComputedStyle(workspace).overflow === "auto";
  (dedicated ? workspace : window).scrollTo({ left: x, top: y, behavior: "instant" });
}, [left, top]);

const initialHeaders = await page.locator(".table-heading-row th").count();
const minimumInputs = await page.locator(".table-filter-row input[type=number]").count();
if (initialHeaders !== 19) throw new Error(`Expected 19 merged columns, found ${initialHeaders}`);
if (minimumInputs !== 8) throw new Error(`Expected 8 stat minimum inputs, found ${minimumInputs}`);
const activeLevel = await page.locator(".control-panel .level-picker button.active").innerText();
if (!activeLevel.startsWith("1")) throw new Error(`Expected level 1 by default, found ${activeLevel}`);
const topMask = await page.evaluate(() => {
  const style = getComputedStyle(document.querySelector(".app-shell"), "::before");
  return { position: style.position, width: style.width, height: style.height, zIndex: style.zIndex };
});
if (topMask.position !== "fixed" || topMask.height !== "78px" || Number(topMask.zIndex) < 79) throw new Error(`Top masking layer is not active: ${JSON.stringify(topMask)}`);
const slotIconLists = await page.locator("tbody .slot-icon-list-only").count();
const slotLabels = await page.locator("tbody .slot-icon-list-only b").count();
const slotCells = await page.locator("tbody .column-slots").count();
const fullDataset = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
const dataset = { ...fullDataset, rows: fullDataset.rows.filter((row) => row.implemented) };
const defaultKeys = await page.locator(".table-heading-row th").evaluateAll((cells) => cells.map((cell) => cell.className.match(/column-(\w+)/)[1]));
if (defaultKeys.indexOf("ammo") !== defaultKeys.indexOf("recon") + 1) throw new Error("Ammunition must default to immediately after recon");
const ammoCards = await page.locator("tbody tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => ({ id: Number(row.dataset.maidenId), labels: [...row.querySelectorAll(".table-ammo-card")].map((card) => card.getAttribute("aria-label")), lines: [...row.querySelectorAll(".table-ammo-card")].map((card) => card.getBoundingClientRect().top) })));
for (const actual of ammoCards) {
  const expected = [...new Set(dataset.rows.find((row) => row.id === actual.id).ammo)].sort();
  if (JSON.stringify([...actual.labels].sort()) !== JSON.stringify(expected)) throw new Error("Wrong ammunition cards for " + actual.id);
  for (let i = 0; i < actual.lines.length; i++) {
    if (Math.abs(actual.lines[i] - actual.lines[Math.floor(i / 3) * 3]) > 1) throw new Error("Card is not on the expected line for " + actual.id);
    if (i >= 3 && actual.lines[i] <= actual.lines[i - 3]) throw new Error("Ammunition did not wrap after three cards for " + actual.id);
  }
}
const ammoWidth = await page.locator(".table-heading-row .column-ammo").evaluate((cell) => cell.getBoundingClientRect().width);
if (Math.abs(ammoWidth - 194) > 1) throw new Error("Ammunition column is wider than three cards");

const configuredSlotRows = dataset.rows.filter((row) => row.slotDetails?.length).length;
if (slotCells !== dataset.rows.length || slotIconLists !== configuredSlotRows) throw new Error(`Expected icon-only slot rendering across ${dataset.rows.length} rows (${configuredSlotRows} configured), found ${slotCells} cells and ${slotIconLists} icon lists`);
if (slotLabels !== 0) throw new Error("Equipment slot text labels are still rendered");
const slotScreenshotPath = path.join(appRoot, ".cache", "table-slot-icons-audit.png");
await page.locator("tbody .column-slots").first().screenshot({ path: slotScreenshotPath });
await scrollWorkspace(0, 0);

await page.getByRole("button", { name: /列设置/ }).click();
const nationSetting = page.locator(".table-column-setting").filter({ hasText: "国籍" });
for (const key of ["person", "className", "rarity", "stage"]) {
  if (await page.locator(`.table-heading-row .column-${key}`).count()) throw new Error(`Merged column ${key} is still rendered`);
}
if (await page.locator(".table-column-setting").count() !== 19) throw new Error("Column settings must contain only the 19 merged columns");
if (await page.locator("tbody .table-person-name").count() !== dataset.rows.length) throw new Error("Person names must remain visible inside the name column");
if (await page.locator("tbody .table-game-avatar small").count()) throw new Error("IDs must not be displayed beneath portraits");
if (await page.locator(".table-heading-row .column-nation").isVisible()) throw new Error("Nation column should be hidden by default");
const timedToggle = (input) => input.evaluate((checkbox) => new Promise((resolve) => {
  const started = performance.now();
  checkbox.click();
  const synchronous = performance.now() - started;
  requestAnimationFrame(() => resolve({ synchronous, nextFrame: performance.now() - started }));
}));
const nationShowMs = await timedToggle(nationSetting.locator("input[type=checkbox]"));
if (!await page.locator(".table-heading-row .column-nation").isVisible()) throw new Error("Nation column did not become visible");
const nationHideMs = await timedToggle(nationSetting.locator("input[type=checkbox]"));
if (await page.locator(".table-heading-row .column-nation").isVisible()) throw new Error("Hidden nation column is still visible");

const tankSetting = page.locator(".table-column-setting").filter({ hasText: "名称" });
const idSetting = page.locator(".table-column-setting").filter({ hasText: "头像" });
if (await tankSetting.locator("input[type=checkbox]").count() || await idSetting.locator("input[type=checkbox]").count()) throw new Error("Pinned columns still expose visibility controls");
if (!await tankSetting.getAttribute("class").then((value) => value?.includes("locked")) || !await idSetting.getAttribute("class").then((value) => value?.includes("locked"))) throw new Error("Pinned columns are not marked as locked");
const ammoSetting = page.locator(".table-column-setting").filter({ hasText: "弹药" });
await ammoSetting.dragTo(nationSetting);
await page.waitForTimeout(100);
const firstHeaderClasses = await page.locator(".table-heading-row th").evaluateAll((cells) => cells.slice(0, 3).map((cell) => cell.className));
const firstCellClasses = await page.locator("tbody tr").first().locator("td").evaluateAll((cells) => cells.slice(0, 3).map((cell) => cell.className));
if (!firstHeaderClasses[0]?.includes("column-id") || !firstHeaderClasses[1]?.includes("column-tank") || !firstHeaderClasses[2]?.includes("column-ammo")) throw new Error(`Pinned header order changed: ${firstHeaderClasses.join(" | ")}`);
if (!firstCellClasses[0]?.includes("column-id") || !firstCellClasses[1]?.includes("column-tank") || !firstCellClasses[2]?.includes("column-ammo")) throw new Error(`Pinned body order changed: ${firstCellClasses.join(" | ")}`);

await page.getByRole("button", { name: "关闭列设置" }).click();
const topPower = Number((await page.locator("tbody .column-power .table-stat-value").first().innerText()).match(/-?\d+(?:\.\d+)?/)?.[0]);
if (!Number.isFinite(topPower)) throw new Error("Could not read the top power value");
await page.locator(".table-filter-row .column-power input").fill(String(topPower));
await page.waitForTimeout(120);
const filteredPowerValues = await page.locator("tbody .column-power .table-stat-value").allInnerTexts();
if (!filteredPowerValues.length) throw new Error("Power threshold unexpectedly removed every row");
if (filteredPowerValues.some((text) => Number(text.match(/-?\d+(?:\.\d+)?/)?.[0]) < topPower)) throw new Error("A row below the power threshold is still visible");
await page.getByRole("button", { name: "清除数值筛选" }).click();
await scrollWorkspace(0, 1300);
await page.waitForTimeout(200);
const navigationBox = await page.locator(".site-header").boundingBox();
const headingBox = await page.locator(".table-heading-row th").first().boundingBox();
const filterBox = await page.locator(".table-filter-row th").first().boundingBox();
if (!navigationBox || !headingBox || !filterBox) throw new Error("Could not measure sticky table rows");
const navigationBottom = navigationBox.y + navigationBox.height;
if (Math.abs(headingBox.y - navigationBottom) > 2) throw new Error("Sortable header is not frozen below navigation");
if (Math.abs(filterBox.y - (headingBox.y + headingBox.height)) > 2) throw new Error("Minimum-filter row is not frozen below the sortable header");

await scrollWorkspace(1200, 1300);
await page.waitForTimeout(200);
const pinnedHeaderBoxes = await page.evaluate(() => [".table-heading-row .column-id", ".table-heading-row .column-tank"].map((selector) => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return rect ? { left: rect.left, width: rect.width } : null;
}));
const pinnedBodyBoxes = await page.evaluate(() => {
  const visibleRow = [...document.querySelectorAll("tbody tr")].find((row) => {
    const rect = row.getBoundingClientRect();
    return rect.bottom > 170 && rect.top < innerHeight;
  });
  return [".column-id", ".column-tank"].map((selector) => {
    const rect = visibleRow?.querySelector(selector)?.getBoundingClientRect();
    return rect ? { left: rect.left, width: rect.width } : null;
  });
});
if (!pinnedHeaderBoxes[0] || !pinnedHeaderBoxes[1] || Math.abs(pinnedHeaderBoxes[0].left) > 2 || Math.abs(pinnedHeaderBoxes[1].left - pinnedHeaderBoxes[0].width) > 2) throw new Error(`Header identity columns are not horizontally pinned: ${JSON.stringify(pinnedHeaderBoxes)}`);
if (!pinnedBodyBoxes[0] || !pinnedBodyBoxes[1] || Math.abs(pinnedBodyBoxes[0].left) > 2 || Math.abs(pinnedBodyBoxes[1].left - pinnedBodyBoxes[0].width) > 2) throw new Error(`Body identity columns are not horizontally pinned: ${JSON.stringify(pinnedBodyBoxes)}`);
const talentWidth = await page.locator(".table-heading-row .column-talents").evaluate((cell) => cell.getBoundingClientRect().width);
if (Math.abs(talentWidth - 210) > 2) throw new Error(`Expected compact talent column width of 210px, found ${talentWidth}px`);

const screenshotPath = path.join(appRoot, ".cache", "table-controls-audit.png");
await page.screenshot({ path: screenshotPath, fullPage: false });
// Restoring defaults must not reintroduce any merged columns or drop person names.
await scrollWorkspace(0, 0);
await page.getByRole("button", { name: /列设置/ }).click();
await page.locator(".table-column-setting input:checked").evaluateAll((inputs) => inputs.forEach((input) => input.click()));
const frozenOnly = await page.locator(".table-heading-row th:visible").evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
if (frozenOnly.length !== 2 || Math.abs(frozenOnly[0] - 116) > 1 || Math.abs(frozenOnly[1] - 210) > 1) throw new Error(`Hiding other columns changed frozen widths: ${frozenOnly}`);
await page.getByRole("button", { name: "恢复默认列" }).click();
await page.getByRole("button", { name: "关闭列设置" }).click();
if (await page.locator(".table-heading-row th").count() !== 19 || await page.locator("tbody .table-person-name").count() !== dataset.rows.length) throw new Error("Default reset lost the merged name or restored old columns");
// Filters remain data predicates while their former columns are merged or hidden.
const seed = dataset.rows.find((row) => row.stage === "N5" && row.magicCostGroup === "N5-");
if (!seed) throw new Error("Missing N5- cohort fixture");
const filterSheet = page.locator(".filter-sheet");
const filterRow = (label) => filterSheet.locator(".rank-filter-row").filter({ has: page.locator("strong", { hasText: label }) });
await page.getByRole("button", { name: /筛选条件/ }).click();
await filterRow("车种（或）").getByRole("button", { name: seed.className, exact: true }).click();
await filterRow("稀有度（或）").getByTitle(seed.rarity, { exact: true }).click();
await filterRow("图纸（或）").getByRole("button", { name: seed.stage, exact: true }).click();
await filterSheet.getByRole("button", { name: "魔改费用筛选", exact: true }).click();
const costDialog = page.getByRole("dialog", { name: "魔改费用", exact: true });
await costDialog.getByRole("button", { name: seed.magicCostGroup, exact: true }).click();
await costDialog.getByRole("button", { name: "确定", exact: true }).click();
await filterSheet.locator(".filter-confirm").click();
const expectedCohort = dataset.rows.filter((row) => row.className === seed.className && row.rarity === seed.rarity && row.stage === seed.stage && row.magicCostGroup === seed.magicCostGroup).map((row) => row.id).sort((a, b) => a - b);
const assertCohort = async (context) => {
  const ids = await page.locator("tbody tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => Number(row.dataset.maidenId)).sort((a, b) => a - b));
  if (JSON.stringify(ids) !== JSON.stringify(expectedCohort)) throw new Error(context + " changed active filter results");
  const costs = await page.locator("tbody .table-portrait-cost").allTextContents();
  if (costs.length !== ids.length || costs.some((cost) => cost !== seed.magicCostGroup)) throw new Error(context + " has incorrect cost badges");
  const names = await page.locator("tbody .table-person-name").allTextContents();
  if (names.length !== ids.length) throw new Error(context + " lost person names");
};
await assertCohort("Combined filter");
await page.getByRole("button", { name: /列设置/ }).click();
await nationSetting.locator("input[type=checkbox]").check();
await ammoSetting.locator("input[type=checkbox]").uncheck();
await nationSetting.getByRole("button", { name: "国籍右移" }).click();
await assertCohort("Column visibility/order");
await page.getByRole("button", { name: "恢复默认列" }).click();
await assertCohort("Default column reset");
await page.getByRole("button", { name: "关闭列设置" }).click();
await page.getByRole("button", { name: /筛选条件/ }).click();
await filterSheet.locator(".filter-reset").click();
await filterSheet.locator(".filter-confirm").click();
if (await page.locator("tbody tr[data-maiden-id]").count() !== dataset.rows.length) throw new Error("Resetting filters must restore all rows");

const resetKeys = await page.locator(".table-heading-row th").evaluateAll((cells) => cells.map((cell) => cell.className.match(/column-(\w+)/)[1]));
if (JSON.stringify(resetKeys) !== JSON.stringify(defaultKeys)) throw new Error("Default column reset lost the ammunition position");

const mobilePinned = [];
for (const width of [390, 620, 621]) {
  await page.setViewportSize({ width, height: 850 });
  await scrollWorkspace(800, 900);
  await page.waitForTimeout(150);
  const boxes = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tbody tr")].find((r) => r.getBoundingClientRect().bottom > 170 && r.getBoundingClientRect().top < innerHeight);
    const measure = (element) => { const r = element.getBoundingClientRect(); return { left: r.left, width: r.width }; };
    return { headers: ["id", "tank"].map((k) => measure(document.querySelector(`.table-heading-row .column-${k}`))), cells: ["id", "tank"].map((k) => measure(row.querySelector(`.column-${k}`))) };
  });
  const expectedWidths = width <= 620 ? [96, 185] : [116, 210];
  for (const group of [boxes.headers, boxes.cells]) {
    if (Math.abs(group[0].left) > 1 || Math.abs(group[1].left - expectedWidths[0]) > 1 || group.some((box, i) => Math.abs(box.width - expectedWidths[i]) > 1)) throw new Error(`Frozen columns misaligned at ${width}px: ${JSON.stringify(boxes)}`);
  }
  mobilePinned.push({ viewport: width, ...boxes });
}
console.log(JSON.stringify({ initialHeaders, defaultKeys, ammoWidth, ammunitionCards: ammoCards.reduce((count, row) => count + row.labels.length, 0), minimumInputs, activeLevel, topMask, slotIconLists, slotLabels, nationShowMs, nationHideMs, threshold: topPower, filteredRows: filteredPowerValues.length, firstHeaderClasses, pinnedHeaderBoxes, pinnedBodyBoxes, combinedFilterRows: expectedCohort.length, mobilePinned, talentWidth, slotScreenshotPath, screenshotPath }, null, 2));
await browser.close();
