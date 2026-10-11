import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { renderLive2dBatch } from "./render-live2d.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(appRoot, "..");
const bases = ["patch/_1.18", "package/preinitial", "Resources"];
const exists = async (file) => { try { await fs.access(file); return true; } catch { return false; } };

// Same RMC selection precedence as prepare-data: an explicitly referenced
// static sheet wins; a Live2D model wins over a merely same-directory atlas.
async function sourceFor(modelId) {
  let model;
  for (const base of bases) {
    const file = path.join(root, base, "modelConfig", `${modelId}.rmc`);
    if (await exists(file)) { model = file; break; }
  }
  if (!model) return null;
  const values = (await fs.readFile(model)).toString("latin1").split("\0")
    .map((s) => s.replace(/[^A-Za-z0-9_.-]/g, "")).filter((s) => s.length > 2);
  const dirs = [...new Set(values.filter((s) => s.endsWith("_a")))];
  const sheets = [...new Set(values.filter((s) => s.includes("__200")))];
  let fallback;
  for (const dir of dirs) for (const base of bases) {
    const folder = path.join(root, base, "char", dir);
    if (!(await exists(folder))) continue;
    for (const sheet of sheets) {
      const file = path.join(folder, `${sheet}.pn_`);
      if (await exists(file)) return { type: "static", file, plist: path.join(folder, `${sheet}.plist`), model };
    }
    const files = await fs.readdir(folder);
    const file = files.find((f) => f.endsWith("__200.pn_")) ?? files.find((f) => f.endsWith(".pn_"));
    if (file && !fallback) fallback = { type: "static", file: path.join(folder, file), plist: path.join(folder, `${path.parse(file).name}.plist`), model };
  }
  for (const dir of dirs) for (const base of bases) {
    const file = path.join(root, base, "live", dir, `${dir}.model3.json`);
    if (!(await exists(file))) continue;
    const settings = JSON.parse((await fs.readFile(file, "utf8"))
      .replace(/("(?:[^"\\]|\\.)*")(\s*)(")/g, "$1,$2$3").replace(/,\s*([}\]])/g, "$1"));
    const refs = settings.FileReferences ?? {};
    const dependencies = [file, ...[refs.Moc, ...(refs.Textures ?? [])].filter(Boolean).map((p) => path.resolve(path.dirname(file), p))];
    if ((await Promise.all(dependencies.map(exists))).every(Boolean)) return { type: "live", file, dependencies, model };
  }
  return fallback ?? null;
}

execFileSync(process.env.PYTHON || "python", ["-X", "utf8", path.join(root, "analysis_apk/tools/build_maiden_skins.py")], { stdio: "inherit", windowsHide: true });
const source = JSON.parse(await fs.readFile(path.join(root, "analysis_apk/output/maiden_skins.json"), "utf8"));
const ids = [...new Set(Object.values(source.rows).flatMap((r) => r.skins.map((s) => s.modelId)))];
const outputDir = path.join(appRoot, "public/art/skins");
const cacheDir = path.join(appRoot, ".cache/skins");
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });
const sources = new Map();
const jobs = [];
for (const id of ids) {
  const source = await sourceFor(id);
  if (!source) throw new Error(`Missing skin model/assets: ${id}`);
  sources.set(id, source);
  if (source.type === "live") {
    source.png = path.join(cacheDir, `${id}.png`);
    const sourceTimes = await Promise.all([source.model, ...source.dependencies].map(async (f) => (await fs.stat(f)).mtimeMs));
    if (!(await exists(source.png)) || (await fs.stat(source.png)).mtimeMs < Math.max(...sourceTimes)) {
      jobs.push({ id, modelPath: source.file, outputPath: source.png });
    }
  }
}
console.log(`Skin sources: ${ids.length} models; ${jobs.length} Live2D renders required`);
if (jobs.length) {
  const results = await renderLive2dBatch(jobs);
  const failures = results.filter((r) => !r.ready);
  if (failures.length) throw new Error(JSON.stringify(failures));
}
for (const [id, source] of sources) {
  let pipeline = sharp(source.png ?? source.file);
  if (source.plist && await exists(source.plist) && /<key>rotated<\/key>\s*<true\s*\/>/i.test(await fs.readFile(source.plist, "utf8"))) pipeline = pipeline.rotate(270);
  // Trim transparent canvas padding so all poses fit the same gallery frame.
  const upright = await pipeline.png().toBuffer();
  await sharp(upright).trim({ background: "#00000000", threshold: 1 })
    .resize({ height: 900, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 95 }).toFile(path.join(outputDir, `${id}.webp`));
}
const rows = Object.fromEntries(Object.entries(source.rows).map(([id, r]) => [id, r.skins.map((s) => ({
  id: s.id, name: s.name, painter: s.painter, modelId: s.modelId, image: `/art/skins/${s.modelId}.webp`,
}))]));
await fs.writeFile(path.join(appRoot, "public/data/maiden-skins.json"), JSON.stringify({ version: 1, rows }) + "\n");
execFileSync(process.execPath, [path.join(appRoot, "scripts/prepare-skin-portraits.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
execFileSync(process.execPath, [path.join(appRoot, "scripts/prepare-skin-card-framing.mjs")], { cwd: appRoot, stdio: "inherit", windowsHide: true });
console.log(`Exported ${ids.length} skin portraits for ${Object.keys(rows).length} vehicles`);
