import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const catalog = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
let unevenGenerationTypes = 0;
for (const maiden of catalog.rows) {
  if (!Array.isArray(maiden.allAmmunition)) throw new Error(`${maiden.tank} lacks all-generation ammunition`);
  const highestByType = new Map();
  for (const ammo of maiden.allAmmunition) highestByType.set(ammo.type, Math.max(highestByType.get(ammo.type) ?? 0, ammo.rank));
  if (new Set(highestByType.values()).size > 1) unevenGenerationTypes += 1;
  const expected = maiden.allAmmunition.filter((ammo) => ammo.rank === highestByType.get(ammo.type)).map((ammo) => ammo.id).sort((left, right) => left - right);
  const actual = maiden.ammunition.map((ammo) => ammo.id).sort((left, right) => left - right);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`${maiden.tank} changed the existing highest-generation ammunition set`);
}
const maiden = catalog.rows.find((row) => {
  const types = new Set(row.allAmmunition.map((ammo) => ammo.type));
  return types.size >= 2 && [1, 2, 3].every((rank) => row.allAmmunition.some((ammo) => ammo.rank === rank));
});
if (!maiden) throw new Error("No maiden has multiple ammunition types across all three generations");

const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  const detail = page.locator(".detail-modal");
  const switcher = detail.locator(".detail-loadout-heading .technology-generation-tabs");
  if (await switcher.locator("button").count() !== 3) throw new Error("Ammunition does not have one shared generation switcher");
  const headingLayout = await detail.locator(".detail-loadout-heading").evaluate((heading) => ({ title: heading.querySelector("h3").textContent, gap: heading.querySelector(".technology-generation-tabs").getBoundingClientRect().left - heading.querySelector("h3").getBoundingClientRect().right }));
  if (headingLayout.title !== "弹药" || headingLayout.gap < 0 || headingLayout.gap > 16) throw new Error(`Ammunition generation switcher is not beside its short title: ${JSON.stringify(headingLayout)}`);
  const groupCount = new Set(maiden.allAmmunition.map((ammo) => ammo.type)).size;
  const craftRanksBefore = await detail.locator(".craft-type-group .technology-generation-tabs button[aria-pressed=true]").evaluateAll((buttons) => buttons.map((button) => button.title));
  for (const rank of [3, 1, 2]) {
    if (rank !== 3) await switcher.getByRole("button", { name: `弹药期数：${rank}期` }).click();
    const expectedCount = maiden.allAmmunition.filter((ammo) => ammo.rank === rank).length;
    const groups = detail.locator(".detail-loadout-section .ammo-type-groups > .ammo-type-group");
    if (await groups.count() !== groupCount) throw new Error(`${rank}期 lost an ammunition type heading`);
    const cards = detail.locator(".detail-loadout-section .ammo-type-groups .ammo-card");
    if (await cards.count() !== expectedCount) throw new Error(`${rank}期 card count is incorrect`);
    const shownRanks = await cards.locator(".ammo-rank").allTextContents();
    if (shownRanks.some((value) => value.trim() !== String(rank))) throw new Error(`${rank}期 includes another generation's ammunition`);
    if (await switcher.getByRole("button", { name: `弹药期数：${rank}期` }).getAttribute("aria-pressed") !== "true") throw new Error(`${rank}期 switcher is not active`);
  }
  const craftRanksAfter = await detail.locator(".craft-type-group .technology-generation-tabs button[aria-pressed=true]").evaluateAll((buttons) => buttons.map((button) => button.title));
  if (JSON.stringify(craftRanksBefore) !== JSON.stringify(craftRanksAfter)) throw new Error("Ammunition switcher changed craft generation selections");
  console.log(`All ${groupCount} ammunition types switch together for ${maiden.tank} (#${maiden.id}); previous highest-generation data remains unchanged for ${catalog.rows.length} maidens; ${unevenGenerationTypes} maidens have ammunition types with different highest generations.`);
} finally {
  await browser.close();
}
