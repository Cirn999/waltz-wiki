import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataPath = path.join(root, "public", "data", "maidens.json");
const researchPath = path.join(root, "public", "data", "research-tree.json");
const sourceDataPath = path.resolve(
  root,
  "..",
  "analysis_apk",
  "output",
  "steel_maiden_catalog_v4",
  "钢舞姬汇总数据.json",
);
const sourceMagicPath = path.resolve(root, "..", "analysis_apk", "output", "magic_ordnance", "magic_ordnance_catalog.json");
const payload = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const research = JSON.parse(fs.readFileSync(researchPath, "utf8"));
const sourcePayload = JSON.parse(fs.readFileSync(sourceDataPath, "utf8"));
const sourceMagic = JSON.parse(fs.readFileSync(sourceMagicPath, "utf8"));
const expectedAttributeIcons = ["火力", "耐久", "隐蔽", "穿甲", "装甲", "侦查", "命中", "回避", "射程", "点燃"];
const missingAttributeIcons = expectedAttributeIcons.filter((label) => {
  const publicPath = payload.attributeIcons?.[label];
  return !publicPath || !fs.existsSync(path.join(root, "public", publicPath.replace(/^\//, "")));
});
const records = Array.isArray(payload)
  ? payload
  : Array.isArray(payload.records)
    ? payload.records
    : Array.isArray(payload.maidens)
      ? payload.maidens
      : Array.isArray(payload.rows)
        ? payload.rows
      : [];
const levels = Array.isArray(payload.levels) ? payload.levels : [];
const artRecords = records.filter((record) => record.image);
const missingArt = records.filter((record) => !record.image);
const headRecords = records.filter((record) => record.headImage);
const missingHeads = records.filter((record) => !record.headImage);
const losat = records.find((record) => record.tank === "LOSAT");
const t39 = records.find((record) => record.tank === "T39");
const mu = records.find((record) => record.person === "缪");
const alisa = records.find((record) => record.tank === "艾丽莎" || record.person === "艾丽莎");
const assaultTiger = records.find((record) => record.id === 6121);
const expectedRecordCount = Array.isArray(sourcePayload.rows) ? sourcePayload.rows.length : 0;
const missingFiles = artRecords.filter((record) => {
  const localPath = path.join(root, "public", record.image.replace(/^\//, ""));
  return !fs.existsSync(localPath);
});
const missingHeadFiles = headRecords.filter((record) => {
  const localPath = path.join(root, "public", record.headImage.replace(/^\//, ""));
  return !fs.existsSync(localPath);
});

const requiredKeys = [
  "tank",
  "person",
  "className",
  "rarity",
  "stage",
  "ammo",
  "ammunition",
  "slots",
  "engine",
  "body",
  "engineOptions",
  "bodyOptions",
  "armorOptions",
  "grades",
  "talents",
  "magicOrdnance",
  "stats",
];
const incomplete = records.filter((record) => requiredKeys.some((key) => record[key] == null));
const ammunition = records.flatMap((record) => record.ammunition ?? []);
const ammunitionWithoutImages = ammunition.filter((ammo) => !ammo.image);
const ammunitionEffects = ammunition.flatMap((ammo) => ammo.effects ?? []);
const ammunitionStatKeys = [...new Set(ammunition.flatMap((ammo) => (ammo.stats ?? []).map((stat) => stat.key)))].sort();
const ammunitionEffectsWithoutImages = ammunitionEffects.filter((effect) => !effect.image);
const allowedAmmoStats = new Set(["耐久", "火力", "穿甲", "命中", "装甲", "回避", "射程", "射程段", "隐蔽", "侦查"]);
const invalidAmmunitionStats = ammunition.filter((ammo) => {
  const stats = ammo.stats ?? [];
  const keys = new Set(stats.map((stat) => stat.key));
  return stats.length < 3 || stats.length > 5 || keys.size !== stats.length || stats.some((stat) => !allowedAmmoStats.has(stat.key));
});
const ammunitionWithoutRange = ammunition.filter((ammo) => !(ammo.stats ?? []).some((stat) => stat.key === "射程"));
const expectedAmmoWithoutRange = new Set([6561, 6567]);
const expectedLosatAmmoStats = new Map([
  [5372, { 火力: 415, 穿甲: 765, 命中: 75, 隐蔽: 95, 射程: 5240 }],
  [5382, { 火力: 710, 穿甲: 520, 回避: 80, 射程: 5240 }],
  [5384, { 火力: 440, 穿甲: 730, 命中: 130, 隐蔽: 20, 射程: 5240 }],
  [5583, { 火力: 1200, 穿甲: 440, 命中: 185, 射程: 10660 }],
  [5587, { 火力: 1380, 穿甲: 450, 命中: 80, 射程: 10660 }],
]);
const sameStatMap = (actual, expected) => {
  const expectedEntries = Object.entries(expected);
  return Object.keys(actual).length === expectedEntries.length
    && expectedEntries.every(([key, value]) => actual[key] === value);
};
const invalidLosatAmmoStats = (losat?.ammunition ?? []).filter((ammo) => {
  const expected = expectedLosatAmmoStats.get(ammo.id);
  if (!expected) return false;
  const actual = Object.fromEntries(ammo.stats.map((stat) => [stat.key, stat.value]));
  return !sameStatMap(actual, expected);
});
const muRocket = mu?.ammunition.find((ammo) => ammo.name === "尾翼蜂巢型火箭弹(中口径)");
const muRocketStats = Object.fromEntries((muRocket?.stats ?? []).map((stat) => [stat.key, stat.value]));
const muRocketStatsValid = sameStatMap(muRocketStats, { 火力: 1500, 穿甲: 460, 命中: 185, 射程: 11000 });
const mixedAmmoRanks = records.flatMap((record) => [...new Set(record.ammunition.map((ammo) => ammo.type))].filter((type) => new Set(record.ammunition.filter((ammo) => ammo.type === type).map((ammo) => ammo.rank)).size > 1).map((type) => ({ id: record.id, type })));
const sharedAmmo5372 = records.flatMap((record) => (record.ammunition ?? [])
  .filter((ammo) => ammo.id === 5372)
  .map((ammo) => ({ cardId: record.id, stats: Object.fromEntries(ammo.stats.map((stat) => [stat.key, stat.value])) })));
const sharedAmmo5372RangeValues = new Set(sharedAmmo5372.map((entry) => entry.stats["射程"]));
const expectedAmmunitionCount = sourcePayload.rows.reduce((sum, row) => sum + (row["最高阶段弹药数量"] ?? 0), 0);
const craftOptions = records.flatMap((record) => [
  ...(record.engineOptions ?? []).map((option) => ({ ...option, category: "engine" })),
  ...(record.bodyOptions ?? []).map((option) => ({ ...option, category: "body" })),
  ...(record.armorOptions ?? []).map((option) => ({ ...option, category: "armor" })),
]);
const highestRankOptions = (options, category) => {
  const highest = Math.max(0, ...options.map((option) => option.rank ?? 0));
  return options.filter((option) => !highest || option.rank === highest).map((option) => ({ ...option, category }));
};
const highestCraftOptions = records.flatMap((record) => [
  ...highestRankOptions(record.engineOptions ?? [], "engine"),
  ...highestRankOptions(record.bodyOptions ?? [], "body"),
  ...highestRankOptions(record.armorOptions ?? [], "armor"),
]);
const craftOptionsWithoutStats = highestCraftOptions.filter((option) => !(option.stats ?? []).length);
const statMap = (option) => Object.fromEntries((option?.stats ?? []).map((stat) => [stat.key, stat.value]));
const t39EngineStats = statMap(t39?.engineOptions.find((option) => option.id === 6071));
const t39BodyStats = statMap(t39?.bodyOptions.find((option) => option.id === 7066));
const t39CraftStatsValid = JSON.stringify(t39EngineStats) === JSON.stringify({ "命中": 70, "回避": 95, "隐蔽": 45 })
  && JSON.stringify(t39BodyStats) === JSON.stringify({ "耐久": 2075, "命中": 135, "装甲": 235, "侦查": 35 });
const craftOptionsWithoutImages = craftOptions.filter((option) => !option.image);
const resistanceProfileCount = (options) => new Set(options.map((option) => option.resistance.join("|"))).size;
const talentNames = [...new Set(records.flatMap((record) => record.talents.map((talent) => talent.name)))].sort();
const talentFacets = [...(payload.facets?.talents ?? [])].sort();
const magicOrdnance = records.flatMap((record) => record.magicOrdnance ?? []);
const expectedMagicOrdnanceCount = Object.values(sourceMagic.rows ?? {}).reduce((sum, rows) => sum + rows.length, 0);
const magicOrdnanceWithoutImages = magicOrdnance.filter((skill) => !skill.image || !fs.existsSync(path.join(root, "public", skill.image.replace(/^\//, ""))));
const invalidMagicOrdnance = magicOrdnance.filter((skill) => !skill.name || !(skill.levels?.length > 0) || skill.levels.some((level) => !Number.isInteger(level.level) || !level.timing || !level.effect));
const t39MagicNames = (t39?.magicOrdnance ?? []).map((skill) => skill.name).sort();
const researchNodeIds = new Set(research.nodes.map((node) => node.id));
const researchRecipeIds = new Set(research.recipes.map((recipe) => recipe.id));
const churchillMkVII = research.recipes.find((recipe) => recipe.targetId === 6007);
const wz131Recipes = research.recipes.filter((recipe) => recipe.target?.tank === "WZ-131");
const invalidResourcePlans = research.recipes.flatMap((recipe) => recipe.resourcePlans ?? []).filter((plan) =>
  plan.commanderLevel != null && (!Number.isInteger(plan.commanderLevel) || plan.commanderLevel < 1) ||
  !Array.isArray(plan.resources) ||
  plan.resources.some((resource) => !resource.name || !Number.isInteger(resource.amount) || resource.amount < 1)
);
const researchPlanCount = research.recipes.reduce((sum, recipe) => sum + (recipe.resourcePlans?.length ?? 0), 0);
const researchEquipmentResources = research.recipes.flatMap((recipe) => recipe.resourcePlans ?? [])
  .flatMap((plan) => plan.resources ?? [])
  .filter((resource) => resource.category === "equipment");
const invalidEquipmentGrades = researchEquipmentResources.filter((resource) =>
  !Number.isInteger(resource.equipmentRank) ||
  resource.equipmentRank < 1 ||
  resource.equipmentGrade !== `S${resource.equipmentRank}`
);
const wz131AmmoWaterJackets = wz131Recipes.flatMap((recipe) => recipe.resourcePlans ?? [])
  .flatMap((plan) => plan.resources ?? [])
  .filter((resource) => resource.fundId === 12314);
const churchillPlans = churchillMkVII?.resourcePlans ?? [];
const brokenResearchLinks = research.recipes.filter((recipe) =>
  !researchNodeIds.has(recipe.targetId) ||
  recipe.requirements.some((requirement) => !researchNodeIds.has(requirement.cardId)) ||
  recipe.requirements.length < 1 || recipe.requirements.length > 3
);
const branchingResearchNodes = research.nodes.map((node) => ({
  id: node.id,
  tank: node.tank,
  targets: [...new Set(node.downstream.map((entry) => entry.targetId))],
})).filter((node) => node.targets.length > 1).sort((left, right) => right.targets.length - left.targets.length);

console.log(
  JSON.stringify(
    {
      payloadType: Array.isArray(payload) ? "array" : Object.keys(payload),
      records: records.length,
      uniqueMaidens: new Set(records.map((record) => record.id)).size,
      levels,
      attributeIcons: payload.attributeIcons ?? {},
      missingAttributeIcons,
      artReferences: artRecords.length,
      rotatedArtReferences: payload.rotatedArtCount ?? 0,
      live2dArtReferences: payload.live2dArtCount ?? 0,
      missingArtReferences: missingArt.length,
      missingArtRecords: missingArt.map((record) => ({ id: record.id, tank: record.tank, person: record.person, modelId: record.modelId })),
      missingArtFiles: missingFiles.length,
      officialHeadReferences: payload.officialHeadCount ?? 0,
      fallbackHeadReferences: payload.fallbackHeadCount ?? 0,
      missingHeadReferences: missingHeads.length,
      missingHeadFiles: missingHeadFiles.length,
      incompleteRecords: incomplete.length,
      expectedRecords: expectedRecordCount,
      talentFacets: talentFacets.length,
      ammunition: {
        highestStageCrafts: ammunition.length,
        statKeys: ammunitionStatKeys,
        expectedHighestStageCrafts: expectedAmmunitionCount,
        missingCraftImages: ammunitionWithoutImages.length,
        effects: ammunitionEffects.length,
        missingEffectImages: ammunitionEffectsWithoutImages.length,
        invalidPropertyShapes: invalidAmmunitionStats.length,
        invalidPropertyRecords: invalidAmmunitionStats.map((ammo) => ({ id: ammo.id, name: ammo.name, stats: ammo.stats })),
        missingRange: ammunitionWithoutRange.length,
        missingRangeRecords: ammunitionWithoutRange.map((ammo) => ({ id: ammo.id, name: ammo.name })),
        invalidLosatStats: invalidLosatAmmoStats,
        muRocket: { valid: muRocketStatsValid, stats: muRocketStats },
        sharedAmmo5372Cards: sharedAmmo5372.length,
        sharedAmmo5372DistinctRanges: sharedAmmo5372RangeValues.size,
        mixedRanksWithinType: mixedAmmoRanks.length,
      },
      crafts: {
        options: craftOptions.length,
        highestStageOptions: highestCraftOptions.length,
        missingImages: craftOptionsWithoutImages.length,
        missingStats: craftOptionsWithoutStats.length,
        t39KnownValues: { valid: t39CraftStatsValid, engine: t39EngineStats, body: t39BodyStats },
      },
      magicOrdnance: {
        configuredMaidens: records.filter((record) => (record.magicOrdnance ?? []).length).length,
        skillInstances: magicOrdnance.length,
        uniqueSkills: new Set(magicOrdnance.map((skill) => skill.skillId)).size,
        missingImages: magicOrdnanceWithoutImages.length,
        invalidSkills: invalidMagicOrdnance.length,
        t39: (t39?.magicOrdnance ?? []).map((skill) => ({ name: skill.name, levels: skill.levels.length, first: skill.levels[0], last: skill.levels.at(-1) })),
      },
      research: {
        nodes: research.nodes.length,
        recipes: research.recipes.length,
        uniqueRecipeIds: researchRecipeIds.size,
        edges: research.recipes.reduce((sum, recipe) => sum + recipe.requirements.length, 0),
        resourcePlans: researchPlanCount,
        invalidResourcePlans: invalidResourcePlans.length,
        equipmentResources: researchEquipmentResources.length,
        invalidEquipmentGrades: invalidEquipmentGrades.length,
        wz131AmmoWaterJackets: wz131AmmoWaterJackets.map((resource) => ({
          id: resource.fundId,
          name: resource.name,
          grade: resource.equipmentGrade,
          amount: resource.amount,
        })),
        brokenLinks: brokenResearchLinks.length,
        branchingNodes: branchingResearchNodes.length,
        widestBranch: branchingResearchNodes[0] ?? null,
        churchillMkVIIRequirements: churchillMkVII?.requirements.map((item) => ({ id: item.cardId, generation: item.generation, level: item.level })) ?? null,
        churchillMkVIIResourcePlans: churchillPlans.map((plan) => ({
          commanderLevel: plan.commanderLevel,
          resources: plan.resources.map((resource) => ({ id: resource.fundId, name: resource.name, amount: resource.amount, category: resource.category })),
        })),
      },
      alisa: alisa
        ? {
            id: alisa.id,
            personName: alisa.person,
            vehicleClass: alisa.className,
            stage: alisa.stage,
            ammo: alisa.ammo,
            image: alisa.image,
            headImage: alisa.headImage,
            statsAt60: alisa.stats?.["60"],
          }
        : null,
      assaultTiger: assaultTiger
        ? {
            personName: assaultTiger.person,
            modelId: assaultTiger.modelId,
            image: assaultTiger.image,
            headImage: assaultTiger.headImage,
          }
        : null,
      losat: losat
        ? {
            personName: losat.person,
            vehicleClass: losat.className,
            rarity: losat.rarity,
            stage: losat.stage,
            ammo: losat.ammo,
            image: losat.image,
            statsAt60: losat.stats?.["60"],
            highestStageAmmunition: losat.ammunition,
          }
        : null,
      t39: t39
        ? {
            engineCrafts: t39.engineOptions,
            bodyCrafts: t39.bodyOptions,
            armorCrafts: t39.armorOptions,
            engineResistanceProfiles: resistanceProfileCount(t39.engineOptions),
            bodyResistanceProfiles: resistanceProfileCount(t39.bodyOptions),
          }
        : null,
    },
    null,
    2,
  ),
);

if (
  records.length !== expectedRecordCount ||
  missingAttributeIcons.length ||
  missingFiles.length ||
  missingHeadFiles.length ||
  incomplete.length ||
  !losat ||
  !t39 ||
  t39.engineOptions.length !== 3 ||
  t39.bodyOptions.length !== 5 ||
  t39.armorOptions.length !== 18 ||
  resistanceProfileCount(t39.engineOptions) !== 1 ||
  resistanceProfileCount(t39.bodyOptions) !== 2 ||
  talentNames.join("|") !== talentFacets.join("|") ||
  ammunition.length !== expectedAmmunitionCount ||
  ammunitionWithoutImages.length ||
  ammunitionEffectsWithoutImages.length ||
  invalidAmmunitionStats.length ||
  ammunitionWithoutRange.some((ammo) => !expectedAmmoWithoutRange.has(ammo.id)) ||
  invalidLosatAmmoStats.length ||
  !muRocketStatsValid ||
  sharedAmmo5372.length < 2 ||
  sharedAmmo5372RangeValues.size < 2 ||
  mixedAmmoRanks.length ||
  craftOptionsWithoutImages.length ||
  craftOptionsWithoutStats.length ||
  magicOrdnance.length !== expectedMagicOrdnanceCount ||
  magicOrdnanceWithoutImages.length ||
  invalidMagicOrdnance.length ||
  records.some((record) => !(record.magicOrdnance?.length > 0)) ||
  t39MagicNames.join("|") !== ["分析打击", "多重火力装置", "附配掩体", "应急掩护"].sort().join("|") ||
  !t39CraftStatsValid ||
  !alisa ||
  !alisa.image ||
  !alisa.headImage ||
  !assaultTiger ||
  !assaultTiger.image ||
  !assaultTiger.headImage ||
  !(payload.live2dArtCount > 0)
  || research.nodes.length !== research.meta.nodeCount
  || research.recipes.length !== research.meta.recipeCount
  || researchRecipeIds.size !== research.recipes.length
  || researchPlanCount !== research.meta.resourcePlanCount
  || research.recipes.some((recipe) => !Array.isArray(recipe.resourcePlans) || recipe.resourcePlans.length < 1)
  || invalidResourcePlans.length
  || researchEquipmentResources.length !== research.meta.equipmentResourceCount
  || researchEquipmentResources.length !== research.meta.equipmentGradeResolvedCount
  || invalidEquipmentGrades.length
  || wz131AmmoWaterJackets.length !== 2
  || wz131AmmoWaterJackets.some((resource) => resource.equipmentRank !== 6 || resource.equipmentGrade !== "S6")
  || brokenResearchLinks.length
  || !branchingResearchNodes.length
  || !churchillMkVII
  || churchillMkVII.requirements.length !== 3
  || !churchillPlans.some((plan) => plan.commanderLevel === 50)
  || !churchillPlans.some((plan) => plan.resources.some((resource) => resource.fundId === 1 && resource.amount === 2420000))
) {
  process.exitCode = 1;
}
