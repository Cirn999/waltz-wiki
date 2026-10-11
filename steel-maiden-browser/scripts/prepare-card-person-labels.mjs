// Complete-name bitmap graphics, not an embedded font or a reusable glyph atlas.
// Render on Windows with the approved SimSun face; shipped labels need no fonts.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "public/art/card-atlas/person-names");
const { rows: maidens } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 300, height: 3000 }, deviceScaleFactor: 1 });
const em = 96;
const rows = {}, names = new Map();
await fs.mkdir(output, { recursive: true });
try {
  // Match the approved white-serif sample at 18px, rendered >5x for crisp scaling.
  await page.setContent(`<style>html,body{margin:0;background:transparent}#name{display:inline-block;box-sizing:content-box;margin:0;padding:12px;writing-mode:vertical-rl;text-orientation:upright;white-space:pre;font:700 ${em}px/1.12 SimSun;letter-spacing:.10em;color:#f6f8fc;-webkit-text-stroke:${1.7 / 18 * em}px #253747;paint-order:stroke fill;text-shadow:0 ${em / 18}px ${em / 18}px #101c2c80}</style><p id="name">米歇尔·法梅加</p>`);
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable"); await session.send("CSS.enable");
  const { root: dom } = await session.send("DOM.getDocument");
  const { nodeId } = await session.send("DOM.querySelector", { nodeId: dom.nodeId, selector: "#name" });
  const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
  assert.ok(fonts.length && fonts.every((font) => font.familyName === "SimSun"), "SimSun is required to reproduce the approved sample; never export fallback glyphs");
  for (const maiden of maidens) {
    if (!maiden.person) continue;
    let asset = names.get(maiden.person);
    if (!asset) {
      const file = `${createHash("sha256").update(maiden.person).digest("hex").slice(0, 16)}.png`;
      await page.locator("#name").evaluate((element, text) => { element.textContent = text; }, maiden.person);
      const bitmap = await page.locator("#name").screenshot({ omitBackground: true, animations: "disabled" });
      const { width, height } = await sharp(bitmap).metadata();
      await sharp(bitmap).png({ compressionLevel: 9, palette: true, colours: 64, dither: 0, effort: 10 }).toFile(path.join(output, file));
      asset = { person: maiden.person, image: `/art/card-atlas/person-names/${file}`, width, height };
      names.set(maiden.person, asset);
      if (names.size % 100 === 0) console.log(`Rendered ${names.size} complete names`);
    }
    rows[maiden.id] = asset;
  }
  await fs.writeFile(path.join(root, "public/data/card-person-labels.json"), JSON.stringify({ version: 1, font: "SimSun", style: "cold-white-serif", em, rows }));
  console.log(JSON.stringify({ maidens: Object.keys(rows).length, uniqueNames: names.size, font: fonts[0].familyName, em }));
} finally { await browser.close(); }
