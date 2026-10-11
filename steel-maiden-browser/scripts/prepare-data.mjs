import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { renderLive2dBatch } from "./render-live2d.mjs";
import { organizeMagicCosts } from "./magic-cost-groups.mjs";
import { prepareRestoredGameIcons } from "./restored-game-icons.mjs";
import { createHuntTraitsIndex } from "./hunt-traits.mjs";
import { prepareTablePortraits } from "./prepare-table-portraits.mjs";
import { deduplicateAcquisitionShops } from "./acquisition-shop-aliases.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prepareScriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(appRoot, "..");
const sourcePath = path.join(projectRoot, "analysis_apk", "output", "steel_maiden_catalog_v4", "钢舞姬汇总数据.json");
const outputDataPath = path.join(appRoot, "public", "data", "maidens.json");
const growthCurvesSourcePath = path.join(projectRoot, "analysis_apk", "output", "growth_curves", "growth_curves.json");
const growthCurvesOutputPath = path.join(appRoot, "public", "data", "growth-curves.json");
const acquisitionSourcePath = path.join(projectRoot, "analysis_apk", "output", "acquisition_analysis_v2_outfits", "acquisition_paths_preliminary.json");
const acquisitionOverridePath = path.join(appRoot, "scripts", "overrides", "acquisition-routes.json");
const researchTreePath = path.join(appRoot, "public", "data", "research-tree.json");
const equipmentCatalogSourcePath = path.join(projectRoot, "analysis_apk", "output", "equipment_catalog", "equipment_catalog.json");
const equipmentCatalogOutputPath = path.join(appRoot, "public", "data", "equipment-catalog.json");
const technologyCatalogSourcePath = path.join(projectRoot, "analysis_apk", "output", "technology_catalog", "technology_catalog.json");
const technologyCatalogOutputPath = path.join(appRoot, "public", "data", "technology-catalog.json");
const colonizationCatalogSourcePath = path.join(projectRoot, "analysis_apk", "output", "colonization_catalog", "colonization_catalog.json");
const colonizationCatalogOutputPath = path.join(appRoot, "public", "data", "colonization-catalog.json");
const outputArtDir = path.join(appRoot, "public", "art", "maidens");
const outputHeadDir = path.join(appRoot, "public", "art", "heads");
const outputAmmoDir = path.join(appRoot, "public", "art", "ammo");
const outputEffectDir = path.join(appRoot, "public", "art", "ammo-effects");
const outputAttributeDir = path.join(appRoot, "public", "art", "attributes");
const outputSlotDir = path.join(appRoot, "public", "art", "slots");
const outputResistanceDir = path.join(appRoot, "public", "art", "resistances");
const outputClassDir = path.join(appRoot, "public", "art", "classes");
const outputCraftDir = path.join(appRoot, "public", "art", "crafts");
const outputNationDir = path.join(appRoot, "public", "art", "nations");
const outputRarityDir = path.join(appRoot, "public", "art", "rarities");
const outputStageDir = path.join(appRoot, "public", "art", "stages");
const outputTalentDir = path.join(appRoot, "public", "art", "talents");
const outputMagicOrdnanceDir = path.join(appRoot, "public", "art", "magic-ordnance");
const outputEquipmentDir = path.join(appRoot, "public", "art", "equipment");
const outputTechnologyDir = path.join(appRoot, "public", "art", "technology");
const live2dCacheDir = path.join(appRoot, ".cache", "live2d");
const roleModelsPath = path.join(projectRoot, "analysis_apk", "output", "role_models.json");
const unitAppearancesPath = path.join(projectRoot, "analysis_apk", "output", "unit_appearances.json");
const magicOrdnancePath = path.join(projectRoot, "analysis_apk", "output", "magic_ordnance", "magic_ordnance_catalog.json");
const magicProgressionPath = path.join(projectRoot, "analysis_apk", "output", "magic_ordnance", "magic_progression_catalog.json");
const huntRosterPath = path.join(projectRoot, "analysis_apk", "output", "hunt_special_lineups", "狩猎任务特殊阵容_游戏判定.json");
const uiStylePath = path.join(projectRoot, "patch", "_1.18", "config", "UIStyle.dat");
const uiRoots = [
  path.join(projectRoot, "patch", "_1.18", "ui"),
  path.join(projectRoot, "analysis_apk", "apk_ui_assets", "assets", "Resources", "ui"),
  path.join(projectRoot, "analysis_apk", "apk_ui_heads"),
];
const modelRoots = [
  path.join(projectRoot, "patch", "_1.18", "modelConfig"),
  path.join(projectRoot, "package", "preinitial", "modelConfig"),
  path.join(projectRoot, "Resources", "modelConfig"),
];
const artRoots = [
  path.join(projectRoot, "patch", "_1.18", "char"),
  path.join(projectRoot, "package", "preinitial", "char"),
];
const liveRoots = [
  path.join(projectRoot, "patch", "_1.18", "live"),
  path.join(projectRoot, "package", "preinitial", "live"),
  path.join(projectRoot, "Resources", "live"),
];

const statLabels = {
  durability: "耐久",
  power: "火力",
  piercing: "穿甲",
  accuracy: "命中",
  armor: "装甲",
  evasion: "回避",
  stealth: "隐蔽",
  recon: "侦查",
  economy: "经济性",
  potential: "潜能",
};

// These are the same UIStyle codes used by the game's steel-maiden detail
// screen (EnhanceUI.lua / CardAttri_Array). Keep the source code in the file
// name so a future client update can be checked without guessing by shape.
const attributeIconCodes = {
  "火力": "kpxx-035",
  "耐久": "kpxx-034",
  "隐蔽": "kpxx-033",
  "穿甲": "kpxx-032",
  "装甲": "kpxx-031",
  "侦查": "kpxx-030",
  "命中": "kpxx-029",
  "回避": "kpxx-028",
  "射程": "kpxx-027",
  // The equipment-preview-only ignition value has no entry in the nine base
  // attributes. The client uses this fire/heat status glyph for that concept.
  "点燃": "kpxx-101",
};

// Exact client display mappings. A slot's EQU record links through EQUIP_TAG
// (number entry 7) to an EQUTYPE record; EQUTYPE supplies the compact dark
// ico_mark sprite used by the steel-maiden attribute screen.
const slotIconCodes = {
  "特殊": "djbj-013",
  "炮座": "djbj-008",
  "改装": "djbj-014",
  "内壁": "djbj-011",
  "外身": "djbj-010",
  "内舱": "djbj-009",
  "炮架": "djbj-012",
  "先战": "djbj-044",
  "专属": "djbj-047",
  "机头": "djbj-030",
  "挂载": "djbj-031",
  "机舱": "djbj-032",
  "乘员": "djbj-033",
  "机翼": "djbj-038",
  "机尾": "djbj-039",
  "机腹": "djbj-042",
};

