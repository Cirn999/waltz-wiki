import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { starPromotions } from "../app/starPromotions.ts";

const root = path.resolve(import.meta.dirname,"..");
const maidens = JSON.parse(await fs.readFile(path.join(root,"public/data/maidens.json"),"utf8")).rows;
const browserRoot = path.join(process.env.LOCALAPPDATA,"ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter(n=>n.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({headless:true,executablePath:path.join(browserRoot,shell,"chrome-headless-shell-win64/chrome-headless-shell.exe")});
const baseUrl=process.argv[2]||"http://127.0.0.1:3017";
const air = maidens.find(row=>row.implemented && starPromotions(row.id).some(p=>p.costs.some(c=>c.fundId===19)));
const earlyHonor = maidens.find(row=>row.implemented && starPromotions(row.id)[0]?.showHonor);
const lateHonor = maidens.find(row=>row.implemented && starPromotions(row.id)[1]?.showHonor);
const materialWidth = row => Math.max(...starPromotions(row.id).map(p=>p.costs.reduce((width,c)=>width+32+c.amount.toLocaleString('zh-CN').length*7,0)+Number(p.showHonor)*32));
const widest = maidens.filter(row=>row.implemented).toSorted((a,b)=>materialWidth(b)-materialWidth(a))[0];
const ids=[...new Set([6021,6114,6242,earlyHonor.id,lateHonor.id,6007,air.id,widest.id])];
const widths=[1440,1152,768,721,720,520,481,480,390,320];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await fs.mkdir(path.join(root,'.cache'),{recursive:true});
  for(const id of ids) {
    const maiden=maidens.find(row=>row.id===id);
    await page.goto(baseUrl,{waitUntil:"networkidle"});
    await page.locator('.search-box input').fill(maiden.tank);
    await page.locator('.search-box input').press('Enter');
    const row=page.locator(`tr[data-maiden-id="${id}"]`);
    await row.locator('.table-avatar').click();
    const detail=page.locator('.detail-modal');
    await page.waitForFunction(()=>document.querySelector('#detail-level')?.disabled===false);
    const expected=starPromotions(id);
    const expectedLevels=[...new Set([1,60,90,99,...expected.map(p=>p.level)])].sort((a,b)=>a-b);
    assert.deepEqual(await detail.locator('.detail-level-marks button').allTextContents(),expectedLevels.map(l=>`${l}级`));
    assert.equal(await detail.locator('.detail-promotion-honor').count(),expected.some(p=>p.honor)?1:0);
    for(const p of expected) {
      const bubble=detail.locator(`.detail-promotion-bubble[data-stars="${p.stars}"]`);
      assert.equal(await bubble.getAttribute('title'),p.description);
      assert.equal(await bubble.locator('.detail-promotion-honor').count(),Number(p.showHonor));
      assert.deepEqual(await bubble.locator('.detail-promotion-cost').evaluateAll(els=>els.map(el=>[Number(el.dataset.fundId),el.querySelector('b').textContent])),p.costs.map(c=>[c.fundId,c.amount.toLocaleString('zh-CN')]));
      await bubble.click();
      assert.equal(await detail.locator('#detail-level').inputValue(),String(p.level));
    }
    for(const width of widths) {
      await page.setViewportSize({width,height:1000});
      await detail.locator('.detail-promotion-bubble img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
      const layout=await detail.locator('.detail-level-slider').evaluate(el=>{
        const box=e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};
        return {slider:box(el),toolbar:box(el.closest('.detail-toolbar')),filter:box(el.closest('.detail-toolbar').querySelector('.rank-filter-button')),range:box(el.querySelector('input')),bubbles:[...el.querySelectorAll('.detail-promotion-bubble')].map(box),items:[...el.querySelectorAll('.detail-promotion-bubble')].map(b=>[...b.children].map(box)),heading:[...el.querySelectorAll('.detail-level-slider-heading > *')].map(box),marks:[...el.querySelectorAll('.detail-level-marks button')].map(box),overflow:[...el.querySelectorAll('.detail-promotion-bubble,.detail-promotion-cost')].some(e=>e.scrollWidth>e.clientWidth+1),images:[...el.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0)};
      });
      assert.ok(layout.images&&!layout.overflow,`${id}/${width}: icon/content fits`);
      assert.equal(layout.slider.left,layout.toolbar.left,`${id}/${width}: full-width slider starts at toolbar edge`);
      assert.equal(layout.slider.right,layout.toolbar.right,`${id}/${width}: full-width slider ends at toolbar edge`);
      assert.ok(layout.filter.bottom<=layout.slider.top,`${id}/${width}: filter stays in the compact top row`);
      if(width>720) {
        assert.ok(layout.toolbar.bottom-layout.toolbar.top<=140,`${id}/${width}: desktop toolbar stays compact: ${JSON.stringify(layout)}`);
        for(const items of layout.items) assert.ok(items.every(item=>Math.abs(item.top-items[0].top)<1),`${id}/${width}: materials in a single horizontal row`);
      }
      assert.ok(layout.bubbles[0].right < layout.bubbles[1].left,`${id}/${width}: bubbles overlap`);
      for(const bubble of layout.bubbles) {
        assert.ok(bubble.left>=layout.slider.left&&bubble.right<=layout.slider.right,`${id}/${width}: bubble bounds`);
        assert.ok(bubble.bottom<=layout.range.top,`${id}/${width}: bubble obscures drag track`);
        for(const label of layout.heading) assert.ok(bubble.right<=label.left||bubble.left>=label.right||bubble.bottom<=label.top||bubble.top>=label.bottom,`${id}/${width}: bubble overlaps level heading: ${JSON.stringify(layout)}`);
      }
      for(let i=1;i<layout.marks.length;i++) assert.ok(layout.marks[i].left>=layout.marks[i-1].right,`${id}/${width}: shortcut overlap`);
      for(const level of expected.map(p=>p.level)) {
        await detail.locator('.detail-level-marks').getByRole('button',{name:`${level}级`,exact:true}).click();
        assert.equal(await detail.locator('#detail-level').inputValue(),String(level));
      }
      if([6114,6242,earlyHonor.id,lateHonor.id].includes(id)) await detail.locator('.detail-toolbar').screenshot({path:path.join(root,`.cache/star-promotions-${id}-${width}.png`)});
      if(id===6114&&[1440,1152,390].includes(width)) { await detail.locator('.detail-header').scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(root,`.cache/star-promotions-fullwidth-${width}.png`)}); }
    }
    console.log(JSON.stringify({id,tank:maiden.tank,ok:true}));
    await page.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,cards:ids,widths,fullWidth:true,horizontalDesktopCosts:true,honorNeverDuplicated:true}));
} finally {await browser.close();}
