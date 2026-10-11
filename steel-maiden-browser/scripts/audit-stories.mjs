import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(await fs.readFile(path.join(root, 'public/data/story-catalog.json'), 'utf8'));
const opening = JSON.parse(await fs.readFile(path.join(root, 'public/data/stories/-10000.json'), 'utf8'));
const browserRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const executablePath = (await fs.readdir(browserRoot)).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(browserRoot,n,'chrome-headless-shell-win64','chrome-headless-shell.exe'))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: {width:1440,height:1000} });
  const errors=[]; const requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  page.on('request',r=>requests.push(r.url()));
  await page.goto(process.argv[2] || 'http://127.0.0.1:3100', {waitUntil:'networkidle'});
  assert.ok(!requests.some(r=>r.includes('story-catalog.json')));
  await page.getByRole('navigation',{name:'主要栏目'}).getByRole('button',{name:'关卡',exact:true}).click();
  await page.getByRole('menuitem',{name:/^剧情一览/}).click();
  assert.equal(await page.locator('.control-panel').count(),0,'No unrelated maiden controls above stories');
  await page.getByRole('button',{name:'浏览序幕剧情'}).waitFor();
  assert.equal(await page.locator('.story-category-card').count(),catalog.categories.length);
  await page.locator('.story-archive').screenshot({path:path.join(root,'.cache/story-categories.png')});
  await page.getByRole('button',{name:'浏览序幕剧情'}).click();
  await page.locator('.story-map-card').first().click();
  const scene=page.locator('.story-scene');
  await scene.waitFor();
  const check = async index => {
    await page.waitForFunction(i=>document.querySelector('.story-scene')?.getAttribute('data-index')===String(i), index);
    const frame=opening.frames[index];
    assert.equal(await scene.locator('.story-dialogue p').innerText(),frame.text);
    assert.equal(await scene.locator('.story-background').getAttribute('src'),frame.background);
    for(const side of ['left','right']) {
      const char=catalog.characters[frame[side]];
      assert.equal(await scene.locator(`.story-figure.${side}`).count(),char?.image ? 1 : 0);
      if(char?.image) assert.equal(await scene.locator(`.story-figure.${side} img`).getAttribute('src'),char.image);
    }
  };
  await check(0);
  await scene.click(); await check(1);
  await page.keyboard.press('Enter'); await check(2);
  await page.keyboard.press('h'); assert.equal(await scene.getAttribute('data-hidden'),'true');
  assert.equal(await scene.locator('.story-hidden-hint').count(),0);
  assert.equal(await scene.getByText('H 或点击画面恢复对话框',{exact:true}).count(),0);
  assert.equal(await scene.locator('.story-dialogue').isVisible(),false);
  await page.keyboard.press('h'); await check(2); assert.equal(await scene.getAttribute('data-hidden'),'false');
  await page.keyboard.press('h'); assert.equal(await scene.getAttribute('data-hidden'),'true');
  await scene.click(); await check(2); assert.equal(await scene.getAttribute('data-hidden'),'false');
  await scene.hover(); await page.mouse.wheel(0,-200); await check(1);
  await page.waitForTimeout(250); await page.mouse.wheel(0,200); await check(2);
  for(let i=3;i<Math.min(12,opening.frames.length);i++){await page.keyboard.press('Enter');await check(i);}
  await scene.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await page.locator('.story-reader').screenshot({path:path.join(root,'.cache/story-game.png')});
  const current=Number(await scene.getAttribute('data-index'));
  await page.getByRole('button',{name:'对话记录',exact:true}).click();
  assert.equal(await page.locator('.story-chat [data-frame-index]').count(),opening.frames.length);
  assert.equal(await page.locator('.story-chat [data-current=true]').getAttribute('data-frame-index'),String(current));
  await page.locator('.story-chat').evaluate(el=>el.scrollTop=0);
  const commanderLine=page.locator(`.story-chat-line[data-frame-index="${opening.frames.findIndex(f=>f.head===3)}"]`);
  assert.equal(await commanderLine.locator('.story-avatar img').getAttribute('src'),'/art/stories/11301.webp');
  assert.equal(await commanderLine.locator('.story-avatar.is-cropped').count(),1);
  await page.locator('.story-reader').screenshot({path:path.join(root,'.cache/story-chat.png')});
  await page.getByRole('button',{name:'游戏演出',exact:true}).click(); await check(current);
  for(const viewport of [{width:1152,height:640},{width:390,height:760}]) {
    await page.setViewportSize(viewport);
    const box=await page.locator('.story-reader').evaluate(el=>({w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight,bottom:el.getBoundingClientRect().bottom}));
    assert.ok(box.sw<=box.w+1,JSON.stringify(box));
    assert.ok(box.sh<=box.h+1,JSON.stringify(box));
    assert.ok(box.bottom<=viewport.height,JSON.stringify(box));
    await page.locator('.story-reader').screenshot({path:path.join(root,`.cache/story-game-${viewport.width}.png`)});
    await page.getByRole('button',{name:'对话记录',exact:true}).click();
    assert.ok(await page.locator('.story-chat').evaluate(el=>el.scrollHeight>el.clientHeight));
    await page.locator('.story-chat').evaluate(el=>el.scrollTop=0);
    await page.locator('.story-reader').screenshot({path:path.join(root,`.cache/story-chat-${viewport.width}.png`)});
    await page.getByRole('button',{name:'游戏演出',exact:true}).click();
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.story-reader').count(),0);
  assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'返回剧情分类',exact:false}).click();
  await page.getByRole('button',{name:'浏览战役剧情'}).click();
  await page.getByRole('button',{name:'第 1 卷',exact:true}).click();
  assert.ok(await page.locator('.story-map-card').count()>0);
  await page.getByRole('searchbox',{name:'搜索剧情关卡'}).fill('no-such-story');
  assert.equal(await page.locator('.story-map-card').count(),0);
  await page.getByRole('button',{name:'清除筛选',exact:true}).click();
  await page.locator('.story-map-card').first().click();
  await scene.waitFor();
  const segments=await page.getByLabel('选择剧情段落').locator('option').count();
  if(segments>1){await page.getByLabel('选择剧情段落').selectOption('1');assert.ok(Number(await scene.getAttribute('data-index'))>0);}
  await page.getByRole('button',{name:'对话记录',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.locator('.story-map-card').first().click();
  await page.locator('.story-chat').waitFor();
  await page.keyboard.press('Escape');
  const kharkiv=catalog.maps.find(m=>m.id===106);
  await page.getByRole('searchbox',{name:'搜索剧情关卡'}).fill(kharkiv.name);
  await page.locator('.story-map-card').first().click();
  await page.locator('.story-chat').waitFor();
  const kharkivStory=JSON.parse(await fs.readFile(path.join(root,'public/data/stories/106.json'),'utf8'));
  const aliceIndex=kharkivStory.frames.findIndex(f=>f.head===7 && f.text.includes('只要足够听话就行了'));
  assert.ok(aliceIndex>=0,'Exercise the exact reported Kharkiv dialogue');
  const aliceLine=page.locator(`.story-chat-line[data-frame-index="${aliceIndex}"]`);
  await aliceLine.scrollIntoViewIfNeeded();
  assert.equal(await aliceLine.locator('strong').innerText(),'艾莉丝·戴高乐');
  assert.equal(await aliceLine.locator('.story-avatar img').getAttribute('src'),catalog.characters[7].image);
  await aliceLine.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  await aliceLine.screenshot({path:path.join(root,'.cache/story-alice-kharkiv.png')});
  await page.keyboard.press('Escape');
  const burma=catalog.maps.find(m=>m.id===117);
  await page.getByRole('searchbox',{name:'搜索剧情关卡'}).fill(burma.name);
  await page.locator('.story-map-card').first().click();
  await page.locator('.story-chat').waitFor();
  const burmaStory=JSON.parse(await fs.readFile(path.join(root,'public/data/stories/117.json'),'utf8'));
  for(const headId of [966,967]) {
    const rows=burmaStory.frames.map((f,i)=>({f,i})).filter(({f})=>f.head===headId);
    assert.ok(rows.length>0,'The reported Burma Road NPC must have dialogue');
    for(const {i} of rows) {
      const line=page.locator(`.story-chat-line[data-frame-index="${i}"]`);
      assert.equal(await line.locator('.story-avatar img').getAttribute('src'),catalog.characters[headId].image);
      assert.equal(await line.locator('strong').innerText(),catalog.characters[headId].name);
    }
    const line=page.locator(`.story-chat-line[data-frame-index="${rows[0].i}"]`);
    await line.scrollIntoViewIfNeeded();
    await line.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    await line.screenshot({path:path.join(root,`.cache/story-burma-${headId}.png`)});
  }
  assert.ok(!requests.some(r=>/\.(ogg|mp3|wav)(\?|$)/.test(r)),'No audio requested');
  assert.equal(requests.filter(r=>r.includes('story-catalog.json')).length,1);
  assert.deepEqual(errors,[]);
  // Render native long/multiline dialogue in an isolated opening fixture; no fabricated text.
  const sourceFrames=[];
  for(const m of catalog.maps) {
    const story=JSON.parse(await fs.readFile(path.join(root,`public/data/stories/${m.id}.json`),'utf8'));
    sourceFrames.push(...story.frames);
  }
  const unique=[...new Map(sourceFrames.map(f=>[`${f.side}:${f.text}`,f])).values()];
  const npcFrames=[11307,11310,11311,11315,11319,11320,11322,11323,11324,11325,11327,11331,11332,11333]
    .map(model=>sourceFrames.find(f=>catalog.characters[f.head]?.modelId===model));
  assert.ok(npcFrames.every(Boolean),'Exercise all NPC models that previously borrowed a commander avatar');
  const presentation=[
    sourceFrames.find(f=>f.head===3), sourceFrames.find(f=>f.head===4),
    sourceFrames.find(f=>f.side==='left' && f.text.includes('话说你不是昏过去了么')),
    ...['left','right'].map(side=>sourceFrames.find(f=>f.side===side && f.dialogue.includes('dhjm-009'))),
    sourceFrames.find(f=>f.head===7), sourceFrames.find(f=>f.head===8),
    ...npcFrames,
  ];
  assert.ok(presentation.every(Boolean),'Both native commander forms and both dialogue skins exist');
  const longFrames=[...unique.sort((a,b)=>(b.text.length+(b.text.match(/\n/g)?.length??0)*40)-(a.text.length+(a.text.match(/\n/g)?.length??0)*40)).slice(0,24),...presentation].map((f,i)=>({...f,id:`test-${i}`,section:0}));
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const sample=await context.newPage();
  await sample.route('**/data/stories/-10000.json',r=>r.fulfill({json:{...opening,frames:longFrames,sections:[{id:'long-native-text',name:'原文长台词校验',start:0,count:longFrames.length,scripts:[]}]}}));
  await sample.goto(process.argv[2] || 'http://127.0.0.1:3100',{waitUntil:'networkidle'});
  await sample.getByRole('navigation',{name:'主要栏目'}).getByRole('button',{name:'关卡',exact:true}).click();
  await sample.getByRole('menuitem',{name:/^剧情一览/}).click();
  await sample.getByRole('button',{name:'浏览序幕剧情'}).click();
  await sample.locator('.story-map-card').first().click();
  await sample.locator('.story-scene').waitFor();
  for(const viewport of [{width:1440,height:1000},{width:1152,height:640},{width:390,height:760},{width:390,height:640}]) {
    await sample.setViewportSize(viewport);
    await sample.getByLabel('选择剧情段落').selectOption('0');
    for(let i=0;i<longFrames.length;i++) {
      const measure=await sample.locator('.story-dialogue p').evaluate(el=>({h:el.clientHeight,sh:el.scrollHeight,w:el.clientWidth,sw:el.scrollWidth}));
      assert.ok(measure.sh<=measure.h+1 && measure.sw<=measure.w+1,`Long native line ${i} at ${viewport.width}x${viewport.height}: ${JSON.stringify(measure)}`);
      if(i>=24) {
        const geometry=await sample.locator('.story-dialogue').evaluate(el=>{
          const scene=el.closest('.story-scene').getBoundingClientRect();const bar=el.getBoundingClientRect();
          const name=el.querySelector('.story-speaker').getBoundingClientRect();const text=el.querySelector('p').getBoundingClientRect();
          const scale=bar.width/Number(getComputedStyle(el).getPropertyValue('--bar-width'));
          return {squareOffscreen:el.classList.contains('right')?bar.right-157*scale>=scene.right-1:bar.left+157*scale<=scene.left+1,
            nameInside:name.left>=scene.left-1 && name.right<=scene.right+1,textInside:text.left>=scene.left-1 && text.right<=scene.right+1};
        });
        assert.deepEqual(geometry,{squareOffscreen:true,nameInside:true,textInside:true},`Dialogue frame ${i} at ${viewport.width}x${viewport.height}`);
        await sample.locator('.story-scene img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
        if(viewport.width===1440)await sample.locator('.story-reader').screenshot({path:path.join(root,`.cache/story-presentation-${i}.png`)});
      }
      if(i===0)await sample.locator('.story-reader').screenshot({path:path.join(root,`.cache/story-long-${viewport.width}-${viewport.height}.png`)});
      await sample.keyboard.press('Enter');
    }
  }
  // Backtracking restores each commander's earlier outfit, without mixing gender or clothing.
  for(const [later,earlier,laterHead,earlierHead] of [[25,24,4,3],[30,29,8,7]]) {
    await sample.getByLabel('选择剧情段落').selectOption('0');
    for(let i=0;i<later;i++)await sample.keyboard.press('Enter');
    assert.equal(await sample.locator(`.story-figure.${longFrames[later].side} img`).getAttribute('src'),catalog.characters[laterHead].image);
    await sample.keyboard.press('ArrowLeft');
    assert.equal(await sample.locator(`.story-figure.${longFrames[earlier].side} img`).getAttribute('src'),catalog.characters[earlierHead].image);
  }
  await sample.getByRole('button',{name:'对话记录',exact:true}).click();
  for(const [index,id] of [[24,3],[25,4],[29,7],[30,8],...npcFrames.map((f,i)=>[31+i,f.head])]) {
    const line=sample.locator(`.story-chat-line[data-frame-index="${index}"]`);
    await line.scrollIntoViewIfNeeded();
    assert.equal(await line.locator('.story-avatar img').getAttribute('src'),catalog.characters[id].avatar);
    await line.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    await line.screenshot({path:path.join(root,`.cache/story-commander-${id}.png`)});
  }
  await context.close();
  console.log(JSON.stringify({ok:true,tests:'Lazy loading, native snapshots, click/Enter/H/wheel, mode switching, full transcript, responsive layout, search/volume/section, saved mode, no audio'},null,2));
} finally {await browser.close();}
