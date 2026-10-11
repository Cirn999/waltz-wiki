import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { atlasSkinEntries, atlasSkinStorageKey } from "../app/cardAtlasSkins.ts";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache/card-atlas-skin-modes");
await fs.mkdir(cache, { recursive: true });
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, `public/data/${name}.json`), "utf8"));
const { rows } = await read("maidens");
const { rows: skins } = await read("maiden-skins");
const portraits = await read("table-portraits");
const implemented = rows.filter((row) => row.implemented).sort((a, b) => a.id - b.id);
const expected = (list) => atlasSkinEntries(list, "separate", skins, {}).map(({ key }) => key);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const url = process.argv[2] || "http://127.0.0.1:3173";
const nav = async () => {
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
};
const search = async (query) => { await page.locator(".search-box input").fill(query); await page.locator(".search-box button").click(); };
const click = async (name) => page.getByRole("button", { name, exact: true }).click();
const keys = () => page.locator(".atlas-entry").evaluateAll((entries) => entries.map((entry) => `${entry.dataset.maidenId}:${entry.dataset.skinId}`));
const entry = (id, skinId = 0) => page.locator(`.atlas-entry[data-maiden-id="${id}"][data-skin-id="${skinId}"]`);
const filter = async () => { await page.getByRole("button", { name: /筛选条件/ }).click(); return page.getByRole("dialog", { name: "钢舞姬筛选", exact: true }); };
const apply = async (dialog) => { await dialog.getByRole("button", { name: "确定", exact: true }).click(); await dialog.waitFor({ state: "detached" }); };
const screenshot = async (name) => {
  await page.locator(".card-atlas").evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); await document.fonts.ready; });
  await page.screenshot({ path: path.join(cache, `${name}.png`), fullPage: true });
};
try {
  await page.goto(url, { waitUntil: "networkidle" }); await nav();
  assert.equal(await page.getByRole("button", { name: "皮肤合并", exact: true }).getAttribute("aria-pressed"), "true");
  const displayGroup = await page.getByRole("group", { name: "卡牌图鉴显示模式", exact: true }).boundingBox();
  const skinGroup = await page.getByRole("group", { name: "卡牌图鉴皮肤展示模式", exact: true }).boundingBox();
  assert.ok(skinGroup.x >= displayGroup.x + displayGroup.width && Math.abs(skinGroup.y - displayGroup.y) < 1, "Skin switch must be to the right");
  const maiden = rows.find((row) => row.id === 7002);
  const chosen = skins[7002].at(-1);
  await search(maiden.tank);
  await entry(7002).locator("button").click({ button: "right" });
  await page.getByRole("menuitemradio", { name: chosen.name, exact: true }).click();
  const saved = await page.evaluate((key) => localStorage.getItem(key), atlasSkinStorageKey);
  await click("皮肤分散");
  assert.deepEqual(await keys(), expected([maiden]));
  assert.match(await page.locator(".atlas-toolbar h2").innerText(), /1 位钢舞姬 · 4 张卡牌/);
  for (const mode of ["竖版卡牌", "方形头像"]) {
    await click(mode);
    assert.deepEqual(await keys(), expected([maiden]));
    for (const skin of [undefined, ...skins[7002]]) {
      const card = entry(7002, skin?.id ?? 0);
      assert.equal(await card.locator(".atlas-skin-caption").innerText(), skin?.name ?? "默认立绘");
      assert.ok((await card.locator("button").getAttribute("aria-label")).includes(skin?.name ?? "默认立绘"));
      if (mode === "竖版卡牌") assert.equal(await card.locator(".atlas-hero").getAttribute("src"), skin?.image ?? maiden.image);
      else {
        assert.equal(await card.locator(".table-portrait-head").getAttribute("src"), skin?.headImage ?? portraits.rows[7002]);
        for (const selector of [".table-portrait-frame", ".table-portrait-rarity", ".table-portrait-mask", ".table-portrait-class", ".table-portrait-cost"]) assert.equal(await card.locator(selector).count(), 1);
      }
    }
    await screenshot(mode === "竖版卡牌" ? "separate-cards" : "separate-avatars");
    // Separate slots cannot be replaced with a duplicate skin via the custom menu.
    await entry(7002, chosen.id).evaluate((element) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    assert.equal(await page.locator(".atlas-skin-menu").count(), 0);
    await entry(7002, chosen.id).locator("button").click();
    const detail = page.getByRole("dialog", { name: `${maiden.tank} 详细档案`, exact: true });
    await detail.waitFor(); await detail.getByRole("button", { name: "关闭", exact: true }).click();
    await click("皮肤合并");
    assert.deepEqual(await keys(), [`7002:${chosen.id}`]);
    await click("皮肤分散");
  }
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), atlasSkinStorageKey), saved, "Viewing separate skins must not change saved choice");
  const noSkin = implemented.find((row) => !skins[row.id]);
  await search(noSkin.tank); assert.equal(await page.locator(`.atlas-entry[data-maiden-id="${noSkin.id}"]`).count(), 1);
  await search("no-such-maiden-zzz"); assert.deepEqual(await keys(), []);
  await search("");
  assert.deepEqual(await keys(), expected(implemented));
  assert.equal(await page.locator(".load-more").count(), 0);
  await click("竖版卡牌");
  assert.deepEqual(await keys(), expected(implemented).slice(0, 48));
  await page.getByRole("button", { name: /继续载入/ }).click();
  assert.deepEqual(await keys(), expected(implemented).slice(0, 96));
  let dialog = await filter(); await dialog.getByRole("button", { name: "二级", exact: true }).click(); await apply(dialog);
  const purple = implemented.filter((row) => row.rarityId === 3);
  assert.deepEqual(await keys(), expected(purple).slice(0, 48));
  assert.match(await page.locator(".atlas-toolbar h2").innerText(), new RegExp(`${purple.length} 位钢舞姬 · ${expected(purple).length} 张卡牌`));
  await click("清除条件");
  dialog = await filter(); await dialog.getByRole("button", { name: "显示未实装", exact: true }).click(); await apply(dialog);
  while (await page.getByRole("button", { name: /继续载入/ }).count()) await page.getByRole("button", { name: /继续载入/ }).click();
  assert.deepEqual(await keys(), expected([...rows].sort((a, b) => a.id - b.id)), "Every default and every skin must be reachable");
  await search(maiden.tank);
  for (const width of [1440, 980, 620, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ["竖版卡牌", "方形头像"]) {
      await click(mode);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}/${mode} overflow`);
    }
  }
  await click("竖版卡牌"); await screenshot("mobile-separate");
  await page.reload({ waitUntil: "networkidle" }); await nav(); await search(maiden.tank);
  assert.equal(await page.locator(".card-atlas").getAttribute("data-skin-mode"), "merged");
  await entry(7002, chosen.id).waitFor();
  // Uncached data load failure in separate mode must expose a working retry.
  const failure = await context.newPage();
  await failure.route("**/data/maiden-skins.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await failure.goto(url, { waitUntil: "networkidle" });
  const group = failure.locator(".primary-nav-group").filter({ has: failure.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await failure.getByRole("button", { name: "皮肤分散", exact: true }).click();
  await failure.getByRole("button", { name: "重新加载皮肤", exact: true }).waitFor();
  await failure.unroute("**/data/maiden-skins.json"); await failure.getByRole("button", { name: "重新加载皮肤", exact: true }).click();
  await failure.locator('.atlas-entry:not([data-skin-id="0"])').first().waitFor();
  assert.equal(await failure.locator(".atlas-skin-status").count(), 0);
  await failure.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ modeCombinations: 4, totalSeparateCards: expected(rows).length, sortAndFilters: true, pagination: true, mergedChoicePreserved: true, nativeAvatarLayers: true, detailLinks: true, responsive: true, loadRetry: true, errors }, null, 2));
} finally { await browser.close(); }
