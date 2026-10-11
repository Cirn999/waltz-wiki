import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const { rows } = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const t99 = rows.find((m) => m.id === 9881);
assert.equal(t99.stage, "N1");
assert.equal(t99.magicCostGroup, "N5+");
assert.equal(t99.stageIcon, rows.find((m) => m.stage === "N1").stageIcon);
const cases = [...new Map([
  t99,
  rows.find((m) => m.implemented && m.magicCostGroup.endsWith("-")),
  rows.find((m) => m.implemented && m.magicCostGroup === m.stage),
  rows.find((m) => m.implemented && !m.stageIcon),
].filter(Boolean).map((m) => [m.id, m])).values()];
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3017", { waitUntil: "networkidle" });
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const maiden of cases) {
    await page.locator(".search-box input").fill(maiden.tank);
    await page.locator(".search-box button").click();
    await page.locator(`tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
    const badge = page.locator(".detail-modal .detail-blueprint-cost");
    assert.equal(await badge.innerText(), maiden.magicCostGroup);
    assert.equal(await badge.getAttribute("title"), `研发图纸：${maiden.stage}；魔改费用：${maiden.magicCostGroup}`);
    assert.equal(await badge.locator("img").count(), maiden.stageIcon ? 1 : 0);
    if (maiden.stageIcon) {
      assert.equal(await badge.locator("img").getAttribute("src"), maiden.stageIcon);
      await badge.locator("img").evaluate((img) => img.decode());
    }
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await badge.scrollIntoViewIfNeeded();
      const fits = await badge.evaluate((el) => {
        const bounds = el.closest("td").getBoundingClientRect();
        return [...el.children].every((child) => { const r = child.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right; });
      });
      assert.equal(fits, true, `${maiden.tank}: ${width}px`);
      if (maiden.id === t99.id) await page.locator(".detail-identity").screenshot({ path: path.join(root, `.cache/detail-blueprint-cost-t99-${width}.png`) });
    }
    await page.locator(".detail-modal .modal-close").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cases: cases.map((m) => ({ id: m.id, tank: m.tank, blueprint: m.stage, cost: m.magicCostGroup })), widths: [1440, 320], errors }));
} finally { await browser.close(); }
