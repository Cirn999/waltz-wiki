import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const projectRoot = resolve(appRoot, "..");
const releaseRoot = join(projectRoot, "release");
const clientRoot = join(appRoot, "dist", "client");
const releaseName = (process.argv[2] || "钢舞姬战术档案库_发布版").replace(/^["']|["']$/g, "");
const targetRoot = join(releaseRoot, releaseName);
const targetSite = join(targetRoot, "site");
const zipPath = `${targetRoot}.zip`;

if (!existsSync(clientRoot)) throw new Error(`缺少构建产物：${clientRoot}`);
if (existsSync(targetRoot) || existsSync(zipPath)) throw new Error(`发布目标已存在，请换一个版本名：${releaseName}`);

const launchers = readdirSync(projectRoot).filter((name) => name.toLowerCase().endsWith(".exe"));
if (launchers.length !== 1) throw new Error(`项目根目录应当恰好有一个启动器，当前找到：${launchers.join("、") || "无"}`);

mkdirSync(releaseRoot, { recursive: true });
mkdirSync(targetRoot);
cpSync(clientRoot, targetSite, { recursive: true });
cpSync(join(projectRoot, launchers[0]), join(targetRoot, "点我启动.exe"));

const packed = spawnSync("tar", ["-a", "-cf", zipPath, "-C", releaseRoot, releaseName], { stdio: "inherit" });
if (packed.error) throw packed.error;
if (packed.status !== 0) throw new Error(`tar 打包失败，退出码 ${packed.status}`);

console.log(JSON.stringify({ releaseDirectory: targetRoot, zipPath, launcher: join(targetRoot, "点我启动.exe"), source: basename(clientRoot) }));
