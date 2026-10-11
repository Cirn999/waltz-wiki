import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { cardNameLayout, cardNamePhrases } from "../app/cardAtlasLayout.ts";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/card-name-layout");
await fs.mkdir(cache, { recursive: true });
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
if (process.argv.includes("--inventory")) {
  const names = [...rows].sort((a, b) => a.id - b.id).map((row) => ({ id: row.id, tank: row.tank, ...cardNameLayout(row.tank) }));
  await fs.writeFile(path.join(cache, "names-after.json"), JSON.stringify(names, null, 2));
  console.log(names.filter((row) => row.lines.length > 1 || /[（(]/u.test(row.tank)).map((row) => `${row.id} ${row.tank} => ${row.lines.join(" / ")}`).join("\n"));
  process.exit(0);
}

const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const search = async (query) => { await page.locator(".search-box input").fill(query); await page.locator(".search-box button").click(); };
const settled = async () => page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
const loadAll = async () => {
  while (await page.getByRole("button", { name: /继续载入/ }).count()) await page.getByRole("button", { name: /继续载入/ }).click();
  await settled();
};
const inspect = async () => {
  const rendered = await page.locator(".atlas-entry").evaluateAll((entries) => entries.map((entry) => {
    const region = entry.querySelector(".atlas-name-region").getBoundingClientRect();
    const lines = [...entry.querySelectorAll(".atlas-name-line")];
    return {
      id: Number(entry.dataset.maidenId), skinId: entry.dataset.skinId, lines: lines.map((line) => line.textContent),
      overflow: lines.some((line) => {
        const range = document.createRange(); range.selectNodeContents(line);
        const rect = range.getBoundingClientRect();
        return rect.left < region.left - 1 || rect.right > region.right + 1 || rect.top < region.top - 1 || rect.bottom > region.bottom + 1;
      }),
    };
  }));
  for (const card of rendered) {
    const { tank } = rows.find((row) => row.id === card.id);
    assert.equal(card.lines.join("").replace(/\s/gu, ""), tank.replace(/\s/gu, ""), tank);
    assert.equal(card.overflow, false, `${card.id}/${card.skinId}: ${card.lines.join(" / ")} overflow`);
    const brackets = tank.match(/[（(][^()（）]*[）)]|\[[^\[\]]*\]/gu) ?? [];
    const tokens = tank.match(/[A-Za-z0-9][A-Za-z0-9.*+\/-]*/gu) ?? [];
    for (const term of [...brackets, ...tokens, ...cardNamePhrases.filter((phrase) => tank.includes(phrase))]) {
      assert.ok(card.lines.some((line) => line.includes(term)), `${tank}: split ${term}`);
    }
  }
  return rendered;
};
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3173", { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await page.getByRole("button", { name: /筛选条件/ }).click();
  const dialog = page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  await dialog.getByRole("button", { name: "显示未实装", exact: true }).click();
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await loadAll();
  const merged = await inspect();
  assert.equal(merged.length, rows.length);
  await page.getByRole("button", { name: "皮肤分散", exact: true }).click();
  await loadAll();
  const separate = await inspect();
  assert.ok(separate.length > rows.length);
  const widths = [320, 390, 768, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 }); await settled(); await inspect();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}: page overflow`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const samples = [7491, 7671, 6301, 6081, 6421, 6782, 6284, 7961];
  const captures = [];
  for (const id of samples) {
    const row = rows.find((item) => item.id === id);
    assert.ok(row);
    await search(row.tank); await settled();
    const cards = page.locator(`.atlas-entry[data-maiden-id="${id}"]`);
    await cards.first().waitFor();
    await inspect();
    for (const card of await cards.all()) assert.deepEqual(await card.locator(".atlas-name-line").allTextContents(), cardNameLayout(row.tank).lines);
    await page.locator(".atlas-album").evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); });
    if (id === 7491 || id === 7671) await page.locator(".atlas-album").screenshot({ path: path.join(cache, `${id}-skins.png`) });
    const capture = await cards.first().locator(".atlas-card-face").screenshot({ path: path.join(cache, `${id}.png`) });
    captures.push(capture);
  }
  const cellWidth = 270, cellHeight = 395;
  const tiles = await Promise.all(captures.map(async (input, index) => ({ input: await sharp(input).resize(250, 375, { fit: "inside" }).png().toBuffer(), left: (index % 4) * cellWidth + 10, top: Math.floor(index / 4) * cellHeight + 10 })));
  await sharp({ create: { width: cellWidth * 4, height: cellHeight * 2, channels: 3, background: "#e4e8dc" } }).composite(tiles).png().toFile(path.join(cache, "samples.png"));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ merged: merged.length, separate: separate.length, widths, samples, completeTerms: true, noOverflow: true, errors }, null, 2));
} finally { await browser.close(); }
