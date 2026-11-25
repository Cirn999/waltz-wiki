import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const app = path.resolve(import.meta.dirname, "..");
const rows = JSON.parse(await fs.readFile(path.join(app, "public/data/maidens.json"), "utf8")).rows;
const implemented = rows.filter((row) => row.implemented);
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(runtime, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(30000);
const errors = [];
const failed = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
const input = page.getByRole("combobox", { name: "搜索钢舞姬" });
const pins = page.getByRole("list", { name: "固定显示的钢舞姬" });
let view = "cards";
const selector = () => view === "cards" ? ".atlas-entry" : "tbody tr[data-maiden-id]";
async function checkIds(expected) {
  const ids = [...new Set(expected)].sort((a, b) => a - b);
  await page.waitForFunction(({ selector, ids }) => {
    const actual = [...new Set([...document.querySelectorAll(selector)].map((element) => Number(element.dataset.maidenId)))].sort((a, b) => a - b);
    return JSON.stringify(actual) === JSON.stringify(ids);
  }, { selector: selector(), ids });
  assert.equal(await page.locator(selector()).count(), ids.length, "Vehicles are not duplicated");
}
async function switchView(next) {
  await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
  await page.getByRole("menuitem", { name: next === "table" ? /^属性表/ : /^卡牌图鉴/ }).click();
  view = next;
  await page.locator(next === "table" ? ".table-archive" : ".card-atlas").waitFor();
}
async function choose(row) {
  await input.fill(row.tank);
  await page.locator('.archive-search-suggestions [data-maiden-id="' + row.id + '"]').click();
  assert.equal(await input.inputValue(), "");
  assert.equal(await pins.locator('li[data-maiden-id="' + row.id + '"]').count(), 1);
}
async function remove(row) {
  await page.getByRole("button", { name: "取消固定 " + row.tank, exact: true }).click();
}
async function openFilters() {
  await page.getByRole("button", { name: /筛选条件/ }).click();
  await page.locator(".filter-sheet").waitFor();
}
async function applyFilters() {
  await page.locator(".filter-sheet .filter-confirm").click();
  await page.locator(".filter-sheet").waitFor({ state: "detached" });
}
const su = rows.find((row) => row.tank === "SU-122");
const isu = rows.find((row) => row.tank === "ISU-122");
const triple = rows.find((row) => row.tank === "122三液试验坦克");
assert.ok(su && isu && triple);

try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.locator(".atlas-entry").first().waitFor();
  await checkIds(implemented.map((row) => row.id));

  await input.fill("122");
  for (const row of [su, isu, triple]) {
    const option = page.getByRole("option", { name: row.tank, exact: true });
    await option.waitFor();
    await option.locator("img").evaluate((image) => image.decode());
    const layout = await option.evaluate((element) => {
      const image = element.querySelector("img").getBoundingClientRect();
      const text = element.querySelector("span").getBoundingClientRect();
      return image.right <= text.left;
    });
    assert.ok(layout, "Candidate avatar appears to the left of its name");
  }
  await fs.mkdir(path.join(app, ".cache/search-pins"), { recursive: true });
  await page.screenshot({ path: path.join(app, ".cache/search-pins/candidates-desktop.png") });
  await page.getByRole("option", { name: su.tank, exact: true }).click();
  await checkIds([su.id]);
  await choose(isu);
  await checkIds([su.id, isu.id]);
  await choose(su);
  assert.equal(await pins.locator("li").count(), 2, "Selecting the same vehicle is idempotent");

  await openFilters();
  const classes = page.locator(".filter-sheet .rank-filter-row").filter({ has: page.locator("strong", { hasText: "车种（或）" }) });
  await classes.getByRole("button", { name: "轻型坦克", exact: true }).click();
  await applyFilters();
  const lightIds = implemented.filter((row) => row.className === "轻型坦克").map((row) => row.id);
  const union = [su.id, isu.id, ...lightIds];
  await checkIds(union);
  assert.deepEqual(await page.locator(".atlas-entry").evaluateAll((elements) => elements.slice(0, 2).map((element) => Number(element.dataset.maidenId))), [su.id, isu.id]);

  await switchView("table");
  await checkIds(union);
  assert.equal(await pins.locator("li").count(), 2);
  await page.getByRole("spinbutton", { name: "火力最小值", exact: true }).fill("999999");
  await checkIds([su.id, isu.id]);
  await switchView("cards");
  await checkIds([su.id, isu.id]);
  await switchView("table");
  assert.equal(await page.getByRole("spinbutton", { name: "火力最小值", exact: true }).inputValue(), "999999");
  await page.getByRole("button", { name: "清除数值筛选", exact: true }).click();
  await checkIds(union);

  await input.fill("不存在的钢舞姬搜索词");
  await input.press("Enter");
  await checkIds([su.id, isu.id]);
  await remove(su);
  await checkIds([isu.id]);
  await remove(isu);
  await checkIds([]);
  await page.locator(".empty-state").getByRole("button", { name: "重置筛选", exact: true }).click();
  await checkIds(implemented.map((row) => row.id));

  await input.fill("122");
  await input.press("ArrowDown");
  const keyboardId = Number(await page.getByRole("listbox", { name: "钢舞姬搜索候选" }).getByRole("option", { selected: true }).getAttribute("data-maiden-id"));
  await input.press("Enter");
  await checkIds([keyboardId]);
  await remove(rows.find((row) => row.id === keyboardId));

  await input.fill("ISU");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
  assert.equal(await pins.count(), 0, "IME confirmation does not pin or submit");
  await checkIds(implemented.map((row) => row.id));
  await input.press("Escape");
  assert.equal(await page.getByRole("listbox").count(), 0);
  await input.press("Enter");
  assert.equal(await pins.count(), 0, "Regular Enter retains text-search behavior");

  const unimplemented = rows.find((row) => !row.implemented);
  await choose(unimplemented);
  await checkIds([unimplemented.id]);
  await remove(unimplemented);
  await checkIds(implemented.map((row) => row.id));

  await switchView("cards");
  const many = implemented.slice(-49);
  for (const row of many) await choose(row);
  await checkIds(many.map((row) => row.id));
  await page.getByRole("button", { name: /竖版卡牌/ }).click();
  await checkIds(many.map((row) => row.id));
  await openFilters();
  await page.getByRole("button", { name: "显示未实装", exact: true }).click();
  await applyFilters();
  assert.equal(await page.locator(".atlas-entry").count(), 49, "All pins stay visible beyond the normal 48-card page");
  await page.getByRole("button", { name: /继续载入/ }).click();
  assert.equal(await page.locator(".atlas-entry").count(), 97);
  const visible = await page.locator(".atlas-entry").evaluateAll((elements) => elements.map((element) => Number(element.dataset.maidenId)));
  assert.ok(many.every((row) => visible.includes(row.id)));

  for (const row of many.slice(0, -3)) await remove(row);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("122");
  await page.getByRole("listbox").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(app, ".cache/search-pins/candidates-mobile.png") });
  await page.getByRole("option", { name: su.tank, exact: true }).click();
  assert.equal(await input.inputValue(), "");
  await page.locator(".archive-search").screenshot({ path: path.join(app, ".cache/search-pins/pins-mobile.png") });

  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ candidatesWithAvatars: true, multiSelect: true, duplicateSelection: true, unionWithFilters: true,
    sharedViews: true, sharedNumericFilters: true, removePins: true, keyboard: true, ime: true,
    unimplementedExplicitSelection: true, pinsBeyondPagination: 49, loadMore: true, mobile: true, errors, failed }));
} finally {
  await browser.close();
}
