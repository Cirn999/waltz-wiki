#!/usr/bin/env python3
"""Inspect decoded acquisition-related tables and their ID-domain joins.

This is an analysis helper only.  It deliberately reports intersections by
field before assigning player-facing semantics to those fields.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    Reader,
    config_path,
    parse_award_groups,
    parse_award_tables,
    parse_produce_rules,
    parse_string_table,
)


def parse_commodities(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "commodity_id": r.u32(),
            "type": r.u32(),
            "field_08": r.vec_u32(),
            "field_20": r.u32(),
            "name": r.cstring(),
            "field_40": r.vec_u32(),
            "field_58": r.u32(),
            "field_5c": r.u32(),
            "field_60": r.u32(),
            "field_64": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_shops(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "shop_id": r.u32(),
            "field_04": r.u32(),
            "name": r.cstring(),
            "field_0c": r.u32(),
            "field_10": r.vec_u32(),
            "field_28": r.vec_u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_award_pools(path: Path) -> list[dict[str, Any]]:
    def pool_item(r: Reader) -> dict[str, Any]:
        return {"field_00": r.u32(), "field_04": r.vec_u32(), "field_20": r.u32()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "award_pool_id": r.u32(),
            "field_04": r.u8(),
            "groups": [
                [pool_item(r) for _ in range(r.u8())]
                for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_chapters(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(lambda r: {
        "chapter_id": r.u32(),
        "field_04": r.u32(),
        "field_08": r.u32(),
        "resource": r.cstring(),
        "name": r.cstring(),
        "level_ids": r.vec_u32(),
    })


def parse_chapter_levels(path: Path) -> list[dict[str, Any]]:
    def assess_award(r: Reader) -> dict[str, Any]:
        return {"field_00": r.u32(), "field_04": r.u32(), "field_08": r.vec_u32()}

    def fund_resource(r: Reader) -> dict[str, Any]:
        return {"field_00": r.u32(), "resource": r.cstring()}

    def drama_pair(r: Reader) -> dict[str, Any]:
        return {"field_00": r.u32(), "script": r.cstring()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "level_id": r.u32(),
            "field_04": r.u32(),
            "field_08": r.u16(),
            "field_0c": r.u32(),
            "field_10": r.u32(),
            "field_18": r.vec_u32(),
            "field_30": r.vec_u32(),
            "field_48": r.vec_u32(),
            "field_60": r.vec_u32(),
            "assess_awards": [assess_award(r) for _ in range(r.u8())],
            **{f"field_{offset:02x}": r.u32() for offset in range(0x90, 0xb4, 4)},
            "fund_resources": [fund_resource(r) for _ in range(r.u8())],
            "drama_pairs": [drama_pair(r) for _ in range(r.u8())],
            "field_108": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def intersections(values: list[int], domains: dict[str, set[int]]) -> dict[str, int]:
    return {name: sum(value in domain for value in values) for name, domain in domains.items()}


def main() -> None:
    maiden_data = json.loads(
        (ROOT / "steel-maiden-browser" / "public" / "data" / "maidens.json").read_text(encoding="utf-8")
    )
    card_ids = {int(row["id"]) for row in maiden_data["rows"]}
    groups = parse_award_groups(config_path("AwardGroupInfo.dat"))
    tables = parse_award_tables(config_path("AwardTableInfo.dat"))
    pools = parse_award_pools(config_path("AwardPoolInfo.dat"))
    rules = parse_produce_rules(config_path("ProduceRuleInfo.dat"))
    commodities = parse_commodities(config_path("commodityInfo.dat"))
    shops = parse_shops(config_path("shopInfo.dat"))
    chapters = parse_chapters(config_path("ChapterInfo.dat"))
    chapter_levels = parse_chapter_levels(config_path("ChapterLevelInfo.dat"))
    strings = parse_string_table(config_path("StringTableInfo.dat"))
    string_by_id = {item["string_id"]: item["strings"] for item in strings}

    domains = {
        "cards": card_ids,
        "award_groups": {item["award_group_id"] for item in groups},
        "award_tables": {item["award_table_id"] for item in tables},
        "award_pools": {item["award_pool_id"] for item in pools},
        "produce_rules": {item["rule_id"] for item in rules},
        "commodities": {item["commodity_id"] for item in commodities},
        "shops": {item["shop_id"] for item in shops},
        "chapters": {item["chapter_id"] for item in chapters},
        "chapter_levels": {item["level_id"] for item in chapter_levels},
        "strings": set(string_by_id),
    }

    award_types: dict[int, dict[str, Any]] = {}
    for item_type in sorted({x["item_type"] for group in groups for x in group["items"]}):
        items = [x for group in groups for x in group["items"] if x["item_type"] == item_type]
        positions: dict[int, list[int]] = defaultdict(list)
        for item in items:
            for index, value in enumerate(item["values"]):
                if isinstance(value, int):
                    positions[index].append(value)
        award_types[item_type] = {
            "count": len(items),
            "positionIntersections": {
                str(index): intersections(values, domains)
                for index, values in positions.items()
            },
            "samples": items[:8],
        }

    pool_fields: dict[str, Any] = {}
    for field in ("field_00", "field_04", "field_20"):
        values: list[int] = []
        for pool in pools:
            for group in pool["groups"]:
                for item in group:
                    value = item[field]
                    values.extend(value if isinstance(value, list) else [value])
        pool_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }

    produce_fields = {}
    for field in [key for key in rules[0] if key.startswith("field_")]:
        values: list[int] = []
        for rule in rules:
            value = rule[field]
            values.extend(value if isinstance(value, list) else [value])
        produce_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }

    commodity_fields = {}
    for field in [key for key in commodities[0] if key.startswith("field_")]:
        values: list[int] = []
        for item in commodities:
            value = item[field]
            values.extend(value if isinstance(value, list) else [value])
        commodity_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }

    shop_fields = {}
    for field in [key for key in shops[0] if key.startswith("field_")]:
        values: list[int] = []
        for item in shops:
            value = item[field]
            values.extend(value if isinstance(value, list) else [value])
        shop_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }

    chapter_level_fields: dict[str, Any] = {}
    scalar_or_vector_fields = [
        key for key in chapter_levels[0]
        if key.startswith("field_")
    ]
    for field in scalar_or_vector_fields:
        values: list[int] = []
        for item in chapter_levels:
            value = item[field]
            values.extend(value if isinstance(value, list) else [value])
        chapter_level_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }
    assess_fields: dict[str, Any] = {}
    for field in ("field_00", "field_04", "field_08"):
        values = []
        for level in chapter_levels:
            for item in level["assess_awards"]:
                value = item[field]
                values.extend(value if isinstance(value, list) else [value])
        assess_fields[field] = {
            "nonzero": sum(value != 0 for value in values),
            "intersections": intersections(values, domains),
            "top": Counter(values).most_common(12),
        }

    payload = {
        "counts": {name: len(domain) for name, domain in domains.items()},
        "awardTypes": award_types,
        "awardPoolFields": pool_fields,
        "awardTableLinkDirection": {
            "firstPairField": intersections([x["weight"] for t in tables for x in t["items"]], domains),
            "secondPairField": intersections([x["award_group_id"] for t in tables for x in t["items"]], domains),
        },
        "produceFields": produce_fields,
        "commodityTypes": Counter(item["type"] for item in commodities),
        "commodityFields": commodity_fields,
        "shopFields": shop_fields,
        "chapterLevelFields": chapter_level_fields,
        "chapterAssessAwardFields": assess_fields,
        "samples": {
            "awardGroups": groups[:20],
            "awardTables": tables[:20],
            "awardPools": pools[:8],
            "produceRules": rules[:20],
            "commodities": commodities[:20],
            "shops": shops[:20],
            "chapters": [
                {
                    **item,
                    "field_04_text": string_by_id.get(item["field_04"], []),
                    "field_08_text": string_by_id.get(item["field_08"], []),
                }
                for item in chapters[:20]
            ],
            "chapterLevels": chapter_levels[:20],
            "shopsResolved": [
                {**item, "field_04_text": string_by_id.get(item["field_04"], [])}
                for item in shops[:20]
            ],
            "commoditiesResolved": [
                {**item, "field_20_text": string_by_id.get(item["field_20"], [])}
                for item in commodities[:20]
            ],
        },
    }
    output = ROOT / "analysis_apk" / "output" / "acquisition_analysis" / "decoded_domain_inspection.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        **payload["counts"],
        "awardTypes": sorted(award_types),
        "awardTableLinkDirection": payload["awardTableLinkDirection"],
        "awardPoolFields": payload["awardPoolFields"],
        "commodityTypes": dict(payload["commodityTypes"]),
        "chapterAssessAwardFields": payload["chapterAssessAwardFields"],
        "resolvedSamples": {
            "chapters": payload["samples"]["chapters"][:8],
            "shops": payload["samples"]["shopsResolved"][:8],
            "commodities": payload["samples"]["commoditiesResolved"][:8],
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
