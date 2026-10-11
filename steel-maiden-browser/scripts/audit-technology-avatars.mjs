import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const read = async (name) => JSON.parse(await fs.readFile(path.join(root, "public/data", name), "utf8"));
const [technology, data, portraits] = await Promise.all([read("technology-catalog.json"), read("maidens.json"), read("table-portraits.json")]);
const fields = { 主炮: "ammunition", 防护: "armorOptions", 车体: "bodyOptions", 引擎: "engineOptions" };
const maidens = data.rows.filter((m) => m.implemented).sort((a, b) => a.id - b.id);
const compatible = (category, node) => maidens.filter((m) => m[fields[category]].some((o) => o.id === node.craftId));
const pwRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(pwRoot)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse().map((n) => path.join(pwRoot, n, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const reports = [];
const snapshot = (locator) => locator.evaluate((avatar) => ({
  images: [...avatar.querySelectorAll("img")].map((img) => [img.className, img.getAttribute("src")]),
  cost: avatar.querySelector(".table-portrait-cost").textContent,
}));
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:56501", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "手册", exact: true }).click();
  await page.getByRole("menuitem", { name: /^科技/ }).click();
  for (const category of Object.keys(fields)) {
    const fixtures = technology.blocks.filter((b) => b.category === category).flatMap((block) => block.nodes.map((node) => ({ block, node, rows: compatible(category, node) })))
      .filter((f) => f.rows.length >= 5).sort((a, b) => a.rows.length - b.rows.length);
    const { block, node, rows } = fixtures[0];
    await page.locator(".technology-primary-tabs button").filter({ hasText: category }).click();
    await page.locator(".technology-secondary-panel").getByRole("button", { name: block.secondary, exact: true }).click();
    await page.locator(".technology-generation-tabs button").nth(block.generation - 1).click();
    const target = page.locator(`[data-technology-tag="${node.tag}"]`);
    await target.click(); await target.click();
    const dialog = page.locator(".technology-detail-dialog");
    await dialog.waitFor();
    const matrix = dialog.locator(".technology-maiden-matrix");
    assert.deepEqual(await matrix.locator(".atlas-entry").evaluateAll((entries) => entries.map((e) => Number(e.dataset.maidenId))), rows.map((m) => m.id));
    for (const maiden of rows) {
      const entry = matrix.locator(`[data-maiden-id="${maiden.id}"]`);
      assert.equal(await entry.locator(".atlas-avatar-caption").innerText(), maiden.tank);
      const avatar = entry.locator(".table-game-avatar");
      for (const [cls, src] of [["frame", portraits.frames[maiden.rarityId]], ["head", portraits.rows[maiden.id]], ["rarity", portraits.rarities[maiden.rarityId]], ["class", portraits.classes[maiden.classId]], ["mask", portraits.bottomMask]]) {
        if (src) assert.equal(await avatar.locator(`.table-portrait-${cls}`).getAttribute("src"), src);
      }
      assert.equal(await avatar.locator(".table-portrait-cost").innerText(), maiden.magicCostGroup);
    }
    await matrix.locator("img").evaluateAll((images) => Promise.all(images.map((img) => { img.loading = "eager"; return img.decode(); })));
    for (const width of [1440, 1152, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const failures = await matrix.evaluate((list) => {
        const dialog = list.closest(".technology-detail-dialog");
        const errors = [];
        if (dialog.scrollWidth > dialog.clientWidth + 1) errors.push("dialog horizontal overflow");
        const tops = new Map();
        for (const entry of list.children) {
          const avatar = entry.querySelector(".table-game-avatar").getBoundingClientRect();
          const caption = entry.querySelector(".atlas-avatar-caption").getBoundingClientRect();
          if (Math.abs(avatar.width - avatar.height) > 1 || avatar.width > 129 || avatar.width < 80) errors.push("portrait not square or wrong size");
          if (caption.top < avatar.bottom) errors.push("name overlaps portrait");
          const rowTop = Math.round(entry.getBoundingClientRect().top);
          if (tops.has(rowTop) && Math.abs(tops.get(rowTop) - avatar.top) > 1) errors.push("unaligned portrait tops");
          tops.set(rowTop, avatar.top);
        }
        return errors;
      });
      assert.deepEqual(failures, [], `${category} at ${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await matrix.scrollIntoViewIfNeeded();
    await fs.mkdir(path.join(root, ".cache"), { recursive: true });
    await dialog.screenshot({ path: path.join(root, `.cache/technology-avatars-${Object.keys(fields).indexOf(category)}.png`) });
    reports.push({ category, technology: node.name, count: rows.length });
    if (category === "引擎") {
      const reference = await snapshot(matrix.locator(".table-game-avatar").first());
      await matrix.locator(".table-game-avatar").first().click();
      await page.getByRole("dialog", { name: `${rows[0].tank} 详细档案`, exact: true }).waitFor();
      assert.equal(await page.locator(".technology-detail-dialog").count(), 0);
      await page.getByRole("dialog", { name: `${rows[0].tank} 详细档案`, exact: true }).getByRole("button", { name: "关闭", exact: true }).click();
      await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
      await page.getByRole("menuitem", { name: /^卡牌图鉴/ }).click();
      await page.getByRole("button", { name: "方形头像", exact: true }).click();
      assert.deepEqual(await snapshot(page.locator(`.card-atlas [data-maiden-id="${rows[0].id}"] .table-game-avatar`)), reference, "Technology and atlas use identical portrait composition");
    } else await dialog.locator(".modal-close").click();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ reports, widths: [1440, 1152, 768, 390, 320], sameAsAtlas: true, detailLink: true, errors }, null, 2));
} finally { await browser.close(); }