// Exact INDEX_FUNCTION entries from ArrangedStyleInfo.dat. These snowflakes
// sprites are the icons used beside engine/body functions in the client UI.
const resistanceIconCodes = {
  "抗潮湿": "kj-021", "抗风沙": "kj-024", "抗起伏": "kj-023", "抗暴露": "kj-019",
  "抗燥热": "kj-020", "抗冻结": "kj-022", "倾斜车体": "kj-100", "扁平车体": "kj-101",
  "抗积雪": "kj-066", "硬地适应": "kj-067", "抗突袭": "kj-073", "抗灌木": "kj-069",
  "抗泥沼": "kj-070", "广阔适应": "kj-071", "抗碎块": "kj-072", "抗风偏": "bigkj-217",
  "抗积云": "bigkj-214", "抗地障": "bigkj-222", "抗夜幕": "bigkj-211", "抗雨幕": "bigkj-212",
  "抗湍流": "bigkj-219", "抗昏暗": "bigkj-215", "抗电波": "bigkj-218", "桁梁机身": "bigkj-225",
  "硬壳机身": "bigkj-226", "可卸铆接": "kj-074", "平整焊接": "kj-075", "浇铸": "kj-077",
  "表面硬化": "kj-078", "内层韧化": "kj-079", "中空装甲": "kj-080", "复层填充": "kj-081",
  "楔形附甲": "kj-102", "陶瓷球": "kj-113", "抗低温": "bigkj-213", "抗浸蚀": "bigkj-209",
  "强化铆接": "kj-074", "抗积冰": "bigkj-210", "真空焊接": "kj-075", "强殖": "bigkj-223",
  "抗风阻": "bigkj-221", "抗静电": "bigkj-220", "抗深寒": "bigkj-216", "抗植被": "kj-020",
  "抗涉水": "kj-109", "箭型车体": "kj-107", "弧形装甲": "kj-110", "抗远隔": "kj-111",
  "抗潮气": "kj-112", "抗昏睡": "kj-116", "抗迟钝": "kj-117", "抗宽沟": "kj-129",
  "加长车体": "kj-130",
};

// RaceInfo.dat is indexed by UnitAppearance.unit_class_id; GetRaceResource
// returns these p24_pic sprites for the vehicle-class badge.
const classIconCodes = {
  1: "zd-024",
  2: "zd-023",
  3: "zd-022",
  4: "zd-021",
  5: "zd-020",
  6: "zd-019",
  7: "bz-014",
  8: "bz-008",
  9: "bz-007",
  10: "bz-013",
};

// StampUI.lua builds the nation filter with GetAttackTypeResource. These are
// the exact AttackType.dat resources (IDs 1/2/3 intentionally use 002/003/001).
const nationIconCodes = Object.fromEntries(Array.from({ length: 29 }, (_, index) => {
  const attackType = index + 1;
  const resourceNumber = attackType === 1 ? 2 : attackType === 2 ? 3 : attackType === 3 ? 1 : attackType;
  return [attackType, `gjbz-${String(resourceNumber).padStart(3, "0")}`];
}));

// RareType.dat resource slot 1 is what GetRareResource(rarity, 1) returns.
const rarityIconCodes = { 2: "kpsj-031", 3: "kpsj-033", 4: "kpsj-030" };

// FundTypeInfo.dat 3101..3106 exposes the compact inventory resource in slot
// 9 (djtb-044..049); this is the blueprint icon actually used in item cards.
const stageIconCodes = { N1: "djtb-044", N2: "djtb-045", N3: "djtb-046", N4: "djtb-047", N5: "djtb-048", N6: "djtb-049" };

// GetTraitFromTag(130) -> GetTraitTags -> ArrangedStyle mode CAIYI.
const talentIconCodes = {
  "演艺": "dg-016", "料理": "dg-017", "技工": "dg-020", "护理": "dg-019", "运动": "dg-018", "知性": "dg-021",
  "美妆": "dg-104", "商贸": "dg-105", "武学": "dg-106", "心理": "dg-107", "编程": "dg-108", "文学": "dg-109",
};

async function exists(candidate) {
  try { await fs.access(candidate); return true; } catch { return false; }
}

async function locateModel(modelId) {
  for (const root of modelRoots) {
    const candidate = path.join(root, `${modelId}.rmc`);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

function stringsFromRmc(buffer) {
  return buffer.toString("latin1").split("\0").map((value) => value.replace(/[^A-Za-z0-9_.-]/g, "")).filter((value) => value.length > 2);
}

function parseUiStyles(buffer) {
  let offset = 0;
  const readU8 = () => buffer.readUInt8(offset++);
  const readU32 = () => { const value = buffer.readUInt32LE(offset); offset += 4; return value; };
  const readCString = () => {
    const end = buffer.indexOf(0, offset);
    if (end < 0) throw new Error("UIStyle.dat contains an unterminated string");
    const value = buffer.toString("utf8", offset, end);
    offset = end + 1;
    return value;
  };
  const count = readU32();
  const byCode = new Map();
  const byId = new Map();
  for (let index = 0; index < count; index += 1) {
    const style = {
      id: readU32(),
      flag: readU8(),
      code: readCString(),
      file: readCString(),
      atlas: readCString(),
    };
    offset += 5;
    byCode.set(style.code, style);
    byId.set(style.id, style);
  }
  return { byCode, byId };
}

async function locateHead(modelId, roleModelById, uiStyleByCode) {
  const roleModel = roleModelById.get(modelId);
  const style = uiStyleByCode.get(roleModel?.resource_a);
  if (!style?.file) return null;
  for (const root of uiRoots) {
    const candidate = path.join(root, style.file);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function locateUiResource(style) {
  if (!style?.file) return null;
  for (const root of uiRoots) {
    const candidate = path.join(root, style.file);
    if (await exists(candidate)) return { imagePath: candidate, frame: null };
    if (!style.atlas) continue;
    const atlasImage = path.join(root, `${style.atlas}.pn_`);
    const atlasPlist = path.join(root, `${style.atlas}.plist`);
    if (!(await exists(atlasImage)) || !(await exists(atlasPlist))) continue;
    const plist = await fs.readFile(atlasPlist, "utf8");
    const marker = `<key>${style.file}</key>`;
    const start = plist.indexOf(marker);
    if (start < 0) continue;
    const block = plist.slice(start + marker.length, plist.indexOf("</dict>", start));
    const frameMatch = block.match(/<key>frame<\/key>\s*<string>\{\{(\d+),(\d+)\},\{(\d+),(\d+)\}\}<\/string>/);
    if (!frameMatch) continue;
    const colorRectMatch = block.match(/<key>sourceColorRect<\/key>\s*<string>\{\{(-?\d+),(-?\d+)\},\{(\d+),(\d+)\}\}<\/string>/);
    const sourceSizeMatch = block.match(/<key>sourceSize<\/key>\s*<string>\{(\d+),(\d+)\}<\/string>/);
    return {
      imagePath: atlasImage,
      frame: {
        left: Number(frameMatch[1]),
        top: Number(frameMatch[2]),
        width: Number(frameMatch[3]),
        height: Number(frameMatch[4]),
        rotated: /<key>rotated<\/key>\s*<true\s*\/>/.test(block),
        sourceColorRect: colorRectMatch ? {
          left: Number(colorRectMatch[1]),
          top: Number(colorRectMatch[2]),
          width: Number(colorRectMatch[3]),
          height: Number(colorRectMatch[4]),
        } : null,
        sourceSize: sourceSizeMatch ? { width: Number(sourceSizeMatch[1]), height: Number(sourceSizeMatch[2]) } : null,
      },
    };
  }
  return null;
}

async function locateArt(modelId) {
  const modelPath = await locateModel(modelId);
  if (!modelPath) return null;
  const values = stringsFromRmc(await fs.readFile(modelPath));
  const directoryNames = [...new Set(values.filter((value) => value.endsWith("_a")))];
  const sheetNames = [...new Set(values.filter((value) => value.includes("__200")))];
  for (const directoryName of directoryNames) {
    for (const artRoot of artRoots) {
      const directory = path.join(artRoot, directoryName);
      if (!(await exists(directory))) continue;
      for (const sheetName of sheetNames) {
        const candidate = path.join(directory, `${sheetName}.pn_`);
        if (await exists(candidate)) return { imagePath: candidate, plistPath: path.join(directory, `${sheetName}.plist`), explicit: true };
      }
      const files = await fs.readdir(directory);
      const fallback = files.find((file) => file.endsWith("__200.pn_")) ?? files.find((file) => file.endsWith(".pn_"));
      if (fallback) {
        const imagePath = path.join(directory, fallback);
        return { imagePath, plistPath: path.join(directory, `${path.parse(fallback).name}.plist`), explicit: false };
      }
    }
  }
  return null;
}

async function liveModelFiles(modelPath) {
  try {
    // A few shipped model3 files contain a trailing comma. The native client
    // accepts them, so mirror that tolerance when validating local assets.
    const text = await fs.readFile(modelPath, "utf8");
    const settings = JSON.parse(text
      .replace(/("(?:[^"\\]|\\.)*")(\s*)(")/g, "$1,$2$3")
      .replace(/,\s*([}\]])/g, "$1"));
    const references = settings.FileReferences ?? {};
    const files = [references.Moc, ...(references.Textures ?? [])].filter(Boolean);
    return [modelPath, ...files.map((file) => path.resolve(path.dirname(modelPath), file))];
  } catch {
    return [];
  }
}

