import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";
import { calculateNodeIncome, fixedCurrencyDrops, sumIncome, visibleIncomeIndices } from "../app/stageIncome.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/stage-catalog.json"), "utf8"));
assert.deepEqual(data.categories.map((c) => c.name), ["战役", "活动", "突袭", "空袭", "信使计划", "多福莱尼"]);
assert.equal(data.categories.find((c) => c.id === "campaign").titleImage, "/art/stages/zj-011.webp", "Native gold campaign title, not gkh-01 grey state");
assert.equal(data.categories.find((c) => c.id === "event").titleImage, "/art/stages/zj-009.webp", "Native gold event title, not gkh-03 grey state");
assert.equal(data.meta.sourceChapters, 515);
assert.equal(Object.keys(data.nodes).length, 1274);
assert.deepEqual(data.meta.unresolvedRewards, {});
assert.deepEqual(data.meta.missingAssets, []);
assert.deepEqual(data.meta.requirements.unresolved, []);
assert.ok(data.meta.requirements.ignoredNoOp > 0);
assert.ok(data.meta.requirements.ignoredRuntimeProgress > 0);
const raid5 = data.maps.find((m) => m.mode === "VOL_EXPANSION_05");
const air5 = data.maps.find((m) => m.mode === "VOL_AIRCRAFT_05");
assert.ok(raid5.requirements.some((r) => r.craftId === 1 && r.value === 75));
assert.ok(raid5.requirements.some((r) => r.questId === 51 && r.value === 4 && r.image.endsWith("kjtx-007.webp")));
assert.ok(raid5.requirements.some((r) => r.text === "全队的演艺才艺总合达到5"));
assert.ok(raid5.requirements.some((r) => r.text === "至少有1名类型为重坦的钢舞姬"));
assert.ok(raid5.requirements.some((r) => r.score === 51 && r.refs.length === 4));
assert.ok(air5.requirements.some((r) => r.questId === 61 && r.value === 4 && r.image.endsWith("kjtx-040.webp")));
assert.ok(data.maps.filter((m) => m.mode === "VOL26").every((m) => m.requirements.some((r) => r.questId === 51 && r.value === 5)), "Include native volume-level admission gates");
assert.ok(data.maps.filter((m) => m.mode === "VOL_SENIOR_09").every((m) => m.requirements.some((r) => r.fundId === 4223)), "Include entry certificate, not just node conditions");
assert.ok(Object.values(data.nodes).every((n) => !n.requirements), "Only export map admission conditions, not node progression");
assert.deepEqual(data.terrains[6].distances, [500, 100, 50]);
assert.deepEqual(data.terrains[55].distances, [8000, 5500, 3000]);
assert.deepEqual(data.terrains[55].altitudes, [5000, 4000, 3000], "Rocky mountains: 3000–5000 m, separate from horizontal distance");
assert.deepEqual(data.terrains[6].altitudes, [350, 200, 120]);
for (const terrain of Object.values(data.terrains)) {
  assert.equal(terrain.altitudes.length, 3);
  assert.equal(terrain.altitudeIcon, "/art/stages/jl-017.webp");
  assert.equal(terrain.distanceIcon, "/art/stages/pvp-012.webp");
  assert.equal(terrain.distances.length, 3);
  assert.ok(terrain.altitudes.every((v) => Number.isFinite(v) && v >= 0));
  assert.equal(terrain.airDistances, undefined, "Do not mislabel altitude as air distance");
}
const story = data.maps.filter((m) => m.group === "主线战役");
assert.equal(story.length, 104);
for (let v = 1; v <= 26; v++) assert.equal(story.filter((m) => m.volume === v).length, 4);
assert.equal(data.maps.filter((m) => m.simulation).length, 100);
for (const mode of ["VOL_SPECIAL", "VOL_FARM"]) {
  const maps = data.maps.filter((m) => m.mode === mode);
  assert.deepEqual(maps.map((m) => m.code), maps.map((_, i) => String(i + 1)), mode);
}
const resourceMaps = data.maps.filter((m) => m.group === "资源行动");
assert.equal(resourceMaps.length, 42);
assert.deepEqual([...new Set(resourceMaps.map((m) => m.outputGroup))], ["战车残骸", "秘密计划", "演算模块", "实验人偶", "经验道具", "源铁", "军牌"]);
for (const name of ["里尔矿区", "敦刻尔克", "冬日攻势"]) assert.equal(data.maps.find((m) => m.name === name).outputGroup, "秘密计划");
const challengeGroups = { "战力评估": 5, "宏图危机": 3, "战队竞技": 20, "绝命蛛丝": 5, "探雷行动": 4, "源铝争夺": 8 };
const challengeMaps = data.maps.filter((m) => m.group === "挑战行动");
assert.equal(challengeMaps.length, 45);
for (const [name, count] of Object.entries(challengeGroups)) assert.equal(challengeMaps.filter((m) => m.challengeGroup === name).length, count, name);
for (const name of ["雪山寻踪", "突变的幼虫"]) assert.equal(data.maps.find((m) => m.name === name).challengeGroup, "绝命蛛丝");
for (const name of ["虫灾", "巨像"]) assert.equal(data.maps.find((m) => m.name === name).challengeGroup, "源铝争夺");
assert.ok(data.maps.filter((m) => m.mode === "VOL_LUCKY_AL").every((m) => m.group === "挑战行动" && !m.outputGroup), "Source aluminium belongs to challenge, not resource/source iron actions");
assert.ok(!data.maps.some((m) => ["特殊补给", "挑战任务"].includes(m.group)));
for (const [mode, id, amount] of [["VOL_SPECIAL", 4, 56], ["VOL_EXPANSION_03", 16, 1], ["VOL_AIRCRAFT_03", 406, 1], ["VOL_PRISON_01", 4186, 1], ["VOL_PRISON_20", 4186, 3]]) {
  const map = data.maps.find((m) => m.mode === mode);
  assert.deepEqual(map.entryCosts.map((c) => [c.fundId, c.amount]), [[id, amount]], mode);
}
assert.equal(data.maps.filter((m) => m.entryCosts.some((c) => c.fundId === 4167 && c.amount === 1)).length, 4, "Military map tickets");
assert.ok(data.maps.some((m) => m.entryCosts.filter((c) => c.fundId >= 48001 && c.fundId <= 48023).length === 3), "Multiple entry materials are retained");
const first244 = data.nodes[data.maps.find((m) => m.code === "24-4").nodes[0]];
assert.deepEqual(first244.drops.slice().sort(), ["fund:8367", "fund:8317", "fund:39411", "fund:39271", "fund:39421", "fund:3203"].sort(), "24-4 first node matches the six in-game preview drops");
assert.equal(data.rewards["fund:8367"].slotName, "炮架");
assert.equal(data.rewards["fund:8317"].slotName, "炮架");
assert.ok(Object.values(data.rewards).every((r) => r.kind !== "钢舞姬" && !r.id.startsWith("card:")), "No direct recruits or experience capsules");
assert.ok(!data.rewards["fund:1"] && !data.rewards["fund:2"], "Hide settlement currency as the native preview does");
for (const reward of Object.values(data.rewards)) if (reward.kind === "装备") assert.ok(reward.slotName && reward.slotIcon, reward.name);
assert.equal(new Set(data.maps.flatMap((m) => m.nodes)).size, 1274, "All source nodes, including explicit appendix");
for (const m of data.maps) for (const id of m.nodes) assert.ok(data.nodes[id]);
const images = new Set();
for (const map of data.maps) {
  assert.ok(Array.isArray(map.entryCosts));
  for (const cost of map.entryCosts) {
    assert.ok(cost.name && cost.image && cost.amount > 0);
    assert.equal(cost.rawAmount, cost.amount * cost.displayDivisor);
    assert.equal(cost.displayDivisor, [16, 406].includes(cost.fundId) ? 100 : 1);
    assert.ok(cost.fundId < 100000, "Cooldown ids must never be exported as materials");
    images.add(cost.image);
  }
  assert.ok(Array.isArray(map.requirements));
  assert.equal(new Set(map.requirements.map((r) => r.key)).size, map.requirements.length, map.name);
  for (const requirement of map.requirements) {
    assert.ok(requirement.text && !/<[^>]*>/.test(requirement.text), map.name);
    assert.ok(!["continuation", "state"].includes(requirement.kind), map.name);
    if (requirement.image) images.add(requirement.image);
    for (const part of requirement.parts ?? []) if (part.image) images.add(part.image);
    for (const ref of requirement.refs ?? []) assert.ok(data.maps.find((m) => m.id === ref.mapId)?.nodes.includes(ref.nodeId));
  }
}
const outfits = Object.values(data.rewards).filter((reward) => reward.kind === "舞装");
assert.ok(outfits.length > 0);
for (const reward of Object.values(data.rewards)) {
  if (reward.kind !== "舞装") { assert.equal(reward.outfit, undefined); continue; }
  assert.ok(reward.outfit.capsuleId > 0 && reward.outfit.headImage, reward.name);
  assert.ok([...reward.outfit.baseSize, ...reward.outfit.headSize].every((n) => n > 0 && Number.isFinite(n)), reward.name);
  images.add(reward.outfit.headImage);
}
for (const [fund, capsule, head] of [[39411, 6411, "ftx-103"], [39271, 6271, "ftx-104"], [39421, 6421, "ftx-129"]]) {
  assert.equal(data.rewards[`fund:${fund}`].outfit.capsuleId, capsule);
  assert.equal(data.rewards[`fund:${fund}`].outfit.headImage, `/art/stages/${head}.webp`);
}
for (const terrain of Object.values(data.terrains)) for (const effect of terrain.effects) {
  assert.ok(effect.image, `${terrain.name}: ${effect.name} missing native icon`);
  assert.ok(["ENV", "ANTI"].includes(effect.iconSource));
  images.add(effect.image);
}
assert.deepEqual(data.terrains[first244.fieldId].effects.map((e) => e.image), ["/art/stages/dxtz-004.webp", "/art/stages/dxtz-008.webp", "/art/stages/dxtz-009.webp"]);
for (const n of Object.values(data.nodes)) {
  assert.ok(data.terrains[n.fieldId]);
  assert.ok(n.enemies.length);
  for (const p of n.enemies) { const e = data.enemies[p.id]; assert.ok(e.image && e.name && Number.isFinite(e.level)); }
  for (const id of n.drops) assert.ok(data.rewards[id]);
}
for (const row of [...data.categories, ...data.maps, ...Object.values(data.enemies), ...Object.values(data.terrains), ...Object.values(data.rewards)]) {
  for (const field of ["image", "classIcon", "titleImage", "slotIcon", "altitudeIcon", "distanceIcon"]) if (row[field]) images.add(row[field]);
}
for (const image of images) {
  const info = await sharp(path.join(root, "public", image)).metadata();
  assert.ok(info.width > 0 && info.height > 0, image);
}
assert.ok(Object.values(data.enemies).some((e) => e.name === "？？？"));
assert.ok(Object.keys(data.rewards).every((key) => /^fund:/.test(key)), "Never treat cooldowns, progress updates or capsules as item drops");

