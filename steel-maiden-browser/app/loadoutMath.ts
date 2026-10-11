import type { GrowthCurveRow, GrowthStatKey } from "./growthCurveData";
import type { AmmoEfficiencyValues } from "./ammoEfficiencyData";
import { calculateNativePanel, nativePhaseForLevel, type NativeLoadoutRules, type NativeState } from "./nativeLoadout.ts";

export const simStats = [
  { key: "durability", label: "耐久" }, { key: "power", label: "火力" },
  { key: "piercing", label: "穿甲" }, { key: "accuracy", label: "命中" },
  { key: "armor", label: "装甲" }, { key: "evasion", label: "回避" },
  { key: "stealth", label: "隐蔽" }, { key: "recon", label: "侦查" },
] as const;
export type SimStatKey = (typeof simStats)[number]["key"];
export type SimColonizationKey = Exclude<SimStatKey, "stealth" | "recon">;
export type SimStat = { key: string; value: number; effectType: number };
export type SimGradeKey = "fireproof" | "homogeneity" | "coverage";
export type SimCraft = { id: number; name: string; rank: number; image: string; stats: SimStat[]; effects?: { name: string; description: string; image: string }[]; resistanceDetails?: { name: string; image: string }[]; efficiency?: AmmoEfficiencyValues };
export type SimAmmo = SimCraft & { type: string; typeImage: string };
export type SimEquipmentLevel = { level: number; fundId: number; icon: string; stats: SimStat[]; hiddenStats?: Partial<Record<SimGradeKey, number>>; effects: { skillId?: number; name: string; value: number; description: string }[] };
export type SimEquipmentFamily = { id: string; name: string; slotTag: number; advanced: boolean; icon: string; typeIcon: string; levels: SimEquipmentLevel[] };
export type SimEquipmentData = { slots: { tag: number; name: string; icon: string; vehicleKind: string }[]; families: SimEquipmentFamily[] };
export type SimTechBlock = { id: string; category: string; secondary: string; generation: number; iconCode?: string; nodes: { craftId: number; x: number; image: string; traits?: { name: string; description: string }[] }[]; levels: { level: number; attributes: { propertyId: number; effectType: number; name: string; value: number }[] }[] };
export type SimTechData = { blocks: SimTechBlock[]; categories: { name: string; secondary: string[] }[] };
export type SimMagicSkill = { trendId: number; name: string; image: string };
export type SimOrdnanceSkill = SimMagicSkill & { levels: { level: number; timing: string; effect: string; condition: string }[] };
export type SimMagicData = {
  progression: Record<string, Record<string, Record<string, { selectorId: number; levels: { level: number; scoutLevel: number; markKind: string; marks: number }[] }[]>>>;
  ordnanceBonuses: { level: number; bonuses: { name: string; percent: number }[] }[];
  tactics: (SimMagicSkill & { levels: { level: number; effects: { name: string; description: string; basePercent: number; equipmentPercent: number | null }[] }[] })[];
  markIcons: Record<string, string>;
};
export type SimMaiden = {
  id: number; tank: string; person: string; classId: number; image: string; headImage: string;
  ammo: string[];
  baseAmmoEfficiency?: AmmoEfficiencyValues;
  stage: string; stageIcon: string; rarityIcon: string; classIcon: string; nationIcon: string;
  stats: Record<string, Partial<Record<SimStatKey, number | null>>>;
  grades: Record<SimGradeKey, { grade: string; value: number | null }>;
  slotDetails: { name: string; image: string }[];
  allAmmunition: SimAmmo[]; engineOptions: SimCraft[]; bodyOptions: SimCraft[]; armorOptions: SimCraft[];
  magicOrdnance: SimOrdnanceSkill[]; magicSelectors: { ordnance: number; tactics: number };
};
export type SimColonization = Record<SimColonizationKey, number[]>;
export type SimSlotChoice = { familyId: string | null; level: number };
export type SimMagicChoice = { trendId: number | null; level: number };
export type SimConfig = {
  level: number;
  colonization: Record<SimColonizationKey, number>;
  equipment: SimSlotChoice[];
  ammoId: number;
  engineId: number | null;
  bodyId: number | null;
  armorId: number | null;
  ordnance: SimMagicChoice;
  tactics: SimMagicChoice;
};
export type SimTechLevels = Record<string, number>;

