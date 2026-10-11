import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { cardSkinFraming, defaultCardArtFraming } from "../app/cardAtlasFraming.ts";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".cache/skin-framing");
await fs.mkdir(output, { recursive: true });
const { rows: skins } = JSON.parse(await fs.readFile(path.join(root, "public/data/maiden-skins.json"), "utf8"));
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cards = [];
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3173", { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await page.getByRole("button", { name: /筛选条件/ }).click();
  const dialog = page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  await dialog.getByRole("button", { name: "显示未实装", exact: true }).click();
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await page.addStyleTag({ content: ".atlas-album-cards{grid-template-columns:repeat(auto-fill,260px)}" });
  for (const [id, variants] of Object.entries(skins)) {
    const maiden = rows.find((row) => row.id === Number(id));
    await page.locator(".search-box input").fill(maiden.tank); await page.locator(".search-box button").click();
    const entry = page.locator(`.atlas-entry[data-maiden-id="${id}"]`);
    for (const skin of variants) {
      const face = entry.locator(".atlas-card-face");
      await face.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await face.click({ button: "right" });
      await page.getByRole("menu", { name: /皮肤$/ }).getByRole("menuitemradio", { name: skin.name, exact: true }).click();
      await face.locator(".atlas-hero").evaluate((image) => image.decode());
      const placement = cardSkinFraming(skin.modelId);
      assert.equal(await face.getAttribute("data-art-framing"), placement ? "skin-model" : "skin-fit");
      assert.equal(await face.evaluate((node) => node.style.getPropertyValue("--atlas-hero-height")), `${(placement ?? defaultCardArtFraming).height}%`);
      await face.evaluate(async (node) => { await Promise.all([...node.querySelectorAll("img")].map((image) => image.decode())); await document.fonts.ready; });
      const name = `${id}-${skin.modelId}`;
      const file = path.join(output, `${name}.png`);
      await face.screenshot({ path: file });
      cards.push({ file, id: Number(id), modelId: skin.modelId, name: `${id} ${maiden.tank} · ${skin.name}`, placement: placement ? "model" : "fit" });
      if (skin.modelId === 61589) {
        const before = await page.addStyleTag({ content: ".atlas-card-face .atlas-hero{width:100%;height:86%;top:1%;bottom:auto;left:0;transform:none;object-fit:contain;object-position:center}" });
        await face.screenshot({ path: path.join(output, "278-before.png") });
        await before.evaluate((node) => node.remove());
        await face.screenshot({ path: path.join(output, "278-after.png") });
      }
    }
  }
  // Real UI screenshots only: contact sheets leave artwork assets untouched.
  for (let offset = 0; offset < cards.length; offset += 24) {
    const batch = cards.slice(offset, offset + 24);
    const tiles = await Promise.all(batch.map(async (card, index) => ({ input: await sharp(card.file).resize(208, 312).extend({ bottom: 14, background: "#edf1e7" }).png().toBuffer(), left: index % 6 * 216, top: Math.floor(index / 6) * 334 })));
    await sharp({ create: { width: 1296, height: Math.ceil(batch.length / 6) * 334, channels: 4, background: "#edf1e7" } }).composite(tiles).png().toFile(path.join(output, `sheet-${offset / 24 + 1}.png`));
  }
  await fs.writeFile(path.join(output, "index.json"), JSON.stringify(cards, null, 2));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ skins: cards.length, modelPlacement: cards.filter((card) => card.placement === "model").length, fallback: cards.filter((card) => card.placement === "fit"), output, errors }, null, 2));
} finally { await browser.close(); }
