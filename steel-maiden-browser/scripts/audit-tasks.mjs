import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { taskHiddenReason } from "../app/taskAvailability.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/task-catalog.json"), "utf8"));
const now = new Date("2026-10-11T12:00:00+08:00");
const shown = data.tasks.filter((t) => !taskHiddenReason(t, now.getTime()));
const pw = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(pw)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse().map((n) => path.join(pw, n, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
async function open() {
  await page.getByRole("button", { name: "手册", exact: true }).click();
  await page.getByRole("menuitem", { name: /^任务/ }).click();
}
try {
  await page.clock.setFixedTime(now);
  await page.goto(process.argv[2] || "http://127.0.0.1:56501", { waitUntil: "networkidle" });
  await open();
  await page.locator(".task-table tbody tr").first().waitFor();
  assert.equal(await page.locator(".primary-nav-trigger.active > span").innerText(), "手册");
  assert.equal(await page.locator(".control-panel").count(), 0);
  assert.equal(await page.locator(".task-table tbody tr").count(), 30);
  const count = async () => Number(await page.locator(".task-results-bar b").innerText());
  const reset = () => page.getByRole("button", { name: "重置筛选", exact: true }).first().click();
  assert.equal(await count(), shown.length);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  assert.equal(await page.locator(".task-table tbody tr").first().getAttribute("data-task-id"), String(shown[30].id));
  assert.ok(Math.abs(await page.locator(".task-table").evaluate((el) => el.getBoundingClientRect().top)) < 2, "Page change returns to document table top");
  for (const c of data.categories) {
    await page.getByRole("group", { name: "任务分类" }).getByRole("button", { name: new RegExp(`^${c.name}`) }).click();
    assert.equal(await count(), shown.filter((t) => t.category === c.id).length);
    const ids = await page.locator(".task-table tbody tr").evaluateAll((rows) => rows.map((r) => Number(r.dataset.taskId)));
    assert.ok(ids.every((id) => data.tasks.find((t) => t.id === id).category === c.id));
  }
  await reset();
  await page.getByRole("combobox", { name: "筛选任务奖励" }).selectOption("金币");
  assert.equal(await count(), shown.filter((t) => t.rewards.some((r) => r.name === "金币")).length);
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("司令部");
  assert.ok(await count() > 0);
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("不存在的任务_xyz");
  assert.equal(await count(), 0);
  await page.locator(".task-empty").getByRole("button", { name: "重置筛选" }).click();
  assert.equal(await count(), shown.length);
  for (const name of ["国庆每日登陆福利", "赫鲁晓夫之梦", "空中霸王"]) {
    await page.getByRole("searchbox", { name: "搜索任务" }).fill(name);
    assert.equal(await count(), 0);
    await page.getByRole("checkbox", { name: /显示已隐藏任务/ }).check();
    assert.equal(await count(), 1);
    assert.match(await page.locator(".task-table tbody .task-warning").innerText(), /默认隐藏/);
    await page.getByRole("checkbox", { name: /显示已隐藏任务/ }).uncheck();
    assert.equal(await count(), 0);
  }
  await reset();
  await page.getByRole("checkbox", { name: /显示已隐藏任务/ }).check();
  assert.equal(await count(), 454);
  for (const c of data.categories) {
    await page.getByRole("group", { name: "任务分类" }).getByRole("button", { name: new RegExp(`^${c.name}`) }).click();
    assert.equal(await count(), c.count);
  }
  await reset();
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("夏日海豚");
  assert.equal(await count(), 1);
  assert.match(await page.locator(".task-table tbody").innerText(), /时装退返币\s*×219/);
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("321020");
  assert.equal(await page.locator(".task-table tbody tr").getAttribute("data-task-id"), "321020");
  assert.match(await page.locator(".task-table tbody tr td").last().innerText(), /司令部等级 ≥ 2/);
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("增固护板 S2");
  assert.ok(await count() > 0);
  assert.match(await page.locator(".task-rewards").first().innerText(), /增固护板\s*S2\s*×/);
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("323010");
  assert.equal(await page.locator(".task-equipment-level").count(), 0, "Food is not S-level equipment");
  await reset();
  await page.getByRole("group", { name: "任务分类" }).getByRole("button", { name: /^建设/ }).click();
  await page.locator(".task-reward img").evaluateAll((images) => Promise.all(images.map((img) => { img.loading = "eager"; return img.decode(); })));
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  for (const width of [1920, 1440, 1152, 1008, 1007, 960, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const scroll = document.querySelector(".task-table-scroll");
      const box = scroll.getBoundingClientRect();
      return { pageWidth: document.documentElement.scrollWidth, view: innerWidth, width: box.width, right: box.right, scrollable: scroll.scrollWidth > scroll.clientWidth, overflow: getComputedStyle(scroll).overflowX, maxHeight: getComputedStyle(scroll).maxHeight, verticalOverflow: scroll.scrollHeight > scroll.clientHeight + 1, radius: getComputedStyle(scroll).borderRadius };
    });
    assert.ok(layout.pageWidth <= width + 1 && layout.right <= width, JSON.stringify(layout));
    const gutter = width <= 600 ? 12 : 24;
    assert.equal(layout.width, width - gutter * 2, "Table keeps side gaps without a max-width card");
    assert.equal(layout.right, width - gutter, "Side gaps are symmetric");
    assert.equal(layout.maxHeight, "none");
    assert.equal(layout.radius, "0px");
    assert.equal(layout.verticalOverflow, false, "Table must use document scrolling");
    if (width < 1008) assert.ok(layout.scrollable && layout.overflow === "auto");
    if (width >= 1008) {
      await page.locator(".task-table").evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + 200, behavior: "instant" }));
      assert.ok(Math.abs(await page.locator(".task-table thead th").first().evaluate((el) => el.getBoundingClientRect().top)) < 2, "Header sticks to document top");
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if (width === 1440 || width === 390) await page.screenshot({ path: path.join(root, ".cache", `tasks-${width}.png`) });
  }
  // A failed catalog load must be recoverable without reloading the entire app.
  const retryPage = await browser.newPage();
  let calls = 0;
  await retryPage.route("**/data/task-catalog.json", (route) => ++calls === 1 ? route.fulfill({ status: 503, body: "unavailable" }) : route.continue());
  await retryPage.goto(process.argv[2] || "http://127.0.0.1:56501", { waitUntil: "networkidle" });
  await retryPage.getByRole("button", { name: "手册", exact: true }).click();
  await retryPage.getByRole("menuitem", { name: /^任务/ }).click();
  await retryPage.getByRole("button", { name: "重试加载任务" }).click();
  await retryPage.locator(".task-table tbody tr").first().waitFor();
  assert.equal(calls, 2);
  await retryPage.close();
  assert.deepEqual(errors, []);
  console.log("PASS: retained hidden tasks toggle, S-level rewards/search, five categories, pagination, prerequisites, retry, page-scrolling table with side gaps and eight viewport widths");
} finally { await browser.close(); }
