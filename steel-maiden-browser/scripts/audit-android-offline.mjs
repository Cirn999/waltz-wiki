import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Exercise an APK's exported assets with touch input and the Android interface.
// This validates the web side of the bridge, not a real device's MediaStore.
const baseUrl = process.argv[2];
assert.ok(baseUrl, "Pass the URL serving the APK's assets directory");
const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(runtime)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(runtime, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 600 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/132.0.0.0 Mobile Safari/537.36",
  });
  await context.addInitScript(() => {
    window.__androidImages = [];
    window.SteelMaidenAndroid = {
      saveImage(dataUrl, fileName) {
        window.__androidImages.push({ dataUrl, fileName });
        return true;
      },
    };
  });
  const page = await context.newPage();
  const errors = [], failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("tr[data-maiden-id]").first().waitFor();
  const dataset = await (await context.request.get(new URL("data/maidens.json", baseUrl).href)).json();
  const implemented = dataset.rows.filter((row) => row.implemented);
  assert.equal(implemented.length, 618);
  assert.equal(dataset.rows.length, 777);
  const assertRows = async (expected) => {
    await page.waitForFunction((count) => document.querySelectorAll("tr[data-maiden-id]").length === count, expected.length);
    const ids = await page.locator("tr[data-maiden-id]").evaluateAll((rows) => rows.map((row) => Number(row.dataset.maidenId)));
    assert.deepEqual(new Set(ids), new Set(expected.map((row) => row.id)));
  };
  const openFilters = async () => {
    await page.getByRole("button", { name: /筛选条件/ }).tap();
    return page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  };
  const applyFilters = async (dialog) => {
    await dialog.getByRole("button", { name: "确定", exact: true }).tap();
    await dialog.waitFor({ state: "detached" });
  };
  await assertRows(implemented);
  let filters = await openFilters();
  const filterBounds = await filters.boundingBox();
  assert.ok(filterBounds.x >= 0 && filterBounds.x + filterBounds.width <= 1025, "Android filters must fit the current screen");
  await filters.getByRole("button", { name: "显示未实装", exact: true }).tap();
  await filters.getByRole("button", { name: "取消", exact: true }).tap();
  await assertRows(implemented);
  filters = await openFilters();
  await filters.getByRole("button", { name: "显示未实装", exact: true }).tap();
  await applyFilters(filters);
  await assertRows(dataset.rows);
  filters = await openFilters();
  await filters.getByRole("button", { name: "显示未实装", exact: true }).tap();
  await applyFilters(filters);
  await assertRows(implemented);
  filters = await openFilters();
  await filters.getByRole("button", { name: "显示未实装", exact: true }).tap();
  await applyFilters(filters);
  await assertRows(dataset.rows);
  filters = await openFilters();
  await filters.getByRole("button", { name: "重置", exact: true }).tap();
  await applyFilters(filters);
  await assertRows(implemented);
  const maidenId = await page.locator("tr[data-maiden-id]").first().getAttribute("data-maiden-id");
  assert.equal(await page.getByRole("combobox", { name: "才艺排序依据" }).locator("option").count(), 12);
  await page.getByRole("button", { name: "攻略链接", exact: true }).tap();
  const guides = await page.locator("#guide-links-menu a").evaluateAll((links) => links.map((link) => ({ url: link.href, target: link.target })));
  assert.equal(guides.length, 5);
  assert.ok(guides.every((link) => link.target === "_blank" && link.url.startsWith("https://")));
  await page.locator(`tr[data-maiden-id="${maidenId}"] .table-avatar`).tap();
  await page.screenshot({ path: path.join(root, ".cache/android-detail-before-loadout.png") });
  const detailBounds = await page.locator(".detail-modal").boundingBox();
  assert.ok(detailBounds.x >= 0 && detailBounds.x + detailBounds.width <= 1024, "Android details must be centered inside the visible screen, not the wide matrix");
  await page.locator(".detail-modal .detail-actions").getByRole("button", { name: "配装模拟", exact: true }).tap();
  const sim = page.locator(".sim-shell");
  await sim.locator(".sim-growth-status").waitFor({ state: "hidden" });
  const levelInput = sim.getByRole("spinbutton", { name: "钢舞姬等级", exact: true });
  await levelInput.fill("41");
  await levelInput.blur();
  const values = (await sim.locator(".sim-stat:not(.sim-grade) strong").allTextContents()).map((text) => Number(text.replaceAll(",", "")));
  assert.equal(values.length, 8);
  assert.ok(values.every(Number.isFinite));
  assert.ok(values[0] > 0 && values[1] > 0);
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await sim.screenshot({ path: path.join(root, ".cache/android-offline-landscape.png") });
  await sim.getByRole("button", { name: "保存图片到相册", exact: true }).tap();
  await page.waitForFunction(() => window.__androidImages.length === 1, null, { timeout: 30_000 });
  const delivered = await page.evaluate(() => window.__androidImages[0]);
  assert.ok(delivered.dataUrl.startsWith("data:image/png;base64,"));
  assert.ok(delivered.fileName.endsWith(".png"));
  const png = Buffer.from(delivered.dataUrl.split(",")[1], "base64");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(png.length > 1000);
  await fs.writeFile(path.join(root, ".cache/android-loadout-gallery.png"), png);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(`tr[data-maiden-id="${maidenId}"] .table-avatar`).tap();
  await page.locator(".detail-modal .detail-actions").getByRole("button", { name: "配装模拟", exact: true }).tap();
  await sim.locator(".sim-growth-status").waitFor({ state: "hidden" });
  assert.equal(await levelInput.inputValue(), "41", "saved level must survive a new page session at the same origin");
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(JSON.stringify({
    maidens: dataset.rows.length, defaultCount: implemented.length, expandedCount: dataset.rows.length,
    implementationSwitch: "enable, disable, cancelled draft and reset passed",
    guides: guides.length, touchLayout: "1024×600 landscape",
    loadoutLevel: 41, values, storageReload: "passed", galleryBridge: "web-side PNG handoff passed",
    pngBytes: png.length, pngWidth: png.readUInt32BE(16), pngHeight: png.readUInt32BE(20),
    pageErrors: errors, failedRequests,
  }, null, 2));
} finally { await browser.close(); }