const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse().map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
await fs.mkdir(path.join(root, ".cache"), { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(process.argv[2] || "http://127.0.0.1:3100", { waitUntil: "networkidle" });
  assert.equal(requests.some((r) => r.includes("stage-catalog.json")), false, "Lazy-load data only on entering stages");
  await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
  await page.getByRole("menuitem", { name: /^关卡一览/ }).click();
  await page.locator(".stage-category").first().waitFor();
  assert.equal(await page.locator(".stage-category").count(), 6);
  assert.equal(await page.locator(".control-panel").count(), 0, "No maiden filters in stage section");
  await page.locator(".stage-category img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  for (const width of [1440, 1152, 760, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const boxes = await page.locator(".stage-category-grid").evaluate((grid) => {
      const rect = (id) => { const r = grid.querySelector(`.stage-category-${id}`).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      return { messenger: rect("messenger"), campaign: rect("campaign"), event: rect("event"), fits: grid.scrollWidth <= grid.clientWidth + 1 };
    });
    assert.ok(boxes.fits, `Category grid fits at ${width}px`);
    assert.ok(boxes.messenger.bottom < boxes.campaign.top && Math.abs(boxes.messenger.left - boxes.campaign.left) < 1, `Messenger above campaign at ${width}px`);
    assert.ok(boxes.event.left > boxes.messenger.right && Math.abs(boxes.event.top - boxes.messenger.top) < 1 && Math.abs(boxes.event.bottom - boxes.campaign.bottom) < 1, `Event spans both rows on the right at ${width}px`);
    for (const [id, code] of [["campaign", "zj-011"], ["event", "zj-009"]]) {
      assert.equal(await page.locator(`.stage-category-${id} .stage-category-title`).getAttribute("src"), `/art/stages/${code}.webp`);
    }
    await page.locator(".stage-category-grid").screenshot({ path: path.join(root, `.cache/stages-category-order-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".stage-archive").screenshot({ path: path.join(root, ".cache/stages-home.png") });
  for (const category of data.categories) {
    await page.getByRole("button", { name: `浏览${category.name}`, exact: true }).click();
    assert.ok(await page.locator(".stage-map-card").count() > 0, category.name);
    await page.locator(".stage-map-card").first().click();
    const dialog = page.locator(".stage-dialog");
    assert.equal(await dialog.evaluate((el) => el.matches(":modal")), true);
    const hideProgress = ["assault", "air", "messenger", "event"].includes(category.id);
    assert.equal(await dialog.getByLabel("收益通关进度").count(), hideProgress ? 0 : 1, `${category.name}: only hide progress for the four requested categories`);
    assert.equal(await dialog.getByLabel("收益结算评价").count(), 1, `${category.name}: keep the score control`);
    const globalControls = page.locator(".stage-global-income");
    const progress = await globalControls.getByLabel("收益通关进度").inputValue();
    const score = await dialog.getByLabel("收益结算评价").inputValue();
    await dialog.getByLabel("收益结算评价").selectOption("51");
    assert.equal(await globalControls.getByLabel("收益通关进度").inputValue(), progress, "Changing evaluation must preserve saved campaign progress");
    await dialog.getByLabel("收益结算评价").selectOption(score);
    if (hideProgress) assert.ok(!(await dialog.innerText()).includes("按所选进度"), "Do not describe unrelated campaign progress in income/drop notes");
    assert.ok(await dialog.locator(".stage-enemy").count() > 0);
    assert.match(await dialog.locator(".stage-distance").innerText(), /作战距离.*\d+ → \d+ → \d+/s);
    assert.match(await dialog.locator(".stage-altitude").innerText(), /作战高度.*\d+ → \d+ → \d+/s);
    assert.equal(await dialog.locator(".stage-distance img").getAttribute("src"), "/art/stages/pvp-012.webp");
    assert.equal(await dialog.locator(".stage-altitude img").getAttribute("src"), "/art/stages/jl-017.webp");
    await dialog.locator(".stage-enemy img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    if (category.id === "campaign") {
      const original = await dialog.locator(".stage-source-note").innerText();
      const originalRequirements = await dialog.locator(".stage-entry-requirements").innerText();
      await dialog.getByRole("button", { name: "下一个战斗节点", exact: true }).click();
      assert.notEqual(await dialog.locator(".stage-source-note").innerText(), original);
      assert.equal(await dialog.locator(".stage-entry-requirements").innerText(), originalRequirements, "Map requirements do not change with battle nodes");
    }
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);
    if (category.id === "prison") {
      await page.getByRole("button", { name: "模拟关卡", exact: true }).click();
      assert.equal(await page.locator(".stage-map-card").count(), 20);
    }
    if (["assault", "air"].includes(category.id)) {
      assert.equal(await page.getByRole("button", { name: "模拟关卡", exact: true }).count(), 0);
      assert.equal(await page.locator(".stage-map-card").count(), 40);
      assert.equal(await page.locator(".stage-map-card .stage-map-drops").count(), 40);
      assert.equal(await page.locator(".stage-map-card .stage-income-values img[alt='指挥官经验']").count(), 0);
      assert.equal(await page.locator(".stage-map-card .stage-map-income").count(), 0, "Currencies merge into loot; omit the empty income footer");
      assert.ok(!(await page.locator(".stage-archive").innerText()).includes("服务器结算"), "No XP placeholder either");
      assert.ok(!(await page.locator(".stage-archive").innerText()).includes("10,600"), "Do not publish an observation as a configured reward");
    }
    await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  }
  await page.getByRole("button", { name: "浏览战役", exact: true }).click();
  for (const group of ["特殊任务", "战役捷径"]) {
    await page.getByRole("button", { name: group, exact: true }).click();
    const names = await page.locator(".stage-map-caption>strong").allTextContents();
    names.forEach((name, i) => assert.ok(name.startsWith(`${i + 1} · `), name));
    await page.locator(".stage-map-card").first().click();
    assert.match(await page.locator("#stage-detail-title").innerText(), /^1 · /);
    assert.match(await page.locator(".stage-entry-requirements>.stage-entry-costs").innerText(), /燃油/);
    assert.equal(await page.locator(".stage-dialog-content>.stage-entry-costs").count(), 0, "Entry costs share the requirements card");
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  await page.getByRole("button", { name: "浏览活动", exact: true }).click();
  assert.equal(await page.getByLabel("行动类型").inputValue(), "资源行动");
  assert.equal(await page.locator(".stage-map-section>h2").count(), 7);
  assert.equal(await page.locator(".stage-map-card").count(), 42);
  await page.getByRole("button", { name: "秘密计划", exact: true }).click();
  assert.equal(await page.locator(".stage-map-card").count(), 6);
  assert.equal(await page.locator(".stage-map-section>h2").innerText(), "秘密计划");
  for (const name of ["里尔矿区", "敦刻尔克", "冬日攻势"]) assert.equal(await page.getByRole("button", { name: `查看地图 ${name}`, exact: true }).count(), 1);
  await page.locator(".stage-archive").screenshot({ path: path.join(root, ".cache/stages-resource-actions.png") });
  await page.getByLabel("行动类型").selectOption("挑战行动");
  assert.equal(await page.locator(".stage-map-card").count(), 45, "Changing action resets the output filter");
  assert.deepEqual(await page.locator(".stage-map-section>h2").allTextContents(), Object.keys(challengeGroups));
  assert.equal(await page.getByRole("navigation", { name: "产出分组" }).count(), 0);
  for (const [name, count] of Object.entries(challengeGroups)) {
    await page.getByRole("navigation", { name: "挑战分组" }).getByRole("button", { name, exact: true }).click();
    assert.equal(await page.locator(".stage-map-card").count(), count, name);
    assert.equal(await page.locator(".stage-map-section>h2").innerText(), name);
  }
  await page.getByRole("button", { name: "绝命蛛丝", exact: true }).click();
  for (const name of ["雪山寻踪", "突变的幼虫"]) assert.equal(await page.getByRole("button", { name: `查看地图 ${name}`, exact: true }).count(), 1);
  await page.locator(".stage-archive").screenshot({ path: path.join(root, ".cache/stages-challenge-actions.png") });
  await page.getByRole("button", { name: "查看地图 雪山寻踪", exact: true }).click();
  assert.match(await page.locator(".stage-dialog-header p").innerText(), /挑战行动 \/ 绝命蛛丝/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "源铝争夺", exact: true }).click();
  for (const name of ["虫灾", "巨像"]) assert.equal(await page.getByRole("button", { name: `查看地图 ${name}`, exact: true }).count(), 1);
  await page.getByLabel("行动类型").selectOption("资源行动");
  assert.equal(await page.locator(".stage-map-card").count(), 42, "Challenge filter resets on switching to resource actions");
  await page.getByLabel("行动类型").selectOption("全部");
  await page.getByLabel("搜索关卡").fill("绝命蛛丝");
  assert.equal(await page.locator(".stage-map-card").count(), 5, "Native subgroup titles are searchable");
  // Every activity card and sampled multi-node details obey the same zero-XP policy.
  const activityIncome = (map, score) => sumIncome(map.nodes.map((id) => calculateNodeIncome(data.nodes[id].income, data.income, { progress: 0, score })));
  const activities = data.maps.filter((m) => m.category === "event");
  const samples = [activities.find((m) => activityIncome(m, 92).amount.every((v) => v === 0)), activities.find((m) => activityIncome(m, 92).amount[0] === 0 && activityIncome(m, 92).amount.some(Boolean)), activities.find((m) => activityIncome(m, 92).amount[0] > 0)].filter(Boolean);
  assert.ok(samples.length >= 2, "Cover empty income and positive currency/XP activity maps");
  for (const map of samples) {
    await page.getByLabel("搜索关卡").fill(map.name);
    const card = page.getByRole("button", { name: `查看地图 ${map.name}`, exact: true });
    for (const score of [51, 92]) {
      await page.locator('.stage-global-income').getByLabel('收益结算评价').selectOption(String(score));
      const expected = visibleIncomeIndices(activityIncome(map, score), false, true).map((i) => data.income.resources[i].key);
      assert.deepEqual(await card.locator('[data-resource]').evaluateAll((els) => els.map((el) => el.dataset.resource)), expected);
      assert.equal(await card.locator('.stage-map-income').count(), Number(expected.length > 0));
      await card.click();
      const panel = page.locator('.stage-income-panel');
      assert.equal(await panel.count(), Number(expected.length > 0));
      assert.deepEqual(await panel.locator('[data-resource]').evaluateAll((els) => els.map((el) => el.dataset.resource)), expected);
      if (map.nodes.length > 1) for (const [index, id] of map.nodes.entries()) {
        await page.locator('.stage-node-nav button').nth(index).click();
        const result = calculateNodeIncome(data.nodes[id].income, data.income, { progress: 0, score });
        const fields = visibleIncomeIndices(result, false, true).map((i) => data.income.resources[i].key);
        assert.equal(await page.locator('.stage-node-income').count(), Number(fields.length > 0));
        assert.deepEqual(await page.locator('.stage-node-income [data-resource]').evaluateAll((els) => els.map((el) => el.dataset.resource)), fields);
      }
      await page.keyboard.press('Escape');
    }
  }
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  for (const [name, mode, material] of [["突袭", "VOL_EXPANSION_03", "航空煤油"], ["空袭", "VOL_AIRCRAFT_03", "弹射拖索"]]) {
    await page.getByRole("button", { name: `浏览${name}`, exact: true }).click();
    const map = data.maps.find((m) => m.mode === mode);
    const card = page.getByRole("button", { name: `查看地图 ${map.name}`, exact: true });
    assert.equal(await card.locator(".stage-map-topline .stage-entry-costs img").getAttribute("alt"), material);
    assert.equal(await card.locator(".stage-entry-costs b").innerText(), "1");
    assert.equal(await card.locator(":scope>.stage-entry-costs").count(), 0, "No separate cost row");
    const expected = [...new Set(map.nodes.flatMap((id) => data.nodes[id].drops))].map((id) => data.rewards[id].name);
    assert.deepEqual(await card.locator(".stage-map-drop-grid>span>span").allTextContents(), expected);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1152, height: 640 }, { width: 390, height: 640 }]) {
      await page.setViewportSize(viewport);
      await card.scrollIntoViewIfNeeded();
      await card.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
      const sizes = await card.evaluate((el) => ({ width: el.clientWidth, full: el.scrollWidth }));
      assert.ok(sizes.full <= sizes.width + 1, `Map card fits ${viewport.width}px: ${JSON.stringify(sizes)}`);
      const positions = await card.evaluate((el) => {
        const art = el.querySelector('.stage-map-art').getBoundingClientRect();
        const cost = el.querySelector('.stage-entry-costs').getBoundingClientRect();
        const badge = el.querySelector('.stage-map-code').getBoundingClientRect();
        return { inside: cost.right <= art.right && cost.top >= art.top && cost.bottom <= art.bottom, top: cost.top - art.top, right: art.right - cost.right, separate: badge.right <= cost.left };
      });
      assert.ok(positions.inside && positions.top <= 10 && positions.right <= 10 && positions.separate, JSON.stringify(positions));
      await card.screenshot({ path: path.join(root, `.cache/stages-card-${map.category}-${viewport.width}.png`) });
    }
    await card.click();
    const detail = page.locator(".stage-dialog");
    assert.match(await detail.locator(".stage-entry-costs").innerText(), new RegExp(material));
    assert.equal(await detail.locator(".stage-income-values").count(), 0);
    assert.equal(await detail.locator(".stage-income-panel").count(), 0);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  }
  for (const [categoryName, map, expected] of [["突袭", raid5, /鹰标总和 ≥ 4/], ["空袭", air5, /金桨总和 ≥ 4/]]) {
    await page.getByRole("button", { name: `浏览${categoryName}`, exact: true }).click();
    const card = page.getByRole("button", { name: `查看地图 ${map.name}`, exact: true });
    const currencyDrops = fixedCurrencyDrops(map.nodes.map((id) => data.nodes[id].income), data.income, { progress: 0, score: 92 });
    assert.equal(await card.locator('[data-reward^="income:"]').count(), currencyDrops.length);
    for (const drop of currencyDrops) {
      const entry = card.locator(`[data-reward="income:${data.income.resources[drop.index].key}"]`);
      assert.match(await entry.innerText(), new RegExp(`×${drop.amount.toLocaleString()}`));
    }
    if (categoryName === "突袭") assert.match(await card.locator('[data-reward="income:codons"]').innerText(), /密码子 ×2,500/);
    await card.scrollIntoViewIfNeeded();
    await card.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    await card.screenshot({ path: path.join(root, `.cache/stages-compact-${map.category}-5.png`) });
    await card.click();
    const mergedDrops = page.locator('.stage-dialog .stage-drops [data-reward^="income:"]');
    assert.equal(await mergedDrops.count(), currencyDrops.length, "Show currency once in detail loot, not again in income");
    assert.equal(await page.locator('.stage-dialog .stage-income-panel').count(), 0);
    for (const score of ["51", "70", "92"]) {
      await page.locator('.stage-dialog').getByLabel('收益结算评价').selectOption(score);
      const calculated = fixedCurrencyDrops(map.nodes.map((id) => data.nodes[id].income), data.income, { progress: 0, score: Number(score) });
      for (const drop of calculated) {
        const entry = page.locator(`.stage-dialog [data-reward="income:${data.income.resources[drop.index].key}"]`);
        assert.match(await entry.locator('strong').innerText(), new RegExp(`×${drop.amount.toLocaleString()}`));
        assert.equal(await entry.locator('.stage-drop-grades').getAttribute('data-eligible'), String(drop.ranges.some(([lo, hi]) => lo <= Number(score) && Number(score) <= hi)));
      }
    }
    const requirements = page.getByRole("region", { name: "进入条件", exact: true });
    assert.match(await requirements.innerText(), expected);
    if (categoryName === "突袭") {
      assert.match(await requirements.innerText(), /演艺.*才艺总合达到5/s);
      assert.match(await requirements.innerText(), /至少有1名类型为重坦/s);
    }
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1152, height: 640 }, { width: 390, height: 640 }]) {
      await page.setViewportSize(viewport);
      await requirements.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
      const box = await requirements.evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(box.scroll <= box.width + 1, `Requirements fit ${viewport.width}px`);
      for (const selector of ['.stage-distance', '.stage-altitude']) {
        const range = page.locator(selector);
        const field = selector === '.stage-distance' ? 'distances' : 'altitudes';
        assert.equal(await range.locator('strong').innerText(), `${data.terrains[data.nodes[map.nodes[0]].fieldId][field].join(' → ')} m`);
        const fits = await range.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
        assert.ok(fits, `${selector} stage values fit ${viewport.width}px`);
      }
      await page.locator(".stage-dialog").screenshot({ path: path.join(root, `.cache/stages-entry-${map.category}-${viewport.width}.png`) });
      await page.locator(".stage-source-note").scrollIntoViewIfNeeded();
      await requirements.scrollIntoViewIfNeeded();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  }
  const rockyMap = data.maps.find((m) => data.categories.some((c) => c.id === m.category) && !m.simulation && m.nodes.some((id) => data.nodes[id].fieldId === 55));
  assert.ok(rockyMap, "Exercise long four-digit distance and height sequences");
  await page.getByRole("button", { name: `浏览${data.categories.find((c) => c.id === rockyMap.category).name}`, exact: true }).click();
  if (rockyMap.category === 'campaign') await page.getByRole('button', { name: rockyMap.group, exact: true }).click();
  if (rockyMap.category === 'event') await page.getByLabel('行动类型').selectOption('全部');
  await page.getByLabel('搜索关卡').fill(rockyMap.name);
  await page.getByRole("button", { name: `查看地图 ${rockyMap.name}`, exact: true }).click();
  await page.locator('.stage-node-nav button').nth(rockyMap.nodes.findIndex((id) => data.nodes[id].fieldId === 55)).click();
  for (const width of [1440, 1152, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const terrain = page.locator('.stage-terrain-panel');
    await terrain.scrollIntoViewIfNeeded();
    await terrain.locator('img').evaluateAll((els) => Promise.all(els.map((el) => el.decode())));
    assert.equal(await terrain.locator('.stage-distance strong').innerText(), '8000 → 5500 → 3000 m');
    assert.equal(await terrain.locator('.stage-altitude strong').innerText(), '5000 → 4000 → 3000 m');
    for (const selector of ['.stage-distance', '.stage-altitude']) {
      const fits = await terrain.locator(selector).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const icon = el.querySelector('img').getBoundingClientRect();
        const value = el.querySelector('strong').getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth + 1 && icon.right < value.left && value.right <= box.right;
      });
      assert.ok(fits, `Rocky mountain ${selector} fits without overlap at ${width}px`);
    }
    await terrain.screenshot({ path: path.join(root, `.cache/stages-terrain-phases-${width}.png`) });
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  const multiCost = data.maps.find((m) => m.category === "event" && m.entryCosts.length >= 3);
  assert.ok(multiCost);
  await page.getByRole("button", { name: "浏览活动", exact: true }).click();
  await page.getByLabel("行动类型").selectOption("全部");
  await page.getByLabel("搜索关卡").fill(multiCost.name);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const card = page.getByRole("button", { name: `查看地图 ${multiCost.name}`, exact: true });
    assert.equal(await card.locator('.stage-entry-costs img').count(), multiCost.entryCosts.length);
    const fits = await card.evaluate((el) => {
      const art = el.querySelector('.stage-map-art').getBoundingClientRect();
      const badge = el.querySelector('.stage-map-code').getBoundingClientRect();
      return [...el.querySelectorAll('.stage-entry-costs>span')].every((item) => {
        const b = item.getBoundingClientRect();
        return b.left >= badge.right && b.right <= art.right && b.top >= art.top && b.bottom <= art.bottom;
      });
    });
    assert.ok(fits, `All ticket icons fit the corner without overlap at ${width}px`);
    await card.locator("img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    await card.screenshot({ path: path.join(root, `.cache/stages-multiple-costs-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  await page.getByRole("button", { name: "浏览战役", exact: true }).click();
  assert.equal(await page.locator(".stage-volumes button").count(), 27);
  await page.getByRole("button", { name: "第 24 卷", exact: true }).click();
  await page.getByRole("button", { name: "查看地图 终结与开始", exact: true }).click();
  assert.equal(await page.locator(".stage-drops article").count(), 6);
  assert.equal(await page.locator(".stage-drops article[data-kind='装备'] .stage-drop-slot").allTextContents().then((v) => v.join(",")), "炮架,炮架");
  assert.ok((await page.locator(".stage-battle-grid").boundingBox()).height < 360, "Compact battle overview including node income and 48px terrain effect icons");
  assert.equal(await page.locator(".stage-effects img").count(), 3, "Every terrain effect displays its native icon");
  assert.equal(await page.locator(".stage-outfit-icon").count(), 3);
  assert.equal(await page.locator(".stage-outfit-icon image").count(), 6, "Each outfit includes suitcase and square portrait");
  await page.locator(".stage-outfit-icon image").evaluateAll((images) => Promise.all(images.map((el) => { const image = new Image(); image.src = el.getAttribute("href"); return image.decode(); })));
  await page.locator(".stage-dialog img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.locator(".stage-dialog").screenshot({ path: path.join(root, ".cache/stages-24-4-drops.png") });
  const dialogSize = await page.locator(".stage-dialog").evaluate((el) => ({ height: el.getBoundingClientRect().height, bottomSpace: el.getBoundingClientRect().bottom - el.querySelector(".stage-source-note").getBoundingClientRect().bottom }));
  assert.ok(dialogSize.height <= 964 && dialogSize.bottomSpace <= 20, `Map requirements plus node detail fit the viewport without blank space: ${JSON.stringify(dialogSize)}`);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const effects = page.locator('.stage-effects');
    const effectRows = await effects.locator(':scope>div').evaluateAll((rows) => rows.map((row) => {
      const icon = row.querySelector('img').getBoundingClientRect();
      const label = row.querySelector('b').getBoundingClientRect();
      const text = row.querySelector('p').getBoundingClientRect();
      return { icon: icon.width, separate: label.right <= text.left, fits: row.scrollWidth <= row.clientWidth + 1 };
    }));
    assert.ok(effectRows.every((row) => row.icon === (width === 390 ? 40 : 48) && row.separate && row.fits), JSON.stringify(effectRows));
    await effects.screenshot({ path: path.join(root, `.cache/stages-large-debuffs-${width}.png`) });
    const icons = await page.locator(".stage-outfit-icon").evaluateAll((elements) => elements.map((el) => {
      const box = el.getBoundingClientRect(); const head = el.querySelector(".stage-outfit-portrait").getBoundingClientRect();
      return { width: box.width, height: box.height, inside: head.left >= box.left && head.right <= box.right && head.top >= box.top && head.bottom <= box.bottom };
    }));
    assert.ok(icons.every((icon) => icon.width === (width === 390 ? 30 : 37) && icon.height === icon.width && icon.inside), JSON.stringify(icons));
    await page.locator(".stage-drops").screenshot({ path: path.join(root, `.cache/stages-outfits-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "第 26 卷", exact: true }).click();
  assert.equal(await page.locator(".stage-map-card").count(), 4);
  await page.locator(".stage-archive").screenshot({ path: path.join(root, ".cache/stages-volume26.png") });
  await page.getByRole("button", { name: "特殊任务", exact: true }).click();
  assert.equal(await page.locator(".stage-map-card").count(), 24);
  await page.getByRole("button", { name: "查看地图 哈尔科夫", exact: true }).click();
  assert.match(await page.locator(".stage-distance").innerText(), /500 → 100 → 50/);
  await page.locator(".stage-dialog img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.locator(".stage-dialog").screenshot({ path: path.join(root, ".cache/stages-node-desktop.png") });
  for (const viewport of [{ width: 1152, height: 640 }, { width: 390, height: 640 }]) {
    await page.setViewportSize(viewport);
    const box = await page.locator(".stage-dialog-content").evaluate((el) => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight, overflow: getComputedStyle(el).overflowY }));
    assert.ok(box.scrollWidth <= box.width + 1, "No horizontal overflow in narrow dialog");
    assert.equal(box.overflow, "auto");
    if (viewport.width === 390) assert.ok(box.scrollHeight > box.height, "Long content must scroll");
    await page.locator(".stage-source-note").scrollIntoViewIfNeeded();
    await page.locator(".stage-dialog").screenshot({ path: path.join(root, `.cache/stages-node-${viewport.width}.png`) });
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "战役捷径", exact: true }).click();
  assert.equal(await page.locator(".stage-map-card").count(), 28);
  await page.getByRole("searchbox", { name: "搜索关卡" }).fill("no-such-stage");
  assert.equal(await page.locator(".stage-map-card").count(), 0);
  await page.getByRole("button", { name: "清除搜索及卷数" }).click();
  assert.equal(await page.locator(".stage-map-card").count(), 28);
  await page.getByRole("button", { name: "返回关卡分类", exact: false }).click();
  const mobileWidth = await page.locator(".stage-archive").evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  assert.ok(mobileWidth.scroll <= mobileWidth.width + 1);
  await page.locator(".stage-archive").screenshot({ path: path.join(root, ".cache/stages-home-mobile.png") });
  assert.equal(requests.filter((r) => r.includes("stage-catalog.json")).length, 1, "Only one catalog request");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, maps: data.maps.length, nodes: Object.keys(data.nodes).length, outfits: outfits.length, images: images.size, tests: "Six categories, 26 volumes, map/node navigation, outfit portraits, simulation, search, focus, scroll, responsive, lazy loading" }, null, 2));
} finally { await browser.close(); }
