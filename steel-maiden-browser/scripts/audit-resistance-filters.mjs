import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { openAttributeTable } from "./audit-table-setup.mjs";

const root = path.resolve(import.meta.dirname, "..");
const dataset = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const implemented = dataset.rows.filter((r) => r.implemented);
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(runtime)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((n) => path.join(runtime, n, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const modeName = "允许跨引擎／车体匹配抗性";
const ids = (rows) => rows.map((r) => r.id).sort((a, b) => a - b);
const expected = (field, names, mixed = false) => implemented.filter((row) => {
  const profiles = row[field].map((option) => new Set(option.resistance));
  if (mixed) {
    const union = new Set(profiles.flatMap((profile) => [...profile]));
    return names.every((name) => union.has(name));
  }
  return profiles.some((profile) => names.every((name) => profile.has(name)));
});
const bodyNames = ["抗泥沼", "广阔适应"];
const bodyStrict = expected("bodyOptions", bodyNames), bodyMixed = expected("bodyOptions", bodyNames, true);
const dialog = () => page.locator(".filter-sheet");
const toggle = () => dialog().getByRole("switch", { name: modeName, exact: true });
const choose = async (label, names) => {
  const row = dialog().locator(".rank-filter-row").filter({ has: page.locator("strong", { hasText: label }) });
  for (const name of names) await row.getByRole("button", { name, exact: true }).click();
};
const apply = async () => { await dialog().getByRole("button", { name: "确定", exact: true }).click(); await dialog().waitFor({ state: "detached" }); };
const openMain = async () => { await page.getByRole("button", { name: /筛选条件/ }).click(); await dialog().waitFor(); };
const assertIds = async (selector, expectedRows) => {
  const expectedIds = ids(expectedRows);
  await page.waitForFunction(({ selector, length }) => document.querySelectorAll(selector).length === length, { selector, length: expectedIds.length });
  const actual = await page.locator(selector).evaluateAll((entries) => entries.map((e) => Number(e.dataset.maidenId ?? e.dataset.id)).sort((a,b) => a-b));
  assert.deepEqual(actual, expectedIds);
};
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.locator(".atlas-album-avatars").waitFor();
  assert.equal(await page.getByRole("button", { name: "方形头像", exact: true }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(await page.locator("#maiden-section-menu b").allTextContents(), ["卡牌图鉴", "属性表", "研发配方", "研发路线"]);
  await assertIds(".atlas-entry", implemented);

  await openMain();
  assert.equal(await toggle().getAttribute("aria-checked"), "false");
  await choose("车体抗性（且）", bodyNames);
  await apply();
  await assertIds(".atlas-entry", bodyStrict);
  assert.equal(await page.locator('.atlas-entry[data-maiden-id="9865"]').count(), 0);

  // Draft toggles must not change the applied result when cancelled.
  await openMain(); await toggle().click();
  await dialog().getByRole("button", { name: "取消", exact: true }).click();
  await assertIds(".atlas-entry", bodyStrict);
  await openMain(); assert.equal(await toggle().getAttribute("aria-checked"), "false");
  await toggle().click(); await apply();
  await assertIds(".atlas-entry", bodyMixed);
  assert.equal(await page.locator('.atlas-entry[data-maiden-id="9865"]').count(), 1);
  await openAttributeTable(page);
  await assertIds("tr[data-maiden-id]", bodyMixed);

  // Charts inherit the main setting, then keep their own independent draft.
  await page.getByRole("button", { name: "柱状图", exact: true }).click();
  await assertIds(".ac-candidates .ac-vehicle", bodyMixed);
  await page.locator(".ac-candidates").getByRole("button", { name: /^筛选/ }).click();
  assert.equal(await toggle().getAttribute("aria-checked"), "true");
  await toggle().click(); await apply();
  await assertIds(".ac-candidates .ac-vehicle", bodyStrict);
  await page.getByRole("button", { name: "关闭属性图表", exact: true }).click();
  await assertIds("tr[data-maiden-id]", bodyMixed);

  await page.locator('tr[data-maiden-id="9865"] .table-avatar').click();
  const detail = page.locator(".detail-modal");
  await detail.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  assert.equal(await toggle().getAttribute("aria-checked"), "false", "rank scope starts reset independently");
  await choose("车体抗性（且）", bodyNames); await apply();
  const rankSize = async () => Number((await detail.locator(".detail-stat-rank").first().innerText()).split("/")[1]);
  assert.equal(await rankSize(), bodyStrict.length + 1, "excluded current maiden is still included for its own rank");
  await detail.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  await toggle().click(); await apply();
  assert.equal(await rankSize(), bodyMixed.length);
  await detail.getByRole("button", { name: "关闭", exact: true }).click();

  await openMain(); await dialog().getByRole("button", { name: "重置", exact: true }).click();
  assert.equal(await toggle().getAttribute("aria-checked"), "false");
  const engineNames = ["抗冻结", "抗起伏"];
  await choose("引擎抗性（且）", engineNames); await apply();
  await assertIds("tr[data-maiden-id]", expected("engineOptions", engineNames));
  assert.equal(await page.locator('tr[data-maiden-id="6132"]').count(), 0);
  await openMain(); await toggle().click(); await apply();
  await assertIds("tr[data-maiden-id]", expected("engineOptions", engineNames, true));
  assert.equal(await page.locator('tr[data-maiden-id="6132"]').count(), 1);
  await page.setViewportSize({ width: 390, height: 700 });
  await openMain();
  await toggle().scrollIntoViewIfNeeded();
  const box = await toggle().boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await dialog().screenshot({ path: path.join(root, ".cache/resistance-filters-mobile.png") });
  await dialog().getByRole("button", { name: "重置", exact: true }).click(); await apply();
  await assertIds("tr[data-maiden-id]", implemented);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".atlas-album-avatars").waitFor();
  await assertIds(".atlas-entry", implemented);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ defaultSquareAtlas: true, menuOrder: true, bodyStrict: bodyStrict.length, bodyAcross: bodyMixed.length, plz05ExcludedByDefault: true, wz131EngineRegression: true, contexts: ["atlas", "table", "chart", "rank"], cancelAndReset: true, mobile: true, errors }));
} finally { await browser.close(); }
