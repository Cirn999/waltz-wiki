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
await page.locator(".maiden-table th").first().waitFor();
await page.evaluate(() => window.scrollTo(0, 1250));
await page.waitForTimeout(250);

const headerBox = await page.locator(".site-header").boundingBox();
const tableHeadBox = await page.locator(".maiden-table th").first().boundingBox();
if (!headerBox || !tableHeadBox) throw new Error("Could not measure sticky layers");
const headerBottom = headerBox.y + headerBox.height;
if (tableHeadBox.y < headerBottom - 1) throw new Error(`Table header is covered: nav bottom=${headerBottom}, table top=${tableHeadBox.y}`);
if (tableHeadBox.y > headerBottom + 2) throw new Error(`Unexpected gap under navigation: nav bottom=${headerBottom}, table top=${tableHeadBox.y}`);

await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const screenshotPath = path.join(appRoot, ".cache", "sticky-table-header-audit.png");
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(JSON.stringify({ headerBottom, tableHeaderTop: tableHeadBox.y, screenshotPath }, null, 2));
await browser.close();
