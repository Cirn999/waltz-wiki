import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { INCOME_STORAGE_KEY } from "../app/stageIncome.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const url = process.argv[2] || "http://127.0.0.1:3100";
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  async function enter(target = page) {
    await target.goto(url, { waitUntil: "networkidle" });
    await target.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
    await target.getByRole("menuitem", { name: /^关卡一览/ }).click();
    await target.locator(".stage-category").first().waitFor();
  }
  async function amounts(locator, expected) {
    await locator.locator(".stage-income-values b").first().waitFor();
    assert.deepEqual((await locator.locator(".stage-income-values b").allTextContents()).map((s) => Number(s.replaceAll(",", ""))), expected.filter((n, i) => i === 0 || n > 0));
  }
  await enter();
  const global = page.locator(".stage-global-income");
  assert.equal(await global.getByLabel("收益通关进度").locator("option").count(), 25);
  assert.deepEqual(await global.getByLabel("收益结算评价").locator("option").allTextContents(), ["S", "A", "B"]);
  await global.getByLabel("收益通关进度").selectOption("96");
  await page.getByRole("button", { name: "浏览战役", exact: true }).click();
  await page.getByRole("button", { name: "特殊任务", exact: true }).click();
  const card = page.getByRole("button", { name: "查看地图 哈尔科夫", exact: true });
  await amounts(card, [10200, 31200, 0]);
  await card.click();
  const dialog = page.locator(".stage-dialog");
  const total = dialog.getByRole("region", { name: "地图总收益", exact: true });
  const current = dialog.getByRole("region", { name: "当前节点收益", exact: true });
  await amounts(total, [10200, 31200, 0]);
  await amounts(current, [1500, 5200, 0]);
  await dialog.getByRole("button", { name: "下一个战斗节点", exact: true }).click();
  await dialog.getByRole("button", { name: "下一个战斗节点", exact: true }).click();
  await amounts(current, [2100, 5200, 0]);
  await total.getByLabel("收益通关进度").selectOption("0");
  await amounts(total, [3000, 2400, 0]);
  await amounts(current, [900, 400, 0]);
  await total.getByLabel("收益通关进度").selectOption("96");
  await page.keyboard.press("Escape");
  assert.equal(await global.getByLabel("收益通关进度").inputValue(), "96");
  await amounts(card, [10200, 31200, 0]);
  // Persistence across remount/reload; cross-tab updates use the same global key.
  await enter();
  assert.equal(await global.getByLabel("收益通关进度").inputValue(), "96");
  const second = await context.newPage();
  await enter(second);
  await second.getByLabel("收益通关进度").selectOption("16");
  await page.waitForFunction(() => document.querySelector('.stage-global-income select[aria-label="收益通关进度"]').value === "16");
  await second.close();
  await global.getByLabel("收益通关进度").selectOption("96");
  await global.getByLabel("收益结算评价").selectOption("51");
  await page.getByRole("button", { name: "浏览战役", exact: true }).click();
  await page.getByRole("button", { name: "第 24 卷", exact: true }).click();
  await page.getByRole("button", { name: "查看地图 终结与开始", exact: true }).click();
  assert.equal(await dialog.locator(".stage-drop-grades").count(), 6);
  assert.ok(await dialog.locator(".stage-drop-grades[data-eligible=false]").count() > 0);
  assert.ok(await dialog.locator(".stage-drop-grades[data-eligible=true]").count() > 0);
  await total.getByLabel("收益结算评价").selectOption("92");
  assert.equal(await dialog.locator(".stage-drop-unavailable").count(), 0);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1152, height: 640 }, { width: 390, height: 640 }]) {
    await page.setViewportSize(viewport);
    await total.scrollIntoViewIfNeeded();
    await total.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    const sizes = await dialog.locator(".stage-dialog-content").evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, full: el.scrollHeight }));
    assert.ok(sizes.scroll <= sizes.width + 1, `Income layout fits ${viewport.width}: ${JSON.stringify(sizes)}`);
    await dialog.screenshot({ path: path.join(root, `.cache/stages-income-${viewport.width}.png`) });
    await dialog.locator(".stage-drops").scrollIntoViewIfNeeded();
    await dialog.locator(".stage-drops").screenshot({ path: path.join(root, `.cache/stages-drop-grades-${viewport.width}.png`) });
    await dialog.locator(".stage-source-note").scrollIntoViewIfNeeded();
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  await page.getByRole("button", { name: "浏览突袭", exact: true }).click();
  await page.locator(".stage-map-card").first().click();
  assert.equal(await dialog.getByRole("region", { name: "地图总收益", exact: true }).count(), 0, "Raid currencies move into drops, without an empty income panel");
  assert.equal(await dialog.locator(".stage-detail-income-controls").count(), 1, "Global evaluation controls remain available inside raid details");
  assert.equal(await dialog.getByRole("region", { name: "当前节点收益", exact: true }).count(), 0, "Single-node maps do not duplicate income");
  await page.keyboard.press("Escape");
  await page.evaluate((key) => localStorage.setItem(key, "invalid-json"), INCOME_STORAGE_KEY);
  await enter();
  assert.equal(await global.getByLabel("收益通关进度").inputValue(), "0");
  assert.equal(await global.getByLabel("收益结算评价").inputValue(), "92");
  // Denied writes cannot break the calculator; explicitly report session-only state.
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException("Blocked", "SecurityError"); return original.call(this, k, v); };
  }, INCOME_STORAGE_KEY);
  await global.getByLabel("收益通关进度").selectOption("24");
  assert.match(await global.innerText(), /本次已生效/);
  assert.equal(await global.getByLabel("收益通关进度").inputValue(), "24");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, tests: "25 tiers, unified S/A/B, all-node totals, node bonus, persistence/remount/cross-tab, grade badges, single-node deduplication, mobile/zoom scrolling, corrupt/blocked storage" }, null, 2));
} finally { await browser.close(); }
