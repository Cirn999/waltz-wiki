import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const browserRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(browserRoot, "..");

async function loadCatalog(version) {
  const dir = path.join(workspaceRoot, "analysis_apk", "output", version);
  for (const name of await fs.readdir(dir)) {
    if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
    const value = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
    if (Array.isArray(value.rows) && value.rows.length > 700) return value;
  }
  throw new Error(`未找到 ${version} 汇总数据`);
}

const [before, after, publicData, research, technology] = await Promise.all([
  loadCatalog("steel_maiden_catalog_v3"),
  loadCatalog("steel_maiden_catalog_v4"),
  fs.readFile(path.join(browserRoot, "public", "data", "maidens.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(browserRoot, "public", "data", "research-tree.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(browserRoot, "public", "data", "technology-catalog.json"), "utf8").then(JSON.parse),
]);

const beforeById = new Map(before.rows.map((row) => [row["钢舞姬卡牌ID"], row]));
const publicById = new Map(publicData.rows.map((row) => [row.id, row]));
const statLabels = ["耐久", "火力", "穿甲", "命中", "装甲", "回避", "隐蔽", "侦查"];

function resolveRow(query, rows = after.rows) {
  const row = rows.find((item) => item["坦克/载具名称"] === query || item["对应人名"] === query)
    ?? rows.find((item) => item["坦克/载具名称"].includes(query) || item["对应人名"].includes(query));
  if (!row) throw new Error(`找不到公告对象：${query}`);
  return row;
}

function statDiff(query) {
  const current = resolveRow(query);
  const previous = beforeById.get(current["钢舞姬卡牌ID"]);
  const levels = [1].map((level) => ({
    level,
    changes: Object.fromEntries(statLabels.flatMap((label) => {
      const key = `${level}级_${label}`;
      const oldValue = previous?.[key];
      const newValue = current[key];
      return oldValue === newValue ? [] : [[label, { before: oldValue, after: newValue, delta: newValue - oldValue }]];
    })),
  })).filter((entry) => Object.keys(entry.changes).length);
  return { id: current["钢舞姬卡牌ID"], tank: current["坦克/载具名称"], person: current["对应人名"], levels };
}

function ammoNames(row) {
  const value = row?.["全部阶段弹药"] ?? row?.["最高阶段弹药"] ?? [];
  const items = Array.isArray(value) ? value : [];
  return [...new Set(items.map((item) => typeof item === "string" ? item : item?.name ?? item?.名称).filter(Boolean))];
}

function ammoDetailNames(row) {
  return String(row?.["弹药工艺明细"] ?? "").split("；").map((name) => name.trim()).filter(Boolean);
}

function ammoDiff(query) {
  const current = resolveRow(query);
  const previous = beforeById.get(current["钢舞姬卡牌ID"]);
  const beforeNames = ammoNames(previous);
  const afterNames = ammoNames(current);
  const beforeDetails = ammoDetailNames(previous);
  const afterDetails = ammoDetailNames(current);
  return {
    id: current["钢舞姬卡牌ID"], tank: current["坦克/载具名称"], person: current["对应人名"],
    typesBefore: previous?.["可使用弹药类型"],
    typesAfter: current["可使用弹药类型"],
    addedDetails: afterDetails.filter((name) => !beforeDetails.includes(name)),
    removedDetails: beforeDetails.filter((name) => !afterDetails.includes(name)),
    highestStageAdded: afterNames.filter((name) => !beforeNames.includes(name)),
  };
}

function collectCraftNames(catalog) {
  const names = new Map();
  for (const row of catalog.rows) {
    for (const key of ["全部引擎工艺", "全部车体工艺", "全部装甲工艺"]) {
      for (const craft of Array.isArray(row[key]) ? row[key] : []) {
        const name = craft?.name ?? craft?.名称;
        if (name) names.set(name, (names.get(name) ?? 0) + 1);
      }
    }
  }
  return names;
}

function collectCraftNamesFor(catalog, key) {
  return new Set(catalog.rows.flatMap((row) => (Array.isArray(row[key]) ? row[key] : []))
    .map((craft) => craft?.name ?? craft?.名称).filter(Boolean));
}

const oldCraftNames = collectCraftNames(before);
const newCraftNames = collectCraftNames(after);
const craftMatches = [...new Set([...oldCraftNames.keys(), ...newCraftNames.keys()])]
  .filter((name) => /90mm|M41|美T式/.test(name))
  .map((name) => ({ name, beforeOccurrences: oldCraftNames.get(name) ?? 0, afterOccurrences: newCraftNames.get(name) ?? 0 }));

const m41ConfigRows = JSON.parse(execFileSync(process.env.PYTHON || "python", [
  "-X", "utf8", path.join(workspaceRoot, "analysis_apk", "tools", "search_config_strings.py"), "M41型90mm坦克炮",
], { cwd: workspaceRoot, encoding: "utf8", windowsHide: true }));
const m41Ammunition = [...new Set(m41ConfigRows.flatMap((row) => row.texts)
  .filter((text) => text.includes("|") && text.endsWith("|M41型90mm坦克炮"))
  .map((text) => text.split("|")[1]))];
assert.equal(after.rows.length - before.rows.length, 3, "本次更新应新增 3 辆钢舞姬");
assert.deepEqual([9822, 9823, 9824].filter((id) => !beforeById.has(id)), [9822, 9823, 9824], "新增钢舞姬 ID 不符");

const expectedStatLabels = new Map([
  ["T30E1", ["火力", "穿甲", "命中", "装甲", "回避", "侦查"]],
  ["KV-4 KTTS", ["火力", "穿甲", "装甲", "命中"]],
  ["282工程", ["火力", "穿甲", "侦查"]],
  ["KV-4(米哈伊洛夫)", ["耐久", "装甲", "命中"]],
  ["突击虎式", ["火力", "穿甲", "隐蔽"]],
]);
for (const [name, labels] of expectedStatLabels) {
  assert.deepEqual(Object.keys(statDiff(name).levels[0]?.changes ?? {}).sort(), [...labels].sort(), `${name} 公告属性范围不符`);
}

const miuAmmo = ammoDiff("缪");
assert.equal(miuAmmo.addedDetails.filter((name) => name.includes("破甲弹(小口径)")).length, 3, "缪应新增 3 种小口径深锥破甲弹");
const kv4Ammo = ammoDiff("KV-4(米哈伊洛夫)");
assert.ok(kv4Ammo.addedDetails.some((name) => name.includes("穿甲弹(小口径)")), "KV-4(米哈伊洛夫) 应新增 45mm 穿甲弹系");
assert.ok(m41ConfigRows.length >= 20 && m41Ammunition.length >= 20, "M41 型 90mm 坦克炮兼容弹药配置不完整");
for (const name of ["底凹型曳光榴弹", "爆破重视型碎甲弹", "杀伤爆破型改良弹头碎甲弹"]) {
  assert.ok(m41Ammunition.includes(name), `M41 型 90mm 坦克炮缺少公告弹药：${name}`);
}

const oldBodyCrafts = collectCraftNamesFor(before, "可用车体");
const newBodyCrafts = collectCraftNamesFor(after, "可用车体");
const bodyCraftAdditions = [...newBodyCrafts].filter((name) => !oldBodyCrafts.has(name)).sort();
assert.ok(bodyCraftAdditions.length > 0, "未检测到公告所述新增车体科技");
const technologyNodeNames = new Set(technology.blocks.flatMap((block) => block.nodes).map((node) => node.name));
for (const name of bodyCraftAdditions) assert.ok(technologyNodeNames.has(name), `科技页面缺少新增车体：${name}`);
assert.ok(publicData.facets.bodyResistances.includes("抗宽沟"), "网页数据缺少新增抗性：抗宽沟");

const allAmmoChanges = after.rows.flatMap((row) => {
  const previous = beforeById.get(row["钢舞姬卡牌ID"]);
  if (!previous || previous["弹药工艺明细"] === row["弹药工艺明细"]) return [];
  const oldNames = ammoDetailNames(previous);
  const newNames = ammoDetailNames(row);
  return [{
    id: row["钢舞姬卡牌ID"], tank: row["坦克/载具名称"],
    added: newNames.filter((name) => !oldNames.includes(name)),
    removed: oldNames.filter((name) => !newNames.includes(name)),
  }];
});

const newMaidens = [9822, 9823, 9824].map((id) => {
  const row = publicById.get(id);
  const node = research.nodes.find((item) => item.id === id);
  return {
    id, tank: row?.tank, person: row?.person, acquisition: row?.acquisition ?? [],
    researchNode: node ? { id: node.id, tank: node.tank, targets: node.targets ?? [], requirements: node.requirements ?? [] } : null,
  };
});

const t54Lt = publicById.get(9823);
const t54LtRecipe = research.recipes.find((item) => item.targetId === 9823);
assert(t54LtRecipe, "T-54LT 必须进入研发数据");
assert(t54Lt?.acquisition?.some((route) => route.kind === "research" && route.label === "研发"), "T-54LT 必须显示研发获取");
assert.deepEqual(
  t54LtRecipe.requirements.map((item) => [item.cardId, item.generation, item.level]),
  [[6366, 3, 90], [6497, 3, 90], [6823, 3, 90]],
  "T-54LT 前置车辆或养成要求不符",
);
assert(t54LtRecipe.resourcePlans.every((plan) => plan.commanderLevel === 65), "T-54LT 两种方法均要求指挥官 65 级");
const t54LtPlans = t54LtRecipe.resourcePlans.map((plan) => Object.fromEntries(
  plan.resources.map((resource) => [resource.name, {
    amount: resource.amount,
    grade: resource.equipmentGrade || undefined,
  }]),
));
assert.deepEqual(t54LtRecipe.resourcePlans.map((plan) => plan.ruleIds), [[4598231], [4598232]], "T-54LT 方法顺序必须与游戏一致");
assert(t54LtPlans.some((plan) => plan["银币"]?.amount === 6202000
  && plan["军牌"]?.amount === 91
  && plan["演算模块"]?.amount === 553
  && plan["N6图谱"]?.amount === 43
  && plan["弹药水套"]?.amount === 1
  && plan["弹药水套"]?.grade === "S6"), "T-54LT 方法1资源不符");
assert(t54LtPlans.some((plan) => plan["银币"]?.amount === 5850
  && plan["N6图谱"]?.amount === 6
  && plan["源石"]?.amount === 25), "T-54LT 方法2资源不符");

const announcementTargets = ["T30E1", "KV-4 KTTS", "282工程", "缪", "KV-4(米哈伊洛夫)", "突击虎式"];
console.log(JSON.stringify({
  counts: { before: before.rows.length, after: after.rows.length },
  newMaidens,
  t54LtResearch: t54LtRecipe,
  statChanges: announcementTargets.map(statDiff),
  ammunitionChanges: ["缪", "KV-4(米哈伊洛夫)"].map(ammoDiff),
  bodyCraftAdditions,
  antiWideTrench: publicData.facets.bodyResistances.includes("抗宽沟"),
  allAmmunitionCompatibilityChanges: allAmmoChanges,
  craftMatches,
  m41WeaponEvidence: {
    rawConfigRows: m41ConfigRows.length,
    ammunition: m41Ammunition,
    standaloneWeaponLabelInPublicArchive: JSON.stringify(publicData).includes("M41型90mm坦克炮"),
  },
}, null, 2));
