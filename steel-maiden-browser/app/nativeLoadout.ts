/** Portable implementation of Unit_Set's panel pipeline, not display-card arithmetic.
 * Native reference and instruction-backed fixtures live in analysis_apk/tools.
 */
export type NativeFunction = { selector?: number; function_id: number; params: { param_id: number; input_ids: number[]; default_value: number }[] };
type NativeEffect = { properties: number[]; traits: number[]; attributes: { templates: number[]; presets: number[]; params: number[] }[]; traitRules: number[] };
type NativeCategory = { effects: number[]; group: number; properties: number[]; traits: number[] };
export type NativePhase = { presets: Record<string, number[]>; categories: Record<string, NativeCategory> };
export type NativeLoadoutRules = {
  version: number; clientSha256: string; attributes: Record<string, string>;
  cards: Record<string, { slots: number[]; phases: Record<string, NativePhase>; initialLevels: Record<string, number> }>;
  propertyDefaults: Record<string, number>;
  traitTypes: Record<string, { properties: number[]; base: number }>;
  effects: NativeEffect[];
  groups: Record<string, { default: number; items: Record<string, number[]> }>;
  params: Record<string, { rule: string; inputs: { id: number; properties: number[]; traits: number[] }[] }>;
  templates: Record<string, { id: number; rules: [string, number][]; multiplier: number; base: number }[]>;
  rules: Record<string, NativeFunction[]>;
  traitRules: Record<string, { id: number; functions: NativeFunction[]; multiplier: number; base: number }[]>;
  equipmentTrends: Record<string, number>;
};
export type NativeState = Record<string, { level: number; trend: number }>;

let pending: Promise<NativeLoadoutRules> | null = null;
export function loadNativeLoadoutRules(): Promise<NativeLoadoutRules> {
  if (!pending) pending = fetch('/data/loadout-rules.json').then(async (response) => {
    if (!response.ok) throw new Error('配装计算数据加载失败');
    const data = await response.json() as NativeLoadoutRules;
    if (data.version !== 1 || !data.cards || !data.templates || !data.rules || !data.effects || !data.params || !data.groups || !data.traitTypes || !data.propertyDefaults || !data.equipmentTrends) throw new Error('配装计算数据版本不匹配');
    return data;
  }).catch((error: unknown) => { pending = null; throw error; });
  return pending;
}

/** combineFunctionParamList adds every matching input to the configured default. */
export function nativeFunction(f: NativeFunction, source: number, inputs: Record<string, number> = {}) {
  const params: Record<string, number> = {};
  for (const p of f.params) params[p.param_id] = p.default_value + p.input_ids.reduce((sum, id) => sum + (inputs[id] ?? 0), 0);
  let value: number;
  switch (f.function_id) {
    case 1: value = source < params[3] ? 0 : params[1] + (source - params[3]) * params[2]; break;
    case 100: value = source * params[101] / 10000 + params[102]; break;
    case 101: value = source * (10000 - params[101] * params[102]) / 10000; break;
    default: throw new Error(`未知原生属性公式 ${f.function_id}`);
  }
  // ARM64 fcvtzs after the Lua function, including negative values.
  return Math.trunc(value);
}

export function nativePhaseForLevel(data: NativeLoadoutRules, id: number, level: number) {
  const card = data.cards[id];
  if (!card) throw new Error(`缺少钢舞姬 #${id} 的原生配装规则`);
  const stars = level >= 70 ? 3 : level >= 35 ? 2 : 1;
  const phase = Math.max(...Object.keys(card.phases).map(Number).filter((p) => p <= stars));
  if (!Number.isFinite(phase)) throw new Error(`缺少钢舞姬 #${id} 的 ${stars} 星规则`);
  return { number: phase, phase: card.phases[phase] };
}

const sumIds = (ids: number[], values: Record<string, number>) => ids.reduce((sum, id) => sum + (values[id] ?? 0), 0);

