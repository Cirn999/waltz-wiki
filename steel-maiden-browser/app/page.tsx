"use client";
/* eslint-disable @next/next/no-img-element -- local APK art is already pre-sized and encoded as WebP */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import MaidenPortraitGallery from "./MaidenPortraitGallery";
import CompareGrowthCurve from "./CompareGrowthCurve";
import DetailLevelSlider from "./DetailLevelSlider";
import DetailEquipmentSlots from "./DetailEquipmentSlots";
import MaidenQuotesSection from "./MaidenQuotesSection";
import { isGrowthCurveRow, loadGrowthCurves, type GrowthCurveDataset } from "./growthCurveData";
import LoadoutSimulator from "./LoadoutSimulator";
import GenerationTabs from "./GenerationTabs";
import CraftProperties from "./CraftProperties";
import AmmoEfficiency from "./AmmoEfficiency";
import type { AmmoEfficiencyValues } from "./ammoEfficiencyData";
import MagicCostFilter from "./MagicCostFilter";
import AttributeCharts from "./AttributeCharts";
import StageArchive from "./StageArchive";
import TaskArchive from "./TaskArchive";
import ItemArchive from "./ItemArchive";
import TerrainArchive from "./TerrainArchive";
import StoryArchive from "./StoryArchive";
import TablePortrait from "./TablePortrait";
import CardAtlas, { type CardAtlasMode, type CardAtlasSkinMode } from "./CardAtlas";
import { createAtlasTeamWorkspace, updateAtlasTeam } from "./atlasTeamState";
import TableAmmunition from "./TableAmmunition";
import type { ChartKind } from "./attributeChartMath";
import { deliverPng, hasAndroidGalleryBridge, useAndroidGalleryBridge } from "./imageDelivery";
import { compareTalentLevels } from "./talentSort";
import { technologyPathPoints, technologyPrerequisites } from "./technologyPaths";

type StatKey = "durability" | "power" | "piercing" | "accuracy" | "armor" | "evasion" | "stealth" | "recon" | "economy" | "potential";
type StatSet = Record<StatKey, number | null>;
type Grade = { grade: string; value: number | null };
type NamedIcon = { name: string; image: string };
type CraftOption = { id: number; name: string; resistance: string[]; resistanceDetails: NamedIcon[]; rank: number; rankLabel: string; image: string; stats: AmmoStat[] };
type AmmoEffect = { name: string; description: string; kind: string; image: string };
type AmmoStat = { key: string; value: number; effectType: number };
type Ammunition = { id: number; type: string; name: string; rank: number; rankLabel: string; image: string; typeImage: string; effects: AmmoEffect[]; stats: AmmoStat[]; efficiency?: AmmoEfficiencyValues };
type MagicOrdnanceLevel = { level: number; intensity: number; timing: string; effect: string; condition: string };
type MagicOrdnance = { trendId: number; talentId: number; skillId: number; name: string; image: string; levels: MagicOrdnanceLevel[] };
type MagicMaterial = { fundId: number; name: string; amount: number; image: string };
type MagicUpgradeLevel = { level: number; scoutLevel: number; markKind: string; marks: number; materials: MagicMaterial[]; trainId: number };
type MagicUpgradePath = { selectorId: number; levels: MagicUpgradeLevel[] };
type MagicBonus = { name: string; percent: number };
type MagicTacticEffect = { name: string; description: string; basePercent: number; equipmentPercent: number | null };
type MagicTactic = { trendId: number; name: string; image: string; levels: { level: number; effects: MagicTacticEffect[] }[] };
type MagicProgression = { progression: Record<string, Record<string, Record<string, MagicUpgradePath[]>>>; ordnanceBonuses: { level: number; bonuses: MagicBonus[] }[]; markIcons: Record<string, string>; tactics: MagicTactic[] };
type AcquisitionRoute = { kind: "research" | "chapter" | "source" | "event" | "exchange" | "gift"; label: string; details: string[] };
type Maiden = {
  id: number;
  implemented: boolean;
  tank: string;
  person: string;
  nation: string;
  nationIcon: string;
  nationTypeId: number;
  className: string;
  classId: number;
  classIcon: string;
  rarity: string;
  rarityId: number;
  rarityColor: string;
  rarityIcon: string;
  stage: string;
  stageIcon: string;
  ammo: string[];
  ammoDetail: string[];
  ammunition: Ammunition[];
  allAmmunition: Ammunition[];
  baseAmmoEfficiency?: AmmoEfficiencyValues;
  slots: string[];
  slotDetails: NamedIcon[];
  engine: { name: string; resistance: string[] };
  body: { name: string; resistance: string[] };
  engineOptions: CraftOption[];
  bodyOptions: CraftOption[];
  armorOptions: CraftOption[];
  grades: { fireproof: Grade; homogeneity: Grade; coverage: Grade };
  talents: { name: string; level: number; image: string }[];
  huntTraits: { task: string; name: string; tagId: number }[];
  artist: string;
  cv: string;
  age: string;
  birthday: string;
  department: string;
  bloodType: string;
  height: string;
  job: string;
  profile: string;
  tankProfile: string;
  generations: string;
  status: string;
  modelId: number;
  appearanceId: number;
  image: string;
  headImage: string;
  acquisition: AcquisitionRoute[];
  magicOrdnance: MagicOrdnance[];
  magicSelectors: { ordnance: number; tactics: number };
  magicCostGroup: string;
  stats: Record<string, StatSet>;
};
type Dataset = {
  levels: number[];
  artCount: number;
  attributeIcons: Record<string, string>;
  magicProgression?: MagicProgression;
  rows: Maiden[];
  facets: { nations: string[]; classes: string[]; stages: string[]; rarities: string[]; ammunition: string[]; engineResistances: string[]; bodyResistances: string[]; talents: string[]; huntTraits: string[] };
};
type ResearchRequirement = { cardId: number; obtained: boolean; generation: number | null; level: number | null; tank: string; person: string; stage: string; headImage: string };
type ResearchResource = { fundId: number; name: string; amount: number; category: "silver" | "blueprint" | "equipment" | "material"; categoryName: string; icon: string; equipmentRank: number | null; equipmentGrade: string };
type ResearchResourcePlan = { id: string; commanderLevel: number | null; resources: ResearchResource[]; ruleIds: number[]; hasPermanentVariant: boolean; hasLimitedVariant: boolean };
type ResearchRecipe = { id: string; targetId: number; target: Pick<Maiden, "tank" | "person" | "stage" | "className" | "nation" | "headImage">; requirements: ResearchRequirement[]; resourcePlans: ResearchResourcePlan[]; ruleIds: number[]; hasPermanentVariant: boolean; hasLimitedVariant: boolean };
type ResearchNode = { id: number; tank: string; person: string; nation: string; className: string; stage: string; rarity: string; headImage: string; upstreamRecipeIds: string[]; downstream: { recipeId: string; targetId: number }[] };
type ResearchDataset = { meta: { source: string; recipeSemantics: string; resourcePlanSemantics: string; rawRuleCount: number; recipeCount: number; resourcePlanCount: number; resourceItemCount: number; nodeCount: number; targetCount: number; edgeCount: number; prerequisiteCountDistribution: Record<string, number> }; nodes: ResearchNode[]; recipes: ResearchRecipe[] };
type EquipmentMaterial = { fundId: number; name: string; amount: number; equipment: boolean; level: number | null; icon: string };
type EquipmentEffect = { skillId: number; templateId: number; value: number; name: string; description: string; text: string };
type EquipmentHiddenStats = { fireproof: number; homogeneity: number; coverage: number };
type EquipmentLevel = { fundId: number; level: number; icon: string; stats: AmmoStat[]; hiddenStats: EquipmentHiddenStats; effects: EquipmentEffect[]; recipe: { ruleId: number; targetAmount: number; materials: EquipmentMaterial[] } | null; cumulative: EquipmentMaterial[] };
type EquipmentFamily = { id: string; name: string; description: string; slotTag: number; advanced: boolean; icon: string; typeIcon: string; minLevel: number; maxLevel: number; levels: EquipmentLevel[] };
type EquipmentSlot = { tag: number; name: string; icon: string; vehicleKind: string; order: number };
type EquipmentDataset = { source: Record<string, string>; summary: { slotCount: number; equipmentFundCount: number; familyCount: number; normalFamilyCount: number; advancedFamilyCount: number; recipeCount: number; unresolvedEnhancementRuleCount: number }; slots: EquipmentSlot[]; families: EquipmentFamily[] };
type TechnologyMaterial = { fundId: number; name: string; amount: number; iconCode: string; image?: string };
type TechnologyTrait = { name: string; description: string; image?: string; iconCode?: string };
type TechnologyNode = { tag: number; craftId: number; name: string; iconCode: string; image: string; x: number; y: number; stats: AmmoStat[]; traits: TechnologyTrait[]; cost: TechnologyMaterial[]; efficiency?: AmmoEfficiencyValues };
type TechnologyLine = { from: number; to: number; points: { x: number; y: number }[] };
type TechnologyLevel = { level: number; commanderLevel: number | null; ruleId: number; attributes: { propertyId: number; name: string; value: number; effectType: number }[]; cost: TechnologyMaterial[]; cumulativeCost: TechnologyMaterial[] };
type TechnologyBlock = { id: string; category: string; secondary: string; generation: number; title: string; iconCode: string; icon?: string; styleId: number; craftId: number; nodes: TechnologyNode[]; lines: TechnologyLine[]; levels: TechnologyLevel[] };
type TechnologyDataset = { source: Record<string, string>; categories: { name: string; secondary: string[] }[]; blocks: TechnologyBlock[]; iconCodes: string[] };
type ColonizationKey = "durability" | "evasion" | "accuracy" | "armor" | "piercing" | "power";
type ColonizationBonuses = Record<ColonizationKey, number[]>;
type ColonizationDataset = { source: Record<string, string>; semantics: string; maxLevel: number; rows: Record<string, ColonizationBonuses> };
type Filters = { nation: string[]; className: string[]; rarity: string[]; stage: string[]; magicCost: string[]; ammo: string[]; engineResistance: string[]; bodyResistance: string[]; talents: string[]; huntTraits: string; includeUnimplemented: boolean };
type VisibleStatKey = Exclude<StatKey, "economy" | "potential">;
type SortKey = VisibleStatKey | "id" | "tank" | "person" | "className" | "nation" | "rarity" | "stage" | "ammo" | "slots" | "engineResistance" | "bodyResistance" | "fireproof" | "homogeneity" | "coverage" | "talents";
type RankResult = { rank: number; total: number } | null;
type RankFilters = { classNames: string[]; nations: string[]; rarities: string[]; stages: string[]; magicCost: string[]; ammunition: string[]; engineResistances: string[]; bodyResistances: string[]; talents: string[]; huntTraits: string; includeUnimplemented: boolean };
type RankFilterKey = Exclude<keyof RankFilters, "huntTraits" | "includeUnimplemented">;
type RankFilterOption = { name: string; label?: string; image?: string; hideLabel?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isMaidenDataset(value: unknown): value is Dataset {
  if (!isRecord(value) || !Array.isArray(value.levels) || !value.levels.every((level) => typeof level === "number") || typeof value.artCount !== "number" || !isRecord(value.attributeIcons) || !isRecord(value.facets) || !Array.isArray(value.rows)) return false;
  const facets = value.facets;
  const levels = value.levels;
  if (!["nations", "classes", "stages", "rarities", "ammunition", "engineResistances", "bodyResistances", "talents", "huntTraits"].every((key) => isStringArray(facets[key]))) return false;
  return value.rows.every((row) => {
    if (!isRecord(row) || !isRecord(row.grades) || !isRecord(row.stats)) return false;
    const grades = row.grades;
    const stats = row.stats;
    return typeof row.implemented === "boolean" && typeof row.id === "number" && typeof row.tank === "string" && typeof row.person === "string"
    && typeof row.nation === "string" && typeof row.className === "string" && typeof row.stage === "string" && typeof row.generations === "string"
    && typeof row.magicCostGroup === "string" && /^N[1-6][+-]?$/.test(row.magicCostGroup)
    && isStringArray(row.ammo) && isStringArray(row.slots) && Array.isArray(row.ammunition) && Array.isArray(row.allAmmunition)
    && row.ammunition.every((ammo: unknown) => isRecord(ammo) && typeof ammo.name === "string" && Array.isArray(ammo.effects) && ammo.effects.every((effect: unknown) => isRecord(effect) && typeof effect.name === "string"))
    && row.allAmmunition.every((ammo: unknown) => isRecord(ammo) && typeof ammo.name === "string" && typeof ammo.rank === "number" && Array.isArray(ammo.effects))
    && ["engineOptions", "bodyOptions", "armorOptions"].every((key) => Array.isArray(row[key]) && row[key].every((option: unknown) => isRecord(option) && typeof option.name === "string" && isStringArray(option.resistance)))
    && Array.isArray(row.talents) && row.talents.every((talent: unknown) => isRecord(talent) && typeof talent.name === "string")
    && Array.isArray(row.huntTraits) && row.huntTraits.every((trait: unknown) => isRecord(trait) && typeof trait.task === "string" && typeof trait.name === "string")
    && ["fireproof", "homogeneity", "coverage"].every((key) => isRecord(grades[key]))
    && levels.every((level) => isRecord(stats[String(level)]));
  });
}
function isResearchDataset(value: unknown): value is ResearchDataset {
  return isRecord(value) && isRecord(value.meta) && Array.isArray(value.nodes) && Array.isArray(value.recipes)
    && value.nodes.every((node) => isRecord(node) && typeof node.id === "number" && typeof node.tank === "string" && isStringArray(node.upstreamRecipeIds)
      && Array.isArray(node.downstream) && node.downstream.every((edge: unknown) => isRecord(edge) && typeof edge.recipeId === "string" && typeof edge.targetId === "number"))
    && value.recipes.every((recipe) => isRecord(recipe) && typeof recipe.id === "string" && typeof recipe.targetId === "number" && isRecord(recipe.target)
      && Array.isArray(recipe.requirements) && recipe.requirements.every((requirement: unknown) => isRecord(requirement) && typeof requirement.cardId === "number")
      && Array.isArray(recipe.resourcePlans));
}
function isEquipmentDataset(value: unknown): value is EquipmentDataset {
  return isRecord(value) && isRecord(value.source) && isRecord(value.summary) && Array.isArray(value.slots) && Array.isArray(value.families)
    && value.slots.every((slot) => isRecord(slot) && typeof slot.tag === "number" && typeof slot.name === "string" && typeof slot.icon === "string")
    && value.families.every((family) => isRecord(family) && typeof family.id === "string" && typeof family.name === "string" && Array.isArray(family.levels)
      && family.levels.every((level: unknown) => {
        if (!isRecord(level) || typeof level.level !== "number" || !Array.isArray(level.stats) || !isRecord(level.hiddenStats)) return false;
        const hiddenStats = level.hiddenStats;
        return ["fireproof", "homogeneity", "coverage"].every((key) => typeof hiddenStats[key] === "number" && Number.isFinite(hiddenStats[key]))
          && Array.isArray(level.effects) && Array.isArray(level.cumulative);
      }));
}
function isTechnologyDataset(value: unknown): value is TechnologyDataset {
  return isRecord(value) && isRecord(value.source) && Array.isArray(value.categories) && Array.isArray(value.blocks) && isStringArray(value.iconCodes)
    && value.categories.every((category) => isRecord(category) && typeof category.name === "string" && isStringArray(category.secondary))
    && value.blocks.every((block) => isRecord(block) && typeof block.id === "string" && typeof block.category === "string" && typeof block.secondary === "string"
      && Array.isArray(block.nodes) && block.nodes.every((node: unknown) => isRecord(node) && typeof node.tag === "number" && typeof node.name === "string" && Array.isArray(node.stats) && Array.isArray(node.traits) && Array.isArray(node.cost))
      && Array.isArray(block.lines) && Array.isArray(block.levels) && block.levels.every((level: unknown) => isRecord(level) && typeof level.level === "number" && Array.isArray(level.attributes) && Array.isArray(level.cost) && Array.isArray(level.cumulativeCost)));
}
function isColonizationDataset(value: unknown): value is ColonizationDataset {
  if (!isRecord(value) || !isRecord(value.source) || typeof value.semantics !== "string" || !isRecord(value.rows) || value.maxLevel !== 12) return false;
  return Object.values(value.rows).every((entry) => isRecord(entry) && (["durability", "evasion", "accuracy", "armor", "piercing", "power"] as ColonizationKey[])
    .every((key) => Array.isArray(entry[key]) && entry[key].length === 12 && entry[key].every((bonus: unknown) => typeof bonus === "number" && Number.isFinite(bonus))));
}
async function fetchDataFile<T>(url: string, validate: (value: unknown) => value is T, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error(`${url} 不是有效的 JSON 文件`); }
  if (!validate(data)) throw new Error(`${url} 的数据结构不符合预期`);
  return data;
}

const statMeta: { key: VisibleStatKey; label: string; short: string }[] = [
  { key: "durability", label: "耐久", short: "耐" },
  { key: "power", label: "火力", short: "火" },
  { key: "piercing", label: "穿甲", short: "穿" },
  { key: "accuracy", label: "命中", short: "命" },
  { key: "armor", label: "装甲", short: "甲" },
  { key: "evasion", label: "回避", short: "回" },
  { key: "stealth", label: "隐蔽", short: "隐" },
  { key: "recon", label: "侦查", short: "侦" },
];
const emptyFilters: Filters = { nation: [], className: [], rarity: [], stage: [], magicCost: [], ammo: [], engineResistance: [], bodyResistance: [], talents: [], huntTraits: "", includeUnimplemented: false };
const emptyRankFilters: RankFilters = { classNames: [], nations: [], rarities: [], stages: [], magicCost: [], ammunition: [], engineResistances: [], bodyResistances: [], talents: [], huntTraits: "", includeUnimplemented: false };

type TableColumnKey = Exclude<SortKey, "person" | "className" | "rarity" | "stage">;
type TableColumnDefinition = { key: TableColumnKey; label: string };
type TableStatMinimums = Partial<Record<StatKey, string>>;

const tableColumnDefinitions: TableColumnDefinition[] = [
  { key: "id", label: "头像" },
  { key: "tank", label: "名称" },
  { key: "nation", label: "国籍" },
  { key: "durability", label: "耐久" },
  { key: "power", label: "火力" },
  { key: "piercing", label: "穿甲" },
  { key: "accuracy", label: "命中" },
  { key: "armor", label: "装甲" },
  { key: "evasion", label: "回避" },
  { key: "stealth", label: "隐蔽" },
  { key: "recon", label: "侦查" },
  { key: "ammo", label: "弹药" },
  { key: "slots", label: "装备槽" },
  { key: "engineResistance", label: "引擎抗性" },
  { key: "bodyResistance", label: "车体抗性" },
  { key: "fireproof", label: "阻燃" },
  { key: "homogeneity", label: "均质性" },
  { key: "coverage", label: "覆盖度" },
  { key: "talents", label: "才艺" },
];
const defaultTableColumnOrder = tableColumnDefinitions.map((column) => column.key);
const defaultHiddenTableColumns: TableColumnKey[] = ["nation"];
const lockedTableColumns: TableColumnKey[] = ["id", "tank"];
const tableColumnByKey = new Map(tableColumnDefinitions.map((column) => [column.key, column]));
const emptyTableStatMinimums: TableStatMinimums = Object.fromEntries(statMeta.map((meta) => [meta.key, ""]));
const tableColumnWidths: Partial<Record<TableColumnKey, number>> = {
  id: 116, tank: 210, nation: 122, ammo: 194,
  durability: 96, power: 96, piercing: 96, accuracy: 96, armor: 96, evasion: 96, stealth: 96, recon: 96,
  slots: 156, engineResistance: 260, bodyResistance: 300, fireproof: 92, homogeneity: 92, coverage: 92, talents: 210,
};

function isLockedTableColumn(column: TableColumnKey) {
  return lockedTableColumns.includes(column);
}

function isDisplayedStatKey(key: SortKey): key is VisibleStatKey {
  return statMeta.some((meta) => meta.key === key);
}

function filterRankRows(rows: Maiden[], filters: RankFilters) {
  return rows.filter((row) =>
    (filters.includeUnimplemented || row.implemented) &&
    (!filters.classNames.length || filters.classNames.includes(row.className)) &&
    (!filters.nations.length || filters.nations.includes(row.nation)) &&
    (!filters.rarities.length || filters.rarities.includes(row.rarity)) &&
    (!filters.stages.length || filters.stages.includes(row.stage)) &&
    (!filters.magicCost.length || filters.magicCost.includes(row.magicCostGroup)) &&
    (!filters.ammunition.length || filters.ammunition.every((type) => row.ammo.includes(type))) &&
    (!filters.engineResistances.length || filters.engineResistances.every((name) => row.engineOptions.some((option) => option.resistance.includes(name)))) &&
    (!filters.bodyResistances.length || filters.bodyResistances.every((name) => row.bodyOptions.some((option) => option.resistance.includes(name)))) &&
    (!filters.talents.length || filters.talents.every((talent) => row.talents.some((item) => item.name === talent))) &&
    (!filters.huntTraits || row.huntTraits.some((item) => `${item.task} ${item.name}` === filters.huntTraits))
  );
}

function rankValue(current: number | null | undefined, rows: Maiden[], getValue: (row: Maiden) => number | null | undefined): RankResult {
  if (current === null || current === undefined) return null;
  const values = rows.map(getValue).filter((value): value is number => value !== null && value !== undefined);
  return { rank: values.filter((value) => value > current).length + 1, total: rows.length };
}

function number(value: number | null | undefined) { return value === null || value === undefined ? "—" : value.toLocaleString("zh-CN"); }
function tableNumber(value: number | null | undefined) { return value === null || value === undefined ? "—" : String(value); }
function nationLabel(name: string) { return name === "架空/特殊阵营" ? "旅行者" : name === "架空阵营A" ? "战车兽" : name; }
function stageOrder(name: string) { const match = /^N([1-6])$/.exec(name); return match ? Number(match[1]) : 99; }
function rarityTone(id: number) { return id === 4 ? "gold" : id === 3 ? "purple" : "blue"; }
function resistanceProfiles(options: CraftOption[]) { return [...new Set(options.map((option) => option.resistance.join("、")).filter(Boolean))]; }
function searchable(row: Maiden) {
  return [row.tank, row.person, row.nation, nationLabel(row.nation), row.className, row.stage, ...row.ammo, ...row.ammunition.flatMap((item) => [item.name, ...item.effects.map((effect) => effect.name)]), ...row.talents.map((item) => item.name), ...row.huntTraits.flatMap((item) => [item.task, item.name]), ...row.engineOptions.flatMap((option) => [option.name, ...option.resistance]), ...row.bodyOptions.flatMap((option) => [option.name, ...option.resistance]), ...row.armorOptions.flatMap((option) => [option.name, ...option.resistance])].join(" ").toLowerCase();
}

function activeMainFilterCount(filters: Filters) {
  return Object.values(filters).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value ? 1 : 0), 0);
}
function activeRankFilterCount(filters: RankFilters) {
  return Object.values(filters).reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value ? 1 : 0), 0);
}
function sortValue(row: Maiden, key: Exclude<SortKey, "talents">, level: number): string | number {
  if (isDisplayedStatKey(key)) return row.stats[String(level)]?.[key] ?? -Infinity;
  switch (key) {
    case "id": return row.id;
    case "tank": return row.tank;
    case "person": return row.person;
    case "className": return row.className;
    case "nation": return nationLabel(row.nation);
    case "rarity": return row.rarityId;
    case "stage": return Number(row.stage.replace(/\D/g, "")) || 0;
    case "ammo": return row.ammo.join("、");
    case "slots": return row.slots.join("、");
    case "engineResistance": return resistanceProfiles(row.engineOptions).join("、");
    case "bodyResistance": return resistanceProfiles(row.bodyOptions).join("、");
    case "fireproof": return row.grades.fireproof.value ?? row.grades.fireproof.grade;
    case "homogeneity": return row.grades.homogeneity.value ?? row.grades.homogeneity.grade;
    case "coverage": return row.grades.coverage.value ?? row.grades.coverage.grade;
  }
}
function compareValues(left: string | number, right: string | number) {
  return typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "zh-CN", { numeric: true });
}
function ArchiveSearch({ value, onSearch }: { value: string; onSearch: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = () => onSearch(inputRef.current?.value.trim() ?? "");
  return <div className="search-box"><span>⌕</span><input key={value} ref={inputRef} defaultValue={value} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder="搜索坦克名、人名、车种、弹药、才艺或工艺…" /><button onClick={submit}>搜索</button></div>;
}

function Portrait({ maiden, eager = false }: { maiden: Maiden; eager?: boolean }) {
  if (!maiden.image) return <div className="portrait-fallback"><span>{maiden.tank.slice(0, 2)}</span><small>NO ART / {maiden.id}</small></div>;
  return <img src={maiden.image} alt={`${maiden.tank} / ${maiden.person} 立绘`} loading={eager ? "eager" : "lazy"} />;
}

function LevelPicker({ level, setLevel, compact = false }: { level: number; setLevel: (value: number) => void; compact?: boolean }) {
  return <div className={`level-picker ${compact ? "level-picker-compact" : ""}`} aria-label="属性等级">
    {[1, 60, 90, 99].map((value) => <button key={value} onClick={() => setLevel(value)} className={level === value ? "active" : ""}>{value}级</button>)}
  </div>;
}

type ShareImageState = "idle" | "working" | "copied" | "saved" | "error";

function useShareImage(targetRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<ShareImageState>("idle");
  const save = useCallback(async () => {
    const target = targetRef.current;
    if (!target || state === "working") return;
    setState("working");
    target.dataset.exporting = "true";
    try {
      await document.fonts?.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const width = Math.ceil(target.scrollWidth);
      const height = Math.ceil(target.scrollHeight);
      const desiredRatio = Math.min(1.5, window.devicePixelRatio || 1);
      const dimensionRatio = Math.min(14000 / Math.max(width, 1), 14000 / Math.max(height, 1));
      const areaRatio = Math.sqrt(56_000_000 / Math.max(width * height, 1));
      const pixelRatio = Math.max(.7, Math.min(desiredRatio, dimensionRatio, areaRatio));
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(target, {
        backgroundColor: "#edf1e8",
        cacheBust: true,
        pixelRatio,
        width,
        height,
        style: { height: `${height}px`, maxHeight: "none", overflow: "visible" },
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("share-export-hide")),
      });
      if (!blob) throw new Error("截图引擎没有返回图像");
      const destination = await deliverPng(blob, "steel-maiden-archive");
      setState(destination === "gallery" ? "saved" : "copied");
      setTimeout(() => setState("idle"), 2600);
    } catch (error) {
      console.error("Failed to export share image", error);
      setState("error");
      setTimeout(() => setState("idle"), 4200);
    } finally {
      delete target.dataset.exporting;
    }
  }, [state, targetRef]);
  return { state, save };
}

