import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const maidens = JSON.parse(await fs.readFile(path.join(root,"public/data/maidens.json"),"utf8")).rows;
const browserRoot = path.join(process.env.LOCALAPPDATA,"ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter(n=>n.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({headless:true,executablePath:path.join(browserRoot,shell,"chrome-headless-shell-win64/chrome-headless-shell.exe")});
const baseUrl = process.argv[2] || "http://127.0.0.1:56501";
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on("pageerror", error=>errors.push(error.message));
  await fs.mkdir(path.join(root,".cache"),{recursive:true});
  async function open(id) {
    const maiden = maidens.find(row=>row.id===id);
    await page.goto(baseUrl,{waitUntil:"networkidle"});
    await page.locator(".search-box input").fill(maiden.tank);
    await page.locator(".search-box input").press("Enter");
    await page.locator('tr[data-maiden-id="'+id+'"] .table-avatar').click();
    const section = page.locator('.maiden-quotes[data-card-id="'+id+'"]');
    await section.scrollIntoViewIfNeeded();
    await section.getByRole("tabpanel").filter({hasNot:page.getByRole("status")}).waitFor();
    await page.waitForFunction(()=>document.querySelector(".maiden-quotes-panel")?.getAttribute("aria-busy")==="false");
    return section;
  }
  for (const id of [6242,9879,9838,6278,8001]) {
    const section = await open(id);
    assert.equal(await section.getByRole("tab").count(),4);
    assert.equal(await section.getByRole("tab",{name:/入队台词/}).getAttribute("aria-selected"),"true");
    assert.ok(await section.locator(".maiden-quote-group p").count()>0);
    if ([9879,9838].includes(id)) {
      assert.equal(await section.locator("details").count(),1);
      await section.locator("summary").click();
      assert.equal(await section.locator("details[open] [data-frame-index]").count(),45);
      const transcript = section.getByLabel("入队剧情对话记录");
      const quotes = JSON.parse(await fs.readFile(path.join(root,"public/data/maiden-quotes/"+id+".json"),"utf8"));
      for (const [at,line] of quotes.recruitmentStory.lines.entries()) {
        const bubble = transcript.locator('[data-frame-index="'+at+'"]');
        assert.equal(await bubble.locator("p").innerText(),line.text);
        if (line.kind === "dialogue") {
          assert.ok((await bubble.getAttribute("class")).includes(line.side));
          const character = quotes.recruitmentStory.characters[line.head];
          assert.equal(await bubble.locator("strong").innerText(),line.player?"指挥官":line.speaker);
          assert.equal(await bubble.locator(".story-avatar img").getAttribute("src"),character.avatar||character.image);
          assert.equal(await bubble.locator(".story-avatar.is-cropped").count(),Number(!!character.avatarCrop));
        } else assert.equal(await bubble.locator(".story-avatar").count(),0);
      }
      for (const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});
        await section.locator("summary").evaluate(el=>el.scrollIntoView({block:"start"}));
        assert.ok(await transcript.evaluate(el=>el.scrollWidth<=el.clientWidth+1&&getComputedStyle(el).overflowY==="visible"));
        await page.screenshot({path:path.join(root,'.cache/recruitment-chat-'+id+'-'+width+'.png')});
      }
      await page.setViewportSize({width:1440,height:1000});
      const last = section.locator("details [data-frame-index]").last();
      await last.scrollIntoViewIfNeeded();
      assert.ok(await last.isVisible());
      await section.locator("summary").click();
    }
    await section.getByRole("tab",{name:/授勋台词/}).click();
    if(id===8001) assert.ok((await section.innerText()).includes("客户端暂无收录授勋台词"));
    else assert.ok(await section.locator(".maiden-quote-group p").count()>0);
    await section.getByRole("tab",{name:/主界面触摸台词/}).click();
    if(id===9879) assert.ok((await section.innerText()).includes("客户端暂无收录主界面触摸台词"));
    if(id===6278) assert.equal(await section.locator('[data-quote-tag="1034"]').count(),1);
    await section.getByRole("tab",{name:/战斗台词/}).click();
    assert.equal(await section.locator('[data-quote-tag="1002"]').count(),1);
    for(const width of [1440,1152,768,390]) {
      await page.setViewportSize({width,height:1000});
      const layout = await section.evaluate(el=>({
        width:el.clientWidth, scroll:el.scrollWidth,
        overlaps:[...el.querySelectorAll('[role="tab"]')].some(e=>e.scrollWidth>e.clientWidth+1),
        nestedScroll:[...el.querySelectorAll("*")].some(e=>getComputedStyle(e).overflowY==="auto"&&e.scrollHeight>e.clientHeight+1)
      }));
      assert.ok(layout.scroll<=layout.width+1&&!layout.overlaps&&!layout.nestedScroll,JSON.stringify({id,width,layout}));
      if(id===6242&&[1440,390].includes(width)) await section.screenshot({path:path.join(root,'.cache/maiden-quotes-'+width+'.png')});
    }
    await section.getByRole("tab",{name:/战斗台词/}).focus();
    await page.keyboard.press("Home");
    assert.equal(await section.getByRole("tab",{name:/入队台词/}).getAttribute("aria-selected"),"true");
    console.log(JSON.stringify({id,ok:true}));
    await page.setViewportSize({width:1440,height:1000});
  }
  // Failed fetch is distinct from genuinely absent dialogue; retry works.
  let fail = true;
  await page.route("**/data/maiden-quotes/6242.json",route=>fail?route.fulfill({status:503,body:"offline"}):route.continue());
  const section = await open(6242);
  assert.equal(await section.getByRole("alert").count(),1);
  fail=false;
  await section.getByRole("button",{name:"重新加载"}).click();
  await section.locator(".maiden-quote-group p").first().waitFor();
  assert.equal(await section.getByRole("alert").count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,categories:4,stories:true,missing:true,retry:true,responsive:true}));
} finally { await browser.close(); }
