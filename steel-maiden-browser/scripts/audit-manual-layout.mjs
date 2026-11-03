import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { createManualGraph, expandManualGraph, layoutManualGraph, manualEdgePath } from "../app/researchManualGraph.ts";

const root=path.resolve(import.meta.dirname,"..");
const base=process.argv[2]||"http://127.0.0.1:3000/";
const assets=JSON.parse(await fs.readFile(path.join(root,"public/data/table-portraits.json"),"utf8"));
const data=JSON.parse(await fs.readFile(path.join(root,"public/data/research-tree.json"),"utf8"));
const art=(src)=>new URL(src.replace(/^\//,""),base.endsWith("/")?base:base+"/").pathname;
const runtime=path.join(process.env.LOCALAPPDATA,"ms-playwright");
const executablePath=(await fs.readdir(runtime)).filter((n)=>n.startsWith("chromium_headless_shell-")).sort().reverse().map((n)=>path.join(runtime,n,"chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1900,height:1200},permissions:["clipboard-read","clipboard-write"]});
const page=await context.newPage();
const errors=[],failed=[];page.on("pageerror",(e)=>errors.push(e.message));page.on("response",(res)=>{if(res.status()>=400)failed.push(res.url());});
let graph=createManualGraph(6495);
const pairs=[[6495,6515],[6495,6479],[6495,6444],[6495,6642],[6515,7511],[6444,9641],[6444,6533],[6515,9895]];
try{
  await page.goto(base,{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"钢舞姬",exact:true}).click();await page.getByRole("menuitem",{name:/^研发路线/}).click();
  await page.getByRole("button",{name:"手动模式",exact:true}).click();
  await page.getByRole("textbox",{name:"手动模式起点"}).fill("T-60轻型坦克");await page.locator(".manual-research .chain-search button").click();
  for(const [source,target] of pairs){
    await page.locator(`.manual-node[data-maiden-id="${source}"] .manual-expand-down`).click();
    const dialog=page.getByRole("dialog",{name:"向下扩展",exact:true});
    await dialog.getByRole("radio").filter({has:page.locator(`.table-portrait-head[src="${art(assets.rows[target])}"]`)}).click();
    await dialog.getByRole("button",{name:"确定",exact:true}).click();
    graph=expandManualGraph(data,graph,source,"down",target);
  }
  const layout=layoutManualGraph(graph);assert.equal(layout.crossings,0);
  assert.equal(await page.locator(".manual-node").count(),9);
  const actual=await page.locator(".manual-edge").evaluateAll((edges)=>edges.map((e)=>({source:Number(e.dataset.source),target:Number(e.dataset.target),d:e.getAttribute("d")})));
  for(const edge of layout.edges)assert.equal(actual.find((e)=>e.source===edge.source&&e.target===edge.target)?.d,manualEdgePath(edge));
  const positions=await page.locator(".manual-node").evaluateAll((nodes)=>nodes.map((n)=>({id:Number(n.dataset.maidenId),x:parseFloat(n.style.left),y:parseFloat(n.style.top)})));
  const bottom=positions.filter((n)=>[7511,9641,6533,9895].includes(n.id)).sort((a,b)=>a.x-b.x).map((n)=>n.id);
  assert.deepEqual(bottom,[7511,9895,9641,6533]);
  await page.locator(".manual-toolbar").getByRole("button",{name:"复制分享图",exact:true}).click();
  await page.locator(".manual-export-notice").getByText("已复制到剪贴板").waitFor();
  const png=await page.evaluate(async()=>{const item=(await navigator.clipboard.read()).find((i)=>i.types.includes("image/png"));const blob=await item.getType("image/png");return Array.from(new Uint8Array(await blob.arrayBuffer()));});
  await fs.mkdir(path.join(root,".cache"),{recursive:true});
  await fs.writeFile(path.join(root,".cache/manual-layout-share.png"),new Uint8Array(png));
  await page.locator(".manual-scroll").screenshot({path:path.join(root,".cache/manual-layout-branches.png")});
  await page.setViewportSize({width:390,height:700});
  await page.locator(".manual-toolbar").getByRole("button",{name:"回到起点",exact:true}).click();
  assert.deepEqual((await page.locator(".manual-node").evaluateAll((nodes)=>nodes.map((n)=>Number(n.dataset.maidenId)))).sort((a,b)=>a-b),graph.ids.slice().sort((a,b)=>a-b));
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({nodes:9,edges:8,crossings:layout.crossings,bottomOrder:bottom,pngBytes:png.length,sharedPaths:true,mobile:true,errors,failed}));
}finally{await browser.close();}
