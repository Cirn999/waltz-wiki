import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { cardNameLayout, cardNamePhrases } from "../app/cardAtlasLayout.ts";

const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const fixtures = [
  ["鼠式超重型坦克", ["鼠式", "超重型坦克"]],
  ["E-25（保时捷型）", ["E-25", "（保时捷型）"]],
  ["E-25(保时捷型)", ["E-25", "(保时捷型)"]],
  ["象式坦克歼击车", ["象式", "坦克歼击车"]],
  ["斐迪南坦克歼击车", ["斐迪南", "坦克歼击车"]],
  ["野蜂自行榴弹炮", ["野蜂", "自行榴弹炮"]],
  ["犀牛自行反坦克炮", ["犀牛", "自行反坦克炮"]],
  ["雷诺B1重型坦克", ["雷诺B1", "重型坦克"]],
  ["虎式自行火炮21型", ["虎式", "自行火炮21型"]],
  ["IV号歼击车0方案", ["IV号", "歼击车0方案"]],
  ["ZiS-30轻型坦克歼击车", ["ZiS-30", "轻型坦克歼击车"]],
  ["ASU-57空降坦克歼击车", ["ASU-57", "空降坦克歼击车"]],
  ["M3A1轮式侦察车", ["M3A1", "轮式侦察车"]],
  ["M2半履式装甲车", ["M2", "半履式装甲车"]],
  ["T34E1火箭发射车", ["T34E1", "火箭发射车"]],
  ["土龟重型突击坦克", ["土龟", "重型突击坦克"]],
  ["BM-13喀秋莎火箭炮", ["BM-13喀秋莎", "火箭炮"]],
  ["59-1式自行加农炮", ["59-1式", "自行加农炮"]],
  ["玛蒂尔达刺猬式", ["玛蒂尔达", "刺猬式"]],
  ["IV号坦克(Rf.K 43双管型)", ["IV号坦克", "(Rf.K 43双管型)"]],
  ["KV-4(米哈伊洛夫)", ["KV-4", "(米哈伊洛夫)"]],
  ["97式(新炮塔搭载型）", ["97式", "(新炮塔搭载型）"]],
  ["III号坦克H（指挥）型", ["III号坦克H", "（指挥）型"]],
  ["LVT(A)-4(37mm)", ["LVT(A)-4", "(37mm)"]],
  ["38(t)轻型坦克", ["38(t)", "轻型坦克"]],
  ["旅行者TH02[克蕾尔]", ["旅行者TH02", "[克蕾尔]"]],
  ["丘吉尔Gun Carrier", ["丘吉尔", "Gun Carrier"]],
  ["Sd.Kfz.251/22", ["Sd.Kfz.251/22"]],
  ["Sturmmorser38D", ["Sturmmorser38D"]],
  ["T-40/BM-8-24", ["T-40/BM-8-24"]],
];
for (const [name, expected] of fixtures) {
  for (const measure of [undefined, (text) => [...text].length * 1.5]) assert.deepEqual(cardNameLayout(name, measure).lines, expected, name);
}
for (const name of ["38(t)", "VK3002（M）", "谢尔曼Mk-I", "T-34/85"]) assert.deepEqual(cardNameLayout(name).lines, [name]);

const normalize = (text) => text.replace(/\s/gu, "");
const protectedNames = ["哈利法克斯", "阿喀琉斯", "玛蒂尔达", "喀秋莎", "谢里登", "卡普罗尼", "沙漠突袭者", "超级谢尔曼"];
let multiline = 0, bracketed = 0;
for (const row of rows) {
  const layout = cardNameLayout(row.tank);
  assert.equal(normalize(layout.lines.join("")), normalize(row.tank));
  assert.ok(layout.lines.length <= 2 && layout.lines.every(Boolean) && layout.fontSize > 0);
  if (layout.lines.length > 1) multiline++;
  // Independent invariants: whole phrases, alphabetic model tokens and paired
  // qualifiers must be contained in one line, regardless of balancing scores.
  const brackets = row.tank.match(/[（(][^()（）]*[）)]|\[[^\[\]]*\]/gu) ?? [];
  if (brackets.length) bracketed++;
  const tokens = row.tank.match(/[A-Za-z0-9][A-Za-z0-9.*+\/-]*/gu) ?? [];
  for (const token of [...brackets, ...tokens, ...cardNamePhrases.filter((phrase) => row.tank.includes(phrase)), ...protectedNames.filter((name) => row.tank.includes(name))]) {
    assert.ok(layout.lines.some((line) => line.includes(token)), `${row.id}: split semantic unit ${token} in ${layout.lines.join(" / ")}`);
  }
}
console.log(JSON.stringify({ reviewedNames: rows.length, fixtures: fixtures.length, multiline, bracketed, wholeTermsAndModels: true }, null, 2));
