import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2];
assert.ok(baseUrl, "Pass the URL serving Android-staged assets");
const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(runtime, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
const reports = [];
try {
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const viewport of [{ width: 1067, height: 552 }, { width: 800, height: 450 }, { width: 600, height: 360 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1.5,
      userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.0.0 Mobile Safari/537.36" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("tr[data-maiden-id]").first().waitFor();
    const workspace = page.locator(".app-shell.table-mode");
    assert.equal(await workspace.evaluate((element) => getComputedStyle(element).overflowX), "auto");
    const initialViewport = await page.evaluate(() => ({ width: innerWidth, clientWidth: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth }));
    assert.ok(Math.abs(initialViewport.width - viewport.width) <= 1, `matrix must not expand Android layout viewport: ${JSON.stringify(initialViewport)}`);
    await workspace.evaluate((element) => element.scrollTo({ left: 600, top: 1450, behavior: "instant" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const readGeometry = () => page.evaluate(() => {
      const box = (element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const nav = box(document.querySelector(".site-header"));
      const header = box(document.querySelector(".table-heading-row .column-id"));
      const filter = box(document.querySelector(".table-filter-row .column-id"));
      const row = [...document.querySelectorAll("tr[data-maiden-id]")].find((row) => {
        const r = row.getBoundingClientRect();
        return r.height > 0 && r.bottom > filter.y + filter.height + 8 && r.top < innerHeight - 85;
      });
      const identity = row ? [".column-id", ".column-tank"].map((selector) => box(row.querySelector(selector))) : [];
      const root = document.querySelector(".app-shell.table-mode");
      return { nav, header, filter, identity, scroll: { x: root.scrollLeft, y: root.scrollTop } };
    });
    const assertFrozen = (g) => {
      assert.ok(Math.abs(g.header.y - (g.nav.y + g.nav.height)) <= 2, `header must stay below navigation: ${JSON.stringify(g)}`);
      assert.ok(Math.abs(g.filter.y - (g.header.y + g.header.height)) <= 2, "filter row must be frozen with the header");
      assert.ok(Math.abs(g.header.x) <= 2, "avatar header must freeze horizontally");
      assert.equal(g.identity.length, 2, `at least one row must intersect the visible body area: ${JSON.stringify(g)}`);
      assert.ok(Math.abs(g.identity[0].x) <= 2, `avatar body must freeze horizontally: ${JSON.stringify(g)}`);
      assert.ok(Math.abs(g.identity[1].x - g.identity[0].width) <= 2, "tank name must freeze immediately next to avatar");
    };
    assertFrozen(await readGeometry());
    const ids = await page.locator("tr[data-maiden-id]").evaluateAll((rows) => rows.slice(0, 2).map((row) => row.dataset.maidenId));
    assert.equal(ids.length, 2);
    for (const id of ids) await page.locator(`tr[data-maiden-id="${id}"] .table-compare`).tap();
    const compare = page.getByRole("button", { name: "开始比较 →", exact: true });
    assert.ok(await compare.isEnabled());
    await workspace.evaluate((element) => element.scrollTo({ left: 600, top: 1450, behavior: "instant" }));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const assertTray = async () => {
      const tray = await page.locator(".compare-tray").boundingBox();
      const button = await compare.boundingBox();
      assert.ok(tray.width <= Math.min(600, viewport.width - 24) + 1, "comparison bar must be compact");
      assert.ok(tray.x >= 0 && tray.x + tray.width <= viewport.width + 1, "comparison bar must fit the current screen");
      assert.ok(button.x >= 0 && button.x + button.width <= viewport.width && button.y >= 0 && button.y + button.height < viewport.height, "start button must remain visible");
      assert.ok(await compare.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }), "start button must remain touchable");
      return tray;
    };
    await assertTray();
    const cdp = await context.newCDPSession(page);
    const swipe = async (from, to) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...from, id: 1 }] });
      for (let step = 1; step <= 10; step++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10, id: 1 }] });
        await page.waitForTimeout(25);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(300);
    };
    const before = await readGeometry();
    const fingerY = viewport.height - 110;
    await swipe({ x: viewport.width - 50, y: fingerY }, { x: viewport.width - 250, y: fingerY });
    const horizontal = await readGeometry();
    assert.ok(horizontal.scroll.x > before.scroll.x + 100, "right-to-left finger drag must scroll the workspace");
    assertFrozen(horizontal);
    await assertTray();
    await swipe({ x: viewport.width - 40, y: viewport.height - 100 }, { x: viewport.width - 40, y: 180 });
    const vertical = await readGeometry();
    assert.ok(vertical.scroll.y > horizontal.scroll.y + 40, "bottom-to-top finger swipe must scroll the workspace");
    assertFrozen(vertical);
    const tray = await assertTray();
    await page.screenshot({ path: path.join(root, `.cache/android-table-scroll-${viewport.width}.png`) });
    await compare.tap();
    await page.locator(".compare-modal").waitFor();
    const modal = await page.locator(".compare-modal").boundingBox();
    assert.ok(modal.x >= 0 && modal.x + modal.width <= viewport.width + 1, "comparison must open on the current screen");
    assert.deepEqual(errors, []);
    reports.push({ viewport, initialViewport, final: vertical, tray, comparisonOpened: true, pageErrors: errors });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
