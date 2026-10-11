import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { formatAmmoEfficiency } from "../app/ammoEfficiencyData.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const baseUrl = process.argv[2] || "http://localhost:3100";
const data = JSON.parse(await fs.readFile(path.join(appRoot, "public/data/maidens.json"), "utf8"));
const technology = JSON.parse(await fs.readFile(path.join(appRoot, "public/data/technology-catalog.json"), "utf8"));
assert.equal(formatAmmoEfficiency(10000), "100%");
assert.equal(formatAmmoEfficiency(7599), "75%");
assert.equal(formatAmmoEfficiency(0), "0%");
assert.equal(formatAmmoEfficiency(undefined), "—");
const example = data.rows.find((r) => r.id === 6001).allAmmunition.find((a) => a.id === 5107);
assert.deepEqual(example.efficiency, { ground: 10000, air: 7500 });
for (const maiden of data.rows) {
  assert.ok(maiden.baseAmmoEfficiency);
  for (const ammo of [...maiden.ammunition, ...maiden.allAmmunition]) {
    assert.ok(Number.isFinite(ammo.efficiency.ground) && Number.isFinite(ammo.efficiency.air));
    assert.ok(!ammo.stats.some((stat) => /效率|TOGROUND|TOAIR/.test(stat.key)), "efficiency must not enter additive panel stats");
  }
}
const longest = data.rows.flatMap((r) => r.allAmmunition.map((a) => ({ maiden: r, ammo: a })))
  .sort((a, b) => b.ammo.name.length - a.ammo.name.length)[0];
const maiden = longest.maiden;
const playwrightRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot)).filter((p) => p.startsWith("chromium_headless_shell-"))
  .sort().reverse().map((p) => path.join(playwrightRoot, p, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
const out = path.join(appRoot, ".cache/ammunition-efficiency-ui");
await fs.mkdir(out, { recursive: true });
const errors = [];
let checked = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const openMaiden = async (id) => {
    const row = data.rows.find((r) => r.id === id);
    await page.locator(".search-box input").fill(row.tank);
    await page.locator(".search-box button").click();
    await page.locator(`tr[data-maiden-id="${id}"] .table-avatar`).click();
  };
  const checkLayout = async (selector) => {
    await page.locator(`${selector} .ammo-efficiency`).first().waitFor();
    const results = await page.locator(selector).evaluateAll((elements) => elements.map((card) => {
      const badge = card.querySelector(".ammo-efficiency");
      const title = card.querySelector(".ammo-title, .sim-craft-copy, header > div");
      if (!badge || !title) return { failure: "missing title/badge" };
      const box = badge.getBoundingClientRect();
      const container = card.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const items = [...badge.querySelectorAll(".ammo-efficiency-item")].map((el) => el.getBoundingClientRect());
      const text = document.createRange(); text.selectNodeContents(title);
      const textRight = Math.max(...[...text.getClientRects()].map((r) => r.right));
      return {
        name: title.textContent, textRight, titleRight: titleBox.right, badgeLeft: box.left,
        inside: box.right <= container.right + 1 && titleBox.left >= container.left - 1,
        stacked: items.length === 2 && Math.abs(items[0].left - items[1].left) < 1 && items[0].bottom <= items[1].top,
        loaded: [...badge.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
        values: [...badge.querySelectorAll("b")].map((b) => b.textContent),
      };
    }));
    for (const r of results) assert.ok(!r.failure && r.inside && r.stacked && r.loaded && r.titleRight <= r.badgeLeft + 1 && r.textRight <= r.badgeLeft + 1 && r.values.every((v) => /^\d+%$/.test(v)), JSON.stringify(r));
    checked += results.length;
  };
  await openMaiden(maiden.id);
  for (const width of [1600, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const rank of [1, 2, 3]) {
      await page.locator(".detail-modal .detail-loadout-heading").getByRole("button", { name: `弹药期数：${rank}期` }).click();
      await checkLayout(".detail-modal .ammo-card-ammunition");
    }
    await page.locator(".detail-modal .ammo-card-ammunition").filter({ hasText: longest.ammo.name }).first().screenshot({ path: path.join(out, `long-name-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 950 });
  const config = { level: 90, colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 }, equipment: maiden.slotDetails.map(() => ({ familyId: null, level: 1 })), ammoId: longest.ammo.id, bodyId: null, engineId: null, armorId: null, ordnance: { trendId: null, level: 0 }, tactics: { trendId: null, level: 0 } };
  await page.evaluate(({ id, config, blocks }) => {
    localStorage.setItem(`steel-loadout-vehicle-v1:${id}`, JSON.stringify(config));
    localStorage.setItem("steel-loadout-global-tech-v1", JSON.stringify(Object.fromEntries(blocks.map((b) => [b.id, 16]))));
  }, { id: maiden.id, config, blocks: technology.blocks });
  await page.locator(".detail-actions button", { hasText: "配装模拟" }).click();
  for (const width of [1280, 1050, 900, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await checkLayout(".sim-craft-card:first-child");
    await page.locator(".sim-craft-card").first().click();
    for (const rank of [1, 2, 3]) {
      await page.locator(".sim-picker-ranks").getByRole("button", { name: `弹药期数：${rank}期` }).click();
      await checkLayout(".sim-option-craft, .sim-option-base-ammo");
    }
    await page.locator(".sim-dialog").screenshot({ path: path.join(out, `picker-${width}.png`) });
    await page.getByRole("button", { name: "关闭选择", exact: true }).click();
    assert.ok(await page.locator(".sim-shell").evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    if (width === 1280) await page.locator(".sim-shell").screenshot({ path: path.join(out, "simulator.png") });
  }
  await page.locator(".sim-craft-card").first().click();
  await page.locator(".sim-option-base-ammo").click();
  await checkLayout(".sim-craft-card:first-child");
  assert.deepEqual(await page.locator(".sim-craft-card:first-child .ammo-efficiency b").allTextContents(), [maiden.baseAmmoEfficiency.ground, maiden.baseAmmoEfficiency.air].map(formatAmmoEfficiency));
  await page.getByRole("button", { name: "返回钢舞姬详情" }).click();
  await page.locator(".detail-modal .modal-close").click();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator(".search-box input").fill("");
  await page.locator(".search-box button").click();
  await page.locator(`tr[data-maiden-id="${maiden.id}"] .table-compare`).click();
  await page.locator(".table-compare").filter({ hasText: "+ 对比" }).first().click();
  await page.getByRole("button", { name: "开始比较 →" }).click();
  await checkLayout(".compare-modal .ammo-card-ammunition");
  await page.locator(".compare-modal .ammo-card-ammunition").first().screenshot({ path: path.join(out, "comparison.png") });
  await page.locator(".compare-modal .modal-close").click();
  await page.getByRole("button", { name: "科技", exact: true }).click();
  await page.locator(".technology-node").first().click();
  await page.locator(".technology-node").first().click();
  await checkLayout(".technology-detail-dialog");
  await page.locator(".technology-detail-dialog > header").screenshot({ path: path.join(out, "technology.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checkedCards: checked, longestAmmo: longest.ammo.name, maiden: maiden.tank, screenshots: out, errors }));
} finally {
  await browser.close();
}
