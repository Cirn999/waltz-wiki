import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { exportTextFile, normalizeBasePath, rebaseAssets } from "./pages-paths.mjs";

const root = path.resolve(import.meta.dirname, "..");
const basePath = normalizeBasePath(process.env.ARCHIVE_BASE_PATH || "/waltz-wiki");
const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("vinext")));
const result = spawnSync(process.execPath, [cli, "build"], {
  cwd: root, stdio: "inherit", env: { ...process.env, ARCHIVE_BASE_PATH: basePath },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const output = path.join(root, "dist/client");
await fs.access(path.join(output, "index.html"));
let changed = 0;
for (const entry of await fs.readdir(output, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !exportTextFile.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const original = await fs.readFile(file, "utf8");
  const rebased = rebaseAssets(original, basePath);
  if (rebased !== original) {
    await fs.writeFile(file, rebased);
    changed++;
  }
}
// GitHub Pages must serve framework files under _next without Jekyll filtering.
await fs.writeFile(path.join(output, ".nojekyll"), "");
await fs.writeFile(path.join(output, "deployment.json"), JSON.stringify({
  basePath, commit: process.env.GITHUB_SHA || null,
}));
console.log(`Pages export: ${basePath}/; adapted ${changed} generated files (source data unchanged).`);
