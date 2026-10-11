import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const baseUrl = process.argv[2];
assert.ok(baseUrl, "Pass the URL serving Android-packaged assets");
const rows = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8")).rows;
const skins = JSON.parse(await fs.readFile(path.join(root, "public/data/maiden-skins.json"), "utf8")).rows;
console.log("Device skin fixtures:", rows.filter((row) => row.implemented && skins[row.id] && /[A-Za-z]/.test(row.tank)).slice(0, 20).map((row) => ({ id: row.id, tank: row.tank })));
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(runtime, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
const reports = [];
try {
  for (const viewport of [{ width: 1067, height: 600 }, { width: 800, height: 450 }, { width: 600, height: 360 }]) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.0.0 Mobile Safari/537.36" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "剧情", exact: true }).tap();
    await page.getByRole("button", { name: "浏览序幕剧情", exact: true }).tap();
    await page.locator(".story-map-card").first().tap();
    const scene = page.locator(".story-scene");
    await scene.waitFor();
    await scene.tap();
    assert.equal(await scene.getAttribute("data-index"), "1");
    await page.getByRole("button", { name: "隐藏台词", exact: true }).tap();
    assert.equal(await scene.getAttribute("data-hidden"), "true");
    assert.equal(await page.locator(".story-hidden-hint").count(), 0);
    await scene.tap();
    assert.equal(await scene.getAttribute("data-hidden"), "false");
    assert.equal(await scene.getAttribute("data-index"), "1", "Restore must not skip a line");
    for (const name of ["上一句", "下一句", "关闭剧情", "对话记录"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `Unreachable ${name}: ${JSON.stringify(box)}`);
    }
    await page.getByRole("button", { name: "对话记录", exact: true }).tap();
    const chat = page.locator(".story-chat");
    assert.ok(await chat.evaluate((element) => element.scrollHeight > element.clientHeight));
    await page.getByRole("button", { name: "关闭剧情", exact: true }).tap();
    await page.getByRole("button", { name: "钢舞姬", exact: true }).tap();
    await page.getByRole("menuitem", { name: /卡牌图鉴/ }).tap();
    await page.locator(".search-box input").fill(rows.find((row) => row.id === 7002).tank);
    await page.locator(".search-box button").tap();
    const entry = page.locator('.atlas-entry[data-maiden-id="7002"]');
    await entry.locator("button").scrollIntoViewIfNeeded();
    for (const mode of ["竖版卡牌", "方形头像"]) {
      await page.getByRole("button", { name: mode, exact: true }).tap();
      await entry.locator("button").scrollIntoViewIfNeeded();
      // Let scroll and layout events settle before opening a menu which closes
      // on outside scrolling, as a user would after positioning the card.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(150);
      const box = await entry.locator("button").boundingBox();
      // Headless desktop Chromium does not synthesize WebView's native long-
      // press contextmenu. Check menu touch interaction here; verify the actual
      // long-press entry separately on Android with adb gestures.
      await entry.evaluate((element, point) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...point })), { clientX: box.x + box.width / 2, clientY: Math.min(viewport.height - 30, box.y + box.height / 2) });
      assert.equal(await page.locator(".atlas-skin-menu").count(), 1);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator(".detail-modal").count(), 0, "Opening the menu must not open detail");
      await page.getByRole("menuitemradio", { name: skins[7002][0].name, exact: true }).tap();
      assert.equal(await entry.getAttribute("data-skin-id"), String(skins[7002][0].id));
    }
    await page.screenshot({ path: path.join(root, `.cache/android-story-atlas-${viewport.width}.png`) });
    assert.deepEqual(errors, []);
    reports.push({ viewport, touchStoryRestore: true, menuTouchSelection: true, longPressEntry: "requires separate Android device verification", errors });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
