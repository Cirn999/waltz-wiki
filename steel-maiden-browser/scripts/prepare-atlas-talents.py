"""Export the original CardUI talent icons, green silhouettes and number sprites.

CardUI.lua: CaiyiIconBottom_Array / NumberIcon_Array and talent icon placement
(icon 40%, child number 150%, number anchor at width, 8).
Newer talents use the matching dg-116..121 silhouettes in UIStyle.dat.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "steel-maiden-browser"
sys.path.insert(0, str(ROOT / "analysis_apk" / "tools"))
from stage_assets import StageAssets  # noqa: E402

TALENTS = [
    ("演艺", "dg-016", "dg-047"), ("料理", "dg-017", "dg-048"),
    ("技工", "dg-020", "dg-051"), ("护理", "dg-019", "dg-050"),
    ("运动", "dg-018", "dg-049"), ("知性", "dg-021", "dg-052"),
    ("美妆", "dg-104", "dg-116"), ("商贸", "dg-105", "dg-117"),
    ("武学", "dg-106", "dg-118"), ("心理", "dg-107", "dg-119"),
    ("编程", "dg-108", "dg-120"), ("文学", "dg-109", "dg-121"),
]


def main():
    output = APP / "public" / "art" / "atlas-talents"
    output.mkdir(parents=True, exist_ok=True)
    assets = StageAssets(check=True)

    def export(code):
        image = assets.image(code)
        style = assets.styles[code]
        metadata = assets.atlases[style["atlas"]][0][style["file"]]
        # Cocos sprites keep their untrimmed size and anchor; restore that canvas.
        if "sourceSize" in metadata and "sourceColorRect" in metadata:
            size = tuple(map(int, re.findall(r"-?\d+", metadata["sourceSize"])))
            rect = list(map(int, re.findall(r"-?\d+", metadata["sourceColorRect"])))
            original = Image.new("RGBA", size)
            original.paste(image, tuple(rect[:2]))
            image = original
        image.save(output / f"{code}.webp", "WEBP", lossless=True, exact=True)
        return {"image": f"/art/atlas-talents/{code}.webp", "width": image.width, "height": image.height}

    try:
        data = {
            "schemaVersion": 1,
            "talents": {name: {"icon": export(icon), "highlight": export(highlight)} for name, icon, highlight in TALENTS},
            "digits": {str(n): export(f"kpxx-{92 if n == 0 else 82 + n:03d}") for n in range(10)},
        }
        destination = APP / "public" / "data" / "atlas-talents.json"
        destination.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Exported {len(data['talents'])} native talent/highlight pairs and 10 number sprites.")
    finally:
        assets.close()


if __name__ == "__main__":
    main()
