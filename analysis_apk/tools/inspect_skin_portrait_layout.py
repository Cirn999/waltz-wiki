"""Inspect each named skin's own native placement, not its base vehicle model."""
import json
from collections import Counter
from inspect_native_portrait_layout import parse_model
from decode_configs import ROOT

catalog = json.loads((ROOT / "steel-maiden-browser/public/data/maidens.json").read_text(encoding="utf-8"))
maidens = {str(row["id"]): row for row in catalog["rows"]}
skins = json.loads((ROOT / "steel-maiden-browser/public/data/maiden-skins.json").read_text(encoding="utf-8"))
rows = []
for maiden_id, variants in skins["rows"].items():
    for skin in variants:
        rows.append({"maidenId": int(maiden_id), "tank": maidens[maiden_id]["tank"],
                     "skinId": skin["id"], "name": skin["name"], "image": skin["image"],
                     "model": parse_model(skin["modelId"])})
output = ROOT / "analysis_apk/output/skin_portrait_layout.json"
output.write_text(json.dumps({"rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"types": dict(Counter(r["model"].get("modelType", "missing") for r in rows)),
                  "examples": [r for r in rows if "278" in r["tank"]], "output": str(output)}, ensure_ascii=False, indent=2))
