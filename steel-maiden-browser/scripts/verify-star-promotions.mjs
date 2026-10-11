import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { starPromotions, starPromotionHonorIcon } from "../app/starPromotions.ts";
import { promotionBubbleShifts } from "../app/promotionBubbleLayout.ts";

const root = path.resolve(import.meta.dirname, "..");
const maidens = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8")).rows;
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/star-promotions.json"), "utf8"));
assert.deepEqual(Object.keys(data.cards).map(Number).sort((a,b)=>a-b), maidens.map(row=>row.id).sort((a,b)=>a-b));
const firstHonor = { 2: 0, 3: 0, none: 0 };
const levelPairs = {};
assert.deepEqual(data.honorRecipes, {811:{trainId:251,level:60,phase:1},812:{trainId:252,level:75,phase:2},813:{trainId:253,level:90,phase:3}});
for (const maiden of maidens) {
  const promotions = starPromotions(maiden.id);
  assert.deepEqual(promotions.map(p=>[p.stars,p.recipeLevel]), [[2,35],[3,70]], maiden.tank);
  const pair = promotions.map(p=>p.level).join("/");
  levelPairs[pair] = (levelPairs[pair] || 0) + 1;
  const first = promotions.findIndex(p=>p.honor);
  assert.deepEqual(promotions.map(p=>p.showHonor), promotions.map((_,index)=>index===first));
  firstHonor[first<0 ? "none" : promotions[first].stars]++;
  for (const p of promotions) {
    assert.equal(p.level, Math.max(p.recipeLevel,p.honorLevel??0));
    assert.equal(p.honor, p.honorLevel !== null);
    if(p.honor) assert.ok(p.description.includes(`${p.honorLevel}级授勋`));
    assert.ok(p.costs.length >= 2);
    assert.ok(p.description.includes(`指挥官等级 ≥ ${p.commanderLevel}`));
    for (const cost of p.costs) {
      assert.ok(cost.name && cost.image && Number.isInteger(cost.amount) && cost.amount > 0);
      await fs.access(path.join(root,"public",cost.image));
    }
  }
}
assert.deepEqual(firstHonor, {2:69,3:106,none:602});
assert.deepEqual(levelPairs, {"35/70":602,"60/70":69,"35/75":106});
assert.deepEqual(starPromotions(6021).map(p=>[p.level,p.showHonor]), [[60,true],[70,false]], "蟋蟀 H must be honored at 60 before the second star");
assert.deepEqual(starPromotions(6004).map(p=>[p.level,p.showHonor]), [[35,false],[75,true]]);
assert.deepEqual(starPromotions(6242).map(p=>p.level), [35,70]);
for (const levels of [[35,70],[35,75],[60,70]]) {
  for (const [track,widths] of [[240,[72,72]],[405,[136,136]],[650,[230,205]],[1100,[200,240]]]) {
    const shifts = promotionBubbleShifts(track,levels,widths);
    const centers = levels.map(l=>(l-1)/98*track);
    const lefts = centers.map((c,i)=>c-widths[i]/2+shifts[i]);
    assert.ok(lefts[0]>=-0.01 && lefts[1]+widths[1]<=track+0.01);
    assert.ok(lefts[0]+widths[0]+7.99<=lefts[1]);
    assert.ok(centers.every((c,i)=>c>=lefts[i]+4 && c<=lefts[i]+widths[i]-4),"Pointers stay inside each bubble");
  }
}
assert.deepEqual(starPromotions(6242).map(p=>p.costs.map(c=>[c.name,c.amount])), [ [["密码子",1600],["秘密计划",36]], [["密码子",12000],["秘密计划",320]] ]);
assert.deepEqual(starPromotions(6001).map(p=>p.showHonor), [true,false]);
assert.deepEqual(starPromotions(6004).map(p=>p.showHonor), [false,true]);
assert.deepEqual(starPromotions(-1), []);
await fs.access(path.join(root,"public",starPromotionHonorIcon));
console.log(JSON.stringify({ok:true,cards:maidens.length,promotions:maidens.length*2,levelPairs,firstHonor,materials:Object.values(data.materials).map(m=>m.name)}));
