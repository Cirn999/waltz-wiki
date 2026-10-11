import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const installedShells = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse();
const browser = await chromium.launch({ headless: true, executablePath: installedShells[0] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
const page = await context.newPage();

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator(".search-box input").fill("261-2工程");
await page.locator(".search-box button").click();
await page.locator("tbody tr[data-maiden-id]").first().waitFor();
await page.locator(".table-avatar").first().click();
const section = page.locator(".detail-modal .acquisition-section");
await section.waitFor();
const sectionText = await section.innerText();
if (!sectionText.includes("夏季限定") || !sectionText.includes("礼包购买")) {
  throw new Error(`Acquisition section is incomplete: ${sectionText}`);
}

await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const screenshotPath = path.join(appRoot, ".cache", "acquisition-detail-audit.png");
const sectionScreenshotPath = path.join(appRoot, ".cache", "acquisition-section-audit.png");
await page.locator(".detail-modal").screenshot({ path: screenshotPath });
await section.screenshot({ path: sectionScreenshotPath });

await page.locator(".detail-modal .share-image-button").click();
await page.locator(".detail-modal .share-image-button.state-copied").waitFor({ timeout: 60_000 });
const pngBytes = await page.evaluate(async () => {
  const items = await navigator.clipboard.read();
  const png = items.find((item) => item.types.includes("image/png"));
  return png ? (await png.getType("image/png")).size : 0;
});

await page.locator(".detail-modal .modal-close").click();
await page.locator(".search-box input").fill("圣剑");
await page.locator(".search-box button").click();
await page.locator("tbody tr[data-maiden-id]").first().waitFor();
await page.locator(".table-avatar").first().click();
const researchLink = page.locator(".detail-modal .acquisition-card-link");
if (!(await researchLink.innerText()).includes("研发")) throw new Error("Research acquisition route is not clickable");
await researchLink.click();
await page.locator(".research-archive").waitFor();
const researchFocusText = await page.locator(".research-focus-title").innerText();
if (!researchFocusText.includes("圣剑")) throw new Error(`Research jump focused the wrong maiden: ${researchFocusText}`);

console.log(JSON.stringify({ sectionText, pngBytes, researchFocusText, screenshotPath, sectionScreenshotPath }, null, 2));
if (!pngBytes) process.exitCode = 1;
await browser.close();
