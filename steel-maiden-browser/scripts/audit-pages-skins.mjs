import assert from "node:assert/strict";
import fs from "node:fs/promises";

export async function auditPagesSkins(page, baseUrl) {
  const response = await page.request.get(new URL("data/maiden-skins.json", baseUrl).href);
  assert.equal(response.status(), 200);
  const { rows: skinRows } = await response.json();
  const { rows } = JSON.parse(await fs.readFile(new URL("../public/data/maidens.json", import.meta.url), "utf8"));
  const skins = Object.values(skinRows).flat();
  // Decode every skin and native portrait, including skins of unreleased cars.
  const assets = [...new Set(skins.flatMap((skin) => [skin.image, skin.headImage]).filter(Boolean))];
  const broken = await page.evaluate(async (assets) => {
    const queue = [...assets], broken = [];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const url = queue.shift();
        const image = new Image(); image.src = url;
        try { await image.decode(); if (!image.naturalWidth) throw new Error(); }
        catch { broken.push(url); }
      }
    }));
    return broken;
  }, assets);
  assert.deepEqual(broken, [], "Every skin image and portrait must decode");

  const search = async (id) => {
    await page.locator(".search-box input").fill(rows.find((row) => row.id === id).tank);
    await page.locator(".search-box button").click();
  };
  const menu = page.getByRole("menu", { name: /皮肤$/ });
  let switched = 0;
  for (const id of [6132, 7002]) { // User-reported WZ-131, plus a multi-skin maiden.
    await search(id);
    await page.getByRole("button", { name: "竖版卡牌", exact: true }).click();
    const entry = page.locator(`.atlas-entry[data-maiden-id="${id}"]`);
    for (const skin of skinRows[id]) {
      await entry.locator("button").first().click({ button: "right" });
      await menu.getByRole("menuitemradio", { name: skin.name, exact: true }).waitFor();
      assert.equal(await menu.getByRole("menuitemradio").count(), skinRows[id].length + 1);
      await menu.getByRole("menuitemradio", { name: skin.name, exact: true }).click();
      assert.equal(await entry.getAttribute("data-skin-id"), String(skin.id));
      assert.equal(await entry.locator(".atlas-hero").getAttribute("src"), skin.image);
      await entry.locator(".atlas-hero").evaluate((image) => image.decode());
      await page.getByRole("button", { name: "方形头像", exact: true }).click();
      assert.equal(await entry.locator(".table-portrait-head").getAttribute("src"), skin.headImage);
      await entry.locator(".table-portrait-head").evaluate((image) => image.decode());
      await page.getByRole("button", { name: "竖版卡牌", exact: true }).click();
      switched++;
    }
    await page.getByRole("button", { name: "皮肤分散", exact: true }).click();
    assert.equal(await entry.count(), skinRows[id].length + 1);
    await page.getByRole("button", { name: "皮肤合并", exact: true }).click();
    await entry.locator("button").first().click();
    const detail = page.locator(".detail-modal");
    const gallery = detail.locator(".portrait-gallery");
    await gallery.getByRole("button", { name: "下一套立绘", exact: true }).waitFor();
    assert.equal(await gallery.locator(".portrait-gallery-error").count(), 0);
    for (const skin of skinRows[id]) {
      await gallery.getByRole("button", { name: "下一套立绘", exact: true }).click();
      const image = gallery.locator(".portrait-gallery-stage > img");
      assert.equal(await image.getAttribute("src"), skin.image);
      await image.evaluate((image) => image.decode());
    }
    await gallery.locator(".portrait-gallery-stage > img").dblclick();
    const png = page.locator(".portrait-png-dialog img");
    await png.waitFor();
    const pngInfo = await png.evaluate(async (image) => {
      await image.decode();
      const blob = await (await fetch(image.src)).blob();
      return { type: blob.type, width: image.naturalWidth, height: image.naturalHeight };
    });
    assert.equal(pngInfo.type, "image/png");
    assert.ok(pngInfo.width > 0 && pngInfo.height > 0);
    await page.getByRole("button", { name: "关闭立绘大图", exact: true }).click();
    // Character dialogue is another lazily loaded dataset; exercise all tabs.
    const quotes = detail.locator(".maiden-quotes");
    await quotes.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    for (const tab of await quotes.getByRole("tab").all()) {
      await tab.click();
      assert.equal(await quotes.locator('[role="alert"]').count(), 0);
    }
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
  }
  // A real transient data error must remain recoverable, without silently
  // treating an HTTP 200 validation error as a successfully loaded skin list.
  const retryPage = await page.context().newPage();
  try {
    await retryPage.route("**/data/maiden-skins.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
    await retryPage.goto(baseUrl, { waitUntil: "networkidle" });
    await retryPage.getByRole("button", { name: "钢舞姬", exact: true }).click();
    await retryPage.getByRole("menuitem", { name: /^卡牌图鉴/ }).click();
    await retryPage.locator(".search-box input").fill("WZ-131");
    await retryPage.locator(".search-box button").click();
    await retryPage.locator('.atlas-entry[data-maiden-id="6132"] button').first().click({ button: "right" });
    const retry = retryPage.getByRole("menuitem", { name: "重新加载", exact: true });
    await retry.waitFor();
    await retryPage.unroute("**/data/maiden-skins.json");
    await retry.click();
    await retryPage.getByRole("menuitemradio", { name: skinRows[6132][0].name, exact: true }).waitFor();
  } finally { await retryPage.close(); }
  await page.getByRole("button", { name: "清除条件", exact: true }).click();
  await page.getByRole("button", { name: "方形头像", exact: true }).click();
  console.log(JSON.stringify({ skinAssetsDecoded: assets.length, skins: skins.length, switched, bothCardModes: true, separateSkins: true, detailGallery: true, pngPreview: true, quotes: true, retry: true }));
}
