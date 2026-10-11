import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const technologyData = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "technology-catalog.json"), "utf8"));
const resourceNames = new Set(technologyData.blocks.flatMap((block) => block.levels).flatMap((level) => level.cost).map((material) => material.name));
if (!["秘密计划", "演算模块"].every((name) => resourceNames.has(name))) throw new Error(`Technology resource names are incomplete: ${[...resourceNames].join(", ")}`);
const technologyNodes = technologyData.blocks.flatMap((block) => block.nodes.map((node) => ({ block: block.title, ...node })));
const missingNodeStats = technologyNodes.filter((node) => !node.stats.length);
if (missingNodeStats.length) throw new Error(`Technology nodes are missing panel stats: ${missingNodeStats.map((node) => `${node.block}/${node.name}`).join(", ")}`);
const turretHeavyBody = technologyNodes.find((node) => node.name === "炮塔型超重车体");
const turretHeavyBodyStats = new Map((turretHeavyBody?.stats ?? []).map((stat) => [stat.key, stat.value]));
const expectedTurretHeavyBodyStats = new Map([["火力", 125], ["耐久", 620], ["隐蔽", -20], ["装甲", 105], ["命中", 30]]);
if (!turretHeavyBody || [...expectedTurretHeavyBodyStats].some(([key, value]) => turretHeavyBodyStats.get(key) !== value)) throw new Error(`炮塔型超重车体 panel stats mismatch: ${JSON.stringify(turretHeavyBody?.stats ?? [])}`);
for (const block of technologyData.blocks) {
  if (block.levels.length !== 16) throw new Error(`${block.title} does not contain 16 research levels`);
  const totals = new Map();
  for (const level of block.levels) {
    if (!level.commanderLevel || !level.ruleId || !level.cost.length) throw new Error(`${block.title} level ${level.level} is missing research requirements`);
    for (const material of level.cost) totals.set(material.fundId, (totals.get(material.fundId) ?? 0) + material.amount);
    const cumulative = new Map(level.cumulativeCost.map((material) => [material.fundId, material.amount]));
    for (const [fundId, amount] of totals) if (cumulative.get(fundId) !== amount) throw new Error(`${block.title} level ${level.level} cumulative cost mismatch for fund ${fundId}`);
  }
}
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "科技", exact: true }).click();
await page.locator(".technology-archive").waitFor();
const categories = await page.locator(".technology-primary-tabs button span").allTextContents();
if (categories.join("|") !== "主炮|防护|车体|引擎|侦查") throw new Error(`Unexpected technology categories: ${categories}`);
if (await page.locator(".technology-node").count() < 7) throw new Error("Technology tree nodes were not rendered");
if (await page.locator(".technology-level-table-wrap tbody tr").count() !== 16) throw new Error("Technology level table does not contain 16 rows");
const levelHeaders = await page.locator(".technology-level-table-wrap thead").innerText();
if (!["指挥官等级", "研究该级消耗", "累计消耗（1级至当前）"].every((label) => levelHeaders.includes(label))) throw new Error(`Technology level table is missing research columns: ${levelHeaders}`);
const firstLevelText = await page.locator(".technology-level-table-wrap tbody tr").first().innerText();
if (!firstLevelText.includes("4") || !firstLevelText.includes("密码子") || !firstLevelText.includes("25")) throw new Error(`Technology level 1 research data mismatch: ${firstLevelText}`);
const finalCumulativeText = await page.locator(".technology-level-table-wrap tbody tr").last().locator(".technology-material-cell").last().innerText();
if (!["密码子", "88,945", "战车残骸", "967", "N1图谱", "170"].every((value) => finalCumulativeText.includes(value))) throw new Error(`Technology cumulative research data mismatch: ${finalCumulativeText}`);
if (await page.locator(".technology-stage-axis span").count() !== 6) throw new Error("Technology stage axis does not contain six levels");
if (await page.locator(".technology-generation-tabs img").count() !== 3) throw new Error("Technology generation selectors do not use the three rank icons");
const generationIconSizes = await page.locator(".technology-generation-tabs img").evaluateAll((images) => images.map((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })));
if (generationIconSizes.some((size) => Math.abs(size.width - generationIconSizes[0].width) > 0.1)) throw new Error(`Technology generation icons do not have equal widths: ${JSON.stringify(generationIconSizes)}`);
if (new Set(generationIconSizes.map((size) => Math.round(size.height))).size === 1) throw new Error(`Technology generation icons still force every sprite to the same height: ${JSON.stringify(generationIconSizes)}`);
const thirdGenerationIconFit = await page.locator(".technology-generation-tabs button").nth(2).evaluate((button) => {
  const style = getComputedStyle(button);
  const inset = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth].reduce((sum, value) => sum + parseFloat(value), 0);
  return { imageHeight: button.querySelector("img").getBoundingClientRect().height, contentHeight: button.getBoundingClientRect().height - inset };
});
if (Math.abs(thirdGenerationIconFit.imageHeight - thirdGenerationIconFit.contentHeight) > 1.5) throw new Error(`Third technology generation icon does not fit its button cell: ${JSON.stringify(thirdGenerationIconFit)}`);
if ((await page.locator(".technology-node").first().innerText()).includes("#")) throw new Error("Technology node still exposes its internal resource id");
await page.locator(".technology-node").first().click();
if (await page.locator(".technology-node.active").count() < 1) throw new Error("Selecting a node did not highlight its path");
await page.locator(".technology-node").first().click();
await page.locator(".technology-detail-dialog").waitFor();
const detailTitle = await page.locator(".technology-detail-dialog h2").innerText();
const detailText = await page.locator(".technology-detail-dialog").innerText();
if (detailText.includes("客户端未配置额外释义")) throw new Error("Technology detail still renders the missing-description placeholder");
if (detailText.includes("射程")) throw new Error("Ammunition technology detail still renders range");
const detailBox = await page.locator(".technology-detail-dialog").boundingBox();
if (!detailBox || Math.abs(detailBox.x + detailBox.width / 2 - 800) > 3 || Math.abs(detailBox.y + detailBox.height / 2 - 500) > 3) throw new Error(`Technology detail is not centered: ${JSON.stringify(detailBox)}`);
await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const detailScreenshotPath = path.join(appRoot, ".cache", "technology-detail.png");
await page.screenshot({ path: detailScreenshotPath, fullPage: false });
const mainCompatibilityCount = await page.locator(".technology-maiden-matrix button").count();
if (mainCompatibilityCount < 1) throw new Error("Main-gun technology detail does not list compatible maidens");
await page.locator(".technology-compatible-section").scrollIntoViewIfNeeded();
const compatibilityScreenshotPath = path.join(appRoot, ".cache", "technology-compatible-maidens.png");
await page.screenshot({ path: compatibilityScreenshotPath, fullPage: false });
await page.locator(".technology-maiden-matrix button").first().click();
await page.locator(".detail-modal").waitFor();
const linkedMaidenTitle = await page.locator(".detail-modal h2").innerText();
await page.locator(".detail-modal .modal-close").click();
await page.locator(".technology-generation-tabs button").nth(2).click();
await page.getByRole("button", { name: "榴弹", exact: true }).click();
const level4 = await page.locator(".technology-level-table-wrap tbody tr").nth(3).allTextContents();
if (!level4.join(" ").includes("40%") || !level4.join(" ").includes("22%")) throw new Error(`Third-generation HE level 4 mismatch: ${level4}`);
await page.locator(".technology-primary-tabs button").filter({ hasText: "车体" }).click();
const expectedBodyOrder = ["防护型轮式高强度车体", "架设重炮型高强度车体", "炮塔型扁平高强度车体", "同轴多主炮型高强度车体", "炮塔型超重高强度车体"];
const bodyPositions = await page.locator(".technology-node").evaluateAll((nodes, names) => names.map((name) => {
  const node = nodes.find((candidate) => candidate.textContent?.includes(name));
  if (!node) throw new Error(`Missing third-generation body technology: ${name}`);
  return { name, y: node.getBoundingClientRect().y };
}), expectedBodyOrder);
if (bodyPositions.some((entry, index) => index > 0 && entry.y <= bodyPositions[index - 1].y)) throw new Error(`Third-generation body order mismatch: ${JSON.stringify(bodyPositions)}`);
const compatibilityCounts = { 主炮: mainCompatibilityCount };
for (const categoryName of ["防护", "车体", "引擎"]) {
  await page.locator(".technology-primary-tabs button").filter({ hasText: categoryName }).click();
  const node = page.locator(".technology-node").first();
  await node.click();
  await node.click();
  await page.locator(".technology-detail-dialog").waitFor();
  compatibilityCounts[categoryName] = await page.locator(".technology-maiden-matrix button").count();
  if (compatibilityCounts[categoryName] < 1) throw new Error(`${categoryName} technology detail does not list compatible maidens`);
  await page.locator(".technology-detail-dialog .modal-close").click();
}
await page.locator(".technology-primary-tabs button").filter({ hasText: "车体" }).click();
await page.locator(".technology-generation-tabs button").first().click();
const turretHeavyBodyNode = page.locator(".technology-node").filter({ hasText: "炮塔型超重车体" });
await turretHeavyBodyNode.click();
await turretHeavyBodyNode.click();
await page.locator(".technology-detail-dialog").waitFor();
const turretHeavyBodyDetail = await page.locator(".technology-detail-stats").innerText();
if (!["火力\n125", "耐久\n620", "隐蔽\n-20", "装甲\n105", "命中\n30"].every((value) => turretHeavyBodyDetail.includes(value))) throw new Error(`炮塔型超重车体 UI stats mismatch: ${turretHeavyBodyDetail}`);
await page.locator(".technology-detail-dialog .modal-close").click();
await page.locator(".technology-primary-tabs button").filter({ hasText: "侦查" }).click();
if (await page.locator(".technology-empty-tree").count() !== 1) throw new Error("Recon technology empty tree area was not preserved");
if ((await page.locator(".technology-empty-tree").innerText()).trim()) throw new Error("Recon technology empty tree area still renders explanatory text");
await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
const screenshotPath = path.join(appRoot, ".cache", "technology-page.png");
await page.screenshot({ path: screenshotPath, fullPage: true });
console.log(JSON.stringify({ categories, technologyNodeCount: technologyNodes.length, missingNodeStats: missingNodeStats.length, turretHeavyBodyStats: Object.fromEntries(turretHeavyBodyStats), detailTitle, linkedMaidenTitle, compatibilityCounts, level4, screenshotPath, detailScreenshotPath, compatibilityScreenshotPath }, null, 2));
await browser.close();
