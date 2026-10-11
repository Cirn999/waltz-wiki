import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const data = JSON.parse(await fs.readFile(new URL("../public/data/equipment-catalog.json", import.meta.url), "utf8"));
const baseUrl = process.argv[2] || "http://localhost:3100";
const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(root)).filter((name) => name.startsWith("chromium_headless_shell-"))
  .sort().reverse().map((name) => path.join(root, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const cases = [
  { name: "灭火器", slotTag: 453, key: "fireproof", label: "阻燃", value: 2 },
  { name: "燃油清滤器", slotTag: 453, key: "homogeneity", label: "均质度", value: 7 },
  { name: "增固护板", slotTag: 452, key: "coverage", label: "覆盖度", value: 4 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".primary-navigation .primary-nav-direct").filter({ hasText: "装备" }).click();
  await page.locator(".equipment-atlas").waitFor();

  const checked = [];
  for (const testCase of cases) {
    const slot = data.slots.find((item) => item.tag === testCase.slotTag);
    const family = data.families.find((item) => item.name === testCase.name && item.slotTag === testCase.slotTag);
    assert(slot && family, `${testCase.name}: fixture missing`);
    assert.equal(family.levels.find((level) => level.level === 1)?.hiddenStats[testCase.key], testCase.value);
    await page.locator(".equipment-slot-picker").getByRole("button", { name: slot.name, exact: true }).click();
    await page.locator(".equipment-family-grid button").filter({ hasText: testCase.name }).first().click();
    await page.locator(".equipment-detail-header h3").filter({ hasText: testCase.name }).waitFor();
    const row = page.locator(".equipment-level-table tbody tr").first();
    const chip = row.locator(".equipment-hidden-stat").filter({ hasText: testCase.label });
    assert.equal(await chip.count(), 1, `${testCase.name}: hidden stat chip missing`);
    assert.match((await chip.innerText()).replace(/\s+/g, " "), new RegExp(`${testCase.label} \\+${testCase.value}`));
    checked.push({ equipment: testCase.name, level: "S1", attribute: testCase.label, value: testCase.value });
  }

  await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  const screenshotPath = fileURLToPath(new URL("../.cache/equipment-hidden-stats.png", import.meta.url));
  await page.locator(".equipment-detail").screenshot({ path: screenshotPath });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checked, screenshotPath, errors }));
} finally {
  await browser.close();
}
