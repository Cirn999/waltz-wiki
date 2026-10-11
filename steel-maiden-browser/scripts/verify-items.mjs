import assert from "node:assert/strict";
import fs from "node:fs";
const data = JSON.parse(fs.readFileSync(new URL("../public/data/item-catalog.json", import.meta.url), "utf8"));
const items = data.items;
assert.equal(items.length, 413);
assert.equal(new Set(items.map((r) => r.id)).size, 413);
assert.equal(items.filter((r) => r.category === 82).length, 147);
assert.equal(items.filter((r) => r.category === 99).length, 266);
// Five historical honorary badge/shop icons are absent from the native packages.
// Preserve those entries with an explicit missing-icon placeholder, never a fake icon.
assert.deepEqual(data.audit.missingImages, ["grbz-139", "grbz-148", "grbz-151", "grbz-155", "grbz-156"]);
for (const r of items) {
  assert.ok(r.name && r.uses.length);
  assert.ok(r.source.tags.includes(81) && r.source.tags.includes(r.category));
  assert.ok(r.image || r.id === 4229);
  for (const row of [r, ...r.fixedRewards, ...r.possibleRewards, ...(r.sale?.rewards ?? [])]) {
    if (row.image) assert.ok(fs.existsSync(new URL(`../public${row.image}`, import.meta.url)), row.image);
    if (row.key) assert.ok(row.amount > 0 && row.name);
  }
}
const find = (id) => items.find((r) => r.id === id);
assert.deepEqual(Object.fromEntries(find(4242).fixedRewards.map((r) => [r.name, r.amount])), {"工程精灵":1500,"战车残骸":90,"秘密计划":90,"演算模块":90,"实验人偶":90,"密码子":20000});
assert.equal(find(4193).fixedRewards.length, 9);
assert.equal(find(4193).fixedRewards.find((r) => r.name === "命运之勋").amount, 2);
assert.equal(find(4193).possibleRewards.length, 0);
assert.equal(find(4123).fixedRewards.length, 0);
assert.ok(find(4123).possibleRewards.length > 1);
assert.ok(find(4427).possibleRewards.length > 1);
for (const id of [4254,4255,4256,4257]) {
  assert.equal(find(id).kind, "解锁凭证");
  assert.deepEqual(find(id).source.consumeRuleIds, []);
  assert.match(find(id).uses[0], /各至少 1 个/);
  assert.match(find(id).uses[0], /另行购买/);
}
assert.equal(find(4313).fixedRewards[0].amount, 10000);
for (const r of items.flatMap((i) => [...i.fixedRewards, ...i.possibleRewards])) {
  if (r.equipmentLevel !== undefined) assert.ok(r.equipmentLevel >= 1 && r.equipmentLevel <= 10);
}
assert.ok(find(4104).source.useRuleIds.length, "Old-style gift box use recipe");
assert.match(find(14).uses.join(" "), /授勋/);
// Warehouse durations must not be replaced with the matching shop offer's duration.
const timed = [
  [200,206,168,/350%/], [201,207,168,/软钢,密水,钛糖\+6\/小时/],
  [202,208,168,/航空煤油\+0\.08\/小时/], [203,211,168,/每级燃油上限\+15/],
  [204,203,168,/燃油恢复\+40\/小时/], [205,214,168,/每级源奶上限\+20/],
  [206,201,168,/源奶恢复\+30\/小时/], [207,209,168,/弹射拖索\+0\.08\/小时/],
  [208,307,120,/达到S胜.*自动战斗/], [209,206,6,/350%/],
  [210,203,12,/燃油恢复\+40\/小时/], [211,201,10,/源奶恢复\+30\/小时/],
  [212,307,48,/达到S胜.*自动战斗/], [213,212,168,/争霸上限\+16次/],
  [214,202,56,/钢舞姬精力恢复\+5\/小时/],
];
assert.equal(items.filter((r) => r.source.timedEffects.length).length, timed.length);
for (const [id,cooldownId,hours,description] of timed) {
  const r = find(id), effects = r.source.timedEffects;
  assert.equal(effects.length, 1);
  assert.equal(effects[0].cooldownId, cooldownId);
  assert.equal(effects[0].durationSeconds, hours*3600);
  assert.ok(effects[0].commodityIds.length && effects[0].descriptionStringId);
  assert.match(r.uses.join(" "), description);
  assert.ok(r.uses[0].includes(`持续${hours}小时`));
  assert.doesNotMatch(r.uses.join(" "), /对应的功能效果|以游戏内使用界面为准/);
  assert.equal(r.fixedRewards.length + r.possibleRewards.length, 0);
}
for (const id of [203,205,213]) assert.match(find(id).uses.join(" "), /到期后扣除超出/);
for (const id of [200,209]) assert.match(find(id).uses.join(" "), /枯竭中辖区占领后同样有效/);
assert.equal(data.audit.saleCount, 127);
const sold = items.filter((r) => r.sale);
assert.equal(sold.length, 127);
assert.equal(sold.filter((r) => r.sale.conditions.length).length, 2);
for (const r of sold) {
  assert.equal(r.sale.quantity, 1);
  assert.ok(r.source.tags.includes(1701));
  assert.equal(r.source.saleRuleIds.length, 1);
  assert.ok(r.source.consumeRuleIds.includes(r.source.saleRuleIds[0]));
  assert.ok(r.source.saleAwardTableIds.length && r.sale.rewards.length);
}
const saleAmounts = (id) => Object.fromEntries(find(id).sale.rewards.map((r) => [r.name, r.amount]));
assert.deepEqual(saleAmounts(4436), {"特战招募卡":4});
for (let id=4428; id<=4443; id++) assert.deepEqual(saleAmounts(id), {"特战招募卡":4});
assert.deepEqual(saleAmounts(17), {"源铁":60});
assert.deepEqual(saleAmounts(4110), {"银币":1500000});
assert.deepEqual(saleAmounts(4112), {"银币":500000});
assert.deepEqual(saleAmounts(4181), {"银币":250000});
assert.deepEqual(saleAmounts(4115), {"空勤调令":5});
assert.deepEqual(saleAmounts(4000), {"密码子":1200});
assert.deepEqual(saleAmounts(4113), {"量子精华":3});
assert.deepEqual(saleAmounts(4425), {"军用罐头":1});
assert.deepEqual(saleAmounts(4426), {"军用罐头":2});
assert.match(find(4110).sale.conditions[0], /18-4.*第1战斗节点达到B评价/);
assert.match(find(4115).sale.conditions[0], /EXPANSION/);
assert.deepEqual(data.audit.saleTagWithoutRecipe, [4138,4140,4141,4392]);
for (const id of data.audit.saleTagWithoutRecipe) {
  assert.equal(find(id).sale, null);
  assert.deepEqual(find(id).source.saleRuleIds, []);
  assert.match(find(id).uses.join(" "), /未找到对应的仓库出售配方/);
}
for (const id of [2,14,4242,4254,4255,4256,4257]) assert.equal(find(id).sale, null);
const exchanges = new Map(data.exchanges.map((e) => [e.id, e]));
assert.equal(exchanges.size, data.exchanges.length);
for (const item of items) {
  assert.equal(new Set(item.exchangeIds).size, item.exchangeIds.length);
  for (const id of item.exchangeIds) {
    const e = exchanges.get(id);
    assert.ok(e && e.costs.some((c) => c.key === `1:${item.id}`));
    assert.ok(item.source.consumeRuleIds.includes(e.source.ruleId));
    assert.ok(!item.source.saleRuleIds.includes(e.source.ruleId));
    assert.ok(!item.source.useRuleIds.includes(e.source.ruleId));
  }
}
const maidens = new Set(JSON.parse(fs.readFileSync(new URL("../public/data/maidens.json", import.meta.url), "utf8")).rows.map((m) => m.id));
for (const e of exchanges.values()) {
  assert.ok(e.name && e.costs.length && e.source.ruleId);
  for (const r of [e, ...e.costs, ...e.rewards]) {
    if (r.image) assert.ok(fs.existsSync(new URL(`../public${r.image}`, import.meta.url)), r.image);
    if (r.key) assert.ok(r.name && r.amount > 0);
    if (r.maidenId) assert.ok(maidens.has(r.maidenId));
  }
}
assert.equal(find(4287).exchangeIds.length, 34);
const shellOffers = find(4287).exchangeIds.map((id) => exchanges.get(id));
assert.equal(shellOffers.filter((e) => e.rewards.some((r) => r.maidenId)).length, 26);
assert.deepEqual(exchanges.get(5429).costs.map((r) => [r.name, r.amount]), [["水晶贝", 80]]);
assert.equal(exchanges.get(5429).rewards[0].maidenId, 9841);
assert.deepEqual(exchanges.get(5441).rewards.map((r) => [r.name, r.amount]), [["破损情报", 2]]);
assert.equal(exchanges.get(5441).costs[0].amount, 1);
assert.equal(exchanges.get(5451).rewards.length, 2);
assert.equal(exchanges.get(5451).costs[0].amount, 9);
assert.equal(exchanges.get(5452).rewards[0].amount, 15000);
assert.equal(exchanges.get(5452).costs[0].amount, 7);
assert.equal(exchanges.get(510).rewards.length, 0, "Unlocks must not invent an inventory reward");
assert.equal(exchanges.get(5004).kind, "随机／条件兑换");
assert.ok(!exchanges.get(5004).rewards.some((r) => r.maidenId), "Random recruitment must not promise particular vehicles");
assert.ok(data.exchanges.some((e) => e.costs.length > 1));
assert.deepEqual(exchanges.get(5171).costs.map((r) => [r.name,r.amount]), [["代金券",20],["时装退返币",100]]);
assert.ok(data.exchanges.some((e) => e.rewards.some((r) => r.outfit && r.maidenId)));
console.log(`Items verified: 413 native records, sales, timed effects and ${exchanges.size} exchange offers.`);