function ShareImageButton({ state, onClick }: { state: ShareImageState; onClick: () => void }) {
  const androidGallery = useAndroidGalleryBridge();
  const label = state === "working" ? "正在生成完整 PNG…" : state === "saved" ? "已保存到相册" : state === "copied" ? "已复制到剪贴板" : state === "error" ? (androidGallery ? "保存失败，请重试" : "复制失败，请重试") : (androidGallery ? "保存图片到相册" : "复制分享图");
  return <button className={`share-image-button state-${state}`} onClick={onClick} disabled={state === "working"}><span aria-hidden="true">▣</span>{label}</button>;
}

function GameIconChip({ item, kind = "default" }: { item: NamedIcon; kind?: "default" | "class" | "slot" | "resistance" | "nation" | "stage" | "talent" }) {
  return <span className={`game-icon-chip game-icon-${kind}`}>
    {item.image && <img src={item.image} alt="" loading="lazy" />}
    <b>{item.name}</b>
  </span>;
}

function VehicleClassChip({ maiden }: { maiden: Maiden }) {
  return <GameIconChip item={{ name: maiden.className, image: maiden.classIcon }} kind="class" />;
}

function NationChip({ maiden }: { maiden: Maiden }) {
  return <GameIconChip item={{ name: nationLabel(maiden.nation), image: maiden.nationIcon }} kind="nation" />;
}

function StageChip({ maiden }: { maiden: Maiden }) {
  return <GameIconChip item={{ name: maiden.stage, image: maiden.stageIcon }} kind="stage" />;
}

function DetailBlueprintCost({ maiden }: { maiden: Maiden }) {
  const description = `研发图纸：${maiden.stage}；魔改费用：${maiden.magicCostGroup}`;
  return <span className="game-icon-chip game-icon-stage detail-blueprint-cost" role="img" aria-label={description} title={description}>
    {maiden.stageIcon && <img src={maiden.stageIcon} alt="" loading="lazy" />}
    <b>{maiden.magicCostGroup}</b>
  </span>;
}

function RarityIcon({ maiden }: { maiden: Maiden }) {
  return <span className="rarity-game-icon" title={maiden.rarity} aria-label={maiden.rarity}>{maiden.rarityIcon ? <img src={maiden.rarityIcon} alt="" loading="lazy" /> : <i>?</i>}</span>;
}

function TalentList({ items }: { items: Maiden["talents"] }) {
  return items.length
    ? <div className="game-icon-list talent-icon-list">{items.map((item) => <GameIconChip key={item.name} item={{ name: `${item.name}${item.level}`, image: item.image }} kind="talent" />)}</div>
    : <span className="muted">—</span>;
}

function SlotList({ items, iconOnly = false }: { items: NamedIcon[]; iconOnly?: boolean }) {
  return items.length
    ? <div className={`game-icon-list slot-icon-list ${iconOnly ? "slot-icon-list-only" : ""}`}>{items.map((item, index) => iconOnly
      ? <span className="slot-only-icon" key={`${item.name}-${index}`} title={item.name} aria-label={item.name}>{item.image ? <img src={item.image} alt="" loading="lazy" /> : <i>{item.name.slice(0, 1)}</i>}</span>
      : <GameIconChip key={`${item.name}-${index}`} item={item} kind="slot" />)}</div>
    : <span className="muted">— 未配置</span>;
}

function ResistanceCell({ options }: { options: CraftOption[] }) {
  const profiles = [...new Map(options
    .filter((option) => option.resistanceDetails.length)
    .map((option) => [option.resistance.join("、"), option.resistanceDetails])).values()];
  return <div className="resistance-profile-list">{profiles.length ? profiles.map((profile, index) => <div className="game-icon-list resistance-icon-list" key={`${profile.map((item) => item.name).join("、")}-${index}`}>{profile.map((item) => <GameIconChip key={item.name} item={item} kind="resistance" />)}</div>) : <span className="muted">— 未配置</span>}</div>;
}

function AmmunitionCard({ ammo }: { ammo: Ammunition }) {
  return <article className="ammo-card ammo-card-ammunition">
    <div className="ammo-title-row">
      <span className="ammo-art">{ammo.image ? <img src={ammo.image} alt="" loading="lazy" /> : ammo.typeImage ? <img src={ammo.typeImage} alt="" loading="lazy" /> : <i>?</i>}</span>
      <span className="ammo-title"><small>{ammo.type} · {ammo.rankLabel || `${ammo.rank}期`} · 弹药属性</small><strong title={ammo.name}>{ammo.name}</strong></span>
      <AmmoEfficiency value={ammo.efficiency} />
      <b className={`ammo-rank rank-${ammo.rank}`}>{ammo.rank || "?"}</b>
    </div>
    <CraftProperties item={ammo} ammunition />
  </article>;
}

function ammunitionGroups(items: Ammunition[]) {
  return [...items.reduce((map, ammo) => {
    if (!map.has(ammo.type)) map.set(ammo.type, []);
    map.get(ammo.type)!.push(ammo);
    return map;
  }, new Map<string, Ammunition[]>())];
}

function AmmunitionList({ items, compact = false, grouped = false, types }: { items: Ammunition[]; compact?: boolean; grouped?: boolean; types?: string[] }) {
  if (!items.length && !types?.length) return <div className="ammo-list"><span className="muted">— 未配置</span></div>;
  if (grouped) {
    const byType = new Map(ammunitionGroups(items));
    const groups: [string, Ammunition[]][] = types ? types.map((type) => [type, byType.get(type) ?? []]) : [...byType];
    return <div className="ammo-type-groups">{groups.map(([type, ammunition]) => <section className="ammo-type-group" key={type}>
      <header><strong>{type}</strong><span>{ammunition.length} 种弹药</span></header>
      {ammunition.length ? <div className="ammo-group-grid">{ammunition.map((ammo) => <AmmunitionCard key={ammo.id} ammo={ammo} />)}</div> : <span className="muted">— 该期未配置</span>}
    </section>)}</div>;
  }
  return <div className={`ammo-list ${compact ? "ammo-list-compact" : ""}`}>{items.map((ammo) => <AmmunitionCard key={ammo.id} ammo={ammo} />)}</div>;
}

function ComparePairSection({ label, left, right }: { label: string; left: ReactNode; right: ReactNode }) {
  return <section className="compare-aligned-section">
    <header><strong>{label}</strong></header>
    <div className="compare-detail-pair"><div>{left}</div><div>{right}</div></div>
  </section>;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function deltaNumber(value: number, grouped = false) {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return grouped ? rounded.toLocaleString("zh-CN") : String(rounded);
}

function ValueDelta({ delta, grouped = false, className = "" }: { delta: number; grouped?: boolean; className?: string }) {
  const tone = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
  return <span className={`value-delta ${tone} ${className}`.trim()}>({delta > 0 ? "+" : ""}{deltaNumber(delta, grouped)})</span>;
}

function FollowCell({ className = "", children }: { className?: string; children: ReactNode }) {
  return <td className={`follow-cell ${className}`.trim()}><div className="table-cell-follow">{children}</div></td>;
}

function CraftOptionList({ label, options, compact = false }: { label: string; options: CraftOption[]; compact?: boolean }) {
  return <div className={`craft-option-block ${compact ? "craft-option-compact" : ""}`}>
    <div className="craft-option-header"><span>{label}</span><b>{options.length} 种工艺</b></div>
    <div className="craft-option-list">{options.length ? options.map((option) => <div key={option.id}><strong>{option.name}</strong>{option.resistanceDetails.length ? <div className="game-icon-list resistance-icon-list">{option.resistanceDetails.map((item) => <GameIconChip key={item.name} item={item} kind="resistance" />)}</div> : <p>无地形抗性</p>}</div>) : <span className="muted">— 未配置</span>}</div>
  </div>;
}

function highestRankCrafts(options: CraftOption[]) {
  const ranked = options.filter((option) => option.rank > 0);
  if (!ranked.length) return options;
  const highestRank = Math.max(...ranked.map((option) => option.rank));
  return ranked.filter((option) => option.rank === highestRank);
}

function CraftCard({ option, type }: { option: CraftOption; type: "引擎" | "车体" | "装甲" }) {
  return <article className="ammo-card craft-card">
    <div className="ammo-title-row">
      <span className="ammo-art craft-art">{option.image ? <img src={option.image} alt="" loading="lazy" /> : <i>?</i>}</span>
      <span className="ammo-title"><small>{type} · {option.rankLabel || (option.rank ? `${option.rank}期` : "未分期")} · 装备后面板</small><strong>{option.name}</strong></span>
      <b className={`ammo-rank rank-${option.rank}`}>{option.rank || "?"}</b>
    </div>
    <CraftProperties item={option} />
  </article>;
}

function CraftCardGroup({ label, type, options }: { label: string; type: "引擎" | "车体" | "装甲"; options: CraftOption[] }) {
  const availableRanks = [...new Set(options.map((option) => option.rank).filter((rank) => rank >= 1 && rank <= 3))].sort();
  const [selectedRank, setSelectedRank] = useState(() => Math.max(0, ...availableRanks));
  const currentRank = availableRanks.includes(selectedRank) ? selectedRank : Math.max(0, ...availableRanks);
  const visible = currentRank ? options.filter((option) => option.rank === currentRank) : options;
  return <section className="ammo-type-group craft-type-group">
    <header><strong>{label}</strong>{availableRanks.length > 0 && <GenerationTabs selected={currentRank} onSelect={setSelectedRank} label={`${type}期数`} available={availableRanks} />}<span>{visible.length ? `${visible.length} 种工艺 · ${currentRank}期` : "未配置"}</span></header>
    {visible.length
      ? <div className="ammo-group-grid craft-card-grid">{visible.map((option) => <CraftCard key={option.id} option={option} type={type} />)}</div>
      : <span className="muted">— 未配置</span>}
  </section>;
}

function ConfigurableMaidenTable({ rows, level, sortKey, descending, onSort, talentSortName, talentSortOptions, onTalentSortChange, selectedIds, onCompare, onOpen, controlsTarget, onResetFilters }: { rows: Maiden[]; level: number; sortKey: SortKey; descending: boolean; onSort: (key: SortKey) => void; talentSortName: string; talentSortOptions: NamedIcon[]; onTalentSortChange: (name: string) => void; selectedIds: number[]; onCompare: (id: number) => void; onOpen: (id: number) => void; controlsTarget: HTMLDivElement | null; onResetFilters: () => void }) {
  const [columnOrder, setColumnOrder] = useState<TableColumnKey[]>(defaultTableColumnOrder);
  const [hiddenColumns, setHiddenColumns] = useState<TableColumnKey[]>(defaultHiddenTableColumns);
  const [minimums, setMinimums] = useState<TableStatMinimums>(emptyTableStatMinimums);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<TableColumnKey | null>(null);

  const visibleColumns = columnOrder.filter((column) => !hiddenColumns.includes(column));
  const filteredRows = useMemo(() => rows.filter((row) => statMeta.every((meta) => {
    const rawMinimum = minimums[meta.key]?.trim();
    if (!rawMinimum) return true;
    const minimum = Number(rawMinimum);
    if (!Number.isFinite(minimum)) return true;
    const value = row.stats[String(level)]?.[meta.key];
    return value !== null && value !== undefined && value >= minimum;
  })), [rows, level, minimums]);
  const sortedStat = statMeta.find((meta) => meta.key === sortKey);
  const sortedMedian = sortedStat ? median(filteredRows.map((row) => row.stats[String(level)]?.[sortedStat.key]).filter((value): value is number => value !== null && value !== undefined)) : null;
  const activeMinimumCount = statMeta.filter((meta) => minimums[meta.key]?.trim()).length;
  const talentSortIcon = talentSortOptions.find((item) => item.name === talentSortName)?.image;

  function moveColumn(source: TableColumnKey, target: TableColumnKey) {
    if (source === target || isLockedTableColumn(source) || !tableColumnByKey.has(source) || !tableColumnByKey.has(target)) return;
    setColumnOrder((current) => {
      const movableColumns = current.filter((column) => !isLockedTableColumn(column) && column !== source);
      const targetIndex = isLockedTableColumn(target) ? 0 : movableColumns.indexOf(target);
      movableColumns.splice(targetIndex < 0 ? movableColumns.length : targetIndex, 0, source);
      return [...lockedTableColumns, ...movableColumns];
    });
  }

  function nudgeColumn(column: TableColumnKey, direction: -1 | 1) {
    if (isLockedTableColumn(column)) return;
    setColumnOrder((current) => {
      const movableColumns = current.filter((item) => !isLockedTableColumn(item));
      const index = movableColumns.indexOf(column);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= movableColumns.length) return current;
      [movableColumns[index], movableColumns[targetIndex]] = [movableColumns[targetIndex], movableColumns[index]];
      return [...lockedTableColumns, ...movableColumns];
    });
  }

  function toggleColumn(column: TableColumnKey) {
    if (isLockedTableColumn(column)) return;
    setHiddenColumns((current) => current.includes(column)
      ? current.filter((item) => item !== column)
      : visibleColumns.length > 1 ? [...current, column] : current);
  }

  const renderCell = useCallback((column: TableColumnKey, maiden: Maiden, stats: StatSet, selected: boolean) => {
    const columnClass = `column-${column}`;
    if (isDisplayedStatKey(column)) {
      const value = stats[column];
      const showDelta = sortKey === column && sortedMedian !== null && value !== null && value !== undefined;
      return <FollowCell key={column} className={`${columnClass} number-cell ${showDelta ? "number-cell-sorted" : ""}`}><span className="table-stat-value">{tableNumber(value)}{showDelta && <ValueDelta delta={value - sortedMedian} />}</span></FollowCell>;
    }
    switch (column) {
      case "id": return <FollowCell key={column} className={`${columnClass} avatar-cell`}><TablePortrait maiden={maiden} onOpen={onOpen} /></FollowCell>;
      case "tank": return <FollowCell key={column} className={`${columnClass} tank-cell`}><div className="table-tank-follow"><button className="table-tank-link" onClick={() => onOpen(maiden.id)}><strong>{maiden.tank}</strong><span className="table-person-name">{maiden.person}</span></button><button className={selected ? "table-compare selected" : "table-compare"} onClick={() => onCompare(maiden.id)}>{selected ? "已加入" : "+ 对比"}</button></div></FollowCell>;
      case "nation": return <FollowCell key={column} className={`${columnClass} identity-display`}><NationChip maiden={maiden} /></FollowCell>;
      case "ammo": return <FollowCell key={column} className={`${columnClass} table-ammo-cell`}><TableAmmunition types={maiden.ammo} /></FollowCell>;
      case "slots": return <td key={column} className={`${columnClass} slot-cell`}><SlotList items={maiden.slotDetails} iconOnly /></td>;
      case "engineResistance": return <td key={column} className={`${columnClass} resistance-cell engine-resistance-cell`}><ResistanceCell options={maiden.engineOptions} /></td>;
      case "bodyResistance": return <td key={column} className={`${columnClass} resistance-cell body-resistance-cell`}><ResistanceCell options={maiden.bodyOptions} /></td>;
      case "fireproof": return <td key={column} className={`${columnClass} grade-cell`}><b>{maiden.grades.fireproof.grade || "—"}</b><small>{tableNumber(maiden.grades.fireproof.value)}</small></td>;
      case "homogeneity": return <td key={column} className={`${columnClass} grade-cell`}><b>{maiden.grades.homogeneity.grade || "—"}</b><small>{tableNumber(maiden.grades.homogeneity.value)}</small></td>;
      case "coverage": return <td key={column} className={`${columnClass} grade-cell`}><b>{maiden.grades.coverage.grade || "—"}</b><small>{tableNumber(maiden.grades.coverage.value)}</small></td>;
      case "talents": return <td key={column} className={`${columnClass} wide-cell`}><TalentList items={maiden.talents} /></td>;
      default: return null;
    }
  }, [onCompare, onOpen, sortKey, sortedMedian]);

  const tableBodyChunks = useMemo(() => {
    const chunks: ReactNode[] = [];
    const chunkSize = 24;
    for (let start = 0; start < filteredRows.length; start += chunkSize) {
      const chunkRows = filteredRows.slice(start, start + chunkSize);
      chunks.push(<div className="table-body-chunk" key={`rows-${start}-${chunkRows[0]?.id ?? "empty"}`}>
        <table className="maiden-table maiden-table-body" aria-label={`钢舞姬属性第 ${start + 1} 至 ${start + chunkRows.length} 行`}>
          <tbody>{chunkRows.map((maiden) => {
            const stats = maiden.stats[String(level)] ?? ({} as StatSet);
            const selected = selectedIds.includes(maiden.id);
            return <tr key={maiden.id} data-maiden-id={maiden.id} className={selected ? "table-row-selected" : ""}>{columnOrder.map((column) => renderCell(column, maiden, stats, selected))}</tr>;
          })}</tbody>
        </table>
      </div>);
    }
    return chunks;
  }, [columnOrder, filteredRows, level, renderCell, selectedIds]);

  const fixedTableWidth = visibleColumns.reduce((total, column) => total + (tableColumnWidths[column] ?? 96), 0);

  return <div className="configurable-maiden-table" data-hidden-columns={hiddenColumns.join(" ")} style={{ "--attribute-table-width": `calc(${fixedTableWidth - tableColumnWidths.id! - tableColumnWidths.tank!}px + var(--table-avatar-column-width) + var(--table-name-column-width))` } as CSSProperties}>
    {controlsTarget && createPortal(<div className="table-column-settings">
        <button className={`table-column-settings-trigger ${settingsOpen ? "active" : ""}`} type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><span aria-hidden="true">▦</span>列设置 <b>{visibleColumns.length}/{columnOrder.length}</b></button>
        {activeMinimumCount > 0 && <button className="table-clear-minimums" type="button" onClick={() => setMinimums({ ...emptyTableStatMinimums })}>清除数值筛选</button>}
        {settingsOpen && <div className="table-column-settings-panel" role="dialog" aria-label="属性表列设置">
          <header><div><strong>展示与排列</strong><small>拖动项目调整列位置</small></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭列设置">×</button></header>
          <div className="table-column-settings-list">{columnOrder.map((column) => {
            const definition = tableColumnByKey.get(column)!;
            const visible = !hiddenColumns.includes(column);
            const locked = isLockedTableColumn(column);
            const movableIndex = columnOrder.filter((item) => !isLockedTableColumn(item)).indexOf(column);
            const movableCount = columnOrder.length - lockedTableColumns.length;
            return <div className={`table-column-setting ${visible ? "visible" : "hidden"} ${locked ? "locked" : ""}`} key={column} draggable={!locked} onDragStart={(event) => { if (locked) { event.preventDefault(); return; } setDraggedColumn(column); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const source = draggedColumn ?? event.dataTransfer.getData("text/plain") as TableColumnKey; if (source) moveColumn(source, column); setDraggedColumn(null); }} onDragEnd={() => setDraggedColumn(null)}>
              <span className="column-drag-handle" title={locked ? "固定列" : "拖动调整位置"} aria-hidden="true">{locked ? "▣" : "⠿"}</span>
              {locked ? <span className="column-fixed-label"><span>{definition.label}</span><small>固定显示</small></span> : <label><input type="checkbox" checked={visible} onChange={() => toggleColumn(column)} /><span>{definition.label}</span></label>}
              {locked ? <span className="column-fixed-badge">固定</span> : <span className="column-order-buttons"><button type="button" disabled={movableIndex === 0} onClick={() => nudgeColumn(column, -1)} aria-label={`${definition.label}左移`}>←</button><button type="button" disabled={movableIndex === movableCount - 1} onClick={() => nudgeColumn(column, 1)} aria-label={`${definition.label}右移`}>→</button></span>}
            </div>;
          })}</div>
          <footer><button type="button" onClick={() => { setColumnOrder(defaultTableColumnOrder); setHiddenColumns(defaultHiddenTableColumns); }}>恢复默认列</button><span>也可以直接拖动表头</span></footer>
        </div>}
      </div>, controlsTarget)}
    <div className="table-matrix-wrap">
      <div className="table-shell configurable-table-shell">
        <div className="configurable-table-header">
          <table className="maiden-table maiden-table-header">
            <thead>
            <tr className="table-heading-row">{columnOrder.map((column) => {
              const definition = tableColumnByKey.get(column)!;
              const active = sortKey === column;
              const locked = isLockedTableColumn(column);
              return <th key={column} className={`column-${column} draggable-table-head ${locked ? "locked-table-head" : ""} ${draggedColumn === column ? "dragging" : ""}`} draggable={!locked} aria-sort={active ? (descending ? "descending" : "ascending") : "none"} title={locked ? "固定列" : "拖动可调整列位置"} onDragStart={(event) => { if (locked) { event.preventDefault(); return; } setDraggedColumn(column); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const source = draggedColumn ?? event.dataTransfer.getData("text/plain") as TableColumnKey; if (source) moveColumn(source, column); setDraggedColumn(null); }} onDragEnd={() => setDraggedColumn(null)}><button type="button" onClick={() => onSort(column)}><span>{definition.label}{column === "talents" && active ? ` · ${talentSortName}` : ""}</span><i>{active ? (descending ? "↓" : "↑") : "↕"}</i></button></th>;
            })}</tr>
            <tr className="table-filter-row">{columnOrder.map((column) => {
              const definition = tableColumnByKey.get(column)!;
              return <th key={column} className={`column-${column} ${isDisplayedStatKey(column) ? "has-minimum-filter" : ""}`}>{isDisplayedStatKey(column) ? <label><span>≥</span><input type="number" min="0" step="1" inputMode="numeric" value={minimums[column] ?? ""} placeholder="不限" aria-label={`${definition.label}最小值`} onChange={(event) => setMinimums((current) => ({ ...current, [column]: event.target.value }))} /></label> : column === "talents" ? <label className="table-talent-sort" title="按所选才艺的等级排序；点击上方表头切换升降序，没有该才艺的车辆始终排在末尾">
                <span>按</span>{talentSortIcon && <img src={talentSortIcon} alt="" />}<select aria-label="才艺排序依据" value={talentSortName} onChange={(event) => onTalentSortChange(event.target.value)}>{talentSortOptions.map((item) => <option key={item.name} value={item.name}>{item.name}等级</option>)}</select>
              </label> : column === "tank" ? <div className="table-result-summary" role="status" aria-live="polite" title={activeMinimumCount > 0 ? `已启用 ${activeMinimumCount} 项数值下限` : "当前筛选结果"}><strong>{filteredRows.length}</strong><span>位钢舞姬</span></div> : <span className="table-filter-placeholder" aria-hidden="true" />}</th>;
            })}</tr>
            </thead>
          </table>
        </div>
        <div className="table-body-chunks">{tableBodyChunks}</div>
      </div>
    </div>
    {!filteredRows.length && <div className="empty-state table-minimum-empty"><strong>{rows.length ? "没有达到数值下限的钢舞姬" : "没有符合条件的钢舞姬"}</strong><p>{rows.length ? "降低表头下方的筛选数值，或清除全部数值筛选。" : "试试减少筛选条件，或换一个关键词。"}</p><button type="button" onClick={() => { setMinimums({ ...emptyTableStatMinimums }); if (!rows.length) onResetFilters(); }}>{rows.length ? "清除数值筛选" : "重置筛选"}</button></div>}
  </div>;
}

function GroupedMaidenFilters<Key extends string>({ rows, selected, onToggle, maidens, magicCost, onMagicCostChange, includeUnimplemented }: {
  rows: { key: Key; label: string; options: RankFilterOption[] }[];
  selected: (key: Key) => string[]; onToggle: (key: Key, value: string) => void;
  maidens: Maiden[]; magicCost: string[]; onMagicCostChange: (values: string[]) => void;
  includeUnimplemented: boolean;
}) {
  const costMeta = useMemo(() => {
    const counts: Record<string, number> = {}, stageIcons: Record<string, string> = {};
    for (const maiden of maidens) {
      if (!includeUnimplemented && !maiden.implemented) continue;
      counts[maiden.magicCostGroup] = (counts[maiden.magicCostGroup] ?? 0) + 1;
      if (maiden.stageIcon) stageIcons[maiden.stage] = maiden.stageIcon;
    }
    return { counts, stageIcons };
  }, [maidens, includeUnimplemented]);
  const stage = rows.find((row) => row.key === "stage" || row.key === "stages");
  const renderRow = (row: (typeof rows)[number], compact?: "rarity" | "stage") => <MultiFilterRow key={row.key} label={row.label} options={row.options} selected={selected(row.key)} onToggle={(value) => onToggle(row.key, value)} compact={compact} />;
  return <>{rows.map((row) => row === stage ? null : row.key === "rarity" || row.key === "rarities" ? <div className="filter-grade-row" key={row.key}>
    {renderRow(row, "rarity")}{stage && renderRow(stage, "stage")}
    <MagicCostFilter selected={magicCost} onChange={onMagicCostChange} counts={costMeta.counts} stageIcons={costMeta.stageIcons} />
  </div> : renderRow(row))}</>;
}

function ImplementationFilter({ includeUnimplemented, onChange }: { includeUnimplemented: boolean; onChange: (value: boolean) => void }) {
  return <div className="rank-filter-row implementation-filter-row"><strong>实装状态</strong><div><button type="button" aria-label="显示未实装" aria-pressed={includeUnimplemented} className={includeUnimplemented ? "active" : ""} onClick={() => onChange(!includeUnimplemented)}><i aria-hidden="true">{includeUnimplemented ? "✓" : "＋"}</i><span>显示未实装</span></button><span className="implementation-filter-hint">{includeUnimplemented ? "包含未实装钢舞姬" : "仅显示已实装钢舞姬"}</span></div></div>;
}

function MaidenFilterLastRow({ huntOptions, huntTraits, onHuntChange, includeUnimplemented, onImplementationChange }: {
  huntOptions: RankFilterOption[]; huntTraits: string; onHuntChange: (value: string) => void;
  includeUnimplemented: boolean; onImplementationChange: (value: boolean) => void;
}) {
  return <div className="filter-final-row">
    <SingleChoiceFilterRow label="狩猎任务（单选）" options={huntOptions} selected={huntTraits} onSelect={onHuntChange} />
    <ImplementationFilter includeUnimplemented={includeUnimplemented} onChange={onImplementationChange} />
  </div>;
}

