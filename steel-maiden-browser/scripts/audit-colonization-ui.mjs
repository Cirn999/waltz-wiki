import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "colonization-catalog.json"), "utf8"));
const maidens = JSON.parse(await fs.readFile(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
const maiden = maidens.rows.find((row) => row.tank === "T39");
if (!maiden) throw new Error("T39 fixture missing");
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill("T39");
  await page.locator(".search-box button").click();
  await page.locator("tbody tr[data-maiden-id]").first().waitFor();
  await page.locator(".table-avatar").first().click();
  const detail = page.locator(".detail-modal");
  const cards = detail.locator(".colonization-stat-card");
  if (await cards.count() !== 6) throw new Error(`Expected six independent colonization controls, got ${await cards.count()}`);
  if (await detail.locator(".colonization-table-wrap").count()) throw new Error("Old colonization table still present");
  if (await cards.getByRole("button", { name: "确定" }).count()) throw new Error("Colonization confirm buttons are still present");
  const durability = cards.first();
  const power = cards.nth(1);
  const curve = catalog.rows[String(maiden.id)];
  if (!curve) throw new Error("T39 colonization data missing");
  await durability.getByRole("button", { name: "耐久强殖等级加一" }).click();
  if (!(await durability.locator(".colonization-stat-value").innerText()).includes(`（+${curve.durability[0]}）`)) throw new Error("Increment did not show level-one durability bonus");
  await durability.locator("input").fill("12");
  await durability.locator("input").press("Tab");
  if (!(await durability.locator(".colonization-stat-value").innerText()).includes(`（+${curve.durability[11]}）`)) throw new Error("Direct input did not show level-12 durability bonus");
  await power.locator("input").fill("2");
  await power.locator("input").press("Enter");
  if (!(await power.locator(".colonization-stat-value").innerText()).includes(`（+${curve.power[1]}）`)) throw new Error("Enter did not apply power level independently");
  if (await durability.locator("input").inputValue() !== "12") throw new Error("Power control changed the durability level");
  await fs.mkdir(path.join(appRoot, ".cache"), { recursive: true });
  const screenshotPath = path.join(appRoot, ".cache", "colonization-t39-audit.png");
  await detail.locator(".detail-stat-grid").screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ maiden: maiden.tank, durabilityLevel12: curve.durability[11], powerLevel2: curve.power[1], screenshotPath }, null, 2));
} finally {
  await browser.close();
}
