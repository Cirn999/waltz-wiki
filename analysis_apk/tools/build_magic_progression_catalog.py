#!/usr/bin/env python3
"""Build client-backed magic-upgrade costs, card selectors and tactics."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    parse_arranged_styles,
    parse_capsule_faculty_trains,
    parse_capsule_types,
    parse_consume_groups,
    parse_demand_groups,
    parse_faculty_extend_links,
    parse_faculty_trend_groups,
    parse_feature_calculations,
    parse_fund_types,
    parse_string_table,
    parse_unit_trait_growth_rules,
    parse_unit_trait_types,
    traits_for_growth_rule,
)

CONFIG = ROOT / "patch" / "_1.18" / "config"
FEATURE_CONFIG = ROOT / "Resources" / "config" / "FeatureCalculateInfo.dat"
OUTPUT = ROOT / "analysis_apk" / "output" / "magic_ordnance" / "magic_progression_catalog.json"
STAT_TAGS = {
    2901: "耐久", 2902: "火力", 2903: "穿甲", 2904: "装甲",
    2905: "命中", 2906: "回避", 2907: "隐蔽", 2908: "侦查",
}


def main() -> None:
    strings = parse_string_table(CONFIG / "StringTableInfo.dat")
    text = {row["string_id"]: next((value for value in row["strings"] if value), "") for row in strings}
    funds = {row["fund_id"]: row for row in parse_fund_types(CONFIG / "FundTypeInfo.dat")}
    demand_groups = {row["demand_group_id"]: row for row in parse_demand_groups(CONFIG / "DemandGroupInfo.dat")}
    consume_groups = {row["consume_group_id"]: row for row in parse_consume_groups(CONFIG / "ConsumeGroupInfo.dat")}
    trains = parse_capsule_faculty_trains(CONFIG / "CapsuleFacultyTrainInfo.dat")

    # 3001 and 3003 are the client UI's faculty-upgrade paths for categories
    # 17 (ordnance) and 18 (tactics). A category-13 demand records prior level.
    paths: dict[str, dict[str, dict[str, dict[int, dict]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(dict))
    )
    for train in trains:
        if 1506 not in train["group_a_ids"]:
            continue
        category = 17 if 3001 in train["group_a_ids"] else 18 if 3003 in train["group_a_ids"] else 0
        if not category:
            continue
        demands = [item for group_id in train["group_e_ids"] for item in demand_groups.get(group_id, {}).get("items", [])]
        level_record = next((item for item in demands if item["item_type"] == 13 and item["values"][0] == category), None)
        selector = next((item for item in demands if item["item_type"] == 12), None)
        mark = next((item for item in demands if item["item_type"] == 3 and item["values"][0] in (51, 61)), None)
        # ClientShow MagicSkill042 labels property 64 as 综合索敌等级.
        scout = next((item for item in demands if item["item_type"] == 0 and item["values"][0] == 64), None)
        if not (level_record and selector and mark and scout):
            continue
        level = level_record["values"][1] + 1
        if not 1 <= level <= 10:
            continue
        airborne = mark["values"][0] == 61
        prefix = { (17, False): 372834, (18, False): 372844,
                   (17, True): 372854, (18, True): 372864 }[(category, airborne)]
        stage_number = selector["values"][0] // 100 - prefix
        if not 1 <= stage_number <= 6:
            continue
        stage = f"N{stage_number}"
        vehicle = "air" if airborne else "ground"
        kind = "ordnance" if category == 17 else "tactics"
        selector_id = selector["values"][0]
        materials = []
        for group_id in train["group_f_ids"]:
            for item in consume_groups.get(group_id, {}).get("items", []):
                if item["item_type"] != 0:
                    continue
                fund_id = item["values"][0]
                fund = funds.get(fund_id, {})
                # FundTypeInfo's IC_* field is not a UIStyle sprite key. Its
                # resource slots are: 9 = small inventory icon, 5 = fallback.
                resources = fund.get("resources", [])
                icon_resource = next((entry["resource"] for entry in resources if entry["resource_id"] == 9), "")
                if not icon_resource:
                    icon_resource = next((entry["resource"] for entry in resources if entry["resource_id"] == 5), "")
                materials.append({
                    "fundId": fund_id,
                    "name": text.get(fund.get("name_string_id"), f"资源 {fund_id}"),
                    "iconCode": icon_resource,
                    "amount": item["amount"],
                })
        paths[stage][vehicle][kind].setdefault(selector_id, {})[level] = {
            "level": level,
            "scoutLevel": scout["values"][1],
            "markKind": "鹰标" if not airborne else "金桨",
            "marks": mark["values"][2],
            "materials": materials,
            "trainId": train["train_id"],
        }

    progression = {}
    for stage, vehicles in paths.items():
        progression[stage] = {}
        for vehicle, kinds in vehicles.items():
            progression[stage][vehicle] = {}
            for kind, variants in kinds.items():
                progression[stage][vehicle][kind] = [
                    {"selectorId": selector_id, "levels": [levels[level] for level in sorted(levels)]}
                    for selector_id, levels in sorted(variants.items())
                    if len(levels) == 10
                ]

    # The type-12 upgrade demand matches a tag in the card's CapsuleTypeInfo
    # group_b_ids. This is the authoritative per-card recipe selector: cards of
    # the same blueprint grade and vehicle class can still use different paths.
    path_kinds = {
        path["selectorId"]: kind
        for vehicles in progression.values()
        for kinds in vehicles.values()
        for kind, variants in kinds.items()
        for path in variants
    }
    selectors_by_card = {}
    for card in parse_capsule_types(CONFIG / "CapsuleTypeInfo.dat"):
        selectors = {"ordnance": [], "tactics": []}
        for tag_id in card["group_b_ids"]:
            if tag_id in path_kinds:
                selectors[path_kinds[tag_id]].append(tag_id)
        if any(selectors.values()):
            if len(selectors["ordnance"]) != 1 or len(selectors["tactics"]) != 1:
                raise ValueError(f"Ambiguous magic recipe for card {card['capsule_type_id']}: {selectors}")
            selectors_by_card[str(card["capsule_type_id"])] = {
                kind: values[0] for kind, values in selectors.items()
            }

    # Category 17's shared trait-growth link (51) is what the client uses for
    # the six basic panel bonuses. These are percentages of the base attribute,
    # not a fabricated final, equipment-dependent absolute stat value.
    growth = {row["growth_rule_id"]: row for row in parse_unit_trait_growth_rules(CONFIG / "UnitTraitGrowthRuleInfo.dat")}
    feature = {(row["feature_type"], row["feature_id"]): row for row in parse_feature_calculations(FEATURE_CONFIG)}
    trait_types = {row["trait_id"]: row for row in parse_unit_trait_types(CONFIG / "UnitTraitTypeInfo.dat")}
    def bonuses(rule_id: int, level: int, tag: int) -> list[dict]:
        values = traits_for_growth_rule(growth[rule_id], level, feature)
        result = []
        for trait_id, raw in values.items():
            tags = trait_types.get(trait_id, {}).get("tags", [])
            stat = next((STAT_TAGS[item] for item in tags if item in STAT_TAGS), None)
            if stat and tag in tags:
                result.append({"name": stat, "percent": raw / 100})
        return result

    ordnance_bonuses = [
        {"level": level, "bonuses": bonuses(51, level, 2953)} for level in range(1, 11)
    ]

    styles = {row["arranged_style_id"]: row for row in parse_arranged_styles(CONFIG / "ArrangedStyleInfo.dat")}
    trend_group = next(row for row in parse_faculty_trend_groups(CONFIG / "FacultyTrendGroupInfo.dat") if row["trend_group_id"] == 101)
    links = {row["extend_group_id"]: row for row in parse_faculty_extend_links(CONFIG / "FacultyExtendLinkInfo.dat")}
    tactics = []
    for trend in trend_group["items"]:
        trend_id = trend["trend_id"]
        if trend_id == 200:
            continue
        style = styles.get(700 + trend_id)
        if not style:
            continue
        base = next((item for item in style["items"] if item["mode_code"] == "PASSIVE_BASE"), None)
        if not base:
            continue
        group_id = trend["extend_group_ids"][0]
        rule_id = links[group_id]["extend_effects"][0]["group_b_ids"][0]
        name_id = next((entry["value"] for entry in base["number_entries"] if entry["entry_id"] == 5), 0)
        icon = next((entry["value"] for entry in base["string_entries"] if entry["entry_id"] == 1), "")
        levels = []
        for level in range(1, 11):
            raw = traits_for_growth_rule(growth[rule_id], level, feature)
            effects = []
            for item in style["items"]:
                if item["mode_code"] != "EFFECT_DESC":
                    continue
                entries = {entry["entry_id"]: entry["value"] for entry in item["number_entries"]}
                stat_tag = entries.get(7)
                matches = [(trait_types[trait_id]["tags"], value) for trait_id, value in raw.items()
                           if trait_id in trait_types and stat_tag in trait_types[trait_id]["tags"]]
                positive = next((value / 100 for tags, value in matches if 2952 in tags), None)
                equipment = next((100 + value / 100 for tags, value in matches if 2951 in tags), None)
                if positive is None:
                    continue
                label = text.get(entries.get(5), STAT_TAGS.get(stat_tag, "属性"))
                description = f"{label}提高初始值的{positive:g}%"
                if equipment is not None and item["filter_code"] == "PassiveEffectDesc002":
                    description += f"，但装备提供的{label}降至{equipment:g}%"
                effects.append({"name": label, "description": description,
                                "basePercent": positive, "equipmentPercent": equipment})
            levels.append({"level": level, "effects": effects})
        tactics.append({"trendId": trend_id, "name": text.get(name_id, f"战术 {trend_id}"),
                        "iconCode": icon, "ruleId": rule_id, "levels": levels})

    result = {"source": "test-server-client-category-17-18", "progression": progression,
              "selectorsByCard": selectors_by_card,
              # MoSkillUI.lua uses these exact sprites for the two mark gates.
              "markIcons": {"鹰标": "bjk-031", "金桨": "bjk-045"},
              "ordnanceBonuses": ordnance_bonuses, "tactics": tactics}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "tactics": len(tactics),
                      "paths": sum(len(variants) for vehicles in progression.values() for kinds in vehicles.values()
                                   for variants in kinds.values()),
                      "ordnanceBonusLevels": len(ordnance_bonuses),
                      "cardsWithSelectors": len(selectors_by_card)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
