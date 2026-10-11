#!/usr/bin/env python3
"""Build exact P-30/P-31/P-32 rosters from the game's demand evaluator inputs.

This intentionally follows the data path used by Property_Set::checkDemandItem:
Achievement title/description -> matching ArrangedStyle requirement text ->
formation demand(type 20) -> per-card demand(type 12) ->
CapsuleTypeInfo.group_b_ids membership.  No image recognition is involved.
"""

from __future__ import annotations

import csv
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    parse_achievement_list,
    parse_arranged_styles,
    parse_capsule_types,
    parse_demand_groups,
    parse_string_table,
)


TARGETS = (
    {"task": "P-30", "label": "兽耳", "tag": 861},
    {"task": "P-31", "label": "黑色头发", "tag": 862},
    {"task": "P-32", "label": "戴眼镜", "tag": 863},
)


def first_text(strings: dict[int, list[str]], string_id: int) -> str:
    values = strings.get(string_id, [])
    return values[0] if values else ""


def build_rosters(config_dir: Path, catalog: dict) -> dict:
    strings = {
        row["string_id"]: row["strings"]
        for row in parse_string_table(config_dir / "StringTableInfo.dat")
    }
    demand_by_id = {
        row["demand_group_id"]: row
        for row in parse_demand_groups(config_dir / "DemandGroupInfo.dat")
    }
    cards = parse_capsule_types(config_dir / "CapsuleTypeInfo.dat")
    row_by_id = {int(row["id"]): row for row in catalog["rows"]}
    achievements = parse_achievement_list(config_dir / "AchievementListInfo.dat")

    result: list[dict] = []
    styles = parse_arranged_styles(config_dir / "ArrangedStyleInfo.dat")
    for target in TARGETS:
        # Never identify a condition by a hand-copied numeric string ID: the old
        # IDs were all one entry too high, silently assigning unrelated rosters.
        matching_tasks = [row for row in achievements if first_text(strings, row["name_string_id"]) == f"特殊阵容{target['task']}"]
        if len(matching_tasks) != 1:
            raise RuntimeError(f"expected one achievement for {target['task']}, got {len(matching_tasks)}")
        achievement = matching_tasks[0]
        description = first_text(strings, achievement["description_string_id"])
        condition = description.split(",")[-1]
        if not condition.startswith("队伍中至少有6名") or target["label"] not in condition:
            raise RuntimeError(f"unexpected hunting task condition: {description}")
        matching = []
        for style in styles:
            for item in style["items"]:
                for entry in item["number_entries"]:
                    if entry["entry_id"] == 5 and first_text(strings, entry["value"]) == condition:
                        matching.append((style, item, entry["value"]))
        if len(matching) != 1:
            raise RuntimeError(f"expected one arranged style for {condition}, got {len(matching)}")

        style, item, text_id = matching[0]
        if len(item["demands"]) != 1:
            raise RuntimeError(f"unexpected progress demands for {text_id}: {item['demands']}")
        progress_demand_id = item["demands"][0]
        progress_demand = demand_by_id[progress_demand_id]
        if len(progress_demand["items"]) != 1 or progress_demand["items"][0]["item_type"] != 20:
            raise RuntimeError(f"unexpected formation demand {progress_demand_id}")

        values = progress_demand["items"][0]["values"]
        formation_id, formation_kind, per_card_demand_id, invert, minimum, maximum = values
        per_card_demand = demand_by_id[per_card_demand_id]
        if len(per_card_demand["items"]) != 1 or per_card_demand["items"][0]["item_type"] != 12:
            raise RuntimeError(f"unexpected per-card demand {per_card_demand_id}")
        capsule_tag_id, must_contain = per_card_demand["items"][0]["values"]
        if invert != 1 or must_contain != 1:
            raise RuntimeError(f"unexpected polarity for {text_id}")
        if (formation_id, formation_kind, minimum, maximum, capsule_tag_id) != (2, 0, 6, 2147483647, target["tag"]):
            raise RuntimeError(f"hunting condition changed for {target['task']}: {values}, tag={capsule_tag_id}; review client rules")

        roster = []
        for card in cards:
            card_id = card["capsule_type_id"]
            catalog_row = row_by_id.get(card_id)
            if catalog_row is None or capsule_tag_id not in card["group_b_ids"]:
                continue
            roster_row = {
                "card_id": card_id,
                "tank": catalog_row.get("tank", ""),
                "person": catalog_row.get("person", ""),
                "class": catalog_row.get("className", ""),
                "nation": catalog_row.get("nation", ""),
                "stage": catalog_row.get("stage", ""),
                "rarity": catalog_row.get("rarity", ""),
            }
            roster.append(roster_row)
        roster.sort(key=lambda row: (row["tank"], row["card_id"]))

        result.append({
            "task": target["task"],
            "label": target["label"],
            "achievement_id": achievement["achievement_id"],
            "task_name_string_id": achievement["name_string_id"],
            "task_description_string_id": achievement["description_string_id"],
            "task_description": description,
            "achievement_demands": achievement["demands"],
            "description_string_id": text_id,
            "description": first_text(strings, text_id),
            "arranged_style_id": style["arranged_style_id"],
            "mode_code": item["mode_code"],
            "filter_code": item["filter_code"],
            "progress_demand_id": progress_demand_id,
            "formation_id": formation_id,
            "formation_kind": formation_kind,
            "per_card_demand_id": per_card_demand_id,
            "capsule_tag_id": capsule_tag_id,
            "minimum": minimum,
            "maximum": maximum,
            "qualifying_count": len(roster),
            "roster": roster,
        })

    return {
        "method": "game-config-and-native-demand-evaluator",
        "visual_inspection_used": False,
        "config_source": str(config_dir.relative_to(ROOT)).replace("\\", "/"),
        "native_source": "analysis_apk/extracted/lib/arm64-v8a/libasgame.so",
        "native_function": "Property_Set::checkDemandItem",
        "type20_handler_address": "0x6f0364",
        "type12_handler_address": "0x6ef7b0",
        "type20_behavior": "iterate selected formation, load per-card DemandGroupInfo, count cards whose demand passes",
        "type12_behavior": "test whether CapsuleTypeInfo.group_b_ids contains the configured tag",
        "tasks": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify generated reports and every application row without writing")
    args = parser.parse_args()
    config_dir = ROOT / "patch" / "_1.18" / "config"
    catalog_path = ROOT / "steel-maiden-browser" / "public" / "data" / "maidens.json"
    output_dir = ROOT / "analysis_apk" / "output" / "hunt_special_lineups"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    evidence = build_rosters(config_dir, catalog)
    result = evidence["tasks"]
    if args.check:
        saved = json.loads((output_dir / "狩猎任务特殊阵容_游戏判定.json").read_text(encoding="utf-8"))
        if saved != evidence:
            raise RuntimeError("hunting roster report differs from current client configuration")
        expected_by_id = {}
        for task in result:
            for row in task["roster"]:
                expected_by_id.setdefault(row["card_id"], []).append({"task": task["task"], "name": task["label"], "tagId": task["capsule_tag_id"]})
        for row in catalog["rows"]:
            if row.get("huntTraits") != expected_by_id.get(row["id"], []):
                raise RuntimeError(f"incorrect application hunting traits: {row['id']} {row['tank']}")
        if catalog["facets"]["huntTraits"] != [f"{task['task']} {task['label']}" for task in result]:
            raise RuntimeError("incorrect hunting filter options")
        print(json.dumps({"verified_cards": len(catalog["rows"]), "tasks": {task["task"]: task["qualifying_count"] for task in result}}))
        return
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "狩猎任务特殊阵容_游戏判定.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    csv_path = output_dir / "狩猎任务特殊阵容_钢舞姬名单.csv"
    flat_rows = [{
        "任务": task["task"], "判定条件": task["label"], "游戏标签ID": task["capsule_tag_id"],
        "卡牌类型ID": row["card_id"], "坦克名称": row["tank"], "人名": row["person"],
        "车种": row["class"], "国籍": row["nation"], "科技阶段": row["stage"], "稀有度": row["rarity"],
    } for task in result for row in task["roster"]]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(flat_rows[0]))
        writer.writeheader()
        writer.writerows(flat_rows)

    lines = [
        "# 狩猎任务特殊阵容：游戏判定名单",
        "",
        "> 数据来自客户端判定配置与 `Property_Set::checkDemandItem` 的实际分支；未使用立绘目测。",
        "",
    ]
    for task in result:
        lines.extend([
            f"## {task['task']}：{task['label']}（标签 {task['capsule_tag_id']}，共 {task['qualifying_count']} 辆）",
            "",
            f"客户端任务要求：{task['task_description']}。",
            "",
            f"条件链：任务 #{task['achievement_id']} → 条件文字 #{task['description_string_id']} → 编队条件 #{task['progress_demand_id']} → 单车条件 #{task['per_card_demand_id']} → 标签 {task['capsule_tag_id']}。",
            "",
        ])
        for row in task["roster"]:
            lines.append(f"- {row['tank']} — {row['person']}（#{row['card_id']}）")
        lines.append("")
    (output_dir / "狩猎任务特殊阵容_钢舞姬名单.md").write_text(
        "\n".join(lines), encoding="utf-8"
    )

    print(json.dumps({task["task"]: task["qualifying_count"] for task in result}))
    print(output_dir)


if __name__ == "__main__":
    main()
