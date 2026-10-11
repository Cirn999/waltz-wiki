import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
const implementedRows = dataset.rows.filter((row) => row.implemented);
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const openMainFilter = async () => {
  await page.getByRole("button", { name: /筛选条件/ }).click();
  await page.locator(".filter-sheet").waitFor();
};
const row = (label) => page.locator(".filter-sheet .rank-filter-row").filter({ has: page.locator("strong", { hasText: label }) });
const apply = async () => {
  await page.locator(".filter-sheet .filter-confirm").click();
  await page.locator(".filter-sheet").waitFor({ state: "detached" });
};
const reset = async () => {
  await openMainFilter();
  await page.locator(".filter-sheet .filter-reset").click();
  await apply();
};
const expectedLabels = ["车种（或）", "国籍（或）", "稀有度（或）", "图纸（或）", "弹种（且）", "引擎抗性（且）", "车体抗性（且）", "才艺（且）", "狩猎任务（单选）"];
const assertFilterCoverage = async (context) => {
  const labels = await page.locator(".filter-sheet .rank-filter-row > strong").allTextContents();
  for (const expected of expectedLabels) if (!labels.includes(expected)) throw new Error(`${context} missing ${expected}`);
  if (await page.locator('.filter-sheet button[aria-label="魔改费用筛选"]').count() !== 1) throw new Error(`${context} missing 魔改费用`);
  return labels;
};

await openMainFilter();
const mainLabels = await assertFilterCoverage("Main filter");
await row("车种（或）").getByRole("button", { name: "自行火炮" }).click();
await row("车种（或）").getByRole("button", { name: "重型坦克" }).click();
if (await row("车种（或）").locator("button.active").count() !== 2) throw new Error("Main class filter is not multi-select");
await apply();
const expectedClassUnion = implementedRows.filter((item) => ["自行火炮", "重型坦克"].includes(item.className)).length;
const classUnionCount = await page.locator("tbody tr[data-maiden-id]").count();
if (classUnionCount !== expectedClassUnion) throw new Error(`OR class result mismatch: ${classUnionCount}/${expectedClassUnion}`);

await reset();
await openMainFilter();
await row("弹种（且）").getByRole("button", { name: "脱壳弹" }).click();
await row("弹种（且）").getByRole("button", { name: "火箭弹" }).click();
await apply();
const expectedAmmoIntersection = implementedRows.filter((item) => ["脱壳弹", "火箭弹"].every((type) => item.ammo.includes(type))).length;
const ammoIntersectionCount = await page.locator("tbody tr[data-maiden-id]").count();
if (ammoIntersectionCount !== expectedAmmoIntersection) throw new Error(`AND ammo result mismatch: ${ammoIntersectionCount}/${expectedAmmoIntersection}`);

await reset();
await openMainFilter();
const rarityButtons = row("稀有度（或）").locator("button");
const rarityNames = [await rarityButtons.nth(0).getAttribute("title"), await rarityButtons.nth(1).getAttribute("title")];
await rarityButtons.nth(0).click();
await rarityButtons.nth(1).click();
await apply();
const expectedRarityUnion = implementedRows.filter((item) => rarityNames.includes(item.rarity)).length;
const rarityUnionCount = await page.locator("tbody tr[data-maiden-id]").count();
if (rarityUnionCount !== expectedRarityUnion) throw new Error(`OR rarity result mismatch: ${rarityUnionCount}/${expectedRarityUnion}`);

await reset();
await openMainFilter();
await row("图纸（或）").getByRole("button", { name: "N1", exact: true }).click();
await apply();
const expectedStageCount = implementedRows.filter((item) => item.stage === "N1").length;
const stageCount = await page.locator("tbody tr[data-maiden-id]").count();
if (stageCount !== expectedStageCount) throw new Error(`Blueprint result mismatch: ${stageCount}/${expectedStageCount}`);

await reset();
await openMainFilter();
await page.locator('.filter-sheet button[aria-label="魔改费用筛选"]').click();
const costDialog = page.getByRole("dialog", { name: "魔改费用", exact: true });
const costOption = costDialog.locator(".magic-cost-option:not(:disabled)").first();
const costGroup = await costOption.getAttribute("aria-label");
await costOption.click();
await costDialog.getByRole("button", { name: "确定", exact: true }).click();
await apply();
const expectedCostCount = implementedRows.filter((item) => item.magicCostGroup === costGroup).length;
const costCount = await page.locator("tbody tr[data-maiden-id]").count();
if (costCount !== expectedCostCount) throw new Error(`Magic cost result mismatch: ${costCount}/${expectedCostCount}`);

await reset();
await openMainFilter();
const hunt = row("狩猎任务（单选）");
const huntButtons = hunt.locator("button");
await huntButtons.nth(0).click();
await huntButtons.nth(1).click();
if (await hunt.locator("button.active").count() !== 1 || await huntButtons.nth(0).getAttribute("aria-pressed") !== "false") throw new Error("Main hunt filter is not single-select");
await page.locator(".filter-sheet .filter-cancel").click();

await page.getByRole("button", { name: "柱状图", exact: true }).click();
await page.locator(".ac-candidates").getByRole("button", { name: /^筛选/ }).click();
const chartLabels = await assertFilterCoverage("Attribute chart filter");
await page.locator(".filter-sheet .filter-cancel").click();
await page.getByRole("button", { name: "关闭属性图表" }).click();

await page.locator(".table-avatar").first().click();
await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
const detailLabels = await assertFilterCoverage("Detail rank filter");
const detailClass = row("车种（或）");
await detailClass.locator("button").nth(0).click();
await detailClass.locator("button").nth(1).click();
if (await detailClass.locator("button.active").count() !== 2) throw new Error("Detail class filter is not multi-select");
const detailHunt = row("狩猎任务（单选）");
await detailHunt.locator("button").nth(0).click();
await detailHunt.locator("button").nth(1).click();
if (await detailHunt.locator("button.active").count() !== 1) throw new Error("Detail hunt filter is not single-select");

await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const screenshotPath = path.join(appRoot, ".cache", "multi-filter-audit.png");
await page.locator(".filter-sheet").screenshot({ path: screenshotPath });
console.log(JSON.stringify({ mainLabels, chartLabels, detailLabels, classUnionCount, expectedClassUnion, ammoIntersectionCount, expectedAmmoIntersection, rarityUnionCount, expectedRarityUnion, stageCount, expectedStageCount, costGroup, costCount, expectedCostCount, screenshotPath }, null, 2));
await browser.close();
