import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.dirname(app);
const python = process.env.PYTHON || "python";
function py(name, ...args) {
  console.log(`\n[archive] ${name}`);
  execFileSync(python, ["-B", "-X", "utf8", path.join(root, "analysis_apk/tools", name), ...args], { cwd: root, stdio: "inherit", windowsHide: true });
}
function js(name, ...args) {
  console.log(`\n[archive] ${name}`);
  execFileSync(process.execPath, [path.join(app, "scripts", name), ...args], { cwd: app, stdio: "inherit", windowsHide: true });
}

// Raw model/appearance exports must be refreshed before any portrait or quote
// mapping; downstream catalogues must use the new full ID set on their first run.
py("decode_configs.py");
py("build_steel_maiden_catalog.py", "--output", path.join(root, "analysis_apk/output/steel_maiden_catalog_v4"));
for (const name of ["build_growth_curves.py", "build_magic_ordnance_catalog.py", "build_magic_progression_catalog.py"]) py(name);
py("build_research_tree.py", "--web-output", path.join(app, "public/data/research-tree.json"));
for (const name of ["build_acquisition_dataset.py", "build_equipment_catalog.py", "build_colonization_catalog.py", "build_hunt_special_rosters.py", "build_technology_catalog.py"]) py(name);
js("prepare-data.mjs");
py("build_star_promotions.py");
py("build_stage_catalog.py");
js("prepare-stories.mjs");
py("build_task_catalog.py");
py("build_item_catalog.py");
js("prepare-research-resources.mjs");
py("build_base_catalog.py");
js("audit-card-id-coverage.mjs", "--current");
