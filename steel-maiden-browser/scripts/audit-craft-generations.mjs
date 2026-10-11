import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const catalog = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
const categories = ["engineOptions", "bodyOptions", "armorOptions"];
const maiden = catalog.rows.find((row) => categories.every((key) => [1, 2, 3].every((rank) => row[key].some((option) => option.rank === rank))));
if (!maiden) throw new Error("No maiden has first-, second-, and third-generation engine, body, and armor crafts");

const playwrightRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(playwrightRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"))
  .map((entry) => path.join(playwrightRoot, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
  .sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".search-box input").fill(maiden.tank);
  await page.locator(".search-box button").click();
  await page.locator(`tbody tr[data-maiden-id="${maiden.id}"] .table-avatar`).click();
  const groups = page.locator(".detail-modal .craft-type-group");
  if (await groups.count() !== 3) throw new Error("Detail view must contain engine, body, and armor craft groups");
  const switcherLayout = await groups.first().evaluate((group) => {
    const title = group.querySelector(":scope > header > strong");
    const switcher = group.querySelector(":scope > header > .technology-generation-tabs");
    return { gap: switcher.getBoundingClientRect().left - title.getBoundingClientRect().right, background: getComputedStyle(switcher).backgroundColor };
  });
  if (switcherLayout.gap < 0 || switcherLayout.gap > 16) throw new Error("Craft generation icons are not beside the group title");
  if (switcherLayout.background !== "rgba(0, 0, 0, 0)") throw new Error("Craft generation icons still have a background panel");
  const iconSizes = await groups.first().locator(".technology-generation-tabs img").evaluateAll((images) => images.map((image) => ({ width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height })));
  if (iconSizes.some((size) => Math.abs(size.width - iconSizes[0].width) > 0.1)) throw new Error(`Craft generation icons do not have equal widths: ${JSON.stringify(iconSizes)}`);
  if (new Set(iconSizes.map((size) => Math.round(size.height))).size === 1) throw new Error(`Craft generation icons still force every sprite to the same height: ${JSON.stringify(iconSizes)}`);
  const thirdIconFit = await groups.first().locator(".technology-generation-tabs button").nth(2).evaluate((button) => {
    const style = getComputedStyle(button);
    const inset = [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth].reduce((sum, value) => sum + parseFloat(value), 0);
    return { imageHeight: button.querySelector("img").getBoundingClientRect().height, contentHeight: button.getBoundingClientRect().height - inset };
  });
  if (Math.abs(thirdIconFit.imageHeight - thirdIconFit.contentHeight) > 1.5) throw new Error(`Third craft generation icon does not fit its button cell: ${JSON.stringify(thirdIconFit)}`);

  for (let index = 0; index < 3; index++) {
    const group = groups.nth(index);
    const category = categories[index];
    const label = ["引擎", "车体", "装甲"][index];
    for (const rank of [3, 1, 2]) {
      if (rank !== 3) await group.getByRole("button", { name: `${label}期数：${rank}期` }).click();
      const expected = maiden[category].filter((option) => option.rank === rank);
      const cards = group.locator(".craft-card");
      if (await cards.count() !== expected.length) throw new Error(`${label} ${rank}期 card count is incorrect`);
      const actualRanks = await group.locator(".ammo-rank").allTextContents();
      if (actualRanks.some((value) => value.trim() !== String(rank))) throw new Error(`${label} ${rank}期 shows another generation`);
      const selected = group.getByRole("button", { name: `${label}期数：${rank}期` });
      if (await selected.getAttribute("aria-pressed") !== "true") throw new Error(`${label} ${rank}期 icon is not active`);
    }
  }
  console.log(`Craft generations work for ${maiden.tank} (#${maiden.id}): default 3期; independent engine/body/armor switching to 1期 and 2期.`);
} finally {
  await browser.close();
}
