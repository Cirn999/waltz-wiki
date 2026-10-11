#!/usr/bin/env python3
"""Build the equipment atlas from the same configs and code paths used by FundUI.

The client identifies equipment slots/type/level through ArrangedStyle tags,
reads attributes from the hidden CapsuleType linked by the fund tag, and uses
ProduceRule tag 1500 for exact enhancement recipes.  Cumulative costs are
therefore expanded from the real recipe graph instead of assuming 3-to-1.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import struct
from pathlib import Path
from typing import Any

from build_steel_maiden_catalog import ammo_stats, entry_number, entry_string, first_text
from decode_configs import (
    config_path,
    parse_arranged_styles,
    parse_award_groups,
    parse_award_tables,
    parse_capsule_phases,
    parse_capsule_types,
    parse_consume_groups,
    parse_fund_achievements,
    parse_fund_types,
    parse_growth_rules,
    parse_growth_templates,
    parse_produce_rules,
    parse_skill_descriptions,
    parse_skill_growth_templates_for_ids,
    parse_string_table,
    parse_unit_attributes,
    stats_for_template,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "analysis_apk/output/equipment_catalog/equipment_catalog.json"

GROUND_SLOT_TAGS = [451, 452, 454, 455, 453, 456, 450, 464, 465]
AIR_SLOT_TAGS = [457, 458, 459, 460, 461, 462, 463]
SLOT_ICON_CODES = {
    451: "djbj-008", 452: "djbj-014", 454: "djbj-010", 455: "djbj-009",
    453: "djbj-011", 456: "djbj-012", 450: "djbj-013", 464: "djbj-044",
    465: "djbj-047", 457: "djbj-030", 458: "djbj-031", 459: "djbj-032",
    460: "djbj-033", 461: "djbj-038", 462: "djbj-039", 463: "djbj-042",
}


def mode_item(styles_by_tag: dict[int, list[dict[str, Any]]], tag: int, mode: str) -> dict[str, Any] | None:
    for style in styles_by_tag.get(tag, []):
        for item in style["items"]:
            if item["mode_code"] == mode:
                return item
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    strings = {
        row["string_id"]: row["strings"]
        for row in parse_string_table(config_path("StringTableInfo.dat"))
    }
    funds = {row["fund_id"]: row for row in parse_fund_types(config_path("FundTypeInfo.dat"))}
    styles = parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))
    styles_by_tag: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    for style in styles:
        for tag in style["tags"]:
            styles_by_tag[tag].append(style)

    slots: list[dict[str, Any]] = []
    slot_by_tag: dict[int, dict[str, Any]] = {}
    for order, tag in enumerate(GROUND_SLOT_TAGS + AIR_SLOT_TAGS, start=1):
        item = mode_item(styles_by_tag, tag, "SHEBEITUJIAN_PAGE")
        if not item:
            continue
        label = first_text(strings, entry_number(item, 5))
        slot = {
            "tag": tag,
            "name": label.replace(" ", ""),
            "iconCode": SLOT_ICON_CODES[tag],
            "vehicleKind": "ground" if tag in GROUND_SLOT_TAGS else "air",
            "order": order,
        }
        slots.append(slot)
        slot_by_tag[tag] = slot

    capsules = parse_capsule_types(config_path("CapsuleTypeInfo.dat"))
    capsule_ids_by_tag: dict[int, list[int]] = collections.defaultdict(list)
    for capsule in capsules:
        tags = [capsule["growth_tag_id"], *capsule["group_a_ids"], *capsule["group_b_ids"]]
        for tag in tags:
            if tag:
                capsule_ids_by_tag[tag].append(capsule["capsule_type_id"])
    phases, _ = parse_capsule_phases(config_path("CapsulePhaseInfo.dat"))
    phases_by_capsule: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    for phase in phases:
        phases_by_capsule[phase["capsule_type_id"]].append(phase)
    skill_description_by_id = {
        row["skill_id"]: row
        for row in parse_skill_descriptions(config_path("SkillDesc.dat"))
    }
    equipment_skill_template_ids: set[int] = set()
    for phase in phases:
        for category in phase["faculty_categories"]:
            if category["category_id"] != 2:
                continue
            for effect in category["limit_config"]["extend_effects"]:
                equipment_skill_template_ids.update(effect["group_a_ids"])
    skill_growth_by_id = parse_skill_growth_templates_for_ids(
        config_path("SkillGrowthTemplateInfo.dat"),
        equipment_skill_template_ids,
        set(skill_description_by_id),
    )
    fund_achievement_by_id = {
        row["fund_id"]: row
        for row in parse_fund_achievements(config_path("FundAchievementInfo.dat"))
    }
    growth_by_id = {
        row["template_id"]: row
        for row in parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))
    }
    growth_rule_by_id = {
        (row["rule_type"], row["rule_id"]): row
        for row in parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    }
    attribute_by_id = {
        row["id"]: row for row in parse_unit_attributes(config_path("UnitAttributeInfo.dat"))
    }

    referenced_equipment_skill_template_ids: set[int] = set()

    def equipment_effects(capsule_id: int | None) -> list[dict[str, Any]]:
        if capsule_id is None:
            return []
        phases_for_capsule = phases_by_capsule.get(capsule_id, [])
        if not phases_for_capsule:
            return []
        phase = min(phases_for_capsule, key=lambda row: row["phase"])
        template_ids: list[int] = []
        for category in phase["faculty_categories"]:
            if category["category_id"] != 2:
                continue
            for effect in category["limit_config"]["extend_effects"]:
                template_ids.extend(effect["group_a_ids"])
        referenced_equipment_skill_template_ids.update(template_ids)
        result: list[dict[str, Any]] = []
        for template_id in template_ids:
            template = skill_growth_by_id.get(template_id)
            if not template:
                continue
            for skill in template["skills"]:
                description = skill_description_by_id.get(skill["skill_id"])
                raw_text = first_text(strings, (description or {}).get("description_string_id"))
                if not raw_text:
                    continue
                intensity = skill["intensity"]
                rendered = re.sub(r"#\$\d+", str(intensity), raw_text)
                rendered = re.sub(r"<[^>]+>", "", rendered).replace("_", " ").strip()
                parts = raw_text.split("_", 1)
                if len(parts) > 1:
                    title = re.sub(r"[\[\]]", "", parts[0]).strip()
                    detail = parts[1]
                else:
                    bracketed = re.match(r"^\[([^\]]+)\](.*)$", raw_text)
                    title = bracketed.group(1).strip() if bracketed else "装备特效"
                    detail = (bracketed.group(2) or raw_text) if bracketed else raw_text
                detail = re.sub(r"#\$\d+", str(intensity), detail)
                detail = re.sub(r"<[^>]+>", "", detail).strip()
                result.append(
                    {
                        "skillId": skill["skill_id"],
                        "templateId": template_id,
                        "value": intensity,
                        "name": title or "装备特效",
                        "description": detail,
                        "text": rendered,
                    }
                )
        return result

    description_by_type_tag: dict[int, str] = {}
    for fund_id, fund in funds.items():
        achievement = fund_achievement_by_id.get(fund_id)
        description = first_text(strings, (achievement or {}).get("description_string_id"))
        if not description:
            continue
        for tag in fund.get("tags", []):
            if mode_item(styles_by_tag, tag, "EQUTYPE"):
                description_by_type_tag.setdefault(tag, description)

    item_by_id: dict[int, dict[str, Any]] = {}
    for fund_id, fund in funds.items():
        tags = fund.get("tags", [])
        if 83 not in tags:
            continue
        slot_tags = [tag for tag in tags if tag in slot_by_tag]
        level_items = [(tag, mode_item(styles_by_tag, tag, "EQULEVEL")) for tag in tags]
        level_items = [(tag, item) for tag, item in level_items if item]
        type_items = [(tag, mode_item(styles_by_tag, tag, "EQUTYPE")) for tag in tags]
        type_items = [(tag, item) for tag, item in type_items if item]
        if len(slot_tags) != 1 or not level_items or not type_items:
            continue
        level = entry_number(level_items[0][1], 1)
        type_icon = entry_string(type_items[0][1], 1)
        if not level or not type_icon:
            continue
        capsule_candidates: list[int] = []
        for tag in tags:
            capsule_candidates.extend(capsule_ids_by_tag.get(tag, []))
        capsule_candidates = list(dict.fromkeys(capsule_candidates))
        # Equipment preview cards are field_2 == 3 and have a phase record.
        capsule_id = next(
            (
                capsule_id for capsule_id in capsule_candidates
                if capsule_id in phases_by_capsule
            ),
            None,
        )
        stats, attribute_template_ids = ammo_stats(
            capsule_id,
            phases_by_capsule,
            growth_by_id,
            growth_rule_by_id,
            attribute_by_id,
        )
        # The equipment preview's eight visible attributes are in `stats`.
        # The same client growth templates may also carry the three hidden
        # rating attributes, which must be preserved for loadout previews.
        hidden_stats: dict[str, int] = collections.defaultdict(int)
        hidden_codes = {
            "ANTIFIRE": "fireproof",
            "HOMOGENEITY": "homogeneity",
            "COVERING": "coverage",
        }
        for template_id in attribute_template_ids:
            template = growth_by_id.get(template_id)
            if not template:
                continue
            for attribute_id, value in stats_for_template(template, 1, growth_rule_by_id).items():
                key = hidden_codes.get(attribute_by_id.get(attribute_id, {}).get("code", ""))
                if key:
                    hidden_stats[key] += value
        effects = equipment_effects(capsule_id)
        # MADEFROM marks that this *level* is produced from another item; it is
        # present on upgraded S2+ records for both ordinary and advanced gear,
        # so it cannot classify the equipment family.  The client-facing fund
        # name is the stable distinction used by the equipment UI: advanced
        # families carry the explicit “高级” designation at every level.
        equipment_name = first_text(strings, fund["name_string_id"])
        resource_by_id = {row["resource_id"]: row["resource"] for row in fund.get("resources", [])}
        item_by_id[fund_id] = {
            "fundId": fund_id,
            "name": equipment_name,
            "slotTag": slot_tags[0],
            "level": level,
            "iconCode": resource_by_id.get(9) or resource_by_id.get(5) or fund.get("icon", ""),
            "typeIconCode": type_icon,
            "advanced": "高级" in equipment_name,
            "capsuleId": capsule_id,
            "stats": [
                {
                    "key": stat["属性"],
                    "value": stat["数值"],
                    "effectType": stat["效果类型"],
                    "attributeId": stat["后台属性ID"],
                    "code": stat["后台属性代码"],
                }
                for stat in stats
                if stat["数值"]
            ],
            "hiddenStats": dict(hidden_stats),
            "effects": effects,
            "description": (
                first_text(
                    strings,
                    fund_achievement_by_id.get(fund_id, {}).get("description_string_id"),
                )
                or next(
                    (description_by_type_tag[tag] for tag, _ in type_items if tag in description_by_type_tag),
                    "",
                )
            ),
            "tags": tags,
        }

    award_groups = {
        row["award_group_id"]: row
        for row in parse_award_groups(config_path("AwardGroupInfo.dat"))
    }
    award_tables = {
        row["award_table_id"]: row
        for row in parse_award_tables(config_path("AwardTableInfo.dat"))
    }
    award_pool_bytes = config_path("AwardPoolInfo.dat").read_bytes()

    def pool_group(pool_id: int) -> int | None:
        needle = struct.pack("<I", pool_id)
        offset = award_pool_bytes.find(needle, 4)
        candidates: list[int] = []
        while offset >= 0:
            if offset + 16 <= len(award_pool_bytes):
                candidate = struct.unpack_from("<I", award_pool_bytes, offset + 12)[0]
                if candidate in award_groups:
                    candidates.append(candidate)
            offset = award_pool_bytes.find(needle, offset + 1)
        return candidates[0] if len(set(candidates)) == 1 else None

    def rule_awards(rule: dict[str, Any]) -> list[tuple[int, int]]:
        result: list[tuple[int, int]] = []
        for table_id in [*rule["field_c8"], *rule["field_e0"]]:
            table = award_tables.get(table_id)
            if not table:
                continue
            for table_item in table["items"]:
                group = award_groups.get(pool_group(table_item["award_group_id"]) or -1)
                if not group:
                    continue
                for item in group["items"]:
                    if item["item_type"] in (0, 1):
                        result.append((item["values"][0], item["weight"]))
        return result

    consumes = {
        row["consume_group_id"]: row
        for row in parse_consume_groups(config_path("ConsumeGroupInfo.dat"))
    }

    def fund_icon_code(fund_id: int) -> str:
        item_icon = item_by_id.get(fund_id, {}).get("iconCode")
        if item_icon:
            return item_icon
        fund = funds.get(fund_id, {})
        resource_by_id = {row["resource_id"]: row["resource"] for row in fund.get("resources", [])}
        return resource_by_id.get(9) or resource_by_id.get(5) or fund.get("icon", "")

    recipe_by_target: dict[int, dict[str, Any]] = {}
    unresolved_rules: list[int] = []
    for rule in parse_produce_rules(config_path("ProduceRuleInfo.dat")):
        if 1500 not in rule["field_40"]:
            continue
        target_awards = [(fund_id, amount) for fund_id, amount in rule_awards(rule) if fund_id in item_by_id]
        if len(target_awards) != 1:
            unresolved_rules.append(rule["rule_id"])
            continue
        target_id, target_amount = target_awards[0]
        materials: list[dict[str, Any]] = []
        for group_id in rule["field_b0"]:
            for consume in consumes.get(group_id, {}).get("items", []):
                if consume["item_type"] != 0:
                    continue
                fund_id = consume["values"][0]
                fund = funds.get(fund_id, {})
                materials.append(
                    {
                        "fundId": fund_id,
                        "name": first_text(strings, fund.get("name_string_id", 0)) or f"资源 #{fund_id}",
                        "amount": consume["amount"],
                        "equipment": fund_id in item_by_id,
                        "level": item_by_id.get(fund_id, {}).get("level"),
                        "iconCode": fund_icon_code(fund_id),
                    }
                )
        recipe_by_target[target_id] = {
            "ruleId": rule["rule_id"],
            "targetAmount": target_amount,
            "materials": materials,
        }

    cumulative_cache: dict[int, dict[int, int]] = {}

    def cumulative(fund_id: int, active: tuple[int, ...] = ()) -> dict[int, int]:
        if fund_id in cumulative_cache:
            return dict(cumulative_cache[fund_id])
        if fund_id in active:
            raise ValueError(f"equipment recipe cycle: {active + (fund_id,)}")
        recipe = recipe_by_target.get(fund_id)
        if not recipe:
            return {fund_id: 1}
        total: dict[int, int] = collections.defaultdict(int)
        for material in recipe["materials"]:
            material_id = material["fundId"]
            amount = material["amount"]
            if material["equipment"]:
                for terminal_id, terminal_amount in cumulative(material_id, active + (fund_id,)).items():
                    total[terminal_id] += terminal_amount * amount
            else:
                total[material_id] += amount
        cumulative_cache[fund_id] = dict(total)
        return dict(total)

    families: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item in item_by_id.values():
        key = (item["slotTag"], item["name"], item["typeIconCode"], item["advanced"])
        family = families.setdefault(
            key,
            {
                "id": f'{item["slotTag"]}-{item["fundId"]}',
                "name": item["name"],
                "slotTag": item["slotTag"],
                "advanced": item["advanced"],
                "iconCode": item["iconCode"],
                "typeIconCode": item["typeIconCode"],
                "description": item["description"],
                "levels": [],
            },
        )
        recipe = recipe_by_target.get(item["fundId"])
        cumulative_items = cumulative(item["fundId"])
        family["levels"].append(
            {
                "fundId": item["fundId"],
                "level": item["level"],
                "iconCode": item["iconCode"],
                "stats": item["stats"],
                "hiddenStats": item["hiddenStats"],
                "effects": item["effects"],
                "recipe": recipe,
                "cumulative": [
                    {
                        "fundId": material_id,
                        "name": (
                            item_by_id.get(material_id, {}).get("name")
                            or first_text(strings, funds.get(material_id, {}).get("name_string_id", 0))
                            or f"资源 #{material_id}"
                        ),
                        "amount": amount,
                        "equipment": material_id in item_by_id,
                        "level": item_by_id.get(material_id, {}).get("level"),
                        "iconCode": fund_icon_code(material_id),
                    }
                    for material_id, amount in sorted(
                        cumulative_items.items(),
                        key=lambda pair: (pair[0] not in item_by_id, pair[0]),
                    )
                ],
            }
        )

    family_rows = list(families.values())
    for family in family_rows:
        family["levels"].sort(key=lambda row: row["level"])
        family["maxLevel"] = max(row["level"] for row in family["levels"])
        family["minLevel"] = min(row["level"] for row in family["levels"])
    family_rows.sort(key=lambda row: (slots.index(slot_by_tag[row["slotTag"]]), row["advanced"], row["name"]))

    output = {
        "source": {
            "equipment": "FundTypeInfo.dat + ArrangedStyleInfo.dat",
            "attributes": "Fund tag -> hidden CapsuleType -> CapsulePhase -> AttributeGrowthTemplate",
            "recipes": "ProduceRuleInfo.dat tag 1500 + Consume/Award chain",
            "effects": "Fund tag -> hidden CapsuleType category 2 -> SkillGrowthTemplateInfo -> SkillDesc/StringTable",
            "descriptions": "FundAchievementInfo.dat -> StringTableInfo.dat",
        },
        "summary": {
            "slotCount": len(slots),
            "equipmentFundCount": len(item_by_id),
            "familyCount": len(family_rows),
            "normalFamilyCount": sum(not row["advanced"] for row in family_rows),
            "advancedFamilyCount": sum(row["advanced"] for row in family_rows),
            "recipeCount": len(recipe_by_target),
            "unresolvedEnhancementRuleCount": len(unresolved_rules),
            "familyWithDescriptionCount": sum(bool(row["description"]) for row in family_rows),
            "equipmentLevelWithEffectCount": sum(
                bool(level["effects"])
                for family in family_rows
                for level in family["levels"]
            ),
            "equipmentEffectCount": sum(
                len(level["effects"])
                for family in family_rows
                for level in family["levels"]
            ),
            "unresolvedEquipmentSkillTemplateCount": len(
                referenced_equipment_skill_template_ids.difference(skill_growth_by_id)
            ),
            "recipeInputCountDistribution": dict(
                sorted(collections.Counter(
                    sum(material["amount"] for material in recipe["materials"] if material["equipment"])
                    for recipe in recipe_by_target.values()
                ).items())
            ),
        },
        "slots": slots,
        "families": family_rows,
        "unresolvedEnhancementRules": unresolved_rules,
        "unresolvedEquipmentSkillTemplates": sorted(
            referenced_equipment_skill_template_ids.difference(skill_growth_by_id)
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        **output["summary"],
        "unresolvedEquipmentSkillTemplates": output["unresolvedEquipmentSkillTemplates"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
