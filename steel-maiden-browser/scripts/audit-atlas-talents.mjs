import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { atlasSkinEntries } from "../app/cardAtlasSkins.ts";

const root = path.resolve(import.meta.dirname, "..");
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, `public/data/${name}.json`), "utf8"));
const { rows } = await read("maidens");
const { rows: skins } = await read("maiden-skins");
const assets = await read("atlas-talents");
const implemented = rows.filter((row) => row.implemented).sort((a, b) => a.id - b.id);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const click = (name) => page.getByRole("button", { name, exact: true }).click();
const ids = () => page.locator(".atlas-entry").evaluateAll((items) => items.map((item) => Number(item.dataset.maidenId)));
const filter = async (names, { cancel = false, all = false } = {}) => {
  await page.getByRole("button", { name: /筛选条件/ }).click();
  const dialog = page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  await dialog.getByRole("button", { name: "重置", exact: true }).click();
  for (const name of names) await dialog.getByRole("button", { name, exact: true }).click();
  if (all) await dialog.getByRole("button", { name: "显示未实装", exact: true }).click();
  await dialog.getByRole("button", { name: cancel ? "取消" : "确定", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
};
const expectedRows = (selected, all = false, sort = selected[0] ?? "") => (all ? rows : implemented)
  .filter((row) => selected.every((name) => row.talents.some((talent) => talent.name === name)))
  .sort((left, right) => {
    const level = (row) => row.talents.find((talent) => talent.name === sort)?.level ?? 0;
    return (sort ? level(right) - level(left) : 0) || left.id - right.id;
  });
const sorter = () => page.getByRole("combobox", { name: "才艺降序排序依据", exact: true });
const assertTalents = async (selected, { separate = false, all = false, sort = selected[0] ?? "" } = {}) => {
  const expected = expectedRows(selected, all, sort);
  const entries = separate ? atlasSkinEntries(expected, "separate", skins, {}).map(({ maiden }) => maiden) : expected;
  assert.deepEqual(await ids(), entries.map((row) => row.id));
  assert.equal(await page.locator(".load-more").count(), 0, "Avatar mode must show every result without load more");
  assert.equal(await sorter().count(), selected.length > 1 ? 1 : 0);
  if (selected.length > 1) {
    assert.deepEqual(await sorter().locator("option").allTextContents(), selected);
    assert.equal(await sorter().inputValue(), sort);
  }
  assert.ok((await page.locator(".atlas-toolbar p").innerText()).startsWith(sort ? `${sort}等级降序` : "内部编号升序"));
  const actual = await page.locator(".atlas-entry").evaluateAll((cards) => cards.map((card) => [...card.querySelectorAll(".atlas-talent")].map((talent) => ({
    name: talent.dataset.talent, level: Number(talent.dataset.level), active: talent.dataset.highlighted === "true",
    icon: talent.querySelector(".atlas-talent-icon").getAttribute("src"),
    highlight: talent.querySelector(".atlas-talent-highlight")?.getAttribute("src") ?? null,
    digits: [...talent.querySelectorAll(".atlas-talent-digit")].map((digit) => digit.getAttribute("src")),
  }))));
  assert.deepEqual(actual, entries.map((row) => selected.length ? row.talents.map((talent) => ({
    name: talent.name, level: talent.level, active: selected.includes(talent.name), icon: assets.talents[talent.name].icon.image,
    highlight: selected.includes(talent.name) ? assets.talents[talent.name].highlight.image : null,
    digits: String(talent.level).split("").map((digit) => assets.digits[digit].image),
  })) : []));
};
try {
  await fs.mkdir(path.join(root, ".cache/atlas-talents"), { recursive: true });
  for (const row of rows) for (const talent of row.talents) {
    assert.ok(assets.talents[talent.name], `${row.tank}/${talent.name} missing native sprites`);
    for (const digit of String(talent.level)) assert.ok(assets.digits[digit]);
  }
  for (const sprite of [...Object.values(assets.talents).flatMap((talent) => [talent.icon, talent.highlight]), ...Object.values(assets.digits)]) {
    assert.ok((await fs.stat(path.join(root, "public", sprite.image))).size > 0);
  }
  await page.goto(process.argv[2] || "http://127.0.0.1:56501", { waitUntil: "networkidle" });
  const nav = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await nav.locator(".primary-nav-trigger").click();
  await nav.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await assertTalents([]);
  await click("竖版卡牌");
  assert.equal((await ids()).length, 48);
  await page.getByRole("button", { name: /继续载入/ }).click();
  assert.equal((await ids()).length, 96);
  await click("方形头像"); await assertTalents([]);
  await click("竖版卡牌"); assert.equal((await ids()).length, 96);
  await click("方形头像");
  await filter(["料理"], { cancel: true }); await assertTalents([]);
  // Each original and newer talent must get its own matching green silhouette.
  for (const name of Object.keys(assets.talents)) { await filter([name]); await assertTalents([name]); }
  await filter(["料理", "护理"]); await assertTalents(["料理", "护理"]);
  const cookingOrder = await ids();
  await sorter().selectOption("护理"); await assertTalents(["料理", "护理"], { sort: "护理" });
  assert.notDeepEqual(await ids(), cookingOrder, "Selecting a different talent must reorder the avatars");
  await filter(["运动", "护理"], { cancel: true }); await assertTalents(["料理", "护理"], { sort: "护理" });
  await click("皮肤分散");
  await page.locator('.atlas-entry:not([data-skin-id="0"])').first().waitFor();
  await assertTalents(["料理", "护理"], { sort: "护理", separate: true });
  await click("皮肤合并"); await assertTalents(["料理", "护理"], { sort: "护理" });
  await click("竖版卡牌");
  assert.equal(await sorter().count(), 0);
  assert.deepEqual(await ids(), expectedRows(["料理", "护理"], false, "").slice(0, 48).map((row) => row.id));
  await click("方形头像"); await assertTalents(["料理", "护理"], { sort: "护理" });
  // Removing the preferred sorting talent cannot leave a stale sort active.
  await filter(["料理", "知性"]); await assertTalents(["料理", "知性"]);
  await sorter().selectOption("知性"); await assertTalents(["料理", "知性"], { sort: "知性" });
  await filter(["料理"]); await assertTalents(["料理"]);
  await filter(["料理", "护理"]); await assertTalents(["料理", "护理"]);
  await sorter().selectOption("护理"); await assertTalents(["料理", "护理"], { sort: "护理" });
  const sortBox = await page.locator(".atlas-talent-sort").boundingBox();
  const resetBox = await page.getByRole("button", { name: "清除条件", exact: true }).boundingBox();
  assert.ok(sortBox.x + sortBox.width <= resetBox.x && Math.abs(sortBox.y + sortBox.height / 2 - resetBox.y - resetBox.height / 2) < 2, `Sort control must sit immediately left of clear filters: ${JSON.stringify({ sortBox, resetBox })}`);
  assert.ok(await page.locator('.atlas-talent[data-highlighted="false"]').count(), "Unselected owned talents must remain visible");
  const geometry = async () => {
    const problems = await page.locator(".atlas-album-avatars").evaluate((album) => {
      const entries = [...album.querySelectorAll(".atlas-entry")];
      const columns = getComputedStyle(album).gridTemplateColumns.split(" ").length;
      const problems = [];
      const portraits = entries.map((entry) => entry.querySelector(".table-game-avatar").getBoundingClientRect());
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const portrait = portraits[index];
        const caption = entry.querySelector(".atlas-avatar-caption").getBoundingClientRect();
        const firstInRow = portraits[Math.floor(index / columns) * columns];
        if (Math.abs(portrait.top - firstInRow.top) > 1 || Math.abs(portrait.top - entry.getBoundingClientRect().top) > 1) problems.push({ id: entry.dataset.maidenId, reason: "avatar shifted by wrapped name" });
        const group = entry.querySelector(".atlas-talents");
        if (!group) continue;
        const strip = group.getBoundingClientRect();
        if (group.closest("button") || strip.top < portrait.bottom - 1 || strip.bottom > caption.top + 1) problems.push({ id: entry.dataset.maidenId, reason: "talents must be between portrait and name" });
        const badges = [...group.querySelectorAll(".atlas-talent")];
        const bounds = badges.map((badge) => badge.getBoundingClientRect());
        badges.forEach((badge, position) => {
          const rect = bounds[position];
          if (Math.abs(rect.top - bounds[0].top) > 1 || rect.left < strip.left - 1 || rect.right > strip.right + 1 || position > 0 && rect.left < bounds[position - 1].right - 1) problems.push({ id: entry.dataset.maidenId, reason: "talents wrapped or overlapping" });
          for (const image of badge.querySelectorAll("img")) {
            const sprite = image.getBoundingClientRect();
            if (sprite.width < 1 || sprite.height < 1 || sprite.left < rect.left - 1 || sprite.right > rect.right + 1 || sprite.top < rect.top - 1 || sprite.bottom > rect.bottom + 1) problems.push({ id: entry.dataset.maidenId, reason: "sprite outside badge", src: image.src });
          }
        });
      }
      return problems;
    });
    assert.deepEqual(problems.slice(0, 3), [], "Avatars must align at the top; all talents must fit in one row below them");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  };
  const screenshot = async (name) => {
    await page.locator(".atlas-toolbar").evaluate((element) => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 100));
    await page.evaluate(async () => {
      const images = [...document.querySelectorAll(".atlas-album img")].filter((image) => image.getBoundingClientRect().top < innerHeight);
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.screenshot({ path: path.join(root, `.cache/atlas-talents/${name}.png`) });
  };
  await screenshot("desktop"); await geometry();
  for (const width of [980, 620, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await geometry(); }
  await page.setViewportSize({ width: 390, height: 844 }); await screenshot("mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await filter(["运动"]); await assertTalents(["运动"]); await geometry(); await screenshot("sports-aligned");
  await click("清除条件"); await assertTalents([]); await geometry();
  await filter(["护理"]);
  await click("皮肤分散");
  await page.locator('.atlas-entry:not([data-skin-id="0"])').first().waitFor();
  await assertTalents(["护理"], { separate: true }); await geometry();
  await click("皮肤合并"); await assertTalents(["护理"]);
  const target = expectedRows(["护理"])[0];
  await page.locator(`.atlas-entry[data-maiden-id="${target.id}"] .table-game-avatar`).click();
  const detail = page.getByRole("dialog", { name: `${target.tank} 详细档案`, exact: true });
  await detail.waitFor(); await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await filter([], { all: true }); await assertTalents([], { all: true });
  await click("皮肤分散"); await assertTalents([], { all: true, separate: true }); await geometry();
  await click("竖版卡牌"); assert.equal((await ids()).length, 48);
  assert.equal(await page.locator(".atlas-talents").count(), 0);
  await page.getByRole("button", { name: /继续载入/ }).click(); assert.equal((await ids()).length, 96);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ maidenCount: rows.length, nativeTalentPairs: 12, singleAndMultiFilters: true, descendingTalentSort: true, sortSelectionAndFallback: true, draftCancel: true, skins: true, allAvatars: true, verticalPagination: true, alignedAvatars: true, horizontalTalentStrip: true, responsive: true, errors }, null, 2));
} finally { await browser.close(); }
