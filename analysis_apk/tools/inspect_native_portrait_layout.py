#!/usr/bin/env python3
"""Inspect native portrait placement metadata without changing app data/assets.

RMC field order verified against ARM64 RoleModelCacheManager::loadRoleModelConfig
(0x887ed0-0x887f9c); names against RoleModelCacheConfigLoader::load.
The optional custom-parameter vector is retained as raw bytes, not guessed.
"""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import plistlib
import xml.etree.ElementTree as ET

from decode_configs import Reader, ROOT, config_path, parse_arranged_styles, parse_role_models


RESOURCE_ROOTS = [ROOT / "patch/_1.18", ROOT / "package/preinitial", ROOT / "Resources"]


def locate(relative: str) -> Path | None:
    return next((root / relative for root in RESOURCE_ROOTS if (root / relative).is_file()), None)


def parse_model(model_id: int) -> dict:
    path = locate(f"modelConfig/{model_id}.rmc")
    if not path:
        return {"modelId": model_id, "missing": True}
    r = Reader(path.read_bytes())
    result = {"path": str(path.relative_to(ROOT)), "modelId": r.u32(), "modelType": r.u32()}
    assert result["modelId"] == model_id
    for field in ("fold", "armatureName", "plistName", "pngName"):
        result[field] = r.cstring()
    for field in ("scale", "height", "wide", "offsetx", "offsety"):
        result[field] = r.i32()
    result["customParamRawHex"] = r.data[r.offset:].hex()
    if result["modelType"] == 0:
        xml_path = locate(f"char/{result['fold']}/{result['armatureName']}.xml")
        plist_path = locate(f"char/{result['fold']}/{result['plistName']}.plist")
        if xml_path:
            tree = ET.parse(xml_path)
            result["xml"] = {
                "path": str(xml_path.relative_to(ROOT)),
                "bones": [node.attrib for node in tree.findall("./armatures/armature/b")],
                "textures": [node.attrib for node in tree.findall("./TextureAtlas/SubTexture")],
            }
        if plist_path:
            with plist_path.open("rb") as file:
                atlas = plistlib.load(file)
            result["plist"] = {"path": str(plist_path.relative_to(ROOT)), **atlas}
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rows = json.loads((ROOT / "steel-maiden-browser/public/data/maidens.json").read_text(encoding="utf-8"))["rows"]
    styles = {s["arranged_style_id"]: s for s in parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))}
    roles = {m["role_model_id"]: m for m in parse_role_models(config_path("RoleModelInfo.dat"))}
    cache: dict[int, dict] = {}
    result = []
    for row in rows:
        model_id = row["modelId"]
        if model_id not in cache:
            cache[model_id] = parse_model(model_id)
        role = roles.get(model_id, {})
        focus = [
            {"styleId": style_id, **item}
            for style_id in role.get("group_b_ids", [])
            for item in styles.get(style_id, {}).get("items", [])
            if item["mode_code"] in {"Head_Center", "BASE_POSE_ROLEMODEL_ID"}
        ]
        result.append({"id": row["id"], "tank": row["tank"], "model": cache[model_id], "focusStyles": focus})
    summary = {
        "cards": len(rows),
        "modelTypes": dict(Counter(str(item["model"].get("modelType", "missing")) for item in result)),
        "staticWithXmlAndPlist": sum("xml" in i["model"] and "plist" in i["model"] for i in result),
        "incompleteStatic": [{"id": i["id"], "tank": i["tank"], "modelId": i["model"]["modelId"]} for i in result if i["model"].get("modelType") == 0 and not ("xml" in i["model"] and "plist" in i["model"])],
        "multipleBoneStatic": [i["id"] for i in result if len(i["model"].get("xml", {}).get("bones", [])) > 1],
        "headCenterCards": sum(any(s["mode_code"] == "Head_Center" for s in i["focusStyles"]) for i in result),
        "basePoseCards": sum(any(s["mode_code"] == "BASE_POSE_ROLEMODEL_ID" for s in i["focusStyles"]) for i in result),
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        evidence = {
            "luaDetail": "patch/_1.18/RanaScripts/ui/CardInfoUI.lua:2852-2876",
            "luaCollectionDetail": "patch/_1.18/RanaScripts/ui/StampUI.lua:20555-20560",
            "nativeElf": "analysis_apk/extracted/lib/arm64-v8a/libasgame.so",
            "nativeRmcReader": "RoleModelCacheManager::loadRoleModelConfig 0x887ed0-0x887f9c",
            "nativeRmcFieldNames": "RoleModelCacheConfigLoader::load 0x88611c",
            "nativeDetailCreation": "UIManager::createRoleHeadUINode2 0x95be60",
            "nativeStaticCreation": "ATRoleHeadView::create(Size,int,float) 0x93e3f4",
            "nativeStaticScale": "0x93eee0-0x93ef1c: model scale / 100, UI scale and texture-density normalization",
            "nativeStaticOffset": "0x95c49c-0x95c4f0: armature position += (offsetx,offsety) * model scale / 100 * UI scale / 100",
            "nativeLive2d": "0x95c37c-0x95c39c: setOriginalParam(UI scale / 100 * model scale / 100, offsetx, offsety)",
            "limitations": [
                "Raw model scale/offset values are not CSS percentages or CSS pixels.",
                "Static exports require XML pivot/bone coordinates plus plist sourceSize/sourceColorRect/rotation mapping.",
                "Live2D placement requires its own canvas/trim mapping; do not apply the static formula blindly.",
                "Head_Center appears in acquisition/wedding focus scripts; it is not read directly in the ordinary detail creation block cited above.",
                "This is a metadata audit, not an applied or visually validated native-framing implementation.",
            ],
        }
        args.output.write_text(json.dumps({"summary": summary, "evidence": evidence, "rows": result}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": summary, "examples": [i for i in result if i["id"] in {6203, 6214, 9903, 9924}]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
