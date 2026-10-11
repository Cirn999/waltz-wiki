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
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.locator(".search-box input").fill("T39");
await page.locator(".search-box button").click();
await page.locator("tbody tr[data-maiden-id]").first().waitFor();
await page.locator(".table-avatar").first().click();

const section = page.locator(".detail-modal .magic-ordnance-section");
await section.waitFor();
if (await section.locator("#magic-upgrade-path").count()) throw new Error("Manual magic recipe selector should be removed");
const ordnanceRequirement = await section.locator(".magic-detail-block").nth(1).innerText();
if (!ordnanceRequirement.includes("综合索敌等级 ≥ 22") || !ordnanceRequirement.includes("密码子 × 2500")) {
  throw new Error(`T39 should use its own ordnance recipe: ${ordnanceRequirement}`);
}
const missingMaterialIcons = await section.locator(".magic-materials img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
if (missingMaterialIcons) throw new Error(`${missingMaterialIcons} upgrade material icons failed to load`);
const eagleIcon = section.locator(".magic-requirements .magic-mark img");
if (await eagleIcon.count() !== 1 || !await eagleIcon.evaluate((image) => image.complete && image.naturalWidth > 0)) {
  throw new Error("Eagle-mark requirement icon is missing");
}
const cards = section.locator(".magic-skill-picker button");
if (await cards.count() !== 4) throw new Error(`T39 expected 4 ordnance cards, got ${await cards.count()}`);

const expectedNames = ["多重火力装置", "附配掩体", "应急掩护", "分析打击"];
const names = await cards.locator("strong").allTextContents();
if (expectedNames.some((name) => !names.includes(name))) throw new Error(`Wrong T39 ordnance set: ${names.join(", ")}`);
const brokenImages = await cards.locator("img").evaluateAll((images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length);
if (brokenImages) throw new Error(`${brokenImages} ordnance icons failed to load`);

const input = section.locator(".magic-level-stepper input");
const effect = section.locator(".magic-detail-block").first().locator("p").nth(1);
const levelOne = await effect.innerText();
await section.locator(".magic-level-stepper button").last().click();
const levelTwo = await effect.innerText();
await input.fill("10");
await input.press("Enter");
const levelTen = await effect.innerText();
if (levelOne === levelTwo || levelTwo === levelTen) {
  throw new Error(`Level switch did not update the effect: ${levelOne} / ${levelTwo} / ${levelTen}`);
}
if (!await section.getByText("升级到该级消耗").count()) throw new Error("Upgrade materials are missing");
await input.fill("5");
await input.press("Enter");
await cards.nth(1).click();
if (await input.inputValue() !== "5") throw new Error("Switching ordnance skills reset the magic level");
await section.getByRole("tab", { name: /战术/ }).click();
if (await input.inputValue() !== "5") throw new Error("Switching to tactics reset the magic level");
await input.fill("0");
await input.press("Enter");
if (!await section.getByText("未魔改：", { exact: false }).count()) throw new Error("Unmodified level is missing");
await input.fill("1");
await input.press("Enter");
const tacticRequirement = await section.locator(".magic-detail-block").nth(1).innerText();
if (!tacticRequirement.includes("综合索敌等级 ≥ 22") || !tacticRequirement.includes("软钢 × 49")) {
  throw new Error(`T39 should use its own tactics recipe: ${tacticRequirement}`);
}
const tacticCount = await section.locator(".magic-skill-picker button").count();
if (tacticCount !== 11) throw new Error(`Expected 11 tactics, got ${tacticCount}`);
const tacticDescription = await section.locator(".magic-detail-block").first().innerText();
if (!tacticDescription.includes("装备提供")) throw new Error("Tactic level effect is missing");
await section.locator(".magic-level-table summary").click();
const levelRows = await section.locator(".magic-level-table tbody tr").count();
if (levelRows !== 10) throw new Error(`Expected 10 tactic progression rows, got ${levelRows}`);

await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const screenshotPath = path.join(appRoot, ".cache", "magic-ordnance-t39-audit.png");
await section.screenshot({ path: screenshotPath });
await input.fill("5");
await input.press("Enter");
await page.locator(".detail-modal .modal-close").click();
await page.locator(".table-avatar").first().click();
if (await section.locator(".magic-level-stepper input").inputValue() !== "5") {
  throw new Error("Reopening the same maiden did not restore the magic level");
}
console.log(JSON.stringify({ names, brokenImages, missingMaterialIcons, levelOne, levelTwo, levelTen, ordnanceRequirement, tacticRequirement, tacticCount, levelRows, tacticDescription, persistedLevel: 5, screenshotPath }, null, 2));
await browser.close();
