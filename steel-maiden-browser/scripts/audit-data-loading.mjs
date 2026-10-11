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
try {
  const page = await browser.newPage();
  const maidenUrl = "**/data/maidens.json";
  await page.route(maidenUrl, (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "数据加载失败" }).waitFor();
  if (!(await page.locator(".loading-error p").innerText()).includes("HTTP 503")) throw new Error("HTTP failure was not explained");
  await page.unroute(maidenUrl);
  await page.getByRole("button", { name: "重试加载" }).click();
  await page.locator(".table-archive").waitFor();

  const technologyUrl = "**/data/technology-catalog.json";
  await page.route(technologyUrl, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "数据加载失败" }).waitFor();
  if (!(await page.locator(".loading-error p").innerText()).includes("数据结构不符合预期")) throw new Error("Invalid JSON shape was not explained");
  await page.unroute(technologyUrl);
  await page.getByRole("button", { name: "重试加载" }).click();
  await page.locator(".table-archive").waitFor();
  console.log("Data loading, HTTP failure, invalid shape, and retry all passed.");
} finally {
  await browser.close();
}
