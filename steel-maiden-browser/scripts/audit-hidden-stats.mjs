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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const forbidden = /经济性|潜能/;
const tableHeaders = await page.locator(".maiden-table thead").innerText();
if (forbidden.test(tableHeaders)) throw new Error(`Hidden stats remain in table: ${tableHeaders}`);

await page.locator(".table-avatar").first().click();
const detailGrid = page.locator(".detail-modal .detail-stat-grid");
await detailGrid.waitFor();
const detailText = await detailGrid.innerText();
const detailTiles = await detailGrid.locator(":scope > div").count();
if (forbidden.test(detailText) || detailTiles !== 12) throw new Error(`Detail grid mismatch: tiles=${detailTiles}, text=${detailText}`);
const columns = await detailGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
if (columns !== 6) throw new Error(`Detail grid expected 6 columns, got ${columns}`);
await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const detailPath = path.join(appRoot, ".cache", "detail-12-stat-layout.png");
await detailGrid.screenshot({ path: detailPath });
await page.locator(".detail-modal .modal-close").click();

await page.locator(".table-compare").nth(0).click();
await page.locator(".table-compare").nth(1).click();
await page.locator(".open-compare").click();
const compareTable = page.locator(".compare-modal .compare-table");
await compareTable.waitFor();
const compareText = await compareTable.innerText();
if (forbidden.test(compareText)) throw new Error(`Hidden stats remain in comparison: ${compareText}`);

console.log(JSON.stringify({ table: "passed", detailTiles, detailColumns: columns, comparison: "passed", detailPath }, null, 2));
await browser.close();
