import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const labels = ["P-30 兽耳", "P-31 黑色头发", "P-32 戴眼镜"];
const expected = (label) => data.rows.filter((row) => row.huntTraits.some((item) => `${item.task} ${item.name}` === label)).map((row) => row.id).sort((a, b) => a - b);
const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://localhost:3100", { waitUntil: "networkidle" });
  const sheet = page.locator(".filter-sheet");
  const select = async (label) => {
    await sheet.locator(".filter-reset").click();
    await sheet.getByRole("button", { name: label, exact: true }).click();
    const hunt = sheet.locator(".rank-filter-row").filter({ has: page.locator("strong", { hasText: "狩猎任务（单选）" }) });
    assert.equal(await hunt.locator('button[aria-pressed="true"]').count(), 1);
    await sheet.locator(".filter-confirm").click();
  };
  const actualTableIds = () => page.locator("tbody tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => Number(row.dataset.maidenId)).sort((a, b) => a - b));
  for (const label of labels) {
    await page.getByRole("button", { name: /筛选条件/ }).click();
    await select(label);
    assert.deepEqual(await actualTableIds(), expected(label), `attribute table: ${label}`);
  }
  await page.getByRole("button", { name: /筛选条件/ }).click();
  await sheet.locator(".filter-reset").click();
  await sheet.locator(".filter-confirm").click();
  assert.equal((await actualTableIds()).length, data.rows.length);

  await page.getByRole("button", { name: "柱状图", exact: true }).click();
  const chart = page.getByRole("dialog", { name: "属性图表", exact: true });
  const candidates = chart.locator(".ac-candidates");
  for (const label of labels) {
    await candidates.getByRole("button", { name: /^筛选/ }).click();
    await select(label);
    const ids = await candidates.locator(".ac-vehicle").evaluateAll((rows) => rows.map((row) => Number(row.dataset.id)).sort((a, b) => a - b));
    assert.deepEqual(ids, expected(label), `chart candidates: ${label}`);
  }
  await chart.getByRole("button", { name: "关闭属性图表", exact: true }).click();
  assert.equal((await actualTableIds()).length, data.rows.length, "chart filter stays independent");

  const currentId = Number(await page.locator("tbody tr[data-maiden-id]").first().getAttribute("data-maiden-id"));
  await page.locator(".table-avatar").first().click();
  for (const label of labels) {
    await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
    await select(label);
    const info = await page.locator('.detail-rank-summary').innerText();
    assert.equal(Number(await page.locator('.detail-rank-summary').getAttribute('data-count')), new Set([...expected(label), currentId]).size, `detail ranking: ${label}`);
    assert.equal(info.includes("已补入本车"), !expected(label).includes(currentId));
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ surfaces: ["attribute table", "chart candidates", "detail ranking"], tasksPerSurface: 3, counts: labels.map((label) => [label, expected(label).length]), errors }));
} finally {
  await browser.close();
}
