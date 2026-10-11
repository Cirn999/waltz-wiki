import path from "node:path";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(import.meta.dirname, "..");
execFileSync(process.env.PYTHON || "python", ["-X", "utf8",
  path.join(appRoot, "scripts/prepare-table-portraits.py"),
  path.join(appRoot, "public/data/maiden-skins.json"), appRoot, "--skins-only",
], { cwd: appRoot, stdio: "inherit", windowsHide: true });
