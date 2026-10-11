import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const payload = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "maidens.json"), "utf8"));
const source = JSON.parse(fs.readFileSync(path.join(root, "..", "analysis_apk", "output", "magic_ordnance", "magic_ordnance_catalog.json"), "utf8"));
const records = payload.rows ?? [];
const skills = records.flatMap((record) => (record.magicOrdnance ?? []).map((skill) => ({ cardId: record.id, tank: record.tank, ...skill })));
const expectedSkillInstances = Object.values(source.rows ?? {}).reduce((sum, rows) => sum + rows.length, 0);
const missingImages = skills.filter((skill) => !skill.image || !fs.existsSync(path.join(root, "public", skill.image.replace(/^\//, ""))));
const invalid = skills.filter((skill) => !skill.name || !(skill.levels?.length > 0) || skill.levels.some((level) => !Number.isInteger(level.level) || !level.effect));
const t39 = records.find((record) => record.tank === "T39");
const summary = {
  maidens: records.length,
  configuredMaidens: records.filter((record) => record.magicOrdnance?.length).length,
  skillInstances: skills.length,
  uniqueSkills: new Set(skills.map((skill) => skill.skillId)).size,
  missingImageCount: missingImages.length,
  missingImageSamples: missingImages.slice(0, 10).map((skill) => ({ cardId: skill.cardId, skillId: skill.skillId, name: skill.name })),
  invalidCount: invalid.length,
  invalidSamples: invalid.slice(0, 10).map((skill) => ({ cardId: skill.cardId, skillId: skill.skillId, name: skill.name })),
  t39: (t39?.magicOrdnance ?? []).map((skill) => ({
    name: skill.name,
    image: skill.image,
    levels: skill.levels.length,
    first: skill.levels[0],
    last: skill.levels.at(-1),
  })),
};

console.log(JSON.stringify(summary, null, 2));
if (
  summary.configuredMaidens !== records.length
  || summary.skillInstances !== expectedSkillInstances
  || summary.uniqueSkills !== 41
  || missingImages.length
  || invalid.length
  || summary.t39.map((skill) => skill.name).sort().join("|") !== ["分析打击", "多重火力装置", "附配掩体", "应急掩护"].sort().join("|")
) process.exitCode = 1;
