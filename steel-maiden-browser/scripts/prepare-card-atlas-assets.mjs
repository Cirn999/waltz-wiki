import fs from "node:fs/promises";
import path from "node:path";

// Import the approved raster artwork without repainting or regenerating it.
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/prepare-card-atlas-assets.mjs <approved-preview-directory>");
const destination = path.resolve(import.meta.dirname, "../public/art/card-atlas");
await fs.mkdir(destination, { recursive: true });
const files = [
  ["assets/tank-experiment/frame.webp", "frame.webp"],
  ["assets/metal-v2/glyphs.webp", "cost-glyphs.webp"],
  ["assets/metal-v2/glyph-bounds.json", "cost-glyph-bounds.json"],
  ["assets/kp-013.webp", "rarity-blue.webp"],
  ["assets/kp-015.webp", "rarity-purple.webp"],
  ["assets/kp-016.webp", "rarity-orange.webp"],
];
for (const [from, to] of files) await fs.copyFile(path.join(source, from), path.join(destination, to));
console.log(`Imported ${files.length} approved card-atlas assets.`);
