import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(baseUrl, { waitUntil: "networkidle" });

const row = page.locator(".maiden-table tbody tr").filter({ hasText: "缪" }).first();
await row.waitFor();
await row.locator(".table-avatar").click();

const card = page.locator(".detail-modal .ammo-card").filter({ hasText: "尾翼蜂巢型火箭弹(中口径)" });
await card.waitFor();
const titles = await card.locator(".ammo-stats > span").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")));
const expected = ["火力 1500", "穿甲 460", "命中 185", "射程 11000"];
if (JSON.stringify(titles) !== JSON.stringify(expected)) {
  throw new Error(`弹药卡片属性不符：${JSON.stringify(titles)}`);
}
const text = await card.innerText();
for (const forbidden of ["耐久", "装甲", "回避", "隐蔽", "侦查", "点燃", "装备后面板"]) {
  if (text.includes(forbidden)) throw new Error(`弹药卡片仍含有错误字段：${forbidden}`);
}

await page.locator(".detail-modal .modal-close").click();
const losatRow = page.locator(".maiden-table tbody tr").filter({ hasText: "LOSAT" }).first();
await losatRow.locator(".table-avatar").click();
const secondaryCard = page.locator(".detail-modal .ammo-card").filter({ hasText: "冲压动能尾翼脱壳弹(中口径)" });
await secondaryCard.waitFor();
const secondaryTitles = await secondaryCard.locator(".ammo-stats > span").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("title")));
const expectedSecondary = ["火力 415", "穿甲 765", "命中 75", "射程 5240", "隐蔽 95"];
if (JSON.stringify(secondaryTitles) !== JSON.stringify(expectedSecondary)) {
  throw new Error(`弹药附属属性不符：${JSON.stringify(secondaryTitles)}`);
}

console.log(JSON.stringify({
  primary: { card: "缪 / 尾翼蜂巢型火箭弹(中口径)", titles },
  secondary: { card: "LOSAT / 冲压动能尾翼脱壳弹(中口径)", titles: secondaryTitles },
}, null, 2));
await browser.close();
