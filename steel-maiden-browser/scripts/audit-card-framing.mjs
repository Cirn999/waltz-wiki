import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import nativeFraming from "../public/data/card-framing.json" with { type: "json" };

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const targetRows = data.rows.filter((row) => /300轻型|122三液|虎式B型.*105|T84 HMC/u.test(row.tank));
console.log(JSON.stringify(targetRows.map(({ id, tank, person, image, modelId }) => ({ id, tank, person, image, modelId })), null, 2));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const shell = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()[0];
const browser = await chromium.launch({ headless: true, executablePath: path.join(browserRoot, shell, "chrome-headless-shell-win64/chrome-headless-shell.exe") });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const url = process.argv[2] || "http://127.0.0.1:3173";
const review = process.argv.includes("--review");
const changed = process.argv.includes("--changed");
try {
  await fs.mkdir(path.join(root, ".cache/card-framing"), { recursive: true });
  await page.goto(url, { waitUntil: "networkidle" });
  const group = page.locator(".primary-nav-group").filter({ has: page.getByRole("button", { name: "钢舞姬", exact: true }) });
  await group.locator(".primary-nav-trigger").click();
  await group.getByRole("menuitem", { name: /卡牌图鉴/ }).click();
  await page.getByRole("button", { name: /筛选条件/ }).click();
  const dialog = page.getByRole("dialog", { name: "钢舞姬筛选", exact: true });
  await dialog.getByRole("button", { name: "显示未实装", exact: true }).click();
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  while (await page.getByRole("button", { name: /继续载入/ }).count()) await page.getByRole("button", { name: /继续载入/ }).click();
  const originals = await page.locator(".atlas-album").evaluate((album) => album.outerHTML);
  // A visual audit sheet of the real rendered cards, with identifiers outside
  // the face. This changes only the test page, not production layout or assets.
  await page.evaluate(({ markup, rows }) => {
    document.body.innerHTML = `<main id="framing-review">${markup}</main>`;
    const style = document.createElement("style");
    style.textContent = 'body{margin:0;background:#f1f3eb!important}#framing-review{padding:8px}.atlas-album{grid-template-columns:repeat(8,minmax(0,1fr));gap:12px 8px;padding:8px}.atlas-entry{display:block}.review-label{display:block;color:#14251d;font:12px Arial;text-align:center;margin-top:3px}';
    document.head.append(style);
    const byId = new Map(rows.map((row) => [row.id, row]));
    document.querySelectorAll(".atlas-entry").forEach((entry) => {
      const row = byId.get(Number(entry.dataset.maidenId));
      const label = document.createElement("span"); label.className = "review-label";
      label.textContent = `${row.id} ${row.tank}`; entry.append(label);
      entry.querySelectorAll("img").forEach((image) => image.loading = "eager");
    });
  }, { markup: originals, rows: data.rows.map(({ id, tank }) => ({ id, tank })) });
  const all = await page.locator(".atlas-entry").evaluateAll((entries) => entries.map((entry) => ({ id: Number(entry.dataset.maidenId), html: entry.outerHTML })));
  const reviewed = changed ? all.filter((entry) => nativeFraming.rows[entry.id]) : all;
  const sheets = review || changed ? Array.from({ length: Math.ceil(reviewed.length / 48) }, (_, index) => reviewed.slice(index * 48, (index + 1) * 48)) : [all.filter((entry) => targetRows.some((row) => row.id === entry.id))];
  for (let index = 0; index < sheets.length; index++) {
    await page.locator(".atlas-album").evaluate((album, entries) => album.innerHTML = entries.map((entry) => entry.html).join(""), sheets[index]);
    if (!review && !changed) await page.addStyleTag({ content: '.atlas-album{grid-template-columns:repeat(4,minmax(0,1fr));max-width:1280px;margin:auto}' });
    await page.locator(".atlas-album").evaluate(async (album) => { await Promise.all([...album.querySelectorAll("img")].map((image) => image.decode().catch(() => {}))); });
    const broken = await page.locator(".atlas-hero").evaluateAll((images) => images.filter((image) => !image.naturalWidth).map((image) => image.getAttribute("src")));
    if (broken.length) console.log(JSON.stringify({ sheet: index + 1, broken }));
    await page.locator("#framing-review").screenshot({ path: path.join(root, `.cache/card-framing/${changed ? `native-${index + 1}` : review ? `native-sheet-${String(index + 1).padStart(2, "0")}` : "native-targets"}.png`) });
  }
  console.log(JSON.stringify({ cards: all.length, sheets: sheets.length, output: path.join(root, ".cache/card-framing") }));
} finally { await browser.close(); }
