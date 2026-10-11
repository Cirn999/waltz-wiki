import fs from "node:fs/promises";
import { applyRestoredGameIcons, prepareRestoredGameIcons, restoredGameIcons } from "./restored-game-icons.mjs";

const dataPath = new URL("../public/data/maidens.json", import.meta.url);
const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
const icons = await prepareRestoredGameIcons();
applyRestoredGameIcons(data, icons);
data.generatedAt = new Date().toISOString();
await fs.writeFile(dataPath, JSON.stringify(data));
console.log(JSON.stringify({ icons, vehicles: Object.fromEntries(restoredGameIcons.filter((icon) => icon.nationTypeId).map((icon) => [icon.nation, data.rows.filter((row) => row.nationTypeId === icon.nationTypeId).length])) }, null, 2));
