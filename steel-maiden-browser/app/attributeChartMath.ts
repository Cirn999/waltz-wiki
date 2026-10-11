export const chartAttributes = [
  { key: "durability", label: "耐久" }, { key: "power", label: "火力" },
  { key: "piercing", label: "穿甲" }, { key: "accuracy", label: "命中" },
  { key: "armor", label: "装甲" }, { key: "evasion", label: "回避" },
  { key: "stealth", label: "隐蔽" }, { key: "recon", label: "侦查" },
] as const;
export type ChartAttribute = (typeof chartAttributes)[number]["key"];
export type ChartKind = "bar" | "scatter";
export type FormulaToken = { type: "stat"; key: ChartAttribute } | { type: "number"; value: string } | { type: "operator"; value: "+" | "-" | "*" | "/" | "(" | ")" };
export type ChartMaiden = { id: number; tank: string; person: string; headImage: string; nation: string; nationIcon: string; classIcon: string; stage: string; stats: Record<string, Partial<Record<ChartAttribute, number | null>>> };
export type ChartPoint = { maiden: ChartMaiden; x: number; y: number };
export type ChartSnapshot = { kind: ChartKind; level: number; xLabel: string; yLabel: string; points: ChartPoint[] };
type Stats = Partial<Record<ChartAttribute, number | null>>;
type Expression = (stats: Stats) => number;
const labels = new Map(chartAttributes.map((entry) => [entry.key, entry.label]));
export const MAX_FORMULA_TOKENS = 128;

export function tokenLabel(token: FormulaToken): string {
  if (token.type === "stat") return labels.get(token.key) ?? "未知属性";
  return token.value === "*" ? "×" : token.value === "/" ? "÷" : token.value;
}
export const formulaLabel = (tokens: FormulaToken[]) => tokens.map(tokenLabel).join(" ");
export const validNumber = (value: string) => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value));

// A small arithmetic parser: only typed tokens, never eval/Function or user code.
export function compileFormula(tokens: FormulaToken[]): Expression {
  if (!tokens.length) throw new Error("请选择属性或填写公式");
  if (tokens.length > MAX_FORMULA_TOKENS) throw new Error(`公式最多 ${MAX_FORMULA_TOKENS} 个块`);
  let position = 0;
  const operator = (value: string) => tokens[position]?.type === "operator" && (tokens[position] as { value: string }).value === value;
  const finite = (value: number) => {
    if (!Number.isFinite(value)) throw new Error("计算结果超出有效数值范围");
    return Object.is(value, -0) ? 0 : value;
  };
  function primary(): Expression {
    if (operator("+") || operator("-")) {
      const sign = operator("-") ? -1 : 1;
      position++;
      const child = primary();
      return (stats) => finite(sign * child(stats));
    }
    if (operator("(")) {
      position++;
      const child = sum();
      if (!operator(")")) throw new Error("缺少右括号 )");
      position++;
      return child;
    }
    const token = tokens[position++];
    if (!token) throw new Error("公式末尾缺少属性或数字");
    if (token.type === "stat" && labels.has(token.key)) return (stats) => {
      const value = stats[token.key];
      if (value == null || !Number.isFinite(value)) throw new Error(`缺少${labels.get(token.key)}数据`);
      return value;
    };
    if (token.type === "number" && validNumber(token.value)) return () => Number(token.value);
    throw new Error("这里需要属性、数字或左括号");
  }
  function product(): Expression {
    let result = primary();
    while (operator("*") || operator("/")) {
      const divide = operator("/"); position++;
      const left = result, right = primary();
      result = (stats) => {
        const a = left(stats), b = right(stats);
        if (divide && b === 0) throw new Error("除数为 0，请调整公式");
        return finite(divide ? a / b : a * b);
      };
    }
    return result;
  }
  function sum(): Expression {
    let result = product();
    while (operator("+") || operator("-")) {
      const subtract = operator("-"); position++;
      const left = result, right = product();
      result = (stats) => finite(subtract ? left(stats) - right(stats) : left(stats) + right(stats));
    }
    return result;
  }
  const result = sum();
  if (position !== tokens.length) throw new Error(operator(")") ? "多余的右括号 )" : "两个属性或数字之间需要运算符");
  return result;
}

export function formulaError(tokens: FormulaToken[]) {
  try { compileFormula(tokens); return ""; } catch (error) { return (error as Error).message; }
}

export function calculateChart(maidens: ChartMaiden[], kind: ChartKind, level: number, x: FormulaToken[], y: FormulaToken[]) {
  const calculateY = compileFormula(y), calculateX = kind === "scatter" ? compileFormula(x) : () => 0;
  const points: ChartPoint[] = [], errors: string[] = [];
  const seen = new Set<number>();
  for (const maiden of maidens) {
    if (seen.has(maiden.id)) continue;
    seen.add(maiden.id);
    try {
      const stats = maiden.stats[String(level)];
      if (!stats) throw new Error(`缺少 ${level} 级属性`);
      const point = { maiden, x: calculateX(stats), y: calculateY(stats) };
      if (Math.abs(point.x) > 1e100 || Math.abs(point.y) > 1e100) throw new Error("数值超出图表可处理范围，请缩小公式结果");
      points.push(point);
    } catch (error) { errors.push(`${maiden.tank}：${(error as Error).message}`); }
  }
  if (kind === "bar") points.sort((a, b) => b.y - a.y || a.maiden.tank.localeCompare(b.maiden.tank, "zh-CN") || a.maiden.id - b.maiden.id);
  return { points, errors };
}

export function median(values: number[]) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) throw new Error("中位数需要有效的车辆数值");
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

export function chartDomain(values: number[], includeZero = false): [number, number] {
  let min = Math.min(...values), max = Math.max(...values);
  if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { if (includeZero && min === 0) return [0, 1]; const padding = Math.max(Math.abs(min) * .1, 1); return [min - padding, max + padding]; }
  const padding = (max - min) * .12;
  return [includeZero && min === 0 ? 0 : min - padding, includeZero && max === 0 ? 0 : max + padding];
}

export function chartTicks([min, max]: [number, number]) {
  const rough = (max - min) / 4, magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rough) ?? 10) * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9 && ticks.length < 10; value += step) ticks.push(Number(value.toPrecision(12)) || 0);
  return ticks;
}

export function barChartWidth(count: number, longestLabel = 0) { return Math.max(1040, count * Math.max(64, longestLabel * 7 + 12) + 136); }
export function exportChartSize(width: number, height: number) {
  const ratio = Math.min(1.5, 30000 / width, 30000 / height, Math.sqrt(24_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)) };
}
export const chartNumber = (value: number) => Math.abs(value) >= 1e9 || (value !== 0 && Math.abs(value) < .001)
  ? value.toExponential(2) : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
