#!/usr/bin/env python3
"""Build the global Technology-page data directly from client configs."""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Any

from decode_configs import (
    config_path,
    parse_arranged_styles,
    parse_award_groups,
    parse_award_tables,
    parse_capsule_phases,
    parse_capsule_types,
    parse_consume_groups,
    parse_crafts,
    parse_demand_groups,
    parse_fund_types,
    parse_growth_rules,
    parse_growth_templates,
    parse_produce_rules,
    parse_string_table,
    parse_unit_attributes,
)
from build_steel_maiden_catalog import ammo_stats

DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "output" / "technology_catalog" / "technology_catalog.json"

CATEGORIES = {
    "常规弹": "主炮", "硬芯弹": "主炮", "脱壳弹": "主炮", "榴弹": "主炮",
    "火箭弹": "主炮", "破甲弹": "主炮", "碎甲弹": "主炮",
    "航空常规弹": "主炮", "航空火箭弹": "主炮",
    "标准防护": "防护", "重装防护": "防护", "轻薄防护": "防护", "航空防护": "防护",
    "综合车身": "车体", "综合车体": "车体", "航空机身": "车体",
    "综合引擎": "引擎", "航空引擎": "引擎", "综合索敌": "侦查",
}
ORDER = list(CATEGORIES)
DISPLAY_SECONDARY = {"综合车体": "综合车身"}
GENERATION_SUFFIX = {"初期": 1, "二期": 2, "三期": 3}
STAT_NAMES = {
    32: "火力", 63: "穿甲",
    2: "耐久", 3: "装甲", 4: "命中", 5: "回避", 6: "隐蔽", 7: "侦查", 9: "射程",
}
BLOCK_ATTRIBUTE_NAMES = {
    "标准防护": ("耐久", "装甲"), "重装防护": ("耐久", "装甲"), "轻薄防护": ("耐久", "装甲"), "航空防护": ("耐久", "装甲"),
    "综合车体": ("命中",), "综合车身": ("命中",), "航空机身": ("命中",),
    "综合引擎": ("回避",), "航空引擎": ("回避",),
    "综合索敌": ("隐蔽", "侦查"),
}


def first_text(strings: dict[int, list[str]], string_id: int | None) -> str:
    if not string_id:
        return ""
    return next((value for value in strings.get(string_id, []) if value), "")


def number(item: dict[str, Any], entry_id: int) -> int | None:
    return next((entry["value"] for entry in item["number_entries"] if entry["entry_id"] == entry_id), None)


def text(item: dict[str, Any], entry_id: int) -> str:
    return next((entry["value"] for entry in item["string_entries"] if entry["entry_id"] == entry_id), "")


def split_title(title: str) -> tuple[str, int] | None:
    normalized = title.replace("_", "·")
    for name in ORDER:
        if not normalized.startswith(name):
            continue
        generation = next((value for suffix, value in GENERATION_SUFFIX.items() if suffix in normalized), None)
        if generation:
            return name, generation
    return None


def frontend_craft_lookup(path: Path) -> dict[int, dict[str, Any]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result: dict[int, dict[str, Any]] = {}
    for maiden in data.get("rows", []):
        for key in ("ammunition", "engineOptions", "bodyOptions", "armorOptions"):
            for item in maiden.get(key, []):
                craft_id = item.get("id")
                if not craft_id:
                    continue
                current = result.setdefault(craft_id, {"stats": [], "traits": [], "image": item.get("image", "")})
                if not current["stats"] and item.get("stats"):
                    current["stats"] = item["stats"]
                effects = item.get("effects") or item.get("resistanceDetails") or []
                for effect in effects:
                    normalized = {
                        "name": effect.get("name", ""),
                        "description": effect.get("description", ""),
                        "image": effect.get("image", ""),
                    }
                    if normalized not in current["traits"]:
                        current["traits"].append(normalized)
    return result


def source_craft_lookup(path: Path) -> dict[int, dict[str, Any]]:
    """Collect every generation's client-derived craft-card attributes.

    The frontend maiden payload intentionally keeps only the ammunition cards
    shown in the character detail view.  Technology trees also contain lower
    generations and crafts unused by the currently selected character, so the
    complete generated client catalogue is the authoritative stats source.
    """
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result: dict[int, dict[str, Any]] = {}
    for maiden in data.get("rows", []):
        for key in ("全部阶段弹药", "可用引擎", "可用车体", "可用装甲"):
            for item in maiden.get(key, []):
                craft_id = item.get("工艺ID")
                if not craft_id:
                    continue
                stats = [
                    {
                        "key": stat.get("属性", ""),
                        "value": stat.get("数值", 0),
                        "effectType": stat.get("效果类型", 0),
                    }
                    for stat in item.get("属性", [])
                    if stat.get("属性")
                ]
                current = result.setdefault(craft_id, {"stats": []})
                if stats and not current["stats"]:
                    current["stats"] = stats
    return result


def hidden_craft_stats(crafts: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    """Read each technology craft's own hidden capsule, even if no maiden equips it."""
    capsule_by_tag = {
        tag: capsule["capsule_type_id"]
        for capsule in parse_capsule_types(config_path("CapsuleTypeInfo.dat"))
        if capsule.get("field_2") == 3
        for tag in capsule.get("group_b_ids", [])
    }
    phases, _ = parse_capsule_phases(config_path("CapsulePhaseInfo.dat"))
    phases_by_capsule: dict[int, list[dict[str, Any]]] = {}
    for phase in phases:
        phases_by_capsule.setdefault(phase["capsule_type_id"], []).append(phase)
    growth_by_id = {row["template_id"]: row for row in parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))}
    growth_rule_by_id = {
        (row["rule_type"], row["rule_id"]): row
        for row in parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    }
    attribute_by_id = {row["id"]: row for row in parse_unit_attributes(config_path("UnitAttributeInfo.dat"))}
    result = {}
    for craft in crafts:
        if 1405 not in craft["tags"]:
            continue
        craft_id = craft["craft_id"]
        capsule_id = capsule_by_tag.get(10000 + craft_id)
        if capsule_id is None:
            continue
        stats, _ = ammo_stats(capsule_id, phases_by_capsule, growth_by_id, growth_rule_by_id, attribute_by_id)
        result[craft_id] = [
            {"key": stat["属性"], "value": stat["数值"], "effectType": stat["效果类型"]}
            for stat in stats
            if stat["后台属性代码"] not in {"IGNITE", "RANGE", "BITRANGE"}
        ]
    return result