export function calculateNativePanel(data: NativeLoadoutRules, phase: NativePhase, state: NativeState, properties: Record<string, number>) {
  properties = Object.fromEntries([...new Set([...Object.keys(properties), ...Object.keys(data.propertyDefaults)])].map((id) => [id, (properties[id] ?? 0) + (data.propertyDefaults[id] ?? 0)]));
  const traits: Record<string, number> = Object.fromEntries(Object.entries(data.traitTypes).map(([id, t]) => [id, t.base + sumIds(t.properties, properties)]));
  const selectedEffects = (category: NativeCategory, status: { level: number; trend: number }) => data.groups[category.group]?.items[status.trend] ?? [];
  // Native first collects trait rules using the original, unadjusted intensities.
  for (const [id, status] of Object.entries(state)) {
    const category = phase.categories[id];
    if (!category) continue;
    for (const effectId of [...category.effects, ...selectedEffects(category, status)]) {
      for (const rule of data.effects[effectId].traitRules) for (const t of data.traitRules[rule]) {
        const subtotal = t.functions.reduce((sum, f) => sum + nativeFunction(f, status.level), 0);
        traits[t.id] = (traits[t.id] ?? 0) + Math.trunc(subtotal * t.multiplier / 10000 + t.base);
      }
    }
  }
  const templateValues = (id: number, level: number, paramIds: number[]) => {
    const attributes = data.templates[id];
    if (!attributes) throw new Error(`缺少原生属性模板 ${id}`);
    const values: Record<string, number> = {};
    for (const a of attributes) {
      let subtotal = 0;
      for (const [rule, selector] of a.rules) {
        const functions = data.rules[rule];
        if (!functions) throw new Error(`缺少原生属性成长规则 ${rule}`);
        for (const f of functions) if (f.selector === selector) subtotal += nativeFunction(f, level);
      }
      values[a.id] = (values[a.id] ?? 0) + Math.trunc(subtotal * a.multiplier / 10000 + a.base);
    }
    // Rule transforms are sequential and truncated independently per template.
    for (const paramId of paramIds) {
      const param = data.params[paramId];
      const inputs = Object.fromEntries(param.inputs.map((p) => [p.id, sumIds(p.properties, properties) + sumIds(p.traits, traits)]));
      for (const f of data.rules[param.rule]) {
        const id = f.selector!;
        if (data.attributes[id] !== undefined) values[id] = nativeFunction(f, values[id] ?? 0, inputs);
      }
    }
    return values;
  };
  const totals: Record<string, number> = Object.fromEntries(Object.keys(data.attributes).map((id) => [id, 0]));
  const breakdown: Record<string, Record<string, number>> = {};
  for (const [id, category] of Object.entries(phase.categories)) {
    const status = state[id];
    if (!status) continue;
    const intensity = status.level + sumIds(category.properties, properties) + sumIds(category.traits, traits);
    if (intensity < 1) continue;
    const values: Record<string, number> = {};
    const apply = (effectId: number, level: number) => {
      for (const a of data.effects[effectId].attributes) {
        const templates = [...a.templates, ...a.presets.flatMap((p) => phase.presets[p] ?? [])];
        for (const template of templates) for (const [key, value] of Object.entries(templateValues(template, level, a.params))) values[key] = (values[key] ?? 0) + value;
      }
    };
    // extractFacultyAdjustEffectConfig deliberately ignores each base effect's
    // intensity adjustment. Selected trend effects take the separate path below.
    for (const effectId of category.effects) apply(effectId, intensity);
    for (const effectId of selectedEffects(category, status)) {
      const e = data.effects[effectId];
      apply(effectId, intensity + sumIds(e.properties, properties) + sumIds(e.traits, traits));
    }
    breakdown[id] = values;
    for (const [key, value] of Object.entries(values)) totals[key] = (totals[key] ?? 0) + value;
  }
  return { totals, breakdown, traits };
}
