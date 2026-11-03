import fs from "node:fs";
import path from "node:path";

export function clientApkPath(root) {
  const directory = path.join(root, "apks");
  const dated = fs.existsSync(directory) ? fs.readdirSync(directory)
    .filter((name) => /^钢铁华尔兹_\d{6}\.apk$/.test(name)).sort().reverse()
    .map((name) => path.join(directory, name)) : [];
  const candidates = [...dated, path.join(directory, "钢铁华尔兹.apk"), path.join(root, "钢铁华尔兹.apk")];
  const apk = candidates.find((candidate) => fs.existsSync(candidate));
  if (!apk) throw new Error("No client APK found in apks/ or workspace root");
  return apk;
}
