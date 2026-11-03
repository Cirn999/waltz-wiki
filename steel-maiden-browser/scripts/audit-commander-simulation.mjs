import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { chromium } from 'playwright';
import { openAttributeTable } from './audit-table-setup.mjs';
import { calculateCommanderSimulation, commanderMagicPaths, defaultCommanderTactic } from '../app/commanderSimulation.ts';
import { starPromotions } from '../app/starPromotions.ts';
import { median } from '../app/attributeChartMath.ts';

const root=path.resolve(import.meta.dirname,'..');
const read=async name=>JSON.parse(await fs.readFile(path.join(root,`public/data/${name}.json`),'utf8'));
const data=await read('maidens'),technology=await read('technology-catalog'),rules=await read('loadout-rules');
const cards=data.rows.map(row=>({id:row.id,magicSelectors:row.magicSelectors,promotions:starPromotions(row.id)}));
const expected=calculateCommanderSimulation({commanderLevel:90,tacticTrend:defaultCommanderTactic,cards,levels:data.levels,technology,magicPaths:commanderMagicPaths(data.magicProgression),rules});
const runtimeRoot=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const executablePath=(await fs.readdir(runtimeRoot)).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(runtimeRoot,n,'chrome-headless-shell-win64/chrome-headless-shell.exe'))[0];
const browser=await chromium.launch({headless:true,executablePath});
const errors=[];
let server;
let url=process.argv[2]||'http://127.0.0.1:59676';
if(url==='--pages'){
  const output=path.join(root,'dist/client'),prefix='/waltz-wiki/';
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
  server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
    const file=path.resolve(output,decodeURIComponent(pathname.slice(prefix.length))||'index.html');
    if(!file.startsWith(output+path.sep)){res.writeHead(403);res.end();return;}
    try{if(!(await fs.stat(file)).isFile())throw new Error();res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');createReadStream(file).pipe(res);}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}${prefix}`;
}
try{
  const context=await browser.newContext({viewport:{width:1440,height:950},permissions:['clipboard-read','clipboard-write']});
  await context.addInitScript(()=>{
    if(!localStorage.getItem('steel-loadout-global-tech-v1'))localStorage.setItem('steel-loadout-global-tech-v1',JSON.stringify({'榴弹-1':8}));
    if(!localStorage.getItem('steel-loadout-vehicle-v1:9865'))localStorage.setItem('steel-loadout-vehicle-v1:9865',JSON.stringify({level:83}));
  });
  const page=await context.newPage();
  const failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(response.status()>=400)failed.push(response.url());});
  await page.goto(url,{waitUntil:'networkidle'});
  await openAttributeTable(page);
  const commander=page.getByRole('spinbutton',{name:'指挥官等级',exact:true});
  assert.equal(await commander.inputValue(),'');
  const coordinates=await Promise.all([page.getByRole('button',{name:/^列设置/}).boundingBox(),commander.boundingBox(),page.getByRole('button',{name:/^切换模拟战术/}).boundingBox()]);
  assert.ok(coordinates[0].x<coordinates[1].x&&coordinates[1].x<coordinates[2].x,'Control order: columns, commander, tactics');
  await commander.fill('90');
  try{await page.waitForFunction(()=>document.querySelector('.commander-mode-status')?.textContent.includes('指挥官90级上限'),{},{timeout:15000});}
  catch(error){console.error('Simulation status:',await page.locator('.commander-mode-status').innerText(),'page errors',errors);throw error;}
  await page.screenshot({path:path.join(root,'.cache/commander-desktop.png')});
  await page.getByRole('button',{name:'90级',exact:true}).click();
  const implemented=data.rows.filter(row=>row.implemented);
  const powers=implemented.map(row=>expected.rows[row.id][90].values.power).sort((a,b)=>b-a);
  const displayed=await page.locator('tbody .column-power .table-stat-value').evaluateAll(els=>els.map(el=>Number(el.firstChild.textContent.replaceAll(',',''))));
  assert.deepEqual(displayed,powers,'Sorting must use simulated values');
  const sortedMedian=median(powers);
  const delta=await page.locator('tbody .column-power .table-stat-value').first().textContent();
  assert.ok(delta.includes(`+${powers[0]-sortedMedian}`),'Median differences must use simulated values');
  const powerMinimum=page.locator('.table-filter-row .column-power input');
  await powerMinimum.fill(String(powers[20]));
  assert.equal(await page.locator('tbody tr[data-maiden-id]').count(),powers.filter(value=>value>=powers[20]).length);
  await powerMinimum.fill('');
  await page.locator('.search-box input').fill('PLZ05');
  await page.locator('.search-box button').click();
  const stat=async key=>Number((await page.locator(`tr[data-maiden-id="9865"] .column-${key} .table-stat-value`).evaluate(el=>el.firstChild.textContent)).replaceAll(',',''));
  for(const [key,value]of Object.entries(expected.rows[9865][90].values))assert.equal(await stat(key),value);
  await page.getByRole('button',{name:'60级',exact:true}).click();
  assert.equal(await stat('power'),expected.rows[9865][60].values.power);
  assert.equal(await commander.inputValue(),'90');
  await page.getByRole('button',{name:'90级',exact:true}).click();
  for(const kind of ['柱状图','散点图']){
    await page.locator('.attribute-chart-launchers').getByRole('button',{name:kind,exact:true}).click();
    const chart=page.getByRole('dialog',{name:'属性图表',exact:true});
    assert.ok((await chart.locator('.ac-formula-help').last().innerText()).includes('指挥官90级上限'));
    await chart.getByRole('button',{name:'加入 PLZ05',exact:true}).click();
    await chart.getByRole('button',{name:'60级',exact:true}).click();
    await chart.getByRole('button',{name:/生成图表/}).click();
    const point=chart.locator(kind==='柱状图'?'.ac-bar-point':'.ac-scatter-point');
    assert.equal(Number(await point.getAttribute(kind==='柱状图'?'data-value':'data-y')),expected.rows[9865][60].values.power);
    assert.ok((await chart.locator('svg.ac-chart-svg').textContent()).includes('指挥官90级上限'));
    // Exercise the actual SVG-to-PNG exporter used by the share button.
    await chart.getByRole('button',{name:'复制图表',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ac-share-status')?.textContent.includes('完整图表已复制'));
    const bytes=await page.evaluate(async()=>((await navigator.clipboard.read()).find(item=>item.types.includes('image/png')).getType('image/png')).then(blob=>blob.size));
    assert.ok(bytes>1000);
    await chart.getByRole('button',{name:'关闭属性图表'}).click();
  }
  await page.getByRole('button',{name:/^切换模拟战术/}).click();
  await page.getByRole('dialog',{name:'选择上限模拟战术'}).getByRole('button',{name:'火力构造定制',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.commander-mode-status')?.textContent.includes('火力构造定制'));
  assert.ok(await stat('power')>expected.rows[9865][90].values.power);
  assert.equal(await page.evaluate(()=>localStorage.getItem('steel-loadout-global-tech-v1')),JSON.stringify({'榴弹-1':8}));
  assert.equal(await page.evaluate(()=>localStorage.getItem('steel-loadout-vehicle-v1:9865')),JSON.stringify({level:83}));
  await page.reload({waitUntil:'networkidle'});await openAttributeTable(page);
  assert.equal(await commander.inputValue(),'90');
  await page.waitForFunction(()=>document.querySelector('.commander-mode-status')?.textContent.includes('火力构造定制'));
  await page.getByRole('button',{name:'清空指挥官等级，恢复基础属性'}).click();
  assert.equal(await page.locator('.commander-mode-status').count(),0);
  const baseId=Number(await page.locator('tr[data-maiden-id]').first().getAttribute('data-maiden-id'));
  const basePower=await page.locator(`tr[data-maiden-id="${baseId}"] .column-power .table-stat-value`).evaluate(el=>Number(el.firstChild.textContent.replaceAll(',','')));
  assert.equal(basePower,data.rows.find(row=>row.id===baseId).stats['1'].power);
  await commander.fill('0');assert.ok((await page.getByRole('alert').innerText()).includes('请输入'));
  // The most recent request wins when input changes while a worker is active.
  await commander.fill('147');await commander.fill('60');await commander.fill('90');
  await page.waitForFunction(()=>document.querySelector('.commander-mode-status')?.textContent.includes('指挥官90级上限'));
  for(const width of [1152,390]){
    await page.setViewportSize({width,height:760});
    const overflow=await page.locator('.control-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);
    assert.equal(overflow,false,`Controls fit at ${width}px`);
    await page.getByRole('button',{name:/^切换模拟战术/}).click();
    const dialog=page.getByRole('dialog',{name:'选择上限模拟战术'});
    const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    await page.screenshot({path:path.join(root,`.cache/commander-${width}.png`)});
    await dialog.getByRole('button',{name:'关闭战术选择'}).click();
  }
  const retryContext=await browser.newContext();const retryPage=await retryContext.newPage();
  await retryPage.route('**/data/loadout-rules.json',route=>route.fulfill({status:503,body:'Test failure'}),{times:1});
  await retryPage.goto(url,{waitUntil:'networkidle'});await openAttributeTable(retryPage);
  await retryPage.getByRole('spinbutton',{name:'指挥官等级',exact:true}).fill('90');
  await retryPage.getByRole('alert').waitFor();
  assert.equal(await retryPage.locator('tbody tr[data-maiden-id]').count(),0,'No approximate or stale values during a data failure');
  await retryPage.getByRole('button',{name:'重试计算',exact:true}).click();
  await retryPage.waitForFunction(()=>document.querySelector('.commander-mode-status')?.textContent.includes('指挥官90级上限'));
  await retryContext.close();
  assert.deepEqual(errors,[]);
  assert.deepEqual(failed,[],'All assets must resolve under the current deployment prefix');
  console.log(JSON.stringify({controls:'passed',nativeValues:'passed',sortingMedianMinimums:'passed',barScatterAndPng:'passed',preferencesIsolation:'passed',failureRetry:'passed',viewports:[1440,1152,390],errors,failed}));
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
