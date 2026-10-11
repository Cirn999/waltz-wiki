import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const baseUrl = process.argv[2] || "http://localhost:3000";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
const page = await context.newPage();

async function clipboardPngSize() {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const pngItem = items.find((item) => item.types.includes("image/png"));
    if (!pngItem) return 0;
    return (await pngItem.getType("image/png")).size;
  });
}

async function clipboardPngDataUrl() {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const pngItem = items.find((item) => item.types.includes("image/png"));
    if (!pngItem) return "";
    const blob = await pngItem.getType("image/png");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  });
}

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator(".table-avatar").first().click();
await page.locator(".detail-modal .share-image-button").click();
await page.locator(".detail-modal .share-image-button", { hasText: "已复制到剪贴板" }).waitFor({ timeout: 60_000 });
const detailPngBytes = await clipboardPngSize();
const craftIdsVisible = await page.locator(".detail-modal .craft-card-meta").count();
await page.locator(".detail-modal .modal-close").click();

await page.locator(".table-compare").nth(0).click();
await page.locator(".table-compare").nth(1).click();
await page.locator(".open-compare").click();
await page.getByRole("button", { name: "雷达图" }).click();
await page.locator(".compare-modal .share-image-button").click();
await page.locator(".compare-modal .share-image-button", { hasText: "已复制到剪贴板" }).waitFor({ timeout: 60_000 });
const comparePngBytes = await clipboardPngSize();
const radarDataUrl = await clipboardPngDataUrl();
const radarSharePath = new URL("../.cache/compare-radar-share.png", import.meta.url);
await writeFile(radarSharePath, Buffer.from(radarDataUrl.split(",")[1] ?? "", "base64"));

console.log(JSON.stringify({ detailPngBytes, comparePngBytes, craftIdsVisible, radarSharePath: radarSharePath.pathname }, null, 2));
if (!detailPngBytes || !comparePngBytes || craftIdsVisible !== 0) process.exitCode = 1;
await browser.close();
