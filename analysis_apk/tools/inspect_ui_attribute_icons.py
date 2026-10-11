#!/usr/bin/env python3
"""Resolve the kpxx attribute aliases used by the game UI."""

from pathlib import Path
import plistlib
import struct
import sys

from decode_configs import parse_string_table


ROOT = Path(__file__).resolve().parents[2]


def parse_ui_styles(path: Path) -> list[dict]:
    data = path.read_bytes()
    offset = 0

    def u8() -> int:
        nonlocal offset
        value = data[offset]
        offset += 1
        return value

    def u32() -> int:
        nonlocal offset
        value = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        return value

    def cstring() -> str:
        nonlocal offset
        end = data.index(0, offset)
        value = data[offset:end].decode("utf-8")
        offset = end + 1
        return value

    rows = []
    for _ in range(u32()):
        rows.append({"id": u32(), "flag": u8(), "code": cstring(), "file": cstring(), "atlas": cstring()})
        offset += 5
    return rows


def main() -> None:
    needles = {
        *(f"kpxx-{index:03d}" for index in range(27, 37)),
        *(f"kpxx-{index:03d}" for index in range(97, 111)),
    }
    styles_only = "--styles-only" in sys.argv
    frames_only = "--frames" in sys.argv
    if frames_only:
        plist_path = ROOT / "analysis_apk" / "apk_ui_assets" / "assets" / "Resources" / "ui" / "comme.plist"
        with plist_path.open("rb") as stream:
            atlas = plistlib.load(stream)
        frames = atlas["frames"]
        for index in range(2, 16):
            name = f"comme-one_tank-{index:02d}.pn_"
            if name in frames:
                print(name, frames[name])
        return
    paths = [
        ROOT / "patch" / "_1.18" / "config" / "StringTableInfo.dat",
        ROOT / "Resources" / "config" / "StringTableInfo.dat",
        ROOT / "analysis_apk" / "apk_bootstrap_config" / "StringTableInfo.dat",
    ]
    for path in ([] if styles_only else paths):
        if not path.exists():
            continue
        print(f"[{path.relative_to(ROOT)}]")
        for row in parse_string_table(path):
            values = row["strings"]
            if any(any(needle in value for value in values) for needle in needles):
                print(row["string_id"], repr(values))

    for path in [
        ROOT / "patch" / "_1.18" / "config" / "UIStyle.dat",
        ROOT / "Resources" / "config" / "UIStyle.dat",
        ROOT / "analysis_apk" / "apk_bootstrap_config" / "UIStyle.dat",
    ]:
        if not path.exists():
            continue
        print(f"[styles {path.relative_to(ROOT)}]")
        for row in parse_ui_styles(path):
            values = [str(value) for value in row.values()]
            if any(any(needle in value for value in values) for needle in needles):
                print(row)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
