import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { starPromotions } from "../app/starPromotions.ts";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const growth = JSON.parse(await fs.readFile(path.join(root, "public/data/growth-curves.json"), "utf8"));
const keys = ["durability", "power", "piercing", "accuracy", "armor", "evasion", "stealth", "recon"];
const growthKeys = new Set(["durability", "power", "piercing", "armor"]);
const valueAt = (row, key, level) => growthKeys.has(key) ? growth.rows[row.id][key][level - 1] : row.stats[1][key];
const format = (value) => value == null ? "—" : value.toLocaleString("zh-CN");
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const baseUrl = process.argv[2] || "http://127.0.0.1:3017";

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const first = page.locator("tr[data-maiden-id]").first();
  const currentId = Number(await first.getAttribute("data-maiden-id"));
  const current = data.rows.find((row) => row.id === currentId);
  const shortcuts = [...new Set([1,60,90,99,...starPromotions(currentId).map(p=>p.level)])].sort((a,b)=>a-b);
  await first.locator(".table-avatar").click();
  const detail = page.locator(".detail-modal");
  const slider = detail.getByRole("slider", { name: "钢舞姬等级" });
  await page.waitForFunction(() => document.querySelector("#detail-level")?.disabled === false);
  const implemented = data.rows.filter((row) => row.implemented);
  let pool = implemented;
  async function check(level) {
    const actual = await detail.evaluate((element) => ({
      level: Number(element.querySelector("#detail-level").value),
      title: element.querySelector(".detail-toolbar h3").textContent,
      cards: [...element.querySelectorAll(".detail-stat-grid > div")].slice(0, 8).map((card) => ({
        value: card.querySelector("strong").childNodes[0].textContent,
        rank: card.querySelector(".detail-stat-rank").textContent,
      })),
    }));
    assert.equal(actual.level, level);
    assert.equal(actual.title, `${level}级基础属性`);
    assert.deepEqual(actual.cards, keys.map((key) => {
      const value = valueAt(current, key, level);
      return { value: format(value), rank: value == null ? "排名 —" : `排名 ${1 + pool.filter((row) => valueAt(row, key, level) != null && valueAt(row, key, level) > value).length}/${pool.length}` };
    }), `Exact client values and ranks at level ${level}`);
  }
  await slider.focus();
  await slider.press("Home");
  for (let level = 1; level <= 99; level += 1) {
    if (level > 1) await slider.press("ArrowRight");
    await check(level);
  }
  for (const level of shortcuts) {
    await detail.locator(".detail-level-marks").getByRole("button", { name: `${level}级`, exact: true }).click();
    await check(level);
  }
  assert.equal(await page.locator(".control-panel .level-picker .active").innerText(), "1级");
  await detail.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "属性排名筛选", exact: true });
  await filters.getByRole("button", { name: current.className, exact: true }).click();
  await filters.getByRole("button", { name: "确定", exact: true }).click();
  pool = implemented.filter((row) => row.className === current.className);
  const power = detail.getByRole("spinbutton", { name: "火力强殖等级，0到12级" });
  await power.fill("12"); await power.press("Enter");
  const powerCard = detail.locator(".colonization-stat-card").filter({ has: page.getByRole("spinbutton", { name: "火力强殖等级，0到12级" }) });
  const powerBonus = await powerCard.locator("em").innerText();

  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const width of [1440, 1152, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await detail.locator(".detail-level-marks").getByRole("button", { name: "1级", exact: true }).click();
    const box = await slider.boundingBox();
    const x = (level) => box.x + 9 + (box.width - 18) * (level - 1) / 98;
    await page.mouse.move(x(1), box.y + box.height / 2);
    await page.mouse.down();
    for (const level of [24, 47, 73, 88]) {
      await page.mouse.move(x(level), box.y + box.height / 2, { steps: 6 });
      await check(level); // Deliberately before mouseup: values must update throughout the drag.
    }
    await page.mouse.up();
    assert.equal(await power.inputValue(), "12");
    assert.equal(await powerCard.locator("em").innerText(), powerBonus);
    const layout = await detail.evaluate((element) => ({
      width: element.clientWidth, scrollWidth: element.scrollWidth,
      marks: [...element.querySelectorAll(".detail-level-marks button")].map((button) => { const r = button.getBoundingClientRect(); return { left: r.left, right: r.right }; }),
    }));
    assert.ok(layout.scrollWidth <= layout.width + 1, `No horizontal overflow at ${width}`);
    for (let index = 1; index < layout.marks.length; index += 1) assert.ok(layout.marks[index].left >= layout.marks[index - 1].right, `No overlapping shortcut labels at ${width}`);
    await detail.locator(".detail-toolbar").screenshot({ path: path.join(root, `.cache/detail-slider-${width}.png`) });
  }
  await slider.press("End"); await check(99);
  await slider.press("ArrowRight"); await check(99);
  await slider.press("Home"); await check(1);
  await slider.press("ArrowLeft"); await check(1);
  assert.equal(await detail.locator(".growth-curve-section").count(), 0);
  assert.deepEqual(errors, []);

  const failure = await browser.newPage();
  await failure.route("**/data/growth-curves.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await failure.goto(baseUrl, { waitUntil: "networkidle" });
  await failure.locator(".table-avatar").first().click();
  await failure.locator('.detail-level-status[role="alert"]').waitFor();
  assert.equal(await failure.locator("#detail-level").isDisabled(), true);
  for (const level of shortcuts) assert.equal(await failure.locator(".detail-level-marks").getByRole("button", { name: `${level}级`, exact: true }).isDisabled(), ![1,60,90,99].includes(level));
  for (const bubble of await failure.locator(".detail-promotion-bubble").all()) assert.equal(await bubble.isDisabled(), true);
  await failure.locator(".detail-level-marks").getByRole("button", { name: "60级", exact: true }).click();
  assert.equal(await failure.locator(".detail-toolbar h3").innerText(), "60级基础属性");
  await failure.unroute("**/data/growth-curves.json");
  await failure.getByRole("button", { name: "重试", exact: true }).click();
  await failure.waitForFunction(() => document.querySelector("#detail-level")?.disabled === false);
  console.log(JSON.stringify({ ok: true, levelsVerified: 99, dragUpdatesBeforeRelease: true, viewports: [1440, 1152, 768, 390, 320], rankingAndColonization: true, failureAndRetry: true }));
} finally {
  await browser.close();
}
