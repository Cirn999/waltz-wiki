import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const researchData = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "research-tree.json"), "utf8"));
const candidate = researchData.nodes.find((node) => node.upstreamRecipeIds.length > 0 && node.downstream.length > 0);
if (!candidate) throw new Error("No steel maiden with both upstream and downstream research relations");

const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort()
  .reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const researchNav = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await researchNav.locator(".primary-nav-trigger").click();
  await researchNav.getByRole("menuitem", { name: /研发路线/ }).click();
  await page.locator(".chain-search input").fill(String(candidate.id));
  await page.locator(".chain-search button").click();
  const summary = page.locator(".chain-summary");
  await summary.waitFor();
  const count = async () => ({ groups: await page.locator(".chain-flow .chain-group").count(), edges: await page.locator(".chain-flow .chain-link").count() });
  const both = await count();
  const direction = summary.getByRole("group", { name: "研发关系查看方向" });
  if ((await direction.getByRole("button", { name: "上下都看" }).getAttribute("aria-pressed")) !== "true") throw new Error("Both directions should be selected by default");

  await direction.getByRole("button", { name: "只看向上" }).click();
  const upstream = await count();
  if (!upstream.groups || upstream.groups >= both.groups || upstream.edges >= both.edges) throw new Error(`Upstream view did not narrow the graph: ${JSON.stringify({ both, upstream })}`);
  await page.locator(".chain-flow .chain-group .chain-members button").first().click();
  await summary.getByRole("button", { name: "只看高亮路线" }).click();
  if ((await summary.getByRole("button", { name: "恢复全部容器" }).count()) !== 1) throw new Error("Highlight-only toggle is unavailable in upstream mode");
  const upstreamIsolated = await count();
  if (upstreamIsolated.groups > upstream.groups || upstreamIsolated.edges > upstream.edges) throw new Error("Highlight-only expanded the upstream graph");

  await direction.getByRole("button", { name: "只看向下" }).click();
  const downstream = await count();
  if (!downstream.groups || downstream.groups >= both.groups || downstream.edges >= both.edges) throw new Error(`Downstream view did not narrow the graph: ${JSON.stringify({ both, downstream })}`);
  await page.locator(".chain-flow .chain-group .chain-members button").first().click();
  if ((await summary.getByRole("button", { name: "恢复全部容器" }).count()) !== 1) throw new Error("Highlight-only toggle is unavailable in downstream mode");
  const downstreamIsolated = await count();
  if (downstreamIsolated.groups > downstream.groups || downstreamIsolated.edges > downstream.edges) throw new Error("Highlight-only expanded the downstream graph");

  await direction.getByRole("button", { name: "上下都看" }).click();
  if ((await direction.getByRole("button", { name: "上下都看" }).getAttribute("aria-pressed")) !== "true") throw new Error("Could not restore both directions");
  console.log(JSON.stringify({ candidate: `${candidate.tank} #${candidate.id}`, both, upstream, upstreamIsolated, downstream, downstreamIsolated }, null, 2));
} finally {
  await browser.close();
}
