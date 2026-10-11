import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { technologyPathPoints, technologyPrerequisites } from "../app/technologyPaths.ts";

const data = JSON.parse(await fs.readFile(new URL("../public/data/technology-catalog.json", import.meta.url), "utf8"));
let lineCount = 0, changedCount = 0, selectionCount = 0;
for (const block of data.blocks) {
  const nodes = new Map(block.nodes.map((node) => [node.tag, node]));
  for (const line of block.lines) {
    lineCount++;
    const context = `${block.id}: ${line.from} -> ${line.to}`;
    const before = JSON.stringify(line);
    const points = technologyPathPoints(line.points);
    if (JSON.stringify(points) !== JSON.stringify(line.points)) changedCount++;
    assert.equal(JSON.stringify(line), before, `${context}: source data mutated`);
    assert.ok(points.length >= 2, context);
    for (const [point, tag] of [[points[0], line.from], [points.at(-1), line.to]]) {
      assert.ok(nodes.has(tag), `${context}: unknown node`);
      assert.deepEqual(point, { x: nodes.get(tag).x, y: nodes.get(tag).y }, `${context}: endpoint changed`);
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      assert.ok((a.x === b.x) !== (a.y === b.y), `${context}: diagonal or duplicate segment`);
      assert.ok(b.x >= a.x, `${context}: backwards segment`);
      assert.ok(b.y >= Math.min(points[0].y, points.at(-1).y) && b.y <= Math.max(points[0].y, points.at(-1).y), `${context}: unwanted vertical spur`);
    }
    assert.deepEqual(technologyPathPoints(points), points, `${context}: normalization is not idempotent`);
  }
  assert.equal(technologyPrerequisites(block.lines, null).size, 0);
  for (const node of block.nodes) {
    selectionCount++;
    const expected = new Set([node.tag]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const line of block.lines) if (expected.has(line.to) && !expected.has(line.from)) { expected.add(line.from); grew = true; }
    }
    assert.deepEqual([...technologyPrerequisites(block.lines, node.tag)].sort(), [...expected].sort());
  }
}
const rockets = data.blocks.find((block) => block.id === "火箭弹-3");
const path = (from, to) => technologyPathPoints(rockets.lines.find((line) => line.from === from && line.to === to).points).map(({ x, y }) => [x, y]);
assert.deepEqual(path(15573, 15578), [[200, 100], [250, 100], [250, 0], [300, 0]]);
assert.deepEqual(path(15578, 15583), [[300, 0], [350, 0], [350, 100], [400, 100]]);
assert.deepEqual([...technologyPrerequisites(rockets.lines, 15583)].sort(), [15562, 15568, 15573, 15578, 15583]);
// Selecting a merge keeps both required parent routes; cycles cannot recurse forever.
assert.deepEqual([...technologyPrerequisites(rockets.lines, 15582)].sort(), [15562, 15567, 15568, 15573, 15577, 15582]);
assert.deepEqual([...technologyPrerequisites([{ from: 1, to: 2 }, { from: 2, to: 1 }], 1)].sort(), [1, 2]);
console.log(JSON.stringify({ blocks: data.blocks.length, lineCount, correctedPaths: changedCount, selections: selectionCount, rocketIII: "no sibling spur, no diagonal/backtracking, native prerequisites preserved" }));
