import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3017";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath, ignoreDefaultArgs: ["--hide-scrollbars"] });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill("野牛II");
  await page.locator(".search-box button").click();
  const modal = page.locator(".detail-modal");
  const backdrop = page.locator(".modal-backdrop").filter({ has: modal });
  const open = async () => {
    await page.locator(".table-avatar").first().click();
    await modal.waitFor();
    await modal.locator(".detail-acquisition-slot-grid").waitFor();
  };
  const staysOpen = async (action) => assert.equal(await modal.count(), 1, `${action} must not dismiss the detail view`);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1152, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await open();
    const geometry = await backdrop.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    });
    const gutter = geometry.width - geometry.clientWidth;
    assert.ok(gutter > 0, "Regression must exercise a real native scrollbar, not a simulated DOM scrollbar");
    assert.ok(geometry.scrollHeight > geometry.clientHeight, "Detail should overflow vertically");
    const scrollbarX = geometry.x + geometry.clientWidth + gutter / 2;
    // Native Windows scrollbars have arrow buttons at each end of the track.
    const trackHeight = geometry.clientHeight - gutter * 2;
    const thumbHeight = Math.max(20, trackHeight * geometry.clientHeight / geometry.scrollHeight);
    const thumbY = geometry.y + gutter + thumbHeight / 2;
    await page.mouse.move(scrollbarX, thumbY);
    await page.mouse.down();
    await staysOpen("Pressing the scrollbar thumb");
    await page.mouse.move(scrollbarX, thumbY + 140, { steps: 12 });
    await page.mouse.up();
    await staysOpen("Dragging the scrollbar thumb");
    await page.waitForFunction(() => document.querySelector(".detail-modal")?.parentElement.scrollTop > 50);
    await page.mouse.click(scrollbarX, geometry.y + geometry.clientHeight - gutter - 12);
    await staysOpen("Clicking the scrollbar track");

    await backdrop.evaluate((element) => { element.scrollTop = 0; });
    await modal.locator(".detail-identity-table").click();
    await staysOpen("Clicking detail content");
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 350);
    await page.waitForFunction(() => document.querySelector(".detail-modal")?.parentElement.scrollTop > 50);
    await staysOpen("Mouse wheel scrolling");

    await backdrop.evaluate((element) => { element.scrollTop = 0; });
    await modal.getByRole("button", { name: "排名范围筛选", exact: true }).click();
    await page.getByRole("dialog", { name: "属性排名筛选", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await staysOpen("Closing the nested rank filter");
    await page.keyboard.press("Escape");
    await modal.waitFor({ state: "detached" });
    await open();
    await modal.locator(".modal-close").click();
    await modal.waitFor({ state: "detached" });

    if (viewport.width > 700) {
      await open();
      await page.mouse.click(5, 100, { button: "right" });
      await staysOpen("Right-clicking the backdrop");
      await page.mouse.click(5, 100);
      await modal.waitFor({ state: "detached" });
    }
    console.log(JSON.stringify({ viewport, gutter, thumbHeight, nativeScrollbarDrag: "passed", dismissalControls: "passed" }));
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
} finally {
  await browser.close();
}
