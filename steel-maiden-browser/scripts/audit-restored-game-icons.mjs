import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { restoredGameIcons } from "./restored-game-icons.mjs";

const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const nations = restoredGameIcons.filter((icon) => icon.nationTypeId);
const samples = nations.map((icon) => data.rows.find((row) => row.nationTypeId === icon.nationTypeId));
const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(root)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(root, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://localhost:3100", { waitUntil: "networkidle" });
  const checkImage = async (locator, src) => {
    assert.equal(await locator.count(), 1);
    assert.equal(await locator.getAttribute("src"), src);
    await locator.scrollIntoViewIfNeeded();
    await locator.evaluate((img) => img.decode());
    assert.ok(await locator.evaluate((img) => img.naturalWidth > 0));
  };
  const checkFilter = async () => {
    const filter = page.locator(".filter-sheet");
    for (const icon of nations) {
      await checkImage(filter.getByRole("button", { name: icon.nation, exact: true }).locator("img"), data.gameIcons.nations[icon.nationTypeId]);
    }
    const borders = await filter.locator(".filter-row-stage, .magic-cost-filter").evaluateAll((els) => els.map((el) => {
      const style = getComputedStyle(el);
      return [style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor];
    }));
    assert.deepEqual(borders[0], borders[1]);
    assert.equal(borders[1][0], "1px");
    await filter.locator(".filter-cancel").click();
  };
  await page.getByRole("button", { name: /筛选条件/ }).click();
  await checkFilter();
  await page.getByRole("button", { name: /列设置/ }).click();
  await page.locator(".table-column-setting").filter({ hasText: "国籍" }).locator("input").check();
  await page.getByRole("button", { name: "关闭列设置" }).click();
  for (const sample of samples) {
    await page.locator(".search-box input").fill(sample.tank);
    await page.locator(".search-box button").click();
    const row = page.locator(`tbody tr[data-maiden-id="${sample.id}"]`);
    await checkImage(row.locator(".game-icon-nation img"), sample.nationIcon);
    await row.locator(".table-avatar").click();
    await checkImage(page.locator(".detail-modal .game-icon-nation img"), sample.nationIcon);
    if (sample === samples[0]) {
      await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
      await checkFilter();
    }
    await page.locator(".detail-actions button", { hasText: "配装模拟" }).click();
    await checkImage(page.locator(".sim-identity-nation"), sample.nationIcon);
    await page.locator(".sim-header .sim-close").click();
    await page.locator(".detail-modal .modal-close").click();
    if (samples.indexOf(sample) < 2) await row.locator(".table-compare").click();
  }
  await page.getByRole("button", { name: "开始比较 →" }).click();
  for (const sample of samples.slice(0, 2)) {
    await checkImage(page.locator(".compare-identity").filter({ has: page.getByRole("heading", { name: sample.tank, exact: true }) }).locator(".game-icon-nation img"), sample.nationIcon);
  }
  await page.locator(".compare-modal .modal-close").click();
  const airSelectors = new Set(Object.values(data.magicProgression.progression).flatMap((stage) => Object.values(stage).flatMap((kinds) => kinds.ordnance)).filter((entry) => entry.levels[0]?.markKind === "金桨").map((entry) => entry.selectorId));
  const aircraft = data.rows.find((row) => airSelectors.has(row.magicSelectors.ordnance));
  assert.ok(aircraft);
  await page.locator(".search-box input").fill(aircraft.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${aircraft.id}"] .table-avatar`).click();
  const magic = page.locator(".detail-modal .magic-ordnance-section");
  for (const name of [/辎械/, /战术/]) {
    await magic.getByRole("tab", { name }).click();
    await checkImage(magic.locator(".magic-requirements .magic-mark img"), data.magicProgression.markIcons["金桨"]);
  }
  await magic.screenshot({ path: fileURLToPath(new URL("../.cache/restored-gold-propeller-ui.png", import.meta.url)) });
  await page.locator(".detail-modal .modal-close").click();
  await page.getByRole("button", { name: /^钢舞姬/ }).hover();
  await page.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  for (const sample of samples) {
    await page.locator(".search-box input").fill(sample.tank);
    await page.locator(".search-box button").click();
    await checkImage(page.locator(".atlas-card-face .atlas-nation").first(), sample.nationIcon);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ nations: samples.map((row) => row.nation), aircraft: aircraft.tank, checked: ["both filters", "table", "detail", "loadout", "comparison", "cards", "ordnance/tactics gold propeller"], errors }));
} finally {
  await browser.close();
}
