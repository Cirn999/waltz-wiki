#!/usr/bin/env python3
"""Export the two six-grade assessment badge sets used by CardInfoUI.lua."""

from __future__ import annotations

import io
import plistlib
import zipfile
from pathlib import Path

from PIL import Image

from export_ui_images import RECT_PATTERN, sprite_image
from inspect_ui_attribute_icons import parse_ui_styles

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    styles = {row["code"]: row for row in parse_ui_styles(ROOT / "patch/_1.18/config/UIStyle.dat")}
    output = ROOT / "steel-maiden-browser/public/art/assessments"
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(ROOT / "base(1).apk") as apk:
        for number in range(83, 95):
            code = f"pvp-{number:03d}"
            style = styles[code]
            atlas_name = style["atlas"]
            patch = ROOT / "patch/_1.18/ui"
            if (patch / f"{atlas_name}.plist").exists() and (patch / f"{atlas_name}.pn_").exists():
                metadata = plistlib.loads((patch / f"{atlas_name}.plist").read_bytes())
                raw = (patch / f"{atlas_name}.pn_").read_bytes()
            else:
                prefix = "assets/Resources/ui/"
                metadata = plistlib.loads(apk.read(f"{prefix}{atlas_name}.plist"))
                raw = apk.read(f"{prefix}{atlas_name}.pn_")
            frame = metadata["frames"][style["file"]]
            sprite = sprite_image(Image.open(io.BytesIO(raw)).convert("RGBA"), frame)
            # Restore the original transparent canvas so different grades stay aligned.
            if "sourceSize" in frame and "sourceColorRect" in frame:
                width, height = map(int, RECT_PATTERN.findall(frame["sourceSize"]))
                x, y, _, _ = map(int, RECT_PATTERN.findall(frame["sourceColorRect"]))
                canvas = Image.new("RGBA", (width, height))
                canvas.paste(sprite, (x, y))
                sprite = canvas
            sprite.save(output / f"{code}.png")
            print(f"{code}: {style['file']} -> {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
