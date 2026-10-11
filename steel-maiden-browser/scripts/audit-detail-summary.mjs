import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const implemented = data.rows.filter((row) => row.implemented);
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://127.0.0.1:3017", { waitUntil: "networkidle" });
  const first = page.locator("tr[data-maiden-id]").first();
  const currentId = Number(await first.getAttribute("data-maiden-id"));
  const current = data.rows.find((row) => row.id === currentId);
  await first.locator(".table-avatar").click();
  const detail = page.locator(".detail-modal");
  await detail.waitFor();
  const scope = detail.locator(".detail-rank-summary");
  const filters = page.getByRole("dialog", { name: "属性排名筛选", exact: true });
  const openFilters = () => detail.getByRole("button", { name: "排名范围筛选", exact: true }).click();
  const apply = () => filters.getByRole("button", { name: "确定", exact: true }).click();
  async function verifyRanks(rows, level = 1) {
    const pool = rows.some((row) => row.id === current.id) ? rows : [...rows, current];
    assert.equal(Number(await scope.getAttribute("data-count")), pool.length);
    const keys = ["durability", "power", "piercing", "accuracy", "armor", "evasion", "stealth", "recon"];
    const expected = [...keys.map((key) => [current.stats[level][key], (row) => row.stats[level][key]]),
      ...["fireproof", "homogeneity", "coverage"].map((key) => [current.grades[key].value, (row) => row.grades[key].value])]
      .map(([value, get]) => value == null ? "排名 —" : `排名 ${1 + pool.filter((row) => get(row) != null && get(row) > value).length}/${pool.length}`);
    assert.deepEqual(await detail.locator(".detail-stat-rank").allTextContents(), expected);
  }
  assert.equal(await detail.locator(".detail-hero, .detail-art, .rank-scope-panel").count(), 0);
  assert.equal(await detail.locator(".detail-stat-grid > div").count(), 12);
  assert.deepEqual(await detail.locator(".detail-identity-table th").allTextContents(), ["人名", "车名", "稀有度", "图纸", "车种", "国籍"]);
  assert.equal(await detail.locator(".detail-identity-table td").nth(0).innerText(), current.person || "—");
  assert.equal(await detail.locator(".detail-identity-tank").innerText(), current.tank);
  assert.equal(await detail.locator(".portrait-gallery").count(), 1);
  await verifyRanks(implemented);
  await openFilters();
  assert.equal(await filters.locator('button[aria-pressed="true"]').count(), 0, "Default rank filters are reset");
  await filters.getByRole("button", { name: current.className, exact: true }).click();
  await apply();
  const sameClass = implemented.filter((row) => row.className === current.className);
  await verifyRanks(sameClass);
  assert.equal(await detail.locator(".rank-filter-button b").innerText(), "1");
  await openFilters();
  await filters.getByRole("button", { name: "重置", exact: true }).click();
  await filters.getByRole("button", { name: "取消", exact: true }).click();
  await verifyRanks(sameClass);
  await openFilters();
  await filters.getByRole("button", { name: "重置", exact: true }).click();
  const differentClass = implemented.find((row) => row.className !== current.className).className;
  await filters.getByRole("button", { name: differentClass, exact: true }).click();
  await apply();
  await verifyRanks(implemented.filter((row) => row.className === differentClass));
  assert.match(await scope.innerText(), /已补入本车/);
  await openFilters();
  await filters.getByRole("button", { name: "重置", exact: true }).click();
  await apply();
  await verifyRanks(implemented);
  assert.equal(await detail.locator(".rank-filter-button b").count(), 0);
  await detail.locator(".detail-level-marks").getByRole("button", { name: "99级", exact: true }).click();
  await verifyRanks(implemented, 99);
  assert.equal(await page.locator(".control-panel .level-picker .active").innerText(), "1级", "Detail level is independent");
  const power = detail.getByRole("spinbutton", { name: "火力强殖等级，0到12级" });
  await power.fill("12"); await power.press("Enter");
  await verifyRanks(implemented, 99);
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const width of [1440, 1152, 980, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await detail.locator(".detail-header").scrollIntoViewIfNeeded();
    const layout = await detail.evaluate((el) => {
      const rect = (selector) => { const r = el.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width }; };
      return { identity: rect(".detail-identity"), stats: rect(".detail-stat-grid"), button: rect(".rank-filter-button"), levels: rect(".detail-level-slider"), width: el.clientWidth, contentWidth: el.scrollWidth,
        overflow: [...el.querySelectorAll(".detail-overview *")].filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map((node) => `${node.className}: ${node.scrollWidth}/${node.clientWidth}`) };
    });
    assert.ok(layout.contentWidth <= layout.width + 1, `No detail overflow at ${width}: ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.overflow, [], `No clipped card/table contents at ${width}`);
    if (width > 760) {
      assert.ok(layout.identity.right < layout.stats.x && Math.abs(layout.identity.y - layout.stats.y) < 1, "Identity table left, stat cards right");
    }
    assert.ok(layout.button.bottom <= layout.levels.y, `Rank filter stays above the full-width level slider at ${width}`);
    assert.ok(Math.abs(layout.levels.x - Math.min(layout.identity.x, layout.stats.x)) < 1, `Slider aligned with overview left edge at ${width}`);
    assert.ok(Math.abs(layout.levels.right - Math.max(layout.identity.right, layout.stats.right)) < 1, `Slider aligned with overview right edge at ${width}`);
    await page.screenshot({ path: path.join(root, `.cache/detail-summary-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFilters();
  await filters.getByRole("button", { name: current.className, exact: true }).click();
  await apply();
  await verifyRanks(sameClass, 99);
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  await first.locator(".table-avatar").click();
  assert.equal(await detail.locator(".rank-filter-button b").count(), 0);
  await verifyRanks(implemented);
  await detail.getByRole("button", { name: "加入双车对比", exact: true }).click();
  await detail.getByRole("button", { name: "移出对比", exact: true }).click();
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  const longest = implemented.toSorted((a, b) => (b.tank.length + b.person.length) - (a.tank.length + a.person.length))[0];
  await page.locator(`tr[data-maiden-id="${longest.id}"] .table-avatar`).click();
  for (const width of [1440, 980, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await detail.locator(".detail-header").scrollIntoViewIfNeeded();
    const overflow = await detail.locator(".detail-overview").evaluate((el) => [...el.querySelectorAll("*")].filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map((node) => node.className));
    assert.deepEqual(overflow, [], `Long name ${longest.tank} fits at ${width}`);
    await page.screenshot({ path: path.join(root, `.cache/detail-summary-long-name-${width}.png`) });
  }
  await detail.getByRole("button", { name: "配装模拟", exact: true }).click();
  await page.locator(".sim-shell").waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, tests: "12 compact cards; six identity fields; reset/confirm/cancel rank filters; exact native-data rankings; excluded current maiden; independent levels; colonization; six viewport layouts; compare/simulator entries" }));
} finally { await browser.close(); }
