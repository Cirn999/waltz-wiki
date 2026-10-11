// Visual inventory: compare every story model with the exact avatar the reader uses.
// Diagnostic screenshots only; original game assets are never modified.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const base = process.argv[2] || 'http://127.0.0.1:3010';
const label = process.argv[3] || 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid audit label');
const output = path.join(root, '.cache', `story-avatar-review-${label}`);
await fs.mkdir(output, { recursive: true });
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/data/story-catalog.json'), 'utf8'));
const models = new Map();
for (const c of Object.values(catalog.characters)) {
  if (!c.modelId) continue;
  if (!models.has(c.modelId)) models.set(c.modelId, { ...c, heads: [], names: [] });
  const model = models.get(c.modelId);
  model.heads.push(c.id);
  if (!model.names.includes(c.name)) model.names.push(c.name);
}
const entries = [...models.values()].sort((a,b) => a.modelId - b.modelId);
for (const c of entries) {
  const meta = await sharp(path.join(root, 'public', c.image)).metadata();
  c.dimensions = [meta.width, meta.height];
}
await fs.writeFile(path.join(output, 'inventory.json'), JSON.stringify(entries, null, 2));
const browserRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const executablePath = (await fs.readdir(browserRoot)).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse().map(n => path.join(browserRoot,n,'chrome-headless-shell-win64','chrome-headless-shell.exe'))[0];
const browser = await chromium.launch({ headless:true, executablePath });
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
try {
  const page = await browser.newPage({ viewport:{width:1500,height:1440}, deviceScaleFactor:1 });
  const errors = [];
  page.on('response', r => { if (r.status() >= 400) errors.push(r.url()); });
  await page.goto(base, {waitUntil:'networkidle'});
  const css = await fs.readFile(path.join(root, 'app/stories.css'), 'utf8');
  for (let i=0; i<entries.length; i+=30) {
    const cards = entries.slice(i,i+30).map(c => {
      const crop = c.avatarCrop;
      const style = crop ? `width:${100*crop.sourceWidth/crop.size}%;left:${-100*crop.x/crop.size}%;top:${-100*crop.y/crop.size}%;` : '';
      return `<article><strong>${c.modelId} · ${escape(c.names.join(' / '))}</strong><small>${c.dimensions.join(' × ')} · ${escape(c.avatar.split('/').pop() || 'portrait fallback')}</small><div class="pair"><img class="portrait" src="${base}${c.image}"><span class="story-avatar${crop?' is-cropped':c.avatar?'':' is-portrait'}"><img src="${base}${c.avatar || c.image}" style="${style}"></span></div></article>`;
    }).join('');
    await page.setContent(`<meta charset="utf-8"><style>${css}\nbody{margin:0;background:#edf1ea;font-family:Arial,'Microsoft YaHei',sans-serif}main{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:6px}article{height:278px;min-width:0;background:white;border:1px solid #cbd4c5;padding:6px;box-sizing:border-box}strong{display:block;font-size:13px;line-height:18px;height:36px;overflow:hidden}small{font-size:10px;display:block;height:16px;color:#59664f}.pair{display:flex;height:214px;gap:6px;align-items:flex-start}.portrait{width:156px;height:214px;object-fit:contain;object-position:center top;background:#e4e9e3}.story-avatar{width:60px;height:60px;flex-basis:60px;margin-top:10px}</style><main>${cards}</main>`);
    await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode())));
    await page.locator('main').screenshot({path:path.join(output,`sheet-${String(i/30+1).padStart(2,'0')}.png`)});
  }
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log(JSON.stringify({models:entries.length,heads:Object.keys(catalog.characters).length,output}));
} finally { await browser.close(); }
