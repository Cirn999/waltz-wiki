import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.resolve(appRoot, "..");
const releaseRoot = process.env.ARCHIVE_RELEASE_ROOT || path.join(projectRoot, "release");
const releaseName = process.argv[2]?.replace(/^["']|["']$/g, "");
if (!releaseName) throw new Error("Usage: node scripts/verify-release.mjs <release-name>");

const releaseDirectory = path.join(releaseRoot, releaseName);
const zipPath = `${releaseDirectory}.zip`;
const expectedFiles = [
  path.join(releaseDirectory, "点我启动.exe"),
  path.join(releaseDirectory, "site", "index.html"),
  path.join(releaseDirectory, "site", "data", "maidens.json"),
  path.join(releaseDirectory, "site", "data", "research-tree.json"),
  path.join(releaseDirectory, "使用说明.txt"),
];
for (const file of expectedFiles) if (!existsSync(file)) throw new Error(`Missing release file: ${file}`);
if (!existsSync(zipPath) || statSync(zipPath).size < 1_000_000) throw new Error(`Invalid release zip: ${zipPath}`);

const unpackRoot = mkdtempSync(path.join(process.env.ARCHIVE_RELEASE_ROOT || os.tmpdir(), "steel-maiden-release-"));
const unpacked = spawnSync("tar", ["-xf", zipPath, "-C", unpackRoot], { encoding: "utf8" });
if (unpacked.error) throw unpacked.error;
if (unpacked.status !== 0) throw new Error(`Release extraction failed: ${unpacked.stderr}`);

const unpackedFolders = readdirSync(unpackRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
if (unpackedFolders.length !== 1) throw new Error(`Expected one top-level release folder, found ${unpackedFolders.length}`);
const unpackedRoot = path.resolve(unpackRoot, unpackedFolders[0].name);
if (!unpackedRoot.startsWith(path.resolve(unpackRoot) + path.sep)) throw new Error("Extracted release escaped temporary root");
const unpackedLauncher = path.join(unpackedRoot, "点我启动.exe");
const unpackedSite = path.join(unpackedRoot, "site", "index.html");
if (!existsSync(unpackedLauncher) || !existsSync(unpackedSite)) throw new Error("ZIP is missing launcher or site folder");
const snapshotOnly = process.argv.includes("--snapshot");
if (!snapshotOnly) {
  const unpackedDataset = JSON.parse(readFileSync(path.join(unpackedRoot, "site", "data", "maidens.json"), "utf8"));
  const sourceDataset = JSON.parse(readFileSync(path.join(appRoot, "public", "data", "maidens.json"), "utf8"));
  const t39 = unpackedDataset.rows.find((row) => row.tank === "T39");
  const project261 = unpackedDataset.rows.find((row) => row.tank === "261-2工程");
  if (!t39 || t39.acquisition.some((route) => route.label === "研发")) throw new Error("Packaged dataset incorrectly marks T39 as researchable");
  // Acquisition routes follow the approved current snapshot. An obsolete summer
  // gift path is not a permanent invariant of later client data.
  const source261 = sourceDataset.rows.find((row) => row.tank === "261-2工程");
  if (!project261 || !source261 || JSON.stringify(project261.acquisition) !== JSON.stringify(source261.acquisition)) throw new Error("Packaged 261-2 acquisition routes differ from current source data");
  const expectedT39Ordnance = ["多重火力装置", "附配掩体", "应急掩护", "分析打击"];
  const packagedT39Ordnance = t39.magicOrdnance ?? [];
  if (
    packagedT39Ordnance.length !== expectedT39Ordnance.length
    || expectedT39Ordnance.some((name) => !packagedT39Ordnance.some((skill) => skill.name === name))
    || packagedT39Ordnance.some((skill) => skill.levels?.length !== 11 || !skill.image)
  ) throw new Error("Packaged dataset is missing T39 magic-ordnance data");
  for (const skill of packagedT39Ordnance) {
    const iconPath = path.join(unpackedRoot, "site", skill.image.replace(/^\//, ""));
    if (!existsSync(iconPath)) throw new Error(`Packaged magic-ordnance icon is missing: ${skill.image}`);
  }
  const multiFire = packagedT39Ordnance.find((skill) => skill.name === "多重火力装置");
  if (!multiFire.levels.at(-1)?.effect.includes("11081")) throw new Error("Packaged T39 level data is incomplete");

}

const selfTest = spawnSync(unpackedLauncher, ["--self-test"], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
if (selfTest.error) throw selfTest.error;
if (selfTest.status !== 0) throw new Error(`Launcher self-test failed with exit ${selfTest.status}: ${selfTest.stderr}`);

const listFiles = (directory, relative = "") => readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
  const name = path.join(relative, entry.name);
  return entry.isDirectory() ? listFiles(directory, name) : [name];
}).sort();
const sourceSite = path.join(appRoot, "dist", "client");
const extractedSite = path.join(unpackedRoot, "site");
const sourceFiles = listFiles(sourceSite);
const extractedFiles = listFiles(extractedSite);
if (JSON.stringify(sourceFiles) !== JSON.stringify(extractedFiles)) throw new Error("Packaged site inventory differs from the current build");
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const name of sourceFiles) if (sha256(path.join(sourceSite, name)) !== sha256(path.join(extractedSite, name))) throw new Error(`Packaged site file differs from the current build: ${name}`);
const compiledLauncher = path.join(appRoot, "launcher", "launcher-new.exe");
if (existsSync(compiledLauncher) && sha256(compiledLauncher) !== sha256(unpackedLauncher)) throw new Error("Packaged launcher differs from the current compiled launcher");

console.log(JSON.stringify({
  releaseDirectory,
  zipPath,
  zipBytes: statSync(zipPath).size,
  extractedTo: unpackedRoot,
  launcherSelfTest: "passed",
  acquisitionDataCheck: snapshotOnly ? "checked against build" : "passed",
  magicOrdnanceDataCheck: snapshotOnly ? "checked against build" : "passed",
  exactBuildFilesChecked: sourceFiles.length,
  launcherBinaryCheck: "passed",
  requiredFiles: expectedFiles.map((file) => path.relative(releaseDirectory, file)),
}, null, 2));
