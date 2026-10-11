import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { exportTextFile, normalizeBasePath, rebaseAssets } from "./pages-paths.mjs";

const basePath = normalizeBasePath(process.env.ARCHIVE_BASE_PATH || "/waltz-wiki");
const sample = '"/art/a.webp" \'/data/b.json\' `/art/${code}.png` url(/art/bg.webp)';
const rebased = rebaseAssets(sample, basePath);
assert.equal(rebased, `"${basePath}/art/a.webp" '${basePath}/data/b.json' \`${basePath}/art/\${code}.png\` url(${basePath}/art/bg.webp)`);
assert.equal(rebaseAssets(rebased, basePath), rebased, "Rebasing must be idempotent");
for (const untouched of ['"https://example.com/art/a.png"', '"../data/a.json"', '"//cdn.example.com/art/a.png"', '"/"', '"data:image/svg+xml;base64,abc"']) {
  assert.equal(rebaseAssets(untouched, basePath), untouched);
}
assert.throws(() => normalizeBasePath("https://example.com"));
assert.throws(() => normalizeBasePath("/../secret"));

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist/client");
const html = await fs.readFile(path.join(output, "index.html"), "utf8");
assert.ok(html.includes(`${basePath}/_next/`), "Framework bundles must use the Pages base path");
assert.ok(!/["']\/_next\//.test(html), "No root-relative framework bundles");
await fs.access(path.join(output, ".nojekyll"));
let checked = 0;
const entries = await fs.readdir(output, { recursive: true, withFileTypes: true });
const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => path.relative(output, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/")));
const references = new Set();
function collectReferences(value) {
  if (typeof value === "string" && value.startsWith(basePath + "/") && /^(art|data)\//.test(value.slice(basePath.length + 1))) references.add(value);
  else if (Array.isArray(value)) value.forEach(collectReferences);
  else if (value && typeof value === "object") Object.values(value).forEach(collectReferences);
}
for (const entry of entries) {
  if (!entry.isFile() || !exportTextFile.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const text = await fs.readFile(file, "utf8");
  assert.equal(rebaseAssets(text, basePath), text, `Unprefixed URL in ${path.relative(output, file)}`);
  if (entry.name.endsWith(".json")) collectReferences(JSON.parse(text));
  checked++;
}
for (const reference of references) {
  const relative = decodeURIComponent(reference.slice(basePath.length + 1).split(/[?#]/)[0]);
  assert.ok(files.has(relative), `Missing or wrongly-cased exported resource: ${reference}`);
}
const source = JSON.parse(await fs.readFile(path.join(root, "public/data/maidens.json"), "utf8"));
const exported = JSON.parse(await fs.readFile(path.join(output, "data/maidens.json"), "utf8"));
assert.equal(source.rows.length, exported.rows.length);
assert.ok(JSON.stringify(source).includes('"/art/'), "Source data must remain usable offline");
assert.ok(JSON.stringify(exported).includes(`"${basePath}/art/`));
console.log(JSON.stringify({ basePath, checked, references: references.size, maidens: source.rows.length, sourceUnchanged: true }));
