#!/usr/bin/env python3
"""Build a Chinese steel-maiden catalogue from the decoded test-server configs."""

from __future__ import annotations

import argparse
import collections
import csv
import json
from pathlib import Path
from typing import Any

from decode_configs import (
    APPEARANCE_TYPE_CHINESE,
    ATTRIBUTE_CHINESE,
    config_path,
    parse_arranged_styles,
    parse_capsule_faculty_trains,
    parse_capsule_phases,
    parse_capsule_types,
    parse_crafts,
    parse_feature_calculations,
    parse_faculty_extend_links,
    parse_faculty_trend_groups,
    parse_growth_rules,
    parse_growth_templates,
    parse_string_table,
    parse_unit_appearances,
    parse_unit_attributes,
    parse_unit_trait_growth_rules,
    parse_unit_trait_types,
    stats_for_template,
    traits_for_growth_rule,
)


DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "output" / "steel_maiden_catalog"
LEVELS = (1, 60, 90, 99)

RARITY_CHINESE = {2: "一级", 3: "二级", 4: "三级"}
RARITY_COLOR_CHINESE = {2: "蓝", 3: "紫", 4: "金"}
REQUESTED_ATTRIBUTE_LABELS = {
    "MAXHP": "耐久",
    "POWER": "火力",
    "PIERCING": "穿甲",
    "TOHIT": "命中",
    "ARMOR": "装甲",
    "DODGE": "回避",
    "HIDE": "隐蔽",
    "SCOUT": "侦查",
    "ANTIFIRE": "阻燃后台值",
    "HOMOGENEITY": "均质度后台值",
    "COVERING": "覆盖度后台值",
}
AMMO_GROUP_CHINESE = {
    51: "穿甲弹",
    52: "硬芯弹",
    53: "脱壳弹",
    54: "榴弹",
    55: "火箭弹",
    56: "破甲弹",
    57: "碎甲弹",
}
AMMO_ATTRIBUTE_CHINESE = {
    "MAXHP": "耐久",
    "POWER": "火力",
    "PIERCING": "穿甲",
    "TOHIT": "命中",
    "ARMOR": "装甲",
    "DODGE": "回避",
    "RANGE": "射程",
    "HIDE": "隐蔽",
    "SCOUT": "侦查",
    "IGNITE": "点燃",
    # Ground ammunition normally stores a range bit-mask instead of a metre
    # value. Keep it explicit rather than presenting the mask as a distance.
    "BITRANGE": "射程段",
}
TRAIT_CHINESE = {
    11: "演艺",
    12: "料理",
    13: "技工",
    14: "护理",
    15: "运动",
    16: "知性",
    91: "美妆",
    92: "商贸",
    93: "武学",
    94: "心理",
    95: "编程",
    96: "文学",
}
NATION_TAG_CHINESE = {
    841: "德国",
    842: "美国",
    843: "苏联",
    844: "英国",
    845: "法国",
    846: "中国",
    847: "日本",
    848: "韩国",
    849: "瑞典",
    850: "意大利",
    851: "架空阵营A",
    852: "架空/特殊阵营",
    853: "瑞士",
    854: "匈牙利",
    855: "澳大利亚",
    856: "巴西",
    857: "以色列",
    858: "捷克斯洛伐克/捷克",
    859: "罗马尼亚",
    880: "伊拉克",
    881: "泰国",
    882: "波兰",
    883: "墨西哥",
    884: "西班牙",
    885: "芬兰",
    886: "新加坡",
    887: "伊朗",
    888: "印度",
    889: "土耳其",
}


def first_text(strings: dict[int, list[str]], string_id: int | None) -> str:
    values = strings.get(string_id or -1, [])
    return values[0] if values else ""


def item_values(item: dict[str, Any], strings: dict[int, list[str]]) -> list[str]:
    values: list[str] = []
    for entry in item["number_entries"]:
        if entry["entry_id"] == 5:
            text = first_text(strings, entry["value"])
            if text:
                values.append(text)
    for entry in item["string_entries"]:
        if entry["entry_id"] == 1 and entry["value"]:
            values.append(entry["value"])
    return values


def mode_values(
    style: dict[str, Any] | None,
    mode_code: str,
    strings: dict[int, list[str]],
) -> list[str]:
    values: list[str] = []
    for item in (style or {}).get("items", []):
        if item["mode_code"] != mode_code:
            continue
        for value in item_values(item, strings):
            if value not in values:
                values.append(value)
    return values


def best_tagged_style(
    styles: list[dict[str, Any]],
    capsule_tags: set[int],
    required_mode: str,
) -> dict[str, Any] | None:
    candidates = [
        style
        for style in styles
        if any(item["mode_code"] == required_mode for item in style["items"])
        and capsule_tags.intersection(style["tags"])
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda style: (
            len(capsule_tags.intersection(style["tags"])),
            max((tag for tag in capsule_tags.intersection(style["tags"])), default=0),
            style["arranged_style_id"],
        ),
    )


def normalized_label(value: str) -> str:
    return "".join(value.split())


