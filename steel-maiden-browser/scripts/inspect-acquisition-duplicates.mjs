import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const source = JSON.parse(await fs.readFile(path.join(root, "../analysis_apk/output/acquisition_analysis_v2_outfits/acquisition_paths_preliminary.json"), "utf8"));
const maiden = data.rows.find((row) => row.tank === "野牛II");
console.log(JSON.stringify({ maiden: { id: maiden.id, routes: maiden.acquisition }, source: source.cards.find((row) => Number(row.cardId) === maiden.id)?.routes.shop }, null, 2));
const pairs = new Map();
for (const row of data.rows) {
  for (let i = 0; i < row.acquisition.length; i += 1) {
    for (let j = i + 1; j < row.acquisition.length; j += 1) {
      const a = row.acquisition[i], b = row.acquisition[j];
      const shared = a.details.filter((detail) => b.details.includes(detail));
      if (!shared.length) continue;
      const key = `${a.label} / ${b.label}`;
      const group = pairs.get(key) ?? [];
      group.push({ id: row.id, tank: row.tank, shared });
      pairs.set(key, group);
    }
  }
}
console.log(JSON.stringify([...pairs].map(([pair, rows]) => ({ pair, count: rows.length, examples: rows.slice(0, 10) })), null, 2));
for (const group of pairs.values()) {
  const example = group.find((row) => row.id !== maiden.id);
  if (example) console.log(JSON.stringify({ tank: example.tank, shops: source.cards.find((row) => Number(row.cardId) === example.id)?.routes.shop.filter((row) => row.shopName !== "内部测试") }, null, 2));
}
const duplicateOffers = new Map();
for (const card of source.cards) {
  const shops = (card.routes.shop ?? []).filter((row) => row.shopName !== "内部测试");
  for (let i = 0; i < shops.length; i += 1) {
    for (let j = i + 1; j < shops.length; j += 1) {
      const a = shops[i], b = shops[j];
      if (a.shopName === b.shopName || !a.commodityId || a.commodityId !== b.commodityId || a.produceRuleId !== b.produceRuleId) continue;
      const key = [a.shopName, b.shopName].sort().join(" / ");
      const group = duplicateOffers.get(key) ?? new Set();
      group.add(card.cardId);
      duplicateOffers.set(key, group);
    }
  }
}
console.log("shared native offer IDs", JSON.stringify([...duplicateOffers].map(([pair, ids]) => ({ pair, cards: ids.size, ids: [...ids].slice(0, 12) })), null, 2));
for (const id of [6119, 6203]) console.log(JSON.stringify({ maiden: data.rows.find((row) => row.id === id)?.acquisition, shops: source.cards.find((row) => Number(row.cardId) === id)?.routes.shop.filter((row) => row.shopName !== "内部测试") }, null, 2));
