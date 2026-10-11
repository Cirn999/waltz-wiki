import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "technology-catalog.json"), "utf8"));
const expected = {
  主炮: ["航空常规弹", "航空火箭弹"],
  防护: ["航空防护"],
  车体: ["航空机身"],
  引擎: ["航空引擎"],
};
const summary = [];
for (const [category, branches] of Object.entries(expected)) {
  const listed = catalog.categories.find((item) => item.name === category)?.secondary ?? [];
  for (const secondary of branches) {
    if (!listed.includes(secondary)) throw new Error(`${category} is missing ${secondary}`);
    const blocks = catalog.blocks.filter((item) => item.category === category && item.secondary === secondary);
    if (blocks.length !== 3 || blocks.some((block) => block.levels.length !== 16)) throw new Error(`${secondary} needs three 16-level generations`);
    for (const block of blocks) {
      if (!block.nodes.length || !block.lines.length) throw new Error(`${block.id} has no technology tree`);
      for (const node of block.nodes) {
        if (!node.image) throw new Error(`${block.id}:${node.name} has no icon`);
        await fs.access(path.join(appRoot, "public", node.image.replace(/^\//, "")));
        if (!node.stats.length) throw new Error(`${block.id}:${node.name} has no client panel stats`);
      }
      if (block.levels.some((level) => !level.ruleId || !level.cost.length || !level.cumulativeCost.length)) throw new Error(`${block.id} is missing research costs`);
    }
    summary.push({ category, secondary, nodes: blocks.map((block) => block.nodes.length), levels: blocks.map((block) => block.levels.length) });
  }
}
for (const block of catalog.blocks.filter((item) => item.category === "车体" || item.category === "引擎")) {
  const heading = block.category === "车体" ? "命中" : "回避";
  if (block.levels.some((level) => level.attributes[0]?.name !== heading)) {
    throw new Error(`${block.id} growth heading should be ${heading}`);
  }
}
console.log(JSON.stringify(summary, null, 2));
