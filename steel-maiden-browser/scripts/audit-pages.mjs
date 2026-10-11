import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { auditPagesSkins } from "./audit-pages-skins.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist/client");
const prefix = "/waltz-wiki/";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
// Deliberately no SPA fallback or root-level art/data aliases: broken Pages
// paths must fail rather than silently work on the local test server.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
  const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
  const file = path.resolve(output, relative);
  if (!file.startsWith(output + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!(await fs.stat(file)).isFile()) throw new Error("Not a file");
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
let baseUrl = process.argv[2];
if (!baseUrl) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}${prefix}`;
}
let executablePath;
if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const shell = (await fs.readdir(browserRoot)).filter((x) => x.startsWith("chromium_headless_shell-")).sort().reverse()[0];
  if (shell) executablePath = path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe");
}
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [], failed = [], leaked = [];
const origin = new URL(baseUrl).origin;
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) failed.push([response.status(), response.url()]); });
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.origin === origin && /^\/(art|data|_next)\//.test(url.pathname)) leaked.push(url.pathname);
});
const section = async (groupName, name, selector) => {
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: groupName, exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
  await page.locator(selector).first().waitFor();
  await page.waitForLoadState("networkidle");
  console.log(`Checked ${groupName} / ${name}`);
};
try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 120000 });
  await page.locator(".table-archive").waitFor();
  await page.getByRole("button", { name: /筛选条件/ }).click();
  const filter = page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  await filter.getByRole("button", { name: "取消", exact: true }).click();
  await section("钢舞姬", "卡牌图鉴", ".atlas-entry");
  await auditPagesSkins(page, baseUrl);
  await page.locator(".atlas-entry .table-game-avatar").first().click();
  await page.locator(".detail-modal").waitFor();
  await page.locator(".detail-modal").getByRole("button", { name: "关闭", exact: true }).click();
  for (const args of [
    ["钢舞姬", "研发配方", ".research-archive"],
    ["钢舞姬", "研发路线", ".research-graph-archive, .research-chain-mode .chain-archive"],
    ["手册", "装备", ".equipment-atlas"], ["手册", "科技", ".technology-mode"],
    ["手册", "任务", ".task-table"], ["手册", "道具", ".item-archive"],
    ["手册", "地形", ".terrain-card"], ["关卡", "关卡一览", ".stage-category"],
    ["关卡", "收益一览", ".stage-yield-overview"], ["关卡", "剧情一览", ".story-archive"],
  ]) await section(...args);
  await page.getByRole("button", { name: "浏览战役剧情", exact: true }).click();
  await page.locator(".story-map-card").first().waitFor();
  await page.locator(".story-map-card").first().click();
  await page.locator(".story-scene, .story-summary").first().waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator('.story-reader [role="alert"]').count(), 0);
  await page.getByRole("button", { name: "关闭剧情", exact: true }).click();
  await section("钢舞姬", "属性表", ".table-archive");
  const brokenImages = await page.locator("img").evaluateAll((images) => images.filter((img) => img.complete && !img.naturalWidth && img.getBoundingClientRect().width > 0).map((img) => img.src));
  assert.deepEqual(errors, []);
  assert.deepEqual(leaked, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(brokenImages, []);
  await fs.mkdir(path.join(root, ".cache/pages"), { recursive: true });
  await page.screenshot({ path: path.join(root, ".cache/pages/desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".table-archive").waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(leaked, []);
  assert.deepEqual(failed, []);
  console.log(JSON.stringify({ baseUrl, errors, failed, leaked, brokenImages, mobileReload: true }));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
