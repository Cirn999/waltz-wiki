import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
const researchTree = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "research-tree.json"), "utf8"));
const officialOverrides = JSON.parse(await fs.readFile(path.join(appRoot, "scripts", "overrides", "acquisition-routes.json"), "utf8"));
const byTank = new Map(dataset.rows.map((row) => [row.tank, row]));
const researchTargetIds = new Set(researchTree.recipes.map((recipe) => Number(recipe.targetId)));
const officialResearchIds = new Set(Object.entries(officialOverrides)
  .filter(([, routes]) => routes.some((route) => route.label === "研发"))
  .map(([id]) => Number(id)));

function requireRoute(tank, predicate, message) {
  const maiden = byTank.get(tank);
  if (!maiden) throw new Error(`Missing maiden: ${tank}`);
  if (!maiden.acquisition.some(predicate)) throw new Error(`${tank}: ${message}`);
}

requireRoute("阿喀琉斯MK-IIC", (route) => route.label === "定向爆破" && route.details.some((detail) => detail.includes("冰晶涂层")), "missing directional-blast exchange detail");
requireRoute("261-2工程", (route) => route.label === "礼包购买" && route.details.some((detail) => detail.includes("夏季限定")), "missing summer gift purchase path");
requireRoute("胜利式", (route) => route.label === "礼包购买" && route.details.some((detail) => detail.includes("资材特卖") && detail.includes("特遣部队")), "missing material-sale gift path");
requireRoute("T39", (route) => route.label === "车库钥匙", "missing garage-key route");
requireRoute("Mk.II巡航坦克", (route) => route.label === "关卡掉落" && route.details.some((detail) => detail.includes("强迫参赛")), "missing Strong Shortcut stage route");
requireRoute("Pz.Kpfw.B2", (route) => route.label === "舞装再制" && route.details.includes("死水姬务段 1级"), "missing native remanufacture building-level route");
requireRoute("PLZ05", (route) => route.label === "特战招募" && route.details.includes("限时活动 → 资材特卖 → 特战招募"), "missing full special-recruitment menu path");
requireRoute("圣剑", (route) => route.label === "特勤局精英" && route.details.includes("限时活动 → 资材特卖 → 特勤局精英"), "missing full agency-elite menu path");
requireRoute("KV-4 KTTS", (route) => route.label === "兑换处" && route.details.includes("彼得洛夫特许证 ×8"), "missing exchange material: 8 Petrov permits");
requireRoute("野牛II", (route) => route.label === "预备队标兵" && route.details.includes("预备队徽记 ×36"), "missing exchange material: 36 reserve emblems");
requireRoute("244工程", (route) => route.label === "佣兵基地" && route.details.includes("代金券 ×116"), "missing 116-voucher mercenary route");
requireRoute("244工程", (route) => route.label === "招募站" && route.details.includes("氦金手镯 ×1"), "missing helium-gold bracelet route");
requireRoute("AMX-CDA", (route) => route.label === "掌中饕餮" && route.details.includes("活动获取"), "missing official diner-event route");
requireRoute("T-100Z", (route) => route.label === "掌中饕餮" && route.details.includes("低概率喂食获得"), "missing official diner feeding route");
requireRoute("T-100Z", (route) => route.label === "掌中饕餮" && route.details.includes("水晶贝兑换"), "missing official crystal-shell exchange route");
requireRoute("T-54LT", (route) => route.label === "研发", "missing official research route");
if (byTank.get("244工程")?.acquisition.some((route) => route.details.some((detail) => detail.includes("代金券 ×290")))) throw new Error("244工程 must not show the obsolete 290-voucher offer");
if (!dataset.rows.some((row) => row.acquisition.some((route) => route.label === "关卡掉落" && route.details.includes("1-4 巴黎之役")))) throw new Error("missing chapter anchor: 1-4 巴黎之役");
if (!dataset.rows.some((row) => row.acquisition.some((route) => route.label === "关卡掉落" && route.details.includes("16-3 埃普西隆的夜袭")))) throw new Error("missing chapter anchor: 16-3 埃普西隆的夜袭");
if (byTank.get("T39")?.acquisition.some((route) => route.label === "研发")) throw new Error("T39 must not be marked as researchable");

const researchMismatches = dataset.rows.filter((row) =>
  row.acquisition.some((route) => route.label === "研发") !== (researchTargetIds.has(row.id) || officialResearchIds.has(row.id))
);
if (researchMismatches.length) throw new Error(`Research route mismatches: ${researchMismatches.length}`);

const routeCounts = dataset.rows.map((row) => row.acquisition.length);
const multipleRouteRows = dataset.rows.filter((row) => row.acquisition.length > 1);
const labels = [...new Set(dataset.rows.flatMap((row) => row.acquisition.map((route) => route.label)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
console.log(JSON.stringify({
  records: dataset.rows.length,
  withAcquisition: dataset.rows.filter((row) => row.acquisition.length).length,
  multipleRouteMaidens: multipleRouteRows.length,
  maximumRoutesOnOneMaiden: Math.max(...routeCounts),
  labels,
  researchTreeTargets: researchTargetIds.size,
  officialResearchOverrides: [...officialResearchIds],
  t39: { id: byTank.get("T39")?.id, isResearchTreeTarget: researchTargetIds.has(byTank.get("T39")?.id) },
  acquisitionResearchButNotTree: dataset.rows.filter((row) => row.acquisition.some((route) => route.label === "研发") && !researchTargetIds.has(row.id)).length,
  samples: ["Pz.Kpfw.B2", "PLZ05", "圣剑", "阿喀琉斯MK-IIC", "261-2工程", "胜利式", "T39", "Mk.II巡航坦克"].map((tank) => ({ tank, routes: byTank.get(tank)?.acquisition })),
}, null, 2));