def style_traits(styles: list[dict[str, Any]], strings: dict[int, list[str]]) -> dict[int, list[dict[str, str]]]:
    result: dict[int, list[dict[str, str]]] = {}
    for style in styles:
        descriptions = [first_text(strings, number(item, 5)) for item in style["items"] if item["mode_code"] == "INDEX_FUNCTION_DESC"]
        description = next((value for value in descriptions if value), "")
        traits = []
        for item in style["items"]:
            if item["mode_code"] not in {"INDEX_ATTR", "INDEX_FUNCTION", "BIG_INDEX_FUNCTION"}:
                continue
            name = first_text(strings, number(item, 5))
            icon = text(item, 1)
            if name or icon:
                traits.append({"name": name, "description": description, "iconCode": icon})
        if traits:
            for tag in style["tags"]:
                result.setdefault(tag, []).extend(item for item in traits if item not in result.get(tag, []))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--maidens", type=Path, default=Path(__file__).resolve().parents[2] / "steel-maiden-browser" / "public" / "data" / "maidens.json")
    parser.add_argument("--catalog-source", type=Path, default=Path(__file__).resolve().parents[1] / "output" / "steel_maiden_catalog_v4" / "钢舞姬汇总数据.json")
    args = parser.parse_args()

    strings = {row["string_id"]: row["strings"] for row in parse_string_table(config_path("StringTableInfo.dat"))}
    styles = parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))
    crafts = parse_crafts(config_path("CraftInfo.dat"))
    craft_by_id = {row["craft_id"]: row for row in crafts}
    craft_by_tag: dict[int, list[dict[str, Any]]] = {}
    for craft in crafts:
        for tag in craft["tags"]:
            craft_by_tag.setdefault(tag, []).append(craft)
    craft_preview = frontend_craft_lookup(args.maidens)
    for craft_id, source in source_craft_lookup(args.catalog_source).items():
        current = craft_preview.setdefault(craft_id, {"stats": [], "traits": [], "image": ""})
        if source["stats"] and not current["stats"]:
            current["stats"] = source["stats"]
    hidden_stats = hidden_craft_stats(crafts)
    traits_by_tag = style_traits(styles, strings)

    funds = {row["fund_id"]: row for row in parse_fund_types(config_path("FundTypeInfo.dat"))}
    consumes = {row["consume_group_id"]: row for row in parse_consume_groups(config_path("ConsumeGroupInfo.dat"))}
    demands = {row["demand_group_id"]: row for row in parse_demand_groups(config_path("DemandGroupInfo.dat"))}
    award_groups = {row["award_group_id"]: row for row in parse_award_groups(config_path("AwardGroupInfo.dat"))}
    award_tables = {row["award_table_id"]: row for row in parse_award_tables(config_path("AwardTableInfo.dat"))}
    pool_bytes = config_path("AwardPoolInfo.dat").read_bytes()

    def pool_group(pool_id: int) -> int | None:
        needle = struct.pack("<I", pool_id)
        offset = pool_bytes.find(needle, 4)
        candidates: list[int] = []
        while offset >= 0:
            if offset + 16 <= len(pool_bytes):
                candidate = struct.unpack_from("<I", pool_bytes, offset + 12)[0]
                if candidate in award_groups:
                    candidates.append(candidate)
            offset = pool_bytes.find(needle, offset + 1)
        return candidates[0] if len(set(candidates)) == 1 else None

    def rule_awards(rule: dict[str, Any]) -> list[tuple[int, int, int]]:
        result = []
        for table_id in [*rule["field_c8"], *rule["field_e0"]]:
            table = award_tables.get(table_id)
            if not table:
                continue
            for table_item in table["items"]:
                group = award_groups.get(pool_group(table_item["award_group_id"]) or -1)
                if group:
                    result.extend((item["item_type"], item["values"][0], item["weight"]) for item in group["items"])
        return result

    def fund_icon(fund: dict[str, Any]) -> str:
        by_resource = {row["resource_id"]: row["resource"] for row in fund.get("resources", [])}
        return by_resource.get(9) or by_resource.get(5) or fund.get("icon", "")

    def rule_materials(rule: dict[str, Any]) -> list[dict[str, Any]]:
        amounts: dict[int, int] = {}
        for group_id in rule["field_b0"]:
            for consume in consumes.get(group_id, {}).get("items", []):
                if consume["item_type"] != 0:
                    continue
                fund_id = consume["values"][0]
                amounts[fund_id] = amounts.get(fund_id, 0) + consume["amount"]
        result = []
        for fund_id, amount in amounts.items():
            fund = funds.get(fund_id, {})
            result.append({
                "fundId": fund_id,
                "name": first_text(strings, fund.get("name_string_id")) or f"资源 #{fund_id}",
                "amount": amount,
                "iconCode": fund_icon(fund),
            })
        return result

    produce_rules = parse_produce_rules(config_path("ProduceRuleInfo.dat"))
    cost_by_craft: dict[int, list[dict[str, Any]]] = {}
    for rule in produce_rules:
        awarded = [value for item_type, value, _ in rule_awards(rule) if item_type in (0, 1)]
        if not awarded:
            continue
        materials = rule_materials(rule)
        if materials:
            for craft_id in awarded:
                if craft_id in craft_by_id:
                    cost_by_craft.setdefault(craft_id, materials)

    block_craft_ids = {craft["craft_id"] for craft in crafts if 1401 in craft["tags"]}
    level_rules: dict[int, dict[int, dict[str, Any]]] = {}
    for rule in produce_rules:
        if 1401 not in rule["field_40"]:
            continue
        awarded = [value for item_type, value, _ in rule_awards(rule) if item_type == 0 and value in block_craft_ids]
        if not awarded:
            continue
        demand_items = [
            item
            for group_id in rule["field_98"]
            for item in demands.get(group_id, {}).get("items", [])
        ]
        for craft_id in awarded:
            previous_level = next((item["values"][1] for item in demand_items if item["item_type"] == 1 and item["values"][0] == craft_id), None)
            commander_level = next((item["values"][1] for item in demand_items if item["item_type"] == 1 and item["values"][0] == 1), None)
            if previous_level is None or not 0 <= previous_level < 16:
                continue
            level_rules.setdefault(craft_id, {})[previous_level + 1] = {
                "ruleId": rule["rule_id"],
                "commanderLevel": commander_level,
                "cost": rule_materials(rule),
            }

    blocks = []
    all_icon_codes: set[str] = set()
    for style in styles:
        block_item = next((item for item in style["items"] if item["mode_code"] == "BANKUAI"), None)
        group_item = next((item for item in style["items"] if item["mode_code"] == "tech_group"), None)
        if not block_item or not group_item:
            continue
        title = first_text(strings, number(block_item, 5))
        parsed = split_title(title)
        if not parsed:
            continue
        source_secondary, generation = parsed
        secondary = DISPLAY_SECONDARY.get(source_secondary, source_secondary)
        group_tag = number(group_item, 7)
        block_craft = next((craft for craft in craft_by_tag.get(group_tag or -1, []) if 1401 in craft["tags"]), None)
        if not block_craft:
            continue
        nodes = []
        positions: dict[tuple[int, int], int] = {}
        for item in style["items"]:
            if item["mode_code"] != "tech_node":
                continue
            tag = number(item, 7) or 0
            x, y = number(item, 2) or 0, number(item, 3) or 0
            node_craft = next((craft for craft in craft_by_tag.get(tag, []) if 1405 in craft["tags"]), None)
            craft_id = node_craft["craft_id"] if node_craft else 0
            preview = craft_preview.get(craft_id, {})
            node_traits = list(preview.get("traits", []))
            for craft_tag in (node_craft or {}).get("tags", []):
                for trait in traits_by_tag.get(craft_tag, []):
                    normalized = {"name": trait["name"], "description": trait["description"], "image": "", "iconCode": trait["iconCode"]}
                    existing = next((row for row in node_traits if row.get("name") == normalized["name"]), None)
                    if existing:
                        if not existing.get("description") and normalized["description"]:
                            existing["description"] = normalized["description"]
                        if not existing.get("image") and normalized["iconCode"]:
                            existing["iconCode"] = normalized["iconCode"]
                    else:
                        node_traits.append(normalized)
            icon_code = text(item, 1)
            all_icon_codes.add(icon_code)
            nodes.append({
                "tag": tag, "craftId": craft_id, "name": first_text(strings, number(item, 5)),
                "iconCode": icon_code, "image": preview.get("image", ""), "x": x, "y": y,
                "stats": preview.get("stats") or hidden_stats.get(craft_id, []), "traits": node_traits,
                "cost": cost_by_craft.get(craft_id, []),
            })
            positions[(x, y)] = tag

        lines = []
        current: dict[str, Any] | None = None
        for item in style["items"]:
            if item["mode_code"] != "tech_line":
                continue
            point = {"x": number(item, 2) or 0, "y": number(item, 3) or 0}
            if item["filter_code"] == "Line_Start":
                current = {"from": number(item, 7) or 0, "to": 0, "points": [point]}
            elif current is not None:
                current["points"].append(point)
                if item["filter_code"] == "Line_End":
                    current["to"] = positions.get((point["x"], point["y"]), 0)
                    lines.append(current)
                    current = None

        table = []
        block_level_rules = level_rules.get(block_craft["craft_id"], {})
        expected_levels = len(block_craft["levels"][1:])
        if len(block_level_rules) != expected_levels:
            missing = sorted(set(range(1, expected_levels + 1)) - set(block_level_rules))
            raise RuntimeError(f"technology block {title} is missing upgrade rules for levels {missing}")
        cumulative_materials: dict[int, dict[str, Any]] = {}
        for sequence, level_row in enumerate(block_craft["levels"][1:], 1):
            effects = [row for row in level_row["property_effects"] if row["property_id"] not in {60, 61, 62, 63, 64}]
            level_rule = block_level_rules[sequence]
            for material in level_rule["cost"]:
                total = cumulative_materials.setdefault(material["fundId"], {**material, "amount": 0})
                total["amount"] += material["amount"]
            table.append({
                "level": sequence,
                "commanderLevel": level_rule["commanderLevel"],
                "ruleId": level_rule["ruleId"],
                "attributes": [
                    {
                        "propertyId": effect["property_id"],
                        "name": (
                            ("火力", "穿甲")[effect_index]
                            if CATEGORIES[source_secondary] == "主炮" and effect_index < 2
                            else BLOCK_ATTRIBUTE_NAMES.get(source_secondary, ())[effect_index]
                            if effect_index < len(BLOCK_ATTRIBUTE_NAMES.get(source_secondary, ()))
                            else STAT_NAMES.get(effect["property_id"] % 100, f"属性 {effect['property_id']}")
                        ),
                        "value": effect["value"] / 100,
                        "effectType": effect["effect_type"],
                    }
                    for effect_index, effect in enumerate(effects)
                ],
                "cost": level_rule["cost"],
                "cumulativeCost": [dict(material) for material in cumulative_materials.values()],
            })
        icon_code = text(block_item, 1)
        all_icon_codes.add(icon_code)
        blocks.append({
            "id": f"{secondary}-{generation}", "category": CATEGORIES[source_secondary], "secondary": secondary,
            "generation": generation, "title": title.replace("_", "·"), "iconCode": icon_code,
            "styleId": style["arranged_style_id"], "craftId": block_craft["craft_id"],
            "nodes": nodes, "lines": lines, "levels": table,
        })

    display_order = list(dict.fromkeys(DISPLAY_SECONDARY.get(name, name) for name in ORDER))
    blocks.sort(key=lambda row: (list(dict.fromkeys(CATEGORIES.values())).index(row["category"]), display_order.index(row["secondary"]), row["generation"]))
    payload = {
        "source": {"tree": "ArrangedStyleInfo.dat", "growth": "CraftInfo.dat", "requirements": "ProduceRuleInfo.dat / DemandGroupInfo.dat / ConsumeGroupInfo.dat"},
        "categories": [{"name": name, "secondary": list(dict.fromkeys(DISPLAY_SECONDARY.get(item, item) for item in ORDER if CATEGORIES[item] == name))} for name in dict.fromkeys(CATEGORIES.values())],
        "blocks": blocks,
        "iconCodes": sorted(code for code in all_icon_codes if code),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(blocks)} technology blocks to {args.output}")


if __name__ == "__main__":
    main()
