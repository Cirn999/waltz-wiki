import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const url = process.argv[2] || "http://localhost:3100";
const probe = process.argv.includes("--probe");
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath, ignoreDefaultArgs: ["--hide-scrollbars"] });
const reports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1536, height: 768 } });
  await page.goto(url, { waitUntil: "networkidle" });
  const open = () => page.getByRole("button", { name: /筛选条件/ }).click();
  const measure = () => page.locator(".filter-sheet").evaluate((sheet) => {
    const body = sheet.querySelector(".filter-sheet-body");
    const board = body.querySelector(".main-filter-board");
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    return { sheet: rect(sheet), header: rect(sheet.querySelector("header")), footer: rect(sheet.querySelector("footer")), body: rect(body),
      clientHeight: body.clientHeight, scrollHeight: body.scrollHeight, scrollTop: body.scrollTop,
      overflowY: getComputedStyle(body).overflowY, scrollbarWidth: body.offsetWidth - body.clientWidth,
      board: board ? { clientHeight: board.clientHeight, scrollHeight: board.scrollHeight } : null };
  });
  const verify = async (label, viewport) => {
    await page.setViewportSize(viewport);
    const before = await measure();
    if (probe) { reports.push({ label, viewport, before }); return; }
    assert.equal(before.overflowY, "auto");
    assert.ok(before.scrollHeight > before.clientHeight, `${label}: overflowing content must reach the scroll container`);
    assert.ok(before.scrollbarWidth > 0, `${label}: scrollbar must reserve a visible track`);
    if (before.board) assert.ok(before.board.scrollHeight <= before.board.clientHeight + 1, `${label}: board must not clip its own rows`);
    const body = page.locator(".filter-sheet-body");
    await body.hover();
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => { const b = document.querySelector(".filter-sheet-body"); return b.scrollTop >= b.scrollHeight - b.clientHeight - 2; });
    const hunt = page.locator(".filter-sheet .rank-filter-row").filter({ has: page.locator("strong", { hasText: "狩猎任务" }) });
    const last = hunt.getByRole("button").last();
    const bounds = await last.boundingBox();
    const after = await measure();
    assert.ok(bounds && bounds.y >= after.body.top && bounds.y + bounds.height <= after.body.bottom + 1, `${label}: final hunting option must be reachable`);
    await last.click();
    assert.equal(await last.getAttribute("aria-pressed"), "true");
    assert.equal(after.header.top, before.header.top, `${label}: header moved while scrolling`);
    assert.equal(after.footer.top, before.footer.top, `${label}: action buttons moved while scrolling`);
    assert.ok(after.footer.bottom <= viewport.height && after.sheet.top >= 0, `${label}: fixed buttons must remain inside viewport`);
    await fs.mkdir(path.join(root, ".cache"), { recursive: true });
    await page.locator(".filter-sheet").screenshot({ path: path.join(root, `.cache/filter-scroll-${label}.png`) });
    reports.push({ label, viewport, before, after });
    await last.click();
    await body.evaluate((el) => { el.scrollTop = 0; });
  };
  await open();
  if (!probe) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const roomy = await measure();
    assert.equal(roomy.scrollHeight, roomy.clientHeight, "no scrolling is needed when every filter fits");
    reports.push({ label: "roomy", before: roomy });
  }
  // Browser zoom reduces the layout viewport. These cover 125% and 150%
  // of a 1920x960 content area, plus a short window and narrow mobile layout.
  for (const [label, width, height] of [["zoom125", 1536, 768], ["zoom150", 1280, 640], ["short", 1366, 520], ["mobile", 390, 700]]) {
    await verify(label, { width, height });
  }
  if (!probe) {
    await page.locator(".filter-cancel").click();
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.getByRole("button", { name: "柱状图", exact: true }).click();
    await page.locator(".ac-candidates").getByRole("button", { name: /^筛选/ }).click();
    await verify("chart", { width: 1280, height: 640 });
    await page.locator(".filter-cancel").click();
    await page.getByRole("button", { name: "关闭属性图表" }).click();
    await page.locator(".table-avatar").first().click();
    await page.getByRole("button", { name: "排名范围筛选", exact: true }).click();
    await verify("detail", { width: 1280, height: 640 });
  }
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
