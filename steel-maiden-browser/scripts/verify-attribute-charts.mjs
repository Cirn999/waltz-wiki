import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { compileFormula, calculateChart, median, chartDomain, chartTicks, chartAttributes, barChartWidth, exportChartSize, chartNumber, formulaError, MAX_FORMULA_TOKENS } from "../app/attributeChartMath.ts";

const s = (key) => ({ type: "stat", key }), n = (value) => ({ type: "number", value: String(value) }), o = (value) => ({ type: "operator", value });
const stats = { power: 100, piercing: 20, durability: 500, accuracy: 50, armor: 40, evasion: 10, stealth: 0, recon: 30 };
const run = (tokens) => compileFormula(tokens)(stats);
assert.equal(run([s("power"), o("+"), s("piercing"), o("*"), n(2)]), 140);
assert.equal(run([o("("), s("power"), o("+"), s("piercing"), o(")"), o("/"), n(2)]), 60);
assert.equal(run([s("power"), o("-"), s("piercing"), o("-"), n(5)]), 75);
assert.equal(run([n(100), o("/"), n(2), o("/"), n(5)]), 10);
assert.equal(run([o("-"), o("("), s("power"), o("+"), n(2), o(")")]), -102);
assert.equal(run([n(.5), o("*"), s("durability")]), 250);
assert.equal(run([s("stealth")]), 0);
for (const tokens of [[], [s("power"), s("armor")], [o("("), s("power")], [s("power"), o(")")], [s("power"), o("+")], [n("alert(1)")], [s("constructor")], Array(MAX_FORMULA_TOKENS + 1).fill(n(1))]) assert.ok(formulaError(tokens));
assert.throws(() => run([s("power"), o("/"), s("stealth")]), /除数/);
assert.throws(() => compileFormula([s("armor")])({ armor: null }), /缺少装甲/);
assert.throws(() => run([n("9".repeat(308)), o("*"), n(9)]), /有效数值/);
assert.equal(median([9, 1, 3]), 3); assert.equal(median([10, 2, 4, 8]), 6);
assert.equal(median([7]), 7); assert.equal(median([-5, -1, -3]), -3);
assert.throws(() => median([])); assert.deepEqual(chartDomain([0, 0], true), [0, 1]);
assert.deepEqual(chartDomain([0, 0]), [-1, 1]);
assert.equal(chartDomain([-5, -3], true)[1], 0);
assert.equal(chartDomain([5, 3], true)[0], 0);
assert.deepEqual(chartTicks([-393, 380]), [-200, 0, 200]);
const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
for (const level of [1, 60, 90, 99]) {
  for (const attribute of chartAttributes) {
    const result = calculateChart(data.rows, "bar", level, [], [s(attribute.key)]);
    const missing = data.rows.filter((row) => row.stats[level][attribute.key] == null);
    assert.equal(result.errors.length, missing.length, "missing values must be reported, not coerced to zero");
    assert.equal(result.points.length, data.rows.length - missing.length);
    for (const row of missing) assert.ok(result.errors.some((message) => message.includes(row.tank)));
  }
  const { points, errors } = calculateChart(data.rows, "bar", level, [], [s("power"), o("+"), s("piercing")]);
  assert.deepEqual(errors, []); assert.equal(points.length, data.rows.length);
  points.forEach((point, index) => {
    assert.equal(point.y, point.maiden.stats[level].power + point.maiden.stats[level].piercing);
    if (index) assert.ok(points[index - 1].y >= point.y);
  });
  const scatter = calculateChart(data.rows, "scatter", level, [s("durability")], [s("armor")]);
  assert.deepEqual(scatter.errors, []);
  assert.equal(median(scatter.points.map((point) => point.x)), median(data.rows.map((row) => row.stats[level].durability)));
}
assert.equal(calculateChart([data.rows[0], data.rows[0]], "bar", 1, [], [s("power")]).points.length, 1);
assert.equal(calculateChart([data.rows[0]], "bar", 1, [], [n(1), o("/"), n(0)]).errors.length, 1);
assert.equal(calculateChart([data.rows[0]], "bar", 2, [], [s("power")]).errors.length, 1);
assert.equal(calculateChart([data.rows[0]], "bar", 1, [], [n("9".repeat(110))]).errors.length, 1);
for (const count of [1, 5, 100, data.rows.length]) {
  const width = barChartWidth(count);
  assert.ok((width - 136) / count >= 64);
  const size = exportChartSize(width, 800);
  assert.ok(size.width <= 30000 && size.height <= 30000 && size.width * size.height <= 24_000_000);
}
assert.equal(chartNumber(0), "0"); assert.notEqual(chartNumber(.00001), "0");
console.log(JSON.stringify({ vehicles: data.rows.length, levels: [1, 60, 90, 99], parser: "precedence, parentheses, unary, decimal, invalid/overflow/division-by-zero", export: `${data.rows.length}-vehicle full-width bounds verified` }));
