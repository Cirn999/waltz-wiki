import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:3000";
const browsersRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = fs.existsSync(chromium.executablePath()) ? chromium.executablePath() : fs.readdirSync(browsersRoot)
  .filter((name) => name.startsWith("chromium-"))
  .sort().reverse()
  .map((name) => path.join(browsersRoot, name, "chrome-win64", "chrome.exe"))
  .find((candidate) => fs.existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const bt5Row = page.locator('tr[data-maiden-id="6364"]');
  const bt2Row = page.locator('tr[data-maiden-id="6361"]');
  await bt5Row.locator(".table-avatar").click();
  const detailSource = await page.locator(".portrait-gallery-stage img").getAttribute("src");
  await page.locator(".detail-modal .modal-close").click();

  await bt5Row.locator(".table-compare").click();
  await bt2Row.locator(".table-compare").click();
  await page.locator(".open-compare").click();
  const compareSources = await page.locator(".compare-art img").evaluateAll((images) => images.map((image) => image.getAttribute("src")));

  const result = {
    detailSource,
    compareSources,
    detailUsesBt5: detailSource?.endsWith("/art/maidens/6364.webp") ?? false,
    compareUsesBoth: [6364, 6361].every((id) => compareSources.some((source) => source?.endsWith(`/art/maidens/${id}.webp`))),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.detailUsesBt5 || !result.compareUsesBoth) process.exitCode = 1;
} finally {
  await browser.close();
}
