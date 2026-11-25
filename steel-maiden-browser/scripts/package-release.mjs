import { cpSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const projectRoot = resolve(appRoot, "..");
const releaseRoot = process.env.ARCHIVE_RELEASE_ROOT || join(projectRoot, "release");
const clientRoot = join(appRoot, "dist", "client");
const releaseName = (process.argv[2] || "钢舞姬战术档案库_发布版").replace(/^["']|["']$/g, "");
const targetRoot = join(releaseRoot, releaseName);
const targetSite = join(targetRoot, "site");
const zipPath = `${targetRoot}.zip`;
const compiledLauncher = join(appRoot, "launcher", "launcher-new.exe");

if (!existsSync(clientRoot)) throw new Error(`缺少构建产物：${clientRoot}`);
if (existsSync(targetRoot) || existsSync(zipPath)) throw new Error(`发布目标已存在，请换一个版本名：${releaseName}`);

// Package the freshly compiled launcher directly: a running development copy
// can be locked by Windows and need not be replaced to produce a release.
const launcherSource = existsSync(compiledLauncher) ? compiledLauncher : join(projectRoot, "点我启动.exe");

mkdirSync(releaseRoot, { recursive: true });
mkdirSync(targetRoot);
cpSync(clientRoot, targetSite, { recursive: true });
cpSync(launcherSource, join(targetRoot, "点我启动.exe"));
cpSync(join(appRoot, "launcher", "使用说明.txt"), join(targetRoot, "使用说明.txt"));

const packed = spawnSync("tar", ["-a", "-cf", zipPath, "-C", releaseRoot, releaseName], { stdio: "inherit" });
if (packed.error) throw packed.error;
if (packed.status !== 0) throw new Error(`tar 打包失败，退出码 ${packed.status}`);

console.log(JSON.stringify({ releaseDirectory: targetRoot, zipPath, launcher: join(targetRoot, "点我启动.exe"), launcherSource, source: basename(clientRoot) }));
