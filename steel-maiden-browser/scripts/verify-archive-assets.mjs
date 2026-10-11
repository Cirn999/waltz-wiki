import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
import { rebaseAssets } from "./pages-paths.mjs";

const source = await fs.readFile(new URL("../app/archiveAssets.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const skins = JSON.parse(await fs.readFile(new URL("../public/data/maiden-skins.json", import.meta.url), "utf8"));
for (const base of ["", "/waltz-wiki", "/another/archive"]) {
  const code = base ? rebaseAssets(compiled, base) : compiled;
  const { isArchiveArtPath } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const skinPath = /^\d+\.webp$/;
  const headPath = /^[a-zA-Z0-9_-]+\.webp$/;
  for (const skin of Object.values(skins.rows).flat()) {
    assert.ok(isArchiveArtPath(base + skin.image, "skins", skinPath));
    assert.ok(isArchiveArtPath(base + skin.headImage, "skin-portraits", headPath));
  }
  for (const bad of [undefined, null, 4, "https://example.com/art/skins/1.webp", "//example.com/art/skins/1.webp",
    `${base}/art/skins/../1.webp`, `${base}/art/skins/%2e%2e/1.webp`, `${base}/art/skins/1.webp?x`,
    `${base}/art/skins/1.webp#x`, `${base}/art/skins/1.png`, `${base}/art/skins/evil.svg`,
    `${base}/art/skins/1\\2.webp`, `${base}/art/other/1.webp`, `/wrong${base}/art/skins/1.webp`]) {
    assert.equal(isArchiveArtPath(bad, "skins", skinPath), false, `Accepted invalid path: ${bad}`);
  }
  if (base) assert.equal(isArchiveArtPath("/art/skins/1.webp", "skins", skinPath), false, "Pages must not accept a broken root URL");
}
console.log(JSON.stringify({ bases: 3, skins: Object.values(skins.rows).flat().length, invalidPathsRejected: true }));
