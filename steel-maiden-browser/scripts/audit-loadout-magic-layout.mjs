import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://localhost:3100";
const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const technologies = JSON.parse(await fs.readFile(new URL("../public/data/technology-catalog.json", import.meta.url), "utf8"));
const maiden = data.rows.find((item) => item.tank === "迫击虎");
const tactic = data.magicProgression.tactics.find((item) => item.name === "火力构造定制");
assert.ok(maiden && tactic);
const ordnance = maiden.magicOrdnance[0];
const config = {
  level: 90,
  colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 },
  equipment: maiden.slotDetails.map(() => ({ familyId: null, level: 1 })),
  ammoId: 0, bodyId: null, engineId: null, armorId: null,
  tactics: { trendId: tactic.trendId, level: 1 }, ordnance: { trendId: ordnance.trendId, level: 1 },
};
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ id, config, tech }) => {
    localStorage.setItem(`steel-loadout-vehicle-v1:${id}`, JSON.stringify(config));
    localStorage.setItem("steel-loadout-global-tech-v1", JSON.stringify(tech));
  }, { id: maiden.id, config, tech: Object.fromEntries(technologies.blocks.map((block) => [block.id, 16])) });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  const sim = page.locator(".sim-shell");
  await page.waitForFunction(() => document.querySelector(".sim-stat strong")?.textContent !== "—");
  const tacticsCard = sim.locator('[data-magic-kind="tactics"]');
  const ordnanceCard = sim.locator('[data-magic-kind="ordnance"]');
  const checkGeometry = async (desktop) => {
    const result = await sim.evaluate((element) => {
      const rect = (selector) => element.querySelector(selector).getBoundingClientRect();
      const left = rect('[data-magic-kind="tactics"]');
      const right = rect('[data-magic-kind="ordnance"]');
      const art = rect(".sim-magic-art img");
      return {
        leftX: left.x, rightX: right.x, topGap: left.top - right.top,
        iconWidth: art.width,
        headingGap: rect(".sim-equipment-heading").top - rect(".sim-technology-heading").top,
        bottomGap: rect(".sim-equipment-slot > button").bottom - [...element.querySelectorAll(".sim-tech-tile")].at(-1).getBoundingClientRect().bottom,
        magicBottomGap: rect(".sim-magic-list").bottom - rect(".sim-craft-layout").bottom,
        clipped: [...element.querySelectorAll(".sim-magic-row, .sim-magic-effect, .sim-magic-select")].some((item) => item.scrollWidth > item.clientWidth + 1 || item.scrollHeight > item.clientHeight + 1),
        overflow: element.scrollWidth > element.clientWidth + 1,
      };
    });
    assert.ok(result.leftX < result.rightX && Math.abs(result.topGap) < 1, "tactics must be left of ordnance on the same row");
    assert.ok(result.iconWidth >= 60, "magic icons should be larger than the former 43px icons");
    assert.ok(!result.clipped && !result.overflow, "all effect text must remain visible");
    if (desktop) {
      assert.ok(Math.abs(result.headingGap) < 1, "technology and equipment headings must align");
      assert.ok(Math.abs(result.bottomGap) < 2, "technology and equipment cards must share the bottom edge");
      assert.ok(Math.abs(result.magicBottomGap) < 1, "magic cards must fill the space above the aligned bottom section");
    }
    return result;
  };
  const results = [];
  for (const level of [0, 1, 5, 10]) {
    await tacticsCard.getByRole("spinbutton", { name: "战术等级" }).fill(String(level));
    await ordnanceCard.getByRole("spinbutton", { name: "辎械等级" }).fill(String(level));
    if (level === 0) {
      assert.match(await tacticsCard.locator(".sim-magic-effect").innerText(), /未魔改/);
      assert.match(await ordnanceCard.locator(".sim-magic-effect").innerText(), /未魔改/);
    } else {
      assert.deepEqual(await tacticsCard.locator(".sim-magic-effect p").allTextContents(), tactic.levels.find((item) => item.level === level).effects.map((effect) => effect.description));
      const native = ordnance.levels.find((item) => item.level === level);
      assert.equal(await ordnanceCard.locator(".sim-magic-effect p").innerText(), native.effect);
      assert.equal(await ordnanceCard.locator(".sim-magic-timing").count(), 0, "simulator should not display ordnance activation timing");
      assert.equal(await ordnanceCard.locator(".sim-magic-condition").innerText(), `发动条件：${native.condition}`);
    }
    results.push({ level, ...await checkGeometry(true) });
  }
  await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  await sim.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-magic-layout.png", import.meta.url)) });
  for (const width of [1320, 900, 390]) {
    await page.setViewportSize({ width, height: 950 });
    results.push({ width, ...await checkGeometry(width > 1250) });
  }
  await sim.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-magic-mobile.png", import.meta.url)) });
  await sim.getByRole("button", { name: "返回钢舞姬详情" }).click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  assert.equal(await tacticsCard.getByRole("spinbutton", { name: "战术等级" }).inputValue(), "10");
  assert.deepEqual(await tacticsCard.locator(".sim-magic-effect p").allTextContents(), tactic.levels.find((item) => item.level === 10).effects.map((effect) => effect.description));
  await tacticsCard.locator(".sim-magic-select").click();
  await page.locator(".sim-dialog").getByRole("button", { name: "不携带" }).click();
  assert.match(await tacticsCard.locator(".sim-magic-effect").innerText(), /点击图标选择战术/);
  assert.equal(await tacticsCard.getByRole("spinbutton", { name: "战术等级" }).isDisabled(), true);
  // Lowering vehicle level automatically clamps magic, and the description must follow.
  await sim.getByRole("spinbutton", { name: "钢舞姬等级", exact: true }).fill("1");
  assert.equal(await ordnanceCard.getByRole("spinbutton", { name: "辎械等级" }).inputValue(), "0");
  assert.match(await ordnanceCard.locator(".sim-magic-effect").innerText(), /未魔改/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ maiden: maiden.tank, tactic: tactic.name, ordnance: ordnance.name, results, errors }));
} finally {
  await browser.close();
}
