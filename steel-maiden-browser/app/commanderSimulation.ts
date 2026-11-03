import { calculateNativePanel, nativeInitialState, type NativeLoadoutRules } from "./nativeLoadout.ts";
import { nativePanelDisplay, researchCraftKey, technologyProperties, type SimTechData, type SimTechLevels, type SimMagicData } from "./loadoutMath.ts";

export const defaultCommanderTactic = 211;
export type CommanderCard = { id: number; magicSelectors: { ordnance: number; tactics: number }; promotions: { stars: number; level: number; commanderLevel: number }[] };
export type CommanderMagicPaths = Record<string, { level: number; scoutLevel: number; phases: number[] }[]>;
export type CommanderPanel = ReturnType<typeof nativePanelDisplay> & { phase: number; ordnanceLevel: number; tacticsLevel: number };
export type CommanderResult = { commanderLevel: number; tacticTrend: number; scoutLevel: number; technology: SimTechLevels; rows: Record<string, Record<string, CommanderPanel>> };
export type CommanderRequest = { commanderLevel: number; tacticTrend: number; levels: number[]; cards: CommanderCard[]; technology: SimTechData; magicPaths: CommanderMagicPaths; rules: NativeLoadoutRules };

export function parseCommanderLevel(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number(input);
  if (!/^\d+$/.test(input.trim()) || !Number.isSafeInteger(value) || value < 1 || value > 32767) throw new Error("请输入 1–32767 的整数指挥官等级");
  return value;
}

export function commanderTechnologySettings(data: SimTechData, commanderLevel: number): SimTechLevels {
  if (data.commanderLimits?.version !== 1) throw new Error("缺少指挥官等级对应的科技解锁数据");
  const settings: SimTechLevels = {};
  for (const block of data.blocks) {
    if (block.levels.some((level) => !Number.isInteger(level.unlockCommanderLevel))) throw new Error(`缺少${block.secondary}的科技等级门槛`);
    settings[block.id] = Math.max(0, ...block.levels.filter((level) => level.unlockCommanderLevel! <= commanderLevel).map((level) => level.level));
    for (const node of block.nodes) {
      if (!Number.isInteger(node.unlockCommanderLevel)) throw new Error(`缺少${node.name}的研发门槛`);
      settings[researchCraftKey(node.craftId)] = node.unlockCommanderLevel! <= commanderLevel ? 1 : 0;
    }
  }
  return settings;
}

export function commanderMagicPaths(data: SimMagicData): CommanderMagicPaths {
  const paths: CommanderMagicPaths = {};
  for (const vehicles of Object.values(data.progression)) for (const kinds of Object.values(vehicles)) for (const variants of Object.values(kinds)) for (const path of variants) {
    paths[path.selectorId] = path.levels.map((entry) => {
      if (!entry.phases?.length) throw new Error(`缺少魔改配方 ${path.selectorId} 的亮星门槛`);
      return { level: entry.level, scoutLevel: entry.scoutLevel, phases: entry.phases };
    });
  }
  return paths;
}

export function maximumCommanderMagic(paths: CommanderMagicPaths, selector: number, scoutLevel: number, phase: number) {
  const path = paths[selector];
  if (!path) throw new Error(`缺少魔改配方 ${selector}`);
  let maximum = 0;
  for (const step of [...path].sort((a,b) => a.level-b.level)) {
    if (step.level !== maximum+1) throw new Error(`魔改配方 ${selector} 的等级不连续`);
    if (step.scoutLevel > scoutLevel || !step.phases.includes(phase)) break;
    maximum = step.level;
  }
  return maximum;
}

export function commanderPhase(card: CommanderCard, vehicleLevel: number, commanderLevel: number, rules: NativeLoadoutRules) {
  const native = rules.cards[card.id];
  if (!native || card.promotions.length !== 2) throw new Error(`缺少钢舞姬 #${card.id} 的亮星规则`);
  let stars = 1;
  for (const promotion of [...card.promotions].sort((a,b) => a.stars-b.stars)) {
    if (promotion.level > vehicleLevel || promotion.commanderLevel > commanderLevel) break;
    stars = promotion.stars;
  }
  const number = Math.max(...Object.keys(native.phases).map(Number).filter((p) => p <= stars));
  if (!Number.isFinite(number)) throw new Error(`缺少钢舞姬 #${card.id} 的原生阶段`);
  return { number, phase: native.phases[number] };
}

export function calculateCommanderSimulation(request: CommanderRequest): CommanderResult {
  const { commanderLevel, tacticTrend, cards, levels, rules, magicPaths } = request;
  if (parseCommanderLevel(String(commanderLevel)) === null) throw new Error("指挥官等级无效");
  const technology = commanderTechnologySettings(request.technology, commanderLevel);
  const properties = technologyProperties(request.technology, technology);
  // This is the account's comprehensive scouting property (64), including all
  // periods. The training recipe independently checks each vehicle's phase.
  const scoutLevel = request.technology.blocks.filter((block) => block.secondary === "综合索敌").reduce((sum, block) => sum+(technology[block.id]??0),0);
  const rows: CommanderResult["rows"] = {};
  for (const card of cards) {
    rows[card.id] = {};
    for (const level of levels) {
      if (!Number.isInteger(level) || level<1 || level>99) throw new Error("钢舞姬等级应为 1–99");
      const { number, phase } = commanderPhase(card, level, commanderLevel, rules);
      const state = nativeInitialState(rules, card.id, phase);
      state[1].level = level;
      for (const id of [21,22,23,24,25,26]) state[id].level = 0;
      const ordnanceLevel = maximumCommanderMagic(magicPaths,card.magicSelectors.ordnance,scoutLevel,number);
      const tacticsLevel = maximumCommanderMagic(magicPaths,card.magicSelectors.tactics,scoutLevel,number);
      state[17].level = ordnanceLevel;
      const tactics = phase.categories[18];
      if (!tactics || !rules.groups[tactics.group]?.items[tacticTrend]) throw new Error(`钢舞姬 #${card.id} 不支持所选战术`);
      state[18] = { trend: tacticTrend, level: tacticsLevel };
      const panel = calculateNativePanel(rules,phase,state,properties);
      rows[card.id][level] = { ...nativePanelDisplay(rules,panel.totals), phase:number, ordnanceLevel, tacticsLevel };
    }
  }
  return { commanderLevel,tacticTrend,scoutLevel,technology,rows };
}
