import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const growthRequests = [];
  page.on("request", (request) => { if (request.url().includes("/data/growth-curves.json")) growthRequests.push(request.url()); });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const firstRow = page.locator("tbody tr[data-maiden-id]").first();
  await firstRow.waitFor();
  const cardId = await firstRow.getAttribute("data-maiden-id");
  assert.ok(cardId);
  await firstRow.locator(".table-avatar").click();

  const detail = page.locator(".detail-modal");
  await detail.locator(".portrait-gallery").waitFor();
  assert.equal(await detail.locator(".growth-curve-section, .growth-curve-interactive").count(), 0, "Removed from detail, not merely hidden");
  assert.equal(await detail.locator(".detail-portrait-info-grid .acquisition-section").count(), 1);
  assert.equal(await detail.locator(".detail-portrait-info-grid .detail-slot-section").count(), 1);
  assert.match(await detail.locator(".detail-toolbar h3").innerText(), /1级/);
  await detail.locator(".detail-level-marks").getByRole("button", { name: "99级", exact: true }).click();
  assert.match(await detail.locator(".detail-toolbar h3").innerText(), /99级/);
  assert.equal(growthRequests.length, 1, "Detail slider reuses the client-calculated per-level dataset without rendering a curve");
  const screenshotPath = path.join(root, ".cache", "detail-portrait-info-audit.png");
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await detail.locator(".detail-portrait-info-grid").screenshot({ path: screenshotPath });
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  const rows = page.locator("tbody tr[data-maiden-id]");
  await rows.nth(0).locator(".table-compare").click();
  await rows.nth(1).locator(".table-compare").click();
  await page.getByRole("button", { name: "开始比较 →" }).click();
  await page.locator(".compare-modal").getByRole("button", { name: "曲线图", exact: true }).click();
  await page.locator(".compare-growth-interactive").waitFor();
  assert.equal(await page.locator(".compare-growth-line").count(), 2, "Comparison curves remain available");
  assert.equal(growthRequests.length, 1);
  console.log(JSON.stringify({ cardId: Number(cardId), detailCurveRemoved: true, comparisonCurvePreserved: true, screenshotPath }));
} finally {
  await browser.close();
}
