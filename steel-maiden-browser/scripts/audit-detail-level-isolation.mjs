import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const heading = page.locator(".table-archive h2");
  const firstRow = page.locator("tbody tr[data-maiden-id]").first();
  await firstRow.waitFor();
  const originalId = await firstRow.getAttribute("data-maiden-id");
  if (!(await heading.innerText()).includes("1级")) throw new Error("Attribute table did not start at level 1");
  await firstRow.locator(".table-avatar").click();
  const detail = page.locator(".detail-modal");
  await detail.locator(".detail-level-marks button", { hasText: "60级" }).click();
  if (!(await detail.locator(".detail-toolbar h3").innerText()).includes("60级")) throw new Error("Detail level did not change to 60");
  if (!(await heading.innerText()).includes("1级") || await firstRow.getAttribute("data-maiden-id") !== originalId) throw new Error("Detail level changed background table");
  await detail.locator(".modal-close").click();
  if (!(await heading.innerText()).includes("1级")) throw new Error("Closing detail changed table level");
  await page.locator(".control-panel .level-picker button", { hasText: "90级" }).click();
  if (!(await heading.innerText()).includes("90级")) throw new Error("Attribute table cannot switch independently");
  await page.locator("tbody tr[data-maiden-id] .table-avatar").first().click();
  if (!(await detail.locator(".detail-toolbar h3").innerText()).includes("90级")) throw new Error("Detail did not inherit current table level when opened");
  await detail.locator(".detail-level-marks button", { hasText: "99级" }).click();
  if (!(await heading.innerText()).includes("90级")) throw new Error("Second detail level change affected background table");
  console.log("Detail level is independent; opening inherits table level and switching leaves table unchanged.");
} finally {
  await browser.close();
}
