import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findCraftTech } from "../app/loadoutMath.ts";

const baseUrl = process.argv[2] || "http://localhost:3100";
const catalog = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const technology = JSON.parse(await fs.readFile(new URL("../public/data/technology-catalog.json", import.meta.url), "utf8"));
const fields = ["allAmmunition", "bodyOptions", "engineOptions", "armorOptions"];
const maiden = catalog.rows.find((row) => fields.every((field) => [1, 2, 3].every((rank) => row[field].some((item) => item.rank === rank))));
assert.ok(maiden, "fixture must offer all three generations in all four pickers");
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });

async function checkIcons(tabs) {
  await tabs.locator("img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  const measurements = await tabs.locator("button").evaluateAll((buttons) => buttons.map((button) => {
    const image = button.querySelector("img");
    const icon = image.getBoundingClientRect();
    const cell = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      width: icon.width, height: icon.height,
      cellWidth: cell.width, cellHeight: cell.height,
      offsetX: icon.x + icon.width / 2 - cell.x - cell.width / 2,
      offsetY: icon.y + icon.height / 2 - cell.y - cell.height / 2,
      aspectRatio: image.naturalWidth / image.naturalHeight,
      contentHeight: cell.height - [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth].reduce((sum, value) => sum + parseFloat(value), 0),
    };
  }));
  assert.equal(measurements.length, 3);
  for (const item of measurements) {
    assert.ok(Math.abs(item.width - 18) < 0.1, "each chevron must use the same 18px width as detail view");
    assert.ok(Math.abs(item.width / item.height - item.aspectRatio) < 0.01, "sprite must preserve aspect ratio");
    assert.ok(Math.abs(item.offsetX) < 0.6 && Math.abs(item.offsetY) < 0.6, "sprite must be centered in both directions");
    assert.ok(item.height <= item.contentHeight + 1, "sprite must fit inside its button");
  }
  assert.ok(Math.abs(measurements[2].height - measurements[2].contentHeight) < 1.5, "third phase should fill its cell height");
  return measurements.map(({ width, height, cellWidth, cellHeight }) => ({ width, height, cellWidth, cellHeight }));
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  const detailIcons = await checkIcons(page.locator(".detail-loadout-heading .technology-generation-tabs"));
  for (const group of await page.locator(".craft-type-group .technology-generation-tabs").all()) {
    assert.deepEqual(await checkIcons(group), detailIcons);
  }
  await page.locator(".detail-modal .detail-actions button", { hasText: "配装模拟" }).click();
  const results = [];
  let checkedCards = 0;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    for (const label of ["弹药", "车体", "引擎", "装甲"]) {
      await page.locator(`.sim-craft-card[aria-label^="选择${label}"]`).click();
      const dialog = page.locator(".sim-dialog");
      const tabs = dialog.locator(".sim-picker-ranks");
      const geometry = await checkIcons(tabs);
      assert.deepEqual(geometry, detailIcons, "picker and detail must share identical icon geometry");
      for (const rank of [1, 2, 3]) {
        const button = tabs.getByRole("button", { name: `${label}期数：${rank}期` });
        await button.click();
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        assert.equal(await tabs.locator("button.active").count(), 1);
        const options = await dialog.locator("div.sim-option > button:first-child small").allTextContents();
        assert.ok(options.length && options.every((text) => text.startsWith(`${rank}期`)), "phase switching must still filter the craft list");
        const source = maiden[fields[["弹药", "车体", "引擎", "装甲"].indexOf(label)]];
        const cards = await dialog.locator(".sim-option-craft").evaluateAll((elements) => elements.map((element) => ({
          id: Number(element.dataset.craftId),
          name: element.querySelector(".sim-craft-copy strong").textContent,
          stats: [...element.querySelectorAll(".sim-craft-stats > span[aria-label]")].map((stat) => ({ label: stat.getAttribute("aria-label"), text: stat.querySelector("b").textContent })),
          effects: [...element.querySelectorAll(".sim-craft-effects > .craft-trait")].map((effect) => ({ name: effect.querySelector("b").textContent, image: effect.querySelector("img")?.getAttribute("src") ?? "", description: effect.dataset.traitDescription ?? "" })),
          icons: [...element.querySelectorAll(".sim-craft-effects img, .sim-craft-stats img")].map((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })),
          locked: element.classList.contains("locked"),
          disabled: element.querySelector("button").disabled,
        })));
        assert.equal(cards.length, source.filter((item) => item.rank === rank).length);
        for (const card of cards) {
          const item = source.find((candidate) => candidate.id === card.id);
          assert.ok(item);
          assert.equal(card.name, item.name);
          assert.deepEqual(card.stats.map((stat) => stat.label).sort(), item.stats.filter((stat) => label !== "弹药" || !stat.key.startsWith("射程")).map((stat) => `${stat.key} ${stat.value}`).sort(), "picker must expose every detail attribute, including negative and auxiliary stats");
          assert.ok(card.stats.every((stat) => stat.text === Number(stat.label.split(" ").at(-1)).toLocaleString("zh-CN")));
          const nativeTraits = findCraftTech(technology, { "弹药": "主炮", "车体": "车体", "引擎": "引擎", "装甲": "防护" }[label], item.id, item.rank)?.node.traits ?? [];
          assert.deepEqual(card.effects, (label === "弹药" ? item.effects : item.resistanceDetails).map((effect) => ({ name: effect.name, image: effect.image || "", description: (effect.description || nativeTraits.find((trait) => trait.name === effect.name)?.description || "").trim() })), "picker must preserve detail trait names, icons and client descriptions");
          assert.ok(card.icons.every((icon) => icon.width === 20 && icon.height === 20), "property sprites must not inherit the large craft image dimensions");
          assert.equal(card.disabled, card.locked, "displaying properties must not bypass research/vehicle-level locks");
          checkedCards++;
        }
        assert.equal(await dialog.locator(".sim-option-base-ammo .sim-craft-stats").count(), 0, "base ammunition has no fabricated panel bonus");
      }
      assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "picker must not overflow horizontally");
      if (width === 1440 && label === "弹药") {
        await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
        await dialog.screenshot({ path: fileURLToPath(new URL("../.cache/loadout-generation-icons.png", import.meta.url)) });
      }
      results.push({ width, label, geometry });
      await dialog.getByRole("button", { name: "关闭选择" }).click();
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ maiden: maiden.tank, checkedCards, results, errors }));
} finally {
  await browser.close();
}