def build_tag_label_map(
    styles: list[dict[str, Any]],
    strings: dict[int, list[str]],
    mode_code: str,
) -> dict[int, str]:
    result: dict[int, str] = {}
    for style in styles:
        labels = mode_values(style, mode_code, strings)
        label = normalized_label(labels[0]) if labels else ""
        if not label:
            continue
        for tag in style["tags"]:
            result.setdefault(tag, label)
    return result


def craft_name(craft: dict[str, Any] | None, strings: dict[int, list[str]]) -> str:
    return first_text(strings, (craft or {}).get("name_string_id"))


def trend_crafts_for_card(
    card_id: int,
    generation: int,
    category_id: int,
    trains_by_card: dict[int, list[dict[str, Any]]],
) -> list[int]:
    result: set[int] = set()
    for train in trains_by_card.get(card_id, []):
        generations = train["group_c_values"] or [0]
        if generation not in generations:
            continue
        for change in train["trend_changes"]:
            for ratio_group in change["ratio_groups"]:
                if ratio_group["category_id"] == category_id:
                    result.update(ratio_group["trend_ids"])
    return sorted(result)


def ammo_type_for_craft(craft_id: int, name: str) -> str:
    group = craft_id // 100
    if group in AMMO_GROUP_CHINESE:
        return AMMO_GROUP_CHINESE[group]
    if group == 65:
        if "机炮弹" in name:
            return "机炮弹"
        if "火炮弹" in name:
            return "航空火炮弹"
        return "航空炮弹"
    if group == 67:
        return "飞弹" if "飞弹" in name else "火箭弹"
    if "火箭弹" in name:
        return "火箭弹"
    if "飞弹" in name or "导弹" in name:
        return "飞弹"
    return ""


def entry_number(item: dict[str, Any], entry_id: int) -> int | None:
    return next(
        (entry["value"] for entry in item["number_entries"] if entry["entry_id"] == entry_id),
        None,
    )


def entry_string(item: dict[str, Any], entry_id: int) -> str:
    return next(
        (entry["value"] for entry in item["string_entries"] if entry["entry_id"] == entry_id),
        "",
    )


# Client BANKUAI technology tiers shared by engine/body/armor crafts.  The
# corresponding phase tags are read by the same craft-selection UI.
CRAFT_TECH_RANK_BY_TAG = {
    116049: {"阶段序号": 1, "阶段": "一期"},
    116050: {"阶段序号": 2, "阶段": "二期"},
    116051: {"阶段序号": 3, "阶段": "三期"},
    116031: {"阶段序号": 1, "阶段": "一期"},
    116032: {"阶段序号": 2, "阶段": "二期"},
    116033: {"阶段序号": 3, "阶段": "三期"},
    116037: {"阶段序号": 1, "阶段": "一期"},
    116038: {"阶段序号": 2, "阶段": "二期"},
    116039: {"阶段序号": 3, "阶段": "三期"},
    116040: {"阶段序号": 1, "阶段": "一期"},
    116041: {"阶段序号": 2, "阶段": "二期"},
    116042: {"阶段序号": 3, "阶段": "三期"},
    116043: {"阶段序号": 1, "阶段": "一期"},
    116044: {"阶段序号": 2, "阶段": "二期"},
    116045: {"阶段序号": 3, "阶段": "三期"},
    116046: {"阶段序号": 1, "阶段": "一期"},
    116047: {"阶段序号": 2, "阶段": "二期"},
    116048: {"阶段序号": 3, "阶段": "三期"},
}


def build_ammo_rank_map(
    styles: list[dict[str, Any]], strings: dict[int, list[str]]
) -> dict[int, dict[str, Any]]:
    """Resolve the explicit 初期/二期/三期 groups used by the in-game craft UI."""
    result: dict[int, dict[str, Any]] = {}
    for style in styles:
        sub_items = [item for item in style["items"] if item["mode_code"] == "SUB"]
        for rank, item in enumerate(sub_items, 1):
            tag = entry_number(item, 7)
            if tag is None or not 116000 <= tag < 117000:
                continue
            label_id = entry_number(item, 5)
            result[tag] = {
                "阶段序号": rank,
                "阶段": first_text(strings, label_id),
                "类型图标代码": entry_string(item, 1),
                "技术分组样式ID": style["arranged_style_id"],
            }
    return result


def build_ammo_effect_map(
    styles: list[dict[str, Any]], strings: dict[int, list[str]]
) -> dict[int, list[dict[str, str]]]:
    """Resolve the same attribute/function badges shown on craft icons in CardInfoUI."""
    result: dict[int, list[dict[str, str]]] = collections.defaultdict(list)
    for style in styles:
        descriptions = mode_values(style, "INDEX_FUNCTION_DESC", strings)
        description = descriptions[0] if descriptions else ""
        candidates = [
            item for item in style["items"]
            if item["mode_code"] in {"INDEX_ATTR", "INDEX_FUNCTION", "BIG_INDEX_FUNCTION"}
        ]
        for item in candidates:
            label_id = entry_number(item, 5)
            label = normalized_label(first_text(strings, label_id))
            icon = entry_string(item, 1)
            if not label and not icon:
                continue
            effect = {
                "名称": label or "特殊效果",
                "说明": description,
                "图标代码": icon,
                "类型": "属性" if item["mode_code"] == "INDEX_ATTR" else "特效",
            }
            for tag in style["tags"]:
                if effect not in result[tag]:
                    result[tag].append(effect)
    return dict(result)


