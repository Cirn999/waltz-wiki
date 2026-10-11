import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://localhost:3100", { waitUntil: "networkidle" });
  const select = page.getByRole("combobox", { name: "才艺排序依据" });
  const head = page.locator(".table-heading-row .column-talents");
  const names = [...new Set(data.rows.flatMap((row) => row.talents.map((talent) => talent.name)))];
  assert.deepEqual(await select.locator("option").evaluateAll((options) => options.map((option) => option.value)), names);
  const expectedIds = (name, descending, subset = data.rows) => {
    const present = subset.filter((row) => row.talents.some((talent) => talent.name === name));
    const missing = subset.filter((row) => !row.talents.some((talent) => talent.name === name));
    present.sort((a, b) => {
      const left = a.talents.find((talent) => talent.name === name).level;
      const right = b.talents.find((talent) => talent.name === name).level;
      return (descending ? right - left : left - right) || a.id - b.id;
    });
    return [...present, ...missing.sort((a, b) => a.id - b.id)].map((row) => row.id);
  };
  const check = async (name, descending, subset = data.rows) => {
    const expected = expectedIds(name, descending, subset);
    await page.waitForFunction((ids) => JSON.stringify([...document.querySelectorAll(".table-body-chunks tr[data-maiden-id]")].map((row) => Number(row.dataset.maidenId))) === JSON.stringify(ids), expected);
    assert.equal(await head.getAttribute("aria-sort"), descending ? "descending" : "ascending");
    assert.equal(await select.inputValue(), name);
    assert.ok((await head.innerText()).includes(name));
  };

  // The default choice must also work by clicking the existing sort header.
  await head.getByRole("button").click();
  await check(names[0], true);
  await head.getByRole("button").click();
  await check(names[0], false);
  // Changing the talent preserves the current direction and includes all rows.
  for (const name of names.slice(1, 4)) {
    await select.selectOption(name);
    await check(name, false);
    await head.getByRole("button").click();
    await check(name, true);
    await head.getByRole("button").click();
  }
  const chosen = names[3];
  await page.locator(".table-heading-row .column-power button").click();
  await select.selectOption(names[4]);
  await check(names[4], true);
  await select.selectOption(chosen);
  await check(chosen, true);
  await page.locator(".control-panel .level-picker").getByRole("button", { name: /^99/ }).click();
  await check(chosen, true);
  const threshold = Math.ceil(data.rows.reduce((sum, row) => sum + row.stats[99].power, 0) / data.rows.length);
  await page.getByRole("spinbutton", { name: "火力最小值" }).fill(String(threshold));
  await check(chosen, true, data.rows.filter((row) => row.stats[99].power >= threshold));
  await page.getByRole("button", { name: "清除数值筛选" }).click();
  await check(chosen, true);

  await page.getByRole("button", { name: /列设置/ }).click();
  const setting = page.locator(".table-column-setting").filter({ has: page.locator("label", { hasText: "才艺" }) });
  await setting.getByRole("checkbox").uncheck();
  assert.equal(await select.isVisible(), false);
  await setting.getByRole("checkbox").check();
  await page.getByRole("button", { name: "关闭列设置" }).click();
  await check(chosen, true);
  await select.scrollIntoViewIfNeeded();
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await page.screenshot({ path: path.join(root, ".cache/talent-sort-desktop.png") });
  const filterHeight = await page.locator(".table-filter-row .column-talents").evaluate((cell) => cell.getBoundingClientRect().height);
  assert.ok(filterHeight <= 41, "talent selector must fit the existing 40px filter row plus table border");
  await page.setViewportSize({ width: 390, height: 700 });
  await select.scrollIntoViewIfNeeded();
  await select.selectOption(names[1]);
  await check(names[1], true);
  // On narrow screens the frozen identity columns cover the cell's center;
  // the sort arrow at the right edge remains exposed and clickable.
  const sortButton = head.getByRole("button");
  const sortBounds = await sortButton.boundingBox();
  assert.ok(sortBounds);
  await sortButton.click({ position: { x: sortBounds.width - 12, y: sortBounds.height / 2 } });
  await check(names[1], false);
  await page.screenshot({ path: path.join(root, ".cache/talent-sort-mobile.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ vehicles: data.rows.length, choices: names, tested: "default header sort, numeric talent changes in both directions, missing last, other columns, level switch, numeric filtering, hide/show, mobile", filterHeight }));
} finally {
  await browser.close();
}
