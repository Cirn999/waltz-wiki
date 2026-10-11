import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findCraftTech } from "../app/loadoutMath.ts";

const baseUrl = process.argv[2] || "http://localhost:3100";
const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const technology = JSON.parse(await fs.readFile(new URL("../public/data/technology-catalog.json", import.meta.url), "utf8"));
const maiden = data.rows.find((item) => item.tank === "缪");
assert.ok(maiden);
const kinds = [
  { kind: "ammo", label: "弹药", category: "主炮", field: "allAmmunition" },
  { kind: "body", label: "车体", category: "车体", field: "bodyOptions" },
  { kind: "engine", label: "引擎", category: "引擎", field: "engineOptions" },
  { kind: "armor", label: "装甲", category: "防护", field: "armorOptions" },
];
const fixtures = kinds.map((entry) => {
  const craft = maiden[entry.field].find((item) => item.rank === 3 && findCraftTech(technology, entry.category, item.id, item.rank)?.node.traits.some((trait) => trait.description));
  assert.ok(craft, `${entry.label} fixture missing`);
  const effects = craft.effects ?? craft.resistanceDetails;
  const traits = findCraftTech(technology, entry.category, craft.id, craft.rank).node.traits;
  const effect = effects.find((item) => item.description || traits.some((trait) => trait.name === item.name && trait.description));
  return { ...entry, craft, name: effect.name, description: effect.description || traits.find((trait) => trait.name === effect.name).description };
});
const config = {
  level: 90,
  colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 },
  equipment: maiden.slotDetails.map(() => ({ familyId: null, level: 1 })),
  ...Object.fromEntries(fixtures.map((item) => [`${item.kind}Id`, item.craft.id])),
  tactics: { trendId: null, level: 0 }, ordnance: { trendId: null, level: 0 },
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
  }, { id: maiden.id, config, tech: Object.fromEntries(technology.blocks.map((block) => [block.id, 16])) });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  const sim = page.locator(".sim-shell");
  const tooltip = page.getByRole("tooltip");
  const showAndCheck = async (target, fixture) => {
    await target.hover();
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await tooltip.locator("strong").innerText(), fixture.name);
    assert.equal(await tooltip.locator("p").innerText(), fixture.description);
    assert.ok(await tooltip.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.parentElement === document.body && box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    }), "tooltip must escape card/dialog clipping and remain inside viewport");
  };
  for (const fixture of fixtures) {
    const card = sim.locator(`.sim-craft-card[aria-label^="选择${fixture.label}"]`);
    const chip = card.locator(`[data-trait-name="${fixture.name}"]`);
    await showAndCheck(chip.locator("img"), fixture);
    await page.mouse.move(0, 0);
    await tooltip.waitFor({ state: "detached" });
    await showAndCheck(chip.locator("b"), fixture);
    await page.keyboard.press("Escape");
    await tooltip.waitFor({ state: "detached" });
    assert.equal(await sim.isVisible(), true, "Escape dismisses tooltip, not simulator");
    await chip.focus();
    await tooltip.waitFor({ state: "visible" });
    assert.equal(await chip.getAttribute("aria-describedby"), await tooltip.getAttribute("id"));
    await page.keyboard.press("Escape");
  }
  // Locked crafts must still explain their traits without allowing selection.
  await sim.getByRole("spinbutton", { name: "钢舞姬等级", exact: true }).fill("1");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    for (const fixture of fixtures) {
      await sim.locator(`.sim-craft-card[aria-label^="选择${fixture.label}"]`).click();
      const dialog = page.locator(".sim-dialog");
      await dialog.getByRole("button", { name: `${fixture.label}期数：3期` }).click();
      const card = dialog.locator(`[data-craft-id="${fixture.craft.id}"]`);
      assert.equal(await card.locator("button").first().isDisabled(), true);
      await showAndCheck(card.locator(`[data-trait-name="${fixture.name}"] img`), fixture);
      if (width === 1440 && fixture.kind === "body") {
        await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
        await page.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-trait-tooltip.png", import.meta.url)) });
      }
      await page.keyboard.press("Escape");
      await tooltip.waitFor({ state: "detached" });
      assert.equal(await dialog.isVisible(), true);
      if (fixture.kind === "ammo") {
        const unexplained = dialog.locator(".craft-trait:not([data-trait-description])").first();
        assert.ok(await unexplained.count(), "test must exercise a native trait without a description");
        await unexplained.hover();
        assert.equal(await tooltip.count(), 0, "no placeholder explanations should be fabricated");
      }
      await dialog.getByRole("button", { name: "关闭选择" }).click();
      assert.equal(await tooltip.count(), 0);
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ mainCards: fixtures.length, lockedPickerCases: fixtures.length * 2, source: "exact client technology-node descriptions", errors }));
} finally {
  await browser.close();
}
