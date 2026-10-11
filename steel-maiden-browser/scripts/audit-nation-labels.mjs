import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:4173";
const dataset = JSON.parse(await readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const researchDataset = JSON.parse(await readFile(new URL("../public/data/research-tree.json", import.meta.url), "utf8"));
const aliases = new Map([
  ["架空/特殊阵营", "旅行者"],
  ["架空阵营A", "战车兽"],
]);
const samples = [...aliases].map(([raw, label]) => {
  const maiden = dataset.rows.find((row) => row.nation === raw);
  if (!maiden) throw new Error(`missing nation sample: ${raw}`);
  return { raw, label, maiden };
});
const researchSamples = samples.filter(({ raw }) => researchDataset.nodes.some((node) => node.nation === raw));

const browser = await chromium.launch({
  headless: true,
  executablePath: process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const tableText = (await page.locator(".maiden-table").allInnerTexts()).join("\n");
for (const { raw, label, maiden } of samples) {
  const row = page.locator(`.maiden-table tbody tr[data-maiden-id="${maiden.id}"]`);
  const tableNation = (await row.locator(".game-icon-nation b").textContent() ?? "").trim();
  if (tableNation !== label) throw new Error(`table label mismatch for ${maiden.tank}: ${tableNation}`);
  await row.locator(".table-avatar").click();
  const detailNation = (await page.locator(".detail-modal .game-icon-nation b").innerText()).trim();
  if (detailNation !== label) throw new Error(`detail label mismatch for ${maiden.tank}: ${detailNation}`);
  await page.getByRole("button", { name: "关闭" }).click();
  if (tableText.includes(raw)) throw new Error(`raw nation label remains in table: ${raw}`);
}

await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
await page.getByRole("menuitem", { name: /研发配方/ }).click();
await page.locator(".research-archive").waitFor();
for (const { raw, label } of researchSamples) {
  const search = page.locator(".research-search input");
  await search.fill(label);
  const firstResult = page.locator(".research-index > button").first();
  await firstResult.waitFor();
  await firstResult.click();
  const researchMeta = (await page.locator(".research-focus-title p").innerText()).trim();
  if (!researchMeta.includes(label) || researchMeta.includes(raw)) throw new Error(`research label mismatch: ${researchMeta}`);
}

await browser.close();
console.log(JSON.stringify({ samples: samples.map(({ raw, label, maiden }) => ({ raw, label, id: maiden.id, tank: maiden.tank })), researchSamples: researchSamples.map(({ raw, label }) => ({ raw, label })) }, null, 2));