const growthKeys: GrowthStatKey[] = ["durability", "power", "piercing", "armor"];
export const clampLevel = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : min));
export const starCount = (level: number) => level >= 70 ? 3 : level >= 35 ? 2 : 1;
export const isAirMaiden = (maiden: SimMaiden) => maiden.classId >= 7 && maiden.classId <= 10;

export function defaultAmmo(maiden: SimMaiden): SimAmmo | undefined {
  return maiden.allAmmunition.find((ammo) => ammo.type === maiden.ammo?.[0] && ammo.rank === 1) ?? maiden.allAmmunition.find((ammo) => ammo.rank === 1) ?? maiden.allAmmunition[0];
}
export function defaultSimConfig(maiden: SimMaiden): SimConfig {
  return {
    level: 1,
    colonization: { durability: 0, power: 0, piercing: 0, accuracy: 0, armor: 0, evasion: 0 },
    equipment: maiden.slotDetails.map(() => ({ familyId: null, level: 1 })),
    ammoId: 0,
    engineId: null, bodyId: null, armorId: null,
    ordnance: { trendId: null, level: 0 }, tactics: { trendId: null, level: 0 },
  };
}

export function technologyPath(data: SimMagicData | undefined, selector: number) {
  for (const vehicles of Object.values(data?.progression ?? {}))
    for (const kinds of Object.values(vehicles))
      for (const variants of Object.values(kinds)) {
        const path = variants.find((item) => item.selectorId === selector);
        if (path) return path;
      }
  return undefined;
}

export function findCraftTech(data: SimTechData, category: string, craftId: number, rank?: number) {
  for (const block of data.blocks) {
    if (block.category !== category || (rank !== undefined && rank > 0 && block.generation !== rank)) continue;
    const node = block.nodes.find((item) => item.craftId === craftId);
    if (node) {
      const columns = [...new Set(block.nodes.map((item) => item.x))].sort((a, b) => a - b);
      return { block, node, requiredLevel: columns.indexOf(node.x) + 1 };
    }
  }
  return null;
}

export function craftGeneration(data: SimTechData, category: string, craft: SimCraft) {
  return craft.rank || findCraftTech(data, category, craft.id)?.block.generation || 1;
}

export function craftLockReason(maiden: SimMaiden, data: SimTechData, tech: SimTechLevels, category: string, craft: SimCraft, level: number) {
  const generation = craftGeneration(data, category, craft);
  if (generation > starCount(level)) return `${level}级仅开放${starCount(level)}期科技`;
  const unlock = findCraftTech(data, category, craft.id, craft.rank);
  if (!unlock) return "未找到对应科技节点";
  if ((tech[unlock.block.id] ?? 0) < unlock.requiredLevel) return `${unlock.block.secondary}·${craft.rank}期科技需要${unlock.requiredLevel}级`;
  return "";
}

export function relevantTechBranches(maiden: SimMaiden, config: SimConfig, data: SimTechData, rules?: NativeLoadoutRules) {
  if (rules) {
    const { phase } = nativePhaseForLevel(rules, maiden.id, config.level);
    return ([['主炮', 3, config.ammoId], ['防护', 6, config.armorId], ['车体', 5, config.bodyId], ['引擎', 4, config.engineId], ['侦查', 15, null]] as const).flatMap(([category, id, selection]) => {
      const c = phase.categories[id];
      if (!c) return [];
      const group = rules.groups[c.group];
      const effects = [...c.effects, ...(group?.items[selection || group?.default || 0] ?? [])];
      const propertyIds = new Set(effects.flatMap((e) => rules.effects[e].attributes.flatMap((a) => a.params.flatMap((p) => rules.params[p].inputs.flatMap((i) => i.properties)))));
      const block = data.blocks.find((b) => b.category === category && b.levels.some((l) => l.attributes.some((a) => propertyIds.has(a.propertyId))));
      return block ? [{ category, secondary: block.secondary, image: block.nodes[0]?.image }] : [];
    });
  }
  const air = isAirMaiden(maiden);
  const ammo = maiden.allAmmunition.find((item) => item.id === config.ammoId) ?? defaultAmmo(maiden);
  const armor = maiden.armorOptions.find((item) => item.id === config.armorId) ?? maiden.armorOptions[0];
  const ammoBranch = ammo ? findCraftTech(data, "主炮", ammo.id, ammo.rank)?.block.secondary : undefined;
  const armorBranch = armor ? findCraftTech(data, "防护", armor.id, armor.rank)?.block.secondary : undefined;
  const branches = [
    ammoBranch && { category: "主炮", secondary: ammoBranch, image: ammo?.image },
    armorBranch && { category: "防护", secondary: armorBranch, image: armor?.image },
    { category: "车体", secondary: air ? "航空机身" : "综合车身", image: maiden.bodyOptions[0]?.image },
    { category: "引擎", secondary: air ? "航空引擎" : "综合引擎", image: maiden.engineOptions[0]?.image },
    { category: "侦查", secondary: "综合索敌", image: "" },
  ];
  return branches.filter((entry): entry is { category: string; secondary: string; image: string | undefined } => Boolean(entry));
}

