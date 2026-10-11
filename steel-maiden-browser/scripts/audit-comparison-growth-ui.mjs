import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const growth = JSON.parse(await fs.readFile(path.join(root, "public/data/growth-curves.json"), "utf8"));
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
const endpointsOf = (d) => [...d.matchAll(/[ML](\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)].map((match) => match.slice(1).map(Number));
const upwardAngle = (points) => Math.atan2(points[0][1] - points[1][1], points[1][0] - points[0][0]) * 180 / Math.PI;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const rows = page.locator(".maiden-table tbody tr[data-maiden-id]");
  const ids = [await rows.nth(0).getAttribute("data-maiden-id"), await rows.nth(1).getAttribute("data-maiden-id")];
  assert.ok(ids[0] && ids[1]);
  await rows.nth(0).locator(".table-compare").click();
  await rows.nth(1).locator(".table-compare").click();
  await page.getByRole("button", { name: "开始比较 →" }).click();
  const modal = page.locator(".compare-modal");
  await modal.waitFor();
  assert.equal(await modal.locator(".compare-table").count(), 1, "Bar chart remains the default");
  await modal.getByRole("button", { name: "雷达图" }).click();
  assert.equal(await modal.locator(".compare-radar").count(), 1);
  await modal.getByRole("button", { name: "曲线图" }).click();
  const curve = modal.locator(".compare-growth-interactive");
  await curve.waitFor();
  assert.equal(await modal.locator(".compare-growth-line").count(), 2);
  assert.equal(await modal.locator(".compare-radar, .compare-table").count(), 0);
  assert.equal(await modal.locator(".compare-growth-options button.active").innerText(), "火力");
  assert.equal(await curve.getAttribute("aria-valuenow"), "1");
  const legend = modal.locator(".compare-growth-legend");
  for (const id of ids) assert.ok((await legend.innerText()).includes(growth.rows[id].power[0].toLocaleString("zh-CN")));
  const strokes = await modal.locator(".compare-growth-line").evaluateAll((items) => items.map((item) => item.getAttribute("stroke")));
  assert.equal(new Set(strokes).size, 2);

  await modal.locator(".compare-growth-options").getByRole("button", { name: "装甲" }).click();
  assert.equal(await modal.locator(".compare-growth-options button.active").innerText(), "装甲");
  const box = await curve.boundingBox();
  assert.ok(box);
  const chartX = (level) => 80 + ((level - 1) / 98) * (960 - 80 - 80);
  await curve.click({ position: { x: box.width * chartX(60) / 960, y: box.height / 2 } });
  assert.equal(await curve.getAttribute("aria-valuenow"), "60");
  for (const id of ids) assert.ok((await legend.innerText()).includes(growth.rows[id].armor[59].toLocaleString("zh-CN")));
  const dragBox = await curve.boundingBox();
  assert.ok(dragBox);
  const pageX = (level) => dragBox.x + dragBox.width * chartX(level) / 960;
  const pageY = dragBox.y + dragBox.height / 2;
  await page.mouse.move(pageX(60), pageY);
  await page.mouse.down();
  await page.mouse.move(pageX(85), pageY, { steps: 12 });
  assert.equal(await curve.getAttribute("aria-valuenow"), "85", "Dragging should update before release");
  await page.mouse.up();
  const screenshotPath = path.join(root, ".cache", "comparison-growth-audit.png");
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await modal.locator(".compare-growth").screenshot({ path: screenshotPath });
  assert.equal(await modal.locator(".compare-growth-difference-chart").count(), 0);
  assert.equal(await modal.locator(".compare-growth-interactive svg text").count(), 6, "Only level labels remain; no vertical value axis");
  const ordinaryPaths = await modal.locator(".compare-growth-line").evaluateAll((items) => items.map((item) => item.getAttribute("d")));
  const [ordinaryLeft, ordinaryRight] = ordinaryPaths.map(endpointsOf);
  assert.ok([ordinaryLeft, ordinaryRight].every((points) => points.length === 2), "Both series must be straight lines");
  const startOrdinaryGap = ordinaryLeft[0][1] - ordinaryRight[0][1];
  const endOrdinaryGap = ordinaryLeft[1][1] - ordinaryRight[1][1];
  assert.ok(startOrdinaryGap > 40 && endOrdinaryGap > 40, "The stronger right-hand maiden must remain above at every level");
  const ordinaryAngles = [upwardAngle(ordinaryLeft), upwardAngle(ordinaryRight)];
  assert.ok(Math.min(...ordinaryAngles) >= 9.9 && Math.abs(ordinaryAngles[0] - ordinaryAngles[1]) >= 10, "Non-crossing lines must both rise steeply with a 10-degree minimum angle");

  // A one-point difference should be visibly separated without changing the exact readouts.
  await page.reload({ waitUntil: "networkidle" });
  for (const tank of ["10式主战坦克", "弹链狐中型坦克"]) {
    await page.locator(".search-box input").fill(tank);
    await page.locator(".search-box > button").click();
    const row = page.locator(".maiden-table tbody tr[data-maiden-id]");
    await row.first().waitFor();
    await row.first().locator(".table-compare").click();
  }
  await page.getByRole("button", { name: "开始比较 →" }).click();
  const closePair = page.locator(".compare-modal");
  await closePair.getByRole("button", { name: "曲线图" }).click();
  const closeCurve = closePair.locator(".compare-growth-interactive");
  await closeCurve.waitFor();
  const closeBox = await closeCurve.boundingBox();
  assert.ok(closeBox);
  await closeCurve.click({ position: { x: closeBox.width * chartX(58) / 960, y: 100 } });
  assert.equal(await closeCurve.getAttribute("aria-valuenow"), "58");
  const closeReadouts = await closePair.locator(".compare-growth-legend-item strong").allInnerTexts();
  assert.deepEqual(closeReadouts, ["1,914", "1,915"]);
  const curvePaths = await closePair.locator(".compare-growth-line").evaluateAll((items) => items.map((item) => item.getAttribute("d")));
  const endpoints = curvePaths.map(endpointsOf);
  assert.ok(endpoints.every((points) => points.length === 2), "Each series must be one straight line");
  const startGap = endpoints[0][0][1] - endpoints[1][0][1];
  const endGap = endpoints[0][1][1] - endpoints[1][1][1];
  assert.ok(Math.abs(startGap) > 60 && Math.abs(endGap) > 60 && startGap * endGap < 0, "The two straight lines should form a wide X");
  const crossingAngles = endpoints.map(upwardAngle);
  assert.ok(Math.min(...crossingAngles) >= 9.9 && Math.abs(crossingAngles[0] - crossingAngles[1]) >= 10, "Crossing lines must both rise steeply with a 10-degree minimum angle");
  assert.equal(await closePair.locator(".compare-growth-interactive svg").count(), 1);
  const nearEqualScreenshot = path.join(root, ".cache", "comparison-growth-near-equal.png");
  await closePair.locator(".compare-growth").screenshot({ path: nearEqualScreenshot });

  // The trailing maiden can grow faster without actually overtaking the leader.
  await page.reload({ waitUntil: "networkidle" });
  for (const tank of ["丘吉尔Mk-III", "M2轻型坦克"]) {
    await page.locator(".search-box input").fill(tank);
    await page.locator(".search-box > button").click();
    const row = page.locator(".maiden-table tbody tr[data-maiden-id]");
    await row.first().waitFor();
    await row.first().locator(".table-compare").click();
  }
  await page.getByRole("button", { name: "开始比较 →" }).click();
  const closingPair = page.locator(".compare-modal");
  await closingPair.getByRole("button", { name: "曲线图" }).click();
  await closingPair.locator(".compare-growth-line").first().waitFor();
  const closingPaths = await closingPair.locator(".compare-growth-line").evaluateAll((items) => items.map((item) => item.getAttribute("d")));
  const [closingLeft, closingRight] = closingPaths.map(endpointsOf);
  assert.ok(closingLeft[0][1] < closingRight[0][1] && closingLeft[1][1] < closingRight[1][1], "The faster-growing trailer must stay below the leader");
  const closingAngles = [upwardAngle(closingLeft), upwardAngle(closingRight)];
  assert.ok(Math.min(...closingAngles) >= 9.9 && Math.abs(closingAngles[0] - closingAngles[1]) >= 10);
  console.log(JSON.stringify({ ids: ids.map(Number), stat: "armor", selectedLevel: 85, screenshotPath, nearEqualScreenshot }));
} finally {
  await browser.close();
}
