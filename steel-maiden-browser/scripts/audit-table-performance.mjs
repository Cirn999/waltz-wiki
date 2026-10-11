import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const dataset = JSON.parse(await readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const ammoOrder = ["常规弹", "硬芯弹", "脱壳弹", "榴弹", "火箭弹", "破甲弹", "碎甲弹"];
const datasetAmmoTypes = [...new Set(dataset.rows.flatMap((row) => row.ammo))].sort();
const datasetAmmoTypeCounts = Object.fromEntries(datasetAmmoTypes.map((type) => [type, dataset.rows.filter((row) => row.ammo.includes(type)).length]));
const ammoText = (types) => [...new Set(types)]
  .sort((left, right) => {
    const leftOrder = ammoOrder.indexOf(left);
    const rightOrder = ammoOrder.indexOf(right);
    return (leftOrder < 0 ? ammoOrder.length : leftOrder) - (rightOrder < 0 ? ammoOrder.length : rightOrder)
      || left.localeCompare(right, "zh-CN");
  })
  .map((type) => type === "榴弹" ? type : type.replace(/弹$/, ""))
  .join("、") || "—";
const sample = [...dataset.rows].sort((left, right) => new Set(right.ammo).size - new Set(left.ammo).size)[0];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
});
const page = await browser.newPage({ viewport: { width: 1920, height: 929 }, deviceScaleFactor: 1 });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const table = {
  rows: await page.locator(".maiden-table tbody tr").count(),
  ammoCells: await page.locator(".maiden-table .table-ammo-text").count(),
  ammoCards: await page.locator(".maiden-table .ammo-card").count(),
  toggleButtons: await page.getByRole("button", { name: /显示弹药|隐藏弹药/ }).count(),
  header: await page.locator(".maiden-table thead").innerText(),
  layout: await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
    };
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      scrollLeft: document.documentElement.scrollLeft,
      header: rect(".site-header"),
      controls: rect(".control-panel"),
      archive: rect(".table-archive"),
      table: rect(".maiden-table"),
    };
  }),
};
const sampleRow = page.locator(`.maiden-table tbody tr[data-maiden-id="${sample.id}"]`);
await sampleRow.scrollIntoViewIfNeeded();
await page.waitForTimeout(80);
const sampleText = await sampleRow.locator(".table-ammo-text").innerText();
await page.screenshot({ path: ".cache/table-ammunition-text.png", fullPage: false });
await sampleRow.locator(".table-avatar").click();
await page.locator(".detail-modal").waitFor();
const detailAmmoCards = await page.locator(".detail-modal .ammo-card:not(.craft-card)").count();
await browser.close();

const expectedText = ammoText(sample.ammo);
if (
  table.rows !== dataset.rows.length || table.ammoCells !== dataset.rows.length ||
  table.ammoCards !== 0 || table.toggleButtons !== 0 || !table.header.includes("弹药") ||
  sampleText !== expectedText || detailAmmoCards < 1 || table.layout.archive.left > 24
) {
  throw new Error(`table ammunition audit failed: ${JSON.stringify({ table, sample: { id: sample.id, tank: sample.tank, expectedText, sampleText }, detailAmmoCards })}`);
}
console.log(JSON.stringify({ table, datasetAmmoTypes, datasetAmmoTypeCounts, sample: { id: sample.id, tank: sample.tank, expectedText, sampleText }, detailAmmoCards }, null, 2));
