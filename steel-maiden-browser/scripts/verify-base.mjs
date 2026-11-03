import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const publicRoot = new URL("../public/", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/base-catalog.json", publicRoot), "utf8"));
const b = id => data.buildings.find(x => x.id === id);
assert.equal(data.schemaVersion, 2);
assert.deepEqual(data.buildings.map(x => [x.id, x.maxLevel]), [[18501,20],[18503,16],[18504,16],[18505,8],[18506,7],[18507,7],[18508,3],[18509,3]]);
assert.deepEqual(data.buildings.map(x => [x.x,x.y]), [[480,270],[640,190],[640,350],[320,190],[160,270],[800,270],[320,350],[750,435]]);
assert.equal(data.buildings.flatMap(x => x.upgrades).length,80);
for (const building of data.buildings) {
  assert.equal(building.upgrades.length,building.maxLevel);
  assert.deepEqual(building.upgrades.map(u=>[u.from,u.to]), Array.from({length:building.maxLevel},(_,i)=>[i,i+1]));
  for (const u of building.upgrades) {
    assert(u.seconds>=0 && Number.isFinite(u.seconds));
    for (const cost of u.costs) assert(cost.amount>0 && cost.name && cost.image);
  }
}
const harborLast=b(18505).upgrades.at(-1);
assert.equal(harborLast.seconds,14*86400);
assert(harborLast.requirements.includes("司令部 ≥ 20级"));
assert.equal(harborLast.costs.find(c=>c.name==="银币").amount,8000000);
const stationSecond=b(18506).upgrades[1];
assert.equal(stationSecond.seconds,480);
assert.equal(stationSecond.costs.find(c=>c.name==="银币").amount,6000);
assert.deepEqual(b(18507).effects.map(e=>e.values["37353"]),[6,8,10,12,14,16,18]);
assert.equal(b(18501).effects.at(-1).values["17"],600);
assert.equal(b(18501).effects.at(-1).values["18"],45);
assert(b(18509).upgrades[0].requirements.includes("死水姬务段 ≥ 2级"));
assert.deepEqual(data.port.levels.map(l=>l.slots),[5,6,7,8,10,11,12,12]);
assert.deepEqual(data.port.levels.map(l=>l.silverRefreshCosts.length),[3,4,5,6,7,8,9,10]);
assert.deepEqual(data.port.levels.at(-1).silverRefreshCosts,[3000,8000,20000,50000,120000,200000,300000,450000,600000,800000]);
assert.equal(data.port.goods.length,131);
assert.deepEqual(data.port.levels.map(l=>l.goods),[93,100,106,113,123,127,131,131]);
const slotGates=[1,1,1,1,1,2,3,4,5,5,6,7];
for (const g of data.port.goods) for (const o of g.offers) {
  assert(o.amount>0 && o.costs.length>0 && o.slots.length>0);
  for (const s of o.slots) assert.equal(o.purchaseLevel,slotGates[s-1]);
  for (const c of o.costs) assert(c.amount>0 && c.image);
}
const bt=data.port.goods.find(g=>g.name==="BT-5A");
assert(bt?.offers.some(o=>o.amount===1 && o.costs.some(c=>c.name==="银币" && c.amount===3500)));
assert.equal(data.military.length,96);
assert.deepEqual([1,2,3,4,5,6].map(n=>data.military.filter(w=>w.group===n).length),[12,12,12,20,20,20]);
for (const [id,icon] of [[2501002,"dg-038"],[2501003,"dg-039"],[2502002,"dg-070"],[2503002,"dg-089"],[2504002,"dg-082"],[2505003,"dg-102"],[2506003,"dg-103"]]) {
  assert.equal(data.military.find(w=>w.id===id)?.image,"/art/base/"+icon+".png","活动必须使用自身记录的图标，不能复用同组首项图标");
}
assert.equal(new Set(data.military.map(w=>w.image)).size,63);

assert.equal(new Set(data.military.map(w=>w.id)).size,96);
assert(!data.military.some(w=>w.name.includes("测试")));
assert.deepEqual([2,3,4,5,6,7].map(n=>data.military.filter(w=>w.stationLevel===n).length),[12,12,12,20,20,20]);
assert.deepEqual(data.militaryLevels.map(l=>l.activities),[0,12,24,36,56,76,96]);
for(const w of data.military) {
  assert(w.times.length===3 && w.times.every(t=>t.seconds>0));
  assert(w.recommendedLevel>=20 && w.recommendedLevel<=75);
  assert(w.rewards.length && w.bonuses.length);
  for(const r of [...w.rewards,...w.bonuses.map(x=>x.reward)]) {
    assert(r.name && r.image && r.description);
    assert.equal(r.amount,undefined,"不得把定性军旅奖励换算为固定数量");
  }
}
assert.equal(data.port.ui.tile,"/art/base/gk-005.png");
for (const g of data.port.goods) { assert(g.shop.image && g.shop.frame); assert.equal(g.shop.frame,g.kind==="卡牌"?"/art/base/zdjm-029.png":"/art/base/djbb-001.png"); }
const images=new Set();
function walk(x) {
  if (typeof x==="string" && x.startsWith("/art/base/")) images.add(x);
  else if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x==="object") Object.values(x).forEach(walk);
}
walk(data);
for(const url of images) {
  const bytes=await readFile(new URL(url.slice(1),publicRoot));
  assert.equal(bytes.subarray(1,4).toString(),"PNG",url);
  assert(bytes.readUInt32BE(16)>0 && bytes.readUInt32BE(20)>0,url);
}

