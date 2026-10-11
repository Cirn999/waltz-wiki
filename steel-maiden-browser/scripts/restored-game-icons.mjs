import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(appRoot, "..");

// Only these previously missing sprites come from the supplemental APK.
// Keep all gameplay/configuration data on the existing client snapshot.
export const restoredGameIcons = [
  { code: "gjbz-013", folder: "nations", nationTypeId: 13, nation: "瑞士" },
  { code: "gjbz-014", folder: "nations", nationTypeId: 14, nation: "匈牙利" },
  { code: "gjbz-015", folder: "nations", nationTypeId: 15, nation: "澳大利亚" },
  { code: "gjbz-016", folder: "nations", nationTypeId: 16, nation: "巴西" },
  { code: "bjk-045", folder: "magic-ordnance", markKind: "金桨" },
];

export async function prepareRestoredGameIcons() {
  const output = path.join(appRoot, ".cache", "restored-game-icons");
  execFileSync(process.env.PYTHON || "python", [
    "-X", "utf8", path.join(projectRoot, "analysis_apk", "tools", "inspect_apk_ui_icons.py"),
    path.join(projectRoot, "钢铁华尔兹.apk"), output,
    ...restoredGameIcons.map((icon) => icon.code),
    "--strict",
  ], { cwd: projectRoot, stdio: "inherit", windowsHide: true });
  return Object.fromEntries(await Promise.all(restoredGameIcons.map(async (icon) => {
    const url = `/art/${icon.folder}/${icon.code}.webp`;
    const destination = path.join(appRoot, "public", url);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    // Preserve the client sprite's transparent padding; never enlarge it.
    await sharp(path.join(output, `${icon.code}.png`))
      .resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true })
      .webp({ lossless: true }).toFile(destination);
    return [icon.code, url];
  })));
}

export function applyRestoredGameIcons(data, icons) {
  for (const icon of restoredGameIcons) {
    if (!icons[icon.code]) throw new Error(`Missing restored sprite ${icon.code}`);
    if (icon.nationTypeId) {
      data.gameIcons.nations[icon.nationTypeId] = icons[icon.code];
      for (const maiden of data.rows) {
        if (maiden.nationTypeId === icon.nationTypeId) maiden.nationIcon = icons[icon.code];
      }
    } else {
      data.magicProgression.markIcons[icon.markKind] = icons[icon.code];
    }
  }
  return data;
}