function SingleChoiceFilterRow({ label, options, selected, onSelect }: { label: string; options: RankFilterOption[]; selected: string; onSelect: (value: string) => void }) {
  return <div className="rank-filter-row"><strong>{label}</strong><div>{options.map((option) => { const display = option.label ?? option.name; return <button key={option.name} title={display} aria-label={display} className={`${selected === option.name ? "active" : ""}${option.hideLabel ? " icon-only" : ""}`} aria-pressed={selected === option.name} onClick={() => onSelect(selected === option.name ? "" : option.name)}>{option.image ? <img src={option.image} alt="" loading="lazy" /> : <i>{display.slice(0, 1)}</i>}{!option.hideLabel && <span>{display}</span>}</button>; })}</div></div>;
}

function MultiFilterRow({ label, options, selected, onToggle, compact }: { label: string; options: RankFilterOption[]; selected: string[]; onToggle: (value: string) => void; compact?: "rarity" | "stage" }) {
  return <div className={`rank-filter-row${compact ? ` filter-row-compact filter-row-${compact}` : ""}`}><strong>{label}</strong><div>{options.map((option) => { const display = option.label ?? option.name; return <button key={option.name} title={display} aria-label={display} className={`${selected.includes(option.name) ? "active" : ""}${option.hideLabel ? " icon-only" : ""}`} aria-pressed={selected.includes(option.name)} onClick={() => onToggle(option.name)}>{option.image ? <img src={option.image} alt="" loading="lazy" /> : <i>{display.slice(0, 1)}</i>}{!option.hideLabel && <span>{display}</span>}</button>; })}</div></div>;
}

function CardFilterDialog({ title, description, onClose, onReset, onConfirm, children }: { title: string; description: string; onClose: () => void; onReset: () => void; onConfirm: () => void; children: ReactNode }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="filter-sheet-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
    <section className="filter-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header><span><strong>{title}</strong><small>{description}</small></span><button onClick={onClose} aria-label="关闭筛选">×</button></header>
      <div className="filter-sheet-body">{children}</div>
      <footer><button className="filter-reset" onClick={onReset}>重置</button><span>修改仅在点击“确定”后生效</span><button className="filter-cancel" onClick={onClose}>取消</button><button className="filter-confirm" onClick={onConfirm}>确定</button></footer>
    </section>
  </div>, document.body);
}

function AttributeChartWorkspace({ dataset, initialFilters, initialQuery, level, kind, filterRows, onClose }: {
  dataset: Dataset; initialFilters: Filters; initialQuery: string; level: number; kind: ChartKind;
  filterRows: { key: Exclude<keyof Filters, "huntTraits" | "includeUnimplemented">; label: string; options: RankFilterOption[] }[];
  onClose: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [draft, setDraft] = useState(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const candidates = useMemo(() => filterRankRows(dataset.rows, {
    classNames: filters.className, nations: filters.nation, rarities: filters.rarity, stages: filters.stage,
    magicCost: filters.magicCost, ammunition: filters.ammo, engineResistances: filters.engineResistance,
    bodyResistances: filters.bodyResistance, talents: filters.talents, huntTraits: filters.huntTraits, includeUnimplemented: filters.includeUnimplemented,
  }), [dataset.rows, filters]);
  const toggle = (key: Exclude<keyof Filters, "huntTraits" | "includeUnimplemented">, value: string) => setDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  return <>
    <AttributeCharts allMaidens={dataset.rows} candidates={candidates} initialQuery={initialQuery} initialLevel={level} initialKind={kind} icons={dataset.attributeIcons} filterCount={activeMainFilterCount(filters)} filterOpen={filterOpen} onOpenFilters={() => { setDraft(filters); setFilterOpen(true); }} onClose={onClose} />
    {filterOpen && <CardFilterDialog title="图表车辆筛选" description="仅调整左侧可选车辆；不会清空已选车辆，也不会改变背景属性表的筛选。" onClose={() => setFilterOpen(false)} onReset={() => setDraft({ ...emptyFilters })} onConfirm={() => { setFilters(draft); setFilterOpen(false); }}><div className="rank-filter-board main-filter-board">
      <GroupedMaidenFilters rows={filterRows} selected={(key) => draft[key]} onToggle={toggle} includeUnimplemented={draft.includeUnimplemented} maidens={dataset.rows} magicCost={draft.magicCost} onMagicCostChange={(magicCost) => setDraft((current) => ({ ...current, magicCost }))} />
      <MultiFilterRow label="才艺（且）" options={[...new Map(dataset.rows.flatMap((row) => row.talents.map((talent) => [talent.name, { name: talent.name, image: talent.image }]))).values()]} selected={draft.talents} onToggle={(value) => toggle("talents", value)} />
      <MaidenFilterLastRow huntOptions={dataset.facets.huntTraits.map((name) => ({ name }))} huntTraits={draft.huntTraits} onHuntChange={(huntTraits) => setDraft((current) => ({ ...current, huntTraits }))} includeUnimplemented={draft.includeUnimplemented} onImplementationChange={(includeUnimplemented) => setDraft((current) => ({ ...current, includeUnimplemented }))} />
    </div></CardFilterDialog>}
  </>;
}

function MagicOrdnanceSection({ maidenId, items, selectors, data }: { maidenId: number; items: MagicOrdnance[]; selectors: Maiden["magicSelectors"]; data?: MagicProgression }) {
  const [kind, setKind] = useState<"ordnance" | "tactics">("ordnance");
  const [trendId, setTrendId] = useState<number | null>(null);
  const [level, setLevel] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const stored = window.localStorage.getItem(`magic-level:${maidenId}`);
      if (stored !== null) {
        const saved = Number(stored);
        if (Number.isInteger(saved) && saved >= 0 && saved <= 10) return saved;
      }
    } catch { /* Storage can be unavailable in private browsing. */ }
    return 1;
  });
  useEffect(() => {
    try { window.localStorage.setItem(`magic-level:${maidenId}`, String(level)); } catch { /* Keep the in-memory level. */ }
  }, [maidenId, level]);
  const tactics = data?.tactics ?? [];
  const visible = kind === "ordnance" ? items : tactics;
  const selected = visible.find((item) => item.trendId === trendId) ?? visible[0];
  const pathBySelector = useMemo(() => {
    const paths = new Map<number, MagicUpgradePath>();
    for (const vehicles of Object.values(data?.progression ?? {})) {
      for (const kinds of Object.values(vehicles)) {
        for (const variants of Object.values(kinds)) {
          for (const path of variants) paths.set(path.selectorId, path);
        }
      }
    }
    return paths;
  }, [data]);
  const path = pathBySelector.get(selectors[kind]);
  const upgrade = level > 0 ? path?.levels.find((item) => item.level === level) : undefined;
  const ordnanceLevel = kind === "ordnance" ? (selected as MagicOrdnance | undefined)?.levels.find((item) => item.level === level) : undefined;
  const tacticLevel = kind === "tactics" ? (selected as MagicTactic | undefined)?.levels.find((item) => item.level === level) : undefined;
  const bonus = kind === "ordnance" ? data?.ordnanceBonuses.find((item) => item.level === level)?.bonuses ?? [] : tacticLevel?.effects.map((effect) => ({ name: effect.name, percent: effect.basePercent })) ?? [];
  const priorBonus = kind === "ordnance" ? data?.ordnanceBonuses.find((item) => item.level === level - 1)?.bonuses ?? [] : level > 1 ? (selected as MagicTactic | undefined)?.levels.find((item) => item.level === level - 1)?.effects.map((effect) => ({ name: effect.name, percent: effect.basePercent })) ?? [] : [];
  const changeKind = (next: "ordnance" | "tactics") => { setKind(next); setTrendId(null); };
  const materials = (values: MagicMaterial[]) => <div className="magic-materials">{values.length ? values.map((material) => <span key={material.fundId} title={`资源 #${material.fundId}`}>{material.image && <img src={material.image} alt="" loading="lazy" />}{material.name} × {material.amount}</span>) : <small>未配置可解析素材</small>}</div>;
  const mark = (entry: MagicUpgradeLevel, threshold = false) => <span className="magic-mark">{data?.markIcons[entry.markKind] && <img src={data.markIcons[entry.markKind]} alt="" loading="lazy" />}{entry.markKind}{threshold ? `累计 ≥ ${entry.marks} 枚` : ` ${entry.marks}`}</span>;
  return <section className="detail-section magic-ordnance-section">
    <header className="magic-ordnance-heading"><span><h3>魔改</h3><small>技能效果、升级门槛与消耗均取自客户端配置；鹰标／金桨是累计达成条件，不会在此项升级中扣除</small></span></header>
    <div className="magic-kind-tabs" role="tablist" aria-label="魔改类别">
      <button type="button" role="tab" aria-selected={kind === "ordnance"} className={kind === "ordnance" ? "active" : ""} onClick={() => changeKind("ordnance")}>辎械 <small>{items.length}</small></button>
      <button type="button" role="tab" aria-selected={kind === "tactics"} className={kind === "tactics" ? "active" : ""} onClick={() => changeKind("tactics")}>战术 <small>{tactics.length}</small></button>
    </div>
    {visible.length ? <>
      <div className="magic-skill-picker">{visible.map((skill) => <button type="button" key={skill.trendId} className={selected?.trendId === skill.trendId ? "active" : ""} onClick={() => setTrendId(skill.trendId)}><span className="magic-ordnance-art">{skill.image ? <img src={skill.image} alt="" loading="lazy" /> : <i>{kind === "ordnance" ? "械" : "战"}</i>}</span><strong>{skill.name}</strong></button>)}</div>
      {selected && <div className="magic-detail-panel">
        <div className="magic-detail-top"><div><small>{kind === "ordnance" ? "魔改辎械" : "魔改战术"}</small><h4>{selected.name}</h4></div><label className="magic-level-control"><span>{level === 0 ? "未魔改" : `魔改 ${level} / 10 级`}</span><span className="magic-level-stepper"><button type="button" aria-label="降低魔改等级" disabled={level === 0} onClick={() => setLevel(level - 1)}>−</button><input type="number" inputMode="numeric" min={0} max={10} value={level} aria-label="魔改等级" onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setLevel(Math.min(10, Math.max(0, Math.trunc(value)))); }} /><button type="button" aria-label="提高魔改等级" disabled={level === 10} onClick={() => setLevel(level + 1)}>+</button></span></label></div>
        {level === 0 ? <p className="magic-ordnance-empty">未魔改：不获得该项技能效果或魔改属性加成。请选择 1～10 级查看升级详情。</p> : <div className="magic-detail-body">
          <div className="magic-detail-block"><h5>该级效果</h5>{kind === "ordnance" ? <><p><b>发动时机：</b>{ordnanceLevel?.timing || "客户端未配置"}</p><p>{ordnanceLevel?.effect || "客户端未配置可解析的效果"}</p>{ordnanceLevel?.condition && <p className="magic-condition-text">发动条件：{ordnanceLevel.condition}</p>}</> : tacticLevel?.effects.length ? tacticLevel.effects.map((effect) => <p key={effect.name}>{effect.description}</p>) : <p>客户端未配置可解析的效果。</p>}</div>
          <div className="magic-detail-block"><h5>解锁与升级</h5>{upgrade ? <><p className="magic-requirements"><span>综合索敌等级 ≥ {upgrade.scoutLevel}</span>{mark(upgrade, true)}</p><div className="magic-cost-label">升级到该级消耗</div>{materials(upgrade.materials)}</> : <p>当前车辆未匹配到完整的客户端升级配方。</p>}</div>
          <div className="magic-detail-block"><h5>面板属性增益</h5>{bonus.length ? <div className="magic-bonus-list">{bonus.map((item) => { const previous = priorBonus.find((other) => other.name === item.name)?.percent ?? 0; return <span key={item.name}><b>{item.name}</b> 本级 +{(item.percent - previous).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}% <em>累计 +{item.percent.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%</em></span>; })}</div> : <p>该级未配置可独立量化的基础属性增益。</p>}<small>这里展示客户端特性对初始属性的百分比，不把预览值写入顶部属性卡片；最终面板还受装备等因素影响。</small></div>
        </div>}
        {path && <details className="magic-level-table"><summary>查看 1～10 级全部效果、条件、消耗和增益</summary><div className="magic-level-scroll"><table><thead><tr><th>魔改等级</th><th>该级效果</th><th>综合索敌等级</th><th>累计徽记</th><th>本级消耗</th><th>初始属性增益</th></tr></thead><tbody>{path.levels.map((entry) => { const tacticEffects = kind === "tactics" ? (selected as MagicTactic).levels.find((value) => value.level === entry.level)?.effects ?? [] : []; const rowBonus = kind === "ordnance" ? data?.ordnanceBonuses.find((value) => value.level === entry.level)?.bonuses ?? [] : tacticEffects.map((effect) => ({ name: effect.name, percent: effect.basePercent })); const rowEffect = kind === "ordnance" ? (selected as MagicOrdnance).levels.find((value) => value.level === entry.level)?.effect ?? "—" : tacticEffects.map((effect) => effect.description).join("；"); return <tr key={entry.level} className={entry.level === level ? "active" : ""} onClick={() => setLevel(entry.level)}><td>{entry.level} 级</td><td className="magic-table-effect">{rowEffect || "—"}</td><td>{entry.scoutLevel} 级</td><td>{mark(entry)}</td><td>{materials(entry.materials)}</td><td>{rowBonus.map((item) => `${item.name} +${item.percent}%`).join(" · ") || "—"}</td></tr>; })}</tbody></table></div></details>}
      </div>}
    </> : <p className="magic-ordnance-empty">客户端未给这名钢舞姬配置该类魔改。</p>}
  </section>;
}

function AcquisitionSection({ routes, onOpenResearch }: { routes: AcquisitionRoute[]; onOpenResearch?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const iconText: Record<AcquisitionRoute["kind"], string> = { research: "研", chapter: "关", source: "取", event: "活", exchange: "兑", gift: "礼" };
  const hiddenCount = routes.reduce((total, route) => total + Math.max(0, route.details.length - 6), 0);
  return <section className="detail-section acquisition-section">
    <header className="acquisition-heading"><span><h3>获取途径</h3><small>可同时存在多种途径</small></span><b>{routes.length} 种</b></header>
    {routes.length ? <div className={`acquisition-grid${routes.length > 2 ? " acquisition-grid-multi" : ""}`}>{routes.map((route) => {
      const details = expanded ? route.details : route.details.slice(0, 6);
      const remaining = Math.max(0, route.details.length - details.length);
      const opensResearch = route.kind === "research" && Boolean(onOpenResearch);
      return <article className={`acquisition-card route-${route.kind}${opensResearch ? " acquisition-card-link" : ""}`} key={`${route.kind}-${route.label}`} role={opensResearch ? "button" : undefined} tabIndex={opensResearch ? 0 : undefined} onClick={opensResearch ? onOpenResearch : undefined} onKeyDown={opensResearch ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenResearch?.(); } } : undefined}>
        <i aria-hidden="true">{iconText[route.kind]}</i>
        <div><strong>{route.label}</strong>{opensResearch && <small className="acquisition-jump">打开研发配方 →</small>}{details.length > 0 && <div className="acquisition-details">{details.map((detail) => <span key={detail}>{detail}</span>)}{remaining > 0 && <span className="acquisition-more">另有 {remaining} 项</span>}</div>}</div>
      </article>;
    })}</div> : <p className="acquisition-empty">当前静态配置中尚未恢复出明确获取途径。</p>}
    {hiddenCount > 0 && <button className="acquisition-expand share-export-hide" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起关卡明细" : `展开全部明细（另有 ${hiddenCount} 项）`}</button>}
  </section>;
}

