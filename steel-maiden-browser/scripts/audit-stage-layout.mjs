import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(process.argv[2] || "http://127.0.0.1:3101", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
  await page.getByRole("menuitem", { name: /^关卡一览/ }).click();
  await page.getByLabel("收益通关进度").selectOption("96");
  await page.getByRole("button", { name: "浏览战役", exact: true }).click();
  await page.getByLabel("搜索关卡").fill("海岛风暴");
  await page.getByRole("button", { name: "查看地图 海岛风暴", exact: true }).click();
  const dialog = page.locator(".stage-dialog");
  async function verify(width, hasNodeIncome = true) {
    assert.equal(await dialog.locator('.stage-entry-costs').count(), 1, 'Entry costs are not duplicated');
    assert.equal(await dialog.locator('.stage-entry-requirements>.stage-entry-costs').count(), 1, 'Entry costs belong to the requirements card');
    assert.equal(await dialog.locator('.stage-dialog-content>.stage-entry-costs').count(), 0, 'No standalone cost card above the summary');
    assert.equal(await dialog.locator(':scope>.stage-node-nav').count(), 0, 'No standalone top navigation row');
    assert.equal(await dialog.locator('.stage-dialog-content>.stage-node-heading').count(), 0, 'No separate node switching row outside enemy card');
    assert.equal(await dialog.locator('.stage-enemy-panel .stage-node-heading>.stage-node-nav').count(), 1, 'Node tabs are inside the enemy card');
    assert.equal(await dialog.locator('.stage-enemy-panel .stage-node-pager').count(), 1, 'Previous/next controls are inside the enemy card');
    const navigation = await dialog.locator('.stage-node-heading').evaluate((el) => {
      const heading = el.querySelector('h3').getBoundingClientRect();
      const nav = el.querySelector('nav').getBoundingClientRect();
      const pager = el.querySelector('.stage-node-pager').getBoundingClientRect();
      const active = el.querySelector('nav [aria-pressed=true]').getBoundingClientRect();
      return { ordered: heading.right <= nav.left && nav.right <= pager.left, sameRow: Math.abs((heading.top + heading.bottom) / 2 - (nav.top + nav.bottom) / 2) < 1, activeVisible: active.right <= nav.right + 1 && active.left >= nav.left - 1 };
    });
    assert.ok(navigation.ordered && navigation.sameRow && navigation.activeVisible, `Inline node navigation at ${width}px: ${JSON.stringify(navigation)}`);
    const terrainIcon = await dialog.locator('.stage-terrain-name>img').boundingBox();
    assert.equal(terrainIcon.width, width <= 540 ? 48 : 64);
    const effectIcons = await dialog.locator('.stage-effects img').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    assert.ok(effectIcons.every((w) => w === (width <= 540 ? 40 : 48)), 'Enlarged debuff icons');
    const geometry = await dialog.evaluate((el) => {
      const rect = (selector) => {
        const item = el.querySelector(selector);
        if (!item) return null;
        const { top, bottom, left, right, width, height } = item.getBoundingClientRect();
        return { top, bottom, left, right, width, height, clientWidth: item.clientWidth, scrollWidth: item.scrollWidth };
      };
      return {
        total: rect('.stage-income-panel'), requirements: rect('.stage-entry-requirements'), costs: rect('.stage-entry-costs'),
        income: rect('.stage-node-income'), enemy: rect('.stage-enemy-panel'), terrain: rect('.stage-terrain-panel'),
        column: rect('.stage-enemy-column'), battle: rect('.stage-battle-grid'),
        admission: rect('.stage-admission-grid'), content: rect('.stage-dialog-content'),
      };
    });
    const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1, `${label}: ${a} vs ${b}`);
    for (const [name, box] of Object.entries(geometry)) if (box) assert.ok(box.scrollWidth <= box.clientWidth + 1, `${name} overflows at ${width}px: ${JSON.stringify(box)}`);
    assert.equal(Boolean(geometry.income), hasNodeIncome);
    if (hasNodeIncome) {
      near(geometry.income.left, geometry.enemy.left, 'Node income and enemies share left edge');
      near(geometry.income.width, geometry.enemy.width, 'Node income matches enemy card width');
      assert.ok(geometry.income.bottom < geometry.enemy.top, 'Node income above enemy card');
    }
    if (width > 900) {
      if (geometry.total) {
        assert.ok(geometry.total.right < geometry.requirements.left, 'Total left, requirements right');
        near(geometry.total.top, geometry.requirements.top, 'Admission top alignment');
        near(geometry.total.width, geometry.enemy.width, 'Shared column widths');
        assert.ok(geometry.admission.height < geometry.total.height + geometry.requirements.height, 'Admission panels no longer stack');
      }
      assert.ok(geometry.enemy.right < geometry.terrain.left, 'Terrain on right');
      near(geometry.column.top, geometry.terrain.top, 'Terrain moves up beside node income');
      near(geometry.enemy.bottom, geometry.terrain.bottom, 'Terrain and enemy bottom alignment');
      if (hasNodeIncome) assert.ok(geometry.terrain.top < geometry.enemy.top, 'Terrain uses space beside income');
    } else {
      if (geometry.total) assert.ok(geometry.total.bottom < geometry.requirements.top, 'Small-screen admission stacks');
      assert.ok(geometry.enemy.bottom < geometry.terrain.top, 'Small-screen terrain follows enemy card');
    }
    return geometry;
  }
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1152, height: 640 }, { width: 960, height: 800 }, { width: 900, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (let index = 0; index < 5; index++) {
      await dialog.locator('.stage-node-nav button').nth(index).click();
      await verify(viewport.width);
    }
    await dialog.getByRole('button', { name: '上一个战斗节点', exact: true }).click();
    await verify(viewport.width);
    await dialog.locator('.stage-node-nav button').first().click();
    await dialog.locator('img').evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
    await dialog.locator('.stage-admission-grid').scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: path.join(root, `.cache/stages-compact-detail-${viewport.width}.png`) });
    await dialog.locator('.stage-battle-grid').scrollIntoViewIfNeeded();
    await dialog.locator('.stage-battle-grid').screenshot({ path: path.join(root, `.cache/stages-compact-battle-${viewport.width}.png`) });
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '返回关卡分类', exact: false }).click();
  await page.getByRole('button', { name: '浏览突袭', exact: true }).click();
  await page.locator('.stage-map-card').first().click();
  assert.equal(await dialog.locator('.stage-income-panel').count(), 0);
  await verify(1440, false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回关卡分类', exact: false }).click();
  await page.getByRole('button', { name: '浏览活动', exact: true }).click();
  await page.getByLabel('行动类型').selectOption('挑战行动');
  await page.getByRole('button', { name: '查看地图 雪山寻踪', exact: true }).click();
  assert.equal(await dialog.locator('.stage-income-panel').count(), 0, 'Zero-income activities have no empty total card');
  await verify(1440, false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, tests: 'Admission columns, five nodes, equal-width node income, bottom-aligned terrain, single/zero-income maps, desktop/zoom/tablet/mobile' }, null, 2));
} finally {
  await browser.close();
}
