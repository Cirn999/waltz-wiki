import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await fs.readFile(path.join(root, "../analysis_apk/output/maiden_skins.json"), "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const skins = JSON.parse(await fs.readFile(path.join(root, "public/data/maiden-skins.json"), "utf8"));
assert.deepEqual(Object.keys(skins.rows), Object.keys(source.rows));
const modelIds = new Set();
for (const [id, rows] of Object.entries(skins.rows)) {
  assert.ok(catalog.rows.some((r) => r.id === Number(id)), `Unknown maiden ${id}`);
  assert.equal(new Set(rows.map((r) => r.modelId)).size, rows.length);
  assert.deepEqual(rows.map((r) => r.modelId), source.rows[id].skins.map((s) => s.modelId));
  for (const row of rows) {
    assert.ok(row.name);
    const info = await sharp(path.join(root, "public", row.image)).metadata();
    assert.ok(info.width > 100 && info.height > 100 && info.hasAlpha, `Invalid portrait ${row.image}`);
    modelIds.add(row.modelId);
  }
}
assert.deepEqual(skins.rows[7002].map((s) => [s.name, s.modelId]), [["外星吃货", 61508], ["埃普西隆(原生型)", 61509], ["星团制服", 61515]]);
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
const thumbnails = await Promise.all([...modelIds].map(async (id, index) => ({
  input: await sharp(path.join(root, `public/art/skins/${id}.webp`)).resize(150, 175, { fit: "contain", background: "#edf2e6" }).extend({ bottom: 5, background: "#ffffff" }).png().toBuffer(),
  left: index % 8 * 150, top: Math.floor(index / 8) * 180,
})));
await sharp({ create: { width: 1200, height: Math.ceil(modelIds.size / 8) * 180, channels: 4, background: "#edf2e6" } }).composite(thumbnails).png().toFile(path.join(root, ".cache/skin-contact-sheet.png"));

const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const url = process.argv[2] || "http://localhost:3100";
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    window.revokedPortraitUrls = [];
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => { window.revokedPortraitUrls.push(url); revoke(url); };
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(url, { waitUntil: "networkidle" });
  const open = async (id) => { await page.locator(`tr[data-maiden-id="${id}"] .table-avatar`).click(); await page.locator(".portrait-gallery").waitFor(); };
  await open(7002);
  const gallery = page.locator(".portrait-gallery");
  const caption = gallery.locator(".portrait-gallery-caption");
  await gallery.getByRole("button", { name: "下一套立绘" }).waitFor();
  assert.match(await caption.innerText(), /默认立绘/);
  assert.match(await caption.innerText(), /1 \/ 4/);
  const verifyPng = async (name, closeWithEscape = false) => {
    const thumbnail = gallery.locator(".portrait-gallery-stage > img");
    await thumbnail.evaluate((img) => img.decode());
    const originalSize = await thumbnail.evaluate((img) => ({ width: img.naturalWidth, height: img.naturalHeight }));
    const captionBefore = await caption.innerText();
    await thumbnail.dblclick();
    const viewer = page.locator(".portrait-png-dialog");
    const largeImage = viewer.locator(".portrait-png-canvas > img");
    await largeImage.waitFor();
    await largeImage.evaluate((img) => img.decode());
    assert.equal(await viewer.evaluate((el) => el.matches(":modal")), true, "PNG viewer is a modal with native focus isolation");
    assert.match(await viewer.innerText(), /右键图片可保存 PNG/);
    assert.equal(await largeImage.evaluate((img) => img.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))), true, "Native right-click menu must not be suppressed");
    const png = await largeImage.evaluate(async (img) => {
      const response = await fetch(img.src);
      const blob = await response.blob();
      const bytes = [...new Uint8Array(await blob.arrayBuffer())];
      return { url: img.src, type: blob.type, bytes, width: img.naturalWidth, height: img.naturalHeight };
    });
    assert.equal(png.type, "image/png");
    assert.deepEqual(png.bytes.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10], "Actual PNG bytes, not renamed WebP");
    assert.deepEqual({ width: png.width, height: png.height }, originalSize, "Export uses full source dimensions, not thumbnail dimensions");
    const info = await sharp(Buffer.from(png.bytes)).metadata();
    assert.equal(info.hasAlpha, true, "PNG preserves the portrait's transparent background");
    const alpha = await sharp(Buffer.from(png.bytes)).extractChannel(3).stats();
    assert.equal(alpha.channels[0].min, 0, "Preview checkerboard must not be baked into PNG");
    assert.ok(alpha.channels[0].max > 0);
    await fs.writeFile(path.join(root, `.cache/portrait-png-${name}.png`), Buffer.from(png.bytes));
    await viewer.screenshot({ path: path.join(root, `.cache/portrait-preview-${name}.png`) });
    if (closeWithEscape) await page.keyboard.press("Escape");
    else await viewer.getByRole("button", { name: "关闭立绘大图" }).click();
    assert.equal(await viewer.count(), 0);
    assert.equal(await page.locator(".detail-modal").count(), 1, "Closing PNG must leave the maiden detail open");
    assert.equal(await caption.innerText(), captionBefore, "Preview does not change the selected skin");
    const revoked = await page.evaluate((url) => window.revokedPortraitUrls.includes(url), png.url);
    assert.equal(revoked, true, "Blob URL is released after closing");
  };
  await verifyPng("default", true);
  const names = [];
  for (const skin of skins.rows[7002]) {
    await gallery.getByRole("button", { name: "下一套立绘" }).click();
    assert.match(await caption.innerText(), new RegExp(skin.name.replace(/[()]/g, "\\$&")));
    assert.equal(await gallery.locator("img").getAttribute("src"), skin.image);
    await gallery.locator("img").evaluate((img) => img.decode());
    if (skin === skins.rows[7002][0]) await verifyPng("skin");
    names.push(skin.name);
  }
  await gallery.getByRole("button", { name: "下一套立绘" }).click();
  assert.match(await caption.innerText(), /默认立绘/);
  await gallery.getByRole("button", { name: "上一套立绘" }).click();
  assert.match(await caption.innerText(), /星团制服/);
  await gallery.locator(".portrait-gallery-stage").focus();
  await page.keyboard.press("ArrowLeft");
  assert.match(await caption.innerText(), /埃普西隆\(原生型\)/);
  // Detail curves are removed; independent level controls still preserve the chosen skin.
  assert.equal(await page.locator(".detail-modal .growth-curve-section").count(), 0);
  assert.equal(await page.locator(".detail-modal .detail-level-marks .active").innerText(), "1级");
  await page.locator(".detail-modal .detail-level-marks").getByRole("button", { name: "99级", exact: true }).click();
  assert.match(await caption.innerText(), /埃普西隆\(原生型\)/);
  const bounds = await page.locator(".detail-portrait-info-grid > *").evaluateAll((els) => els.map((el) => {
    const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  }));
  assert.ok(Math.abs(bounds[0].width - bounds[1].width) < 1, "Equal half-width columns");
  assert.ok(Math.abs(bounds[0].y - bounds[1].y) < 1 && bounds[0].x < bounds[1].x);
  assert.ok(bounds.every((b) => b.scrollWidth <= b.clientWidth + 1), "No desktop panel overflow");
  assert.ok(bounds.every((b) => b.height < 550), "Keep the gallery row compact");
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  const screenshot = path.join(root, ".cache/skin-gallery-desktop.png");
  await page.locator(".detail-portrait-info-grid").screenshot({ path: screenshot });
  await page.setViewportSize({ width: 390, height: 844 });
  await gallery.locator("img").evaluate((img) => img.decode());
  await verifyPng("mobile", true);
  const mobile = await page.locator(".detail-portrait-info-grid").evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, columns: getComputedStyle(el).gridTemplateColumns }));
  assert.ok(mobile.scroll <= mobile.width + 1, "No mobile overflow");
  assert.equal(mobile.columns.split(" ").length, 1, "Stacked mobile layout");
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.locator(".detail-portrait-info-grid").screenshot({ path: path.join(root, ".cache/skin-gallery-mobile.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".detail-modal .modal-close").click();
  const single = catalog.rows.find((r) => r.implemented && r.image && !skins.rows[r.id]);
  await open(single.id);
  await gallery.locator("img").evaluate((img) => img.decode());
  assert.equal(await gallery.locator(".portrait-gallery-arrow").count(), 0);
  assert.equal(await gallery.locator("img").getAttribute("src"), single.image);
  assert.match(await caption.innerText(), /默认立绘/);
  await verifyPng("single");
  // Keyboard opening and backdrop closing work without changing the detail.
  await gallery.locator("img").focus();
  await page.keyboard.press("Enter");
  await page.locator(".portrait-png-canvas > img").waitFor();
  await page.mouse.click(1, 1);
  assert.equal(await page.locator(".portrait-png-dialog").count(), 0);
  assert.equal(await page.locator(".detail-modal").count(), 1);
  assert.deepEqual(errors, []);
  // A failed lazy request retains default art and offers a retry.
  const failedPage = await browser.newPage();
  await failedPage.route("**/data/maiden-skins.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await failedPage.goto(url, { waitUntil: "networkidle" });
  await failedPage.locator('tr[data-maiden-id="7002"] .table-avatar').click();
  await failedPage.locator(".portrait-gallery-error").waitFor();
  assert.equal(await failedPage.locator(".portrait-gallery img").count(), 1);
  await failedPage.unroute("**/data/maiden-skins.json");
  await failedPage.locator(".portrait-gallery-error button").click();
  await failedPage.getByRole("button", { name: "下一套立绘" }).waitFor();
  console.log(JSON.stringify({ vehiclesWithSkins: Object.keys(skins.rows).length, portraits: modelIds.size, names, singleId: single.id, bounds, mobile, screenshot, errors }));
} finally { await browser.close(); }
