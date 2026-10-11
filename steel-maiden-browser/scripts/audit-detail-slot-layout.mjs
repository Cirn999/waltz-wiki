import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill("261-2工程");
  await page.locator(".search-box button").click();
  await page.locator(".maiden-table tbody tr[data-maiden-id]").first().waitFor();
  await page.locator(".table-avatar").first().click();

  const modal = page.locator(".detail-modal");
  assert.equal(await modal.locator(".growth-curve-section").count(), 0);
  const gallery = modal.locator(".portrait-gallery");
  const overview = modal.locator(".detail-portrait-info-grid");
  const group = modal.locator(".detail-acquisition-slot-grid");
  const acquisition = group.locator(":scope > .acquisition-section");
  const slots = group.locator(":scope > .detail-slot-section");
  await slots.waitFor();
  assert.equal(await group.locator(":scope > .detail-section").count(), 2);
  assert.ok(await slots.locator(".slot-icon-list .game-icon-chip").count() > 0);
  assert.equal(await modal.locator(".detail-loadout-section .slot-icon-list").count(), 0);
  const desktopLeft = await gallery.boundingBox();
  const desktopRight = await acquisition.boundingBox();
  const desktopSlots = await slots.boundingBox();
  const magic = await modal.locator(".magic-ordnance-section").boundingBox();
  assert.ok(desktopLeft && desktopRight && desktopSlots && magic);
  assert.ok(desktopLeft.x + desktopLeft.width < desktopRight.x && Math.abs(desktopLeft.y - desktopRight.y) < 2, "Desktop: portrait left, acquisition right");
  assert.ok(Math.abs(desktopRight.x - desktopSlots.x) < 2 && desktopSlots.y >= desktopRight.y + desktopRight.height, "Acquisition above slots");
  assert.ok(Math.abs(desktopLeft.y + desktopLeft.height - desktopSlots.y - desktopSlots.height) < 2, "Portrait and right column share bottom edge");
  assert.ok(desktopSlots.y + desktopSlots.height <= magic.y, "Both sections should precede magic modification");

  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  const desktopScreenshot = path.join(root, ".cache", "detail-acquisition-slots-desktop.png");
  await overview.screenshot({ path: desktopScreenshot });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLeft = await acquisition.boundingBox();
  const mobileRight = await slots.boundingBox();
  assert.ok(mobileLeft && mobileRight);
  assert.ok(mobileRight.y >= mobileLeft.y + mobileLeft.height, "Mobile: sections should stack without overlap");
  const mobileGallery = await gallery.boundingBox();
  assert.ok(mobileGallery.y + mobileGallery.height <= mobileLeft.y, "Mobile: portrait precedes acquisition and slots");
  const mobileScreenshot = path.join(root, ".cache", "detail-acquisition-slots-mobile.png");
  await group.screenshot({ path: mobileScreenshot });
  const slotCount = await slots.locator(".slot-icon-list .game-icon-chip").count();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.locator(".modal-close").click();

  for (const [tank, count] of [["丘吉尔Mk-IV", 2], ["蟋蟀K", 3], ["犀牛自行反坦克炮", 3], ["野牛II", 4], ["M51超级谢尔曼", 2]]) {
    await page.locator(".search-box input").fill(tank);
    await page.locator(".search-box button").click();
    await page.locator(".maiden-table tbody tr[data-maiden-id]").first().waitFor();
    await page.locator(".table-avatar").first().click();
    const routeGrid = page.locator(".detail-modal .acquisition-grid");
    const cards = routeGrid.locator(".acquisition-card");
    assert.equal(await cards.count(), count);
    assert.equal(await page.locator(".detail-modal .acquisition-heading b").first().innerText(), `${count} 种`, "Badge follows deduplicated route count");
    if (tank === "野牛II") {
      assert.equal(await cards.filter({ hasText: "预备队徽记 ×36" }).count(), 1, "Reserve exchange must appear exactly once");
      assert.equal(await cards.filter({ hasText: "兑换处" }).count(), 0, "Generic alias must not create another card");
    }
    if (tank === "M51超级谢尔曼") {
      const agency = cards.filter({ hasText: "特勤局精英" });
      assert.equal(await agency.count(), 1);
      assert.ok((await agency.innerText()).includes("特勤局胸徽 ×1"), "Merging preserves both the named menu path and exchange cost");
      assert.equal(await cards.filter({ hasText: "兑换处" }).count(), 0);
    }
    assert.equal(await routeGrid.evaluate((element) => element.classList.contains("acquisition-grid-multi")), count > 2);
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    assert.ok(first && second);
    if (count > 2) assert.ok(Math.abs(first.y - second.y) < 2 && second.x > first.x, `${count} routes should use two columns`);
    else assert.ok(second.y > first.y && Math.abs(first.x - second.x) < 2, "Two routes should retain one column");
    if (count === 4) {
      const screenshot = path.join(root, ".cache", "detail-acquisition-four-routes.png");
      await page.locator(".detail-modal .detail-acquisition-slot-grid").screenshot({ path: screenshot });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileGrid = await routeGrid.boundingBox();
      const mobileSecond = await cards.nth(1).boundingBox();
      assert.ok(mobileGrid && mobileSecond);
      assert.ok(mobileSecond.x + mobileSecond.width <= mobileGrid.x + mobileGrid.width + 1, "Two-column mobile cards should not overflow");
      const mobileScreenshot = path.join(root, ".cache", "detail-acquisition-four-routes-mobile.png");
      await page.locator(".detail-modal .detail-acquisition-slot-grid").screenshot({ path: mobileScreenshot });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.locator(".detail-modal .modal-close").click();
  }
  console.log(JSON.stringify({ desktopScreenshot, mobileScreenshot, slotCount, routeCountsChecked: [1, 2, 3, 4], reserveExchangeDeduplicated: true }));
} finally {
  await browser.close();
}
