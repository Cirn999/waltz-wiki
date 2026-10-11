import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const projectRoot = resolve(appRoot, "..");
const compiledLauncher = join(appRoot, "launcher", "launcher-new.exe");

if (!existsSync(compiledLauncher)) throw new Error(`缺少启动器构建产物：${compiledLauncher}`);

const launchers = readdirSync(projectRoot).filter(
  (name) => name.toLowerCase().endsWith(".exe") && name.toLowerCase() !== "launcher-new.exe",
);
if (launchers.length !== 1) {
  throw new Error(`项目根目录应当恰好有一个正式启动器，当前找到：${launchers.join("、") || "无"}`);
}

const target = join(projectRoot, launchers[0]);
copyFileSync(compiledLauncher, target);
console.log(JSON.stringify({ source: compiledLauncher, target }, null, 2));
