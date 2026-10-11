import fs from "node:fs/promises";
const data = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
for (const [stage, vehicles] of Object.entries(data.magicProgression.progression)) {
  for (const [vehicle, kinds] of Object.entries(vehicles)) {
    for (const [kind, paths] of Object.entries(kinds)) {
      console.log(stage, vehicle, kind, paths.map((p) => ({
        selector: p.selectorId,
        cards: data.rows.filter((r) => r.magicSelectors[kind] === p.selectorId).length,
        level1: p.levels[0].materials.map((m) => `${m.name}:${m.amount}`).join(" / "),
        total: p.levels.reduce((sum, l) => sum + l.materials.reduce((s, m) => s + m.amount, 0), 0),
      })));
    }
  }
}
console.log("Selector pairs", [...Map.groupBy(data.rows, (r) => `${r.stage} ${r.magicSelectors.ordnance} ${r.magicSelectors.tactics}`)].map(([pair, rows]) => ({ pair, count: rows.length, example: rows[0].tank })));
