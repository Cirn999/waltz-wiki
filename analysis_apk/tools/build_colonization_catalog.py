#!/usr/bin/env python3
"""Build each maiden's level 1–12 强殖 bonuses from client growth templates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from decode_configs import (
    config_path,
    parse_capsule_phases,
    parse_capsule_types,
    parse_growth_rules,
    parse_growth_templates,
    stats_for_template,
)

ROOT = Path(__file__).resolve().parents[2]
MAIDENS = ROOT / "analysis_apk" / "output" / "steel_maiden_catalog_v4" / "钢舞姬汇总数据.json"
DEFAULT_OUTPUT = ROOT / "analysis_apk" / "output" / "colonization_catalog" / "colonization_catalog.json"
FACULTY_ATTRIBUTES = (
    (21, "durability", 0),
    (26, "evasion", 6),
    (25, "accuracy", 5),
    (24, "armor", 4),
    (23, "piercing", 3),
    (22, "power", 2),
)
MAX_LEVEL = 12


def category_templates(phase: dict, faculty_id: int) -> tuple[int, tuple[int, ...]]:
    category = next((item for item in phase["faculty_categories"] if item["category_id"] == faculty_id), None)
    if category is None:
        raise ValueError(f"card {phase['capsule_type_id']} phase {phase['phase']} lacks faculty {faculty_id}")
    limit = category["limit_config"]
    template_ids = tuple(
        template_id
        for effect in limit.get("extend_effects", [])
        for config in effect["attribute_configs"]
        for template_id in config["group_a_ids"]
    )
    if not template_ids:
        raise ValueError(f"card {phase['capsule_type_id']} phase {phase['phase']} faculty {faculty_id} lacks growth template")
    return limit["field_3"], template_ids


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    maidens = json.loads(MAIDENS.read_text(encoding="utf-8"))["rows"]
    card_ids = {row["钢舞姬卡牌ID"] for row in maidens}
    capsules = {row["capsule_type_id"]: row for row in parse_capsule_types(config_path("CapsuleTypeInfo.dat")) if row["capsule_type_id"] in card_ids}
    phases, _ = parse_capsule_phases(config_path("CapsulePhaseInfo.dat"))
    phases_by_card: dict[int, list[dict]] = {}
    for phase in phases:
        if phase["capsule_type_id"] in card_ids:
            phases_by_card.setdefault(phase["capsule_type_id"], []).append(phase)
    templates = {row["template_id"]: row for row in parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))}
    rules = {(row["rule_type"], row["rule_id"]): row for row in parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))}
    curves: dict[tuple[int, int], list[int]] = {}
    rows = {}
    for card_id in sorted(card_ids):
        capsule = capsules.get(card_id)
        card_phases = phases_by_card.get(card_id, [])
        if not capsule or not card_phases:
            raise ValueError(f"card {card_id} has no capsule/phase configuration")
        faculty_ids = {row["faculty_id"] for row in capsule["faculty_growth"]}
        missing = {faculty_id for faculty_id, _, _ in FACULTY_ATTRIBUTES} - faculty_ids
        if missing:
            raise ValueError(f"card {card_id} lacks faculty growth categories {sorted(missing)}")
        by_phase = [tuple(category_templates(phase, faculty_id) for faculty_id, _, _ in FACULTY_ATTRIBUTES) for phase in card_phases]
        if len(set(by_phase)) != 1:
            raise ValueError(f"card {card_id} has generation-dependent colonization; model phases separately")
        bonuses = {}
        for (faculty_id, stat_key, attribute_id), (max_level, template_ids) in zip(FACULTY_ATTRIBUTES, by_phase[0]):
            if max_level != MAX_LEVEL:
                raise ValueError(f"card {card_id} faculty {faculty_id} max level is {max_level}, expected {MAX_LEVEL}")
            cumulative = [0] * MAX_LEVEL
            for template_id in template_ids:
                cache_key = (template_id, attribute_id)
                if cache_key not in curves:
                    template = templates.get(template_id)
                    if template is None or attribute_id not in {item["attribute_id"] for item in template["attributes"]}:
                        raise ValueError(f"card {card_id} faculty {faculty_id} template {template_id} lacks attribute {attribute_id}")
                    baseline = stats_for_template(template, 0, rules).get(attribute_id)
                    if baseline is None:
                        raise ValueError(f"template {template_id} cannot calculate level zero")
                    curve = []
                    for level in range(1, MAX_LEVEL + 1):
                        value = stats_for_template(template, level, rules).get(attribute_id)
                        if value is None:
                            raise ValueError(f"template {template_id} cannot calculate level {level}")
                        curve.append(value - baseline)
                    if any(value < previous for previous, value in zip([0, *curve[:-1]], curve)):
                        raise ValueError(f"template {template_id} has a negative upgrade increment")
                    curves[cache_key] = curve
                cumulative = [value + addition for value, addition in zip(cumulative, curves[cache_key])]
            bonuses[stat_key] = cumulative
        rows[str(card_id)] = bonuses

    payload = {
        "source": {"card": "CapsuleTypeInfo.dat", "phase": "CapsulePhaseInfo.dat", "template": "AttributeGrowthTemplateInfo.dat", "rule": "AttributeGrowthRuleInfo.dat"},
        "semantics": "Each value is that faculty category's cumulative flat attribute bonus at the listed 强殖 level; each-level gain is current minus previous level (level 0 = 0).",
        "maxLevel": MAX_LEVEL,
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(rows)} maiden colonization curves from {len(curves)} template/attribute pairs to {args.output}")


if __name__ == "__main__":
    main()
