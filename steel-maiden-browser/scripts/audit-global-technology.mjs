import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { openAttributeTable } from './audit-table-setup.mjs';

const root = path.resolve(import.meta.dirname, '..');
const technology = JSON.parse(await fs.readFile(path.join(root, 'public/data/technology-catalog.json'), 'utf8'));
const runtimeRoot = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const executablePath = (await fs.readdir(runtimeRoot)).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse().map((n) => path.join(runtimeRoot, n, 'chrome-headless-shell-win64/chrome-headless-shell.exe'))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addInitScript(() => {
    for (const [id, level] of [[9865, 90], [6242, 1]]) {
      const key = `steel-loadout-vehicle-v1:${id}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ level }));
    }
  });
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  const errors = [];
  for (const page of [pageA, pageB]) page.on('pageerror', (e) => errors.push(e.message));
  const url = process.argv[2] || 'http://127.0.0.1:3100';
  const open = async (page, tank, id) => {
    await openAttributeTable(page);
    await page.locator('.search-box input').fill(tank);
    await page.locator('.search-box button').click();
    await page.locator(`tr[data-maiden-id="${id}"] .table-avatar`).click();
    await page.locator('.detail-modal .detail-actions button', { hasText: '配装模拟' }).click();
    await page.waitForFunction(() => document.querySelector('.sim-stat strong')?.textContent !== '—');
  };
  for (const [page, tank, id] of [[pageA, 'PLZ05', 9865], [pageB, '野牛II', 6242]]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await open(page, tank, id);
  }
  const simA = pageA.locator('.sim-shell'), simB = pageB.locator('.sim-shell');
  const tile = (sim) => sim.getByRole('button', { name: /^设置榴弹科技/ });
  const waitTotal = async (page, total) => page.waitForFunction((value) => [...document.querySelectorAll('.sim-tech-tile')].find((el) => el.title.startsWith('榴弹 · '))?.querySelector('strong')?.textContent === String(value), total);
  const edit = async (page, sim, values, selectFirst = false) => {
    await tile(sim).click();
    const dialog = page.locator('.sim-dialog');
    for (let i = 0; i < values.length; i++) await dialog.getByRole('spinbutton', { name: `${i + 1}期科技等级`, exact: true }).fill(String(values[i]));
    if (selectFirst) await dialog.getByRole('checkbox', { name: '已研发杀伤榴弹(小口径)', exact: true }).check();
    await dialog.getByRole('button', { name: '保存科技等级', exact: true }).click();
  };

  await edit(pageA, simA, [14, 9, 5], true);
  await waitTotal(pageA, 28);
  await waitTotal(pageB, 28);
  assert.ok((await tile(simB).getAttribute('title')).includes('本车生效 14 级'), 'A level-one vehicle retains the same global total while applying only its eligible period');
  await tile(simB).click();
  const dialogB = pageB.locator('.sim-dialog');
  assert.deepEqual(await dialogB.locator('.sim-tech-phase input').evaluateAll((els) => els.map((el) => Number(el.value))), [14, 9, 5]);
  assert.equal(await dialogB.getByRole('checkbox', { name: '已研发杀伤榴弹(小口径)', exact: true }).isChecked(), true);
  await dialogB.getByRole('button', { name: '取消', exact: true }).click();
  await simB.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).fill('90');
  await waitTotal(pageB, 28);
  await simB.getByRole('button', { name: '重置本车', exact: true }).click();
  await waitTotal(pageB, 28);
  assert.equal(await simB.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).inputValue(), '1');

  await edit(pageB, simB, [6, 2, 1]);
  await waitTotal(pageA, 9);
  await pageB.reload({ waitUntil: 'networkidle' });
  await open(pageB, '野牛II', 6242);
  await waitTotal(pageB, 9);

  await simA.getByRole('button', { name: '一键满级', exact: true }).click();
  await waitTotal(pageA, 48);
  await waitTotal(pageB, 48);
  const saved = await pageA.evaluate(() => JSON.parse(localStorage.getItem('steel-loadout-global-tech-v1')));
  for (const block of technology.blocks) {
    assert.equal(saved[block.id], 16, `${block.id} must be maxed, including branches not used by the current vehicle`);
    for (const node of block.nodes) assert.equal(saved[`craft:${node.craftId}`], 1, `${node.name} must be researched`);
  }
  assert.equal(await simA.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).inputValue(), '90');
  assert.equal(await simB.getByRole('spinbutton', { name: '钢舞姬等级', exact: true }).inputValue(), '1');
  assert.ok((await tile(simB).getAttribute('title')).includes('本车生效 16 级'));
  await simA.getByRole('button', { name: '一键满级', exact: true }).click();
  assert.deepEqual(await pageA.evaluate(() => JSON.parse(localStorage.getItem('steel-loadout-global-tech-v1'))), saved);
  assert.ok((await simA.locator('.sim-stat:not(.sim-grade) strong').allTextContents()).every((value) => /^\d[\d,]*$/.test(value)));
  await simA.screenshot({ path: path.join(root, '.cache/global-technology-desktop.png') });
  const placement = await simA.locator('.sim-tech-grid').evaluate((el) => {
    const last = el.querySelectorAll('.sim-tech-tile')[4].getBoundingClientRect();
    const button = el.querySelector('.sim-tech-max').getBoundingClientRect();
    return { sameRow: Math.abs(last.top - button.top) < 1, toRight: button.left >= last.right };
  });
  assert.deepEqual(placement, { sameRow: true, toRight: true });
  await pageA.setViewportSize({ width: 390, height: 844 });
  assert.equal(await simA.locator('.sim-tech-grid').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await simA.getByRole('button', { name: '一键满级', exact: true }).scrollIntoViewIfNeeded();
  await simA.locator('.sim-technology-section').screenshot({ path: path.join(root, '.cache/global-technology-mobile.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ globalAcrossVehiclesAndTabs: true, sameTotalAtDifferentLevels: 28, refreshAndVehicleReset: 'passed', maxedBlocks: technology.blocks.length, researchedNodes: technology.blocks.reduce((n, b) => n + b.nodes.length, 0), maxButtonBottomRightAndMobile: 'passed' }));
} finally { await browser.close(); }
