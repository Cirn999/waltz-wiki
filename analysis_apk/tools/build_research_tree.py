#!/usr/bin/env python3
"""Build the steel-maiden research graph from the test-server config.

Research production lines are identified by a `bHasCard(..., false)` demand
(DemandGenerateItem type 2) for the target card.  Card prerequisites are quest
achievement demands (type 3): tag 4 means obtained, tag 5 generation and tag 7
level.  This is the same interpretation used by StampUI.lua.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from decode_configs import (
    config_path,
    parse_consume_groups,
    parse_demand_groups,
    parse_fund_types,
    parse_produce_rules,
    parse_string_table,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "analysis_apk/output/research_tree"
MAIDENS_PATH = ROOT / "analysis_apk/output/steel_maiden_catalog_v4/钢舞姬汇总数据.json"
RESOURCE_CATEGORY_ORDER = {"silver": 0, "blueprint": 1, "equipment": 2, "material": 3}


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def equipment_grade(fund: dict[str, Any]) -> tuple[int | None, str]:
    """Decode the S-rank shown on an equipment item.

    FundTypeInfo.field_28 is zero-based (5 is displayed as S6).  Tags 450-456
    describe equipment slots, so treating them as ranks cross-wires values such
    as the T-54LT recipe's S6 ammunition water jacket.
    """
    raw_rank = fund.get("field_28")
    if not isinstance(raw_rank, int) or raw_rank < 0:
        return None, ""
    rank = raw_rank + 1
    return rank, f"S{rank}"


def load_maidens() -> list[dict[str, Any]]:
    """Load normalized identities directly from the decoded catalog.

    This keeps research extraction independent from the previously generated
    web JSON, so newly added cards are visible on the first synchronization.
    """
    source_rows = json.loads(MAIDENS_PATH.read_text(encoding="utf-8"))["rows"]
    return [
        {
            "id": int(row["钢舞姬卡牌ID"]),
            "tank": row["坦克/载具名称"],
            "person": row["对应人名"],
            "stage": row["科技阶段"],
            "className": row["兵种"],
            "nation": row["国籍/技术归属"],
            "rarity": row["稀有度"],
            "headImage": f'/art/heads/{int(row["钢舞姬卡牌ID"])}.webp',
        }
        for row in source_rows
    ]


def resource_label(resource: dict[str, Any]) -> str:
    grade = f'{resource.get("equipmentGrade", "")} ' if resource.get("equipmentGrade") else ""
    return f'{grade}{resource["name"]}×{resource["amount"]}'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--web-output", type=Path)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    maidens = load_maidens()
    maiden_by_id = {row["id"]: row for row in maidens}
    known_ids = set(maiden_by_id)
    demands = {
        row["demand_group_id"]: row
        for row in parse_demand_groups(config_path("DemandGroupInfo.dat"))
    }
    consumes = {
        row["consume_group_id"]: row
        for row in parse_consume_groups(config_path("ConsumeGroupInfo.dat"))
    }
    strings = {
        row["string_id"]: (row["strings"] or [""])[0]
        for row in parse_string_table(config_path("StringTableInfo.dat"))
    }
    funds = {
        row["fund_id"]: row
        for row in parse_fund_types(config_path("FundTypeInfo.dat"))
    }
    rules = parse_produce_rules(config_path("ProduceRuleInfo.dat"))

    raw_recipes: list[dict[str, Any]] = []
    for rule in rules:
        items = [
            item
            for group_id in rule["field_98"]
            for item in demands.get(group_id, {}).get("items", [])
        ]
        # type 2 = bHasCard(card, generation, expected).  A false expectation
        # identifies the card this research line unlocks.
        targets = {
            item["values"][0]
            for item in items
            if item["item_type"] == 2
            and item["values"][0] in known_ids
            and item["values"][2] == 0
        }
        if not targets:
            continue

        for target_id in sorted(targets):
            requirement_by_id: dict[int, dict[str, Any]] = {}
            for item in items:
                if item["item_type"] != 3:
                    continue
                card_id, achievement_tag, minimum, maximum = item["values"]
                if card_id not in known_ids or card_id == target_id:
                    continue
                if achievement_tag not in (4, 5, 7):
                    continue
                requirement = requirement_by_id.setdefault(
                    card_id,
                    {"cardId": card_id, "obtained": False, "generation": None, "level": None},
                )
                if achievement_tag == 4:
                    requirement["obtained"] = minimum >= 1
                elif achievement_tag == 5:
                    requirement["generation"] = minimum
                elif achievement_tag == 7:
                    requirement["level"] = minimum
                requirement.setdefault("bounds", {})[str(achievement_tag)] = [minimum, maximum]

            requirements = sorted(requirement_by_id.values(), key=lambda row: row["cardId"])
            if not requirements:
                continue

            commander_levels = [
                item["values"][1]
                for item in items
                if item["item_type"] == 1 and item["values"][0] == 1
            ]
            resources: list[dict[str, Any]] = []
            for consume_group_id in rule["field_b0"]:
                for consume in consumes.get(consume_group_id, {}).get("items", []):
                    if consume["item_type"] != 0:
                        continue
                    fund_id = consume["values"][0]
                    fund = funds.get(fund_id, {})
                    tags = fund.get("tags", [])
                    if fund_id == 1:
                        category = "silver"
                        category_name = "银币"
                    elif 1406 in tags or 3101 <= fund_id <= 3199:
                        category = "blueprint"
                        category_name = "图纸"
                    elif 83 in tags:
                        category = "equipment"
                        category_name = "装备"
                    else:
                        category = "material"
                        category_name = "其他材料"
                    equipment_rank, equipment_grade_name = (
                        equipment_grade(fund) if category == "equipment" else (None, "")
                    )
                    resources.append(
                        {
                            "fundId": fund_id,
                            "name": strings.get(fund.get("name_string_id"), "") or f"资源 #{fund_id}",
                            "amount": consume["amount"],
                            "category": category,
                            "categoryName": category_name,
                            "icon": fund.get("icon", ""),
                            "equipmentRank": equipment_rank,
                            "equipmentGrade": equipment_grade_name,
                        }
                    )
            raw_recipes.append(
                {
                    "targetId": target_id,
                    "requirements": requirements,
                    "commanderLevel": max(commander_levels) if commander_levels else None,
                    "resources": sorted(
                        resources,
                        key=lambda row: (RESOURCE_CATEGORY_ORDER[row["category"]], row["fundId"]),
                    ),
                    "ruleId": rule["rule_id"],
                    "ruleTags": rule["field_40"],
                    "limited": 1409 in rule["field_40"],
                }
            )

    # Payment/event variants often repeat the same research relationship.
    # Collapse only exact prerequisite sets; genuinely alternate recipes remain
    # separate OR branches for the same target.
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for recipe in raw_recipes:
        key = (
            recipe["targetId"],
            tuple(
                (row["cardId"], row["obtained"], row["generation"], row["level"])
                for row in recipe["requirements"]
            ),
        )
        grouped[key].append(recipe)

    recipes: list[dict[str, Any]] = []
    for index, variants in enumerate(
        sorted(grouped.values(), key=lambda rows: (rows[0]["targetId"], rows[0]["ruleId"])),
        start=1,
    ):
        first = variants[0]
        target = maiden_by_id[first["targetId"]]
        requirements = []
        for requirement in first["requirements"]:
            source = maiden_by_id[requirement["cardId"]]
            requirements.append(
                {
                    **{key: value for key, value in requirement.items() if key != "bounds"},
                    "tank": source["tank"],
                    "person": source["person"],
                    "stage": source["stage"],
                    "headImage": source["headImage"],
                }
            )
        plan_groups: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
        for variant in variants:
            plan_key = (
                variant["commanderLevel"],
                tuple(
                    (resource["fundId"], resource["amount"])
                    for resource in variant["resources"]
                ),
            )
            plan_groups[plan_key].append(variant)
        resource_plans = []
        for plan_index, plan_variants in enumerate(
            sorted(
                plan_groups.values(),
                # ProduceRule order is the method-tab order shown by the
                # client. Sorting by price swaps T-54LT's methods 1 and 2.
                key=lambda rows: min(row["ruleId"] for row in rows),
            ),
            start=1,
        ):
            resource_plans.append(
                {
                    "id": f"R{index:04d}-P{plan_index:02d}",
                    "commanderLevel": plan_variants[0]["commanderLevel"],
                    "resources": plan_variants[0]["resources"],
                    "ruleIds": sorted(row["ruleId"] for row in plan_variants),
                    "hasPermanentVariant": any(not row["limited"] for row in plan_variants),
                    "hasLimitedVariant": any(row["limited"] for row in plan_variants),
                }
            )
        recipes.append(
            {
                "id": f"R{index:04d}",
                "targetId": first["targetId"],
                "target": {
                    "tank": target["tank"],
                    "person": target["person"],
                    "stage": target["stage"],
                    "className": target["className"],
                    "nation": target["nation"],
                    "headImage": target["headImage"],
                },
                "requirements": requirements,
                "resourcePlans": resource_plans,
                "ruleIds": sorted(row["ruleId"] for row in variants),
                "hasPermanentVariant": any(not row["limited"] for row in variants),
                "hasLimitedVariant": any(row["limited"] for row in variants),
            }
        )

    upstream: dict[int, list[str]] = defaultdict(list)
    downstream: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for recipe in recipes:
        upstream[recipe["targetId"]].append(recipe["id"])
        for requirement in recipe["requirements"]:
            downstream[requirement["cardId"]].append(
                {"recipeId": recipe["id"], "targetId": recipe["targetId"]}
            )

    nodes = []
    for maiden in maidens:
        card_id = maiden["id"]
        if card_id not in upstream and card_id not in downstream:
            continue
        nodes.append(
            {
                "id": card_id,
                "tank": maiden["tank"],
                "person": maiden["person"],
                "nation": maiden["nation"],
                "className": maiden["className"],
                "stage": maiden["stage"],
                "rarity": maiden["rarity"],
                "headImage": maiden["headImage"],
                "upstreamRecipeIds": upstream.get(card_id, []),
                "downstream": downstream.get(card_id, []),
            }
        )

    payload = {
        "meta": {
            "source": "测试服 APK / patch _1.18 静态配置",
            "generatedAt": date.today().isoformat(),
            "recipeSemantics": "同一配方内前置为 AND；同一目标的多条不同配方为 OR",
            "resourcePlanSemantics": "同一前置组合下的资源方案是不同活动、渠道或时期的配置变体，不累计；实际可用方案由服务器状态决定",
            "achievementTags": {"4": "已获得", "5": "代数", "7": "等级"},
            "rawRuleCount": len(raw_recipes),
            "recipeCount": len(recipes),
            "nodeCount": len(nodes),
            "targetCount": len(upstream),
            "edgeCount": sum(len(recipe["requirements"]) for recipe in recipes),
            "resourcePlanCount": sum(len(recipe["resourcePlans"]) for recipe in recipes),
            "resourceItemCount": sum(
                len(plan["resources"])
                for recipe in recipes
                for plan in recipe["resourcePlans"]
            ),
            "equipmentResourceCount": sum(
                resource["category"] == "equipment"
                for recipe in recipes
                for plan in recipe["resourcePlans"]
                for resource in plan["resources"]
            ),
            "equipmentGradeResolvedCount": sum(
                resource["category"] == "equipment" and bool(resource["equipmentGrade"])
                for recipe in recipes
                for plan in recipe["resourcePlans"]
                for resource in plan["resources"]
            ),
            "prerequisiteCountDistribution": dict(
                sorted(Counter(len(recipe["requirements"]) for recipe in recipes).items())
            ),
        },
        "nodes": nodes,
        "recipes": recipes,
    }
    json_text = json.dumps(payload, ensure_ascii=False, indent=2)
    (args.output / "研发科技树.json").write_text(json_text, encoding="utf-8")
    if args.web_output:
        args.web_output.parent.mkdir(parents=True, exist_ok=True)
        args.web_output.write_text(json_text, encoding="utf-8")

    detail_rows = []
    for recipe in recipes:
        for order, source in enumerate(recipe["requirements"], start=1):
            detail_rows.append(
                {
                    "配方组": recipe["id"],
                    "目标ID": recipe["targetId"],
                    "目标坦克": recipe["target"]["tank"],
                    "目标人名": recipe["target"]["person"],
                    "目标科技阶段": recipe["target"]["stage"],
                    "前置序号": order,
                    "前置ID": source["cardId"],
                    "前置坦克": source["tank"],
                    "前置人名": source["person"],
                    "需达到代数": source["generation"] or "",
                    "需达到等级": source["level"] or "",
                    "资源方案数": len(recipe["resourcePlans"]),
                    "指挥官等级（各方案）": "/".join(
                        str(plan["commanderLevel"] or "") for plan in recipe["resourcePlans"]
                    ),
                    "研发资源（各方案）": " || ".join(
                        "; ".join(
                            resource_label(resource)
                            for resource in plan["resources"]
                        )
                        for plan in recipe["resourcePlans"]
                    ),
                    "是否有常驻配方": "是" if recipe["hasPermanentVariant"] else "否",
                    "是否有活动配方": "是" if recipe["hasLimitedVariant"] else "否",
                    "原始生产线ID": "/".join(map(str, recipe["ruleIds"])),
                }
            )
    columns = [
        "配方组", "目标ID", "目标坦克", "目标人名", "目标科技阶段", "前置序号",
        "前置ID", "前置坦克", "前置人名", "需达到代数", "需达到等级",
        "资源方案数", "指挥官等级（各方案）", "研发资源（各方案）",
        "是否有常驻配方", "是否有活动配方", "原始生产线ID",
    ]
    write_csv(args.output / "研发配方明细.csv", detail_rows, columns)

    resource_rows = []
    for recipe in recipes:
        for plan_index, plan in enumerate(recipe["resourcePlans"], start=1):
            if not plan["resources"]:
                resource_rows.append(
                    {
                        "配方组": recipe["id"],
                        "目标ID": recipe["targetId"],
                        "目标坦克": recipe["target"]["tank"],
                        "目标人名": recipe["target"]["person"],
                        "资源方案": plan_index,
                        "指挥官等级": plan["commanderLevel"] or "",
                        "资源分类": "",
                        "资源ID": "",
                        "资源名称": "",
                        "装备等级": "",
                        "数量": "",
                        "原始生产线ID": "/".join(map(str, plan["ruleIds"])),
                    }
                )
            for resource in plan["resources"]:
                resource_rows.append(
                    {
                        "配方组": recipe["id"],
                        "目标ID": recipe["targetId"],
                        "目标坦克": recipe["target"]["tank"],
                        "目标人名": recipe["target"]["person"],
                        "资源方案": plan_index,
                        "指挥官等级": plan["commanderLevel"] or "",
                        "资源分类": resource["categoryName"],
                        "资源ID": resource["fundId"],
                        "资源名称": resource["name"],
                        "装备等级": resource["equipmentGrade"],
                        "数量": resource["amount"],
                        "原始生产线ID": "/".join(map(str, plan["ruleIds"])),
                    }
                )
    write_csv(
        args.output / "研发资源消耗明细.csv",
        resource_rows,
        [
            "配方组", "目标ID", "目标坦克", "目标人名", "资源方案",
            "指挥官等级", "资源分类", "资源ID", "资源名称", "装备等级", "数量", "原始生产线ID",
        ],
    )

    index_rows = []
    for node in nodes:
        parents = sorted({
            requirement["cardId"]
            for recipe in recipes if recipe["targetId"] == node["id"]
            for requirement in recipe["requirements"]
        })
        children = sorted({entry["targetId"] for entry in node["downstream"]})
        index_rows.append(
            {
                "钢舞姬ID": node["id"],
                "坦克名": node["tank"],
                "人名": node["person"],
                "上级ID": "/".join(map(str, parents)),
                "上级坦克": "/".join(maiden_by_id[value]["tank"] for value in parents),
                "下级ID": "/".join(map(str, children)),
                "下级坦克": "/".join(maiden_by_id[value]["tank"] for value in children),
            }
        )
    write_csv(
        args.output / "钢舞姬上下级索引.csv",
        index_rows,
        ["钢舞姬ID", "坦克名", "人名", "上级ID", "上级坦克", "下级ID", "下级坦克"],
    )
    print(json.dumps(payload["meta"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
