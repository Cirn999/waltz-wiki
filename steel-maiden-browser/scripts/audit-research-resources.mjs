import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const research = JSON.parse(await fs.readFile(path.join(root, "public/data/research-tree.json"), "utf8"));
const equipment = JSON.parse(await fs.readFile(path.join(root, "public/data/equipment-catalog.json"), "utf8"));
const equipmentById = new Map(equipment.families.flatMap((family) => family.levels.map((entry) => [entry.fundId, { ...entry, slotIcon: family.typeIcon, advanced: family.advanced }])));
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(runtime, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
  await page.getByRole("menuitem", { name: /^研发配方/ }).click();
  await page.getByRole("button", { name: "显示未实装", exact: true }).click();
  for (const target of [6004, 9826, 9823]) {
    const node = research.nodes.find((entry) => entry.id === target);
    const indexButton = page.locator(".research-index button").filter({ has: page.locator("strong", { hasText: new RegExp("^" + node.tank.replace(/[.*+?^$()|[\]\\]/g, "\\$&") + "$") }) });
    await indexButton.click();
    await page.waitForFunction((tank) => document.querySelector(".research-focus-title h3")?.textContent === tank, node.tank);
    for (const recipe of research.recipes.filter((entry) => entry.targetId === target)) {
      for (const plan of recipe.resourcePlans) {
        const row = page.locator('[data-plan-id="' + plan.id + '"]');
        assert.equal(await row.locator(".commander strong").innerText(), plan.commanderLevel ? plan.commanderLevel + "级" : "未配置");
        assert.equal(await row.locator(".research-resource.is-icon").count(), plan.resources.length);
        for (const resource of plan.resources) {
          const chip = row.locator('[data-fund-id="' + resource.fundId + '"]');
          assert.equal(await chip.locator(":scope > b").innerText(), "× " + resource.amount.toLocaleString("zh-CN"));
          assert.ok((await chip.getAttribute("title")).includes(resource.name));
          assert.equal(await chip.locator("strong, small").count(), 0, "No text metadata inside icon chips");
          if (resource.category === "equipment") {
            const entry = equipmentById.get(resource.fundId);
            assert.equal(await chip.locator(".equipment-game-icon").count(), 1);
            assert.equal(await chip.locator(".equipment-game-level").innerText(), "S" + entry.level);
            assert.equal(await chip.locator(".equipment-game-slot").getAttribute("src"), entry.slotIcon);
            assert.equal(await chip.locator(".equipment-game-icon").evaluate((element) => element.classList.contains("advanced")), entry.advanced);
          } else assert.equal(await chip.locator(".research-resource-icon").getAttribute("src"), research.resourceAssets[resource.fundId].image);
          await chip.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
        }
      }
    }
  }
  const sample = research.nodes.find((node) => node.id === 9826);
  await page.locator(".research-index button").filter({ has: page.locator("strong", { hasText: sample.tank }) }).click();
  await fs.mkdir(path.join(root, ".cache/search-research-20261127"), { recursive: true });
  for (const width of [1600, 1152, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    const overflow = await page.locator(".resource-plan").evaluateAll((rows) => rows.some((row) => {
      const r = row.getBoundingClientRect();
      return [...row.querySelectorAll(".research-resource")].some((chip) => { const c = chip.getBoundingClientRect(); return c.left < r.left - 1 || c.right > r.right + 1; });
    }));
    assert.equal(overflow, false, "Resource chips must fit at " + width);
    const widths = await page.locator(".research-resource").evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().width));
    assert.ok(Math.max(...widths) - Math.min(...widths) < 1, "All resource and commander cells share a width at " + width);
    const iconSizes = await page.locator(".research-resource-icon, .research-resource .equipment-game-icon").evaluateAll((icons) => icons.map((icon) => icon.getBoundingClientRect().width));
    assert.ok(iconSizes.every((size) => size === 32), "Resource icons use the compact size");
    await page.locator(".research-costs").first().screenshot({ path: path.join(root, ".cache/search-research-20261127/resources-" + width + ".png") });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ iconCosts: true, commanderText: true, equipmentStyle: true, equipmentLevelsFromHandbook: true, quantitiesAndNames: true, mobile: true, errors }));
} finally { await browser.close(); }
