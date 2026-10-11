#!/usr/bin/env python3
"""Export client UI images and atlas sprites with their original game basenames."""

from __future__ import annotations

import argparse
import csv
import io
import plistlib
import re
import zipfile
from pathlib import Path

from PIL import Image


IMAGE_SUFFIXES = {".pn_", ".png", ".jpg", ".jpeg", ".webp"}
RECT_PATTERN = re.compile(r"-?\d+")


def output_name(original: str) -> str:
    """Only change the client-specific extension so Windows can open the image."""
    return Path(original).name.removesuffix(".pn_") + (
        ".png" if original.endswith(".pn_") else ""
    )


def image_size(raw: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(raw)) as image:
        return image.size


def sprite_image(atlas: Image.Image, metadata: dict) -> Image.Image:
    rectangle = metadata.get("frame") or metadata.get("textureRect")
    if isinstance(rectangle, str):
        x, y, width, height = map(int, RECT_PATTERN.findall(rectangle))
    elif isinstance(rectangle, dict):
        origin = rectangle["origin"]
        size = rectangle["size"]
        x, y = int(origin["x"]), int(origin["y"])
        width, height = int(size["width"]), int(size["height"])
    else:
        raise ValueError(f"Unsupported sprite rectangle: {rectangle!r}")

    rotated = metadata.get("rotated", metadata.get("textureRotated", False))
    if rotated:
        width, height = height, width
    if min(x, y, width, height) < 0 or x + width > atlas.width or y + height > atlas.height:
        raise ValueError(f"Sprite rectangle outside atlas: {rectangle!r}")

    sprite = atlas.crop((x, y, x + width, y + height))
    if rotated:
        sprite = sprite.rotate(90, expand=True)
    return sprite


def export_source(
    archive: zipfile.ZipFile,
    source: str,
    images: dict[str, bytes],
    plists: dict[str, bytes],
    rows: list[tuple[str, ...]],
    errors: list[str],
) -> tuple[int, int]:
    raw_count = 0
    sprite_count = 0

    for original, raw in sorted(images.items()):
        name = output_name(original)
        destination = f"{source}/original_images/{name}"
        try:
            width, height = image_size(raw)
        except Exception as exc:
            errors.append(f"{source}/{original}: unreadable image ({exc})")
            continue
        archive.writestr(destination, raw)
        rows.append((source, "original", "", original, destination, str(width), str(height)))
        raw_count += 1

    for plist_name, raw_plist in sorted(plists.items()):
        archive.writestr(f"{source}/atlas_metadata/{plist_name}", raw_plist)
        atlas_name = Path(plist_name).stem + ".pn_"
        atlas_bytes = images.get(atlas_name)
        if atlas_bytes is None:
            errors.append(f"{source}/{plist_name}: atlas image {atlas_name} is missing")
            continue
        try:
            metadata = plistlib.loads(raw_plist)
            frames = metadata.get("frames", {})
            atlas = Image.open(io.BytesIO(atlas_bytes)).convert("RGBA")
        except Exception as exc:
            errors.append(f"{source}/{plist_name}: cannot parse atlas ({exc})")
            continue
        exported_names: set[str] = set()
        for original, frame in sorted(frames.items()):
            try:
                filename = output_name(original)
                # Some atlases repeat an identical frame under a directory-prefixed alias.
                if filename in exported_names:
                    continue
                sprite = sprite_image(atlas, frame)
                buffer = io.BytesIO()
                sprite.save(buffer, format="PNG")
                destination = (
                    f"{source}/atlas_sprites/{Path(plist_name).stem}/"
                    f"{filename}"
                )
                archive.writestr(destination, buffer.getvalue())
                exported_names.add(filename)
                rows.append(
                    (
                        source,
                        "atlas_sprite",
                        plist_name,
                        original,
                        destination,
                        str(sprite.width),
                        str(sprite.height),
                    )
                )
                sprite_count += 1
            except Exception as exc:
                errors.append(f"{source}/{plist_name}/{original}: {exc}")
    return raw_count, sprite_count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, default=Path("base(1).apk"))
    parser.add_argument("--patch-ui", type=Path, default=Path("patch/_1.18/ui"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("release/steel-maiden-client-ui-images-original-names-2026-09-19.zip"),
    )
    args = parser.parse_args()

    rows: list[tuple[str, ...]] = []
    errors: list[str] = []
    counts: dict[str, tuple[int, int]] = {}
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.apk) as game, zipfile.ZipFile(
        args.output, "w", compression=zipfile.ZIP_STORED, allowZip64=True
    ) as exported:
        prefix = "assets/Resources/ui/"
        apk_images: dict[str, bytes] = {}
        apk_plists: dict[str, bytes] = {}
        for info in game.infolist():
            if not info.filename.startswith(prefix):
                continue
            basename = info.filename.removeprefix(prefix)
            if "/" in basename:
                continue
            if Path(basename).suffix.lower() in IMAGE_SUFFIXES:
                apk_images[basename] = game.read(info)
            elif basename.endswith(".plist"):
                apk_plists[basename] = game.read(info)
        counts["apk"] = export_source(
            exported, "apk", apk_images, apk_plists, rows, errors
        )

        patch_images = {
            path.name: path.read_bytes()
            for path in args.patch_ui.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        }
        patch_plists = {
            path.name: path.read_bytes() for path in args.patch_ui.glob("*.plist")
        }
        counts["patch_1.18"] = export_source(
            exported, "patch_1.18", patch_images, patch_plists, rows, errors
        )

        index = io.StringIO()
        writer = csv.writer(index)
        writer.writerow(
            ("source", "kind", "atlas_plist", "original_game_name", "zip_path", "width", "height")
        )
        writer.writerows(rows)
        exported.writestr("image_index.csv", index.getvalue().encode("utf-8-sig"))

        readme = [
            "钢铁华尔兹客户端 UI 图片素材（保留游戏原始文件名主体）",
            "来源：base(1).apk / assets/Resources/ui 与 patch/_1.18/ui。",
            "original_images 为客户端原始图片；atlas_sprites 是从图集逐项拆出的透明 PNG。",
            "客户端的 .pn_ 实际是 PNG 图片；仅将扩展名改成 .png 方便查看。",
            "两个来源分别放在 apk 和 patch_1.18 目录，避免同名文件互相覆盖。",
            "image_index.csv 提供原始文件名、来源、图集及压缩包内路径的对应关系。",
            "",
        ]
        for source, (raw_count, sprite_count) in counts.items():
            readme.append(f"{source}: 原始图片 {raw_count} 张，图集拆分 {sprite_count} 张。")
        readme.append(f"未能导出：{len(errors)} 项。")
        if errors:
            readme.extend(["", "未能导出的条目：", *errors])
        exported.writestr("README.txt", "\n".join(readme).encode("utf-8-sig"))

    print(args.output.resolve())
    print(f"Images: {counts}; errors: {len(errors)}; bytes: {args.output.stat().st_size}")
    for error in errors[:20]:
        print(f"WARNING: {error}")


if __name__ == "__main__":
    main()
