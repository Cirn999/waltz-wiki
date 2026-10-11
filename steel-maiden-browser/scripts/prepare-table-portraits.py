"""Export game portrait layers and detail ammunition cards for the attribute table."""
from __future__ import annotations

import argparse
import io
import json
import plistlib
import re
import sys
import zipfile
from contextlib import ExitStack
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "analysis_apk/tools"))
from PIL import Image
from decode_configs import Reader, config_path, parse_arranged_styles, parse_fund_types
from export_ui_images import sprite_image
from inspect_ui_attribute_icons import parse_ui_styles


def race_styles():
    # RaceInfo: ID, localized name ID, flags, arranged style ID, two resources,
    # demands, then numbered string resources. The arranged style supplies
    # CLASS_SMALL_ICON (not the larger GetRaceResource badge used in filters).
    def record(r):
        race_id = r.u32()
        r.u32()
        r.u8()
        arranged_id = r.u32()
        r.cstring()
        r.cstring()
        r.vec_u32()
        for _ in range(r.u8()):
            r.u32()
            r.cstring()
        return race_id, arranged_id
    return dict(Reader(config_path("RaceInfo.dat").read_bytes()).records(record))


def prepare(rows_path: Path, app: Path, skins_only=False):
    rows = json.loads(rows_path.read_text(encoding="utf-8"))
    styles = {r["code"]: r for r in parse_ui_styles(config_path("UIStyle.dat"))}
    arranged = {r["arranged_style_id"]: r for r in parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))}
    models = {r["role_model_id"]: r for r in json.loads((ROOT / "analysis_apk/output/role_models.json").read_text(encoding="utf-8"))}
    races = race_styles()
    ui_roots = [ROOT / "patch/_1.18/ui", ROOT / "package/preinitial/ui", ROOT / "Resources/ui", ROOT / "analysis_apk/apk_ui_assets/assets/Resources/ui", ROOT / "analysis_apk/apk_ui_heads"]
    destination = app / "public/art/table-portraits"
    destination.mkdir(parents=True, exist_ok=True)
    exported = {}
    atlases = {}
    plists = {}
    with ExitStack() as stack:
        archives = [stack.enter_context(zipfile.ZipFile(p)) for p in [ROOT / "base(1).apk", ROOT / "钢铁华尔兹_260924.apk", ROOT / "钢铁华尔兹.apk"] if p.exists()]

        providers = [(str(directory), styles, lambda name, directory=directory: (directory / name).read_bytes()) for directory in ui_roots]
        cache = app / ".cache/table-portraits"
        cache.mkdir(parents=True, exist_ok=True)
        for index, archive in enumerate(archives):
            config = cache / f"apk-style-{index}.dat"
            config.write_bytes(archive.read("assets/Resources/config/UIStyle.dat"))
            apk_styles = {r["code"]: r for r in parse_ui_styles(config)}
            read = lambda name, archive=archive: archive.read("assets/Resources/ui/" + name)
            providers.append((str(archive.filename), apk_styles, read))

        def extract(code):
            for provider, mapping, read in providers:
                style = mapping.get(code)
                if not style:
                    continue
                try:
                    return Image.open(io.BytesIO(read(style["file"]))).convert("RGBA")
                except (FileNotFoundError, KeyError):
                    pass
                try:
                    atlas_name = style["atlas"]
                    key = provider + ":" + atlas_name
                    if key not in atlases:
                        plists[key] = plistlib.loads(read(atlas_name + ".plist"))
                        atlases[key] = Image.open(io.BytesIO(read(atlas_name + ".pn_"))).convert("RGBA")
                    metadata = plists[key]["frames"][style["file"]]
                    image = sprite_image(atlases[key], metadata)
                    # Restore atlas trimming before applying the client's layout.
                    if "sourceSize" in metadata and "sourceColorRect" in metadata:
                        size = tuple(map(int, re.findall(r"-?\d+", metadata["sourceSize"])))
                        rect = list(map(int, re.findall(r"-?\d+", metadata["sourceColorRect"])))
                        restored = Image.new("RGBA", size)
                        restored.paste(image, tuple(rect[:2]))
                        image = restored
                    return image
                except (FileNotFoundError, KeyError):
                    continue
            # Some original standalone PNGs survive only in the prior verified
            # APK export. Match the configured filename, never a guessed icon.
            style = styles.get(code)
            if style and not style["atlas"]:
                original = ROOT / "release/steel-maiden-client-ui-images-original-names-2026-09-19/apk/original_images" / (Path(style["file"]).stem + ".png")
                if original.is_file():
                    return Image.open(original).convert("RGBA")
            raise FileNotFoundError(f"Missing game sprite {code}")

        def export(code, trim=False, folder="table-portraits"):
            key = folder + ":" + code
            if key in exported:
                return exported[key]
            image = extract(code)
            # The one/two chevron sprites share transparent vertical padding.
            # Align their visible top-left corner like the approved sample.
            if trim:
                image = image.crop(image.getbbox())
            target = app / "public/art" / folder
            target.mkdir(parents=True, exist_ok=True)
            image.save(target / f"{code}.webp", "WEBP", lossless=True)
            exported[key] = f"/art/{folder}/{code}.webp"
            return exported[key]

        def picture(style_ids, mode):
            for style_id in style_ids:
                for item in arranged.get(style_id, {}).get("items", []):
                    if item["mode_code"] == mode and not item["filter_code"]:
                        for entry in item["string_entries"]:
                            if entry["entry_id"] == 1 and entry["value"]:
                                return entry["value"]
            raise ValueError(f"Missing {mode} in arranged styles {style_ids}")

        if skins_only:
            skin_path = app / "public/data/maiden-skins.json"
            skins = json.loads(skin_path.read_text(encoding="utf-8"))
            missing = []
            for variants in skins["rows"].values():
                for skin in variants:
                    model = models[skin["modelId"]]
                    code = picture(model["group_b_ids"], "Head_Square")
                    try:
                        skin["headImage"] = export(code, folder="skin-portraits")
                    except FileNotFoundError:
                        missing.append({"skin": skin["name"], "modelId": skin["modelId"], "code": code, "style": styles.get(code)})
            if missing:
                raise ValueError(json.dumps(missing, ensure_ascii=False))
            skin_path.write_text(json.dumps(skins, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            print(json.dumps({"skinCards": len(skins["rows"]), "skins": sum(map(len, skins["rows"].values())), "headSprites": len(exported)}))
            return

        result = {
            "rows": {},
            "classes": {str(class_id): export(picture([races[class_id]], "CLASS_SMALL_ICON")) for class_id in sorted({r["classId"] for r in rows})},
            "frames": {"2": export("jy-009"), "3": export("jy-011"), "4": export("jy-013")},
            "rarities": {"2": export("kj-088", True), "3": export("kj-089", True), "4": export("kj-090", True)},
            "bottomMask": export("zdjm-025"),
        }
        for row in rows:
            model = models[row["modelId"]]
            result["rows"][str(row["id"])] = export(picture(model["group_b_ids"], "Head_Square"))
        (app / "public/data/table-portraits.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        # StampUI detail: tkyl-005 + GetFundResource(fund,8), centered,
        # at 45% native icon scale. This is distinct from filter slot 9.
        funds = {r["fund_id"]: r for r in parse_fund_types(config_path("FundTypeInfo.dat"))}
        type_funds = {"穿甲弹": 5011, "硬芯弹": 5012, "脱壳弹": 5013,
                      "榴弹": 5014, "火箭弹": 5015, "破甲弹": 5016,
                      "碎甲弹": 5017, "航空火炮弹": 5018, "机炮弹": 5018,
                      "飞弹": 5019}
        used_types = {name for row in rows for name in row["ammo"]}
        unknown = used_types - type_funds.keys()
        if unknown:
            raise ValueError(f"Missing detail ammunition mapping: {unknown}")
        background = extract("tkyl-005")
        ammunition = {"background": export("tkyl-005", folder="table-ammunition"),
                      "width": background.width, "height": background.height,
                      "iconScale": 0.45, "types": {}}
        for name, fund_id in type_funds.items():
            code = next(r["resource"] for r in funds[fund_id]["resources"] if r["resource_id"] == 8)
            icon = extract(code)
            ammunition["types"][name] = {"fundId": fund_id,
                "image": export(code, folder="table-ammunition"),
                "width": icon.width, "height": icon.height}
        (app / "public/data/table-ammunition.json").write_text(json.dumps(ammunition, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"portraits": len(result["rows"]), "sprites": len(exported), "classes": len(result["classes"])}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("rows", type=Path)
    parser.add_argument("app", type=Path)
    parser.add_argument("--skins-only", action="store_true")
    args = parser.parse_args()
    prepare(args.rows, args.app, args.skins_only)
