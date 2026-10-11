import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { renderLive2dBatch } from "./render-live2d.mjs";
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(app);
execFileSync("python", ["-X", "utf8", path.join(root,"analysis_apk/tools/build_story_catalog.py")], {stdio:"inherit", windowsHide:true});
const jobs = JSON.parse(await fs.readFile(path.join(root,"analysis_apk/story_research/story_render_jobs.json"),"utf8"));
const missing = [];
for (const job of jobs) { try { await fs.access(job.outputPath); } catch { missing.push(job); } }
console.log(`Story expression renders: ${missing.length}/${jobs.length}`);
// Batches release GPU resources periodically, avoiding one browser holding all characters.
for (let start=0;start<missing.length;start+=15) {
  const results=await renderLive2dBatch(missing.slice(start,start+15),{width:1000,height:1200});
  const failed=results.filter((r)=>!r.ready);
  if(failed.length) throw new Error(JSON.stringify(failed));
  console.log(`Rendered ${Math.min(start+15,missing.length)}/${missing.length}`);
}
for(const job of jobs) await sharp(job.outputPath).trim({background:"#00000000",threshold:1}).webp({quality:92,alphaQuality:100}).toFile(path.join(app,"public/art/stories",`${job.id}.webp`));
execFileSync("python", ["-X", "utf8", path.join(root,"analysis_apk/tools/build_maiden_quotes.py")], {stdio:"inherit", windowsHide:true});
console.log("Silent story data, backgrounds, portraits, expression poses and recruitment quotes ready.");