async function locateLiveModel(modelId) {
  const modelPath = await locateModel(modelId);
  if (!modelPath) return null;
  const values = stringsFromRmc(await fs.readFile(modelPath));
  const directoryNames = [...new Set(values.filter((value) => value.endsWith("_a")))];
  for (const directoryName of directoryNames) {
    for (const root of liveRoots) {
      const candidate = path.join(root, directoryName, `${directoryName}.model3.json`);
      const files = await liveModelFiles(candidate);
      if (files.length && (await Promise.all(files.map(exists))).every(Boolean)) return { modelPath: candidate, files };
    }
  }
  return null;
}

async function isFresh(targetPath, sourceFiles) {
  if (!(await exists(targetPath))) return false;
  const targetTime = (await fs.stat(targetPath)).mtimeMs;
  const sourceTimes = await Promise.all(sourceFiles.map(async (sourceFile) => (await fs.stat(sourceFile)).mtimeMs));
  return targetTime >= Math.max(...sourceTimes);
}

async function textureRotation(art) {
  if (!art?.plistPath || !(await exists(art.plistPath))) return 0;
  const plist = await fs.readFile(art.plistPath, "utf8");
  return /<key>rotated<\/key>\s*<true\s*\/>/i.test(plist) ? 270 : 0;
}