export function maximumMagicLevel(maiden: SimMaiden, data: SimMagicData | undefined, kind: "ordnance" | "tactics", scoutLevel: number) {
  const path = technologyPath(data, maiden.magicSelectors[kind]);
  return Math.max(0, ...(path?.levels.filter((entry) => entry.scoutLevel <= scoutLevel).map((entry) => entry.level) ?? []));
}

export function normalizeSimConfig(maiden: SimMaiden, config: SimConfig, equipment: SimEquipmentData, technologies: SimTechData, tech: SimTechLevels, magic?: SimMagicData) {
  const defaults = defaultSimConfig(maiden);
  const next: SimConfig = {
    ...defaults, ...config,
    level: clampLevel(config.level, 1, 99),
    colonization: { ...defaults.colonization, ...config.colonization },
    equipment: maiden.slotDetails.map((_, index) => ({ ...defaults.equipment[index], ...config.equipment?.[index] })),
    ordnance: { ...defaults.ordnance, ...config.ordnance }, tactics: { ...defaults.tactics, ...config.tactics },
  };
  for (const key of Object.keys(next.colonization) as SimColonizationKey[]) next.colonization[key] = clampLevel(next.colonization[key], 0, 12);
  const ammo = maiden.allAmmunition.find((item) => item.id === next.ammoId);
  if (next.ammoId !== 0 && (!ammo || craftLockReason(maiden, technologies, tech, "主炮", ammo, next.level))) next.ammoId = defaults.ammoId;
  for (const [field, options, category] of [
    ["engineId", maiden.engineOptions, "引擎"], ["bodyId", maiden.bodyOptions, "车体"], ["armorId", maiden.armorOptions, "防护"],
  ] as const) {
    const selected = options.find((item) => item.id === next[field]);
    if (!selected || craftLockReason(maiden, technologies, tech, category, selected, next.level)) next[field] = null;
  }
  next.equipment = next.equipment.map((slot, index) => {
    const family = equipment.families.find((item) => item.id === slot.familyId);
    const allowed = family && equipment.slots.some((item) => item.tag === family.slotTag && item.icon === maiden.slotDetails[index]?.image);
    return allowed ? { familyId: family.id, level: clampLevel(slot.level, family.levels[0]?.level ?? 1, family.levels.at(-1)?.level ?? 10) } : { familyId: null, level: 1 };
  });
  const scout = technologies.blocks.filter((block) => block.secondary === "综合索敌" && block.generation <= starCount(next.level)).reduce((total, block) => total + (tech[block.id] ?? 0), 0);
  for (const kind of ["ordnance", "tactics"] as const) {
    const available = kind === "ordnance" ? maiden.magicOrdnance : magic?.tactics ?? [];
    if (!available.some((item) => item.trendId === next[kind].trendId)) next[kind] = { trendId: null, level: 0 };
    else next[kind].level = clampLevel(next[kind].level, 0, maximumMagicLevel(maiden, magic, kind, scout));
  }
  return next;
}

export function baseStatsAtLevel(maiden: SimMaiden, level: number, growthRow?: GrowthCurveRow | null): Partial<Record<SimStatKey, number | null>> {
  const snapshot = maiden.stats[String(level)];
  const base = { ...maiden.stats["1"], ...snapshot };
  for (const key of growthKeys) {
    const value = growthRow?.[key]?.[level - 1];
    if (typeof value === "number" && Number.isFinite(value)) base[key] = value;
    else if (typeof snapshot?.[key] !== "number") throw new Error(`缺少钢舞姬 #${maiden.id} 的 ${level} 级${key}成长数据`);
  }
  return base;
}

