import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3017", { waitUntil: "networkidle" });
  const results = [];
  for (const rarityId of [2, 3, 4]) {
    const sample = rows.find((row) => row.implemented && row.rarityId === rarityId && row.allAmmunition.length);
    await page.locator(`tr[data-maiden-id="${sample.id}"] .table-avatar`).click();
    const detail = page.locator(".detail-modal");
    const icon = detail.locator(".detail-identity-table .rarity-game-icon");
    await icon.locator("img").evaluate((img) => img.decode());
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await icon.scrollIntoViewIfNeeded();
      const geometry = await icon.evaluate((el) => {
        const image = el.querySelector("img"), cell = el.closest("td");
        const box = el.getBoundingClientRect(), rect = image.getBoundingClientRect(), cellBox = cell.getBoundingClientRect();
        const ref = document.querySelector(`.detail-loadout-heading .generation-tabs-compact button img[src="${image.getAttribute("src")}"]`);
        const reference = ref.getBoundingClientRect();
        return { container: [box.width, box.height], image: [rect.width, rect.height], reference: [reference.width, reference.height],
          expectedHeight: rect.width * image.naturalHeight / image.naturalWidth,
          centered: Math.abs((rect.left + rect.right) - (box.left + box.right)) < 1 && Math.abs((rect.top + rect.bottom) - (box.top + box.bottom)) < 1,
          contained: rect.left >= box.left && rect.right <= box.right && rect.top >= box.top && rect.bottom <= box.bottom && rect.top >= cellBox.top && rect.bottom <= cellBox.bottom };
      });
      assert.deepEqual(geometry.container, [36, 34]);
      assert.equal(geometry.image[0], 18);
      assert.ok(Math.abs(geometry.image[1] - geometry.expectedHeight) < .1, "Native aspect ratio preserved");
      assert.deepEqual(geometry.image, geometry.reference, "Identical to ammunition phase icons");
      assert.ok(geometry.centered && geometry.contained, "Centered, complete image fits inside cell");
      results.push({ rarityId, width, ...geometry });
      await detail.locator(".detail-identity-table").screenshot({ path: path.join(root, `.cache/detail-rarity-${rarityId}-${width}.png`) });
    }
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally { await browser.close(); }
