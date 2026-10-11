/** Widths are measured at font size 1; layout coordinates are % of card width. */
export type CardNameLayout = { lines: string[]; fontSize: number };
export type MeasureCardText = (text: string) => number;
const fallbackMeasure: MeasureCardText = (text) => [...text].reduce((sum, letter) => sum + (/[^\u0000-\u00ff]/u.test(letter) ? 1 : /[ilI1 .]/u.test(letter) ? .3 : .6), 0);
const approvedBreaks: Record<string, string[]> = {
  "ISU-152现代化方案": ["ISU-152", "现代化方案"],
  "Sd.Kfz.251 Calliope": ["Sd.Kfz.251", "Calliope"],
  "VBPA Centauro轮式自行火炮": ["VBPA Centauro", "轮式自行火炮"],
  "谢尔曼m4a3火箱发射器型": ["谢尔曼m4a3", "火箱发射器型"],
  "AC中型坦克（双25磅炮）": ["AC中型坦克", "（双25磅炮）"],
  "迷你埃普西隆（俘获型）": ["迷你埃普西隆", "（俘获型）"],
  "II号坦克山猫L.V.Sfl": ["II号坦克", "山猫L.V.Sfl"],
};

// Prefer complete type/variant phrases, longest first. Never split a modifier
// from its category (超重型坦克, 自行榴弹炮, 轮式侦察车, etc.).
export const cardNamePhrases = [
  "轻型坦克歼击车", "空降坦克歼击车", "坦克歼击车", "重型歼击车", "空降歼击车", "歼击车",
  "超重型坦克", "重型突击坦克", "超重坦克", "主战坦克", "重型坦克", "中型坦克", "轻型坦克", "巡航坦克", "步兵坦克", "空降坦克", "试验型坦克", "试验坦克", "鱼雷坦克",
  "轮式自行火炮", "自行榴弹炮", "自行加农炮", "自行反坦克炮", "摩托型反坦克炮", "反坦克炮", "自行火炮",
  "重型突击炮", "轮式突击炮", "试验突击炮", "突击步兵炮", "突击炮", "轮式火箭炮", "多管火箭炮", "多管火箭", "火箭发射车", "火箭炮", "发射车",
  "轮式侦察车", "履式侦察车", "半履式装甲车", "轮式装甲车", "装甲运兵车", "步兵战车", "导弹吉普车",
  "重型战斗机", "截击机", "战斗机", "轰炸机", "攻击机",
  "原型车", "试验型", "改进型", "炮塔升级型", "现代化方案", "后期型", "刺猬式", "萤火虫", "试制机", "Gun Carrier",
].sort((a, b) => b.length - a.length);

type NameRange = { start: number; end: number; content: string };
function bracketGroups(name: string): NameRange[] {
  const groups: NameRange[] = [];
  let depth = 0, start = -1;
  // Client strings sometimes mix ASCII openers and full-width closers. Keep
  // the source spelling; both forms still delimit one indivisible annotation.
  for (let index = 0; index < name.length; index++) {
    if ("(（[【".includes(name[index])) { if (depth++ === 0) start = index; }
    else if (")）]】".includes(name[index]) && depth > 0 && --depth === 0) groups.push({ start, end: index + 1, content: name.slice(start + 1, index) });
  }
  if (depth > 0) groups.push({ start, end: name.length, content: name.slice(start + 1) });
  return groups;
}

function semanticBreak(name: string, groups: NameRange[]): string[] | undefined {
  if (approvedBreaks[name]) return approvedBreaks[name];
  const last = groups.at(-1);
  // Small embedded maker/model codes such as 38(t), LVT(A)-4 and VK3002(M)
  // belong to the model. Descriptive qualifiers go intact on the second line.
  if (last && last.start > 0 && !/^[A-Za-z]{1,2}$/u.test(last.content)
    && /^(?:型)?$/u.test(name.slice(last.end))) return [name.slice(0, last.start).trimEnd(), name.slice(last.start)];
  for (const phrase of cardNamePhrases) {
    const start = name.lastIndexOf(phrase);
    if (start <= 0 || groups.some((group) => start > group.start && start < group.end)) continue;
    const tail = name.slice(start + phrase.length);
    if (!/^(?:\d+(?:型|方案))?$/u.test(tail)) continue;
    return [name.slice(0, start).trimEnd(), name.slice(start)];
  }
}

function safeBreaks(name: string, groups: NameRange[]): number[] {
  const ranges = [...groups];
  // Whole Latin/model tokens are indivisible, including punctuation and small
  // embedded model tags. For pure long model names use a smaller single line.
  for (const match of name.matchAll(/[A-Za-z0-9][A-Za-z0-9.*+\/-]*(?:[（(][A-Za-z]{1,2}[）)][A-Za-z0-9.*+\/-]*)*(?:号|式)?/gu)) {
    ranges.push({ start: match.index, end: match.index + match[0].length, content: match[0] });
  }
  // Without an explicit semantic boundary, don't guess inside a Chinese name.
  for (const match of name.matchAll(/[\u3400-\u9fff]+/gu)) ranges.push({ start: match.index, end: match.index + match[0].length, content: match[0] });
  const result: number[] = [];
  for (let index = 1; index < name.length; index++) {
    const left = name.slice(0, index).trimEnd(), right = name.slice(index).trimStart();
    if (!left || !right || ranges.some((range) => index > range.start && index < range.end)) continue;
    if (/[-.(（[【]$/u.test(left) || /^[\-.,，)）\]】]/u.test(right)) continue;
    result.push(index);
  }
  return result;
}

export function cardNameLayout(name: string, measure: MeasureCardText = fallbackMeasure): CardNameLayout {
  const available = 43;
  const singleSize = Math.min(9.4, available / Math.max(measure(name), 1));
  const groups = bracketGroups(name);
  let lines = semanticBreak(name, groups);
  if (singleSize >= 6.4 && !lines) return { lines: [name], fontSize: singleSize };
  if (!lines) {
    let best = Infinity;
    for (const index of safeBreaks(name, groups)) {
      const left = name.slice(0, index).trimEnd(), right = name.slice(index).trimStart();
      const a = measure(left), b = measure(right);
      const score = Math.max(a, b) + Math.abs(a - b) * .08;
      if (score < best) { best = score; lines = [left, right]; }
    }
  }
  return lines ? { lines, fontSize: Math.min(6.15, available / Math.max(...lines.map(measure), 1)) } : { lines: [name], fontSize: singleSize };
}

export function orderedAtlasRows<T extends { id: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.id - right.id);
}

export const cardRarityBackgrounds: Record<number, string> = {
  2: "/art/card-atlas/rarity-blue.webp",
  3: "/art/card-atlas/rarity-purple.webp",
  4: "/art/card-atlas/rarity-orange.webp",
};