/** Translate UI choices to actual client faculty categories/trends and role properties. */
export function nativeInputsForConfig(maiden: SimMaiden, config: SimConfig, equipment: SimEquipmentData, technologies: SimTechData, tech: SimTechLevels, rules: NativeLoadoutRules) {
  if (!rules) throw new Error("原生配装规则尚未加载，不能计算面板");
  const { phase, number } = nativePhaseForLevel(rules, maiden.id, config.level);
  const card = rules.cards[maiden.id];
  const state: NativeState = Object.fromEntries(Object.entries(phase.categories).map(([id, category]) => [id, {
    level: card.initialLevels[id] ?? 0, trend: rules.groups[category.group]?.default ?? 0,
  }]));
  state[1].level = config.level;
  const selectTrend = (id: number, trend: number, level = 1) => {
    const category = phase.categories[id];
    if (!category || !rules.groups[category.group]?.items[trend]) throw new Error(`钢舞姬 #${maiden.id} 的原生槽位 ${id} 不支持配置 ${trend}`);
    state[id] = { level, trend };
  };
  for (const [id, trend] of [[3, config.ammoId], [4, config.engineId], [5, config.bodyId], [6, config.armorId]] as const) if (trend) selectTrend(id, trend);
  for (const [key, id] of [['durability', 21], ['power', 22], ['piercing', 23], ['armor', 24], ['accuracy', 25], ['evasion', 26]] as const) state[id].level = config.colonization[key];
  for (const [kind, id] of [['ordnance', 17], ['tactics', 18]] as const) {
    const choice = config[kind];
    if (choice.trendId && choice.level > 0) selectTrend(id, choice.trendId, choice.level);
  }
  config.equipment.forEach((slot, index) => {
    if (!slot.familyId) return;
    const family = equipment.families.find((f) => f.id === slot.familyId);
    const selected = family?.levels.find((l) => l.level === slot.level);
    const trend = selected && rules.equipmentTrends[selected.fundId];
    if (!trend) throw new Error(`缺少装备 ${slot.familyId} S${slot.level} 的原生映射`);
    selectTrend(card.slots[index], trend);
  });
  const properties: Record<string, number> = {};
  // Supply all global properties. Native per-phase rules, not UI display labels,
  // decide which generation and which ammunition/defense branch actually apply.
  for (const block of technologies.blocks) {
    const row = block.levels.find((l) => l.level === (tech[block.id] ?? 0));
    for (const attribute of row?.attributes ?? []) {
      if (attribute.effectType !== 0) throw new Error(`未支持的科技属性运算 ${attribute.effectType}`);
      properties[attribute.propertyId] = (properties[attribute.propertyId] ?? 0) + Math.round(attribute.value * 100);
    }
  }
  return { phase, number, state, properties };
}

export function calculateSimStats(maiden: SimMaiden, config: SimConfig, equipment: SimEquipmentData, technologies: SimTechData, tech: SimTechLevels, rules: NativeLoadoutRules) {
  const input = nativeInputsForConfig(maiden, config, equipment, technologies, tech, rules);
  const native = calculateNativePanel(rules, input.phase, input.state, input.properties);
  const byName = Object.fromEntries(Object.entries(native.totals).map(([id, value]) => [rules.attributes[id], value]));
  const values = Object.fromEntries(simStats.map(({ key }) => [key, byName[key] ?? 0])) as Record<SimStatKey, number>;
  const gradeBonuses = Object.fromEntries((['fireproof', 'homogeneity', 'coverage'] as const).map((key) => [key, rules.cards[maiden.id].slots.reduce((sum, id) => {
    const attribute = Object.keys(rules.attributes).find((a) => rules.attributes[a] === key)!;
    return sum + (native.breakdown[id]?.[attribute] ?? 0);
  }, 0)])) as Record<SimGradeKey, number>;
  const gradeFor = (kind: SimGradeKey, raw: number) => {
    if (raw >= 80) return "S";
    if (kind === "homogeneity") return raw >= 72 ? "A" : raw >= 55 ? "B" : raw >= 40 ? "C" : "D";
    if (kind === "coverage") return raw >= 65 ? "A" : raw >= 50 ? "B" : raw >= 35 ? "C" : "D";
    return raw >= 70 ? "A" : raw >= 60 ? "B" : raw >= 40 ? "C" : "D";
  };
  const grades = Object.fromEntries((['fireproof', 'homogeneity', 'coverage'] as const).map((key) => [key, { value: byName[key] ?? 0, grade: gradeFor(key, byName[key] ?? 0) }])) as Record<SimGradeKey, { value: number; grade: string }>;
  return { values, grades, gradeBonuses, breakdown: native.breakdown, phase: input.number };
}
