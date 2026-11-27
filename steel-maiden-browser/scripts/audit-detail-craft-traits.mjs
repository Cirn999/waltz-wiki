import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const yak = data.rows.find((row) => row.tank === "Yak-1B");
for (const key of ["engineOptions", "bodyOptions", "armorOptions"]) assert.deepEqual([...new Set(yak[key].map((option) => option.rank))].sort(), [1, 2, 3]);
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(runtime, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const errors = [];
async function openYak(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "搜索钢舞姬" }).fill("Yak-1B");
  await page.locator(".search-box button").click();
  await page.locator('.atlas-entry[data-maiden-id="8041"] button').first().click();
  await page.locator(".detail-modal .craft-type-group").first().waitFor();
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await openYak(page);
  const groups = page.locator(".detail-modal .craft-type-group");
  for (const [index, label, key] of [[0, "引擎", "engineOptions"], [1, "车体", "bodyOptions"], [2, "装甲", "armorOptions"]]) {
    const group = groups.nth(index);
    for (const rank of [3, 1, 2]) {
      await group.getByRole("button", { name: label + "期数：" + rank + "期", exact: true }).click();
      assert.equal(await group.locator(".craft-card").count(), yak[key].filter((option) => option.rank === rank).length);
      assert.ok((await group.locator(".ammo-rank").allTextContents()).every((value) => value === String(rank)));
      assert.doesNotMatch(await group.innerText(), /未分期|0期/);
      const chip = group.locator("[data-trait-name]").first();
      await chip.hover();
      await page.getByRole("tooltip").waitFor({ state: "visible" });
      assert.equal(await page.getByRole("tooltip").locator("p").innerText(), await chip.getAttribute("data-trait-description"));
      await page.mouse.move(0, 0);
    }
  }
  const armorTrait = groups.nth(2).locator('[data-trait-name="内层韧化"]');
  await armorTrait.focus();
  await page.getByRole("tooltip").waitFor({ state: "visible" });
  assert.match(await page.getByRole("tooltip").innerText(), /受到对手穿甲值的影响较小/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".detail-modal").count(), 1);
  await page.getByRole("tooltip").waitFor({ state: "detached" });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobile = await context.newPage();
  await openYak(mobile);
  const target = mobile.locator('.detail-modal [data-trait-name="内层韧化"]').first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const session = await context.newCDPSession(mobile);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await mobile.waitForTimeout(550);
  await mobile.getByRole("tooltip").waitFor({ state: "visible" });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.match(await mobile.getByRole("tooltip").innerText(), /受到对手穿甲值的影响较小/);
  assert.ok(await mobile.getByRole("tooltip").evaluate((element) => {
    const r = element.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }));
  await fs.mkdir(path.join(root, ".cache/craft-traits-generations-20261127"), { recursive: true });
  await mobile.screenshot({ path: path.join(root, ".cache/craft-traits-generations-20261127/mobile-long-press.png") });
  await mobile.touchscreen.tap(5, 5);
  await mobile.getByRole("tooltip").waitFor({ state: "detached" });
  assert.equal(await mobile.locator(".detail-modal").count(), 1);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + 20, y: point.y }] });
  await mobile.waitForTimeout(550);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await mobile.getByRole("tooltip").count(), 0, "Moving must cancel a pending long press");
  await context.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ yakGenerations: [1, 2, 3], independentCraftGroups: true, hover: true, keyboard: true, realTouchLongPress: true, outsideDismiss: true, scrollGestureCancellation: true, errors }));
} finally { await browser.close(); }