function ColonizationStatCard({ label, value, rank, statKey, bonuses }: { label: string; value: number | null; rank: RankResult; statKey: ColonizationKey; bonuses: ColonizationBonuses | undefined }) {
  const [appliedLevel, setAppliedLevel] = useState(0);
  const [draftLevel, setDraftLevel] = useState("0");
  const applyLevel = (raw: string) => {
    const parsed = Number(raw);
    const next = raw.trim() && Number.isFinite(parsed) ? Math.max(0, Math.min(12, Math.trunc(parsed))) : appliedLevel;
    setAppliedLevel(next);
    setDraftLevel(String(next));
  };
  const typedLevel = Number(draftLevel);
  const stepBase = draftLevel.trim() && Number.isFinite(typedLevel) ? Math.max(0, Math.min(12, Math.trunc(typedLevel))) : appliedLevel;
  const bonus = appliedLevel ? bonuses?.[statKey]?.[appliedLevel - 1] ?? 0 : 0;
  return <div className="colonization-stat-card">
    <span>{label}</span><strong className="colonization-stat-value">{number(value)}{bonus > 0 && <em>（+{bonus}）</em>}</strong>
    {bonuses ? <div className="colonization-level-control"><label htmlFor={`colonization-${statKey}`}>强殖等级 · 0–12</label><div className="colonization-level-stepper"><button type="button" disabled={stepBase === 0} onClick={() => applyLevel(String(stepBase - 1))} aria-label={`${label}强殖等级减一`}>−</button><input id={`colonization-${statKey}`} type="number" min={0} max={12} step={1} inputMode="numeric" value={draftLevel} onChange={(event) => setDraftLevel(event.target.value)} onBlur={(event) => applyLevel(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") applyLevel(event.currentTarget.value); }} aria-label={`${label}强殖等级，0到12级`} /><button type="button" disabled={stepBase === 12} onClick={() => applyLevel(String(stepBase + 1))} aria-label={`${label}强殖等级加一`}>+</button></div></div> : <small className="colonization-missing">客户端未配置强殖数据</small>}
    <small className="detail-stat-rank">排名 {rank ? `${rank.rank}/${rank.total}` : "—"}</small>
  </div>;
}

function isColonizationKey(key: VisibleStatKey): key is ColonizationKey {
  return key === "durability" || key === "evasion" || key === "accuracy" || key === "armor" || key === "piercing" || key === "power";
}

function detailStatsAtLevel(maiden: Maiden, level: number, growth: GrowthCurveDataset | null): StatSet {
  const snapshot = maiden.stats[String(level)];
  const stats = { ...maiden.stats["1"], ...snapshot };
  const row = growth?.rows[String(maiden.id)];
  for (const key of ["durability", "power", "piercing", "armor"] as const) {
    // Use exported, client-calculated values for intermediate levels; never interpolate rounded checkpoints.
    stats[key] = snapshot?.[key] ?? row?.[key][level - 1] ?? null;
  }
  return stats;
}

function DetailModal({ maiden, initialLevel, onClose, selected, onCompare, onOpenResearch, onOpenSimulator, simulatorOpen, allMaidens, colonization, magicProgression }: { maiden: Maiden; initialLevel: number; onClose: () => void; selected: boolean; onCompare: () => void; onOpenResearch: () => void; onOpenSimulator: () => void; simulatorOpen: boolean; allMaidens: Maiden[]; colonization: ColonizationBonuses | undefined; magicProgression?: MagicProgression }) {
  const [level, setLevel] = useState(initialLevel);
  const [growth, setGrowth] = useState<GrowthCurveDataset | null>(null);
  const [growthError, setGrowthError] = useState("");
  const [growthRetry, setGrowthRetry] = useState(0);
  useEffect(() => {
    let active = true;
    loadGrowthCurves().then((data) => {
      if (!allMaidens.every((row) => isGrowthCurveRow(data.rows[String(row.id)]))) throw new Error("逐级属性数据不完整");
      if (active) { setGrowth(data); setGrowthError(""); }
    }).catch((cause: unknown) => {
      if (active) setGrowthError(cause instanceof Error ? cause.message : "逐级属性加载失败");
    });
    return () => { active = false; };
  }, [allMaidens, growthRetry]);
  const stats = useMemo(() => detailStatsAtLevel(maiden, level, growth), [level, maiden, growth]);
  const ammunitionRanks = [...new Set(maiden.allAmmunition.map((ammo) => ammo.rank).filter((rank) => rank >= 1 && rank <= 3))].sort();
  const [selectedAmmunitionRank, setSelectedAmmunitionRank] = useState(() => Math.max(0, ...ammunitionRanks));
  const ammunitionRank = ammunitionRanks.includes(selectedAmmunitionRank) ? selectedAmmunitionRank : Math.max(0, ...ammunitionRanks);
  const visibleAmmunition = ammunitionRank ? maiden.allAmmunition.filter((ammo) => ammo.rank === ammunitionRank) : maiden.allAmmunition;
  const ammunitionTypes = [...new Set(maiden.allAmmunition.map((ammo) => ammo.type))];
  const [rankFilters, setRankFilters] = useState<RankFilters>(() => ({ ...emptyRankFilters }));
  const [rankFilterDraft, setRankFilterDraft] = useState<RankFilters>(() => ({ ...emptyRankFilters }));
  const [rankFilterOpen, setRankFilterOpen] = useState(false);
  const exportRef = useRef<HTMLElement>(null);
  const shareImage = useShareImage(exportRef);
  const rankFilterRows = useMemo(() => {
    const iconOptions = (items: NamedIcon[]) => [...new Map(items.filter((item) => item.name).map((item) => [item.name, { name: item.name, image: item.image }])).values()];
    const classes = [...new Map(allMaidens.map((row) => [row.className, { name: row.className, image: row.classIcon }])).values()];
    const ammunition = [...new Map(allMaidens.flatMap((row) => row.ammunition.map((ammo) => [ammo.type, { name: ammo.type, image: ammo.typeImage || ammo.image }]))).values()];
    const nations = [...new Map(allMaidens.map((row) => [row.nation, { name: row.nation, label: nationLabel(row.nation), image: row.nationIcon }])).values()];
    const rarities = [...new Map(allMaidens.map((row) => [row.rarity, { name: row.rarity, image: row.rarityIcon, hideLabel: true }])).values()];
    const stages = [...new Map(allMaidens.map((row) => [row.stage, { name: row.stage, image: row.stageIcon }])).values()].sort((left, right) => stageOrder(left.name) - stageOrder(right.name));
    const talents = [...new Map(allMaidens.flatMap((row) => row.talents.map((talent) => [talent.name, { name: talent.name, image: talent.image }]))).values()];
    const engineResistances = iconOptions(allMaidens.flatMap((row) => row.engineOptions.flatMap((option) => option.resistanceDetails)));
    const bodyResistances = iconOptions(allMaidens.flatMap((row) => row.bodyOptions.flatMap((option) => option.resistanceDetails)));
    return [
      { key: "classNames" as const, label: "车种（或）", options: classes },
      { key: "nations" as const, label: "国籍（或）", options: nations },
      { key: "rarities" as const, label: "稀有度（或）", options: rarities },
      { key: "stages" as const, label: "图纸（或）", options: stages },
      { key: "ammunition" as const, label: "弹种（且）", options: ammunition },
      { key: "engineResistances" as const, label: "引擎抗性（且）", options: engineResistances },
      { key: "bodyResistances" as const, label: "车体抗性（且）", options: bodyResistances },
      { key: "talents" as const, label: "才艺（且）", options: talents },
    ];
  }, [allMaidens]);
  const huntTraitOptions = useMemo(() => [...new Set(allMaidens.flatMap((row) => row.huntTraits.map((trait) => `${trait.task} ${trait.name}`)))].map((name) => ({ name })), [allMaidens]);
  const filteredRankRows = useMemo(() => filterRankRows(allMaidens, rankFilters), [allMaidens, rankFilters]);
  const filteredIncludesCurrent = filteredRankRows.some((row) => row.id === maiden.id);
  const rankRows = useMemo(() => filteredIncludesCurrent ? filteredRankRows : [...filteredRankRows, maiden], [filteredRankRows, filteredIncludesCurrent, maiden]);
  const rankFilterCount = activeRankFilterCount(rankFilters);
  const rankSummary = `${rankFilterCount ? "筛选范围" : "全部已实装"} · ${rankRows.length} 辆${filteredIncludesCurrent ? "" : " · 已补入本车"}`;
  const toggleRankFilterDraft = (key: RankFilterKey, value: string) => setRankFilterDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
  const openRankFilters = () => {
    setRankFilterDraft({ ...rankFilters, classNames: [...rankFilters.classNames], nations: [...rankFilters.nations], rarities: [...rankFilters.rarities], stages: [...rankFilters.stages], magicCost: [...rankFilters.magicCost], ammunition: [...rankFilters.ammunition], engineResistances: [...rankFilters.engineResistances], bodyResistances: [...rankFilters.bodyResistances], talents: [...rankFilters.talents] });
    setRankFilterOpen(true);
  };
  const statRanks = useMemo(() => {
    const rankStats = new Map(rankRows.map((row) => [row.id, detailStatsAtLevel(row, level, growth)]));
    return Object.fromEntries(statMeta.map((item) => [item.key, rankValue(stats[item.key], rankRows, (row) => rankStats.get(row.id)?.[item.key])])) as Record<StatKey, RankResult>;
  }, [level, rankRows, stats, growth]);
  const gradeRanks = useMemo(() => ({
    fireproof: rankValue(maiden.grades.fireproof.value, rankRows, (row) => row.grades.fireproof.value),
    homogeneity: rankValue(maiden.grades.homogeneity.value, rankRows, (row) => row.grades.homogeneity.value),
    coverage: rankValue(maiden.grades.coverage.value, rankRows, (row) => row.grades.coverage.value),
  }), [maiden, rankRows]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && !rankFilterOpen && !simulatorOpen && onClose();
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [onClose, rankFilterOpen, simulatorOpen]);
  return <div className="modal-backdrop" role="presentation" style={simulatorOpen ? { display: "none" } : undefined} onMouseDown={(event) => {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    const backdrop = event.currentTarget;
    const bounds = backdrop.getBoundingClientRect();
    const x = event.clientX - bounds.left - backdrop.clientLeft;
    const y = event.clientY - bounds.top - backdrop.clientTop;
    // Native scrollbar presses also target the backdrop; only its client area dismisses the dialog.
    if (x >= 0 && x < backdrop.clientWidth && y >= 0 && y < backdrop.clientHeight) onClose();
  }}>
    <section ref={exportRef} className="detail-modal share-capture-surface" role="dialog" aria-modal="true" aria-label={`${maiden.tank} 详细档案`}>
      <header className="detail-header">
        <div><p className="eyebrow" title={`模型 ${maiden.modelId} · 外观 ${maiden.appearanceId}`}>STEEL MAIDEN / {maiden.id}</p><h2>钢舞姬详细信息</h2></div>
        <div className="detail-actions share-export-hide"><button className="primary-action" onClick={onCompare}>{selected ? "移出对比" : "加入双车对比"}</button><button className="primary-action" onClick={onOpenSimulator}>配装模拟</button><ShareImageButton state={shareImage.state} onClick={shareImage.save} /><button className="modal-close" onClick={onClose} aria-label="关闭">×</button></div>
      </header>
      <div className="detail-body">
        <div className="detail-toolbar">
          <div><h3>{level}级基础属性</h3><small className="detail-rank-summary" role="status" aria-live="polite" data-count={rankRows.length} title="各属性从高到低排名，相同数值并列；当前钢舞姬不符合筛选时，仍补入本车参与比较。">{rankSummary}</small></div>
          <button className={`rank-filter-button share-export-hide${rankFilterCount ? " active" : ""}`} type="button" aria-label="排名范围筛选" aria-haspopup="dialog" aria-expanded={rankFilterOpen} title={rankFilterCount ? `已选 ${rankFilterCount} 项条件 · ${rankSummary}` : "未设置筛选条件，默认比较全部已实装钢舞姬"} onClick={openRankFilters}>排名范围筛选{rankFilterCount > 0 && <b>{rankFilterCount}</b>}</button>
          <DetailLevelSlider cardId={maiden.id} level={level} onChange={setLevel} disabled={!growth} />
        </div>
        {!growth && <div className="detail-level-status" role={growthError ? "alert" : "status"}>{growthError ? <>{growthError}，暂可使用四个快捷等级。<button type="button" onClick={() => { setGrowthError(""); setGrowthRetry((value) => value + 1); }}>重试</button></> : "正在加载 1–99 级属性…"}</div>}
        <div className="detail-overview">
          <div className="detail-identity"><table className="detail-identity-table" aria-label="钢舞姬基本信息"><tbody>
            <tr><th scope="row">人名</th><td>{maiden.person || "—"}</td></tr>
            <tr><th scope="row">车名</th><td className="detail-identity-tank">{maiden.tank}</td></tr>
            <tr><th scope="row">稀有度</th><td><RarityIcon maiden={maiden} /></td></tr>
            <tr><th scope="row">图纸</th><td><DetailBlueprintCost maiden={maiden} /></td></tr>
            <tr><th scope="row">车种</th><td><VehicleClassChip maiden={maiden} /></td></tr>
            <tr><th scope="row">国籍</th><td><NationChip maiden={maiden} /></td></tr>
          </tbody></table></div>
          <div className="detail-stat-grid">
          {statMeta.map((item) => isColonizationKey(item.key) ? <ColonizationStatCard key={item.key} label={item.label} value={stats[item.key]} rank={statRanks[item.key]} statKey={item.key} bonuses={colonization} /> : <div key={item.key}><span>{item.label}</span><strong>{number(stats[item.key])}</strong><small className="detail-stat-rank">排名 {statRanks[item.key] ? `${statRanks[item.key]!.rank}/${statRanks[item.key]!.total}` : "—"}</small></div>)}
          <div className="detail-grade-stat"><span>阻燃</span><strong>{maiden.grades.fireproof.grade || "—"}</strong><small>数值 {number(maiden.grades.fireproof.value)}</small><small className="detail-stat-rank">排名 {gradeRanks.fireproof ? `${gradeRanks.fireproof.rank}/${gradeRanks.fireproof.total}` : "—"}</small></div>
          <div className="detail-grade-stat"><span>均质度</span><strong>{maiden.grades.homogeneity.grade || "—"}</strong><small>数值 {number(maiden.grades.homogeneity.value)}</small><small className="detail-stat-rank">排名 {gradeRanks.homogeneity ? `${gradeRanks.homogeneity.rank}/${gradeRanks.homogeneity.total}` : "—"}</small></div>
          <div className="detail-grade-stat"><span>覆盖度</span><strong>{maiden.grades.coverage.grade || "—"}</strong><small>数值 {number(maiden.grades.coverage.value)}</small><small className="detail-stat-rank">排名 {gradeRanks.coverage ? `${gradeRanks.coverage.rank}/${gradeRanks.coverage.total}` : "—"}</small></div>
          <div className="detail-talent-stat"><span>才艺</span><TalentList items={maiden.talents} /></div>
          </div>
        </div>
        <div className="detail-portrait-info-grid">
          <MaidenPortraitGallery key={`portraits-${maiden.id}`} maiden={maiden} />
          <div className="detail-acquisition-slot-grid">
            <AcquisitionSection key={maiden.id} routes={maiden.acquisition ?? []} onOpenResearch={onOpenResearch} />
            <section className="detail-section detail-slot-section" aria-label="装备槽">
              <header className="acquisition-heading"><span><h3>装备槽</h3><small>右侧为解锁要求 · 悬停查看详情</small></span><b>{maiden.slotDetails.length} 个</b></header>
              <DetailEquipmentSlots cardId={maiden.id} items={maiden.slotDetails} />
            </section>
          </div>
        </div>
        <MagicOrdnanceSection maidenId={maiden.id} items={maiden.magicOrdnance ?? []} selectors={maiden.magicSelectors} data={magicProgression} />
        <div className="detail-section detail-loadout-section"><div className="detail-loadout-heading"><h3>弹药</h3>{ammunitionRanks.length > 0 && <GenerationTabs selected={ammunitionRank} onSelect={setSelectedAmmunitionRank} label="弹药期数" available={ammunitionRanks} />}</div><AmmunitionList items={visibleAmmunition} grouped types={ammunitionTypes} /><div className="detail-craft-groups"><CraftCardGroup label="引擎" type="引擎" options={maiden.engineOptions} /><CraftCardGroup label="车体" type="车体" options={maiden.bodyOptions} /><CraftCardGroup label="装甲" type="装甲" options={maiden.armorOptions} /></div></div>
        {(maiden.profile || maiden.tankProfile) && <div className="profile-grid">{maiden.profile && <div><h3>人物档案</h3><p>{maiden.profile}</p></div>}{maiden.tankProfile && <div><h3>载具档案</h3><p>{maiden.tankProfile}</p></div>}</div>}
        <div className="bio-line">{[["画师", maiden.artist], ["声优", maiden.cv], ["生日", maiden.birthday], ["部门/阵营", maiden.department], ["职务", maiden.job]].filter(([, value]) => value).map(([label, value]) => <span key={label}><b>{label}</b>{value}</span>)}</div>
        <MaidenQuotesSection cardId={maiden.id} />
        <div className="share-export-credit">钢舞姬战术档案库 · 测试服静态数据 · {level}级</div>
      </div>
    </section>
    {rankFilterOpen && <CardFilterDialog title="属性排名筛选" description="车种、国籍、稀有度、图纸、魔改费用各项内取 OR；弹种、抗性、才艺取 AND；狩猎任务单选。" onClose={() => setRankFilterOpen(false)} onReset={() => setRankFilterDraft({ ...emptyRankFilters })} onConfirm={() => { setRankFilters({ ...rankFilterDraft, classNames: [...rankFilterDraft.classNames], nations: [...rankFilterDraft.nations], rarities: [...rankFilterDraft.rarities], stages: [...rankFilterDraft.stages], magicCost: [...rankFilterDraft.magicCost], ammunition: [...rankFilterDraft.ammunition], engineResistances: [...rankFilterDraft.engineResistances], bodyResistances: [...rankFilterDraft.bodyResistances], talents: [...rankFilterDraft.talents] }); setRankFilterOpen(false); }}>
      <GroupedMaidenFilters rows={rankFilterRows} selected={(key) => rankFilterDraft[key]} onToggle={toggleRankFilterDraft} includeUnimplemented={rankFilterDraft.includeUnimplemented} maidens={allMaidens} magicCost={rankFilterDraft.magicCost} onMagicCostChange={(magicCost) => setRankFilterDraft((current) => ({ ...current, magicCost }))} />
      <MaidenFilterLastRow huntOptions={huntTraitOptions} huntTraits={rankFilterDraft.huntTraits} onHuntChange={(value) => setRankFilterDraft((current) => ({ ...current, huntTraits: value }))} includeUnimplemented={rankFilterDraft.includeUnimplemented} onImplementationChange={(includeUnimplemented) => setRankFilterDraft((current) => ({ ...current, includeUnimplemented }))} />
    </CardFilterDialog>}
  </div>;
}

function RadarComparison({ left, right, leftStats, rightStats }: { left: Maiden; right: Maiden; leftStats: StatSet; rightStats: StatSet }) {
  const size = 480;
  const center = size / 2;
  const radius = 144;
  const labelRadius = 188;
  const point = (index: number, scale: number, distance = radius) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / statMeta.length);
    return { x: center + Math.cos(angle) * distance * scale, y: center + Math.sin(angle) * distance * scale };
  };
  const polygon = (scales: number[], distance = radius) => scales.map((scale, index) => { const current = point(index, scale, distance); return `${current.x},${current.y}`; }).join(" ");
  const pairs = statMeta.map((meta) => {
    const leftValue = leftStats?.[meta.key] ?? 0;
    const rightValue = rightStats?.[meta.key] ?? 0;
    const maximum = Math.max(leftValue, rightValue, 1);
    return { meta, leftValue, rightValue, leftScale: leftValue / maximum, rightScale: rightValue / maximum };
  });
  return <section className="compare-radar" aria-label="八项基础属性雷达图">
    <div className="compare-radar-legend"><span className="left"><i />{left.tank}</span><span className="right"><i />{right.tank}</span></div>
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${left.tank} 与 ${right.tank} 八项基础属性雷达图`}>
      {[.25, .5, .75, 1].map((scale) => <polygon className="radar-grid" key={scale} points={polygon(statMeta.map(() => scale))} fill="#e0e7da" fillOpacity="0.25" stroke="#31483a" strokeOpacity="0.22" strokeWidth="1" />)}
      {statMeta.map((meta, index) => { const end = point(index, 1); return <line className="radar-axis" key={meta.key} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#31483a" strokeOpacity="0.18" strokeWidth="1" />; })}
      <polygon className="radar-shape radar-left" points={polygon(pairs.map((pair) => pair.leftScale))} fill="#86aa16" fillOpacity="0.2" stroke="#75970e" strokeWidth="3" strokeLinejoin="round" />
      <polygon className="radar-shape radar-right" points={polygon(pairs.map((pair) => pair.rightScale))} fill="#247f79" fillOpacity="0.17" stroke="#247f79" strokeWidth="3" strokeLinejoin="round" />
      {pairs.map((pair, index) => { const label = point(index, 1, labelRadius); const anchor = label.x < center - 12 ? "end" : label.x > center + 12 ? "start" : "middle"; return <text className="radar-label" key={pair.meta.key} x={label.x} y={label.y} textAnchor={anchor} fill="#314139" fontSize="11" fontWeight="900"><tspan x={label.x}>{pair.meta.label}</tspan><tspan className="radar-label-values" x={label.x} dy="15" fill="#758279" fontSize="8" fontWeight="750">{number(pair.leftValue)} / {number(pair.rightValue)}</tspan></text>; })}
    </svg>
    <p>各轴以两车该项较高值为 100% 归一化；标签数值顺序为左车 / 右车。</p>
  </section>;
}

function CompareModal({ maidens, onClose, onRemove }: { maidens: Maiden[]; onClose: () => void; onRemove: (id: number) => void }) {
  const exportRef = useRef<HTMLElement>(null);
  const shareImage = useShareImage(exportRef);
  const [level, setLevel] = useState(1);
  const [chartMode, setChartMode] = useState<"bars" | "radar" | "growth">("bars");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  if (maidens.length !== 2) return null;
  const [left, right] = maidens;
  const leftStats = left.stats[String(level)]; const rightStats = right.stats[String(level)];
  const ammoTypes = [...new Set([...left.ammunition, ...right.ammunition].map((ammo) => ammo.type))];
  const ammoFor = (maiden: Maiden, type: string) => maiden.ammunition.filter((ammo) => ammo.type === type);
  return <div className="modal-backdrop compare-backdrop" role="presentation">
    <section ref={exportRef} className="compare-modal share-capture-surface" role="dialog" aria-modal="true" aria-label="双车属性比较">
      <div className="share-export-controls share-export-hide"><ShareImageButton state={shareImage.state} onClick={shareImage.save} /></div>
      <button className="modal-close share-export-hide" onClick={onClose} aria-label="关闭">×</button>
      <header className="compare-header"><div><p className="eyebrow">HEAD-TO-HEAD ANALYSIS</p><h2>双车对比</h2></div><div className="compare-header-controls"><div className="compare-chart-toggle" aria-label="基础属性图表类型"><button className={chartMode === "bars" ? "active" : ""} onClick={() => setChartMode("bars")}>条形图</button><button className={chartMode === "radar" ? "active" : ""} onClick={() => setChartMode("radar")}>雷达图</button><button className={chartMode === "growth" ? "active" : ""} onClick={() => setChartMode("growth")}>曲线图</button></div><LevelPicker level={level} setLevel={setLevel} compact /></div></header>
      <div className="compare-identities">
        {[left, right].map((maiden) => <div key={maiden.id} className={`compare-identity rarity-${rarityTone(maiden.rarityId)}`}><div className="compare-art"><Portrait maiden={maiden} eager /></div><div><div className="compare-identity-chips"><StageChip maiden={maiden} /><RarityIcon maiden={maiden} /><VehicleClassChip maiden={maiden} /><NationChip maiden={maiden} /></div><h3>{maiden.tank}</h3><p>{maiden.person}</p><button className="share-export-hide" onClick={() => onRemove(maiden.id)}>移除此车</button></div></div>)}
      </div>
      {chartMode === "bars" ? <div className="compare-table">
        {statMeta.map((meta) => {
          const a = leftStats?.[meta.key] ?? 0; const b = rightStats?.[meta.key] ?? 0; const max = Math.max(a, b, 1); const delta = a - b;
          return <div className="compare-row" key={meta.key}>
            <div className={delta > 0 ? "winner" : ""}>{delta > 0 && <ValueDelta delta={delta} grouped className="compare-delta compare-delta-left" />}<strong>{number(a)}</strong><span className="bar bar-left" style={{ width: `${(a / max) * 100}%` }} /></div>
            <span className="compare-label">{meta.label}</span>
            <div className={delta < 0 ? "winner" : ""}><strong>{number(b)}</strong>{delta < 0 && <ValueDelta delta={-delta} grouped className="compare-delta compare-delta-right" />}<span className="bar bar-right" style={{ width: `${(b / max) * 100}%` }} /></div>
          </div>;
        })}
      </div> : chartMode === "radar" ? <RadarComparison left={left} right={right} leftStats={leftStats} rightStats={rightStats} /> : <CompareGrowthCurve left={left} right={right} detailLevel={level} />}
      <div className="compare-details">
        <div className="compare-loadout-title"><strong>最高期弹药</strong><span>按弹种分组 · 每侧每行两张卡片</span></div>
        {ammoTypes.map((type) => <section className="compare-ammo-section" key={type}>
          <header><strong>{type}</strong><span>{ammoFor(left, type).length} / {ammoFor(right, type).length} 种</span></header>
          <div className="compare-detail-pair">
            {[left, right].map((maiden) => {
              const ammunition = ammoFor(maiden, type);
              return <div className="compare-detail-side" key={`${maiden.id}-${type}`}><div className="compare-side-caption"><strong>{maiden.tank}</strong><span>{ammunition.length} 种</span></div>{ammunition.length ? <div className="compare-ammo-grid">{ammunition.map((ammo) => <AmmunitionCard key={ammo.id} ammo={ammo} />)}</div> : <div className="compare-section-empty">未配置此弹种</div>}</div>;
            })}
          </div>
        </section>)}
        <ComparePairSection label="最高期引擎" left={<CraftOptionList label={left.tank} options={highestRankCrafts(left.engineOptions)} compact />} right={<CraftOptionList label={right.tank} options={highestRankCrafts(right.engineOptions)} compact />} />
        <ComparePairSection label="最高期车体" left={<CraftOptionList label={left.tank} options={highestRankCrafts(left.bodyOptions)} compact />} right={<CraftOptionList label={right.tank} options={highestRankCrafts(right.bodyOptions)} compact />} />
        <ComparePairSection label="装备槽" left={<SlotList items={left.slotDetails} />} right={<SlotList items={right.slotDetails} />} />
        <ComparePairSection label="才艺" left={<div className="compare-talent-card"><TalentList items={left.talents} /></div>} right={<div className="compare-talent-card"><TalentList items={right.talents} /></div>} />
      </div>
      <div className="share-export-credit">钢舞姬战术档案库 · 测试服静态数据 · {level}级双车对比</div>
    </section>
  </div>;
}

function ResearchHead({ node }: { node: Pick<ResearchNode, "id" | "tank" | "headImage"> }) {
  return <span className="research-head">{node.headImage ? <img src={node.headImage} alt="" loading="lazy" /> : <b>{node.tank.slice(0, 2)}</b>}</span>;
}

function requirementText(requirement: ResearchRequirement) {
  const parts = [];
  if (requirement.generation) parts.push(`${requirement.generation}代`);
  if (requirement.level) parts.push(`${requirement.level}级`);
  return parts.length ? parts.join(" · ") : "已获得";
}

type GraphDirection = "both" | "upstream" | "downstream";
type GraphMaidenItem = { kind: "maiden"; key: string; node: ResearchNode; layer: number; x: number; y: number; width: number; height: number };
type GraphRecipeItem = { kind: "recipe"; key: string; recipe: ResearchRecipe; layer: number; x: number; y: number; width: number; height: number; label: string };
type GraphItem = GraphMaidenItem | GraphRecipeItem;
type GraphRawItem = Omit<GraphMaidenItem, "x" | "y"> | Omit<GraphRecipeItem, "x" | "y">;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained only to keep older saved bundles readable during this release transition
function LegacyResearchGraph({ data }: { data: ResearchDataset }) {
  const nodeById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const recipeById = useMemo(() => new Map(data.recipes.map((recipe) => [recipe.id, recipe])), [data]);
  const defaultNode = useMemo(() => [...data.nodes].sort((left, right) => (right.upstreamRecipeIds.length + right.downstream.length) - (left.upstreamRecipeIds.length + left.downstream.length))[0], [data]);
  const [focusId, setFocusId] = useState(defaultNode?.id ?? data.nodes[0]?.id ?? 0);
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState(2);
  const [direction, setDirection] = useState<GraphDirection>("both");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const focus = (nodeById.get(focusId) ?? defaultNode)!;
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return data.nodes.filter((node) => `${node.id} ${node.tank} ${node.person}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [data.nodes, query]);

  const layout = useMemo(() => {
    const layers = new Map<number, number>([[focusId, 0]]);
    const recipeIds = new Set<string>();
    const assignLayer = (id: number, layer: number) => {
      if (id === focusId) return;
      const current = layers.get(id);
      if (current === undefined || Math.abs(layer) < Math.abs(current)) layers.set(id, layer);
    };
    if (direction !== "downstream") {
      let frontier = new Set([focusId]);
      for (let step = 1; step <= depth; step += 1) {
        const next = new Set<number>();
        frontier.forEach((id) => {
          nodeById.get(id)?.upstreamRecipeIds.forEach((recipeId) => {
            const recipe = recipeById.get(recipeId);
            if (!recipe) return;
            recipeIds.add(recipeId);
            recipe.requirements.forEach((requirement) => { assignLayer(requirement.cardId, -step); next.add(requirement.cardId); });
          });
        });
        frontier = next;
      }
    }
    if (direction !== "upstream") {
      let frontier = new Set([focusId]);
      for (let step = 1; step <= depth; step += 1) {
        const next = new Set<number>();
        frontier.forEach((id) => {
          nodeById.get(id)?.downstream.forEach(({ recipeId, targetId }) => {
            const recipe = recipeById.get(recipeId);
            if (!recipe) return;
            recipeIds.add(recipeId);
            assignLayer(targetId, step);
            next.add(targetId);
            recipe.requirements.forEach((requirement) => assignLayer(requirement.cardId, step - 1));
          });
        });
        frontier = next;
      }
    }
    recipeIds.forEach((recipeId) => {
      const recipe = recipeById.get(recipeId)!;
      if (!layers.has(recipe.targetId)) assignLayer(recipe.targetId, 0);
      const targetLayer = layers.get(recipe.targetId) ?? 0;
      recipe.requirements.forEach((requirement) => {
        if (!layers.has(requirement.cardId)) assignLayer(requirement.cardId, targetLayer - 1);
      });
    });
    const rawItems: GraphRawItem[] = [];
    layers.forEach((layer, id) => {
      const node = nodeById.get(id);
      if (node) rawItems.push({ kind: "maiden", key: `M${id}`, node, layer, width: 230, height: 78 });
    });
    recipeIds.forEach((recipeId) => {
      const recipe = recipeById.get(recipeId)!;
      const targetLayer = layers.get(recipe.targetId) ?? 0;
      const siblingIds = nodeById.get(recipe.targetId)?.upstreamRecipeIds ?? [];
      rawItems.push({ kind: "recipe", key: recipeId, recipe, layer: targetLayer - .5, width: 96, height: 48, label: siblingIds.length > 1 ? `配方 ${siblingIds.indexOf(recipeId) + 1}` : "研发" });
    });
    const grouped = new Map<number, GraphRawItem[]>();
    rawItems.forEach((item) => grouped.set(item.layer, [...(grouped.get(item.layer) ?? []), item]));
    grouped.forEach((items) => items.sort((left, right) => left.kind === "maiden" && right.kind === "maiden" ? left.node.tank.localeCompare(right.node.tank, "zh-CN", { numeric: true }) : left.key.localeCompare(right.key)));
    const layerValues = [...grouped.keys()].sort((a, b) => a - b);
    const minLayer = Math.min(...layerValues, 0);
    const maxLayer = Math.max(...layerValues, 0);
    const tallest = Math.max(...[...grouped.values()].map((items) => items.reduce((sum, item) => sum + item.height + 22, 0)), 520);
    const width = Math.max(1100, (maxLayer - minLayer) * 340 + 360);
    const height = Math.max(620, tallest + 90);
    const items: GraphItem[] = [];
    grouped.forEach((column, layer) => {
      const columnHeight = column.reduce((sum, item) => sum + item.height + 22, 0) - 22;
      let y = (height - columnHeight) / 2;
      const centerX = 180 + (layer - minLayer) * 340;
      column.forEach((item) => {
        items.push({ ...item, x: centerX - item.width / 2, y } as GraphItem);
        y += item.height + 22;
      });
    });
    const maidenItems = new Map(items.filter((item): item is GraphMaidenItem => item.kind === "maiden").map((item) => [item.node.id, item]));
    const recipeItems = new Map(items.filter((item): item is GraphRecipeItem => item.kind === "recipe").map((item) => [item.recipe.id, item]));
    return { width, height, items, maidenItems, recipeItems, recipes: [...recipeIds].map((id) => recipeById.get(id)!).filter(Boolean) };
  }, [depth, direction, focusId, nodeById, recipeById]);

  function fitGraph() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextScale = Math.min(1, (viewport.clientWidth - 36) / layout.width, (viewport.clientHeight - 36) / layout.height);
    setScale(nextScale);
    setPan({ x: (viewport.clientWidth - layout.width * nextScale) / 2, y: (viewport.clientHeight - layout.height * nextScale) / 2 });
  }
  useEffect(() => {
    const frame = requestAnimationFrame(fitGraph);
    return () => cancelAnimationFrame(frame);
  // fitGraph intentionally follows the current graph bounds.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height, focusId, depth, direction]);

  function locate(id: number) { if (nodeById.has(id)) { setFocusId(id); setQuery(""); } }
  function locateQuery() {
    const needle = query.trim().toLowerCase();
    const exactId = Number(needle.replace(/^#/, ""));
    const match = nodeById.get(exactId) ?? data.nodes.find((node) => node.tank.toLowerCase() === needle || node.person.toLowerCase() === needle) ?? suggestions[0];
    if (match) locate(match.id);
  }
  function zoomBy(factor: number) { setScale((value) => Math.max(.25, Math.min(1.8, value * factor))); }

  return <section className="archive-section graph-archive">
    <div className="table-toolbar"><div><p className="eyebrow">MULTI-LEVEL RESEARCH MAP</p><h2>研发路线</h2></div><p>从左到右查看“前置钢舞姬 → 配方 → 研发目标”。多辆车汇入同一个配方节点时表示 AND，不同配方节点汇入同一目标时表示 OR。</p></div>
    <div className="graph-toolbar">
      <div className="graph-search-wrap"><form className="graph-search" onSubmit={(event) => { event.preventDefault(); locateQuery(); }}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入坦克名、人名或 ID 定位…" /><button type="submit">定位</button></form>{suggestions.length > 0 && <div className="graph-suggestions">{suggestions.map((node) => <button key={node.id} onClick={() => locate(node.id)}><ResearchHead node={node} /><span><strong>{node.tank}</strong><small>{node.person} · {node.stage} · #{node.id}</small></span></button>)}</div>}</div>
      <label><span>显示方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as GraphDirection)}><option value="both">上下级都显示</option><option value="upstream">只看研发上级</option><option value="downstream">只看研发下级</option></select></label>
      <label><span>展开层数</span><select value={depth} onChange={(event) => setDepth(Number(event.target.value))}><option value={1}>1 层</option><option value={2}>2 层</option><option value={3}>3 层</option></select></label>
      <div className="graph-zoom" aria-label="关系图缩放"><button onClick={() => zoomBy(.8)} aria-label="缩小">−</button><b>{Math.round(scale * 100)}%</b><button onClick={() => zoomBy(1.25)} aria-label="放大">＋</button><button onClick={fitGraph}>适应画布</button></div>
    </div>
    <div className="graph-status"><div><ResearchHead node={focus} /><span><small>当前中心</small><strong>{focus?.tank}</strong><em>{focus?.person} · #{focus?.id}</em></span></div><p><b>{layout.maidenItems.size}</b> 位钢舞姬 <i>·</i> <b>{layout.recipes.length}</b> 套研发配方</p><div className="graph-legend"><span><i className="legend-focus" />当前中心</span><span><i className="legend-maiden" />钢舞姬</span><span><i className="legend-recipe" />配方 / AND</span></div></div>
    <div className="graph-viewport" ref={viewportRef}>
      <svg width="100%" height="100%" role="img" aria-label={`${focus?.tank ?? "钢舞姬"}的多层研发路线`} onPointerDown={(event) => { if ((event.target as Element).closest(".graph-maiden-node")) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; }} onPointerMove={(event) => { const drag = dragRef.current; if (drag?.pointerId === event.pointerId) setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y }); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onWheel={(event) => { event.preventDefault(); zoomBy(event.deltaY > 0 ? .9 : 1.1); }}>
        <defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker><filter id="focus-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity=".22" /></filter></defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          <rect className="graph-pan-surface" width={layout.width} height={layout.height} rx="20" />
          {layout.recipes.flatMap((recipe) => {
            const recipeItem = layout.recipeItems.get(recipe.id);
            const targetItem = layout.maidenItems.get(recipe.targetId);
            if (!recipeItem || !targetItem) return [];
            const targetPath = <path key={`${recipe.id}-target`} className="graph-edge graph-edge-target" d={`M ${recipeItem.x + recipeItem.width} ${recipeItem.y + recipeItem.height / 2} C ${recipeItem.x + recipeItem.width + 55} ${recipeItem.y + recipeItem.height / 2}, ${targetItem.x - 55} ${targetItem.y + targetItem.height / 2}, ${targetItem.x} ${targetItem.y + targetItem.height / 2}`} markerEnd="url(#graph-arrow)" />;
            const requirementPaths = recipe.requirements.map((requirement) => {
              const sourceItem = layout.maidenItems.get(requirement.cardId);
              if (!sourceItem) return null;
              return <g key={`${recipe.id}-${requirement.cardId}`}><path className="graph-edge" d={`M ${sourceItem.x + sourceItem.width} ${sourceItem.y + sourceItem.height / 2} C ${sourceItem.x + sourceItem.width + 44} ${sourceItem.y + sourceItem.height / 2}, ${recipeItem.x - 44} ${recipeItem.y + recipeItem.height / 2}, ${recipeItem.x} ${recipeItem.y + recipeItem.height / 2}`} /><text className="graph-edge-label" x={(sourceItem.x + sourceItem.width + recipeItem.x) / 2} y={(sourceItem.y + sourceItem.height / 2 + recipeItem.y + recipeItem.height / 2) / 2 - 7}>{requirementText(requirement)}</text></g>;
            });
            return [...requirementPaths, targetPath];
          })}
          {layout.items.map((item) => item.kind === "recipe" ? <g className="graph-recipe-node" key={item.key} transform={`translate(${item.x} ${item.y})`}><rect width={item.width} height={item.height} rx="13" /><text x={item.width / 2} y="20" textAnchor="middle">{item.recipe.requirements.length > 1 ? "AND" : "1 项"}</text><text className="graph-recipe-label" x={item.width / 2} y="36" textAnchor="middle">{item.label}</text></g> : <g className={`graph-maiden-node ${item.node.id === focusId ? "focus" : ""}`} key={item.key} transform={`translate(${item.x} ${item.y})`} onClick={() => locate(item.node.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") locate(item.node.id); }}><rect width={item.width} height={item.height} rx="15" />{item.node.headImage ? <image href={item.node.headImage} x="8" y="8" width="62" height="62" preserveAspectRatio="xMidYMid slice" /> : <text className="graph-node-fallback" x="39" y="44" textAnchor="middle">{item.node.tank.slice(0, 2)}</text>}<text className="graph-node-stage" x="80" y="20">{item.node.stage} · {item.node.className}</text><text className="graph-node-title" x="80" y="43">{item.node.tank.length > 17 ? `${item.node.tank.slice(0, 16)}…` : item.node.tank}</text><text className="graph-node-person" x="80" y="62">{item.node.person.length > 19 ? `${item.node.person.slice(0, 18)}…` : item.node.person}</text><text className="graph-node-id" x={item.width - 9} y="18" textAnchor="end">#{item.node.id}</text></g>)}
        </g>
      </svg>
      <div className="graph-pan-hint">拖动空白处平移 · 滚轮缩放 · 点击节点重新展开</div>
    </div>
  </section>;
}

function ResearchGraph({ data, onOpenResearch }: { data: ResearchDataset; onOpenResearch: (id: number) => void }) {
  const nodeById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const recipeById = useMemo(() => new Map(data.recipes.map((recipe) => [recipe.id, recipe])), [data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [direction, setDirection] = useState<GraphDirection>("both");
  const [query, setQuery] = useState("");
  const selected = selectedId === null ? null : nodeById.get(selectedId) ?? null;
  const chainScrollRef = useRef<HTMLDivElement>(null);
  const chainFlowRef = useRef<HTMLDivElement>(null);
  const [panX, setPanX] = useState(0);
  const panXRef = useRef(0);
  const panStateRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; pageScrollY: number } | null>(null);
  const pendingPanRef = useRef<{ panX: number; pageScrollY: number } | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null);
  const [lockedGroupKey, setLockedGroupKey] = useState<string | null>(null);
  const [hideOthers, setHideOthers] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const androidGallery = useAndroidGalleryBridge();
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return data.nodes.filter((node) => `${node.id} ${node.tank} ${node.person} ${node.stage}`.toLowerCase().includes(needle)).slice(0, 10);
  }, [data.nodes, query]);

  const chain = useMemo(() => {
    if (selectedId === null) return null;
    const layers = new Map<number, number>([[selectedId, 0]]);
    const includedRecipeIds = new Set<string>();
    const upstreamRecipeIds = new Set<string>();
    const skippedCycleRecipeIds = new Set<string>();
    const downstreamMainByRecipe = new Map<string, number>();
    const acceptedEdges = new Map<number, Set<number>>();
    const canReach = (startId: number, targetId: number, visited = new Set<number>()): boolean => {
      if (startId === targetId) return true;
      if (visited.has(startId)) return false;
      visited.add(startId);
      return [...(acceptedEdges.get(startId) ?? [])].some((nextId) => canReach(nextId, targetId, visited));
    };
    const includeRecipe = (recipe: ResearchRecipe) => {
      if (includedRecipeIds.has(recipe.id)) return true;
      if (recipe.requirements.some((requirement) => canReach(recipe.targetId, requirement.cardId))) {
        skippedCycleRecipeIds.add(recipe.id);
        return false;
      }
      includedRecipeIds.add(recipe.id);
      recipe.requirements.forEach((requirement) => {
        const targets = acceptedEdges.get(requirement.cardId) ?? new Set<number>();
        targets.add(recipe.targetId);
        acceptedEdges.set(requirement.cardId, targets);
      });
      return true;
    };
    const upstreamVisited = new Set<number>();
    const upstreamNodeIds = new Set<number>([selectedId]);
    const walkUpstream = (currentId: number, currentLayer: number, path: Set<number>) => {
      if (upstreamVisited.has(currentId)) return;
      upstreamVisited.add(currentId);
      nodeById.get(currentId)?.upstreamRecipeIds.forEach((recipeId) => {
        const recipe = recipeById.get(recipeId);
        if (!recipe) return;
        const requirementIds = recipe.requirements.map((requirement) => requirement.cardId);
        if (requirementIds.some((id) => path.has(id))) {
          skippedCycleRecipeIds.add(recipeId);
          return;
        }
        if (!includeRecipe(recipe)) return;
        upstreamRecipeIds.add(recipe.id);
        const nextPath = new Set(path);
        requirementIds.forEach((id) => {
          nextPath.add(id);
          upstreamNodeIds.add(id);
        });
        recipe.requirements.forEach((requirement) => {
          const nextLayer = currentLayer - 1;
          const knownLayer = layers.get(requirement.cardId);
          if (requirement.cardId !== selectedId && (knownLayer === undefined || nextLayer < knownLayer)) layers.set(requirement.cardId, nextLayer);
          walkUpstream(requirement.cardId, nextLayer, nextPath);
        });
      });
    };
    if (direction !== "downstream") walkUpstream(selectedId, 0, new Set([selectedId]));

    const downstreamVisited = new Set<number>();
    const walkDownstream = (currentId: number, currentLayer: number, path: Set<number>) => {
      if (downstreamVisited.has(currentId)) return;
      downstreamVisited.add(currentId);
      nodeById.get(currentId)?.downstream.forEach(({ recipeId, targetId }) => {
        const recipe = recipeById.get(recipeId);
        if (!recipe) return;
        if (path.has(targetId) || (targetId !== selectedId && upstreamNodeIds.has(targetId))) {
          skippedCycleRecipeIds.add(recipeId);
          return;
        }
        if (!includeRecipe(recipe)) return;
        if (!downstreamMainByRecipe.has(recipeId)) downstreamMainByRecipe.set(recipeId, currentId);
        const targetLayer = currentLayer + 1;
        const knownTargetLayer = layers.get(targetId);
        if (targetId !== selectedId && (knownTargetLayer === undefined || targetLayer > knownTargetLayer)) layers.set(targetId, targetLayer);
        recipe.requirements.forEach((requirement) => {
          if (requirement.cardId !== selectedId && !layers.has(requirement.cardId)) layers.set(requirement.cardId, currentLayer);
        });
        const nextPath = new Set(path);
        recipe.requirements.forEach((requirement) => nextPath.add(requirement.cardId));
        nextPath.add(targetId);
        walkDownstream(targetId, targetLayer, nextPath);
      });
    };
    if (direction !== "upstream") walkDownstream(selectedId, 0, new Set([selectedId]));

    const recipes = [...includedRecipeIds].map((id) => recipeById.get(id)).filter(Boolean) as ResearchRecipe[];
    const chainNodeIds = new Set<number>([selectedId]);
    const indegrees = new Map<number, number>();
    const outgoing = new Map<number, Set<number>>();
    const edgeKeys = new Set<string>();
    recipes.forEach((recipe) => {
      chainNodeIds.add(recipe.targetId);
      recipe.requirements.forEach((requirement) => {
        chainNodeIds.add(requirement.cardId);
        const edgeKey = `${requirement.cardId}-${recipe.targetId}`;
        if (edgeKeys.has(edgeKey)) return;
        edgeKeys.add(edgeKey);
        const targets = outgoing.get(requirement.cardId) ?? new Set<number>();
        targets.add(recipe.targetId);
        outgoing.set(requirement.cardId, targets);
        indegrees.set(recipe.targetId, (indegrees.get(recipe.targetId) ?? 0) + 1);
      });
    });
    chainNodeIds.forEach((id) => indegrees.set(id, indegrees.get(id) ?? 0));
    const topologicalLayers = new Map<number, number>();
    const layerQueue = [...chainNodeIds].filter((id) => indegrees.get(id) === 0);
    layerQueue.forEach((id) => topologicalLayers.set(id, 0));
    while (layerQueue.length) {
      const currentId = layerQueue.shift()!;
      const currentLayer = topologicalLayers.get(currentId) ?? 0;
      (outgoing.get(currentId) ?? new Set<number>()).forEach((targetId) => {
        topologicalLayers.set(targetId, Math.max(topologicalLayers.get(targetId) ?? 0, currentLayer + 1));
        const remaining = (indegrees.get(targetId) ?? 1) - 1;
        indegrees.set(targetId, remaining);
        if (remaining === 0) layerQueue.push(targetId);
      });
    }
    const selectedLayer = topologicalLayers.get(selectedId) ?? 0;
    layers.clear();
    topologicalLayers.forEach((layer, id) => layers.set(id, layer - selectedLayer));
    const rows = new Map<number, { key: string; recipes: ResearchRecipe[]; members: { node: ResearchNode; requirement: ResearchRequirement | null }[]; terminal: boolean; mainId: number }[]>();
    const targetsUsedAsRequirements = new Set(recipes.flatMap((recipe) => recipe.requirements.map((requirement) => requirement.cardId)));
    const recipesByMemberSet = new Map<string, ResearchRecipe[]>();
    recipes.forEach((recipe) => {
      const memberIds = [...new Set(recipe.requirements.map((requirement) => requirement.cardId))].sort((left, right) => left - right);
      const key = memberIds.length === 1 ? `maiden-${memberIds[0]}` : `combo-${memberIds.join("-")}`;
      recipesByMemberSet.set(key, [...(recipesByMemberSet.get(key) ?? []), recipe]);
    });
    recipesByMemberSet.forEach((groupRecipes, key) => {
      const requirementById = new Map<number, ResearchRequirement>();
      groupRecipes.forEach((recipe) => recipe.requirements.forEach((requirement) => {
        if (!requirementById.has(requirement.cardId)) requirementById.set(requirement.cardId, requirement);
      }));
      const members = [...requirementById.values()].map((requirement) => ({ node: nodeById.get(requirement.cardId)!, requirement })).filter((item) => item.node);
      const layer = Math.max(...members.map((member) => layers.get(member.node.id) ?? 0));
      const downstreamMain = groupRecipes.map((recipe) => downstreamMainByRecipe.get(recipe.id)).find((id) => id !== undefined && members.some((member) => member.node.id === id));
      const mainId = members.some((item) => item.node.id === selectedId) ? selectedId : downstreamMain ?? members[0]?.node.id ?? 0;
      rows.set(layer, [...(rows.get(layer) ?? []), { key, recipes: groupRecipes, members, terminal: false, mainId }]);
    });
    const terminalIds = new Set<number>();
    recipes.forEach((recipe) => {
      if (!targetsUsedAsRequirements.has(recipe.targetId)) terminalIds.add(recipe.targetId);
    });
    if (!recipes.length || !recipes.some((recipe) => recipe.requirements.some((requirement) => requirement.cardId === selectedId))) terminalIds.add(selectedId);
    terminalIds.forEach((id) => {
      const node = nodeById.get(id);
      if (!node) return;
      const layer = layers.get(id) ?? 0;
      rows.set(layer, [...(rows.get(layer) ?? []), { key: `terminal-${id}`, recipes: [], members: [{ node, requirement: null }], terminal: true, mainId: id }]);
    });
    const orderedRows = [...rows.entries()].sort(([left], [right]) => left - right).map(([layer, groups]) => ({
      layer,
      groups: groups.sort((left, right) => left.members[0].node.tank.localeCompare(right.members[0].node.tank, "zh-CN", { numeric: true })),
    }));
    const layoutRows = orderedRows.map((row, rowIndex) => ({ ...row, rowIndex, groups: [...row.groups] }));
    const groupRecords = layoutRows.flatMap((row) => row.groups.map((group) => ({ ...group, layer: row.layer, rowIndex: row.rowIndex })));
    const groupEdges: { key: string; sourceKey: string; targetKey: string; primary: boolean; focus: boolean; weight: number }[] = [];
    groupRecords.forEach((source) => {
      if (!source.recipes.length) return;
      const outputIds = new Set(source.recipes.map((recipe) => recipe.targetId));
      groupRecords.forEach((target) => {
        if (target.rowIndex <= source.rowIndex) return;
        const linkedOutputIds = target.members.map((member) => member.node.id).filter((id) => outputIds.has(id));
        if (!linkedOutputIds.length) return;
        const primary = linkedOutputIds.includes(target.mainId);
        const sourceFocus = source.recipes.some((recipe) => upstreamRecipeIds.has(recipe.id));
        const targetFocus = target.recipes.some((recipe) => upstreamRecipeIds.has(recipe.id)) || linkedOutputIds.includes(selectedId);
        const focus = sourceFocus && targetFocus;
        groupEdges.push({
          key: `${source.key}-${target.key}`,
          sourceKey: source.key,
          targetKey: target.key,
          primary,
          focus,
          weight: focus ? 24 : primary ? 6 : 1,
        });
      });
    });
    const incomingByGroup = new Map<string, { key: string; weight: number }[]>();
    const outgoingByGroup = new Map<string, { key: string; weight: number }[]>();
    groupEdges.forEach((edge) => {
      incomingByGroup.set(edge.targetKey, [...(incomingByGroup.get(edge.targetKey) ?? []), { key: edge.sourceKey, weight: edge.weight }]);
      outgoingByGroup.set(edge.sourceKey, [...(outgoingByGroup.get(edge.sourceKey) ?? []), { key: edge.targetKey, weight: edge.weight }]);
    });
    const orderPositions = () => {
      const positions = new Map<string, number>();
      layoutRows.forEach((row) => row.groups.forEach((group, index) => positions.set(group.key, row.groups.length === 1 ? .5 : index / (row.groups.length - 1))));
      return positions;
    };
    const reorderRow = (rowIndex: number, neighbors: Map<string, { key: string; weight: number }[]>) => {
      const row = layoutRows[rowIndex];
      const positions = orderPositions();
      const previous = new Map(row.groups.map((group, index) => [group.key, index]));
      const score = (key: string) => {
        const related = neighbors.get(key) ?? [];
        const totalWeight = related.reduce((sum, item) => sum + item.weight, 0);
        return related.length ? related.reduce((sum, item) => sum + (positions.get(item.key) ?? .5) * item.weight, 0) / totalWeight : positions.get(key) ?? .5;
      };
      row.groups.sort((left, right) => score(left.key) - score(right.key) || (previous.get(left.key) ?? 0) - (previous.get(right.key) ?? 0));
    };
    for (let sweep = 0; sweep < 6; sweep += 1) {
      for (let rowIndex = 1; rowIndex < layoutRows.length; rowIndex += 1) reorderRow(rowIndex, incomingByGroup);
      for (let rowIndex = layoutRows.length - 2; rowIndex >= 0; rowIndex -= 1) reorderRow(rowIndex, outgoingByGroup);
    }
    const cardWidth = 296;
    const cardHeight = 206;
    const horizontalGap = 42;
    const verticalGap = 82;
    const canvasPadding = 42;
    const widestRow = Math.max(1, ...layoutRows.map((row) => row.groups.length));
    const canvasWidth = Math.max(760, widestRow * cardWidth + (widestRow - 1) * horizontalGap + canvasPadding * 2);
    const centers = new Map<string, number>();
    layoutRows.forEach((row) => {
      const rowWidth = row.groups.length * cardWidth + Math.max(0, row.groups.length - 1) * horizontalGap;
      const start = (canvasWidth - rowWidth) / 2 + cardWidth / 2;
      row.groups.forEach((group, index) => centers.set(group.key, start + index * (cardWidth + horizontalGap)));
    });
    const placeTowardNeighbors = (rowIndex: number, neighbors: Map<string, { key: string; weight: number }[]>) => {
      const row = layoutRows[rowIndex];
      if (!row.groups.length) return;
      const minCenter = canvasPadding + cardWidth / 2;
      const maxCenter = canvasWidth - canvasPadding - cardWidth / 2;
      const pitch = cardWidth + horizontalGap;
      const values = row.groups.map((group) => {
        const related = neighbors.get(group.key) ?? [];
        if (!related.length) return centers.get(group.key) ?? minCenter;
        const totalWeight = related.reduce((sum, item) => sum + item.weight, 0);
        const desired = related.reduce((sum, item) => sum + (centers.get(item.key) ?? canvasWidth / 2) * item.weight, 0) / totalWeight;
        return (centers.get(group.key) ?? desired) * .3 + desired * .7;
      });
      for (let index = 1; index < values.length; index += 1) values[index] = Math.max(values[index], values[index - 1] + pitch);
      if (values.at(-1)! > maxCenter) {
        const shift = values.at(-1)! - maxCenter;
        for (let index = 0; index < values.length; index += 1) values[index] -= shift;
      }
      for (let index = values.length - 2; index >= 0; index -= 1) values[index] = Math.min(values[index], values[index + 1] - pitch);
      if (values[0] < minCenter) {
        const shift = minCenter - values[0];
        for (let index = 0; index < values.length; index += 1) values[index] += shift;
      }
      row.groups.forEach((group, index) => centers.set(group.key, values[index]));
    };
    for (let sweep = 0; sweep < 8; sweep += 1) {
      for (let rowIndex = 1; rowIndex < layoutRows.length; rowIndex += 1) placeTowardNeighbors(rowIndex, incomingByGroup);
      for (let rowIndex = layoutRows.length - 2; rowIndex >= 0; rowIndex -= 1) placeTowardNeighbors(rowIndex, outgoingByGroup);
    }
    const rawPlacedGroups = layoutRows.flatMap((row, rowIndex) => row.groups.map((group) => ({
      ...group,
      rowIndex,
      x: (centers.get(group.key) ?? canvasWidth / 2) - cardWidth / 2,
      y: canvasPadding + rowIndex * (cardHeight + verticalGap),
    })));
    const placedMinX = Math.min(canvasPadding, ...rawPlacedGroups.map((group) => group.x));
    const placedMaxX = Math.max(canvasWidth - canvasPadding, ...rawPlacedGroups.map((group) => group.x + cardWidth));
    const placedShiftX = Math.max(0, canvasPadding - placedMinX);
    const normalizedCanvasWidth = Math.ceil(Math.max(canvasWidth + placedShiftX, placedMaxX + placedShiftX + canvasPadding));
    const placedGroups = placedShiftX ? rawPlacedGroups.map((group) => ({ ...group, x: group.x + placedShiftX })) : rawPlacedGroups;
    const placedByKey = new Map(placedGroups.map((group) => [group.key, group]));
    const sourceBuckets = new Map<string, typeof groupEdges>();
    const targetBuckets = new Map<string, typeof groupEdges>();
    groupEdges.forEach((edge) => {
      sourceBuckets.set(edge.sourceKey, [...(sourceBuckets.get(edge.sourceKey) ?? []), edge]);
      targetBuckets.set(edge.targetKey, [...(targetBuckets.get(edge.targetKey) ?? []), edge]);
    });
    sourceBuckets.forEach((bucket) => bucket.sort((left, right) => (placedByKey.get(left.targetKey)?.x ?? 0) - (placedByKey.get(right.targetKey)?.x ?? 0)));
    targetBuckets.forEach((bucket) => bucket.sort((left, right) => (placedByKey.get(left.sourceKey)?.x ?? 0) - (placedByKey.get(right.sourceKey)?.x ?? 0)));
    const portOffset = (index: number, count: number) => count <= 1 ? 0 : -Math.min(180, (count - 1) * 28) / 2 + index * Math.min(28, 180 / (count - 1));
    const placedEdges = groupEdges.map((edge) => {
      const source = placedByKey.get(edge.sourceKey)!;
      const target = placedByKey.get(edge.targetKey)!;
      const sourceBucket = sourceBuckets.get(edge.sourceKey) ?? [edge];
      const targetBucket = targetBuckets.get(edge.targetKey) ?? [edge];
      return {
        ...edge,
        x1: source.x + cardWidth / 2 + portOffset(sourceBucket.indexOf(edge), sourceBucket.length),
        y1: source.y + cardHeight,
        x2: target.x + cardWidth / 2 + portOffset(targetBucket.indexOf(edge), targetBucket.length),
        y2: target.y,
      };
    });
    return {
      recipes,
      relationCount: new Set(recipes.flatMap((recipe) => recipe.requirements.map((requirement) => `${requirement.cardId}-${recipe.targetId}`))).size,
      skippedCycleCount: skippedCycleRecipeIds.size,
      maidenCount: new Set([...layers.keys(), ...recipes.flatMap((recipe) => recipe.requirements.map((requirement) => requirement.cardId))]).size,
      layout: {
        groups: placedGroups,
        edges: placedEdges,
        width: normalizedCanvasWidth,
        height: canvasPadding * 2 + layoutRows.length * cardHeight + Math.max(0, layoutRows.length - 1) * verticalGap,
        cardWidth,
        cardHeight,
        rowCount: layoutRows.length,
        rowPitch: cardHeight + verticalGap,
      },
    };
  }, [direction, nodeById, recipeById, selectedId]);

  const activeLockedGroupKey = lockedGroupKey && chain?.layout.groups.some((group) => group.key === lockedGroupKey) ? lockedGroupKey : null;
  const activeHoveredGroupKey = hoveredGroupKey && chain?.layout.groups.some((group) => group.key === hoveredGroupKey) ? hoveredGroupKey : null;
  const tracedGroupKey = activeLockedGroupKey ?? activeHoveredGroupKey;

  const tracedKeys = useMemo(() => {
    const groups = new Set<string>();
    const edges = new Set<string>();
    if (!chain || !tracedGroupKey) return { groups, edges };
    const walk = (direction: "up" | "down") => {
      const branchGroups = new Set<string>([tracedGroupKey]);
      let changed = true;
      while (changed) {
        changed = false;
        chain.layout.edges.forEach((edge) => {
          const touches = direction === "up" ? branchGroups.has(edge.targetKey) : branchGroups.has(edge.sourceKey);
          const next = direction === "up" ? edge.sourceKey : edge.targetKey;
          if (!touches) return;
          edges.add(edge.key);
          if (branchGroups.has(next)) return;
          branchGroups.add(next);
          changed = true;
        });
      }
      branchGroups.forEach((key) => groups.add(key));
    };
    walk("up");
    walk("down");
    return { groups, edges };
  }, [chain, tracedGroupKey]);

  const displayLayout = useMemo(() => {
    if (!chain || !hideOthers || !activeLockedGroupKey) return chain?.layout ?? null;
    const visibleGroups = chain.layout.groups.filter((group) => tracedKeys.groups.has(group.key));
    if (!visibleGroups.length) return chain.layout;
    const originalRows = [...new Set(visibleGroups.map((group) => group.rowIndex))].sort((left, right) => left - right);
    const cardWidth = chain.layout.cardWidth;
    const cardHeight = chain.layout.cardHeight;
    const horizontalGap = 42;
    const verticalGap = 82;
    const canvasPadding = 42;
    const rows = originalRows.map((originalRowIndex) => visibleGroups.filter((group) => group.rowIndex === originalRowIndex).sort((left, right) => left.x - right.x));
    const widestRow = Math.max(1, ...rows.map((row) => row.length));
    const width = Math.max(760, widestRow * cardWidth + Math.max(0, widestRow - 1) * horizontalGap + canvasPadding * 2);
    const groups = rows.flatMap((row, rowIndex) => {
      const rowWidth = row.length * cardWidth + Math.max(0, row.length - 1) * horizontalGap;
      const startX = (width - rowWidth) / 2;
      return row.map((group, columnIndex) => ({
        ...group,
        rowIndex,
        x: startX + columnIndex * (cardWidth + horizontalGap),
        y: canvasPadding + rowIndex * (cardHeight + verticalGap),
      }));
    });
    const groupByKey = new Map(groups.map((group) => [group.key, group]));
    const visibleEdges = chain.layout.edges.filter((edge) => tracedKeys.edges.has(edge.key) && groupByKey.has(edge.sourceKey) && groupByKey.has(edge.targetKey));
    const sourceBuckets = new Map<string, typeof visibleEdges>();
    const targetBuckets = new Map<string, typeof visibleEdges>();
    visibleEdges.forEach((edge) => {
      sourceBuckets.set(edge.sourceKey, [...(sourceBuckets.get(edge.sourceKey) ?? []), edge]);
      targetBuckets.set(edge.targetKey, [...(targetBuckets.get(edge.targetKey) ?? []), edge]);
    });
    sourceBuckets.forEach((bucket) => bucket.sort((left, right) => (groupByKey.get(left.targetKey)?.x ?? 0) - (groupByKey.get(right.targetKey)?.x ?? 0)));
    targetBuckets.forEach((bucket) => bucket.sort((left, right) => (groupByKey.get(left.sourceKey)?.x ?? 0) - (groupByKey.get(right.sourceKey)?.x ?? 0)));
    const portOffset = (index: number, count: number) => count <= 1 ? 0 : -Math.min(180, (count - 1) * 28) / 2 + index * Math.min(28, 180 / (count - 1));
    const edges = visibleEdges.map((edge) => {
      const source = groupByKey.get(edge.sourceKey)!;
      const target = groupByKey.get(edge.targetKey)!;
      const sourceBucket = sourceBuckets.get(edge.sourceKey) ?? [edge];
      const targetBucket = targetBuckets.get(edge.targetKey) ?? [edge];
      return {
        ...edge,
        x1: source.x + cardWidth / 2 + portOffset(sourceBucket.indexOf(edge), sourceBucket.length),
        y1: source.y + cardHeight,
        x2: target.x + cardWidth / 2 + portOffset(targetBucket.indexOf(edge), targetBucket.length),
        y2: target.y,
      };
    });
    return {
      groups,
      edges,
      width,
      height: canvasPadding * 2 + rows.length * cardHeight + Math.max(0, rows.length - 1) * verticalGap,
      cardWidth,
      cardHeight,
      rowCount: rows.length,
      rowPitch: cardHeight + verticalGap,
    };
  }, [activeLockedGroupKey, chain, hideOthers, tracedKeys]);

  const clampPanX = useCallback((nextPanX: number, viewport: HTMLDivElement) => {
    if (!displayLayout) return 0;
    const availableWidth = Math.max(0, viewport.clientWidth - 56);
    const horizontalOverflow = Math.max(0, displayLayout.width - availableWidth);
    const edgeRoom = horizontalOverflow > 0 ? Math.min(420, availableWidth * .42) : 0;
    return Math.max(-(horizontalOverflow + edgeRoom), Math.min(edgeRoom, nextPanX));
  }, [displayLayout]);

  const selectedChainPanX = useCallback((viewport: HTMLDivElement) => {
    if (!displayLayout || selectedId === null) return 0;
    const anchors = displayLayout.groups.filter((group) => group.mainId === selectedId);
    const fallback = displayLayout.groups.find((group) => group.recipes.some((recipe) => recipe.targetId === selectedId));
    const centers = (anchors.length ? anchors : fallback ? [fallback] : []).map((group) => group.x + displayLayout.cardWidth / 2).sort((a, b) => a - b);
    const target = centers.length ? centers[Math.floor(centers.length / 2)] : displayLayout.width / 2;
    return clampPanX((viewport.clientWidth - 56) / 2 - target, viewport);
  }, [clampPanX, displayLayout, selectedId]);

  function centerSelectedChain() {
    if (!displayLayout || selectedId === null || !chainScrollRef.current) return;
    const nextPanX = selectedChainPanX(chainScrollRef.current);
    panXRef.current = nextPanX;
    setPanX(nextPanX);
  }

  useEffect(() => {
    if (!displayLayout || selectedId === null) return;
    const frame = requestAnimationFrame(() => {
      const viewport = chainScrollRef.current;
      if (!viewport) return;
      const nextPanX = selectedChainPanX(viewport);
      panXRef.current = nextPanX;
      setPanX(nextPanX);
    });
    return () => cancelAnimationFrame(frame);
  }, [displayLayout, selectedChainPanX, selectedId]);

  useEffect(() => () => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
  }, []);

  function choose(node: ResearchNode) {
    setSelectedId(node.id);
    setQuery("");
    setHoveredGroupKey(null);
    setLockedGroupKey(null);
    setHideOthers(false);
    setExportNotice("");
  }
  function locateQuery() {
    const needle = query.trim().toLowerCase();
    const exactId = Number(needle.replace(/^#/, ""));
    const match = nodeById.get(exactId) ?? data.nodes.find((node) => node.tank.toLowerCase() === needle || node.person.toLowerCase() === needle) ?? suggestions[0];
    if (match) choose(match);
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, article, input")) return;
    const viewport = chainScrollRef.current;
    if (!viewport) return;
    panStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: panXRef.current, pageScrollY: window.scrollY };
    viewport.setPointerCapture(event.pointerId);
    setIsPanning(true);
    event.preventDefault();
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    const viewport = chainScrollRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    pendingPanRef.current = {
      panX: clampPanX(pan.panX + event.clientX - pan.startX, viewport),
      pageScrollY: pan.pageScrollY - (event.clientY - pan.startY),
    };
    if (panFrameRef.current === null) {
      panFrameRef.current = requestAnimationFrame(() => {
        panFrameRef.current = null;
        const pending = pendingPanRef.current;
        pendingPanRef.current = null;
        if (!pending) return;
        panXRef.current = pending.panX;
        if (chainFlowRef.current) chainFlowRef.current.style.transform = `translate3d(${pending.panX}px, 0, 0)`;
        window.scrollTo(0, pending.pageScrollY);
      });
    }
    event.preventDefault();
  }

  function stopPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panStateRef.current?.pointerId !== event.pointerId) return;
    if (panFrameRef.current !== null) {
      cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }
    const pending = pendingPanRef.current;
    pendingPanRef.current = null;
    if (pending) {
      panXRef.current = pending.panX;
      if (chainFlowRef.current) chainFlowRef.current.style.transform = `translate3d(${pending.panX}px, 0, 0)`;
      window.scrollTo(0, pending.pageScrollY);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    panStateRef.current = null;
    setPanX(panXRef.current);
    setIsPanning(false);
  }

  async function copyCurrentCanvas() {
    const flow = chainFlowRef.current;
    if (!flow || !displayLayout || !selected || isExporting) return;
    if (!hasAndroidGalleryBridge() && (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")) {
      setExportNotice("当前浏览器不支持图片剪贴板");
      return;
    }
    setIsExporting(true);
    setExportNotice("正在整理完整画布…");
    try {
      const imagePromise = (async (): Promise<Blob> => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const contentRight = Math.max(displayLayout.width, ...displayLayout.groups.map((group) => group.x + displayLayout.cardWidth));
      const contentBottom = Math.max(displayLayout.height, ...displayLayout.groups.map((group) => group.y + displayLayout.cardHeight));
      const captureWidth = Math.ceil(contentRight + 42);
      const captureHeight = Math.ceil(contentBottom + 42);
      const maxSide = 12000;
      const maxPixels = 36_000_000;
      const exportScale = Math.min(1, maxSide / captureWidth, maxSide / captureHeight, Math.sqrt(maxPixels / (captureWidth * captureHeight)));
      const outputWidth = Math.max(1, Math.floor(captureWidth * exportScale));
      const outputHeight = Math.max(1, Math.floor(captureHeight * exportScale));
      setExportNotice(`正在生成 ${outputWidth} × ${outputHeight} PNG…`);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建截图画布");
      context.scale(exportScale, exportScale);
      context.fillStyle = "#e3e8df";
      context.fillRect(0, 0, captureWidth, captureHeight);
      context.strokeStyle = "rgba(37,56,46,.045)";
      context.lineWidth = 1;
      for (let x = 0; x <= captureWidth; x += 28) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, captureHeight); context.stroke(); }
      for (let y = 0; y <= captureHeight; y += 28) { context.beginPath(); context.moveTo(0, y); context.lineTo(captureWidth, y); context.stroke(); }

      const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
        const r = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.lineTo(x + width - r, y);
        context.quadraticCurveTo(x + width, y, x + width, y + r);
        context.lineTo(x + width, y + height - r);
        context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        context.lineTo(x + r, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - r);
        context.lineTo(x, y + r);
        context.quadraticCurveTo(x, y, x + r, y);
        context.closePath();
      };
      const shortText = (value: string, maxWidth: number) => {
        if (context.measureText(value).width <= maxWidth) return value;
        let text = value;
        while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
        return `${text}…`;
      };
      const imageUrls = [...new Set(displayLayout.groups.flatMap((group) => group.members.map((member) => member.node.headImage).filter(Boolean) as string[]))];
      setExportNotice(`正在载入 ${imageUrls.length} 张头像…`);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const imageEntries = await Promise.all(imageUrls.map((url) => new Promise<[string, HTMLImageElement | null]>((resolve) => {
        const image = new Image();
        const timer = window.setTimeout(() => resolve([url, null]), 8000);
        image.onload = () => { window.clearTimeout(timer); resolve([url, image]); };
        image.onerror = () => { window.clearTimeout(timer); resolve([url, null]); };
        image.src = url;
      })));
      const imageByUrl = new Map(imageEntries);

      context.lineCap = "round";
      context.lineJoin = "round";
      displayLayout.edges.forEach((edge) => {
        const traceActive = tracedKeys.edges.has(edge.key);
        const traceMuted = Boolean(tracedGroupKey) && !traceActive;
        const bend = Math.max(42, (edge.y2 - edge.y1) * .46);
        context.save();
        context.globalAlpha = traceMuted ? .07 : edge.primary || traceActive ? 1 : .62;
        context.strokeStyle = traceActive && tracedGroupKey ? "#405d08" : edge.primary ? "#587817" : "#72866f";
        context.fillStyle = context.strokeStyle;
        context.lineWidth = traceActive && tracedGroupKey ? 3.4 : edge.primary ? 2.8 : 1.6;
        context.setLineDash(traceActive || edge.primary ? [] : [7, 6]);
        context.beginPath();
        context.moveTo(edge.x1, edge.y1);
        context.bezierCurveTo(edge.x1, edge.y1 + bend, edge.x2, edge.y2 - bend, edge.x2, edge.y2 - 9);
        context.stroke();
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(edge.x2, edge.y2);
        context.lineTo(edge.x2 - 4.5, edge.y2 - 9);
        context.lineTo(edge.x2 + 4.5, edge.y2 - 9);
        context.closePath();
        context.fill();
        context.restore();
      });

      const drawAvatar = (url: string | null | undefined, fallback: string, x: number, y: number, size: number) => {
        roundedRect(x, y, size, size, size > 54 ? 12 : 10);
        context.fillStyle = "#bdc9bb";
        context.fill();
        const image = url ? imageByUrl.get(url) : null;
        if (image?.naturalWidth && image.naturalHeight) {
          context.save();
          roundedRect(x, y, size, size, size > 54 ? 12 : 10);
          context.clip();
          const ratio = Math.max(size / image.naturalWidth, size / image.naturalHeight);
          const width = image.naturalWidth * ratio;
          const height = image.naturalHeight * ratio;
          context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
          context.restore();
        } else {
          context.fillStyle = "#263a2f";
          context.font = "700 15px 'Microsoft YaHei', sans-serif";
          context.textAlign = "center";
          context.fillText(fallback.slice(0, 2), x + size / 2, y + size / 2 + 5);
        }
        roundedRect(x, y, size, size, size > 54 ? 12 : 10);
        context.strokeStyle = "#9fac9e";
        context.lineWidth = size > 54 ? 2 : 1;
        context.stroke();
      };

      for (let groupIndex = 0; groupIndex < displayLayout.groups.length; groupIndex += 1) {
        const group = displayLayout.groups[groupIndex];
        const muted = Boolean(tracedGroupKey) && !tracedKeys.groups.has(group.key);
        const targets = [...new Map(group.recipes.map((recipe) => [recipe.targetId, recipe.target])).values()];
        const targetLabel = targets.map((target) => target.tank).join(" / ");
        const orderedMembers = [...group.members].sort((left, right) => Number(right.node.id === group.mainId) - Number(left.node.id === group.mainId));
        const { x, y } = group;
        const width = displayLayout.cardWidth;
        const height = displayLayout.cardHeight;
        context.save();
        context.globalAlpha = muted ? .24 : 1;
        roundedRect(x, y, width, height, 14);
        context.fillStyle = "#f8faf4";
        context.fill();
        context.strokeStyle = activeLockedGroupKey === group.key ? "#709215" : "#abb8aa";
        context.lineWidth = activeLockedGroupKey === group.key ? 2 : 1;
        context.stroke();
        context.save();
        roundedRect(x, y, width, height, 14);
        context.clip();
        context.fillStyle = group.terminal ? "#506258" : "#263a2f";
        context.fillRect(x, y, width, 46);
        context.restore();
        context.textBaseline = "alphabetic";
        if (group.terminal) {
          context.fillStyle = "#f2f7f0";
          context.font = "800 12px 'Microsoft YaHei', sans-serif";
          context.textAlign = "center";
          context.fillText("研发链终点", x + width / 2, y + 28);
        } else {
          context.textAlign = "left";
          context.fillStyle = "#9fad9f";
          context.font = "11px 'Microsoft YaHei', sans-serif";
          context.fillText(group.members.length > 1 ? `${group.members.length} 位共同参与` : "单一前置", x + 10, y + 16);
          context.fillStyle = "#f2f7f0";
          context.font = "800 14px 'Microsoft YaHei', sans-serif";
          const title = targets.length > 1 ? `后续 ${targets.length} 个分支` : targets.length ? `研发 ${targets[0].tank}` : "";
          context.fillText(shortText(title, targets.length > 1 ? width - 100 : width - 20), x + 10, y + 35);
          if (targets.length > 1) {
            roundedRect(x + width - 76, y + 9, 66, 24, 6);
            context.fillStyle = "#b1d547";
            context.fill();
            context.fillStyle = "#2a3c30";
            context.font = "900 10px 'Microsoft YaHei', sans-serif";
            context.textAlign = "center";
            context.fillText(`分支 × ${targets.length}`, x + width - 43, y + 25);
          }
        }
        const memberWidths = orderedMembers.map(({ node }) => node.id === group.mainId ? 102 : 82);
        const memberGap = 4;
        const totalMemberWidth = memberWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, memberWidths.length - 1) * memberGap;
        let memberX = x + (width - totalMemberWidth) / 2;
        orderedMembers.forEach(({ node }, memberIndex) => {
          const primary = node.id === group.mainId;
          const slotWidth = memberWidths[memberIndex];
          const avatarSize = primary ? 60 : 52;
          const avatarX = memberX + (slotWidth - avatarSize) / 2;
          const avatarY = y + 54;
          drawAvatar(node.headImage, node.tank, avatarX, avatarY, avatarSize);
          if (node.id === selectedId) {
            roundedRect(avatarX + avatarSize - 30, avatarY - 6, 34, 17, 5);
            context.fillStyle = "#b1d547";
            context.fill();
            context.fillStyle = "#293b30";
            context.font = "900 9px 'Microsoft YaHei', sans-serif";
            context.textAlign = "center";
            context.fillText("指定", avatarX + avatarSize - 13, avatarY + 6);
          }
          context.fillStyle = "#26372e";
          context.font = `${primary ? 800 : 700} ${primary ? 13 : 12}px 'Microsoft YaHei', sans-serif`;
          context.textAlign = "center";
          context.fillText(shortText(node.tank, slotWidth - 4), memberX + slotWidth / 2, avatarY + avatarSize + 17);
          context.font = "800 9px 'Microsoft YaHei', sans-serif";
          const meta = `${node.stage} · #${node.id}`;
          const metaWidth = Math.min(slotWidth - 8, context.measureText(meta).width + 10);
          roundedRect(memberX + (slotWidth - metaWidth) / 2, avatarY + avatarSize + 23, metaWidth, 16, 5);
          context.fillStyle = "#e5eccf";
          context.fill();
          context.fillStyle = "#5c7313";
          context.fillText(shortText(meta, metaWidth - 6), memberX + slotWidth / 2, avatarY + avatarSize + 35);
          memberX += slotWidth + memberGap;
        });
        if (targets.length > 0) {
          context.fillStyle = "#edf1e9";
          context.fillRect(x + 1, y + height - 31, width - 2, 30);
          context.strokeStyle = "#d5ddd2";
          context.lineWidth = 1;
          context.beginPath(); context.moveTo(x, y + height - 31); context.lineTo(x + width, y + height - 31); context.stroke();
          context.fillStyle = "#6d7b71";
          context.font = "750 11px 'Microsoft YaHei', sans-serif";
          context.textAlign = "left";
          context.fillText(group.members.length > 1 ? "AND · 全部参与" : "后续关系", x + 11, y + height - 11);
          context.fillStyle = "#5d7811";
          context.font = "800 12px 'Microsoft YaHei', sans-serif";
          context.textAlign = "right";
          context.fillText(shortText(`→ ${targetLabel}`, width - 150), x + width - 11, y + height - 11);
        }
        context.restore();
        if (groupIndex % 24 === 23) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      setExportNotice("正在压缩 PNG…");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("无法生成 PNG 文件");
      return blob;
      })();
      // Browser clipboard delivery starts inside the click gesture; Android resolves the same PNG into MediaStore.
      const destination = await deliverPng(imagePromise, "steel-maiden-research-chain");
      setExportNotice(destination === "gallery" ? "已保存到系统相册" : "已复制到剪贴板");
    } catch (error) {
      console.error(error);
      setExportNotice(androidGallery ? "保存失败，请稍后重试" : "复制失败，请稍后重试");
    } finally {
      setIsExporting(false);
    }
  }

  return <section className="archive-section chain-archive">
    <div className="table-toolbar"><div><p className="eyebrow">COMPLETE RESEARCH LINE</p><h2>研发路线</h2></div><p>先指定一位钢舞姬。页面只展示与她直接相连的完整研发链，并按照最上游到最下游排列。</p></div>
    <div className="chain-picker">
      <div className="chain-search-wrap"><form className="chain-search" onSubmit={(event) => { event.preventDefault(); locateQuery(); }}><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入坦克名、人名或卡牌 ID…" /><button type="submit">选择钢舞姬</button></form>{suggestions.length > 0 && <div className="chain-suggestions">{suggestions.map((node) => <button key={node.id} onClick={() => choose(node)}><ResearchHead node={node} /><span><strong>{node.tank}</strong><small>{node.person} · {node.stage} · #{node.id}</small></span></button>)}</div>}</div>
      {selected && <div className="chain-current"><ResearchHead node={selected} /><span><small>当前指定</small><strong>{selected.tank}</strong><em>{selected.person} · #{selected.id}</em></span><button onClick={() => { setSelectedId(null); setQuery(""); panXRef.current = 0; setPanX(0); setHoveredGroupKey(null); setLockedGroupKey(null); setHideOthers(false); setExportNotice(""); }}>清空</button></div>}
    </div>
    {!selected || !chain || !displayLayout ? <div className="chain-empty"><span>⌘</span><h3>请先指定一位钢舞姬</h3><p>选择后才会生成她从最初前置到最终下级的完整纵向研发链。</p></div> : <div className="chain-canvas">
      <div className="chain-summary">
        <div className="chain-direction" role="group" aria-label="研发关系查看方向">
          <button type="button" className={direction === "both" ? "active" : ""} aria-pressed={direction === "both"} onClick={() => setDirection("both")}>上下都看</button>
          <button type="button" className={direction === "upstream" ? "active" : ""} aria-pressed={direction === "upstream"} onClick={() => setDirection("upstream")}>只看向上</button>
          <button type="button" className={direction === "downstream" ? "active" : ""} aria-pressed={direction === "downstream"} onClick={() => setDirection("downstream")}>只看向下</button>
        </div>
        <span><b>{chain.maidenCount}</b> 位相关钢舞姬</span><span><b>{chain.relationCount}</b> 条去重关系</span>
        {chain.skippedCycleCount > 0 && <span className="chain-cycle-note">已隐藏 <b>{chain.skippedCycleCount}</b> 条返回既有节点的回环配置</span>}
        <span>已合并等级分支</span><span>空白处拖动画布</span>
        {exportNotice && <span className="chain-export-notice">{exportNotice}</span>}
        {activeLockedGroupKey && <button className={`isolate-trace ${hideOthers ? "active" : ""}`} onClick={() => setHideOthers((value) => !value)}>{hideOthers ? "恢复全部容器" : "只看高亮路线"}</button>}
        {activeLockedGroupKey && <button className="clear-trace" onClick={() => { setLockedGroupKey(null); setHideOthers(false); }}>取消路线高亮</button>}
        <button className="export-chain" onClick={copyCurrentCanvas} disabled={isExporting}>{isExporting ? "正在生成 PNG…" : androidGallery ? "保存图片到相册" : "复制分享图"}</button>
        <button onClick={centerSelectedChain}>回到指定角色</button>
      </div>
      <div className={`chain-scroll ${isPanning ? "is-panning" : ""}`} ref={chainScrollRef} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}>
      <div className={`chain-flow ${tracedGroupKey ? "tracing" : ""}`} ref={chainFlowRef} style={{ width: `${displayLayout.width}px`, height: `${displayLayout.height}px`, transform: `translate3d(${panX}px, 0, 0)` }}>
        <svg className="chain-links" width={displayLayout.width} height={displayLayout.height} viewBox={`0 0 ${displayLayout.width} ${displayLayout.height}`} aria-hidden="true">
          <defs><marker id="chain-flow-arrow" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#587817" /></marker></defs>
          {Array.from({ length: displayLayout.rowCount }, (_, rowIndex) => <line className="chain-rank-guide" key={`rank-${rowIndex}`} x1="0" y1={42 + rowIndex * displayLayout.rowPitch} x2={displayLayout.width} y2={42 + rowIndex * displayLayout.rowPitch} fill="none" stroke="rgba(67,89,76,.09)" strokeWidth="1" strokeDasharray="3 8" />)}
          {displayLayout.edges.map((edge) => {
            const bend = Math.max(42, (edge.y2 - edge.y1) * .46);
            const traceActive = tracedKeys.edges.has(edge.key);
            const traceMuted = Boolean(tracedGroupKey) && !traceActive;
            const stroke = traceActive && tracedGroupKey ? "#405d08" : edge.primary ? "#587817" : "#72866f";
            const strokeWidth = traceActive && tracedGroupKey ? 3.4 : edge.primary ? 2.8 : 1.6;
            const opacity = traceMuted ? .07 : edge.primary || traceActive ? 1 : .62;
            const strokeDasharray = traceActive || edge.primary ? undefined : "7 6";
            return <path key={edge.key} data-source={edge.sourceKey} data-target={edge.targetKey} className={`chain-link ${edge.primary ? "primary" : "support"} ${traceActive ? "trace-active" : ""}`} d={`M ${edge.x1} ${edge.y1} C ${edge.x1} ${edge.y1 + bend}, ${edge.x2} ${edge.y2 - bend}, ${edge.x2} ${edge.y2 - 8}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} opacity={opacity} vectorEffect="non-scaling-stroke" markerEnd="url(#chain-flow-arrow)" />;
          })}
        </svg>
        {displayLayout.groups.map((group) => {
          const targets = [...new Map(group.recipes.map((recipe) => [recipe.targetId, recipe.target])).values()];
          const targetLabel = targets.map((target) => target.tank).join(" / ");
          const orderedMembers = [...group.members].sort((left, right) => Number(right.node.id === group.mainId) - Number(left.node.id === group.mainId));
          return <article data-group-key={group.key} className={`chain-group chain-positioned ${group.terminal ? "terminal" : ""} ${tracedGroupKey && !tracedKeys.groups.has(group.key) ? "trace-muted" : ""} ${activeLockedGroupKey === group.key ? "trace-locked" : ""}`} key={group.key} style={{ left: `${group.x}px`, top: `${group.y}px`, width: `${displayLayout.cardWidth}px`, height: `${displayLayout.cardHeight}px` }} onMouseEnter={() => setHoveredGroupKey(group.key)} onMouseLeave={() => setHoveredGroupKey(null)}>
            <header><div><span>{group.terminal ? "研发链终点" : group.members.length > 1 ? `${group.members.length} 位共同参与` : "单一钢舞姬"}</span>{targets.length > 0 && <strong>{targets.length > 1 ? `后续 ${targets.length} 个分支` : `研发 ${targets[0].tank}`}</strong>}</div>{targets.length > 1 && <b>分支 × {targets.length}</b>}</header>
            <div className="chain-members">{orderedMembers.map(({ node }) => <button className={`${node.id === group.mainId ? "primary" : "support"} ${node.id === selectedId ? "selected" : ""}`} key={`${group.key}-${node.id}`} onClick={() => setLockedGroupKey(group.key)} onDoubleClick={() => onOpenResearch(node.id)} aria-pressed={activeLockedGroupKey === group.key} title={`单击锁定路线；双击打开 ${node.tank} 的研发配方`}><span className="chain-avatar">{node.headImage ? <img src={node.headImage} alt={`${node.person}头像`} loading="lazy" /> : <b>{node.tank.slice(0, 2)}</b>}{node.id === selectedId && <i>指定</i>}</span><strong>{node.tank}</strong><small>{node.person}</small><em>{node.stage} · #{node.id}</em></button>)}</div>
            {targets.length > 0 && <footer><span>{group.members.length > 1 ? "AND · 全部参与" : "后续关系"}</span><b title={targetLabel}>→ {targetLabel}</b></footer>}
          </article>;
        })}
      </div>
      </div>
      <p className="chain-help">单击头像可锁定该路线；双击头像可跳转到她的“研发配方”详细页面。</p>
    </div>}
  </section>;
}

function ResearchWorkspace({ data, maidens, mode, focusId, onOpenResearch }: { data: ResearchDataset; maidens: Maiden[]; mode: "research" | "researchGraph"; focusId: number | null; onOpenResearch: (id: number) => void }) {
  const [includeUnimplemented, setIncludeUnimplemented] = useState(() => focusId !== null && maidens.some((maiden) => maiden.id === focusId && !maiden.implemented));
  const visibleData = useMemo(() => {
    if (includeUnimplemented) return data;
    const ids = new Set(maidens.filter((maiden) => maiden.implemented).map((maiden) => maiden.id));
    const recipes = data.recipes.filter((recipe) => ids.has(recipe.targetId) && recipe.requirements.every((requirement) => ids.has(requirement.cardId)));
    const recipeIds = new Set(recipes.map((recipe) => recipe.id));
    const nodes = data.nodes.filter((node) => ids.has(node.id)).map((node) => ({ ...node,
      upstreamRecipeIds: node.upstreamRecipeIds.filter((id) => recipeIds.has(id)),
      downstream: node.downstream.filter((edge) => recipeIds.has(edge.recipeId) && ids.has(edge.targetId)),
    }));
    return { ...data, nodes, recipes, meta: { ...data.meta,
      nodeCount: nodes.length, recipeCount: recipes.length, targetCount: new Set(recipes.map((recipe) => recipe.targetId)).size,
      resourcePlanCount: recipes.reduce((sum, recipe) => sum + recipe.resourcePlans.length, 0),
      resourceItemCount: recipes.reduce((sum, recipe) => sum + recipe.resourcePlans.reduce((count, plan) => count + plan.resources.length, 0), 0),
      edgeCount: recipes.reduce((sum, recipe) => sum + recipe.requirements.length, 0),
    } };
  }, [data, maidens, includeUnimplemented]);
  return <><section className="research-implementation-filter" aria-label="研发实装筛选"><ImplementationFilter includeUnimplemented={includeUnimplemented} onChange={setIncludeUnimplemented} /></section>{mode === "research" ? <ResearchTree data={visibleData} focusId={focusId} /> : <ResearchGraph data={visibleData} onOpenResearch={onOpenResearch} />}</>;
}

function ResearchTree({ data, focusId }: { data: ResearchDataset; focusId?: number | null }) {
  const nodeById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
  const recipeById = useMemo(() => new Map(data.recipes.map((recipe) => [recipe.id, recipe])), [data]);
  const [selectedId, setSelectedId] = useState(focusId ?? data.recipes[0]?.targetId ?? data.nodes[0]?.id ?? 0);
  const [researchQuery, setResearchQuery] = useState("");
  const [stage, setStage] = useState("");
  const [className, setClassName] = useState("");
  const [relation, setRelation] = useState<"all" | "target" | "source">("all");
  const stages = useMemo(() => [...new Set(data.nodes.map((node) => node.stage))].sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true })), [data]);
  const classes = useMemo(() => [...new Set(data.nodes.map((node) => node.className))].sort(), [data]);
  const visibleNodes = useMemo(() => {
    const needle = researchQuery.trim().toLowerCase();
    return data.nodes.filter((node) =>
      (!needle || `${node.id} ${node.tank} ${node.person} ${node.nation} ${nationLabel(node.nation)}`.toLowerCase().includes(needle)) &&
      (!stage || node.stage === stage) && (!className || node.className === className) &&
      (relation === "all" || (relation === "target" ? node.upstreamRecipeIds.length > 0 : node.downstream.length > 0))
    );
  }, [data, researchQuery, stage, className, relation]);
  const selected = nodeById.get(selectedId) ?? visibleNodes[0] ?? data.nodes[0];
  const upstreamRecipes = selected ? selected.upstreamRecipeIds.map((id) => recipeById.get(id)).filter(Boolean) as ResearchRecipe[] : [];
  const downstreamRecipes = selected ? [...new Set(selected.downstream.map((entry) => entry.recipeId))].map((id) => recipeById.get(id)).filter(Boolean) as ResearchRecipe[] : [];

  function selectNode(id: number) { setSelectedId(id); document.getElementById("research-focus")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  return <section className="archive-section research-archive">
    <div className="table-toolbar"><div><p className="eyebrow">RESEARCH RELATIONSHIP EXPLORER</p><h2>研发配方</h2></div><p>同一方案内的钢舞姬前置、指挥官等级和全部资源均需满足。多套资源方案是不同活动、渠道或时期的配置变体，不累计。</p></div>
    <div className="research-summary">
      <div><strong>{data.meta.targetCount}</strong><span>可研发目标</span></div><div><strong>{data.meta.recipeCount}</strong><span>独立前置组合</span></div><div><strong>{data.meta.resourcePlanCount}</strong><span>资源消耗方案</span></div><div><strong>{data.meta.edgeCount}</strong><span>上下级关系</span></div>
    </div>
    <div className="research-filterbar">
      <label className="research-search"><span>⌕</span><input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="搜索坦克名、人名或 ID…" /></label>
      <select value={stage} onChange={(event) => setStage(event.target.value)}><option value="">全部阶段</option>{stages.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={className} onChange={(event) => setClassName(event.target.value)}><option value="">全部车种</option>{classes.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={relation} onChange={(event) => setRelation(event.target.value as typeof relation)}><option value="all">全部节点</option><option value="target">有研发上级</option><option value="source">有研发下级</option></select>
      <b>{visibleNodes.length} 辆</b>
    </div>
    <div className="research-workspace">
      <aside className="research-index" aria-label="研发树钢舞姬索引">
        {visibleNodes.map((node) => <button key={node.id} className={selected?.id === node.id ? "active" : ""} onClick={() => selectNode(node.id)}><ResearchHead node={node} /><span><strong>{node.tank}</strong><small>{node.person} · {node.stage}</small></span><i>#{node.id}</i></button>)}
        {!visibleNodes.length && <p>没有符合条件的节点。</p>}
      </aside>
      {selected && <article className="research-focus" id="research-focus">
        <header className="research-focus-title"><ResearchHead node={selected} /><div><p>{selected.stage} · {selected.className} · {nationLabel(selected.nation)}</p><h3>{selected.tank}</h3><span>{selected.person} · #{selected.id}</span></div></header>
        <section className="research-direction upstream"><div className="research-direction-title"><span>01</span><div><strong>研发它需要</strong><small>{upstreamRecipes.length ? `${upstreamRecipes.length} 套可用前置组合` : "此车没有被配置为研发目标"}</small></div></div>
          {upstreamRecipes.length ? upstreamRecipes.map((recipe, recipeIndex) => <div className="research-recipe" key={recipe.id}>
            {recipeIndex > 0 && <div className="or-divider"><span>OR</span>或选择另一套配方</div>}
            <div className="recipe-label"><b>配方 {recipeIndex + 1}</b><span>{recipe.requirements.length} 个条件同时满足</span><i>AND</i></div>
            <div className="requirement-grid">{recipe.requirements.map((requirement) => <button key={requirement.cardId} onClick={() => selectNode(requirement.cardId)}><ResearchHead node={{ id: requirement.cardId, tank: requirement.tank, headImage: requirement.headImage }} /><span><strong>{requirement.tank}</strong><small>{requirement.person}</small><em>{requirementText(requirement)}</em></span><i>#{requirement.cardId}</i></button>)}</div>
            <div className="research-costs">
              <div className="research-costs-title"><strong>指挥官与资源消耗</strong><span>{recipe.resourcePlans.length > 1 ? `${recipe.resourcePlans.length} 套配置变体，不累计；以游戏当前开放方案为准` : "以下资源同时消耗"}</span></div>
              <div className="resource-plan-list">{recipe.resourcePlans.map((plan, planIndex) => <div className="resource-plan" key={plan.id}>
                <div className="resource-plan-label"><b>{recipe.resourcePlans.length > 1 ? `方案 ${planIndex + 1}` : "研发条件"}</b>{planIndex > 0 && <i>ALT</i>}<span>配置 #{plan.ruleIds.join(" / ")}</span></div>
                <div className="resource-chip-list">
                  <span className="research-resource commander"><small>指挥官等级</small><strong>{plan.commanderLevel ? `${plan.commanderLevel}级` : "未配置"}</strong></span>
                  {plan.resources.map((resource) => <span className={`research-resource ${resource.category}`} key={`${plan.id}-${resource.fundId}`}><small>{resource.categoryName}{resource.equipmentGrade ? ` · ${resource.equipmentGrade}` : ""} · #{resource.fundId}</small><strong>{resource.equipmentGrade ? `${resource.equipmentGrade} · ` : ""}{resource.name}</strong><b>× {number(resource.amount)}</b></span>)}
                  {!plan.resources.length && <span className="research-resource material"><small>资源</small><strong>无静态消耗</strong></span>}
                </div>
              </div>)}</div>
            </div>
          </div>) : <div className="relation-empty">可能是研发树根节点、活动获取角色，或静态配置中未设置常规前置。</div>}
        </section>
        <section className="research-direction downstream"><div className="research-direction-title"><span>02</span><div><strong>培养它可以研发</strong><small>{downstreamRecipes.length ? `${new Set(downstreamRecipes.map((recipe) => recipe.targetId)).size} 个下级目标` : "没有以此车为前置的下级"}</small></div></div>
          {downstreamRecipes.length ? <div className="downstream-grid">{downstreamRecipes.map((recipe) => {
            const ownRequirement = recipe.requirements.find((item) => item.cardId === selected.id)!;
            return <button key={recipe.id} onClick={() => selectNode(recipe.targetId)}><ResearchHead node={{ id: recipe.targetId, tank: recipe.target.tank, headImage: recipe.target.headImage }} /><span><strong>{recipe.target.tank}</strong><small>{recipe.target.person}</small><em>本车需 {requirementText(ownRequirement)}</em></span><i>→</i></button>;
          })}</div> : <div className="relation-empty">当前配置中没有后续研发分支。</div>}
        </section>
      </article>}
    </div>
    <div className="research-matrix"><div className="research-matrix-title"><h3>全量上下级速查表</h3><span>点击任意一行切换到关系详情</span></div><div className="research-matrix-scroll"><table><thead><tr><th>钢舞姬</th><th>研发上级（AND / OR）</th><th>可研发下级</th></tr></thead><tbody>{visibleNodes.map((node) => {
      const parentGroups = node.upstreamRecipeIds.map((id) => recipeById.get(id)).filter(Boolean) as ResearchRecipe[];
      const children = [...new Set(node.downstream.map((entry) => entry.targetId))].map((id) => nodeById.get(id)).filter(Boolean) as ResearchNode[];
      return <tr key={node.id} onClick={() => selectNode(node.id)}><td><ResearchHead node={node} /><span><strong>{node.tank}</strong><small>{node.person} · #{node.id}</small></span></td><td>{parentGroups.length ? parentGroups.map((recipe, index) => <span className="matrix-group" key={recipe.id}>{index > 0 && <b>OR</b>}{recipe.requirements.map((item) => `${item.tank}（${requirementText(item)}）`).join(" AND ")}</span>) : "—"}</td><td>{children.length ? children.map((child) => child.tank).join("、") : "—"}</td></tr>;
    })}</tbody></table></div></div>
  </section>;
}

function EquipmentGameIcon({ image, slotIcon, level, advanced, large = false, compact = false }: { image: string; slotIcon: string; level: number; advanced: boolean; large?: boolean; compact?: boolean }) {
  return <span className={`equipment-game-icon ${advanced ? "advanced" : "normal"} ${large ? "large" : ""} ${compact ? "compact" : ""}`}>
    <span className="equipment-game-icon-art">{image ? <img src={image} alt="" /> : <i>◆</i>}</span>
    {slotIcon && <img className="equipment-game-slot" src={slotIcon} alt="" />}
    <b className="equipment-game-level">S{level}</b>
  </span>;
}

function EquipmentMaterialList({ materials, empty, equipmentByFundId }: { materials: EquipmentMaterial[]; empty: string; equipmentByFundId: Map<number, { image: string; slotIcon: string; level: number; advanced: boolean }> }) {
  if (!materials.length) return <span className="equipment-material-empty">{empty}</span>;
  return <div className="equipment-material-list">{materials.map((material) => {
    const equipment = material.equipment ? equipmentByFundId.get(material.fundId) : null;
    return <span className={`equipment-material ${material.equipment ? "equipment" : "resource"}`} key={`${material.fundId}-${material.level ?? 0}`}>
      {equipment
        ? <EquipmentGameIcon image={equipment.image} slotIcon={equipment.slotIcon} level={equipment.level} advanced={equipment.advanced} compact />
        : material.icon ? <img src={material.icon} alt="" /> : <i aria-hidden="true">◆</i>}
      <span><small>{material.equipment && material.level ? `S${material.level} · ` : ""}{material.name}</small><strong>× {number(material.amount)}</strong></span>
    </span>;
  })}</div>;
}

function EquipmentEffectList({ effects }: { effects: EquipmentEffect[] }) {
  if (!effects.length) return null;
  return <div className="equipment-effect-list">{effects.map((effect) => <div className="equipment-effect" key={`${effect.templateId}-${effect.skillId}`}>
    <strong><i aria-hidden="true">◆</i>{effect.name}</strong>
    <p>{effect.description}</p>
  </div>)}</div>;
}

const equipmentHiddenStatMeta = [
  { key: "fireproof", label: "阻燃" },
  { key: "homogeneity", label: "均质度" },
  { key: "coverage", label: "覆盖度" },
] as const;

function signedEquipmentValue(value: number) {
  return value > 0 ? `+${number(value)}` : number(value);
}

function EquipmentAtlas({ data, attributeIcons }: { data: EquipmentDataset; attributeIcons: Record<string, string> }) {
  const orderedSlots = useMemo(() => [...data.slots].sort((left, right) => left.order - right.order), [data.slots]);
  const detailExportRef = useRef<HTMLElement>(null);
  const detailShareImage = useShareImage(detailExportRef);
  const [slotTag, setSlotTag] = useState(orderedSlots[0]?.tag ?? 0);
  const visibleFamilies = useMemo(() => data.families.filter((family) => family.slotTag === slotTag), [data.families, slotTag]);
  const equipmentByFundId = useMemo(() => new Map(data.families.flatMap((family) => family.levels.map((entry) => [entry.fundId, { image: entry.icon || family.icon, slotIcon: family.typeIcon, level: entry.level, advanced: family.advanced }]))), [data.families]);
  const [selectedId, setSelectedId] = useState<string>(visibleFamilies[0]?.id ?? "");
  const selected = visibleFamilies.find((family) => family.id === selectedId) ?? visibleFamilies[0] ?? null;
  const groups = [
    { advanced: false, title: "普通装备", subtitle: "常规装备系列" },
    { advanced: true, title: "高级装备", subtitle: "特殊合成装备系列" },
  ];

  return <section className="archive-section equipment-atlas">
    <header className="equipment-hero">
      <div><p className="eyebrow">EQUIPMENT CODEX</p><h2>装备图鉴</h2><p>选择槽位，查看该位置的普通与高级装备；配方和累计成本均直接依据客户端强化生产线计算。</p></div>
      <div className="equipment-summary"><span><b>{data.summary.slotCount}</b><small>装备槽位</small></span><span><b>{data.summary.familyCount}</b><small>装备系列</small></span><span><b>{data.summary.recipeCount}</b><small>强化配方</small></span></div>
    </header>

    <div className="equipment-slot-section">
      <div className="equipment-section-title"><span>01</span><div><strong>选择装备槽位</strong><small>坦克与航空装备槽位均使用游戏原始图标</small></div></div>
      <div className="equipment-slot-groups">
        {[{ kind: "ground", label: "战车槽位" }, { kind: "air", label: "航空槽位" }].map((group) => <div className="equipment-slot-group" key={group.kind}><small>{group.label}</small><div className="equipment-slot-picker">
          {orderedSlots.filter((slot) => slot.vehicleKind === group.kind).map((slot) => <button type="button" className={slotTag === slot.tag ? "active" : ""} key={slot.tag} onClick={() => { setSlotTag(slot.tag); setSelectedId(data.families.find((family) => family.slotTag === slot.tag)?.id ?? ""); }}>{slot.icon && <img src={slot.icon} alt="" />}<span>{slot.name}</span></button>)}
        </div></div>)}
      </div>
    </div>

    <div className="equipment-browser">
      <aside className="equipment-family-index">
        <div className="equipment-section-title compact"><span>02</span><div><strong>选择装备</strong><small>{visibleFamilies.length} 个系列</small></div></div>
        {groups.map((group) => {
          const families = visibleFamilies.filter((family) => family.advanced === group.advanced);
          return <section className={`equipment-family-group ${group.advanced ? "advanced" : "normal"}`} key={group.title}>
            <header><div><strong>{group.title}</strong><small>{group.subtitle}</small></div><b>{families.length}</b></header>
            <div className="equipment-family-grid">{families.map((family) => <button type="button" className={selected?.id === family.id ? "active" : ""} key={family.id} onClick={() => setSelectedId(family.id)}>
              <EquipmentGameIcon image={family.levels[0]?.icon || family.icon} slotIcon={family.typeIcon} level={family.minLevel} advanced={family.advanced} /><span><strong>{family.name}</strong><small>S{family.minLevel}{family.maxLevel !== family.minLevel ? `–S${family.maxLevel}` : ""}</small></span>
            </button>)}</div>
            {!families.length && <p className="equipment-group-empty">此槽位没有{group.title}记录。</p>}
          </section>;
        })}
      </aside>

      <article ref={detailExportRef} className="equipment-detail share-capture-surface">
        <div className="equipment-section-title compact"><span>03</span><div><strong>装备详情</strong><small>逐级属性、单级配方与累计投入</small></div></div>
        <div className="equipment-share-control share-export-hide"><ShareImageButton state={detailShareImage.state} onClick={detailShareImage.save} /></div>
        {selected ? <>
          <header className={`equipment-detail-header ${selected.advanced ? "advanced" : "normal"}`}>
            <EquipmentGameIcon image={selected.levels[0]?.icon || selected.icon} slotIcon={selected.typeIcon} level={selected.minLevel} advanced={selected.advanced} large /><div><p>{selected.advanced ? "高级装备" : "普通装备"} · {orderedSlots.find((slot) => slot.tag === selected.slotTag)?.name}</p><h3>{selected.name}</h3><small>收录 S{selected.minLevel}{selected.maxLevel !== selected.minLevel ? ` 至 S${selected.maxLevel}` : ""} · {selected.levels.length} 个等级</small>{selected.description && <blockquote>{selected.description}</blockquote>}</div>
          </header>
          <div className="equipment-level-table-wrap"><table className="equipment-level-table">
            <thead><tr><th>等级</th><th>该级属性</th><th>合成该等级所需素材</th><th>累计素材（折算到 S1）</th></tr></thead>
            <tbody>{selected.levels.map((entry) => <tr key={entry.fundId}>
              <th><EquipmentGameIcon image={entry.icon || selected.icon} slotIcon={selected.typeIcon} level={entry.level} advanced={selected.advanced} /><small>#{entry.fundId}</small></th>
              <td><div className="equipment-attribute-stack"><div className="equipment-stat-list">{entry.stats.map((stat) => <span key={`${stat.key}-${stat.effectType}`}>{attributeIcons[stat.key] && <img src={attributeIcons[stat.key]} alt="" />}<small>{stat.key}</small><strong>{number(stat.value)}</strong></span>)}{equipmentHiddenStatMeta.map(({ key, label }) => entry.hiddenStats[key] ? <span className="equipment-hidden-stat" key={key} title={`${label}隐藏属性增加值`}><i aria-hidden="true">{label.slice(0, 1)}</i><small>{label}</small><strong>{signedEquipmentValue(entry.hiddenStats[key])}</strong></span> : null)}{!entry.stats.length && !equipmentHiddenStatMeta.some(({ key }) => entry.hiddenStats[key]) && <em>无基础数值属性</em>}</div><EquipmentEffectList effects={entry.effects} /></div></td>
              <td><EquipmentMaterialList materials={entry.recipe?.materials ?? []} empty={entry.level === selected.minLevel ? "基础装备，无强化配方" : "客户端未配置强化配方"} equipmentByFundId={equipmentByFundId} />{entry.recipe && <small className="equipment-rule-id">强化生产线 #{entry.recipe.ruleId}</small>}</td>
              <td><EquipmentMaterialList materials={entry.cumulative} empty="无累计素材" equipmentByFundId={equipmentByFundId} /></td>
            </tr>)}</tbody>
          </table></div>
          <p className="equipment-method-note">累计素材按每一级的真实生产线递归展开：装备统一折算为 S1，密码子及其他资源逐级累加；混合配方会保留各基础装备的实际数量。</p>
        </> : <div className="empty-state"><strong>此槽位没有装备记录</strong></div>}
      </article>
    </div>
  </section>;
}

function TechnologyPage({ data, attributeIcons, maidens, onOpenMaiden }: { data: TechnologyDataset; attributeIcons: Record<string, string>; maidens: Maiden[]; onOpenMaiden: (id: number) => void }) {
  const [category, setCategory] = useState(data.categories[0]?.name ?? "主炮");
  const secondaryOptions = data.categories.find((item) => item.name === category)?.secondary ?? [];
  const [secondary, setSecondary] = useState(secondaryOptions[0] ?? "常规弹");
  const [generation, setGeneration] = useState(1);
  const [selectedTag, setSelectedTag] = useState<number | null>(null);
  const [detailTag, setDetailTag] = useState<number | null>(null);
  const currentSecondary = secondaryOptions.includes(secondary) ? secondary : secondaryOptions[0];
  const block = data.blocks.find((item) => item.category === category && item.secondary === currentSecondary && item.generation === generation)
    ?? data.blocks.find((item) => item.category === category && item.generation === generation)
    ?? data.blocks[0];
  const nodeByTag = useMemo(() => new Map((block?.nodes ?? []).map((node) => [node.tag, node])), [block]);
  const treeLines = useMemo(() => (block?.lines ?? []).map((line) => ({ ...line, points: technologyPathPoints(line.points) })), [block]);
  const activeTags = useMemo(() => technologyPrerequisites(treeLines, selectedTag), [treeLines, selectedTag]);
  const detail = detailTag ? nodeByTag.get(detailTag) ?? null : null;
  const detailStats = detail ? detail.stats.filter((stat) => !(category === "主炮" && stat.key === "射程")) : [];
  const compatibleMaidens = !detail || !["主炮", "防护", "车体", "引擎"].includes(category) ? [] : maidens.filter((maiden) => {
    const options = category === "主炮" ? maiden.ammunition : category === "防护" ? maiden.armorOptions : category === "车体" ? maiden.bodyOptions : maiden.engineOptions;
    return options.some((option) => option.id === detail.craftId);
  }).sort((left, right) => left.id - right.id);
  const maxY = Math.max(400, ...((block?.nodes ?? []).map((node) => node.y)));
  const treeHeight = Math.max(570, maxY * .98 + 180);
  const point = (x: number, y: number) => ({ x: 80 + (x / 500) * 840, y: 72 + (400 - y) * .92 });
  const changeCategory = (value: string) => {
    const next = data.categories.find((item) => item.name === value);
    setCategory(value); setSecondary(next?.secondary[0] ?? ""); setSelectedTag(null); setDetailTag(null);
  };
  const nodeImage = (node: TechnologyNode) => node.image || (node.iconCode ? `/art/technology/${node.iconCode}.webp` : "");
  const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
  const levelPropertyColumns = [...new Map((block?.levels ?? []).flatMap((row) => row.attributes).map((attribute) => [attribute.propertyId, attribute.name])).entries()].map(([propertyId, name]) => ({ propertyId, name }));
  const materialList = (items: TechnologyMaterial[]) => items.length ? <div className="technology-table-materials">{items.map((material) => <span key={material.fundId} title={material.name}>{material.image && <img src={material.image} alt="" />}<small>{material.name}</small><strong>× {number(material.amount)}</strong></span>)}</div> : <span className="technology-table-empty">—</span>;

  return <section className="archive-section technology-archive">
    <div className="table-toolbar technology-heading"><div><p className="eyebrow">GLOBAL TECHNOLOGY ARCHIVE</p><h2>科技</h2></div><p>节点位置、前置连线、科技特性与各级成长均来自客户端配置；点选节点可追溯全部前置，再次点击查看详情。</p></div>
    <div className="technology-selector">
      <aside className="technology-primary-tabs">{data.categories.map((item, index) => <button key={item.name} className={category === item.name ? "active" : ""} onClick={() => changeCategory(item.name)}><i>{String(index + 1).padStart(2, "0")}</i><span>{item.name}</span></button>)}</aside>
      <div className="technology-secondary-panel">
        <header><div><small>科技分类</small><strong>{category}科技</strong></div><span>{secondaryOptions.length} 个分支</span></header>
        <div>{secondaryOptions.map((item) => <button key={item} className={currentSecondary === item ? "active" : ""} onClick={() => { setSecondary(item); setSelectedTag(null); setDetailTag(null); }}>{item}</button>)}</div>
      </div>
    </div>

    {block && <>
      <div className="technology-tree-card">
        <header className="technology-tree-header"><div>{block.icon && <img src={block.icon} alt="" />}<span><small>{category} / {currentSecondary}</small><strong>{block.title}</strong></span></div><div className="technology-generation-tabs" aria-label="科技期数">{[1, 2, 3].map((value) => <button key={value} className={generation === value ? "active" : ""} onClick={() => { setGeneration(value); setSelectedTag(null); setDetailTag(null); }} title={`${value}期`}><img src={["/art/rarities/kpsj-031.webp", "/art/rarities/kpsj-033.webp", "/art/rarities/kpsj-030.webp"][value - 1]} alt={`${value}期`} /></button>)}</div></header>
        {block.nodes.length ? <div className="technology-tree-scroll"><div className="technology-tree" style={{ minWidth: 1000, height: treeHeight }}>
          <svg viewBox={`0 0 1000 ${treeHeight}`} preserveAspectRatio="none" aria-hidden="true"><defs><marker id="technology-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" /></marker><marker id="technology-arrow-active" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#d3f45d" /></marker></defs>{[false, true].map((active) => <g key={String(active)} data-technology-lines={active ? "active" : "base"}>{treeLines.filter((line) => !active || (activeTags.has(line.from) && activeTags.has(line.to))).map((line, index) => {
            const d = line.points.map((entry, pointIndex) => { const p = point(entry.x, entry.y); return `${pointIndex ? "L" : "M"} ${p.x} ${p.y}`; }).join(" ");
            return <path key={`${line.from}-${line.to}-${index}`} data-line-from={line.from} data-line-to={line.to} className={active ? "active" : ""} d={d} markerEnd={active ? "url(#technology-arrow-active)" : "url(#technology-arrow)"} />;
          })}</g>)}</svg>
          {block.nodes.map((node) => { const p = point(node.x, node.y); const active = activeTags.has(node.tag); return <button key={node.tag} data-technology-tag={node.tag} className={`technology-node ${active ? "active" : ""} ${selectedTag === node.tag ? "selected" : ""}`} style={{ left: `${p.x / 10}%`, top: p.y }} onClick={() => { if (selectedTag === node.tag) setDetailTag(node.tag); else setSelectedTag(node.tag); }} title={selectedTag === node.tag ? `再次点击查看 ${node.name}` : `点亮 ${node.name} 及其前置科技`}>
            <span>{nodeImage(node) ? <img src={nodeImage(node)} alt="" /> : <b>{node.name.slice(0, 2)}</b>}</span><strong>{node.name}</strong>
          </button>; })}
          <div className="technology-stage-axis"><b>阶级等级</b>{[1, 2, 3, 4, 5, 6].map((value, index) => <span key={value} style={{ left: `${(80 + index * 168) / 10}%` }}>{value}</span>)}</div>
        </div></div> : <div className="technology-empty-tree" aria-hidden="true" />}
      </div>

      <div className="technology-growth-card"><header><div><small>LEVEL 01—16</small><h3>{block.title} · 各级属性与研究消耗</h3></div><span>本级与期内累计</span></header><div className="technology-level-table-wrap"><table><thead><tr><th>等级</th>{levelPropertyColumns.map((column) => <th key={column.propertyId}>{column.name}</th>)}<th>指挥官等级</th><th>研究该级消耗</th><th>累计消耗（1级至当前）</th></tr></thead><tbody>{block.levels.map((row) => <tr key={row.level}><th>{row.level}</th>{levelPropertyColumns.map((column) => { const attribute = row.attributes.find((item) => item.propertyId === column.propertyId); return <td key={column.propertyId}>{attribute ? percent(attribute.value) : "—"}</td>; })}<td className="technology-commander-level">{row.commanderLevel ?? "—"}</td><td className="technology-material-cell">{materialList(row.cost)}</td><td className="technology-material-cell">{materialList(row.cumulativeCost)}</td></tr>)}</tbody></table></div></div>
    </>}

    {detail && createPortal(<div className="modal-backdrop technology-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDetailTag(null)}><article className="technology-detail-dialog" role="dialog" aria-modal="true" aria-label={`${detail.name} 科技详情`}><button className="modal-close" onClick={() => setDetailTag(null)}>×</button><header><span className="technology-detail-icon">{nodeImage(detail) ? <img src={nodeImage(detail)} alt="" /> : <b>{detail.name.slice(0, 2)}</b>}</span><div><small>{block.title} · #{detail.craftId || detail.tag}</small><h2>{detail.name}</h2></div>{category === "主炮" && <AmmoEfficiency value={detail.efficiency} />}</header>
      <section><h3>属性值</h3><div className="technology-detail-stats">{detailStats.length ? detailStats.map((stat) => <span key={`${stat.key}-${stat.effectType}`}>{attributeIcons[stat.key] && <img src={attributeIcons[stat.key]} alt="" />}<small>{stat.key}</small><strong>{number(stat.value)}</strong></span>) : <p>该科技节点未关联可装备卡片的独立面板数值。</p>}</div></section>
      <section><h3>携带特性</h3><div className="technology-trait-list">{detail.traits.length ? detail.traits.map((trait, index) => <article key={`${trait.name}-${index}`}>{(trait.image || trait.iconCode) && <img src={trait.image || `/art/technology/${trait.iconCode}.webp`} alt="" />}<div><strong>{trait.name}</strong>{trait.description && <p>{trait.description}</p>}</div></article>) : <p>无附加特性。</p>}</div></section>
      <section><h3>升级该科技所需资源</h3><div className="technology-cost-list">{detail.cost.length ? detail.cost.map((material) => <span key={material.fundId}>{material.image && <img src={material.image} alt="" />}<small>{material.name}</small><strong>× {number(material.amount)}</strong></span>) : <p>客户端生产规则中未配置额外资源消耗。</p>}</div></section>
      {["主炮", "防护", "车体", "引擎"].includes(category) && <section className="technology-compatible-section"><h3>可使用该科技的钢舞姬 <span>{compatibleMaidens.length}</span></h3>{compatibleMaidens.length ? <ul className="technology-maiden-matrix atlas-album atlas-album-avatars">
        {compatibleMaidens.map((maiden) => <li className="atlas-entry" data-maiden-id={maiden.id} key={maiden.id}>
          <TablePortrait maiden={maiden} onOpen={(id) => { setDetailTag(null); onOpenMaiden(id); }} />
          <span className="atlas-avatar-caption">{maiden.tank}</span>
        </li>)}
      </ul> : <p className="technology-compatible-empty">当前钢舞姬配置中没有可使用该科技的记录。</p>}</section>}
    </article></div>, document.body)}
  </section>;
}

export default function Home() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [researchData, setResearchData] = useState<ResearchDataset | null>(null);
  const [equipmentData, setEquipmentData] = useState<EquipmentDataset | null>(null);
  const [technologyData, setTechnologyData] = useState<TechnologyDataset | null>(null);
  const [colonizationData, setColonizationData] = useState<ColonizationDataset | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("power");
  const [descending, setDescending] = useState(true);
  const [selectedTalentSort, setSelectedTalentSort] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards" | "research" | "researchGraph" | "equipment" | "technology" | "tasks" | "items" | "terrains" | "stages" | "stories">("table");
  const [cardAtlasMode, setCardAtlasMode] = useState<CardAtlasMode>("avatars");
  const [atlasTeamWorkspace, setAtlasTeamWorkspace] = useState(createAtlasTeamWorkspace);
  const [cardAtlasSkinMode, setCardAtlasSkinMode] = useState<CardAtlasSkinMode>("merged");
  const [stageSection, setStageSection] = useState<"maps" | "yield">("maps");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filterDraft, setFilterDraft] = useState<Filters>(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(48);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [simulatorId, setSimulatorId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [chartKind, setChartKind] = useState<ChartKind | null>(null);
  const [tableControlsTarget, setTableControlsTarget] = useState<HTMLDivElement | null>(null);
  const [researchFocusId, setResearchFocusId] = useState<number | null>(null);
  const [navOpen, setNavOpen] = useState<"maidens" | "manual" | "stages" | "guides" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    Promise.all([
      fetchDataFile("/data/maidens.json", isMaidenDataset, controller.signal),
      fetchDataFile("/data/research-tree.json", isResearchDataset, controller.signal),
      fetchDataFile("/data/equipment-catalog.json", isEquipmentDataset, controller.signal),
      fetchDataFile("/data/technology-catalog.json", isTechnologyDataset, controller.signal),
      fetchDataFile("/data/colonization-catalog.json", isColonizationDataset, controller.signal),
    ]).then(([maidens, research, equipment, technology, colonization]) => {
      if (cancelled) return;
      setDataset(maidens);
      setResearchData(research);
      setEquipmentData(equipment);
      setTechnologyData(technology);
      setColonizationData(colonization);
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "未知的数据加载错误");
    });
    return () => { cancelled = true; controller.abort(); };
  }, [loadAttempt]);

  const searchIndex = useMemo(() => new Map((dataset?.rows ?? []).map((row) => [row.id, searchable(row)])), [dataset]);
  const talentSortOptions = useMemo(() => [...new Map((dataset?.rows ?? []).flatMap((row) => row.talents.map((talent) => [talent.name, { name: talent.name, image: talent.image }]))).values()], [dataset]);
  const talentSortName = selectedTalentSort || talentSortOptions[0]?.name || "";
  const mainFilterRows = useMemo(() => {
    if (!dataset) return [];
    const iconOptions = (items: NamedIcon[]) => [...new Map(items.filter((item) => item.name).map((item) => [item.name, { name: item.name, image: item.image }])).values()];
    const classOptions = [...new Map(dataset.rows.map((row) => [row.className, { name: row.className, image: row.classIcon }])).values()];
    const nationOptions = [...new Map(dataset.rows.map((row) => [row.nation, { name: row.nation, label: nationLabel(row.nation), image: row.nationIcon }])).values()];
    const rarityOptions = [...new Map(dataset.rows.map((row) => [row.rarity, { name: row.rarity, image: row.rarityIcon, hideLabel: true }])).values()];
    const stageOptions = [...new Map(dataset.rows.map((row) => [row.stage, { name: row.stage, image: row.stageIcon }])).values()].sort((left, right) => stageOrder(left.name) - stageOrder(right.name));
    const ammoOptions = [...new Map(dataset.rows.flatMap((row) => row.ammunition.map((ammo) => [ammo.type, { name: ammo.type, image: ammo.typeImage || ammo.image }]))).values()];
    const engineResistanceOptions = iconOptions(dataset.rows.flatMap((row) => row.engineOptions.flatMap((option) => option.resistanceDetails)));
    const bodyResistanceOptions = iconOptions(dataset.rows.flatMap((row) => row.bodyOptions.flatMap((option) => option.resistanceDetails)));
    return [
      { key: "className" as const, label: "车种（或）", options: classOptions },
      { key: "nation" as const, label: "国籍（或）", options: nationOptions },
      { key: "rarity" as const, label: "稀有度（或）", options: rarityOptions },
      { key: "stage" as const, label: "图纸（或）", options: stageOptions },
      { key: "ammo" as const, label: "弹种（且）", options: ammoOptions },
      { key: "engineResistance" as const, label: "引擎抗性（且）", options: engineResistanceOptions },
      { key: "bodyResistance" as const, label: "车体抗性（且）", options: bodyResistanceOptions },
    ];
  }, [dataset]);

  const rows = useMemo(() => {
    if (!dataset) return [];
    const needle = query.toLowerCase();
    const result = dataset.rows.filter((row) =>
      (filters.includeUnimplemented || row.implemented)
      && (!needle || searchIndex.get(row.id)?.includes(needle))
      && (!filters.nation.length || filters.nation.includes(row.nation))
      && (!filters.className.length || filters.className.includes(row.className))
      && (!filters.rarity.length || filters.rarity.includes(row.rarity))
      && (!filters.stage.length || filters.stage.includes(row.stage))
      && (!filters.magicCost.length || filters.magicCost.includes(row.magicCostGroup))
      && (!filters.ammo.length || filters.ammo.every((type) => row.ammo.includes(type)))
      && (!filters.engineResistance.length || filters.engineResistance.every((name) => row.engineOptions.some((option) => option.resistance.includes(name))))
      && (!filters.bodyResistance.length || filters.bodyResistance.every((name) => row.bodyOptions.some((option) => option.resistance.includes(name))))
      && filters.talents.every((talent) => row.talents.some((item) => item.name === talent))
      && (!filters.huntTraits || row.huntTraits.some((item) => `${item.task} ${item.name}` === filters.huntTraits))
    );
    result.sort((a, b) => {
      if (sortKey === "talents") return compareTalentLevels(a, b, talentSortName, descending);
      const comparison = compareValues(sortValue(a, sortKey, level), sortValue(b, sortKey, level));
      return descending ? -comparison : comparison;
    });
    return result;
  }, [dataset, query, filters, level, sortKey, descending, talentSortName, searchIndex]);

  const byId = useMemo(() => new Map((dataset?.rows ?? []).map((row) => [row.id, row])), [dataset]);
  const detail = detailId ? byId.get(detailId) ?? null : null;
  const simulatorMaiden = simulatorId ? byId.get(simulatorId) ?? null : null;
  const comparison = compareIds.map((id) => byId.get(id)).filter(Boolean) as Maiden[];
  function toggleCompare(id: number) { setCompareIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 2 ? [current[1], id] : [...current, id]); }
  function clearConditions() { setQuery(""); setFilters({ ...emptyFilters }); setFilterDraft({ ...emptyFilters }); setFilterOpen(false); }
  function selectSort(key: SortKey) { if (sortKey === key) setDescending((value) => !value); else { setSortKey(key); setDescending(statMeta.some((item) => item.key === key) || ["id", "rarity", "stage", "fireproof", "homogeneity", "coverage", "talents"].includes(key)); } }
  function selectTalentSort(name: string) {
    setSelectedTalentSort(name);
    if (sortKey !== "talents") setDescending(true);
    setSortKey("talents");
  }
  function openResearchTree(id: number) {
    setResearchFocusId(id);
    setViewMode("research");
    setTimeout(() => document.querySelector(".research-archive")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  function openView(mode: "table" | "cards" | "research" | "researchGraph" | "equipment" | "technology" | "tasks" | "items" | "terrains" | "stages" | "stories") {
    setViewMode(mode);
    if (mode === "cards") setCardAtlasMode("avatars");
    setNavOpen(null);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }

  if (loadError) return <main className="loading-screen loading-error" role="alert"><div className="loader-mark">W</div><h1>数据加载失败</h1><p>{loadError}</p><button type="button" onClick={() => { setLoadError(null); setLoadAttempt((attempt) => attempt + 1); }}>重试加载</button></main>;
  if (!dataset) return <main className="loading-screen"><div className="loader-mark">W</div><p>正在装载钢舞姬档案…</p></main>;

  return <main className={`app-shell ${viewMode === "table" ? "table-mode" : ""} ${viewMode === "researchGraph" ? "research-chain-mode" : ""} ${viewMode === "equipment" ? "equipment-mode" : ""} ${viewMode === "technology" ? "technology-mode" : ""}`}>
    <header className="site-header" id="top">
      <a className="brand" href="#top" aria-label="钢舞姬战术档案库"><span className="brand-mark">W</span><span><small>STEEL MAIDEN ARCHIVE</small><strong>钢舞姬战术档案库</strong></span></a>
      <nav className="primary-navigation" aria-label="主要栏目">
        <div className="primary-nav-group" data-open={navOpen === "maidens"} onMouseEnter={() => setNavOpen("maidens")} onMouseLeave={() => setNavOpen((current) => current === "maidens" ? null : current)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setNavOpen((current) => current === "maidens" ? null : current); }}>
          <button className={`primary-nav-trigger ${viewMode === "table" || viewMode === "cards" || viewMode === "research" || viewMode === "researchGraph" ? "active" : ""}`} type="button" aria-haspopup="menu" aria-controls="maiden-section-menu" aria-expanded={navOpen === "maidens"} onFocus={() => setNavOpen("maidens")} onClick={() => setNavOpen("maidens")}><span>钢舞姬</span><i aria-hidden="true">⌄</i></button>
          <div className="primary-nav-menu" id="maiden-section-menu" role="menu" aria-label="钢舞姬">
            <button className={viewMode === "table" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("table")}><span><b>属性表</b><small>全量属性、筛选、排序与对比</small></span><i>01</i></button>
            <button className={viewMode === "cards" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("cards")}><span><b>卡牌图鉴</b><small>卡面与头像集卡册，点击查看档案</small></span><i>02</i></button>
            <button className={viewMode === "research" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("research")}><span><b>研发配方</b><small>查看研发条件、资源与上下级</small></span><i>03</i></button>
            <button className={viewMode === "researchGraph" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("researchGraph")}><span><b>研发路线</b><small>纵览完整研发网络与分支</small></span><i>04</i></button>
          </div>
        </div>
        <div className="primary-nav-group" data-open={navOpen === "manual"} onMouseEnter={() => setNavOpen("manual")} onMouseLeave={() => setNavOpen((current) => current === "manual" ? null : current)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setNavOpen((current) => current === "manual" ? null : current); }}>
          <button className={`primary-nav-trigger ${viewMode === "equipment" || viewMode === "technology" || viewMode === "tasks" || viewMode === "items" || viewMode === "terrains" ? "active" : ""}`} type="button" aria-haspopup="menu" aria-controls="manual-section-menu" aria-expanded={navOpen === "manual"} onFocus={() => setNavOpen("manual")} onClick={() => setNavOpen("manual")}><span>手册</span><i aria-hidden="true">⌄</i></button>
          <div className="primary-nav-menu" id="manual-section-menu" role="menu" aria-label="手册">
            <button className={viewMode === "equipment" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("equipment")}><span><b>装备</b><small>装备图鉴、等级属性与搭配效果</small></span><i>01</i></button>
            <button className={viewMode === "technology" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("technology")}><span><b>科技</b><small>各期科技、研发路线与工艺属性</small></span><i>02</i></button>
            <button className={viewMode === "tasks" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("tasks")}><span><b>任务</b><small>任务要求、奖励与解锁前置条件</small></span><i>03</i></button>
            <button className={viewMode === "items" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("items")}><span><b>道具</b><small>资材、活动道具与使用奖励</small></span><i>04</i></button>
            <button className={viewMode === "terrains" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("terrains")}><span><b>地形</b><small>地形图标、环境效果与减益说明</small></span><i>05</i></button>
          </div>
        </div>
        <div className="primary-nav-group" data-open={navOpen === "stages"} onMouseEnter={() => setNavOpen("stages")} onMouseLeave={() => setNavOpen((current) => current === "stages" ? null : current)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setNavOpen((current) => current === "stages" ? null : current); }}>
          <button className={`primary-nav-trigger ${viewMode === "stages" || viewMode === "stories" ? "active" : ""}`} type="button" aria-haspopup="menu" aria-controls="stage-section-menu" aria-expanded={navOpen === "stages"} onFocus={() => setNavOpen("stages")} onClick={() => setNavOpen("stages")}><span>关卡</span><i aria-hidden="true">⌄</i></button>
          <div className="primary-nav-menu" id="stage-section-menu" role="menu" aria-label="关卡">
            <button className={viewMode === "stages" && stageSection === "maps" ? "active" : ""} type="button" role="menuitem" onClick={() => { setStageSection("maps"); openView("stages"); }}><span><b>关卡一览</b><small>地图、敌人、地形与掉落明细</small></span><i>01</i></button>
            <button className={viewMode === "stages" && stageSection === "yield" ? "active" : ""} type="button" role="menuitem" onClick={() => { setStageSection("yield"); openView("stages"); }}><span><b>收益一览</b><small>战役捷径收益、燃油效率与装备筛选</small></span><i>02</i></button>
            <button className={viewMode === "stories" ? "active" : ""} type="button" role="menuitem" onClick={() => openView("stories")}><span><b>剧情一览</b><small>原版剧情、游戏演出与对话记录</small></span><i>03</i></button>
          </div>
        </div>
        <div className="primary-nav-group primary-nav-guides" data-open={navOpen === "guides"} onMouseEnter={() => setNavOpen("guides")} onMouseLeave={() => setNavOpen((current) => current === "guides" ? null : current)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setNavOpen((current) => current === "guides" ? null : current); }}>
          <button className="primary-nav-trigger" type="button" aria-haspopup="menu" aria-controls="guide-links-menu" aria-expanded={navOpen === "guides"} onFocus={() => setNavOpen("guides")} onClick={() => setNavOpen("guides")}><span>攻略链接</span><i aria-hidden="true">⌄</i></button>
          <div className="primary-nav-menu" id="guide-links-menu" role="menu" aria-label="攻略链接">
            {[
              ["钢铁华尔兹BWIKI", "https://wiki.biligame.com/metalwaltz/%E9%A6%96%E9%A1%B5"],
              ["钢舞姬评分表", "https://wiki.biligame.com/metalwaltz/%E9%92%A2%E8%88%9E%E5%A7%AC%E8%AF%84%E5%88%86%E8%A1%A8"],
              ["新车评测", "https://wiki.biligame.com/metalwaltz/%E8%BD%A6%E8%BE%86%E8%AF%84%E6%B5%8B"],
              ["外服WIKI", "https://www.metalmaidendepot.ovh/"],
              ["日服WIKI", "https://seesaawiki.jp/metalwaltz/"],
            ].map(([label, url]) => <a key={url} role="menuitem" href={url} target="_blank" rel="noopener noreferrer" title={`${label}（在新标签页打开）`}><span><b>{label}</b><small>在新标签页打开</small></span><i aria-hidden="true">↗</i></a>)}
          </div>
        </div>
      </nav>
    </header>

    {(viewMode === "table" || viewMode === "cards") && <section className="control-panel" aria-label="筛选与排序">
      <ArchiveSearch value={query} onSearch={setQuery} />
      <div className="control-row"><div className="level-chart-controls">
        {viewMode === "cards" ? <><div className="card-atlas-mode-switch" role="group" aria-label="卡牌图鉴显示模式">
          <button type="button" aria-pressed={cardAtlasMode === "avatars"} onClick={() => setCardAtlasMode("avatars")}><span aria-hidden="true">▦</span>方形头像</button>
          <button type="button" aria-pressed={cardAtlasMode === "cards"} onClick={() => setCardAtlasMode("cards")}><span aria-hidden="true">▯</span>竖版卡牌</button>
        </div><div className="card-atlas-mode-switch" role="group" aria-label="卡牌图鉴皮肤展示模式">
          <button type="button" aria-pressed={cardAtlasSkinMode === "merged"} onClick={() => { setCardAtlasSkinMode("merged"); setLimit(48); }}>皮肤合并</button>
          <button type="button" aria-pressed={cardAtlasSkinMode === "separate"} onClick={() => { setCardAtlasSkinMode("separate"); setLimit(48); }}>皮肤分散</button>
        </div></> : <LevelPicker level={level} setLevel={setLevel} />}
        {viewMode === "table" && <><div className="attribute-chart-launchers"><button type="button" onClick={() => setChartKind("bar")}><svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><path d="M2 3h1v14h15v1H2z" /><rect x="5" y="10" width="3" height="5" /><rect x="10" y="6" width="3" height="9" /><rect x="15" y="3" width="3" height="12" /></svg>柱状图</button><button type="button" onClick={() => setChartKind("scatter")}><svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><path d="M2 3h1v14h15v1H2z" /><circle cx="7" cy="11" r="1.8" /><circle cx="12" cy="8" r="1.8" /><circle cx="9" cy="5" r="1.8" /><circle cx="16" cy="4" r="1.8" /></svg>散点图</button></div><div className="table-controls-target" ref={setTableControlsTarget} /></>}
      </div><div className="main-filter-launcher"><span>{activeMainFilterCount(filters) ? `已应用 ${activeMainFilterCount(filters)} 项筛选` : "当前仅显示已实装钢舞姬"}</span><button onClick={() => { setFilterDraft({ ...filters, nation: [...filters.nation], className: [...filters.className], rarity: [...filters.rarity], stage: [...filters.stage], magicCost: [...filters.magicCost], ammo: [...filters.ammo], engineResistance: [...filters.engineResistance], bodyResistance: [...filters.bodyResistance], talents: [...filters.talents] }); setFilterOpen(true); }}>筛选条件{activeMainFilterCount(filters) ? <b>{activeMainFilterCount(filters)}</b> : null}</button></div></div>
    </section>}

    {viewMode === "table" && <section className="archive-section table-archive">
      <ConfigurableMaidenTable rows={rows} level={level} sortKey={sortKey} descending={descending} onSort={selectSort} talentSortName={talentSortName} talentSortOptions={talentSortOptions} onTalentSortChange={selectTalentSort} selectedIds={compareIds} onCompare={toggleCompare} onOpen={setDetailId} controlsTarget={tableControlsTarget} onResetFilters={clearConditions} />
    </section>}

    {viewMode === "cards" && <CardAtlas rows={rows} allRows={dataset.rows} teamWorkspace={atlasTeamWorkspace} onTeamAction={(action) => setAtlasTeamWorkspace((current) => updateAtlasTeam(current, action))} mode={cardAtlasMode} skinMode={cardAtlasSkinMode} limit={limit} selectedTalents={filters.talents} onOpen={setDetailId} onLoadMore={() => setLimit((value) => value + 48)} onResetFilters={clearConditions} hasFilters={Boolean(query || activeMainFilterCount(filters))} />}

    {viewMode === "research" && researchData && <ResearchWorkspace key={`research:${researchFocusId ?? "default"}`} data={researchData} maidens={dataset.rows} mode="research" focusId={researchFocusId} onOpenResearch={openResearchTree} />}
    {viewMode === "researchGraph" && researchData && <ResearchWorkspace key="researchGraph" data={researchData} maidens={dataset.rows} mode="researchGraph" focusId={null} onOpenResearch={openResearchTree} />}
    {viewMode === "equipment" && equipmentData && <EquipmentAtlas data={equipmentData} attributeIcons={dataset.attributeIcons ?? {}} />}
    {viewMode === "technology" && technologyData && <TechnologyPage data={technologyData} attributeIcons={dataset.attributeIcons ?? {}} maidens={dataset.rows.filter((row) => row.implemented)} onOpenMaiden={setDetailId} />}
    {viewMode === "stages" && <StageArchive section={stageSection} />}
    {viewMode === "stories" && <StoryArchive />}
    {viewMode === "tasks" && <TaskArchive />}
    {viewMode === "items" && <ItemArchive maidens={dataset.rows} onOpenMaiden={setDetailId} />}
    {viewMode === "terrains" && <TerrainArchive />}

    {compareIds.length > 0 && <div className="compare-tray"><div className="tray-title"><span>VS</span><div><strong>双车对比</strong><small>{compareIds.length === 1 ? "再选择一辆钢舞姬" : "已准备好逐项比较"}</small></div></div><div className="tray-slots">{[0, 1].map((index) => { const maiden = comparison[index]; return maiden ? <button key={maiden.id} onClick={() => toggleCompare(maiden.id)}><span>{maiden.image && <img src={maiden.image} alt="" />}</span><b>{maiden.tank}</b><i>×</i></button> : <div key={index} className="empty-slot">＋ 选择车辆</div>; })}</div><button className="open-compare" disabled={compareIds.length < 2} onClick={() => setCompareOpen(true)}>开始比较 →</button></div>}
    {detail && <DetailModal key={detail.id} maiden={detail} initialLevel={level} onClose={() => setDetailId(null)} selected={compareIds.includes(detail.id)} onCompare={() => toggleCompare(detail.id)} onOpenResearch={() => { setDetailId(null); openResearchTree(detail.id); }} onOpenSimulator={() => setSimulatorId(detail.id)} simulatorOpen={simulatorId === detail.id} allMaidens={dataset.rows} colonization={colonizationData?.rows[String(detail.id)]} magicProgression={dataset.magicProgression} />}
    {simulatorMaiden && equipmentData && technologyData && <LoadoutSimulator maiden={simulatorMaiden} equipment={equipmentData} technology={technologyData} colonization={colonizationData?.rows[String(simulatorMaiden.id)]} magic={dataset.magicProgression} attributeIcons={dataset.attributeIcons} onClose={() => setSimulatorId(null)} />}
    {compareOpen && <CompareModal maidens={comparison} onClose={() => setCompareOpen(false)} onRemove={toggleCompare} />}
    {chartKind && <AttributeChartWorkspace dataset={dataset} initialFilters={filters} initialQuery={query} level={level} kind={chartKind} filterRows={mainFilterRows} onClose={() => setChartKind(null)} />}
    {filterOpen && <CardFilterDialog title="钢舞姬筛选" description="车种、国籍、稀有度、图纸、魔改费用各项内取 OR；弹种、抗性、才艺取 AND；狩猎任务单选。" onClose={() => setFilterOpen(false)} onReset={() => setFilterDraft({ ...emptyFilters })} onConfirm={() => { setFilters({ ...filterDraft, nation: [...filterDraft.nation], className: [...filterDraft.className], rarity: [...filterDraft.rarity], stage: [...filterDraft.stage], magicCost: [...filterDraft.magicCost], ammo: [...filterDraft.ammo], engineResistance: [...filterDraft.engineResistance], bodyResistance: [...filterDraft.bodyResistance], talents: [...filterDraft.talents] }); setLimit(48); setFilterOpen(false); }}><div className="rank-filter-board main-filter-board">
      <GroupedMaidenFilters rows={mainFilterRows} selected={(key) => filterDraft[key]} onToggle={(key, value) => setFilterDraft((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }))} includeUnimplemented={filterDraft.includeUnimplemented} maidens={dataset.rows} magicCost={filterDraft.magicCost} onMagicCostChange={(magicCost) => setFilterDraft((current) => ({ ...current, magicCost }))} />
      <MultiFilterRow label="才艺（且）" options={[...new Map(dataset.rows.flatMap((row) => row.talents.map((talent) => [talent.name, { name: talent.name, image: talent.image }]))).values()]} selected={filterDraft.talents} onToggle={(value) => setFilterDraft((current) => ({ ...current, talents: current.talents.includes(value) ? current.talents.filter((item) => item !== value) : [...current.talents, value] }))} />
      <MaidenFilterLastRow huntOptions={dataset.facets.huntTraits.map((name) => ({ name }))} huntTraits={filterDraft.huntTraits} onHuntChange={(value) => setFilterDraft((current) => ({ ...current, huntTraits: value }))} includeUnimplemented={filterDraft.includeUnimplemented} onImplementationChange={(includeUnimplemented) => setFilterDraft((current) => ({ ...current, includeUnimplemented }))} />
    </div></CardFilterDialog>}
    <footer><span>钢铁华尔兹 · 测试服静态配置档案</span><span>{viewMode === "stages" ? "关卡内容来自客户端静态配置，活动开放状态以游戏内为准" : "数据不含装备、好感、账号科技及战斗临时加成"}</span></footer>
  </main>;
}
