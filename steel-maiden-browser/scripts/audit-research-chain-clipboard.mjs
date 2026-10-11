import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const researchData = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "research-tree.json"), "utf8"));
const candidate = researchData.nodes.find((node) => node.upstreamRecipeIds.length > 0 && node.downstream.length > 0);
if (!candidate) throw new Error("No research-chain test candidate found");

const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  let downloadCount = 0;
  page.on("download", () => { downloadCount += 1; });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const researchNav = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await researchNav.locator(".primary-nav-trigger").click();
  await researchNav.getByRole("menuitem", { name: /研发路线/ }).click();
  await page.locator(".chain-search input").fill(String(candidate.id));
  await page.locator(".chain-search button").click();
  const summary = page.locator(".chain-summary");
  await summary.getByRole("button", { name: "只看向上" }).click();
  await page.locator(".chain-flow .chain-group .chain-members button").first().click();
  await summary.getByRole("button", { name: "只看高亮路线" }).click();
  await summary.getByRole("button", { name: "复制分享图" }).click();
  await summary.locator(".chain-export-notice").getByText("已复制到剪贴板").waitFor({ timeout: 30_000 });
  const image = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const png = items.find((item) => item.types.includes("image/png"));
    if (!png) return null;
    const blob = await png.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const result = { type: blob.type, bytes: blob.size, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  });
  if (!image || image.type !== "image/png" || image.bytes < 1000 || image.width < 100 || image.height < 100) throw new Error(`Clipboard PNG is invalid: ${JSON.stringify(image)}`);
  if (downloadCount) throw new Error(`Unexpected download count: ${downloadCount}`);
  console.log(JSON.stringify({ candidate: `${candidate.tank} #${candidate.id}`, image, downloadCount }, null, 2));
} finally {
  await browser.close();
}