const { baseGoodsOffers } = await import("../app/baseTypes.ts");
const wreck = data.port.goods.find(g => g.name === "战车残骸");
const wreckOffers = baseGoodsOffers(wreck.offers);
assert.deepEqual(wreckOffers.map(o=>o.amount),[1,5,20,60]);
assert.deepEqual(wreckOffers.map(o=>o.purchaseLevel),[1,1,1,1]);
assert(wreckOffers.every(o=>!("slots" in o)));
for (const g of data.port.goods) {
  const offers=baseGoodsOffers(g.offers);
  for (const original of g.offers) {
    const same=offers.find(o=>o.amount===original.amount && JSON.stringify(o.costs)===JSON.stringify(original.costs));
    assert(same && same.purchaseLevel<=original.purchaseLevel,"合并后必须保留每个数量价格组合的最早购买前置");
  }
}
const price = n => [{id:1,name:"银币",image:"",amount:n}];
assert.deepEqual(baseGoodsOffers([
  {purchaseLevel:5,amount:10,costs:price(100),slots:[9]},
  {purchaseLevel:2,amount:10,costs:price(100),slots:[6]},
  {purchaseLevel:1,amount:10,costs:price(200),slots:[1]},
]).map(o=>[o.amount,o.costs[0].amount,o.purchaseLevel]),[[10,200,1],[10,100,2]]);


const exp = data.port.goods.find(g => g.name === "指挥官经验");
assert.equal(exp.key,"0:1");
assert.equal(exp.offers.flatMap(o=>o.slots).length,24,"12个码头各有常规经验及350000经验购买规则");
const expOffers=baseGoodsOffers(exp.offers);
assert.equal(expOffers.length,13);
assert.deepEqual(expOffers.map(o=>[o.amount,o.costs[0].amount]),[
 [10000,15000],[15000,22500],[20000,30000],[25000,37500],[30000,45000],
 [35000,52500],[40000,60000],[45000,67500],[50000,75000],[55000,82500],
 [60000,90000],[65000,97500],[350000,525000],
]);
const dummy=data.port.goods.find(g=>g.name==="实验人偶");
const sixty=baseGoodsOffers(dummy.offers).find(o=>o.amount===60);
assert.equal(sixty.costs[0].amount,1500000);
assert.equal(sixty.purchaseLevel,1,"这是购买规则前置，不可用作实际刷新等级");
assert(!("level" in sixty),"禁止再次把购买前置输出成不加区分的等级");
const component=await readFile(new URL("../app/BaseArchive.tsx",import.meta.url),"utf8");
assert(!component.includes("最低军港"));

console.log(JSON.stringify({buildings:8,upgrades:80,military:96,portGoods:131,verifiedImages:images.size,publicRoot:fileURLToPath(publicRoot)}));
