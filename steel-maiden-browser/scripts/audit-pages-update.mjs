import assert from "node:assert/strict";

// Exercise the new archive content through the same strict Pages server as the
// existing skin regression. This must never require private APK resources.
export async function auditPagesUpdate(page, baseUrl, section) {
  const response = await page.request.get(new URL("data/maidens.json", baseUrl).href);
  assert.equal(response.status(), 200);
  const { rows } = await response.json();
  const search = async (name) => {
    await page.locator(".search-box input").fill(name);
    await page.locator(".search-box button").click();
  };
  const checked = [];
  for (const id of [9825, 9826, 9827]) {
    const row = rows.find((r) => r.id === id);
    await search(row.tank);
    await page.locator(`tr[data-maiden-id="${id}"] .table-avatar`).click();
    const detail = page.locator(".detail-modal");
    await detail.waitFor();
    const image = detail.locator(".portrait-gallery-stage > img");
    await image.waitFor();
    await image.evaluate((image) => image.decode());
    assert.equal(await detail.locator(".portrait-gallery-error, .portrait-gallery-placeholder").count(), 0);
    assert.equal(await detail.locator(".detail-slot-section .slot-icon-list .game-icon-chip").count(), 8);
    const slider = detail.getByRole("slider", { name: "钢舞姬等级", exact: true });
    await slider.waitFor();
    await page.waitForFunction(() => !document.querySelector("#detail-level")?.disabled);
    await slider.focus();
    await slider.press("Home");
    const durability = detail.locator(".colonization-stat-card").filter({ has: page.locator("span", { hasText: /^耐久$/ }) }).locator(".colonization-stat-value");
    assert.equal((await durability.innerText()).replace(/,/g, ""), String(row.stats[1].durability));
    await slider.press("End");
    await page.waitForFunction(() => document.querySelector("#detail-level")?.value === "99");
    assert.equal((await durability.innerText()).replace(/,/g, ""), String(row.stats[99].durability));
    const routes = await detail.locator(".acquisition-grid").innerText();
    assert.match(routes, id === 9825 ? /巴塔鼓/ : id === 9826 ? /研发/ : /特种精英/);
    const quotes = detail.locator(".maiden-quotes");
    await quotes.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    assert.equal(await quotes.locator('[role="alert"]').count(), 0);
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
    checked.push(id);
  }
  await search("");
  await section("手册", "地形", ".terrain-card");
  const terrainSearch = page.getByRole("searchbox", { name: "搜索地形", exact: true });
  for (const name of ["沙漠巷战", "沙漠堑壕", "雪地堑壕"]) {
    await terrainSearch.fill(name);
    const card = page.locator(".terrain-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
    assert.equal(await card.count(), 1);
    if (name.includes("堑壕")) {
      assert.match(await card.innerText(), /整个战斗过程中更容易受到暴击/);
      assert.ok(await card.locator(".terrain-effect-list h4").allTextContents().then((names) => names.includes("宽沟")));
    }
    await card.locator("img").evaluateAll(async (images) => Promise.all(images.map((image) => image.decode())));
    assert.equal(await card.locator('.terrain-combat-range[data-kind="distance"]').count(), 1);
    await page.getByRole("button", { name: "空钢", exact: true }).click();
    assert.equal(await card.locator('.terrain-combat-range[data-kind="distance"]').count(), 1);
    await card.locator("img").evaluateAll(async (images) => Promise.all(images.map((image) => image.decode())));
    await page.getByRole("button", { name: "陆钢", exact: true }).click();
  }
  await section("手册", "道具", ".item-archive");
  await page.getByRole("searchbox", { name: "搜索道具", exact: true }).fill("船票");
  assert.equal(await page.locator(".item-card").count(), 2);
  for (const id of [4445, 4446]) {
    const card = page.locator(`.item-card[data-item-id="${id}"]`);
    assert.match(await card.innerText(), /转服道具/);
    assert.equal(await card.locator(".item-sale, .item-exchange-trigger").count(), 0);
    assert.doesNotMatch(await card.innerText(), /限购|计数/);
    await card.locator("img").evaluateAll(async (images) => Promise.all(images.map((image) => image.decode())));
  }
  await section("钢舞姬", "属性表", ".table-archive");
  console.log(JSON.stringify({ update: "2026-10-31", newDetails: checked, portraitsDecoded: true, levelSlider: true, newTerrainsBothPerspectives: 3, ticketsPresenceOnly: 2 }));
}