def ammo_stats(
    ammo_capsule_id: int | None,
    phases_by_capsule: dict[int, list[dict[str, Any]]],
    growth_by_id: dict[int, dict[str, Any]],
    growth_rule_by_id: dict[tuple[int, int], dict[str, Any]],
    attribute_by_id: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[int]]:
    """Read the hidden ammunition card used by the client preview.

    CraftInfo's POWER/PIERCING-looking values are conversion inputs shared by
    whole ammunition families. The actual item values shown by the client live
    on an otherwise hidden capsule and its attribute growth template.
    """
    if ammo_capsule_id is None:
        return [], []
    phases = phases_by_capsule.get(ammo_capsule_id, [])
    if not phases:
        return [], []
    template_ids = extract_attribute_template_ids(
        min(phases, key=lambda item: item["phase"])
    )
    calculated: dict[int, int] = collections.defaultdict(int)
    for template_id in template_ids:
        template = growth_by_id.get(template_id)
        if template is None:
            continue
        for attribute_id, value in stats_for_template(
            template, 1, growth_rule_by_id
        ).items():
            calculated[attribute_id] += value
    result: list[dict[str, Any]] = []
    for attribute_id, value in calculated.items():
        code = attribute_by_id.get(attribute_id, {}).get("code", "")
        label = AMMO_ATTRIBUTE_CHINESE.get(code)
        if not label:
            continue
        result.append(
            {
                "属性": label,
                "数值": value,
                "效果类型": 0,
                "后台属性ID": attribute_id,
                "后台属性代码": code,
                "数据来源": "隐藏弹药卡牌成长模板",
            }
        )
    order = {label: index for index, label in enumerate(AMMO_ATTRIBUTE_CHINESE.values())}
    result.sort(key=lambda item: order.get(item["属性"], 999))
    return result, template_ids


def faculty_preview_stats(
    phase: dict[str, Any],
    category_id: int,
    trend_id: int,
    trend_by_id: dict[int, dict[str, Any]],
    extend_link_by_id: dict[int, dict[str, Any]],
    growth_by_id: dict[int, dict[str, Any]],
    growth_rule_by_id: dict[tuple[int, int], dict[str, Any]],
    attribute_by_id: dict[int, dict[str, Any]],
    *,
    include_category_base: bool = True,
) -> tuple[list[dict[str, Any]], list[int]]:
    """Reproduce GetCardFacultyAttribute for the equipment-swap preview.

    EnhanceUI calls the native function with the card phase, category 3,
    intensity 1 and the selected craft/trend id.  The native path expands the
    card's FacultyTrendGroupInfo entry and then converts every referenced
    AttributeGrowthTemplate at intensity 1.  The returned values are the final
    card attributes after equipping that ammunition, including its fixed range.
    """

    category = next(
        (item for item in phase["faculty_categories"] if item["category_id"] == category_id),
        None,
    )
    if category is None:
        return [], []
    limit = category["limit_config"]

    # GetCardFacultyAttribute (used by the ammunition swap preview) starts
    # with the card/category base effects and then applies the selected trend.
    # The engine/body/armor craft cards use the selected trend's own effects;
    # including the category base here would incorrectly turn a craft bonus
    # into the complete post-equip vehicle panel.
    effects: list[dict[str, Any]] = []
    if include_category_base:
        effects.extend(limit.get("extend_effects", []))
        for link_id in limit.get("extend_group_ids", []):
            link = extend_link_by_id.get(link_id)
            if link:
                effects.extend(link["extend_effects"])

    trend_group = trend_by_id.get(limit.get("field_0", 0))
    trend_item = next(
        (
            item
            for item in (trend_group or {}).get("items", [])
            if item["trend_id"] == trend_id
        ),
        None,
    )
    if trend_item:
        effects.extend(trend_item["extend_effects"])
        for link_id in trend_item["extend_group_ids"]:
            link = extend_link_by_id.get(link_id)
            if link:
                effects.extend(link["extend_effects"])

    preset_by_category = {
        item["category_id"]: item["values"] for item in phase["preset_categories"]
    }
    template_ids: list[int] = []
    for effect in effects:
        for config in effect["attribute_configs"]:
            template_ids.extend(config["group_a_ids"])
            for preset_category_id in config["flags"]:
                template_ids.extend(preset_by_category.get(preset_category_id, []))

    calculated: dict[int, int] = collections.defaultdict(int)
    for template_id in template_ids:
        template = growth_by_id.get(template_id)
        if template is None:
            continue
        for attribute_id, value in stats_for_template(
            template, 1, growth_rule_by_id
        ).items():
            calculated[attribute_id] += value

    result: list[dict[str, Any]] = []
    for attribute_id, value in calculated.items():
        code = attribute_by_id.get(attribute_id, {}).get("code", "")
        label = AMMO_ATTRIBUTE_CHINESE.get(code)
        if not label:
            continue
        result.append(
            {
                "属性": label,
                "数值": value,
                "效果类型": 0,
                "后台属性ID": attribute_id,
                "后台属性代码": code,
                "数值来源": (
                    "钢舞姬阶段配置 × 弹药趋势（换弹界面同源）"
                    if include_category_base
                    else "工艺趋势自身属性模板（装备工艺卡片同源）"
                ),
            }
        )
    order = {label: index for index, label in enumerate(AMMO_ATTRIBUTE_CHINESE.values())}
    result.sort(key=lambda item: order.get(item["属性"], 999))
    return result, template_ids


