import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(appRoot, "..");
const run = (...args) => execFileSync(process.env.PYTHON || "python", ["-X", "utf8", ...args], { cwd: root, stdio: "inherit", windowsHide: true });
run(path.join(root, "analysis_apk/tools/build_ammunition_efficiency.py"));
// The old unpacked atlas has placeholders. Use the verified native tank/plane
// sprites in the supplemental APK, not the similarly named old atlas entries.
const cache = path.join(appRoot, ".cache/ammunition-efficiency");
const output = path.join(appRoot, "public/art/attributes");
await fs.mkdir(output, { recursive: true });
run(path.join(root, "analysis_apk/tools/inspect_apk_ui_icons.py"), path.join(root, "钢铁华尔兹.apk"), cache, "dlc-sx-014", "dlc-sx-013", "--strict");
for (const code of ["dlc-sx-014", "dlc-sx-013"]) {
  await sharp(path.join(cache, `${code}.png`)).webp({ lossless: true }).toFile(path.join(output, `${code}.webp`));
}
