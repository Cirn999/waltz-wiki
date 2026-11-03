import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const browserRoot = path.join(process.env.LOCALAPPDATA, "ms-playwright");
const executablePath = (await fs.readdir(browserRoot)).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()
  .map((name) => path.join(browserRoot, name, "chrome-headless-shell-win64/chrome-headless-shell.exe"))[0];
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const frame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
const reports = [];
try {
  await page.goto(process.argv[2] || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
  await page.getByRole("menuitem", { name: /^研发路线/ }).click();
  await page.locator(".chain-archive .chain-search input").fill("T-60轻型坦克");
  await page.locator(".chain-archive .chain-search button").click();
  const flow = page.locator(".chain-flow");
  await flow.waitFor();
  const size = await flow.evaluate((el) => ({ width: el.offsetWidth, height: el.offsetHeight, groups: el.querySelectorAll(".chain-group").length, edges: el.querySelectorAll(".chain-link").length }));
  assert.ok(size.height > 3000 && size.groups > 40, "exercise the full T-60 route, not a small isolated branch");
  await page.evaluate(() => {
    window.__researchPanCalls = [];
    window.__researchPanPointer = null;
    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      const options = typeof args[0] === "object" ? args[0] : { top: args[1] };
      const requested = options.top ?? window.scrollY;
      nativeScrollTo(...args);
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      window.__researchPanCalls.push({ requested, expected: Math.max(0, Math.min(max, requested)), actual: window.scrollY, behavior: options.behavior ?? "auto" });
    };
    document.querySelector(".chain-scroll").addEventListener("pointerdown", (event) => { window.__researchPanPointer = event.pointerId; }, true);
  });
  const startAt = async (top) => {
    await page.evaluate((top) => { window.scrollTo({ top, behavior: "instant" }); window.__researchPanCalls = []; }, top);
    await frame();
    const point = await page.evaluate(() => {
      for (const y of [760, 700, 640, 580, 880]) for (let x = 30; x < innerWidth - 250; x += 40) {
        const el = document.elementFromPoint(x, y);
        if (el?.closest(".chain-scroll") && !el.closest("button, article, input")) return { x, y };
      }
      return null;
    });
    assert.ok(point, "find draggable blank space without clicking a vehicle");
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await frame();
    return point;
  };
  const pan = async (name, top, dx, dy, flushOnRelease = false) => {
    const point = await startAt(top);
    const before = await page.evaluate(() => ({ y: scrollY, x: new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".chain-flow")).transform).m41 }));
    if (flushOnRelease) {
      // Dispatch both in the same task: release must flush a pending RAF update
      // with the same immediate behavior as ordinary drag frames.
      await page.evaluate(({ point, dx, dy }) => {
        const el = document.querySelector(".chain-scroll"), pointerId = window.__researchPanPointer;
        el.dispatchEvent(new PointerEvent("pointermove", { pointerId, clientX: point.x + dx, clientY: point.y + dy, bubbles: true, buttons: 1 }));
        el.dispatchEvent(new PointerEvent("pointerup", { pointerId, clientX: point.x + dx, clientY: point.y + dy, bubbles: true }));
      }, { point, dx, dy });
    } else {
      for (let i = 1; i <= 24; i++) await page.mouse.move(point.x + dx * i / 24, point.y + dy * i / 24);
    }
    await page.mouse.up();
    const result = await page.evaluate(() => ({ calls: window.__researchPanCalls, y: scrollY, x: new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".chain-flow")).transform).m41 }));
    assert.ok(result.calls.length > 0);
    assert.ok(result.calls.every((call) => call.behavior === "instant"), `${name}: drag must bypass global smooth scrolling`);
    const lag = Math.max(...result.calls.map((call) => Math.abs(call.expected - call.actual)));
    assert.ok(lag <= 1, `${name}: each drag update must reach its requested position immediately, lag=${lag}`);
    const max = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
    assert.ok(Math.abs(result.y - Math.max(0, Math.min(max, before.y - dy))) <= 1, `${name}: follow pointer displacement`);
    assert.ok(Math.abs(result.x - before.x - dx) <= 1, `${name}: preserve horizontal drag`);
    for (let i = 0; i < 6; i++) await frame();
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - result.y) <= 1, `${name}: no queued smooth animation after release`);
    assert.equal(await page.locator(".chain-scroll.is-panning").count(), 0);
    reports.push({ name, calls: result.calls.length, maxImmediateLag: lag, deltaX: result.x - before.x, deltaY: result.y - before.y });
  };
  await pan("vertical-down", 700, 0, -288);
  await pan("vertical-up", 1200, 0, 216);
  await pan("horizontal", 1400, 180, 0);
  await pan("diagonal", 1800, 144, -180);
  await pan("release-pending-frame", 2200, -96, -144, true);
  await pan("bottom-boundary", 100000, 0, -288);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "smooth", "keep ordinary smooth navigation unchanged");
  assert.deepEqual(errors, []);
  await fs.mkdir(path.join(root, ".cache"), { recursive: true });
  await fs.writeFile(path.join(root, ".cache/research-chain-pan.json"), JSON.stringify({ candidate: "T-60轻型坦克", size, reports, errors }, null, 2));
  console.log(JSON.stringify({ candidate: "T-60轻型坦克", size, reports, errors }));
} finally { await browser.close(); }
