import { chromium } from "playwright";
import path from "node:path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const outputPath = path.resolve(import.meta.dirname, "..", ".cache", "attribute-icons-audit.png");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
const hiddenAmmoCells = await page.locator(".ammo-table-cell").count();
const hiddenAmmoCards = await page.locator(".ammo-card").count();
await page.getByRole("button", { name: "显示弹药" }).click();
await page.locator(".ammo-card").first().waitFor();
const virtualizedAmmoCards = await page.locator(".ammo-card").count();
await page.locator(".search-box input").fill("LOSAT");
await page.locator(".ammo-card").first().waitFor();
const images = await page.locator('.ammo-stats img[src*="/art/attributes/"]').evaluateAll((nodes) => nodes.map((node) => ({
  src: node.getAttribute("src"),
  naturalWidth: node.naturalWidth,
  naturalHeight: node.naturalHeight,
})));
const layout = await page.locator(".ammo-card").last().evaluate((card) => {
  const stats = [...card.querySelectorAll(".ammo-stats > span")].map((node) => {
    const icon = node.querySelector("i").getBoundingClientRect();
    const value = node.querySelector("b").getBoundingClientRect();
    return { iconX: Math.round(icon.x), valueX: Math.round(value.x), valueCenter: Math.round(value.x + value.width / 2), textAlign: getComputedStyle(node.querySelector("b")).textAlign };
  });
  const effects = [...card.querySelectorAll(".ammo-effects > span")].map((node) => Math.round(node.getBoundingClientRect().x));
  return { cardWidth: Math.round(card.getBoundingClientRect().width), stats, effects };
});
await page.locator(".ammo-card").first().scrollIntoViewIfNeeded();
await page.locator(".ammo-card").first().screenshot({ path: outputPath });
await browser.close();

const repeatedStatColumnsAligned = layout.stats.slice(4).every((position, index) => {
  const firstRow = layout.stats[index];
  return firstRow && position.iconX === firstRow.iconX && position.valueCenter === firstRow.valueCenter;
});
if (
  hiddenAmmoCells !== 0 ||
  hiddenAmmoCards !== 0 ||
  virtualizedAmmoCards >= 100 ||
  images.length < 5 ||
  images.some((image) => !image.naturalWidth || !image.naturalHeight) ||
  layout.cardWidth > 300 ||
  layout.effects.length > 4 ||
  layout.stats.some((position) => position.textAlign !== "center") ||
  !repeatedStatColumnsAligned
) {
  throw new Error(`attribute icon audit failed: ${JSON.stringify(images)}`);
}
console.log(JSON.stringify({ outputPath, hiddenAmmoCells, hiddenAmmoCards, virtualizedAmmoCards, layout, icons: images }, null, 2));
