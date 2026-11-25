import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateCommanderSimulation, commanderMagicPaths, commanderPhase, commanderTechnologySettings, defaultCommanderTactic, maximumCommanderMagic, parseCommanderLevel } from '../app/commanderSimulation.ts';
import { calculateNativePanel, nativeInitialState } from '../app/nativeLoadout.ts';
import { nativePanelDisplay, researchCraftKey, researchRequiredLevel, technologyProperties } from '../app/loadoutMath.ts';
import { starPromotions } from '../app/starPromotions.ts';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'));
const data = load('maidens'), technology = load('technology-catalog'), rules = load('loadout-rules');
const magicPaths = commanderMagicPaths(data.magicProgression);
const cards = data.rows.map((row) => ({ id:row.id,magicSelectors:row.magicSelectors,promotions:starPromotions(row.id).map(({stars,level,commanderLevel})=>({stars,level,commanderLevel})) }));
const request = { tacticTrend:defaultCommanderTactic,cards,levels:data.levels,technology,magicPaths,rules };
assert.equal(parseCommanderLevel(''),null);
assert.equal(parseCommanderLevel('90'),90);
for (const input of ['0','-1','1.5','abc','32768']) assert.throws(()=>parseCommanderLevel(input));
assert.throws(()=>commanderTechnologySettings({...technology,commanderLimits:undefined},90),/缺少/);
for(const [level,period,expected] of [[3,1,0],[4,1,1],[26,2,0],[27,2,1],[49,3,0],[50,3,1]]) {
  assert.equal(commanderTechnologySettings(technology,level)[`榴弹-${period}`],expected);
}
const settings90=commanderTechnologySettings(technology,90);
assert.deepEqual([1,2,3].map(p=>settings90[`榴弹-${p}`]),[16,13,9]);
assert.deepEqual([1,2,3].map(p=>settings90[`综合索敌-${p}`]),[14,10,6]);
// Research is usable only when every native prerequisite has been met, not
// merely when its display column appears accessible.
for(const commanderLevel of [1,4,25,48,60,90,147]) {
  const settings=commanderTechnologySettings(technology,commanderLevel);
  const craftLevels=new Map([[1,commanderLevel]]);
  for(const block of technology.blocks) {
    craftLevels.set(block.craftId,settings[block.id]);
    for(const node of block.nodes)craftLevels.set(node.craftId,settings[researchCraftKey(node.craftId)]);
  }
  for(const block of technology.blocks)for(const node of block.nodes)if(settings[researchCraftKey(node.craftId)]) {
    assert.ok(researchRequiredLevel(block,node.x)<=settings[block.id],`${node.name}: researched nodes must contribute their permanent bonus`);
    for(const [craft,minimum,maximum] of node.researchRequirements) {
      if(craft===node.craftId)continue; // Prior self state is 0, the resulting state is 1.
      assert.ok(craftLevels.get(craft)>=minimum&&craftLevels.get(craft)<=maximum,`${node.name}: prerequisite ${craft} at commander ${commanderLevel}`);
    }
  }
}
const maximum=commanderTechnologySettings(technology,147);
for(const block of technology.blocks){assert.equal(maximum[block.id],16);for(const node of block.nodes)assert.equal(maximum[researchCraftKey(node.craftId)],1);}
const cricket=cards.find(c=>c.id===6021);
assert.equal(commanderPhase(cricket,35,147,rules).number,1,'蟋蟀H cannot light two stars before the level-60 honor gate');
assert.equal(commanderPhase(cricket,60,147,rules).number,2);
const plz=cards.find(c=>c.id===9865);
assert.equal(commanderPhase(plz,90,24,rules).number,1);
assert.equal(commanderPhase(plz,90,25,rules).number,2);
assert.equal(commanderPhase(plz,90,48,rules).number,3);
for(const card of cards)for(const selector of Object.values(card.magicSelectors))for(const [phase,max]of [[1,3],[2,6],[3,10]])assert.equal(maximumCommanderMagic(magicPaths,selector,48,phase),max);

const start=performance.now();
const base=calculateCommanderSimulation({...request,commanderLevel:1,levels:[1]});
for(const row of data.rows)for(const [key,value]of Object.entries(base.rows[row.id][1].values))if(row.stats['1'][key]!=null)assert.equal(value,row.stats['1'][key],`${row.tank}: commander 1 base ${key}`);
const upper=calculateCommanderSimulation({...request,commanderLevel:90});
const milliseconds=Math.round(performance.now()-start);
assert.equal(Object.keys(upper.rows).length,data.rows.length);
for(const row of data.rows)for(const level of data.levels)for(const value of Object.values(upper.rows[row.id][level].values))assert.ok(Number.isFinite(value));

// An independent construction of one native panel makes default ammo's tech
// contribution explicit. No craft or equipment selections are substituted.
const card=rules.cards[9865],phase=card.phases[3],state=nativeInitialState(rules,9865,phase);
state[1].level=90;
state[17].level=upper.rows[9865][90].ordnanceLevel;
state[18]={trend:211,level:upper.rows[9865][90].tacticsLevel};
const properties=technologyProperties(technology,settings90);
const panel=calculateNativePanel(rules,phase,state,properties);
assert.deepEqual(nativePanelDisplay(rules,panel.totals),{values:upper.rows[9865][90].values,grades:upper.rows[9865][90].grades});
const withoutHE=Object.fromEntries(Object.entries(settings90).map(([key,value])=>[key,key.startsWith('榴弹-')?0:value]));
const noAmmoTech=nativePanelDisplay(rules,calculateNativePanel(rules,phase,state,technologyProperties(technology,withoutHE)).totals);
assert.ok(upper.rows[9865][90].values.power>noAmmoTech.values.power,'Default PLZ05 HE must receive HE levels and research bonuses');
assert.ok(upper.rows[9865][90].values.piercing>noAmmoTech.values.piercing);
const fire=calculateCommanderSimulation({...request,commanderLevel:90,cards:[plz],levels:[90],tacticTrend:201});
assert.ok(fire.rows[9865][90].values.power>upper.rows[9865][90].values.power,'Tactic choice changes the native panel');
assert.equal(fire.rows[9865][90].values.stealth,upper.rows[9865][90].values.stealth);
assert.deepEqual(commanderTechnologySettings(technology,90),settings90,'Calculations cannot mutate technology settings');
console.log(JSON.stringify({cards:cards.length,vehicleLevels:data.levels,technologyPeriods:technology.blocks.length,nodes:technology.blocks.reduce((n,b)=>n+b.nodes.length,0),magicPaths:Object.keys(magicPaths).length,allPanelsMilliseconds:milliseconds,plz90:upper.rows[9865][90],defaultAmmoWithoutTechnology:noAmmoTech.values}));
