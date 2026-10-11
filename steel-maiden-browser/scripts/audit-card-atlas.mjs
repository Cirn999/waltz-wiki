import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { cardNameLayout } from "../app/cardAtlasLayout.ts";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const portraits = JSON.parse(await fs.readFile(path.join(root, "public/data/table-portraits.json"), "utf8"));
const implemented = data.rows.filter((row) => row.implemented).sort((a, b) => a.id - b.id);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const ids = () => page.locator(".atlas-entry").evaluateAll((items) => items.map((item) => Number(item.dataset.maidenId)));
const nav = async (name) => {
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: new RegExp(name) }).click();
};
const search = async (value) => { await page.locator(".search-box input").fill(value); await page.locator(".search-box button").click(); };
const mode = async (value) => { await page.getByRole("button", { name: value === "cards" ? "竖版卡牌" : "方形头像", exact: true }).click(); assert.equal(await page.locator(".card-atlas").getAttribute("data-mode"), value); };
const openFilter = async () => { await page.getByRole("button", { name: /筛选条件/ }).click(); return page.getByRole("dialog", { name: "钢舞姬筛选", exact: true }); };
const apply = async (dialog) => { await dialog.getByRole("button", { name: "确定", exact: true }).click(); await dialog.waitFor({ state: "detached" }); };
const readyImages = async () => page.locator(".atlas-card-face, .atlas-album-avatars").first().evaluate(async (element) => {
  await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode().catch(() => {})));
  await document.fonts.ready;
});
const assertDetail = async (id) => {
  const row = data.rows.find((item) => item.id === id);
  await page.locator(`.atlas-entry[data-maiden-id="${id}"] button`).click();
  const detail = page.getByRole("dialog", { name: `${row.tank} 详细档案`, exact: true });
  await detail.waitFor();
  assert.match(await detail.locator(".detail-header .eyebrow").innerText(), new RegExp(String(id)));
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await detail.waitFor({ state: "detached" });
};
const assertCardText = async () => {
  const failures = await page.locator(".atlas-card-face").evaluateAll((cards) => cards.flatMap((card) => {
    const region = card.querySelector(".atlas-name-region").getBoundingClientRect();
    const personRegion = card.querySelector(".atlas-person-region").getBoundingClientRect();
    const person = card.querySelector(".atlas-person-name").getBoundingClientRect();
    const failures = [];
    for (const element of card.querySelectorAll(".atlas-name-line")) {
      const range = document.createRange(); range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      if (rect.left < region.left - 1 || rect.right > region.right + 1 || rect.top < region.top - 1 || rect.bottom > region.bottom + 1) failures.push({ text: element.textContent, rect: rect.toJSON(), region: region.toJSON() });
    }
    if (person.height > personRegion.height + 1 || person.width > personRegion.width + 1) failures.push({ person: card.querySelector(".atlas-person-name").textContent });
    return failures;
  }));
  assert.deepEqual(failures, [], "Name overflow");
};
try {
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await page.goto(process.argv[2] || "http://127.0.0.1:3173", { waitUntil: "networkidle" });
  await page.locator("tr[data-maiden-id]").first().waitFor();
  const tableOrder = await page.locator("tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => row.dataset.maidenId));
  await nav("卡牌图鉴");
  assert.equal(await page.locator(".card-atlas").getAttribute("data-mode"), "avatars");
  await mode("cards");
  assert.deepEqual(await ids(), implemented.slice(0, 48).map((row) => row.id));
  await assertDetail(implemented[0].id);
  await page.getByRole("button", { name: /继续载入/ }).click();
  assert.deepEqual(await ids(), implemented.slice(0, 96).map((row) => row.id));
  await mode("avatars");
  assert.deepEqual(await ids(), implemented.map((row) => row.id));
  assert.equal(await page.locator(".load-more").count(), 0);
  assert.equal(await page.locator(".atlas-card-face").count(), 0);
  for (const row of implemented.slice(0, 96)) {
    const avatar = page.locator(`.atlas-entry[data-maiden-id="${row.id}"] .table-game-avatar`);
    for (const [selector, expected] of [[".table-portrait-frame", portraits.frames[row.rarityId]], [".table-portrait-head", portraits.rows[row.id]], [".table-portrait-rarity", portraits.rarities[row.rarityId]], [".table-portrait-mask", portraits.bottomMask], [".table-portrait-class", portraits.classes[row.classId]]]) {
      if (expected) assert.equal(await avatar.locator(selector).getAttribute("src"), expected);
    }
    assert.equal(await avatar.locator(".table-portrait-cost").innerText(), row.magicCostGroup);
  }
  await assertDetail(implemented[1].id);
  await page.mouse.move(0, 0);
  await page.locator(".primary-nav-menu:visible").waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(root, ".cache/card-atlas-avatars.png") });
  await nav("属性表");
  assert.deepEqual(await page.locator("tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => row.dataset.maidenId)), tableOrder);
  await nav("卡牌图鉴");
  assert.equal(await page.locator(".card-atlas").getAttribute("data-mode"), "avatars");
  await mode("cards");
  await search("谢尔曼Mk-");
  const shermans = implemented.filter((row) => row.tank.includes("谢尔曼Mk-"));
  assert.deepEqual(await ids(), shermans.map((row) => row.id));
  await readyImages();
  assert.equal(new Set(await page.locator(".atlas-rarity-background").evaluateAll((images) => images.map((image) => image.getAttribute("src")))).size, 3);
  await assertCardText();
  await page.screenshot({ path: path.join(root, ".cache/card-atlas-desktop.png"), fullPage: true });
  let dialog = await openFilter();
  await dialog.getByRole("button", { name: "一级", exact: true }).click();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(await ids(), shermans.map((row) => row.id));
  dialog = await openFilter();
  await dialog.getByRole("button", { name: "一级", exact: true }).click();
  await dialog.getByRole("button", { name: "二级", exact: true }).click();
  await apply(dialog);
  const filtered = shermans.filter((row) => row.rarityId === 2 || row.rarityId === 3).map((row) => row.id);
  assert.deepEqual(await ids(), filtered);
  await mode("avatars"); assert.deepEqual(await ids(), filtered);
  await mode("cards"); assert.deepEqual(await ids(), filtered);
  await nav("属性表");
  assert.deepEqual(new Set(await page.locator("tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => Number(row.dataset.maidenId)))), new Set(filtered));
  await nav("卡牌图鉴");
  await page.getByRole("button", { name: "清除条件", exact: true }).click();
  await mode("cards");
  for (const id of [6279, 9832, 9873, 7081, 7621, 7002]) {
    const row = data.rows.find((item) => item.id === id);
    await search(row.tank);
    await readyImages();
    await assertCardText();
    assert.deepEqual(await page.locator(`.atlas-entry[data-maiden-id="${id}"] .atlas-name-line`).allTextContents(), cardNameLayout(row.tank).lines);
  }
  await search("");
  dialog = await openFilter();
  await dialog.getByRole("button", { name: "显示未实装", exact: true }).click();
  await apply(dialog);
  while (await page.getByRole("button", { name: /继续载入/ }).count()) await page.getByRole("button", { name: /继续载入/ }).click();
  assert.deepEqual(await ids(), [...data.rows].sort((a, b) => a.id - b.id).map((row) => row.id));
  await assertCardText();
  console.log("All card names, assets, sort order and shared filters checked.");
  await search("谢尔曼Mk-");
  const widths = [1920, 1440, 1280, 980, 768, 620, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const value of ["cards", "avatars"]) {
      await mode(value);
      const overflow = await page.locator(".card-atlas").evaluate((element) => element.getBoundingClientRect().right > innerWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `Horizontal overflow at ${width}/${value}`);
      if (value === "cards") await assertCardText();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await mode("cards"); await readyImages();
  await page.screenshot({ path: path.join(root, ".cache/card-atlas-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ rows: data.rows.length, implemented: implemented.length, squarePortraitsVerified: 96, modes: 2, widths, detailLinks: true, tableSortUnchanged: true, errors }, null, 2));
} finally { await browser.close(); }
