import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { openAttributeTable } from './audit-table-setup.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'scripts/fixtures/plz05-live-panel.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/data/maidens.json'), 'utf8'));
const maiden = catalog.rows.find((m) => m.id === fixture.cardId);
const tech = { ...fixture.technologyLevels, ...Object.fromEntries(fixture.researchedCrafts.map((id) => [`craft:${id}`, 1])) };
const config = { level: fixture.level, ammoId: 0, engineId: fixture.engineId, bodyId: fixture.bodyId, armorId: fixture.armorId };
const runtimeRoot = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const executablePath = (await fs.readdir(runtimeRoot)).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse().map((n) => path.join(runtimeRoot, n, 'chrome-headless-shell-win64/chrome-headless-shell.exe'))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ tech, config, id }) => {
    if (!localStorage.getItem('steel-loadout-global-tech-v1')) localStorage.setItem('steel-loadout-global-tech-v1', JSON.stringify(tech));
    if (!localStorage.getItem(`steel-loadout-vehicle-v1:${id}`)) localStorage.setItem(`steel-loadout-vehicle-v1:${id}`, JSON.stringify(config));
  }, { tech, config, id: maiden.id });
  await page.goto(process.argv[2] || 'http://127.0.0.1:3100', { waitUntil: 'networkidle' });
  const open = async () => {
    await openAttributeTable(page);
    await page.locator('.search-box input').fill('PLZ05');
    await page.locator('.search-box button').click();
    await page.locator(`tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
    await page.locator('.detail-modal .detail-actions button', { hasText: '配装模拟' }).click();
    await page.waitForFunction(() => document.querySelector('.sim-stat strong')?.textContent !== '—');
  };
  await open();
  const sim = page.locator('.sim-shell');
  const panel = async () => (await sim.locator('.sim-stat:not(.sim-grade) strong').allTextContents()).map((s) => Number(s.replaceAll(',', '')));
  const expected = Object.values(fixture.expected);
  assert.deepEqual(await panel(), expected);
  assert.equal(await sim.locator('.sim-craft-card').first().locator('strong').innerText(), maiden.baseAmmunition.name);
  const openResearch = async () => { await sim.getByRole('button', { name: /^设置榴弹科技/ }).click(); return page.locator('.sim-dialog'); };
  let dialog = await openResearch();
  await dialog.screenshot({ path: path.join(root, '.cache/plz05-research-editor.png') });
  const firstCraft = () => dialog.getByRole('checkbox', { name: '已研发杀伤榴弹(小口径)', exact: true });
  assert.equal(await firstCraft().isChecked(), true);
  await firstCraft().uncheck();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await panel(), expected, 'Cancelling draft research must not alter the active panel');
  dialog = await openResearch();
  assert.equal(await firstCraft().isChecked(), true);
  await firstCraft().uncheck();
  await dialog.getByRole('button', { name: '保存科技等级', exact: true }).click();
  assert.notDeepEqual(await panel(), expected, 'Saving researched nodes must recalculate the panel');
  await page.reload({ waitUntil: 'networkidle' });
  await open();
  dialog = await openResearch();
  assert.equal(await firstCraft().isChecked(), false, 'Global research selection must survive reload');
  await firstCraft().check();
  await dialog.getByRole('button', { name: '保存科技等级', exact: true }).click();
  assert.deepEqual(await panel(), expected);
  await sim.screenshot({ path: path.join(root, '.cache/plz05-corrected-panel.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  const ammoCard = sim.locator('.sim-craft-card').first();
  const bounds = await ammoCard.evaluate((el) => {
    const name = el.querySelector('strong').getBoundingClientRect();
    const efficiency = el.querySelector('.ammo-efficiency').getBoundingClientRect();
    return { nameRight: name.right, efficiencyLeft: efficiency.left };
  });
  assert.ok(bounds.nameRight <= bounds.efficiencyLeft + 1, 'Long default weapon name cannot overlap efficiency icons');
  dialog = await openResearch();
  assert.equal(await dialog.locator('.sim-research-editor').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
  await dialog.getByRole('spinbutton', { name: '1期科技等级', exact: true }).fill('0');
  assert.equal(await firstCraft().isDisabled(), true);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await panel(), expected);
  assert.deepEqual(errors, []);
  console.log('Live PLZ05 panel: all eight stats and original gun name matched; draft cancellation, research toggle, persistence, unavailable nodes and narrow layout passed.');
} finally { await browser.close(); }
