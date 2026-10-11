import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const report = JSON.parse(await fs.readFile(new URL("../public/data/magic-cost-groups.json", import.meta.url), "utf8"));
const baseUrl = process.argv[2] || "http://localhost:3100";
const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(root)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(root, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1228, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const main = page.locator(".filter-sheet");
  const nested = page.getByRole("dialog", { name: "魔改费用", exact: true });
  const openMain = () => page.getByRole("button", { name: /筛选条件/ }).click();
  const openCost = () => main.getByRole("button", { name: "魔改费用筛选", exact: true }).click();
  const confirmCost = () => nested.getByRole("button", { name: "确定", exact: true }).click();
  const confirmMain = () => main.locator(".filter-confirm").click();
  const actualIds = async () => (await page.locator("tbody tr[data-maiden-id]").evaluateAll((els) => els.map((el) => Number(el.dataset.maidenId)))).sort((a, b) => a - b);
  const expectedIds = (groups, stage) => data.rows.filter((row) => (!groups.length || groups.includes(row.magicCostGroup)) && (!stage || row.stage === stage)).map((row) => row.id).sort((a, b) => a - b);
  const filterRow = (label) => main.locator(".rank-filter-row").filter({ has: page.locator("strong", { hasText: label }) });
  const selectOnly = async (groups) => {
    await openCost();
    await nested.getByRole("button", { name: "清空", exact: true }).click();
    for (const group of groups) await nested.getByRole("button", { name: group, exact: true }).click();
    await confirmCost();
  };
  const geometry = async () => {
    const matrix = await nested.locator(".magic-cost-option").evaluateAll((els) => els.map((el) => ({ label: el.getAttribute("aria-label"), x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
    assert.equal(matrix.length, 18);
    assert.equal(new Set(matrix.map((cell) => cell.x)).size, 6);
    assert.equal(new Set(matrix.map((cell) => cell.y)).size, 3);
    assert.equal(await nested.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    return matrix;
  };
  await openMain();
  const gradeRow = await main.locator(".filter-grade-row").evaluate((el) => [...el.children].map((child) => ({ x: child.getBoundingClientRect().x, y: child.getBoundingClientRect().y })));
  assert.equal(new Set(gradeRow.map((child) => child.y)).size, 1, "rarity, blueprint and cost must share a row");
  assert.ok(gradeRow[0].x < gradeRow[1].x && gradeRow[1].x < gradeRow[2].x);
  const gradeOverflow = await main.locator(".filter-grade-row").evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }));
  assert.equal(gradeOverflow.overflowY, "hidden", "the compact row must not expose a vertical scrollbar");
  assert.ok(gradeOverflow.scrollHeight <= gradeOverflow.clientHeight + 1, `the compact row must keep normal row height: ${JSON.stringify(gradeOverflow)}`);
  assert.equal(await main.locator(".magic-cost-trigger").innerText(), "魔改费用", "entry must use the requested text label");
  assert.equal(await main.locator(".magic-cost-trigger img").count(), 0, "the assessment icon must not appear in the cost filter entry");
  const costGap = await main.evaluate((el) => el.querySelector(".magic-cost-trigger").getBoundingClientRect().left - [...el.querySelectorAll(".filter-row-stage button")].at(-1).getBoundingClientRect().right);
  assert.ok(costGap >= 0 && costGap <= 24, `cost filter should sit directly after blueprint options, gap=${costGap}`);
  const separators = await main.locator(".filter-row-stage, .magic-cost-filter").evaluateAll((els) => els.map((el) => {
    const style = getComputedStyle(el);
    return [style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor];
  }));
  assert.equal(separators.length, 2);
  assert.deepEqual(separators[0], separators[1], "both separators must use the same rule");
  assert.deepEqual(separators[1].slice(0, 2), ["1px", "solid"]);
  await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  await main.screenshot({ path: fileURLToPath(new URL("../.cache/magic-cost-main-filter.png", import.meta.url)) });
  await openCost();
  const matrix = await geometry();
  for (const group of report.groups) {
    assert.equal(await nested.getByRole("button", { name: group.id, exact: true }).isDisabled(), group.count === 0);
  }
  await nested.getByRole("button", { name: "N5-", exact: true }).click();
  await nested.getByRole("button", { name: "N6+", exact: true }).click();
  assert.equal(await nested.locator('button[aria-pressed="true"]').count(), 2);
  await nested.screenshot({ path: fileURLToPath(new URL("../.cache/magic-cost-matrix.png", import.meta.url)) });
  await confirmCost();
  assert.equal((await actualIds()).length, data.rows.length, "outer draft must not apply before confirmation");
  await confirmMain();
  assert.deepEqual(await actualIds(), expectedIds(["N5-", "N6+"]));

  // Every active group, including both N3 tiers and the two blueprint exceptions.
  for (const group of report.groups.filter((group) => group.count)) {
    await openMain(); await selectOnly([group.id]); await confirmMain();
    assert.deepEqual(await actualIds(), expectedIds([group.id]), group.id);
  }
  await openMain(); await selectOnly(["N5+", "N6+"]);
  await filterRow("图纸（或）").getByRole("button", { name: "N1", exact: true }).click();
  await confirmMain();
  assert.deepEqual(await actualIds(), [9881], "cost and displayed blueprint filters must be independent AND predicates");
  await openMain();
  await openCost();
  await nested.getByRole("button", { name: "清空", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await nested.count(), 0);
  assert.equal(await main.count(), 1, "Escape must close only the nested page");
  await openCost();
  assert.equal(await nested.locator('button[aria-pressed="true"]').count(), 2, "Escape discards nested draft");
  await nested.getByRole("button", { name: "取消", exact: true }).click();
  await main.locator(".filter-reset").click();
  await confirmMain();
  assert.equal((await actualIds()).length, data.rows.length);

  // Detail ranking uses the same control and matches the same OR cohort.
  await page.locator(".table-avatar").first().click();
  await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  await selectOnly(["N3", "N3+"]);
  await confirmMain();
  const rankingCount = await page.locator('.detail-rank-summary').innerText();
  const expectedRank = expectedIds(["N3", "N3+"]).length;
  assert.equal(Number(await page.locator('.detail-rank-summary').getAttribute('data-count')), expectedRank + (rankingCount.includes("已补入本车") ? 1 : 0));
  await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  await openCost();
  assert.equal(await nested.locator('button[aria-pressed="true"]').count(), 2);
  await geometry();
  for (const width of [900, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await geometry();
    const bounds = await nested.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
  }
  await nested.screenshot({ path: fileURLToPath(new URL("../.cache/magic-cost-mobile.png", import.meta.url)) });
  await page.keyboard.press("Escape");
  assert.equal(await main.count(), 1);
  assert.equal(await page.locator(".detail-modal").count(), 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cards: data.rows.length, groupsTested: report.groups.filter((group) => group.count).length, unionCount: expectedIds(["N5-", "N6+"]).length, rankingCount, gradeRow, gradeOverflow, costGap, matrix, errors }));
} finally {
  await browser.close();
}
