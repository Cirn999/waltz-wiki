#!/usr/bin/env python3
"""Inspect hunting-task achievement mappings without changing application data."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from decode_configs import (  # noqa: E402
    Reader,
    config_path,
    parse_arranged_styles,
    parse_capsule_types,
    parse_demand_groups,
    parse_string_table,
)


def parse_quest_achievement(path: Path):
    return Reader(path.read_bytes()).records(
        lambda r: {"quest_id": r.u32(), "achievement_ids": r.vec_u32()}
    )


def main() -> None:
    records = parse_quest_achievement(config_path("QuestAchievementInfo.dat"))
    strings = {
        row["string_id"]: (row["strings"][0] if row["strings"] else "")
        for row in parse_string_table(config_path("StringTableInfo.dat"))
    }
    wanted_text_ids = {
        700786,
        700811,
        700812,
        2000344,
        2000345,
        2000346,
        2100342,
        2100343,
        2100344,
    }
    print(json.dumps({str(k): strings.get(k) for k in sorted(wanted_text_ids)}, ensure_ascii=True, indent=2))
    print("quest_records", len(records))
    for row in records:
        if row["quest_id"] in {342, 343, 344, 6102, 6254, 6331, 6341, 6573, 6621, 604310, 604320, 604330}:
            print(json.dumps(row, ensure_ascii=True))

    for filename in ("AchievementListInfo.dat", "CardAchievementInfo.dat", "QuestAchievementInfo.dat"):
        data = config_path(filename).read_bytes()
        print("occurrences", filename)
        for value in sorted(wanted_text_ids):
            needle = struct.pack("<I", value)
            positions = []
            start = 0
            while True:
                pos = data.find(needle, start)
                if pos < 0:
                    break
                positions.append(pos)
                start = pos + 1
            if positions:
                print(value, positions)
                if filename == "AchievementListInfo.dat":
                    for pos in positions:
                        lo, hi = max(0, pos - 8), min(len(data), pos + 62)
                        print("window", pos, data[lo:hi].hex(" "))

    condition_ids = {
        0x51E926, 0x51E98A, 0x51E9EE,
        604310, 604320, 604330,
        700786, 700811, 700812,
        138566081, 138568301, 138568321,
        880, 881, 882,
    }
    print("condition_id_occurrences")
    for path in sorted(config_path("StringTableInfo.dat").parent.glob("*.dat")):
        data = path.read_bytes()
        hits = {}
        for value in condition_ids:
            needle = struct.pack("<I", value)
            positions = []
            start = 0
            while True:
                pos = data.find(needle, start)
                if pos < 0:
                    break
                positions.append(pos)
                start = pos + 1
            if positions:
                hits[str(value)] = positions
        if hits:
            print(path.name, json.dumps(hits))

    demand_groups = parse_demand_groups(config_path("DemandGroupInfo.dat"))
    print("target_demand_groups")
    for group in demand_groups:
        if group.get("demand_group_id") in condition_ids:
            print(json.dumps(group, ensure_ascii=True, indent=2))

    print("target_arranged_styles")
    for style in parse_arranged_styles(config_path("ArrangedStyleInfo.dat")):
        packed = json.dumps(style)
        if any(str(value) in packed for value in (700786, 700811, 700812)):
            print(json.dumps(style, ensure_ascii=True, indent=2))

    maidens_path = Path(__file__).resolve().parents[2] / "steel-maiden-browser" / "public" / "data" / "maidens.json"
    maidens = json.loads(maidens_path.read_text(encoding="utf-8"))
    print("maidens_root", type(maidens).__name__, len(maidens))
    print("maidens_root_keys", json.dumps(list(maidens)[:30], ensure_ascii=True))
    if isinstance(maidens, list):
        sample = maidens[0]
    else:
        list_value = maidens.get("rows", [])
        sample = list_value[0] if list_value else {}
    print("maiden_sample_keys", json.dumps(sorted(sample.keys()), ensure_ascii=True))

    print("tagged_capsules")
    root = Path(__file__).resolve().parents[2]
    for source in (root / "Resources/config/CapsuleTypeInfo.dat", root / "patch/_1.18/config/CapsuleTypeInfo.dat"):
        cards = parse_capsule_types(source)
        print("capsule_source", str(source.relative_to(root)), "count", len(cards))
        for tag in (880, 881, 882):
            tagged = []
            for card in cards:
                groups = set(card["group_a_ids"]) | set(card["group_b_ids"])
                if tag in groups:
                    tagged.append({
                        "capsule_type_id": card["capsule_type_id"],
                        "group_a_ids": card["group_a_ids"],
                        "group_b_ids": card["group_b_ids"],
                    })
            print(tag, len(tagged), json.dumps(tagged, ensure_ascii=True))

    current_cards = parse_capsule_types(root / "patch/_1.18/config/CapsuleTypeInfo.dat")
    row_by_id = {int(row["id"]): row for row in maidens["rows"]}
    print("inner_demand_tag_rosters")
    for tag in (861, 862, 863):
        roster = []
        for card in current_cards:
            if tag not in card["group_b_ids"]:
                continue
            row = row_by_id.get(card["capsule_type_id"], {})
            roster.append({
                "id": card["capsule_type_id"],
                "tank": row.get("tank", ""),
                "person": row.get("person", ""),
                "className": row.get("className", ""),
                "nation": row.get("nation", ""),
                "status": row.get("status", ""),
            })
        print(tag, len(roster), json.dumps(roster, ensure_ascii=True))


if __name__ == "__main__":
    main()
