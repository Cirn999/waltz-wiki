import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const load = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const fixtures = await load('scripts/fixtures/native-loadout.json');
const maidens = await load('public/data/maidens.json');
const technologies = await load('public/data/technology-catalog.json');
const maiden = maidens.rows.find((m) => m.id === 6059);
const runtimeRoot = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const executablePath = (await fs.readdir(runtimeRoot)).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse().map((n) => path.join(runtimeRoot, n, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let unavailable = true;
  await page.route('**/data/loadout-rules.json', (route) => unavailable ? route.fulfill({ status: 503, body: 'intentional regression-test failure' }) : route.continue());
  await page.goto(process.argv[2] || 'http://localhost:3100', { waitUntil: 'networkidle' });
  await page.locator('.search-box input').fill(maiden.tank);
  await page.locator('.search-box button').click();
  await page.locator(`tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  await page.locator('.detail-modal .detail-actions button', { hasText: '配装模拟' }).click();
  const sim = page.locator('.sim-shell');
  await sim.locator('.sim-growth-status[role="alert"]').waitFor();
  assert.deepEqual(await sim.locator('.sim-stat:not(.sim-grade) strong').allTextContents(), Array(8).fill('—'), 'failed native data must never display approximate or zero stats');
  await sim.getByRole('button', { name: '复制分享图' }).click();
  assert.ok((await sim.locator('.sim-footer').innerText()).includes('暂不能复制配装数值'));
  unavailable = false;
  await sim.getByRole('button', { name: '重试' }).click();
  await sim.locator('.sim-growth-status').waitFor({ state: 'hidden' });
  const attributeOrder = [0, 2, 3, 5, 4, 6, 8, 9];
  const hiddenOrder = [11, 14, 13];
  const assertPanel = async (name) => {
    const fixture = fixtures.cases.find((c) => c.name === name);
    assert.ok(fixture, `missing golden ${name}`);
    const values = (await sim.locator('.sim-stat:not(.sim-grade) strong').allTextContents()).map((n) => Number(n.replaceAll(',', '')));
    const hidden = (await sim.locator('.sim-grade small').allTextContents()).map((n) => Number(n.replaceAll(',', '')));
    assert.deepEqual(values, attributeOrder.map((id) => fixture.expected[id]), `rendered panel ${name}`);
    assert.deepEqual(hidden, hiddenOrder.map((id) => fixture.expected[id]), `rendered hidden values ${name}`);
  };
  for (const level of [1, 34, 35, 40, 60, 69, 70, 90, 99]) {
    await sim.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).fill(String(level));
    await assertPanel(`base:${maiden.id}:${level}`);
  }
  await sim.getByRole('button', { name: '重置本车' }).click();
  await sim.getByRole('button', { name: '返回钢舞姬详情' }).click();
  await page.evaluate((levels) => localStorage.setItem('steel-loadout-global-tech-v1', JSON.stringify(levels)), Object.fromEntries(technologies.blocks.map((b) => [b.id, 16])));
  await page.locator('.detail-modal .detail-actions button', { hasText: '配装模拟' }).click();
  for (const [phase, level] of [[1, 1], [2, 35], [3, 70]]) {
    await sim.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).fill(String(level));
    await assertPanel(`research:${phase}:16`);
  }
  assert.equal(await sim.locator('.sim-tech-tile').count(), 5);
  assert.equal(await sim.locator('.sim-tech-inactive').count(), 0);
  assert.deepEqual(errors, []);
  await sim.screenshot({ path: path.join(root, '.cache/native-loadout-ui.png') });
  console.log('Browser/native golden panels: 12 configurations matched; missing-data failure, retry, level changes, promotion and empty-craft research passed.');
} finally { await browser.close(); }
