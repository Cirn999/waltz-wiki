import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, `public/data/${name}.json`), "utf8"));
const maiden = (await read("maidens")).rows.find((row) => row.id === 7002);
const skins = (await read("maiden-skins")).rows[7002];
// Ignore near-transparent export artifacts; compare the actual painted subject,
// not the differently padded source-image rectangles.
const visibleBounds = async (file) => {
  const { data, info } = await sharp(path.join(root, "public", file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const occupied = [];
  for (let y = 0; y < info.height; y++) {
    let count = 0;
    for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * info.channels + 3] >= 128) count++;
    if (count >= info.width * .01) occupied.push(y);
  }
  return { width: info.width, height: info.height, top: occupied[0], bottom: occupied.at(-1) + 1 };
};
if (process.argv.includes("--inspect")) {
  console.log(JSON.stringify({ maiden: { id: maiden.id, image: maiden.image, modelId: maiden.modelId }, bounds: (await read("card-framing")).rows[7002], skins }, null, 2));
  for (const file of [maiden.image, skins[0].image]) {
    console.log(JSON.stringify({ file, ...await visibleBounds(file) }));
  }
  process.exit(0);
}
const cache = path.join(root, ".cache/epsilon-card-framing");
await fs.mkdir(cache, { recursive: true });
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3173", { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click(); await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await page.locator(".search-box input").fill(maiden.tank); await page.locator(".search-box button").click();
  await page.getByRole("button", { name: "皮肤分散", exact: true }).click();
  await page.locator('.atlas-entry[data-skin-id="' + skins.at(-1).id + '"]').waitFor();
  const classic = page.locator('.atlas-entry[data-skin-id="0"] .atlas-hero');
  const snack = page.locator('.atlas-entry[data-skin-id="' + skins[0].id + '"] .atlas-hero');
  const dimensions = async (image) => image.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const view = element.parentElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left - view.left, top: rect.top - view.top, viewHeight: view.height, fit: style.objectFit };
  });
  await classic.evaluate((element) => element.decode()); await snack.evaluate((element) => element.decode());
  const a = await dimensions(classic), b = await dimensions(snack);
  assert.equal(a.fit, "contain"); assert.equal(b.fit, "contain");
  for (const key of ["width", "height", "left"]) assert.ok(Math.abs(a[key] - b[key]) < .1, `Keep compact Q-version scale: ${key}`);
  assert.ok(a.top > b.top, "Classic must move down to compensate for bottom padding");
  const classicBounds = await visibleBounds(maiden.image), snackBounds = await visibleBounds(skins[0].image);
  const subject = (box, image) => {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const top = box.top + (box.height - image.height * scale) / 2 + image.top * scale;
    const bottom = top + (image.bottom - image.top) * scale;
    return { top, bottom, center: (top + bottom) / 2 };
  };
  // Check painted subjects at multiple grid/card sizes, not just equal <img> boxes.
  for (const width of [320, 390, 1280, 1920]) {
    await page.setViewportSize({ width, height: 960 });
    const classicBox = await dimensions(classic), snackBox = await dimensions(snack);
    const classicSubject = subject(classicBox, classicBounds), snackSubject = subject(snackBox, snackBounds);
    assert.ok(Math.abs(classicSubject.center - snackSubject.center) < .2, `${width}: painted centers must align`);
    for (const edge of ["top", "bottom"]) assert.ok(Math.abs(classicSubject[edge] - snackSubject[edge]) / classicBox.viewHeight < .007, `${width}: ${edge} must visually align`);
  }
  await page.setViewportSize({ width: 1280, height: 960 });
  const allSources = await page.locator(".atlas-hero").evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  assert.deepEqual(allSources, [maiden.image, ...skins.map((skin) => skin.image)]);
  await page.locator(".card-atlas").evaluate(async (element) => { await Promise.all([...element.querySelectorAll("img")].map((image) => image.decode())); await document.fonts.ready; });
  await page.screenshot({ path: path.join(cache, "classic-and-skins.png"), fullPage: true });
  await page.getByRole("button", { name: "皮肤合并", exact: true }).click();
  assert.deepEqual(await dimensions(classic), a);
  await page.getByRole("button", { name: "方形头像", exact: true }).click();
  assert.equal(await page.locator(".table-portrait-head").getAttribute("src"), (await read("table-portraits")).rows[7002]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ paintedSubjectCentersAligned: true, scaleUnchanged: true, widths: [320, 390, 1280, 1920], mergedAndSeparate: true, imageSourcesUnchanged: true, squareAvatarUnchanged: true, errors }, null, 2));
} finally { await browser.close(); }
