import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assessmentIcon, equipmentAssessment } from "../app/loadoutAssessment.ts";

const baseUrl = process.argv[2] || "http://localhost:3100";
const load = async (name) => JSON.parse(await fs.readFile(new URL(`../public/data/${name}.json`, import.meta.url), "utf8"));
const [data, equipment, tech] = await Promise.all([load("maidens"), load("equipment-catalog"), load("technology-catalog")]);
const maiden = data.rows.find((row) => row.tank === "迫击虎");
const tactic = data.magicProgression.tactics.find((row) => row.name === "火力构造定制");
const families = maiden.slotDetails.map((slot) => equipment.families.find((family) => !family.advanced && equipment.slots.some((row) => row.tag === family.slotTag && row.icon === slot.image)));
const config = {
  level: 90, colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 },
  equipment: families.map((family) => ({ familyId: family?.id ?? null, level: 2 })),
  ammoId: 0, bodyId: null, engineId: null, armorId: null,
  tactics: { trendId: tactic.trendId, level: 1 }, ordnance: { trendId: maiden.magicOrdnance[0].trendId, level: 1 },
};
const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(root)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(root, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ id, config, tech }) => {
    localStorage.setItem(`steel-loadout-vehicle-v1:${id}`, JSON.stringify(config));
    localStorage.setItem("steel-loadout-global-tech-v1", JSON.stringify(tech));
  }, { id: maiden.id, config, tech: Object.fromEntries(tech.blocks.map((block) => [block.id, 16])) });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  await page.locator(".detail-actions button", { hasText: "配装模拟" }).click();
  const sim = page.locator(".sim-shell");
  const title = sim.locator(".sim-title");
  await page.waitForFunction(() => document.querySelector(".sim-stat strong")?.textContent !== "—");
  assert.equal(await title.locator(".sim-identity-nation").getAttribute("src"), maiden.nationIcon);
  assert.equal(await title.locator(".sim-identity-class").getAttribute("src"), maiden.classIcon);
  assert.deepEqual(await title.locator(".sim-identity-names > *").allTextContents(), [maiden.person, maiden.tank]);
  assert.equal(await title.locator(".sim-assessments").innerText(), "", "assessment must be icons, not visible text");
  const equipmentBadge = title.locator('[data-assessment="equipment"] img');
  const magicBadge = title.locator('[data-assessment="magic"] img');
  assert.equal(await equipmentBadge.getAttribute("src"), assessmentIcon("equipment", equipmentAssessment(maiden.slotDetails.length, config.equipment, equipment)));
  assert.equal(await magicBadge.getAttribute("src"), assessmentIcon("magic", 1));
  for (const [ordnance, tactics, expected] of [[0, 0, 0], [1, 0, 1], [5, 0, 2], [10, 0, 3], [5, 5, 4], [0, 10, 5], [10, 10, 6]]) {
    await sim.getByRole("spinbutton", { name: "辎械等级", exact: true }).fill(String(ordnance));
    await sim.getByRole("spinbutton", { name: "战术等级", exact: true }).fill(String(tactics));
    if (expected) assert.equal(await magicBadge.getAttribute("src"), assessmentIcon("magic", expected));
    else assert.equal(await magicBadge.count(), 0);
  }
  const advanced = equipment.families.find((family) => family.advanced && equipment.slots.some((slot) => slot.tag === family.slotTag && slot.icon === maiden.slotDetails[0].image));
  assert.ok(advanced);
  await sim.locator(".sim-equipment-slot > button").first().click();
  const dialog = page.locator(".sim-dialog");
  await dialog.getByRole("spinbutton", { name: "待选择装备的等级" }).fill("10");
  await dialog.locator(".sim-equipment-option", { hasText: advanced.name }).click();
  config.equipment[0] = { familyId: advanced.id, level: 10 };
  assert.equal(await equipmentBadge.getAttribute("src"), assessmentIcon("equipment", equipmentAssessment(maiden.slotDetails.length, config.equipment, equipment)));
  const geometry = await title.evaluate((el) => {
    const rect = (selector) => el.querySelector(selector).getBoundingClientRect();
    return {
      x: [".sim-identity-nation", ".sim-identity-class", ".sim-assessments", ".sim-identity-names"].map((s) => rect(s).x),
      equipmentY: rect('[data-assessment="equipment"]').y, magicY: rect('[data-assessment="magic"]').y,
      personY: rect("em").y, tankY: rect("strong").y,
      loaded: [...el.querySelectorAll("img")].every((img) => img.complete && img.naturalWidth > 0),
    };
  });
  assert.deepEqual(geometry.x, [...geometry.x].sort((a, b) => a - b));
  assert.ok(geometry.equipmentY < geometry.magicY && geometry.personY < geometry.tankY && geometry.loaded);
  await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  await sim.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-header-desktop.png", import.meta.url)) });
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const overflow = await sim.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, `header must not overflow at ${width}px`);
  }
  await sim.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-header-mobile.png", import.meta.url)) });
  await sim.getByRole("button", { name: "重置本车" }).click();
  assert.equal(await title.locator(".sim-assessments").count(), 0, "both badges must disappear after reset");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ maiden: maiden.tank, geometry, tested: "all magic grades, live equipment selection, empty reset, desktop/mobile", errors }));
} finally {
  await browser.close();
}
