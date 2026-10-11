import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { equipmentSlotUnlock } from "../app/equipmentSlotUnlocks.ts";

const app = path.resolve(import.meta.dirname, "..");
const { rows } = JSON.parse(await fs.readFile(path.join(app, "public/data/maidens.json"), "utf8"));
const cache = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(cache)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(cache, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const errors = [];
const shots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3017", { waitUntil: "networkidle" });
  for (const id of [9879, 9858, 6841, 6034, 6261, 6064]) {
    const maiden = rows.find((m) => m.id === id);
    await page.locator(".search-box input").fill(maiden.tank);
    await page.locator(".search-box button").click();
    await page.locator(`.maiden-table tbody tr[data-maiden-id="${id}"] .table-avatar`).click();
    const section = page.locator(".detail-modal .detail-slot-section");
    const slots = section.locator(".slot-unlock-chip");
    assert.equal(await slots.count(), maiden.slotDetails.length);
    for (let i = 0; i < maiden.slotDetails.length; i++) {
      const unlock = equipmentSlotUnlock(id, i, maiden.slotDetails[i].name);
      const slot = slots.nth(i);
      assert.ok((await slot.getAttribute("title")).includes(unlock.description));
      assert.equal(await slot.locator(".slot-unlock-badge").count(), unlock.initial ? 0 : 1);
      assert.equal(await slot.locator(".slot-unlock-stars img").count(), unlock.initial || unlock.marks ? 0 : unlock.stars);
      assert.equal(await slot.locator(".slot-unlock-honor").count(), unlock.honor ? 1 : 0);
      if (unlock.marks) assert.equal(await slot.locator(".slot-unlock-marks b").innerText(), String(unlock.marks));
    }
    for (const width of [1440, 1152, 780, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await section.scrollIntoViewIfNeeded();
      await section.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
      const problems = await slots.evaluateAll((elements) => elements.flatMap((el, index) => {
        const bounds = el.getBoundingClientRect();
        const name = el.querySelector(".slot-unlock-name").getBoundingClientRect();
        const badge = el.querySelector(".slot-unlock-badge")?.getBoundingClientRect();
        const imgs = [...el.querySelectorAll("img")];
        const issue = [];
        if (el.scrollWidth > el.clientWidth + 1) issue.push("overflow");
        if (badge && name.right > badge.left + 1) issue.push("name/badge overlap");
        for (const image of imgs) {
          const b = image.getBoundingClientRect();
          if (!image.complete || !image.naturalWidth) issue.push("broken sprite");
          if (b.left < bounds.left - 1 || b.right > bounds.right + 1 || b.bottom > bounds.bottom + 1) issue.push("clipped sprite");
        }
        return issue.length ? [{ index, issue }] : [];
      }));
      assert.deepEqual(problems, [], `${maiden.tank} at ${width}px`);
      if ([1440, 320].includes(width) && [9879, 6841, 6261].includes(id)) {
        const filename = path.join(app, `.cache/slot-unlocks-${id}-${width}.png`);
        await section.screenshot({ path: filename });
        shots.push(filename);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".detail-modal .modal-close").click();
    assert.equal(await page.locator(".maiden-table .slot-unlock-badge").count(), 0, "Table layout remains unchanged");
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ cards: 6, widths: [1440, 1152, 780, 390, 320], errors, shots }));
} finally {
  await browser.close();
}