def grade_letter(code: str, value: int) -> str:
    """Reproduce the front-end letter bands recovered from observed cards."""
    thresholds = {
        "ANTIFIRE": ((80, "S"), (70, "A"), (60, "B"), (40, "C")),
        "COVERING": ((80, "S"), (65, "A"), (50, "B"), (35, "C")),
        "HOMOGENEITY": ((80, "S"), (72, "A"), (55, "B"), (40, "C")),
    }
    for minimum, label in thresholds[code]:
        if value >= minimum:
            return label
    return "D"


def extract_attribute_template_ids(phase: dict[str, Any]) -> list[int]:
    category = next(
        item for item in phase["faculty_categories"] if item["category_id"] == 1
    )
    result: list[int] = []
    for effect in category["limit_config"]["extend_effects"]:
        for config in effect["attribute_configs"]:
            result.extend(config["group_a_ids"])
    return result


def extract_trait_growth_rule_ids(phase: dict[str, Any]) -> list[int]:
    category = next(
        (item for item in phase["faculty_categories"] if item["category_id"] == 2),
        None,
    )
    if category is None:
        return []
    result: list[int] = []
    for effect in category["limit_config"]["extend_effects"]:
        result.extend(effect["group_b_ids"])
    return result


def derived_tech_stage(tags: list[int]) -> str:
    for tag in tags:
        bucket = tag // 100
        if 372835 <= bucket <= 372840:
            return f"N{bucket - 372834}"
    return ""


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_text_atomic(path: Path, value: str) -> None:
    """Replace large generated files atomically (also tolerates active readers)."""
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    attributes = parse_unit_attributes(config_path("UnitAttributeInfo.dat"))
    appearances = parse_unit_appearances(config_path("UnitAppearanceInfo.dat"))
    strings_list = parse_string_table(config_path("StringTableInfo.dat"))
    styles = parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))
    capsule_types = parse_capsule_types(config_path("CapsuleTypeInfo.dat"))
    capsule_trains = parse_capsule_faculty_trains(
        config_path("CapsuleFacultyTrainInfo.dat")
    )
    crafts = parse_crafts(config_path("CraftInfo.dat"))
    phases, phase_layout = parse_capsule_phases(config_path("CapsulePhaseInfo.dat"))
    growth_templates = parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))
    growth_rules = parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    trait_types = parse_unit_trait_types(config_path("UnitTraitTypeInfo.dat"))
    trait_growth_rules = parse_unit_trait_growth_rules(
        config_path("UnitTraitGrowthRuleInfo.dat")
    )
    feature_calculations = parse_feature_calculations(
        config_path("FeatureCalculateInfo.dat")
    )
    faculty_trend_groups = parse_faculty_trend_groups(
        config_path("FacultyTrendGroupInfo.dat")
    )
    faculty_extend_links = parse_faculty_extend_links(
        config_path("FacultyExtendLinkInfo.dat")
    )

    attribute_by_id = {item["id"]: item for item in attributes}
    appearance_by_id = {item["appearance_id"]: item for item in appearances}
    strings = {item["string_id"]: item["strings"] for item in strings_list}
    style_by_id = {item["arranged_style_id"]: item for item in styles}
    capsule_by_id = {item["capsule_type_id"]: item for item in capsule_types}
    craft_by_id = {item["craft_id"]: item for item in crafts}
    growth_by_id = {item["template_id"]: item for item in growth_templates}
    growth_rule_by_id = {
        (item["rule_type"], item["rule_id"]): item for item in growth_rules
    }
    trait_growth_by_id = {
        item["growth_rule_id"]: item for item in trait_growth_rules
    }
    feature_by_id = {
        (item["feature_type"], item["feature_id"]): item
        for item in feature_calculations
    }
    faculty_trend_by_id = {
        item["trend_group_id"]: item for item in faculty_trend_groups
    }
    faculty_extend_link_by_id = {
        item["extend_group_id"]: item for item in faculty_extend_links
    }
    talent_trait_ids = {
        item["trait_id"] for item in trait_types if 130 in item["tags"]
    }
    equipment_label_by_tag = build_tag_label_map(styles, strings, "EQU")
    function_label_by_tag = build_tag_label_map(styles, strings, "INDEX_FUNCTION")
    ammo_rank_by_tag = build_ammo_rank_map(styles, strings)
    craft_rank_by_tag = CRAFT_TECH_RANK_BY_TAG
    ammo_effect_by_tag = build_ammo_effect_map(styles, strings)
    ammo_capsule_by_tag: dict[int, int] = {}
    for capsule in capsule_types:
        if capsule.get("field_2") != 3:
            continue
        for tag in capsule.get("group_b_ids", []):
            ammo_capsule_by_tag[tag] = capsule["capsule_type_id"]

    trains_by_card: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    for train in capsule_trains:
        for related_card_id in train["group_b_ids"]:
            trains_by_card[related_card_id].append(train)

    all_phases_by_capsule: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    phases_by_card: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    for phase in phases:
        all_phases_by_capsule[phase["capsule_type_id"]].append(phase)
        appearance = appearance_by_id.get(phase["appearance_id"], {})
        if appearance.get("unit_class_id"):
            phases_by_card[phase["capsule_type_id"]].append(phase)

    rows: list[dict[str, Any]] = []
    talent_rows: list[dict[str, Any]] = []
    calculated_attribute_ids: set[int] = set()
    missing_template_ids: set[int] = set()
    uncalculated_template_attributes = 0

    for card_id, card_phases in sorted(phases_by_card.items()):
        phase1 = min(card_phases, key=lambda item: item["phase"])
        appearance = appearance_by_id[phase1["appearance_id"]]
        style_id = (appearance["visible_skill_faculties"] or [0])[0]
        profile_style = style_by_id.get(style_id)
        capsule = capsule_by_id.get(card_id, {})
        capsule_tags = capsule.get("group_b_ids", [])
        biography_style = best_tagged_style(styles, set(capsule_tags), "Age")

        tank_name = first_text(strings, appearance.get("name_string_id"))
        person_name = " / ".join(mode_values(profile_style, "NICK_NAME", strings))
        configured_stage = " / ".join(mode_values(profile_style, "TUPU_LV", strings))
        tech_stage = configured_stage or derived_tech_stage(capsule_tags)
        tech_source = "角色资料 TUPU_LV" if configured_stage else (
            "卡牌技术树标签还原" if tech_stage else "客户端未配置"
        )
        painters = " / ".join(mode_values(profile_style, "CARD_PAINTER", strings))
        cvs = " / ".join(mode_values(profile_style, "CV", strings))

        nation_tags = [tag for tag in capsule_tags if tag in NATION_TAG_CHINESE]
        nations = [NATION_TAG_CHINESE[tag] for tag in nation_tags]
        nation = " / ".join(dict.fromkeys(nations)) or "客户端未配置"

        rarity_tier = max(1, min(3, appearance["rarity"] - 1))
        preview_phase = next(
            (item for item in card_phases if item["phase"] == rarity_tier),
            phase1,
        )
        equipment_slots = [
            equipment_label_by_tag[tag]
            for tag in capsule_tags
            if tag in equipment_label_by_tag
        ]

        ammo_craft_ids = trend_crafts_for_card(
            card_id, rarity_tier, 3, trains_by_card
        )
        ammo_types: list[str] = []
        ammo_craft_names: list[str] = []
        ammo_details: list[dict[str, Any]] = []
        for craft_id in ammo_craft_ids:
            craft = craft_by_id.get(craft_id)
            name = craft_name(craft, strings)
            if name:
                ammo_craft_names.append(name)
            ammo_type = ammo_type_for_craft(craft_id, name)
            if ammo_type and ammo_type not in ammo_types:
                ammo_types.append(ammo_type)
            if not craft or not ammo_type:
                continue
            rank = next(
                (ammo_rank_by_tag[tag] for tag in craft["tags"] if tag in ammo_rank_by_tag),
                None,
            )
            effect_by_name: dict[str, dict[str, str]] = {}
            for tag in craft["tags"]:
                for effect in ammo_effect_by_tag.get(tag, []):
                    previous = effect_by_name.get(effect["名称"])
                    if previous is None or (
                        previous["图标代码"].startswith("bigkj-")
                        and not effect["图标代码"].startswith("bigkj-")
                    ):
                        effect_by_name[effect["名称"]] = effect
            effects = list(effect_by_name.values())
            ammo_capsule_id = next(
                (
                    ammo_capsule_by_tag[tag]
                    for tag in craft["tags"]
                    if tag in ammo_capsule_by_tag
                ),
                None,
            )
            # Ammunition cards have their own hidden capsule.  Its phase-1
            # growth templates are the item's displayed attributes.  The card
            # faculty preview instead returns the complete maiden panel after
            # equipping it, so it must not be used for an item card.
            configured_stats, ammo_template_ids = ammo_stats(
                ammo_capsule_id,
                all_phases_by_capsule,
                growth_by_id,
                growth_rule_by_id,
                attribute_by_id,
            )
            # The client presents the hidden ammunition card's own configured
            # attributes plus the selected trend's fixed range.  This preserves
            # real secondary bonuses such as HIDE/SCOUT/DODGE without importing
            # the maiden's base panel.  IGNITE is consumed by battle logic and
            # represented by the ammunition effect badges, not as a card stat.
            configured_stats = [
                stat
                for stat in configured_stats
                if stat["后台属性代码"] not in {"IGNITE", "RANGE", "BITRANGE"}
            ]
            preview_stats, _ = faculty_preview_stats(
                preview_phase,
                3,
                craft_id,
                faculty_trend_by_id,
                faculty_extend_link_by_id,
                growth_by_id,
                growth_rule_by_id,
                attribute_by_id,
            )
            configured_stats.extend(
                stat
                for stat in preview_stats
                if stat["后台属性代码"] in {"RANGE", "BITRANGE"}
            )
            ammo_details.append(
                {
                    "工艺ID": craft_id,
                    "隐藏弹药卡牌ID": ammo_capsule_id or 0,
                    "弹药属性模板ID": ammo_template_ids,
                    "弹药类型": ammo_type,
                    "名称": name,
                    "阶段序号": (rank or {}).get("阶段序号", 0),
                    "阶段": (rank or {}).get("阶段", "未分期"),
                    "技术分组样式ID": (rank or {}).get("技术分组样式ID", 0),
                    "图标代码": craft["name"],
                    "图标资源ID": craft["field_6"],
                    "类型图标代码": (rank or {}).get("类型图标代码", ""),
                    "特效": effects,
                    "属性": configured_stats,
                }
            )

        highest_ammo_details: list[dict[str, Any]] = []
        for ammo_type in ammo_types:
            candidates = [item for item in ammo_details if item["弹药类型"] == ammo_type]
            configured_ranks = [item["阶段序号"] for item in candidates if item["阶段序号"]]
            if configured_ranks:
                highest_rank = max(configured_ranks)
                candidates = [item for item in candidates if item["阶段序号"] == highest_rank]
            highest_ammo_details.extend(candidates)

        def compatibility_options(category_id: int) -> list[dict[str, Any]]:
            craft_ids = [
                craft_id
                for craft_id in trend_crafts_for_card(
                    card_id, rarity_tier, category_id, trains_by_card
                )
                if craft_id in craft_by_id
            ]
            options: list[dict[str, Any]] = []
            for craft_id in craft_ids:
                craft = craft_by_id[craft_id]
                rank = next(
                    (craft_rank_by_tag[tag] for tag in craft["tags"] if tag in craft_rank_by_tag),
                    None,
                )
                labels: list[str] = []
                for tag in craft["tags"]:
                    label = function_label_by_tag.get(tag)
                    if label and label not in labels:
                        labels.append(label)
                options.append(
                    {
                        "工艺ID": craft_id,
                        "名称": craft_name(craft, strings),
                        "抗性": labels,
                        "阶段序号": (rank or {}).get("阶段序号", 0),
                        "阶段": (rank or {}).get("阶段", "未分期"),
                        "图标代码": craft["name"],
                        "图标资源ID": craft["field_6"],
                        "属性": [],
                        "属性模板ID": [],
                    }
                )
            for option in options:
                # Every selectable craft has an independent equipment-card
                # preview.  Lower generations are valid technology nodes too;
                # limiting this calculation to the highest generation left
                # their real panel values empty in the technology catalogue.
                option_phase = next(
                    (
                        item
                        for item in card_phases
                        if item["phase"] == option["阶段序号"]
                    ),
                    preview_phase,
                )
                configured_stats, craft_template_ids = faculty_preview_stats(
                    option_phase,
                    category_id,
                    option["工艺ID"],
                    faculty_trend_by_id,
                    faculty_extend_link_by_id,
                    growth_by_id,
                    growth_rule_by_id,
                    attribute_by_id,
                    include_category_base=False,
                )
                option["属性"] = configured_stats
                option["属性模板ID"] = craft_template_ids
            return options

        engine_options = compatibility_options(4)
        body_options = compatibility_options(5)
        armor_options = compatibility_options(6)
        selected_engine = max(engine_options, key=lambda item: item["工艺ID"], default=None)
        selected_body = max(body_options, key=lambda item: item["工艺ID"], default=None)
        engine_craft_id = selected_engine["工艺ID"] if selected_engine else None
        engine_name = selected_engine["名称"] if selected_engine else ""
        engine_features = selected_engine["抗性"] if selected_engine else []
        body_craft_id = selected_body["工艺ID"] if selected_body else None
        body_name = selected_body["名称"] if selected_body else ""
        body_features = selected_body["抗性"] if selected_body else []

        template_ids = extract_attribute_template_ids(phase1)
        stats_by_level: dict[int, dict[int, int]] = {}
        for level in LEVELS:
            level_stats: dict[int, int] = collections.defaultdict(int)
            for template_id in template_ids:
                template = growth_by_id.get(template_id)
                if template is None:
                    missing_template_ids.add(template_id)
                    continue
                calculated = stats_for_template(template, level, growth_rule_by_id)
                uncalculated_template_attributes += len(template["attributes"]) - len(calculated)
                for attribute_id, value in calculated.items():
                    level_stats[attribute_id] += value
                    calculated_attribute_ids.add(attribute_id)
            stats_by_level[level] = dict(level_stats)

        talents: dict[int, int] = collections.defaultdict(int)
        trait_rule_ids = extract_trait_growth_rule_ids(phase1)
        for rule_id in trait_rule_ids:
            rule = trait_growth_by_id.get(rule_id)
            if rule is None:
                continue
            for trait_id, value in traits_for_growth_rule(rule, 1, feature_by_id).items():
                if trait_id in talent_trait_ids:
                    talents[trait_id] += value
        talent_summary = "；".join(
            f"{TRAIT_CHINESE.get(trait_id, '才艺' + str(trait_id))}{value}"
            for trait_id, value in sorted(talents.items())
            if value
        ) or "无/未配置"

        biography = {
            mode: " / ".join(mode_values(biography_style, mode, strings))
            for mode in (
                "Age", "Birthday", "Department", "BloodType", "Height", "Job",
                "ProfileChar", "ProfileTank", "ForceIcon",
            )
        }
        row: dict[str, Any] = {
            "钢舞姬卡牌ID": card_id,
            "坦克/载具名称": tank_name,
            "对应人名": person_name,
            "国籍/技术归属": nation,
            "国家标签ID": "/".join(map(str, nation_tags)),
            "兵种": APPEARANCE_TYPE_CHINESE.get(
                appearance["unit_class_id"], f"未知类型{appearance['unit_class_id']}"
            ),
            "兵种ID": appearance["unit_class_id"],
            "稀有度": RARITY_CHINESE.get(
                appearance["rarity"], f"未知({appearance['rarity']})"
            ),
            "稀有度颜色": RARITY_COLOR_CHINESE.get(
                appearance["rarity"], f"未知({appearance['rarity']})"
            ),
            "稀有度ID": appearance["rarity"],
            "科技阶段": tech_stage or "未配置",
            "科技阶段来源": tech_source,
            "可使用弹药类型": "、".join(ammo_types) or "未配置/不适用",
            "弹药工艺明细": "；".join(ammo_craft_names),
            "最高阶段弹药": highest_ammo_details,
            "最高阶段弹药数量": len(highest_ammo_details),
            "全部阶段弹药": ammo_details,
            "装备槽类型": "、".join(equipment_slots) or "未配置",
            "装备槽数量": len(equipment_slots),
            "引擎类型": engine_name or "未配置/不适用",
            "引擎可提供抗性": "、".join(engine_features) or "未配置/不适用",
            "引擎工艺ID": engine_craft_id or "",
            "可用引擎": engine_options,
            "可用引擎数量": len(engine_options),
            "全部引擎工艺": "；".join(
                f"{item['名称']}（{'、'.join(item['抗性'])}）" for item in engine_options
            ),
            "车体类型": body_name or "未配置/不适用",
            "车体可提供抗性": "、".join(body_features) or "未配置/不适用",
            "车体工艺ID": body_craft_id or "",
            "可用车体": body_options,
            "可用车体数量": len(body_options),
            "全部车体工艺": "；".join(
                f"{item['名称']}（{'、'.join(item['抗性'])}）" for item in body_options
            ),
            "可用装甲": armor_options,
            "可用装甲数量": len(armor_options),
            "全部装甲工艺": "、".join(item["名称"] for item in armor_options),
            "才艺汇总": talent_summary,
            "画师": painters,
            "声优/CV（全部语言配置）": cvs,
            "年龄": biography["Age"],
            "生日": biography["Birthday"],
            "所属部门/阵营": biography["Department"],
            "血型": biography["BloodType"],
            "身高": biography["Height"],
            "职务": biography["Job"],
            "人物简介": biography["ProfileChar"],
            "载具简介": biography["ProfileTank"],
            "阵营图标资源": biography["ForceIcon"],
            "外观ID": phase1["appearance_id"],
            "模型ID": appearance["model_id"],
            "资料样式ID": style_id,
            "属性成长模板ID": "/".join(map(str, template_ids)),
            "可用代数": "/".join(
                str(item["phase"]) for item in sorted(card_phases, key=lambda x: x["phase"])
            ),
            "数据状态": (
                "资料较完整"
                if person_name and tech_stage and nation != "客户端未配置"
                else "测试/隐藏/资料未完整配置"
            ),
        }
        for level in LEVELS:
            for attribute_id, value in stats_by_level[level].items():
                code = attribute_by_id.get(attribute_id, {}).get(
                    "code", f"ATTR_{attribute_id}"
                )
                label = REQUESTED_ATTRIBUTE_LABELS.get(
                    code, ATTRIBUTE_CHINESE.get(code, code)
                )
                row[f"{level}级_{label}"] = value
        level1_by_code = {
            attribute_by_id.get(attribute_id, {}).get("code", f"ATTR_{attribute_id}"): value
            for attribute_id, value in stats_by_level[1].items()
        }
        for code, prefix in (
            ("ANTIFIRE", "阻燃"),
            ("HOMOGENEITY", "均质度"),
            ("COVERING", "覆盖度"),
        ):
            raw_value = level1_by_code.get(code)
            row[f"{prefix}评级"] = (
                grade_letter(code, raw_value) if raw_value is not None else "未配置"
            )
            row[f"{prefix}后台值"] = raw_value if raw_value is not None else ""
        rows.append(row)

        for trait_id in sorted(talent_trait_ids):
            talent_rows.append(
                {
                    "钢舞姬卡牌ID": card_id,
                    "坦克/载具名称": tank_name,
                    "对应人名": person_name,
                    "才艺ID": trait_id,
                    "才艺名称": TRAIT_CHINESE.get(trait_id, f"才艺{trait_id}"),
                    "才艺等级": talents.get(trait_id, 0),
                    "才艺成长规则ID": "/".join(map(str, trait_rule_ids)),
                }
            )

    metadata_columns = [
        "钢舞姬卡牌ID", "坦克/载具名称", "对应人名", "国籍/技术归属", "国家标签ID",
        "兵种", "兵种ID", "稀有度", "稀有度颜色", "稀有度ID", "科技阶段", "科技阶段来源",
        "可使用弹药类型", "弹药工艺明细", "最高阶段弹药数量", "装备槽类型", "装备槽数量",
        "引擎类型", "引擎可提供抗性", "引擎工艺ID", "可用引擎数量", "全部引擎工艺",
        "车体类型", "车体可提供抗性", "车体工艺ID", "可用车体数量", "全部车体工艺",
        "可用装甲数量", "全部装甲工艺",
        "阻燃评级", "阻燃后台值", "均质度评级", "均质度后台值",
        "覆盖度评级", "覆盖度后台值",
        "才艺汇总", "画师", "声优/CV（全部语言配置）", "年龄", "生日",
        "所属部门/阵营", "血型", "身高", "职务", "人物简介", "载具简介",
        "阵营图标资源", "外观ID", "模型ID", "资料样式ID", "属性成长模板ID",
        "可用代数", "数据状态",
    ]
    ordered_attribute_ids = [
        item["id"] for item in attributes if item["id"] in calculated_attribute_ids
    ]
    attribute_columns = [
        f"{level}级_{REQUESTED_ATTRIBUTE_LABELS.get(attribute_by_id[attribute_id]['code'], ATTRIBUTE_CHINESE.get(attribute_by_id[attribute_id]['code'], attribute_by_id[attribute_id]['code']))}"
        for level in LEVELS
        for attribute_id in ordered_attribute_ids
    ]
    write_csv(args.output / "钢舞姬基础资料与四级属性.csv", rows, metadata_columns + attribute_columns)
    write_csv(
        args.output / "钢舞姬才艺明细.csv",
        talent_rows,
        ["钢舞姬卡牌ID", "坦克/载具名称", "对应人名", "才艺ID", "才艺名称", "才艺等级", "才艺成长规则ID"],
    )
    write_text_atomic(
        args.output / "钢舞姬汇总数据.json",
        json.dumps(
            {
                "levels": LEVELS,
                "attribute_ids": ordered_attribute_ids,
                "attribute_labels": {
                    str(attribute_id): REQUESTED_ATTRIBUTE_LABELS.get(
                        attribute_by_id[attribute_id]["code"],
                        ATTRIBUTE_CHINESE.get(
                            attribute_by_id[attribute_id]["code"],
                            attribute_by_id[attribute_id]["code"],
                        ),
                    )
                    for attribute_id in ordered_attribute_ids
                },
                "rows": rows,
                "talent_rows": talent_rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
    )
    summary = {
        "source_config": str(config_path("CapsulePhaseInfo.dat").parent),
        "capsule_phase_layout": phase_layout,
        "steel_maiden_count": len(rows),
        "rows_with_person_name": sum(bool(row["对应人名"]) for row in rows),
        "rows_with_tech_stage": sum(row["科技阶段"] != "未配置" for row in rows),
        "rows_with_nation": sum(row["国籍/技术归属"] != "客户端未配置" for row in rows),
        "rows_with_talents": sum(row["才艺汇总"] != "无/未配置" for row in rows),
        "rows_with_ammunition": sum(row["可使用弹药类型"] != "未配置/不适用" for row in rows),
        "highest_stage_ammunition_crafts": sum(row["最高阶段弹药数量"] for row in rows),
        "rows_with_equipment_slots": sum(row["装备槽数量"] > 0 for row in rows),
        "rows_with_engine_compatibility": sum(row["引擎类型"] != "未配置/不适用" for row in rows),
        "rows_with_body_compatibility": sum(row["车体类型"] != "未配置/不适用" for row in rows),
        "rows_with_armor_compatibility": sum(row["可用装甲数量"] > 0 for row in rows),
        "calculated_attribute_ids": ordered_attribute_ids,
        "missing_attribute_template_ids": sorted(missing_template_ids),
        "uncalculated_template_attribute_occurrences": uncalculated_template_attributes,
    }
    write_text_atomic(
        args.output / "生成摘要.json",
        json.dumps(summary, ensure_ascii=False, indent=2),
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
