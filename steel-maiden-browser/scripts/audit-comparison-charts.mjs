import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const dataset = JSON.parse(await readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const byId = new Map(dataset.rows.map((row) => [row.id, row]));
const statKeys = ["durability", "power", "piercing", "accuracy", "armor", "evasion", "stealth", "recon"];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const tableDeltaCount = await page.locator(".maiden-table .number-cell-sorted .value-delta").count();
const positiveTableDeltas = await page.locator(".maiden-table .value-delta.positive").count();
const negativeTableDeltas = await page.locator(".maiden-table .value-delta.negative").count();
await page.screenshot({ path: ".cache/table-median-deltas.png", fullPage: false });
const selectedRows = page.locator(".maiden-table tbody tr").filter({ has: page.locator(".table-compare") });
const selectedIds = [Number(await selectedRows.nth(0).getAttribute("data-maiden-id")), Number(await selectedRows.nth(1).getAttribute("data-maiden-id"))];
await selectedRows.nth(0).locator(".table-compare").click();
await selectedRows.nth(1).locator(".table-compare").click();
await page.getByRole("button", { name: "开始比较 →" }).click();
await page.locator(".compare-modal").waitFor();

const activeLevel = (await page.locator(".compare-modal .level-picker button.active").innerText()).trim();
const barRows = await page.locator(".compare-table .compare-row").count();
const [left, right] = selectedIds.map((id) => byId.get(id));
const expectedAdvantageCount = statKeys.filter((key) => left.stats["1"][key] !== right.stats["1"][key]).length;
const advantageCount = await page.locator(".compare-table .compare-delta").count();
const placement = await page.locator(".compare-row").evaluateAll((rows) => rows.map((row) => {
  const leftSide = row.children[0];
  const rightSide = row.children[2];
  const leftDelta = leftSide.querySelector(".compare-delta-left");
  const rightDelta = rightSide.querySelector(".compare-delta-right");
  return {
    leftBeforeValue: !leftDelta || [...leftSide.children].indexOf(leftDelta) < [...leftSide.children].indexOf(leftSide.querySelector("strong")),
    rightAfterValue: !rightDelta || [...rightSide.children].indexOf(rightDelta) > [...rightSide.children].indexOf(rightSide.querySelector("strong")),
  };
}));
await page.screenshot({ path: ".cache/compare-bars-with-deltas.png", fullPage: false });

await page.getByRole("button", { name: "雷达图" }).click();
const radar = {
  visible: await page.locator(".compare-radar").isVisible(),
  shapes: await page.locator(".compare-radar .radar-shape").count(),
  axes: await page.locator(".compare-radar .radar-axis").count(),
  labels: await page.locator(".compare-radar .radar-label").count(),
  bars: await page.locator(".compare-table").count(),
};
await page.screenshot({ path: ".cache/compare-radar.png", fullPage: false });
await page.getByRole("button", { name: "关闭" }).click();

await page.locator(".search-box input").fill(left.tank);
await page.locator(".search-box > button").click();
await page.waitForFunction(() => document.querySelectorAll(".maiden-table tbody tr").length === 1);
const filteredDelta = (await page.locator(".maiden-table .number-cell-sorted .value-delta").innerText()).trim();
await browser.close();

if (
  tableDeltaCount !== dataset.rows.length || positiveTableDeltas < 1 || negativeTableDeltas < 1 ||
  activeLevel !== "1级" || barRows !== statKeys.length || advantageCount !== expectedAdvantageCount ||
  placement.some((item) => !item.leftBeforeValue || !item.rightAfterValue) ||
  !radar.visible || radar.shapes !== 2 || radar.axes !== statKeys.length || radar.labels !== statKeys.length || radar.bars !== 0 ||
  filteredDelta !== "(0)"
) {
  throw new Error(`comparison chart audit failed: ${JSON.stringify({ tableDeltaCount, positiveTableDeltas, negativeTableDeltas, activeLevel, barRows, expectedAdvantageCount, advantageCount, placement, radar, filteredDelta })}`);
}
console.log(JSON.stringify({ selectedIds, tableDeltaCount, activeLevel, expectedAdvantageCount, advantageCount, radar, filteredDelta }, null, 2));
