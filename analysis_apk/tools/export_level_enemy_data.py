#!/usr/bin/env python3
"""Export chapter, battle-node, enemy, reward and attribute data to JSON.

The binary layouts used here are recovered from the retained arm64 C++ reader
symbols in libasgame.so.  Fields whose semantics are not proven are kept under
conservative ``raw_*`` names.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from decode_configs import (
    APPEARANCE_TYPE_CHINESE,
    ATTRIBUTE_CHINESE,
    Reader,
    config_path,
    parse_growth_rules,
    parse_growth_templates,
    parse_string_table,
    parse_unit_appearances,
    parse_unit_attributes,
    parse_unit_templates,
    stats_for_template,
)


ROOT = Path(__file__).resolve().parents[2]


def parse_chapters(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "chapter_id": r.u32(),
            "name_string_id": r.u32(),
            "title_string_id": r.u32(),
            "mode_code": r.cstring(),
            "background_resource": r.cstring(),
            "level_ids": r.vec_u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_chapter_levels(path: Path) -> list[dict[str, Any]]:
    def quest_assess_award(r: Reader) -> dict[str, Any]:
        return {
            "assessment_type": r.u32(),
            "assessment_value": r.u32(),
            "award_table_ids": r.vec_u32(),
        }

    def fund_resource(r: Reader) -> dict[str, Any]:
        return {"resource_type": r.u32(), "resource": r.cstring()}

    def drama_script(r: Reader) -> dict[str, Any]:
        return {"script_id": r.u32(), "mode_code": r.cstring()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "level_id": r.u32(),
            "name_string_id": r.u32(),
            "field_type": r.u16(),
            "formation_expense_group_id": r.u32(),
            "deploy_template_id": r.u32(),
            "demand_group_ids": r.vec_u32(),
            "consume_group_ids": r.vec_u32(),
            "award_table_ids": r.vec_u32(),
            "formation_expense_ids": r.vec_u32(),
            "assessment_awards": [quest_assess_award(r) for _ in range(r.u8())],
            **{f"raw_scalar_{index}": r.u32() for index in range(9)},
            "resources": [fund_resource(r) for _ in range(r.u8())],
            "drama_scripts": [drama_script(r) for _ in range(r.u8())],
            "raw_tail": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_deploy_templates(path: Path) -> list[dict[str, Any]]:
    def skill_faculty(r: Reader) -> dict[str, int]:
        return {"skill_id": r.u32(), "faculty_id": r.u32()}

    def deploy_unit(r: Reader) -> dict[str, int]:
        return {
            "unit_template_id": r.u32(),
            "deploy_flag": r.u8(),
            "formation_position": r.u32(),
        }

    def one(r: Reader) -> dict[str, Any]:
        return {
            "deploy_template_id": r.u32(),
            "skill_faculties": [skill_faculty(r) for _ in range(r.u8())],
            "units": [deploy_unit(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_award_key(r: Reader) -> dict[str, Any]:
    item_type = r.u8()
    values: list[Any]
    if item_type in (0, 1):
        values = [r.u16()]
    elif item_type == 2:
        values = [r.u32(), r.u8()]
        pair_count = r.u16()
        values.append([[r.u8(), r.u32()] for _ in range(pair_count)])
    elif item_type == 3:
        values = [r.u32(), r.u32(), r.u32(), r.u32()]
    elif item_type == 4:
        values = [r.u32(), r.u32(), r.u32()]
    elif item_type == 5:
        values = [r.u32(), r.take(r.u16()).hex()]
    elif item_type == 6:
        values = [r.u32(), r.vec_u32()]
    elif item_type == 7:
        values = [r.u32(), r.u32(), r.u8()]
    elif item_type == 8:
        values = [r.u16(), r.u16()]
    elif item_type == 9:
        values = [r.u32(), r.vec_u32()]
    elif item_type == 10:
        values = [r.u8(), r.u32()]
    elif item_type == 11:
        values = [r.u32(), r.u8()]
    elif item_type in (12, 13):
        values = [int.from_bytes(r.take(8), "little")]
    elif item_type == 14:
        values = [int.from_bytes(r.take(8), "little"), r.u8(), r.u16()]
    elif item_type in (15, 51):
        values = [r.u32()]
    elif item_type in (16, 52):
        values = [r.u32(), r.u32(), r.u32()]
    elif item_type in (17, 53):
        values = [r.u32(), r.u32(), r.u32()]
    elif item_type in (18, 54):
        values = [r.u32(), r.u32(), r.u32()]
    elif item_type in (19, 55):
        values = [r.u32(), r.u32(), r.u32(), r.u32()]
    elif item_type in (20, 56):
        values = [r.u32()]
    elif item_type in (21, 57):
        values = [r.u32(), r.u32()]
    elif item_type in (22, 58):
        values = [r.u8()]
    elif item_type in (23, 59):
        values = [r.u8()]
    elif item_type in (24, 60):
        values = [r.u8(), r.u16()]
    else:
        raise ValueError(f"unknown award item type {item_type} at 0x{r.offset - 1:x}")
    return {"item_type": item_type, "values": values}


def parse_award_groups(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        group = {"award_group_id": r.u32(), "name": r.cstring(), "items": []}
        for item_index in range(r.u8()):
            try:
                key = parse_award_key(r)
            except Exception as exc:
                raise ValueError(
                    f"award group {group['award_group_id']} ({group['name']!r}) "
                    f"item {item_index + 1} at 0x{r.offset:x}: {exc}"
                ) from exc
            key["amount_or_weight"] = r.u32()
            group["items"].append(key)
        return group

    reader = Reader(path.read_bytes())
    count = reader.u32()
    result = []
    for group_index in range(count):
        try:
            result.append(one(reader))
        except Exception as exc:
            raise ValueError(
                f"award group record {group_index + 1}/{count} failed at 0x{reader.offset:x}; "
                f"previous={[(g['award_group_id'], g['name']) for g in result[-4:]]}: {exc}"
            ) from exc
    if reader.offset != len(reader.data):
        raise ValueError(f"award group decoder stopped at 0x{reader.offset:x} / 0x{len(reader.data):x}")
    return result


def parse_award_tables(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "award_table_id": r.u32(),
            "name": r.cstring(),
            "items": [
                {"raw_selector": r.u32(), "award_pool_id": r.u32()}
                for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_award_pools(path: Path) -> list[dict[str, Any]]:
    """Decode AwardPoolInfo using the retained AwardPoolItem reader layout."""

    def pool_item(r: Reader) -> dict[str, Any]:
        return {
            "enabled_flag": r.u32(),
            "demand_group_ids": r.vec_u32(),
            "award_group_id": r.u32(),
        }

    def pool_group(r: Reader) -> dict[str, Any]:
        return {"items": [pool_item(r) for _ in range(r.u8())]}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "award_pool_id": r.u32(),
            "pool_flag": r.u8(),
            "groups": [pool_group(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_fund_types(path: Path) -> list[dict[str, Any]]:
    def resource(r: Reader) -> dict[str, Any]:
        return {"resource_type": r.u32(), "resource": r.cstring()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "fund_id": r.u32(),
            "name_string_id": r.u32(),
            "bound_fund_id": r.u32(),
            "fund_type": r.u8(),
            "tags": r.vec_u32(),
            "raw_field_5": r.u32(),
            "code": r.cstring(),
            "resources": [resource(r) for _ in range(r.u8())],
            "description": r.cstring(),
            "raw_field_9": r.u32(),
            "raw_field_10": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def first_string(strings: dict[int, list[str]], string_id: int | None) -> str:
    values = strings.get(string_id or -1, [])
    return values[0] if values else ""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    attributes = parse_unit_attributes(config_path("UnitAttributeInfo.dat"))
    growth_templates = parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))
    growth_rules = parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    unit_templates = parse_unit_templates(config_path("UnitTemplateInfo.dat"))
    appearances = parse_unit_appearances(config_path("UnitAppearanceInfo.dat"))
    def merged_records(name: str, parse, key: str) -> list[dict[str, Any]]:
        merged: dict[Any, dict[str, Any]] = {}
        for candidate in (
            ROOT / "Resources" / "config" / name,
            ROOT / "patch" / "_1.18" / "config" / name,
        ):
            if candidate.exists():
                merged.update({item[key]: item for item in parse(candidate)})
        return list(merged.values())

    strings_raw = merged_records("StringTableInfo.dat", parse_string_table, "string_id")
    chapters = parse_chapters(config_path("ChapterInfo.dat"))
    levels = parse_chapter_levels(config_path("ChapterLevelInfo.dat"))
    deploys = parse_deploy_templates(config_path("DeployTemplateInfo.dat"))
    award_groups = parse_award_groups(config_path("AwardGroupInfo.dat"))
    award_pools = parse_award_pools(config_path("AwardPoolInfo.dat"))
    award_tables = parse_award_tables(config_path("AwardTableInfo.dat"))
    fund_types = merged_records("FundTypeInfo.dat", parse_fund_types, "fund_id")

    string_map = {item["string_id"]: item["strings"] for item in strings_raw}
    attribute_by_id = {item["id"]: item for item in attributes}
    growth_by_id = {item["template_id"]: item for item in growth_templates}
    rule_by_id = {(item["rule_type"], item["rule_id"]): item for item in growth_rules}
    unit_by_id = {item["unit_id"]: item for item in unit_templates}
    appearance_by_id = {item["appearance_id"]: item for item in appearances}
    deploy_by_id = {item["deploy_template_id"]: item for item in deploys}
    level_by_id = {item["level_id"]: item for item in levels}
    award_group_by_id = {item["award_group_id"]: item for item in award_groups}
    award_pool_by_id = {item["award_pool_id"]: item for item in award_pools}
    award_table_by_id = {item["award_table_id"]: item for item in award_tables}
    fund_by_id = {item["fund_id"]: item for item in fund_types}

    unit_to_chapter_levels: dict[int, list[int]] = defaultdict(list)
    chapter_for_level: dict[int, dict[str, Any]] = {}
    for chapter in chapters:
        for level_id in chapter["level_ids"]:
            chapter_for_level[level_id] = chapter

    def expand_awards(table_ids: list[int], trigger: str = "关卡固定奖励") -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for table_id in table_ids:
            table = award_table_by_id.get(table_id)
            if not table:
                result.append({"reward_trigger": trigger, "award_table_id": table_id, "unresolved": True})
                continue
            for table_item in table["items"]:
                pool_id = table_item["award_pool_id"]
                pool = award_pool_by_id.get(pool_id)
                if not pool:
                    result.append({
                        "reward_trigger": trigger,
                        "award_table_id": table_id,
                        "award_pool_id": pool_id,
                        "table_selector": table_item["raw_selector"],
                        "unresolved": True,
                    })
                    continue
                for pool_group_index, pool_group in enumerate(pool["groups"], start=1):
                    for pool_item_index, pool_item in enumerate(pool_group["items"], start=1):
                        group_id = pool_item["award_group_id"]
                        group = award_group_by_id.get(group_id)
                        if not group:
                            result.append({
                                "reward_trigger": trigger,
                                "award_table_id": table_id,
                                "award_pool_id": pool_id,
                                "award_group_id": group_id,
                                "pool_group_index": pool_group_index,
                                "pool_item_index": pool_item_index,
                                "pool_enabled_flag": pool_item["enabled_flag"],
                                "pool_demand_group_ids": ";".join(map(str, pool_item["demand_group_ids"])),
                                "unresolved": True,
                            })
                            continue
                        for item in group["items"]:
                            row = {
                                "reward_trigger": trigger,
                                "award_table_id": table_id,
                                "award_table_name": table["name"],
                                "table_selector": table_item["raw_selector"],
                                "award_pool_id": pool_id,
                                "pool_group_index": pool_group_index,
                                "pool_item_index": pool_item_index,
                                "pool_enabled_flag": pool_item["enabled_flag"],
                                "pool_demand_group_ids": ";".join(map(str, pool_item["demand_group_ids"])),
                                "award_group_id": group_id,
                                "award_group_name": group["name"],
                                **item,
                            }
                            if item["item_type"] == 1 and item["values"]:
                                fund_id = item["values"][0]
                                fund = fund_by_id.get(fund_id, {})
                                row.update({
                                    "item_category": "货币/资源",
                                    "item_id": fund_id,
                                    "item_name": first_string(string_map, fund.get("name_string_id")) or fund.get("code", ""),
                                    "item_code": fund.get("code", ""),
                                    "fund_type": fund.get("fund_type"),
                                })
                            elif item["item_type"] == 0 and item["values"]:
                                row.update({"item_category": "物品/装备（类型0）", "item_id": item["values"][0]})
                            else:
                                row.update({"item_category": f"奖励类型{item['item_type']}"})
                            result.append(row)
        return result

    level_rows: list[dict[str, Any]] = []
    enemy_rows: list[dict[str, Any]] = []
    reward_rows: list[dict[str, Any]] = []
    for level in levels:
        chapter = chapter_for_level.get(level["level_id"], {})
        deploy = deploy_by_id.get(level["deploy_template_id"], {})
        awards = expand_awards(level["award_table_ids"])
        assessment_award_ids: list[int] = []
        for assessment in level["assessment_awards"]:
            assessment_award_ids.extend(assessment["award_table_ids"])
            awards.extend(expand_awards(
                assessment["award_table_ids"],
                f"评价奖励(type={assessment['assessment_type']}, value={assessment['assessment_value']})",
            ))
        silver_items = [
            item for item in awards
            if any(token in (item.get("item_name", "") + item.get("item_code", "")).lower()
                   for token in ("银", "silver", "metal"))
        ]
        experience_items = [
            item for item in awards
            if any(token in (item.get("item_name", "") + item.get("item_code", "")).lower()
                   for token in ("经验", "experience", "exp"))
        ]
        silver_values = sorted({item.get("amount_or_weight", 0) for item in silver_items})
        experience_values = sorted({item.get("amount_or_weight", 0) for item in experience_items})
        silver = "/".join(map(str, silver_values)) if silver_values else None
        experience = "/".join(map(str, experience_values)) if experience_values else None
        level_rows.append({
            "chapter_id": chapter.get("chapter_id"),
            "chapter_name": first_string(string_map, chapter.get("name_string_id")),
            "chapter_title": first_string(string_map, chapter.get("title_string_id")),
            "chapter_mode": chapter.get("mode_code", ""),
            "level_id": level["level_id"],
            "level_name": first_string(string_map, level["name_string_id"]),
            "field_type": level["field_type"],
            "deploy_template_id": level["deploy_template_id"],
            "enemy_count": len(deploy.get("units", [])),
            "enemy_summary": "",
            "award_table_ids": ";".join(map(str, level["award_table_ids"])),
            "assessment_award_table_ids": ";".join(map(str, assessment_award_ids)),
            "reward_summary": "",
            "experience_reward": experience,
            "silver_reward": silver,
            "demand_group_ids": ";".join(map(str, level["demand_group_ids"])),
            "consume_group_ids": ";".join(map(str, level["consume_group_ids"])),
            "formation_expense_group_id": level["formation_expense_group_id"],
            "formation_expense_ids": ";".join(map(str, level["formation_expense_ids"])),
            "raw_scalars": ";".join(str(level[f"raw_scalar_{i}"]) for i in range(9)),
        })
        for reward in awards:
            reward_rows.append({
                "chapter_id": chapter.get("chapter_id"),
                "level_id": level["level_id"],
                **reward,
            })

        enemy_names: list[str] = []
        for sequence, deployed in enumerate(deploy.get("units", []), start=1):
            unit_id = deployed["unit_template_id"]
            unit_to_chapter_levels[unit_id].append(level["level_id"])
            unit = unit_by_id.get(unit_id, {})
            appearance = appearance_by_id.get(unit.get("appearance_id"), {})
            name = first_string(string_map, appearance.get("name_string_id"))
            enemy_names.append(name or f"单位{unit_id}")
            visible_level = unit.get("visible_level")
            growth = growth_by_id.get(unit_id)
            stats = stats_for_template(growth, visible_level, rule_by_id) if growth and visible_level is not None else {}
            row: dict[str, Any] = {
                "chapter_id": chapter.get("chapter_id"),
                "chapter_name": first_string(string_map, chapter.get("name_string_id")),
                "level_id": level["level_id"],
                "level_name": first_string(string_map, level["name_string_id"]),
                "deploy_template_id": level["deploy_template_id"],
                "enemy_sequence": sequence,
                "formation_position": deployed["formation_position"],
                "deploy_flag": deployed["deploy_flag"],
                "unit_template_id": unit_id,
                "enemy_name": name,
                "visible_level": visible_level,
                "appearance_id": unit.get("appearance_id"),
                "attack_type": appearance.get("attack_type"),
                "unit_class_id": appearance.get("unit_class_id"),
                "unit_class_name": APPEARANCE_TYPE_CHINESE.get(appearance.get("unit_class_id"), ""),
                "rarity": appearance.get("rarity"),
                "model_id": appearance.get("model_id"),
                "growth_template_id": unit_id if growth else None,
                "growth_template_found": bool(growth),
                "calculated_attribute_count": len(stats),
            }
            for attribute_id, value in stats.items():
                code = attribute_by_id.get(attribute_id, {}).get("code", f"ATTR_{attribute_id}")
                row[code] = value
            enemy_rows.append(row)
        level_rows[-1]["enemy_summary"] = "、".join(enemy_names)
        reward_labels = list(dict.fromkeys(
            (f"未解析奖励表{item.get('award_table_id')}" if item.get("unresolved") else
             f"{item.get('item_name') or item.get('item_category', '未命名奖励')}×{item.get('amount_or_weight', '')}")
            for item in awards
        ))
        level_rows[-1]["reward_summary"] = "；".join(reward_labels[:50])
        if len(reward_labels) > 50:
            level_rows[-1]["reward_summary"] += f"；……另有{len(reward_labels) - 50}种配置分支（详见奖励掉落表）"

    used_unit_ids = set(unit_to_chapter_levels)
    reward_fund_ids = sorted({
        row["item_id"] for row in reward_rows
        if row.get("item_type") == 1 and row.get("item_id") is not None
    })
    reward_fund_catalog = []
    for fund_id in reward_fund_ids:
        fund = fund_by_id.get(fund_id, {})
        reward_fund_catalog.append({
            "fund_id": fund_id,
            "code": fund.get("code", ""),
            "name_strings": string_map.get(fund.get("name_string_id"), []),
            "fund_type": fund.get("fund_type"),
        })
    metadata = {
        "source_config": str(config_path("ChapterLevelInfo.dat").parent.relative_to(ROOT)),
        "counts": {
            "chapters": len(chapters),
            "levels": len(levels),
            "deploy_templates": len(deploys),
            "award_tables": len(award_tables),
            "award_pools": len(award_pools),
            "award_groups": len(award_groups),
            "enemy_placements": len(enemy_rows),
            "unique_enemy_templates": len(used_unit_ids),
            "rewards": len(reward_rows),
            "enemy_templates_with_growth": sum(unit_id in growth_by_id for unit_id in used_unit_ids),
            "enemy_templates_with_appearance_id_growth_match": sum(
                unit_by_id.get(unit_id, {}).get("appearance_id") in growth_by_id for unit_id in used_unit_ids
            ),
            "levels_without_chapter": sum(row["chapter_id"] is None for row in level_rows),
            "levels_without_deploy_template": sum(
                level["deploy_template_id"] not in deploy_by_id for level in levels
            ),
            "enemy_rows_without_unit_template": sum(
                row["unit_template_id"] not in unit_by_id for row in enemy_rows
            ),
            "enemy_rows_without_name": sum(not row["enemy_name"] for row in enemy_rows),
            "reward_rows_unresolved": sum(bool(row.get("unresolved")) for row in reward_rows),
            "levels_with_static_reward_rows": sum(bool(row["reward_summary"]) for row in level_rows),
            "levels_with_identified_experience": sum(row["experience_reward"] is not None for row in level_rows),
            "levels_with_identified_silver": sum(row["silver_reward"] is not None for row in level_rows),
        },
        "award_item_type_counts": dict(sorted(Counter(
            item["item_type"] for item in reward_rows if "item_type" in item
        ).items())),
        "reward_fund_catalog": reward_fund_catalog,
        "attribute_columns": [item["code"] for item in attributes],
        "attribute_chinese": ATTRIBUTE_CHINESE,
        "notes": [
            "敌人战斗属性仅在单位模板ID与属性成长模板ID同值时静态计算，并以单位模板可见等级代入；该关联属于保守的同ID匹配。",
            "空白战斗属性表示客户端静态配置没有可证实的成长模板关联，或属性依赖服务端/战斗时动态输入。",
            "奖励数量为配置表静态数量；含权重/奖池的结果仍需按服务器抽取规则结算。",
            "经验和银币列展示静态奖励链路中可明确识别的候选金额（去重，以/分隔），不是把互斥奖池分支相加；空白表示客户端配置未给出可确认数值，并非0。",
            "raw_scalars 为尚未可靠命名的关卡原始标量字段，按配置顺序保留。",
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "metadata": metadata,
        "levels": level_rows,
        "enemies": enemy_rows,
        "rewards": reward_rows,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "source_config": metadata["source_config"],
        "counts": metadata["counts"],
        "award_item_type_counts": metadata["award_item_type_counts"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
