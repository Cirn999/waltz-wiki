#!/usr/bin/env python3
"""Resolve UIStyle codes and export only the requested icons for visual inspection."""
import argparse
import io
import json
import plistlib
import zipfile
from pathlib import Path

from PIL import Image

from export_ui_images import sprite_image
from inspect_ui_attribute_icons import parse_ui_styles


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("apk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("codes", nargs="+")
    parser.add_argument("--strict", action="store_true", help="Fail instead of skipping unresolved sprites")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.apk) as archive:
        config = args.output / "UIStyle.dat"
        config.write_bytes(archive.read("assets/Resources/config/UIStyle.dat"))
        styles = {row["code"]: row for row in parse_ui_styles(config)}
        names = set(archive.namelist())
        for code in args.codes:
            style = styles.get(code)
            print(json.dumps({"code": code, "style": style}, ensure_ascii=False))
            if not style:
                if args.strict:
                    raise ValueError(f"UIStyle code missing: {code}")
                continue
            prefix = "assets/Resources/ui/"
            if f"{prefix}{style['file']}" in names:
                icon = Image.open(io.BytesIO(archive.read(f"{prefix}{style['file']}"))).convert("RGBA")
            elif style["atlas"] and f"{prefix}{style['atlas']}.plist" in names:
                metadata = plistlib.loads(archive.read(f"{prefix}{style['atlas']}.plist"))
                frame = metadata["frames"].get(style["file"])
                if frame is None:
                    if args.strict:
                        raise ValueError(f"Atlas frame missing: {code}: {style['file']}")
                    print("FRAME MISSING", style["file"])
                    continue
                atlas = Image.open(io.BytesIO(archive.read(f"{prefix}{style['atlas']}.pn_"))).convert("RGBA")
                icon = sprite_image(atlas, frame)
            else:
                if args.strict:
                    raise ValueError(f"Resource missing: {code}: {style['file']}")
                print("RESOURCE MISSING", style["file"])
                continue
            destination = args.output / f"{code}.png"
            icon.save(destination)
            print(f"EXPORTED {destination} {icon.size}")


if __name__ == "__main__":
    main()
