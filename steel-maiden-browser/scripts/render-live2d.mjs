import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(appRoot, "..");
const defaultWidth = 1200;
const defaultHeight = 1200;

const runtimeFiles = new Map([
  ["/runtime/core.js", path.join(appRoot, "scripts", "vendor", "live2dcubismcore.min.js")],
  ["/runtime/pixi.js", path.join(appRoot, "node_modules", "pixi.js", "dist", "browser", "pixi.min.js")],
  ["/runtime/live2d.js", path.join(appRoot, "node_modules", "pixi-live2d-display", "dist", "cubism4.min.js")],
]);

function browserExecutable() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (configured && fsSync.existsSync(configured)) return configured;
  const normal = chromium.executablePath();
  if (fsSync.existsSync(normal)) return normal;
  const browsersRoot = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!fsSync.existsSync(browsersRoot)) return normal;
  const candidates = fsSync.readdirSync(browsersRoot)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()
    .map((name) => path.join(browsersRoot, name, "chrome-win64", "chrome.exe"));
  return candidates.find((candidate) => fsSync.existsSync(candidate)) ?? normal;
}

function contentType(target) {
  if (target.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (target.endsWith(".json")) return "application/json; charset=utf-8";
  if (target.endsWith(".pn_") || target.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function rendererHtml() {
  return `<!doctype html>
<html><body style="margin:0;background:transparent;overflow:hidden">
<canvas id="canvas"></canvas>
<script src="/runtime/core.js"></script>
<script src="/runtime/pixi.js"></script>
<script src="/runtime/live2d.js"></script>
<script>
(async () => {
  try {
    const params = new URLSearchParams(location.search);
    const width = Number(params.get("width")) || ${defaultWidth};
    const height = Number(params.get("height")) || ${defaultHeight};
    const canvas = document.getElementById("canvas");
    const app = new PIXI.Application({ view: canvas, width, height, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, autoStart: false });
    const model = await PIXI.live2d.Live2DModel.from(params.get("model"), { autoInteract: false });
    model.anchor.set(0.5, 0.5);
    const scale = Math.min(width / model.width, height / model.height) * 0.94;
    model.scale.set(scale);
    model.position.set(width / 2, height / 2);
    app.stage.addChild(model);
    const expression = params.get("expression");
    if (expression) {
      if (!await model.expression(expression)) throw new Error("Missing expression: " + expression);
      // Settle the native expression blend before exporting a story pose.
      for (let i = 0; i < 60; i++) model.update(16.667);
    }
    model.update(16.667);
    app.renderer.render(app.stage);
    window.__live2dResult = { ready: true, width: model.width, height: model.height, scale };
  } catch (error) {
    window.__live2dResult = { ready: false, error: String(error && error.stack || error) };
  }
})();
</script></body></html>`;
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/render") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(rendererHtml());
        return;
      }
      const runtime = runtimeFiles.get(url.pathname);
      const relative = url.pathname.startsWith("/project/") ? decodeURIComponent(url.pathname.slice(9)) : null;
      const target = runtime ?? (relative ? path.resolve(projectRoot, relative) : null);
      if (!target || (!runtime && !target.startsWith(projectRoot + path.sep))) {
        response.writeHead(404).end();
        return;
      }
      let body = await fs.readFile(target);
      // Some game-authored model3 manifests use a trailing comma accepted by
      // the native loader but rejected by browser JSON.parse.
      if (target.endsWith(".model3.json")) {
        body = Buffer.from(body.toString("utf8")
          .replace(/("(?:[^"\\]|\\.)*")(\s*)(")/g, "$1,$2$3")
          .replace(/,\s*([}\]])/g, "$1"));
      }
      response.writeHead(200, { "Content-Type": contentType(target), "Cache-Control": "no-store" });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

export async function renderLive2dBatch(jobs, { width = defaultWidth, height = defaultHeight } = {}) {
  if (!jobs.length) return [];
  const { server, port } = await startServer();
  const browser = await chromium.launch({ executablePath: browserExecutable(), headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const results = [];
  try {
    for (const job of jobs) {
      try {
        const relativeModel = path.relative(projectRoot, job.modelPath).split(path.sep).join("/");
        const modelUrl = `/project/${relativeModel.split("/").map(encodeURIComponent).join("/")}`;
        const url = `http://127.0.0.1:${port}/render?width=${width}&height=${height}&model=${encodeURIComponent(modelUrl)}${job.expression ? `&expression=${encodeURIComponent(job.expression)}` : ""}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => window.__live2dResult, null, { timeout: 30000 });
        const result = await page.evaluate(() => window.__live2dResult);
        if (!result.ready) throw new Error(result.error);
        const dataUrl = await page.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/png"));
        await fs.mkdir(path.dirname(job.outputPath), { recursive: true });
        await fs.writeFile(job.outputPath, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
        results.push({ ...job, ...result });
      } catch (error) {
        results.push({ ...job, ready: false, error: String(error?.stack ?? error) });
      }
    }
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return results;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [modelPath, outputPath] = process.argv.slice(2);
  if (!modelPath || !outputPath) throw new Error("Usage: node scripts/render-live2d.mjs <model3.json> <output.png>");
  const [result] = await renderLive2dBatch([{ modelPath: path.resolve(modelPath), outputPath: path.resolve(outputPath) }]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
