#!/usr/bin/env python3
"""Calculate every visible maiden attribute at levels 1–99 from client rules."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from decode_configs import (
    config_path,
    parse_growth_rules,
    parse_growth_templates,
    parse_unit_attributes,
    stats_for_template,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = (
    ROOT / "analysis_apk" / "output" / "steel_maiden_catalog_v4" / "钢舞姬汇总数据.json"
)
DEFAULT_OUTPUT = ROOT / "analysis_apk" / "output" / "growth_curves" / "growth_curves.json"
STAT_CODES = {
    "durability": ("MAXHP", "耐久"),
    "power": ("POWER", "火力"),
    "piercing": ("PIERCING", "穿甲"),
    "armor": ("ARMOR", "装甲"),
}
CHECKPOINTS = (1, 60, 90, 99)
MAX_LEVEL = 99


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    attribute_id_by_code = {
        item["code"]: item["id"]
        for item in parse_unit_attributes(config_path("UnitAttributeInfo.dat"))
    }
    templates = {
        item["template_id"]: item
        for item in parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))
    }
    rules = {
        (item["rule_type"], item["rule_id"]): item
        for item in parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    }

    rows: dict[str, dict[str, list[int | None]]] = {}
    checked = 0
    for card in catalog["rows"]:
        card_id = int(card["钢舞姬卡牌ID"])
        template_ids = [
            int(part) for part in str(card["属性成长模板ID"]).split("/") if part.strip()
        ]
        missing = [template_id for template_id in template_ids if template_id not in templates]
        if missing:
            raise ValueError(f"Card {card_id} has missing growth templates: {missing}")

        curve = {key: [] for key in STAT_CODES}
        for level in range(1, MAX_LEVEL + 1):
            values: dict[int, int] = {}
            for template_id in template_ids:
                for attribute_id, value in stats_for_template(
                    templates[template_id], level, rules
                ).items():
                    values[attribute_id] = values.get(attribute_id, 0) + value
            for key, (code, label) in STAT_CODES.items():
                attribute_id = attribute_id_by_code[code]
                value = values.get(attribute_id)
                curve[key].append(value)
                if level in CHECKPOINTS:
                    expected = card.get(f"{level}级_{label}")
                    if value != expected:
                        raise ValueError(
                            f"Card {card_id}, {label}, level {level}: "
                            f"formula={value}, published={expected}"
                        )
                    checked += 1
        rows[str(card_id)] = curve

    payload = {"minLevel": 1, "maxLevel": MAX_LEVEL, "rows": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(args.output)
    print(
        json.dumps(
            {
                "cards": len(rows),
                "levels": MAX_LEVEL,
                "checkpoint_values_verified": checked,
                "output": str(args.output),
                "bytes": args.output.stat().st_size,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
