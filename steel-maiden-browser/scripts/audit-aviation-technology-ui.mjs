import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "technology-catalog.json"), "utf8"));
const branches = [
  ["主炮", "航空常规弹"], ["主炮", "航空火箭弹"],
  ["防护", "航空防护"], ["车体", "航空机身"], ["引擎", "航空引擎"],
];
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "科技", exact: true }).click();
  await page.locator(".technology-archive").waitFor();
  const result = [];
  for (const [category, secondary] of branches) {
    await page.locator(".technology-primary-tabs button").filter({ hasText: category }).click();
    await page.locator(".technology-secondary-panel").getByRole("button", { name: secondary, exact: true }).click();
    for (const generation of [1, 2, 3]) {
      await page.locator(".technology-generation-tabs button").nth(generation - 1).click();
      const block = catalog.blocks.find((item) => item.category === category && item.secondary === secondary && item.generation === generation);
      if (!block) throw new Error(`Missing ${secondary} generation ${generation}`);
      const nodes = page.locator(".technology-node");
      if (await nodes.count() !== block.nodes.length) throw new Error(`${block.id} node count mismatch`);
      if (await page.locator(".technology-level-table-wrap tbody tr").count() !== 16) throw new Error(`${block.id} does not show all levels`);
      await page.waitForFunction(() => [...document.querySelectorAll(".technology-node img")].every((image) => image.complete && image.naturalWidth > 0));
      if (generation === 1) {
        await nodes.first().click();
        await nodes.first().click();
        const dialog = page.locator(".technology-detail-dialog");
        await dialog.waitFor();
        if (!await dialog.locator(".technology-detail-stats strong").count()) throw new Error(`${block.id} detail has no stats`);
        if (!await dialog.locator(".technology-cost-list strong").count()) throw new Error(`${block.id} detail has no material cost`);
        await dialog.locator(".modal-close").click();
      }
      result.push({ secondary, generation, nodes: block.nodes.length });
    }
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