function cleanMarkup(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/br>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitList(value) {
  return String(value ?? "").split(/[、；]/).map((item) => item.trim()).filter(Boolean);
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeShopName(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function acquisitionRoutesFor(cardId, tank, acquisitionById, researchTargetIds, acquisitionOverrides) {
  const sourceCard = acquisitionById.get(Number(cardId)) ?? { routes: {} };
  const grouped = new Map();
  const addRoute = (kind, label, details = []) => {
    const normalizedDetails = uniqueText(details);
    const key = `${kind}:${label}`;
    const current = grouped.get(key);
    if (current) current.details = uniqueText([...current.details, ...normalizedDetails]);
    else grouped.set(key, { kind, label, details: normalizedDetails });
  };

  if (researchTargetIds.has(Number(cardId))) addRoute("research", "研发");
  for (const route of acquisitionOverrides.get(Number(cardId)) ?? []) {
    addRoute(String(route.kind ?? "source"), String(route.label ?? "公告确认"), route.details ?? []);
  }

  const nativeChapterDetails = uniqueText((sourceCard.routes?.getway ?? [])
    .filter((row) => row.mode === "LOOT" && row.chapterCode)
    .map((row) => `${row.chapterCode} ${row.chapterName || "关卡"}`));
  // GETWAY is the exact in-game acquisition panel, but some early cards use a
  // volume-wide fallback there (ratio=0) and only show one concrete stage.
  // Supplement it with reward-table routes that directly configure this card;
  // this restores real drops such as Mk.II on 3-4 without admitting generic
  // shared reward-pool noise.
  const directChapterDetails = uniqueText((sourceCard.routes?.chapter ?? [])
    .filter((row) => row.directCardConfigured && row.chapterCode && /^VOL\d+$/.test(row.chapterResource ?? ""))
    .map((row) => `${row.chapterCode} ${row.chapterName}`.trim()));
  const chapterNames = uniqueText([...nativeChapterDetails, ...directChapterDetails])
    .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  if (chapterNames.length) addRoute("chapter", "关卡掉落", chapterNames);

  const remakeMethods = (sourceCard.routes?.getway ?? []).filter((row) => row.mode === "DEVELOP");
  if (remakeMethods.length) {
    addRoute("source", "舞装再制", uniqueText(remakeMethods.map((row) =>
      `${row.buildingName || "死水姬务段"} ${Number(row.buildingLevel) || 1}级`
    )));
  }

  const simpleSources = new Set([
    "特战招募", "特勤局精英", "源铁爆破", "源铝爆破", "博物馆", "徽章招募",
    "稀土提炼", "佣兵招募", "佣兵基地", "招募站", "特殊招募", "预备队标兵",
    "军事爆破", "情报破译", "蓝图解析", "再制商店",
  ]);
  const giftShops = new Set(["特遣部队", "特别优惠", "限量特卖", "戊戌贺礼"]);

  const shopRows = deduplicateAcquisitionShops(sourceCard.routes?.shop ?? []);
  const hasCurrentMercenaryRoute = shopRows.some((row) =>
    ["佣兵基地", "招募站"].includes(normalizeShopName(row.shopName))
    && !(row.campaignLabels ?? []).length
  );
  for (const row of shopRows) {
    const shop = normalizeShopName(row.shopName);
    if (!shop || shop === "内部测试") continue;
    const commodity = String(row.commodityName ?? "").trim();
    const campaigns = uniqueText(row.campaignLabels ?? []);
    const costs = Array.isArray(row.costs) ? row.costs : [];
    const costNames = costs.map((cost) => String(cost.name ?? ""));
    const costDetails = costs
      .filter((cost) => cost.name)
      .map((cost) => {
        // Fund 4344 is the warehouse-side mercenary contact item granted by a
        // Helium-gold Bracelet. The acquisition UI presents the player-facing
        // bracelet route, so use that name here as well.
        const name = Number(cost.fundId) === 4344 ? "氦金手镯" : cost.name;
        return `${name}${Number(cost.amount) ? ` ×${Number(cost.amount).toLocaleString("zh-CN")}` : ""}`;
      });
    const costPlanDetails = costDetails.length > 1 ? [costDetails.join(" + ")] : costDetails;

    // Older event snapshots can retain a historical mercenary-shop offer next
    // to the current Mercenary Base / Recruitment Station entries. When a
    // current entry exists, suppress the historical duplicate so obsolete
    // prices (for example 244工程 ×290代金券) are not shown as current costs.
    if (hasCurrentMercenaryRoute && shop === "佣兵招募" && campaigns.length) continue;

    if (shop === "车库") {
      addRoute("source", "车库钥匙");
      continue;
    }
    if (shop === "兑换处") {
      addRoute("exchange", "兑换处", costPlanDetails);
      continue;
    }
    if (shop === "特战招募" || shop === "特勤局精英") {
      addRoute("source", shop, [`限时活动 → 资材特卖 → ${shop}`, ...(row.hasGenericExchangeAlias ? costPlanDetails : [])]);
      continue;
    }
    if (costNames.some((name) => name.includes("水晶贝"))) {
      addRoute("exchange", "掌中饕餮", costDetails.map((detail) => `${detail}兑换`));
      continue;
    }
    if (costNames.some((name) => name.includes("冰晶涂层") || name.includes("水晶涂层"))) {
      addRoute("event", "定向爆破", costDetails.map((detail) => `${detail}兑换`));
      continue;
    }

    const isGift = giftShops.has(shop)
      || campaigns.some((label) => label.includes("礼包"))
      || /(特供精英|特种精英|礼包|限定)/.test(commodity);
    if (isGift) {
      let purchasePath;
      if (tank === "261-2工程") purchasePath = `限时活动 → 夏季限定 → ${commodity || tank}`;
      else if (shop === "特遣部队") purchasePath = `限时活动 → 资材特卖 → 特遣部队 → ${commodity || tank}`;
      else if (shop === "限量特卖") purchasePath = `限时活动 → 资材特卖 → 限量特卖 → ${commodity || tank}`;
      else if (shop === "戊戌贺礼") purchasePath = `限时活动 → 戊戌贺礼 → ${commodity || tank}`;
      else if (campaigns.some((label) => label.includes("礼包"))) purchasePath = `限时活动 → ${campaigns.find((label) => label.includes("礼包"))} → ${commodity || tank}`;
      else purchasePath = `限时活动 → ${shop} → ${commodity || tank}`;
      addRoute("gift", "礼包购买", [purchasePath]);
      continue;
    }

    if (simpleSources.has(shop)) {
      addRoute("source", shop, costPlanDetails);
      continue;
    }
    if (shop === "定向爆破") {
      addRoute("event", "定向爆破", costDetails);
      continue;
    }
    if (shop === "活动兑换") {
      addRoute("exchange", "活动兑换", [...costDetails, ...campaigns]);
      continue;
    }
    addRoute("source", shop, commodity && commodity !== tank ? [commodity] : []);
  }

  const priority = { research: 0, chapter: 1, source: 2, event: 3, exchange: 4, gift: 5 };
  return [...grouped.values()].sort((left, right) =>
    (priority[left.kind] ?? 9) - (priority[right.kind] ?? 9)
    || left.label.localeCompare(right.label, "zh-CN", { numeric: true })
  );
}

async function compatibilityOptions(value, fallbackName, fallbackResistance, fallbackId) {
  if (Array.isArray(value) && value.length) {
    return Promise.all(value.map(async (item) => ({
      id: Number(item["工艺ID"]) || 0,
      name: String(item["名称"] ?? ""),
      resistance: Array.isArray(item["抗性"]) ? item["抗性"].map(String) : [],
      rank: Number(item["阶段序号"]) || 0,
      rankLabel: String(item["阶段"] ?? ""),
      image: await exportUiAsset(String(item["图标代码"] ?? ""), outputCraftDir, "crafts"),
      stats: (Array.isArray(item["属性"]) ? item["属性"] : []).map((stat) => ({
        key: String(stat["属性"] ?? ""),
        value: Number(stat["数值"]) || 0,
        effectType: Number(stat["效果类型"]) || 0,
      })),
    })));
  }
  return fallbackName && fallbackName !== "未配置/不适用"
    ? [{ id: Number(fallbackId) || 0, name: fallbackName, resistance: splitList(fallbackResistance), rank: 0, rankLabel: "", image: "", stats: [] }]
    : [];
}

function safeAssetName(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
}

// Refresh acquisition routes without rebuilding portraits or unrelated catalogs.
if (process.argv.includes("--acquisition-only")) {
  const dataset = JSON.parse(await fs.readFile(outputDataPath, "utf8"));
  const acquisition = JSON.parse(await fs.readFile(acquisitionSourcePath, "utf8"));
  const acquisitionById = new Map(acquisition.cards.map((card) => [Number(card.cardId), card]));
  const overrides = new Map(Object.entries(JSON.parse(await fs.readFile(acquisitionOverridePath, "utf8"))).map(([id, routes]) => [Number(id), routes]));
  const research = JSON.parse(await fs.readFile(researchTreePath, "utf8"));
  const targets = new Set(research.recipes.map((recipe) => Number(recipe.targetId)));
  const changed = [];
  for (const row of dataset.rows) {
    const routes = acquisitionRoutesFor(row.id, row.tank, acquisitionById, targets, overrides);
    if (JSON.stringify(routes) !== JSON.stringify(row.acquisition)) changed.push({ id: row.id, tank: row.tank, before: row.acquisition.length, after: routes.length });
    row.acquisition = routes;
  }
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly && changed.length) await fs.writeFile(outputDataPath, JSON.stringify(dataset));
  console.log(JSON.stringify({ checkOnly, checked: dataset.rows.length, changed }, null, 2));
  process.exit(0);
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(appRoot, "scripts", "build-implementation-roster.py")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
const implementationRoster = JSON.parse(await fs.readFile(path.join(appRoot, "public/data/implementation-roster.json"), "utf8"));
const implementationById = new Map(implementationRoster.rows.map((row) => [row.id, row]));
const acquisitionSource = JSON.parse(await fs.readFile(acquisitionSourcePath, "utf8"));
const acquisitionById = new Map(acquisitionSource.cards.map((card) => [Number(card.cardId), card]));
const acquisitionOverrides = new Map(Object.entries(JSON.parse(await fs.readFile(acquisitionOverridePath, "utf8")))
  .map(([cardId, routes]) => [Number(cardId), routes]));
const researchTree = JSON.parse(await fs.readFile(researchTreePath, "utf8"));
const researchTargetIds = new Set(researchTree.recipes.map((recipe) => Number(recipe.targetId)));
const roleModels = JSON.parse(await fs.readFile(roleModelsPath, "utf8"));
const roleModelById = new Map(roleModels.map((row) => [row.role_model_id, row]));
const unitAppearances = JSON.parse(await fs.readFile(unitAppearancesPath, "utf8"));
const appearanceById = new Map(unitAppearances.map((row) => [Number(row.appearance_id), row]));
const magicOrdnanceSource = JSON.parse(await fs.readFile(magicOrdnancePath, "utf8"));
const magicProgressionSource = JSON.parse(await fs.readFile(magicProgressionPath, "utf8"));
const equipmentCatalogSource = JSON.parse(await fs.readFile(equipmentCatalogSourcePath, "utf8"));
const technologyCatalogSource = JSON.parse(await fs.readFile(technologyCatalogSourcePath, "utf8"));
const magicOrdnanceById = new Map(Object.entries(magicOrdnanceSource.rows ?? {}).map(([id, items]) => [Number(id), items]));
const huntRoster = JSON.parse(await fs.readFile(huntRosterPath, "utf8"));
const huntTraitsById = createHuntTraitsIndex(huntRoster);
const uiStyles = parseUiStyles(await fs.readFile(uiStylePath));
const uiStyleByCode = uiStyles.byCode;
const talentById = new Map();
for (const talent of source.talent_rows) {
  if (!talent["才艺等级"]) continue;
  const id = talent["钢舞姬卡牌ID"];
  if (!talentById.has(id)) talentById.set(id, []);
  talentById.get(id).push({ name: talent["才艺名称"], level: talent["才艺等级"] });
}

await fs.mkdir(path.dirname(outputDataPath), { recursive: true });
await fs.mkdir(outputArtDir, { recursive: true });
await fs.mkdir(outputHeadDir, { recursive: true });
await fs.mkdir(outputAmmoDir, { recursive: true });
await fs.mkdir(outputEffectDir, { recursive: true });
await fs.mkdir(outputAttributeDir, { recursive: true });
await fs.mkdir(outputSlotDir, { recursive: true });
await fs.mkdir(outputResistanceDir, { recursive: true });
await fs.mkdir(outputClassDir, { recursive: true });
await fs.mkdir(outputCraftDir, { recursive: true });
await fs.mkdir(outputNationDir, { recursive: true });
await fs.mkdir(outputRarityDir, { recursive: true });
await fs.mkdir(outputStageDir, { recursive: true });
await fs.mkdir(outputTalentDir, { recursive: true });
await fs.mkdir(outputMagicOrdnanceDir, { recursive: true });
await fs.mkdir(outputEquipmentDir, { recursive: true });
await fs.mkdir(outputTechnologyDir, { recursive: true });
await fs.mkdir(live2dCacheDir, { recursive: true });

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* copy original PNG if Sharp is unavailable */ }

const uiAssetCache = new Map();
const restoredUiAssets = await prepareRestoredGameIcons();
async function exportUiAsset(code, outputDir, publicFolder) {
  if (!code) return "";
  if (restoredUiAssets[code]) return restoredUiAssets[code];
  const cacheKey = `${publicFolder}:${code}`;
  if (uiAssetCache.has(cacheKey)) return uiAssetCache.get(cacheKey);
  const task = (async () => {
    const sourceResource = await locateUiResource(uiStyleByCode.get(code));
    if (!sourceResource) return "";
    const targetName = `${safeAssetName(code)}.${sharp ? "webp" : "png"}`;
    const targetPath = path.join(outputDir, targetName);
    if (!(await isFresh(targetPath, [sourceResource.imagePath, prepareScriptPath]))) {
      if (sharp) {
        let pipeline = sharp(sourceResource.imagePath);
        if (sourceResource.frame) {
          const { rotated, sourceColorRect, sourceSize, ...configuredRegion } = sourceResource.frame;
          // The Cocos2d plist stores frame dimensions in the sprite's upright
          // orientation. A rotated atlas entry therefore occupies h×w pixels
          // on the sheet. This is the same interpretation used by the client.
          const region = {
            ...configuredRegion,
            width: rotated ? configuredRegion.height : configuredRegion.width,
            height: rotated ? configuredRegion.width : configuredRegion.height,
          };
          const metadata = await pipeline.metadata();
          if (region.left + region.width > metadata.width || region.top + region.height > metadata.height) {
            return "";
          }
          const cropped = await sharp(sourceResource.imagePath).extract(region).png().toBuffer();
          let sprite = sharp(cropped);
          if (rotated) sprite = sprite.rotate(270);
          const spriteBuffer = await sprite.png().toBuffer();
          if (sourceSize && sourceColorRect && (
            sourceSize.width !== sourceColorRect.width ||
            sourceSize.height !== sourceColorRect.height ||
            sourceColorRect.left !== 0 ||
            sourceColorRect.top !== 0
          )) {
            pipeline = sharp({
              create: { width: sourceSize.width, height: sourceSize.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
            }).composite([{ input: spriteBuffer, left: sourceColorRect.left, top: sourceColorRect.top }]);
          } else {
            pipeline = sharp(spriteBuffer);
          }
        }
        try {
          await pipeline.resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 94 }).toFile(targetPath);
        } catch (error) {
          console.warn(`UI asset export failed for ${code}: ${error.message}`);
          return "";
        }
      } else if (!sourceResource.frame) await fs.copyFile(sourceResource.imagePath, targetPath);
      else return "";
    }
    return `/art/${publicFolder}/${targetName}`;
  })();
  uiAssetCache.set(cacheKey, task);
  return task;
}

async function prepareTechnologyCatalog() {
  const technologyCatalog = {
    ...technologyCatalogSource,
    blocks: await Promise.all(technologyCatalogSource.blocks.map(async (block) => ({
      ...block,
      icon: await exportUiAsset(String(block.iconCode ?? ""), outputTechnologyDir, "technology"),
      nodes: await Promise.all(block.nodes.map(async (node) => ({
        ...node,
        image: node.image || await exportUiAsset(String(node.iconCode ?? ""), outputTechnologyDir, "technology"),
        traits: await Promise.all((node.traits ?? []).map(async (trait) => ({
          ...trait,
          image: trait.image || await exportUiAsset(String(trait.iconCode ?? ""), outputTechnologyDir, "technology"),
        }))),
        cost: await Promise.all((node.cost ?? []).map(async (material) => ({
          ...material,
          image: await exportUiAsset(String(material.iconCode ?? ""), outputTechnologyDir, "technology"),
        }))),
      }))),
      levels: await Promise.all((block.levels ?? []).map(async (level) => ({
        ...level,
        cost: await Promise.all((level.cost ?? []).map(async (material) => ({
          ...material,
          image: await exportUiAsset(String(material.iconCode ?? ""), outputTechnologyDir, "technology"),
        }))),
        cumulativeCost: await Promise.all((level.cumulativeCost ?? []).map(async (material) => ({
          ...material,
          image: await exportUiAsset(String(material.iconCode ?? ""), outputTechnologyDir, "technology"),
        }))),
      }))),
    }))),
  };
  await fs.writeFile(technologyCatalogOutputPath, JSON.stringify(technologyCatalog));
  return technologyCatalog;
}

async function prepareColonizationCatalog() {
  const catalog = JSON.parse(await fs.readFile(colonizationCatalogSourcePath, "utf8"));
  await fs.writeFile(colonizationCatalogOutputPath, JSON.stringify(catalog));
  return catalog;
}

if (process.argv.includes("--technology-only")) {
  const catalog = await prepareTechnologyCatalog();
  execFileSync(process.execPath, [path.join(appRoot, "scripts", "prepare-ammunition-efficiency.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
  console.log(`wrote ${catalog.blocks.length} technology blocks`);
  process.exit(0);
}
if (process.argv.includes("--colonization-only")) {
  const catalog = await prepareColonizationCatalog();
  console.log(`wrote ${Object.keys(catalog.rows).length} maiden colonization curves`);
  process.exit(0);
}

async function ammunitionOptions(value) {
  if (!Array.isArray(value)) return [];
  return Promise.all(value.map(async (item) => ({
    id: Number(item["工艺ID"]) || 0,
    type: String(item["弹药类型"] ?? ""),
    name: String(item["名称"] ?? ""),
    rank: Number(item["阶段序号"]) || 0,
    rankLabel: String(item["阶段"] ?? ""),
    image: await exportUiAsset(String(item["图标代码"] ?? ""), outputAmmoDir, "ammo"),
    typeImage: await exportUiAsset(String(item["类型图标代码"] ?? ""), outputAmmoDir, "ammo"),
    effects: await Promise.all((Array.isArray(item["特效"]) ? item["特效"] : []).map(async (effect) => ({
      name: String(effect["名称"] ?? ""),
      description: cleanMarkup(effect["说明"] ?? ""),
      kind: String(effect["类型"] ?? "特效"),
      image: await exportUiAsset(String(effect["图标代码"] ?? ""), outputEffectDir, "ammo-effects"),
    }))),
    stats: (Array.isArray(item["属性"]) ? item["属性"] : []).map((stat) => ({
      key: String(stat["属性"] ?? ""),
      value: Number(stat["数值"]) || 0,
      effectType: Number(stat["效果类型"]) || 0,
    })),
  })));
}

const attributeIcons = Object.fromEntries(await Promise.all(Object.entries(attributeIconCodes).map(async ([label, code]) => [
  label,
  await exportUiAsset(code, outputAttributeDir, "attributes"),
])));
const slotIcons = Object.fromEntries(await Promise.all(Object.entries(slotIconCodes).map(async ([label, code]) => [
  label,
  await exportUiAsset(code, outputSlotDir, "slots"),
])));
const resistanceIcons = Object.fromEntries(await Promise.all(Object.entries(resistanceIconCodes).map(async ([label, code]) => [
  label,
  await exportUiAsset(code, outputResistanceDir, "resistances"),
])));
const classIcons = Object.fromEntries(await Promise.all(Object.entries(classIconCodes).map(async ([classId, code]) => [
  classId,
  await exportUiAsset(code, outputClassDir, "classes"),
])));
const nationIcons = Object.fromEntries(await Promise.all(Object.entries(nationIconCodes).map(async ([attackType, code]) => [
  attackType,
  await exportUiAsset(code, outputNationDir, "nations"),
])));
const rarityIcons = Object.fromEntries(await Promise.all(Object.entries(rarityIconCodes).map(async ([rarityId, code]) => [
  rarityId,
  await exportUiAsset(code, outputRarityDir, "rarities"),
])));
const stageIcons = Object.fromEntries(await Promise.all(Object.entries(stageIconCodes).map(async ([stage, code]) => [
  stage,
  await exportUiAsset(code, outputStageDir, "stages"),
])));
const talentIcons = Object.fromEntries(await Promise.all(Object.entries(talentIconCodes).map(async ([name, code]) => [
  name,
  await exportUiAsset(code, outputTalentDir, "talents"),
])));

async function prepareEquipmentMaterial(material) {
  return {
    fundId: Number(material.fundId) || 0,
    name: String(material.name ?? ""),
    amount: Number(material.amount) || 0,
    equipment: Boolean(material.equipment),
    level: material.level === null || material.level === undefined ? null : Number(material.level),
    icon: await exportUiAsset(String(material.iconCode ?? ""), outputEquipmentDir, "equipment"),
  };
}

const equipmentCatalog = {
  source: equipmentCatalogSource.source,
  summary: equipmentCatalogSource.summary,
  slots: await Promise.all(equipmentCatalogSource.slots.map(async (slot) => ({
    tag: Number(slot.tag),
    name: String(slot.name ?? ""),
    icon: await exportUiAsset(String(slot.iconCode ?? ""), outputSlotDir, "slots"),
    vehicleKind: String(slot.vehicleKind ?? "ground"),
    order: Number(slot.order) || 0,
  }))),
  families: await Promise.all(equipmentCatalogSource.families.map(async (family) => ({
    id: String(family.id),
    name: String(family.name ?? ""),
    description: cleanMarkup(family.description ?? ""),
    slotTag: Number(family.slotTag),
    advanced: Boolean(family.advanced),
    icon: await exportUiAsset(String(family.iconCode ?? ""), outputEquipmentDir, "equipment"),
    typeIcon: await exportUiAsset(String(family.typeIconCode ?? ""), outputSlotDir, "slots"),
    minLevel: Number(family.minLevel) || 1,
    maxLevel: Number(family.maxLevel) || 1,
    levels: await Promise.all(family.levels.map(async (level) => ({
      fundId: Number(level.fundId) || 0,
      level: Number(level.level) || 1,
      icon: await exportUiAsset(String(level.iconCode ?? family.iconCode ?? ""), outputEquipmentDir, "equipment"),
      stats: level.stats,
      hiddenStats: {
        fireproof: Number(level.hiddenStats?.fireproof) || 0,
        homogeneity: Number(level.hiddenStats?.homogeneity) || 0,
        coverage: Number(level.hiddenStats?.coverage) || 0,
      },
      effects: (level.effects ?? []).map((effect) => ({
        skillId: Number(effect.skillId) || 0,
        templateId: Number(effect.templateId) || 0,
        value: Number(effect.value) || 0,
        name: String(effect.name ?? "装备特效"),
        description: cleanMarkup(effect.description ?? ""),
        text: cleanMarkup(effect.text ?? ""),
      })),
      recipe: level.recipe ? {
        ruleId: Number(level.recipe.ruleId) || 0,
        targetAmount: Number(level.recipe.targetAmount) || 1,
        materials: await Promise.all(level.recipe.materials.map(prepareEquipmentMaterial)),
      } : null,
      cumulative: await Promise.all(level.cumulative.map(prepareEquipmentMaterial)),
    }))),
  }))),
};
await fs.writeFile(equipmentCatalogOutputPath, JSON.stringify(equipmentCatalog));

await prepareTechnologyCatalog();

function addResistanceIcons(options) {
  return options.map((option) => ({
    ...option,
    resistanceDetails: option.resistance.map((name) => ({ name, image: resistanceIcons[name] ?? "" })),
  }));
}

let artCount = 0;
let rotatedArtCount = 0;
let officialHeadCount = 0;
let fallbackHeadCount = 0;
let live2dArtCount = 0;
const artById = new Map();
const liveJobs = [];
for (const row of source.rows) {
  const id = row["钢舞姬卡牌ID"];
  const staticArt = await locateArt(row["模型ID"]);
  const liveModel = await locateLiveModel(row["模型ID"]);
  // The client uses two distinct model branches. An RMC that explicitly names
  // a __200 atlas is a static armature; an RMC with only the character
  // directory is loaded through CreateHeadRole2 as Live2D. Falling back to a
  // same-named static directory in the latter case cross-wires characters such
  // as BT-5 (Live2D bt2_a) with BT-2 (static bt2_a__200).
  if (staticArt?.explicit || (!liveModel && staticArt)) {
    artById.set(id, { ...staticArt, kind: "static" });
    continue;
  }
  if (!liveModel) continue;
  const outputPath = path.join(live2dCacheDir, `${id}.png`);
  if (!(await isFresh(outputPath, liveModel.files))) liveJobs.push({ id, modelPath: liveModel.modelPath, outputPath });
  artById.set(id, { imagePath: outputPath, plistPath: null, kind: "live2d" });
}
const liveResults = await renderLive2dBatch(liveJobs);
const liveFailures = liveResults.filter((result) => !result.ready);
for (const failure of liveFailures) {
  artById.delete(failure.id);
  console.warn(`Live2D render failed for ${failure.id}: ${failure.error}`);
}
const rows = [];
const magicAssetCache = new Map();
async function magicAsset(code) {
  if (!code) return "";
  if (!magicAssetCache.has(code)) magicAssetCache.set(code, await exportUiAsset(code, outputMagicOrdnanceDir, "magic-ordnance"));
  return magicAssetCache.get(code);
}
const magicProgression = {
  ordnanceBonuses: magicProgressionSource.ordnanceBonuses ?? [],
  markIcons: Object.fromEntries(await Promise.all(Object.entries(magicProgressionSource.markIcons ?? {}).map(async ([name, code]) => [name, await magicAsset(code)]))),
  tactics: await Promise.all((magicProgressionSource.tactics ?? []).map(async (tactic) => ({
    ...tactic, image: await magicAsset(tactic.iconCode),
  }))),
  progression: {},
};
for (const [stage, vehicles] of Object.entries(magicProgressionSource.progression ?? {})) {
  magicProgression.progression[stage] = {};
  for (const [vehicle, kinds] of Object.entries(vehicles)) {
    magicProgression.progression[stage][vehicle] = {};
    for (const [kind, paths] of Object.entries(kinds)) {
      magicProgression.progression[stage][vehicle][kind] = await Promise.all(paths.map(async (upgradePath) => ({
        ...upgradePath,
        levels: await Promise.all(upgradePath.levels.map(async (upgradeLevel) => ({
          ...upgradeLevel,
          materials: await Promise.all(upgradeLevel.materials.map(async (material) => ({
            ...material, image: await magicAsset(material.iconCode),
          }))),
        }))),
      })));
    }
  }
}
const magicPathBySelector = new Map();
for (const [stage, vehicles] of Object.entries(magicProgression.progression)) {
  for (const [vehicle, kinds] of Object.entries(vehicles)) {
    for (const [kind, paths] of Object.entries(kinds)) {
      for (const upgradePath of paths) {
        if (magicPathBySelector.has(upgradePath.selectorId)) throw new Error(`Duplicate magic recipe selector ${upgradePath.selectorId}`);
        magicPathBySelector.set(upgradePath.selectorId, { stage, vehicle, kind });
      }
    }
  }
}
for (const row of source.rows) {
  const id = row["钢舞姬卡牌ID"];
  const sourceArt = artById.get(id);
  const magicOrdnance = await Promise.all((magicOrdnanceById.get(Number(id)) ?? []).map(async (item) => ({
    trendId: Number(item.trendId) || 0,
    talentId: Number(item.talentId) || 0,
    skillId: Number(item.skillId) || 0,
    name: String(item.name ?? ""),
    image: await exportUiAsset(String(item.iconCode ?? ""), outputMagicOrdnanceDir, "magic-ordnance"),
    levels: (item.levels ?? []).map((skillLevel) => ({
      level: Number(skillLevel.level) || 1,
      intensity: Number(skillLevel.intensity) || 0,
      timing: String(skillLevel.timing ?? ""),
      effect: String(skillLevel.effect ?? ""),
      condition: String(skillLevel.condition ?? ""),
    })),
  })));
  const sourceHead = await locateHead(row["模型ID"], roleModelById, uiStyleByCode);
  let image = "";
  let headImage = "";
  let rotation = 0;
  if (sourceArt) {
    rotation = await textureRotation(sourceArt);
    const targetName = sharp ? `${id}.webp` : `${id}.png`;
    const targetPath = path.join(outputArtDir, targetName);
    if (rotation || !(await isFresh(targetPath, [sourceArt.imagePath, prepareScriptPath]))) {
      if (sharp) {
        try {
          let pipeline = sharp(sourceArt.imagePath);
          if (rotation) pipeline = pipeline.rotate(rotation);
          if (sourceArt.kind === "live2d") {
            pipeline = pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
          }
          await pipeline.resize({ height: 900, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toFile(targetPath);
        } catch (error) {
          throw new Error(`Art export failed for card ${id} from ${sourceArt.imagePath}: ${error.message}`);
        }
      } else {
        await fs.copyFile(sourceArt.imagePath, targetPath);
      }
    }
    image = `/art/maidens/${targetName}`;
    artCount += 1;
    if (rotation) rotatedArtCount += 1;
    if (sourceArt.kind === "live2d") live2dArtCount += 1;
  }
  if (sourceHead || sourceArt) {
    const headName = sharp ? `${id}.webp` : `${id}.png`;
    const headPath = path.join(outputHeadDir, headName);
    if (sharp) {
      if (sourceHead) {
        await sharp(sourceHead).resize({ height: 72, withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 92 }).toFile(headPath);
        officialHeadCount += 1;
      } else {
        let pipeline = sharp(sourceArt.imagePath);
        if (rotation) pipeline = pipeline.rotate(rotation);
        await pipeline.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize({ width: 112, height: 72, fit: "cover", position: "north" }).webp({ quality: 82, alphaQuality: 90 }).toFile(headPath);
        fallbackHeadCount += 1;
      }
    } else {
      await fs.copyFile(sourceHead ?? sourceArt.imagePath, headPath);
      if (sourceHead) officialHeadCount += 1; else fallbackHeadCount += 1;
    }
    headImage = `/art/heads/${headName}`;
  }

  const stats = {};
  for (const level of source.levels) {
    stats[level] = Object.fromEntries(Object.entries(statLabels).map(([key, label]) => [key, row[`${level}级_${label}`] ?? null]));
  }
  const engineOptions = addResistanceIcons(await compatibilityOptions(row["可用引擎"], row["引擎类型"], row["引擎可提供抗性"], row["引擎工艺ID"]));
  const bodyOptions = addResistanceIcons(await compatibilityOptions(row["可用车体"], row["车体类型"], row["车体可提供抗性"], row["车体工艺ID"]));
  const armorOptions = addResistanceIcons(await compatibilityOptions(row["可用装甲"], "", "", ""));
  const ammunition = await ammunitionOptions(row["最高阶段弹药"]);
  const allAmmunition = await ammunitionOptions(row["全部阶段弹药"]);
  const slots = splitList(row["装备槽类型"]);
  const classId = Number(row["兵种ID"]) || 0;
  const magicSelectors = magicProgressionSource.selectorsByCard?.[String(id)];
  if (!magicSelectors) throw new Error(`Missing client magic recipe selectors for card ${id}`);
  for (const kind of ["ordnance", "tactics"]) {
    const recipe = magicPathBySelector.get(magicSelectors[kind]);
    if (!recipe || recipe.kind !== kind) {
      throw new Error(`Invalid ${kind} magic recipe ${magicSelectors[kind]} for card ${id}`);
    }
  }

  if (!implementationById.has(id)) throw new Error(`Missing implementation status for card ${id}`);
  rows.push({
    id,
    implemented: implementationById.get(id).implemented,
    tank: row["坦克/载具名称"] || `未命名单位 ${id}`,
    person: row["对应人名"] || "人物资料未配置",
    nation: row["国籍/技术归属"],
    className: row["兵种"],
    classId,
    classIcon: classIcons[classId] ?? "",
    rarity: row["稀有度"],
    rarityId: row["稀有度ID"],
    rarityColor: row["稀有度颜色"],
    stage: row["科技阶段"],
    ammo: splitList(row["可使用弹药类型"]),
    ammoDetail: splitList(row["弹药工艺明细"]),
    ammunition,
    allAmmunition,
    slots,
    slotDetails: slots.filter((name) => name !== "未配置").map((name) => ({ name, image: slotIcons[name] ?? "" })),
    engine: { name: row["引擎类型"], resistance: splitList(row["引擎可提供抗性"]) },
    body: { name: row["车体类型"], resistance: splitList(row["车体可提供抗性"]) },
    engineOptions,
    bodyOptions,
    armorOptions,
    grades: {
      fireproof: { grade: row["阻燃评级"], value: row["阻燃后台值"] },
      homogeneity: { grade: row["均质度评级"], value: row["均质度后台值"] },
      coverage: { grade: row["覆盖度评级"], value: row["覆盖度后台值"] },
    },
    talents: talentById.get(id) ?? [],
    artist: row["画师"],
    cv: row["声优/CV（全部语言配置）"],
    age: row["年龄"],
    birthday: row["生日"],
    department: row["所属部门/阵营"],
    bloodType: row["血型"],
    height: row["身高"],
    job: row["职务"],
    profile: cleanMarkup(row["人物简介"]),
    tankProfile: cleanMarkup(row["载具简介"]),
    generations: row["可用代数"],
    status: row["数据状态"],
    modelId: row["模型ID"],
    appearanceId: row["外观ID"],
    image,
    headImage,
    acquisition: acquisitionRoutesFor(id, row["坦克/载具名称"], acquisitionById, researchTargetIds, acquisitionOverrides),
    magicOrdnance,
    magicSelectors,
    stats,
  });
  const preparedRow = rows[rows.length - 1];
  const attackType = Number(appearanceById.get(Number(preparedRow.appearanceId))?.attack_type) || 0;
  preparedRow.nationTypeId = attackType;
  preparedRow.nationIcon = nationIcons[attackType] ?? "";
  preparedRow.rarityIcon = rarityIcons[Number(preparedRow.rarityId)] ?? "";
  preparedRow.stageIcon = stageIcons[String(preparedRow.stage)] ?? "";
  preparedRow.talents = preparedRow.talents.map((talent) => ({ ...talent, image: talentIcons[talent.name] ?? "" }));
  preparedRow.huntTraits = huntTraitsById.get(Number(preparedRow.id)) ?? [];
}

const facets = {
  nations: [...new Set(rows.map((row) => row.nation))].sort(),
  classes: [...new Set(rows.map((row) => row.className))].sort(),
  stages: [...new Set(rows.map((row) => row.stage))].sort(),
  rarities: [...new Set(rows.map((row) => row.rarity))],
  ammunition: [...new Set(rows.flatMap((row) => row.ammo))].sort(),
  engineResistances: [...new Set(rows.flatMap((row) => row.engineOptions.flatMap((option) => option.resistance)))].sort(),
  bodyResistances: [...new Set(rows.flatMap((row) => row.bodyOptions.flatMap((option) => option.resistance)))].sort(),
  talents: [...new Set(rows.flatMap((row) => row.talents.map((talent) => talent.name)))].sort(),
  huntTraits: [...new Set(rows.flatMap((row) => row.huntTraits.map((trait) => `${trait.task} ${trait.name}`)))],
};

const missingSlotIcons = [...new Set(rows.flatMap((row) => row.slotDetails.filter((item) => !item.image).map((item) => item.name)))];
const missingResistanceIcons = [...new Set(rows.flatMap((row) => [...row.engineOptions, ...row.bodyOptions, ...row.armorOptions].flatMap((option) => option.resistanceDetails.filter((item) => !item.image).map((item) => item.name))))];
const missingClassIcons = [...new Set(rows.filter((row) => row.className && !row.classIcon).map((row) => `${row.classId}:${row.className}`))];
const missingNationIcons = [...new Set(rows.filter((row) => row.nation && !row.nationIcon).map((row) => `${row.nationTypeId}:${row.nation}`))];
const missingRarityIcons = [...new Set(rows.filter((row) => row.rarity && !row.rarityIcon).map((row) => `${row.rarityId}:${row.rarity}`))];
const missingStageIcons = [...new Set(rows.filter((row) => row.stage && row.stage !== "未配置" && !row.stageIcon).map((row) => row.stage))];
const missingTalentIcons = [...new Set(rows.flatMap((row) => row.talents.filter((item) => !item.image).map((item) => item.name)))];
if (missingNationIcons.length) console.warn(`Nation sprites referenced by UIStyle but absent from the available base/summary/active resource snapshots: ${missingNationIcons.join(",")}`);
if (missingSlotIcons.length || missingResistanceIcons.length || missingClassIcons.length || missingRarityIcons.length || missingStageIcons.length || missingTalentIcons.length) {
  throw new Error(`Game icon mapping incomplete: slots=${missingSlotIcons.join(",") || "none"}; resistances=${missingResistanceIcons.join(",") || "none"}; classes=${missingClassIcons.join(",") || "none"}; nations=${missingNationIcons.join(",") || "none"}; rarities=${missingRarityIcons.join(",") || "none"}; stages=${missingStageIcons.join(",") || "none"}; talents=${missingTalentIcons.join(",") || "none"}`);
}

const magicCostReport = organizeMagicCosts(rows, magicProgression.progression);
const magicCostById = new Map(magicCostReport.cards.map((card) => [card.id, card.group]));
for (const row of rows) row.magicCostGroup = magicCostById.get(row.id);
await fs.writeFile(path.join(appRoot, "public", "data", "magic-cost-groups.json"), JSON.stringify(magicCostReport));
await prepareTablePortraits(rows);
await fs.writeFile(outputDataPath, JSON.stringify({ generatedAt: new Date().toISOString(), implementation: { asOf: implementationRoster.asOf, counts: implementationRoster.counts }, levels: source.levels, statLabels, attributeIcons, magicProgression, gameIcons: { slots: slotIcons, resistances: resistanceIcons, classes: classIcons, nations: nationIcons, rarities: rarityIcons, stages: stageIcons, talents: talentIcons }, artCount, rotatedArtCount, live2dArtCount, officialHeadCount, fallbackHeadCount, facets, rows }));
// Skin availability follows client tags, not all conditional appearances.
execFileSync(process.execPath, [path.join(appRoot, "scripts", "prepare-ammunition-efficiency.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.execPath, [path.join(appRoot, "scripts", "prepare-skins.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(projectRoot, "analysis_apk", "tools", "build_maiden_quotes.py")], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
// Match card artwork to the same native model configuration as the new catalog.
execFileSync(process.execPath, [path.join(appRoot, "scripts", "prepare-card-framing.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.execPath, [path.join(appRoot, "scripts", "prepare-card-person-labels.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
// Rebuild executable loadout rules from the same client snapshot and the freshly
// exported catalog; display-card previews must never become calculation inputs.
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(projectRoot, "analysis_apk", "tools", "build_slot_unlocks.py")], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(projectRoot, "analysis_apk", "tools", "export_loadout_assessment_icons.py")], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(projectRoot, "analysis_apk", "tools", "build_loadout_rules.py")], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
await fs.copyFile(growthCurvesSourcePath, growthCurvesOutputPath);
await prepareColonizationCatalog();
console.log(JSON.stringify({ records: rows.length, attributeIcons, gameIconCounts: { slots: Object.keys(slotIcons).length, resistances: Object.keys(resistanceIcons).length, classes: Object.keys(classIcons).length, nations: Object.keys(nationIcons).length, rarities: Object.keys(rarityIcons).length, stages: Object.keys(stageIcons).length, talents: Object.keys(talentIcons).length }, artCount, rotatedArtCount, live2dArtCount, officialHeadCount, fallbackHeadCount, live2dRenderFailures: liveFailures.length, outputDataPath, sharp: Boolean(sharp) }, null, 2));
