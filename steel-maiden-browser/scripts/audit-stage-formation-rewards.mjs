import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(root, "public/data/stage-catalog.json"), "utf8"));
const expected = [
  [[3101, 6]], [[3102, 6]], [[3103, 6]], [[3104, 6]], [[3105, 6]], [[3106, 5]],
  [[3002, 12]], [[3003, 12]], [[3004, 12]], [[3001, 12]],
  [[3201, 300]], [[3202, 300]], [[3203, 300]],
  [[3105, 6], [4418, 3]], [[3106, 5], [4418, 3]],
  [[3304, 2], [4418, 3]], [[3304, 2], [4418, 3]], [[9, 2]], [[9, 2]], [[12, 2]],
];
const raid = (number) => data.maps.find((m) => m.mode === `VOL_EXPANSION_${String(number).padStart(2, "0")}`);
assert.deepEqual(data.meta.requirements.formationRewards, { checked: { assault: 40, air: 40 }, withReward: { assault: 20 } });
assert.equal(data.maps.filter((m) => m.formationReward).length, 20);
for (let n = 1; n <= 40; n++) {
  const map = raid(n);
  if (n <= 20) { assert.equal(map.formationReward, undefined); continue; }
  const bonus = map.formationReward;
  assert.equal(bonus.grade, "S");
  assert.equal(bonus.requirements.length, 3);
  assert.deepEqual(bonus.rewards.map((r) => [r.fundId, r.amount]), expected[n - 21]);
  assert.ok(bonus.requirements.every((r) => !map.requirements.some((entry) => entry.key === r.key)), "Bonus predicates are not entry restrictions");
  for (const image of [...bonus.rewards.map((r) => r.image), ...bonus.requirements.flatMap((r) => r.parts.flatMap((p) => p.image ? [p.image] : []))]) {
    assert.ok((await fs.stat(path.join(root, "public", image))).size > 0, image);
  }
}
assert.ok(data.maps.filter((m) => m.category === "air").every((m) => !m.formationReward));
assert.deepEqual(raid(21).formationReward.requirements.map((r) => r.text), ["全队的演艺才艺总合达到5", "全队的技工才艺总合达到4", "至少有1名类型为中坦的钢舞姬"]);
assert.ok(raid(34).formationReward.requirements.every((r) => r.text.includes("不超过1")), "Keep upper bounds; do not replace them with minimums");
assert.ok(raid(27).formationReward.requirements[0].text.includes("法国或日本"), "Keep OR nationality logic");

const browserRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse().map((n) => path.join(browserRoot, n, "chrome-headless-shell-win64", "chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(process.argv[2] || "http://127.0.0.1:56501", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "主要栏目" }).getByRole("button", { name: "关卡", exact: true }).click();
  await page.getByRole("menuitem", { name: /^关卡一览/ }).click();
  await page.getByRole("button", { name: "浏览突袭", exact: true }).click();
  const dialog = page.locator(".stage-dialog");
  for (const n of [21, 27, 34, 40, 20]) {
    await page.getByRole("button", { name: `查看地图 ${raid(n).name}`, exact: true }).click();
    const bonus = dialog.locator(".stage-formation-reward");
    assert.equal(await bonus.count(), n > 20 ? 1 : 0);
    if (n > 20) {
      assert.equal(await dialog.locator(".stage-entry-requirements>.stage-formation-reward").count(), 1);
      assert.match(await bonus.innerText(), /队形 S 奖励要求[\s\S]*非进图限制[\s\S]*本场战斗取得 S 评价[\s\S]*奖励内容/);
      assert.equal(await bonus.locator(".stage-formation-loot li").count(), expected[n - 21].length);
      if (n === 21) {
        const original = await bonus.innerText();
        for (const score of [51, 70, 92]) {
          await dialog.getByLabel("收益结算评价").selectOption(String(score));
          assert.equal(await bonus.innerText(), original, "Reward requirements stay S-only when previewing A/B income");
        }
      }
      await bonus.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
      for (const width of [1440, 1152, 390]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await bonus.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `No overflow: raid ${n} / ${width}px`);
        const layout = await bonus.locator(".stage-requirement-list").evaluate((el) => ({
          display: getComputedStyle(el).display, wrap: getComputedStyle(el).flexWrap,
          boxes: [...el.children].map((li) => { const r = li.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right }; }),
        }));
        assert.equal(layout.display, "flex", "Reuse the entry-requirement chip layout");
        assert.equal(layout.wrap, "wrap", "Wrap only when the available width is exhausted");
        if (width >= 1152) assert.ok(layout.boxes.every((box, i, boxes) => Math.abs(box.top - boxes[0].top) < 1 && (i === 0 || box.left > boxes[i - 1].right)), `Horizontal chips: raid ${n} / ${width}px`);
        if (n === 21 || n === 34) {
          await fs.mkdir(path.join(root, ".cache"), { recursive: true });
          await dialog.locator(".stage-entry-requirements").screenshot({ path: path.join(root, `.cache/stage-formation-${n}-${width}.png`) });
        }
      }
    }
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("button", { name: /返回关卡分类/ }).click();
  await page.getByRole("button", { name: "浏览空袭", exact: true }).click();
  await page.getByRole("button", { name: "查看地图 空袭21", exact: true }).click();
  assert.equal(await dialog.locator(".stage-formation-reward").count(), 0);
  assert.ok((await dialog.locator(".stage-requirement-list>li").count()) > 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checkedAssault: 40, checkedAir: 40, formationRewards: 20, screenshots: "desktop / 125%-equivalent / mobile" }, null, 2));
} finally { await browser.close(); }
