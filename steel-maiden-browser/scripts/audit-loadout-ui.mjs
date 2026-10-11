import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill("T39");
  await page.locator(".search-box button").click();
  await page.locator(".maiden-table tbody tr[data-maiden-id]").first().waitFor();
  await page.locator(".table-avatar").first().click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  const sim = page.locator(".sim-shell");
  await sim.waitFor();
  await page.waitForFunction(() => document.querySelector('.sim-stat strong')?.textContent !== '—');
  assert.equal(await sim.locator("input[aria-label='钢舞姬等级']").inputValue(), "1");
  assert.ok((await sim.locator(".sim-craft-card").first().innerText()).includes("基础穿甲弹"));
  assert.equal(await sim.getByText("配置科技").count(), 0);
  assert.equal(await sim.locator(".sim-tech-tile").count(), 5);
  await page.waitForFunction(() => [...document.querySelectorAll(".sim-tech-tile img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  const techSprites = await sim.locator(".sim-tech-tile").evaluateAll((tiles) => tiles.map((tile) => ({
    background: tile.querySelector(".sim-tech-backdrop")?.getAttribute("src"),
    symbol: tile.querySelector(".sim-tech-symbol")?.getAttribute("src"),
    loaded: [...tile.querySelectorAll("img")].every((image) => image.complete && image.naturalWidth > 0),
  })));
  assert.ok(techSprites.every((sprite) => sprite.background?.startsWith("/art/technology/resume/") && sprite.symbol?.startsWith("/art/technology/resume/") && sprite.loaded), "technology tiles should use loaded client resume sprites");
  assert.equal(await sim.locator(".sim-tech-inactive").count(), 0, "native defense research applies even without an armor craft");
  const defenseTile = sim.locator('.sim-tech-tile').nth(1);
  assert.ok(await sim.locator(".sim-equipment-slot").count() > 0);
  const firstEmptySlot = sim.locator(".sim-equipment-slot.empty").first();
  assert.match(await firstEmptySlot.locator("button > img:first-child").getAttribute("src"), /\/art\/slots\/ico-mark\/ico_mark-ico_mark-0[1-7]\.png$/);
  assert.match(await firstEmptySlot.locator(".sim-slot-badge").getAttribute("src"), /\/art\/slots\/djbj-\d+\.webp$/);
  const desktopLayout = await sim.evaluate((element) => {
    const portrait = element.querySelector(".sim-portrait").getBoundingClientRect();
    const craft = element.querySelector(".sim-craft-card").getBoundingClientRect();
    const colonization = element.querySelector(".sim-colonization").getBoundingClientRect();
    const tech = [...element.querySelectorAll(".sim-tech-tile")].map((tile) => tile.getBoundingClientRect());
    return { width: element.getBoundingClientRect().width, portraitTop: portrait.top, craftTop: craft.top, colonizationWidth: colonization.width, techWidth: tech[0].width, techRows: tech.map((tile) => tile.top) };
  });
  assert.ok(desktopLayout.width <= 1300 && Math.abs(desktopLayout.portraitTop - desktopLayout.craftTop) < 1, "portrait should align with the first craft row in the narrower modal");
  assert.ok(desktopLayout.techWidth <= 145 && Math.abs(desktopLayout.colonizationWidth - desktopLayout.techWidth) < 1, "colonization and technology cards should share narrow three-column tracks");
  assert.ok(desktopLayout.techRows.slice(0, 3).every((top) => Math.abs(top - desktopLayout.techRows[0]) < 1) && desktopLayout.techRows.slice(3).every((top) => top > desktopLayout.techRows[0]), "five technology cards should form three cards above two");
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  const desktopScreenshot = path.join(root, ".cache", "loadout-desktop.png");
  await sim.screenshot({ path: desktopScreenshot });
  const desktopGeometry = await sim.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    footerBottom: element.querySelector(".sim-footer")?.getBoundingClientRect().bottom - element.getBoundingClientRect().top,
    craftToEquipmentGap: element.querySelector(".sim-equipment-heading").getBoundingClientRect().top - element.querySelector(".sim-craft-layout").getBoundingClientRect().bottom,
    magicToTechnologyGap: element.querySelectorAll(".sim-adjust-panel .sim-panel-divider")[1].getBoundingClientRect().top - element.querySelector(".sim-magic-list").getBoundingClientRect().bottom,
  }));
  assert.ok(desktopGeometry.clientHeight < 950 && desktopGeometry.craftToEquipmentGap < 25 && desktopGeometry.magicToTechnologyGap < 25, "desktop modal should fit its content without large internal gaps");

  await sim.locator(".sim-tech-tile").first().click();
  const editor = page.locator(".sim-dialog");
  await editor.locator("input[aria-label='1期科技等级']").fill("6");
  await editor.getByRole("button", { name: "保存科技等级" }).click();
  const catalog = JSON.parse(await fs.readFile(path.join(root, "public/data/technology-catalog.json"), "utf8"));
  const savedTech = await page.evaluate(() => JSON.parse(localStorage.getItem("steel-loadout-global-tech-v1") ?? "{}"));
  assert.ok(catalog.blocks.filter((block) => block.category === "主炮" && block.generation === 1).every((block) => savedTech[block.id] === 6), "all ammunition branches should receive the same first-generation level");
  await sim.locator(".sim-craft-card").first().click();
  const firstAmmo = page.locator(".sim-dialog .sim-option:not(.sim-option-base-ammo):not(.sim-option-empty):not(.locked) > button:first-child", { hasText: "火箭弹" }).first();
  await firstAmmo.waitFor();
  await firstAmmo.click();
  assert.ok((await sim.locator(".sim-craft-card").first().innerText()).includes("火箭弹"));
  assert.ok(await sim.locator(".sim-craft-card").first().locator(".sim-craft-stats > span").count() > 0, "equipped ammunition should show its panel stats");
  assert.ok(await sim.locator(".sim-craft-card").first().locator(".sim-craft-effects > span").count() > 0, "equipped ammunition should show its traits");
  await sim.locator(".sim-equipment-slot > button").first().click();
  assert.ok(await page.locator(".sim-dialog .sim-equipment-option").count() > 0);
  await page.locator(".sim-dialog input[aria-label='待选择装备的等级']").fill("7");
  assert.equal(await page.locator(".sim-dialog .sim-equipment-option").first().locator("b").innerText(), "S7");
  const equipmentPickerScreenshot = path.join(root, ".cache", "loadout-equipment-picker.png");
  await page.locator(".sim-dialog").screenshot({ path: equipmentPickerScreenshot });
  await page.locator(".sim-dialog .sim-equipment-option").first().click();
  assert.equal(await sim.locator(".sim-equipment-slot").first().locator("b").innerText(), "S7");
  assert.equal(await sim.locator(".sim-equipment-slot input").count(), 0);
  await defenseTile.click();
  await page.locator(".sim-dialog input[aria-label='1期科技等级']").fill("6");
  await page.locator(".sim-dialog").getByRole("button", { name: "保存科技等级" }).click();
  assert.equal(await defenseTile.locator('strong').innerText(), "6");
  await sim.locator(".sim-craft-card[aria-label^='选择装甲']").click();
  await page.locator(".sim-dialog .sim-option:not(.sim-option-empty):not(.locked) > button:first-child").first().click();
  assert.equal(await sim.locator(".sim-tech-inactive").count(), 0, "equipping armor should activate its configured technology tile");
  await sim.getByRole("button", { name: "重置本车" }).click();
  assert.ok((await sim.locator(".sim-craft-card").first().innerText()).includes("基础穿甲弹"));
  assert.equal(await sim.locator(".sim-equipment-slot input").count(), 0);
  assert.equal(await sim.locator(".sim-tech-tile").first().locator("strong").innerText(), "6");
  assert.equal(await defenseTile.locator('strong').innerText(), "6", "reset preserves effective defense research while unequipping armor");
  const baseGrades = await sim.locator(".sim-grade small").allInnerTexts().then((values) => values.map(Number));
  await sim.locator(".sim-equipment-slot > button").nth(2).click();
  await page.locator(".sim-dialog input[aria-label='待选择装备的等级']").fill("1");
  await page.locator(".sim-dialog .sim-equipment-option:not(.advanced)", { hasText: "灭火器" }).first().click();
  assert.equal(Number(await sim.locator(".sim-grade small").first().innerText()), baseGrades[0] + 2, "S1 fire extinguisher should add its client ANTIFIRE value");
  await sim.locator(".sim-equipment-slot > button").nth(3).click();
  await page.locator(".sim-dialog input[aria-label='待选择装备的等级']").fill("1");
  await page.locator(".sim-dialog .sim-equipment-option:not(.advanced)", { hasText: "弹药水套" }).first().click();
  const gradesAfterWaterJacket = await sim.locator(".sim-grade small").allInnerTexts().then((values) => values.map(Number));
  assert.equal(gradesAfterWaterJacket[0], baseGrades[0] + 8, "water jacket's permanent fireproof bonus should stack with the fire extinguisher");
  assert.equal(gradesAfterWaterJacket[2], baseGrades[2], "battle-triggered 防爆 does not change the native static panel");
  await sim.locator(".sim-equipment-slot > button").nth(1).click();
  await page.locator(".sim-dialog input[aria-label='待选择装备的等级']").fill("1");
  await page.locator(".sim-dialog .sim-equipment-option:not(.advanced)", { hasText: "增固护板" }).first().click();
  const gradesAfterPlate = await sim.locator(".sim-grade small").allInnerTexts().then((values) => values.map(Number));
  assert.equal(gradesAfterPlate[1], baseGrades[1] + 1, "reinforced plate should add homogeneity");
  assert.equal(gradesAfterPlate[2], baseGrades[2] + 4, "reinforced plate contributes only its permanent covering to the native static panel");
  const hiddenGradesScreenshot = path.join(root, ".cache", "loadout-hidden-grades.png");
  await sim.screenshot({ path: hiddenGradesScreenshot });
  await sim.getByRole("button", { name: "返回钢舞姬详情" }).click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  assert.equal(await page.locator(".sim-tech-tile").first().locator("strong").innerText(), "6");

  await page.setViewportSize({ width: 900, height: 844 });
  const narrowLeft = await sim.locator(".sim-build-panel").boundingBox();
  const narrowRight = await sim.locator(".sim-adjust-panel").boundingBox();
  assert.ok(narrowLeft && narrowRight && narrowRight.y > narrowLeft.y, "900px viewport should stack panels before craft cards become cramped");
  const narrowScreenshot = path.join(root, ".cache", "loadout-narrow-desktop.png");
  await sim.evaluate((element) => { element.scrollTop = 0; });
  await sim.screenshot({ path: narrowScreenshot });
  await page.setViewportSize({ width: 720, height: 844 });
  const smallestDesktopLeft = await sim.locator(".sim-build-panel").boundingBox();
  const smallestDesktopRight = await sim.locator(".sim-adjust-panel").boundingBox();
  assert.ok(smallestDesktopLeft && smallestDesktopRight && smallestDesktopRight.y > smallestDesktopLeft.y, "720px viewport should keep craft cards readable in stacked panels");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileScreenshot = path.join(root, ".cache", "loadout-mobile.png");
  await page.locator(".sim-shell").screenshot({ path: mobileScreenshot });
  const mobileGeometry = await sim.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, footerBottom: element.querySelector(".sim-footer")?.getBoundingClientRect().bottom - element.getBoundingClientRect().top }));
  assert.ok(await sim.evaluate((element) => element.scrollWidth - element.clientWidth <= 1), "mobile simulator should not overflow horizontally");
  await sim.getByRole("button", { name: "复制分享图" }).click();
  await sim.getByRole("button", { name: "已复制图片" }).waitFor({ timeout: 60_000 });
  const clipboardBytes = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const png = items.find((item) => item.types.includes("image/png"));
    return png ? (await png.getType("image/png")).size : 0;
  });
  assert.ok(clipboardBytes > 10000, "share image should contain PNG data");
  const sharedData = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read()).find((entry) => entry.types.includes("image/png"));
    if (!item) return "";
    const blob = await item.getType("image/png");
    return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result ?? "")); reader.readAsDataURL(blob); });
  });
  const shareScreenshot = path.join(root, ".cache", "loadout-share-mobile.png");
  await fs.writeFile(shareScreenshot, Buffer.from(sharedData.split(",")[1] ?? "", "base64"));
  await sim.getByRole("button", { name: "返回钢舞姬详情" }).click();
  await page.locator(".detail-modal .modal-close").click();
  await page.locator(".search-box input").fill("Bf-109F");
  await page.locator(".search-box button").click();
  await page.locator(".maiden-table tbody tr[data-maiden-id]").first().waitFor();
  await page.locator(".table-avatar").first().click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  await page.locator(".sim-craft-card[aria-label^='选择引擎']").click();
  assert.ok(await page.locator(".sim-dialog .sim-option:not(.sim-option-empty)").count() > 0, "aircraft rank-zero source records should appear under first-generation engine choices");
  await page.locator(".sim-dialog button[aria-label='关闭选择']").click();
  await page.locator(".sim-equipment-slot > button").nth(6).click();
  assert.ok(await page.locator(".sim-dialog .sim-equipment-option").count() > 0, "aircraft common inner-wall slot should offer equipment");
  await page.locator(".sim-dialog button[aria-label='关闭选择']").click();
  await page.locator(".sim-shell button[aria-label='返回钢舞姬详情']").click();
  await page.locator(".detail-modal .modal-close").click();
  await page.locator(".search-box input").fill("缪");
  await page.locator(".search-box button").click();
  await page.locator(".maiden-table tbody tr[data-maiden-id]").first().waitFor();
  await page.locator(".table-avatar").first().click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  assert.ok((await page.locator(".sim-craft-card").first().innerText()).includes("基础脱壳弹"));
  await page.locator(".sim-craft-card").first().click();
  const muRocket = page.locator(".sim-dialog .sim-option:not(.locked) > button:first-child", { hasText: "火箭弹" }).first();
  await muRocket.waitFor();
  await muRocket.click();
  assert.ok((await page.locator(".sim-craft-card").first().innerText()).includes("火箭弹"));
  await page.setViewportSize({ width: 1497, height: 828 });
  await page.locator(".sim-shell input[aria-label='钢舞姬等级']").fill("90");
  const muScreenshot = path.join(root, ".cache", "loadout-mu-desktop.png");
  await page.locator(".sim-shell").screenshot({ path: muScreenshot });
  const muOverflow = await page.locator(".sim-shell").evaluate((element) => element.scrollWidth - element.clientWidth);
  assert.ok(muOverflow <= 1, "desktop simulator should not overflow horizontally");
  await sim.getByRole("button", { name: "返回钢舞姬详情" }).click();
  const maidens = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
  const mu = maidens.rows.find((row) => row.tank === "缪");
  assert.ok(mu, "the craft alignment fixture should contain 缪");
  const filledConfig = {
    level: 90,
    colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 },
    equipment: mu.slotDetails.map(() => ({ familyId: null, level: 1 })),
    ammoId: (mu.allAmmunition.find((item) => item.rank === 3 && item.effects.length > 0 && item.effects.length <= 2) ?? mu.allAmmunition.find((item) => item.rank === 3 && item.effects.length))?.id,
    bodyId: mu.bodyOptions.find((item) => item.rank === 3 && item.resistanceDetails.length >= 3)?.id,
    engineId: mu.engineOptions.find((item) => item.rank === 1 && item.resistanceDetails.length >= 2)?.id,
    armorId: mu.armorOptions.find((item) => item.rank === 3 && item.resistanceDetails.length)?.id,
    ordnance: { trendId: null, level: 0 }, tactics: { trendId: null, level: 0 },
  };
  assert.ok(filledConfig.ammoId && filledConfig.bodyId && filledConfig.engineId && filledConfig.armorId, "the fixture should have four craft cards with varied traits");
  await page.evaluate(({ id, config, technology }) => {
    localStorage.setItem(`steel-loadout-vehicle-v1:${id}`, JSON.stringify(config));
    localStorage.setItem("steel-loadout-global-tech-v1", JSON.stringify(technology));
  }, { id: mu.id, config: filledConfig, technology: Object.fromEntries(catalog.blocks.map((block) => [block.id, 16])) });
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  const traitRows = await sim.locator(".sim-craft-effects").evaluateAll((elements) => elements.map((element) => [...new Set([...element.children].map((chip) => Math.round(chip.getBoundingClientRect().top)))]).map((rows) => rows.length));
  assert.ok(traitRows[0] < traitRows[1], "the fixture should exercise one-line ammunition traits against multi-line body traits");
  const dividers = await sim.locator(".sim-craft-stats").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
  assert.equal(dividers.length, 4, "all four selected crafts should show their panel stats");
  assert.ok(Math.abs(dividers[0] - dividers[1]) < 1 && Math.abs(dividers[2] - dividers[3]) < 1, "trait/stat dividers should align across each pair of craft cards");
  const alignedBottoms = await sim.evaluate((element) => ({
    equipment: element.querySelector(".sim-equipment-slot > button").getBoundingClientRect().bottom,
    technology: [...element.querySelectorAll(".sim-tech-tile")].at(-1).getBoundingClientRect().bottom,
  }));
  assert.ok(Math.abs(alignedBottoms.equipment - alignedBottoms.technology) < 3, "technology cards should finish level with equipment slots");
  const craftAlignmentScreenshot = path.join(root, ".cache", "loadout-craft-alignment.png");
  await sim.screenshot({ path: craftAlignmentScreenshot });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ desktopScreenshot, narrowScreenshot, equipmentPickerScreenshot, hiddenGradesScreenshot, mobileScreenshot, shareScreenshot, muScreenshot, craftAlignmentScreenshot, desktopGeometry, mobileGeometry, clipboardBytes, aircraftEquipmentSlots: await page.locator(".sim-equipment-slot").count(), errors }));
} finally {
  await browser.close();
}
