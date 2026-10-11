import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/technology-catalog.json"), "utf8"));
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ executablePath });
const reports = [];
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.argv[2] || "http://localhost:3100", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "科技", exact: true }).click();
  const openBlock = async (id) => {
    const block = data.blocks.find((block) => block.id === id);
    await page.locator(".technology-primary-tabs button").filter({ hasText: block.category }).click();
    await page.locator(".technology-secondary-panel").getByRole("button", { name: block.secondary, exact: true }).click();
    await page.locator(".technology-generation-tabs button").nth(block.generation - 1).click();
    assert.equal(await page.locator(".technology-node.active").count(), 0);
    assert.equal(await page.locator("[data-technology-lines=active] path").count(), 0);
    return block;
  };
  const verifySelection = async (block, tag) => {
    await page.locator(`[data-technology-tag="${tag}"]`).click();
    const expected = new Set([tag]);
    const pending = [tag];
    while (pending.length) {
      const target = pending.pop();
      for (const line of block.lines) if (line.to === target && !expected.has(line.from)) { expected.add(line.from); pending.push(line.from); }
    }
    assert.deepEqual((await page.locator(".technology-node.active").evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.technologyTag)))).sort(), [...expected].sort());
    const lines = await page.locator(".technology-tree svg path[data-line-from]").evaluateAll((paths) => paths.map((line) => ({
      from: Number(line.dataset.lineFrom), to: Number(line.dataset.lineTo), d: line.getAttribute("d"), active: line.classList.contains("active"), layer: line.parentElement.dataset.technologyLines,
    })));
    assert.equal(lines.filter((line) => line.layer === "base").length, block.lines.length);
    const active = lines.filter((line) => line.active);
    assert.deepEqual(active.map((line) => `${line.from}-${line.to}`).sort(), block.lines.filter((line) => expected.has(line.from) && expected.has(line.to)).map((line) => `${line.from}-${line.to}`).sort());
    assert.equal(await page.locator(".technology-tree svg > g").last().getAttribute("data-technology-lines"), "active");
    for (const line of lines) {
      const numbers = line.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const points = [];
      for (let i = 0; i < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        assert.ok((a[0] === b[0]) !== (a[1] === b[1]), `${block.id} ${line.from}-${line.to}: diagonal or duplicate`);
        assert.ok(b[0] >= a[0], "path must not turn backwards");
        assert.ok(b[1] >= Math.min(points[0][1], points.at(-1)[1]) && b[1] <= Math.max(points[0][1], points.at(-1)[1]), "path must not extend into sibling branches");
      }
    }
    reports.push({ block: block.id, tag, activeNodes: expected.size, activeLines: active.length });
    return lines;
  };
  const rockets = await openBlock("火箭弹-3");
  const selectedLines = await verifySelection(rockets, 15583);
  assert.equal(selectedLines.find((line) => line.active && line.from === 15573 && line.to === 15578).d, "M 416 348 L 500 348 L 500 440 L 584 440");
  assert.equal(selectedLines.find((line) => line.active && line.from === 15578 && line.to === 15583).d, "M 584 440 L 668 440 L 668 348 L 752 348");
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await page.locator(".technology-tree-card").screenshot({ path: path.join(root, ".cache/technology-rocket-paths-fixed.png") });
  // Re-selecting still opens the existing detail dialog.
  await page.locator('[data-technology-tag="15583"]').click();
  await page.getByRole("dialog").filter({ has: page.locator("h2", { hasText: "低压尾翼制导火箭弹" }) }).waitFor();
  await page.locator(".technology-detail-dialog .modal-close").click();
  for (const tag of [15577, 15582, 15588, 15562]) await verifySelection(rockets, tag);
  for (const [id, tag] of [["常规弹-3", 15179], ["脱壳弹-3", 15372], ["航空火箭弹-2", 16738], ["轻薄防护-3", 18382], ["综合车身-3", 17087], ["综合引擎-3", 16076], ["航空引擎-2", 16148]]) {
    await verifySelection(await openBlock(id), tag);
  }
  await page.setViewportSize({ width: 390, height: 700 });
  await verifySelection(await openBlock("火箭弹-3"), 15583);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ selections: reports, screenshot: ".cache/technology-rocket-paths-fixed.png", pageErrors: errors }, null, 2));
} finally { await browser.close(); }
