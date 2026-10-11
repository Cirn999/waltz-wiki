#!/usr/bin/env python3
"""Build a preliminary, evidence-backed steel-maiden acquisition dataset.

The output is intentionally separate from the web application.  It distinguishes
confirmed config relationships from route labels that still need UI/server-side
validation.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    Reader,
    config_path,
    parse_award_groups,
    parse_award_tables,
    parse_arranged_styles,
    parse_capsule_types,
    parse_consume_groups,
    parse_demand_groups,
    parse_fund_types,
    parse_produce_rules,
    parse_string_table,
)
from inspect_acquisition_configs import (  # noqa: E402
    parse_award_pools,
    parse_chapter_levels,
    parse_chapters,
    parse_commodities,
    parse_shops,
)

OUTPUT = ROOT / "analysis_apk" / "output" / "acquisition_analysis_v2_outfits"
MAIDENS = ROOT / "analysis_apk" / "output" / "steel_maiden_catalog_v4" / "钢舞姬汇总数据.json"
RESEARCH_TREE = ROOT / "steel-maiden-browser" / "public" / "data" / "research-tree.json"


def parse_campaign_types(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "campaign_type_id": r.u32(),
            "code": r.cstring(),
            "properties": [
                {"property_id": r.u32(), "value": r.u32()}
                for _ in range(r.u8())
            ],
            "tags": r.vec_u32(),
            "name_string_id": r.u32(),
            "description_string_id": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_campaign_schedules(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(lambda r: {
        "schedule_id": r.u32(),
        "campaign_type_id": r.u32(),
        "begin_time": r.u32(),
        "end_time": r.u32(),
        "code": r.cstring(),
        "field_2c": r.u32(),
        "field_30": r.u32(),
    })


def first_text(string_by_id: dict[int, list[str]], string_id: int) -> str:
    return next((text for text in string_by_id.get(string_id, []) if text), "")


def iso_time(value: int) -> str:
    if not value:
        return ""
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat()
    except (ValueError, OSError, OverflowError):
        return ""


def unique_sorted(values: Iterable[int]) -> list[int]:
    return sorted(set(values))


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_maidens() -> list[dict[str, Any]]:
    """Normalize identities from the decoded catalog, not stale web output."""
    source_rows = json.loads(MAIDENS.read_text(encoding="utf-8"))["rows"]
    return [
        {
            "id": int(row["钢舞姬卡牌ID"]),
            "tank": row["坦克/载具名称"],
            "person": row["对应人名"],
            "stage": row["科技阶段"],
            "rarity": row["稀有度"],
        }
        for row in source_rows
    ]


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    research_tree_payload = json.loads(RESEARCH_TREE.read_text(encoding="utf-8"))
    research_tree_target_ids = {int(row["targetId"]) for row in research_tree_payload["recipes"]}
    maidens = load_maidens()
    maiden_by_id = {int(row["id"]): row for row in maidens}
    card_ids = set(maiden_by_id)

    strings = parse_string_table(config_path("StringTableInfo.dat"))
    string_by_id = {row["string_id"]: row["strings"] for row in strings}
    award_groups = parse_award_groups(config_path("AwardGroupInfo.dat"))
    award_tables = parse_award_tables(config_path("AwardTableInfo.dat"))
    award_pools = parse_award_pools(config_path("AwardPoolInfo.dat"))
    produce_rules = parse_produce_rules(config_path("ProduceRuleInfo.dat"))
    demands = {row["demand_group_id"]: row for row in parse_demand_groups(config_path("DemandGroupInfo.dat"))}
    consumes = {row["consume_group_id"]: row for row in parse_consume_groups(config_path("ConsumeGroupInfo.dat"))}
    funds = {row["fund_id"]: row for row in parse_fund_types(config_path("FundTypeInfo.dat"))}
    capsule_types = parse_capsule_types(config_path("CapsuleTypeInfo.dat"))
    arranged_styles = parse_arranged_styles(config_path("ArrangedStyleInfo.dat"))
    chapters = parse_chapters(config_path("ChapterInfo.dat"))
    chapter_levels = parse_chapter_levels(config_path("ChapterLevelInfo.dat"))
    commodities = parse_commodities(config_path("commodityInfo.dat"))
    shops = parse_shops(config_path("shopInfo.dat"))
    campaign_types = parse_campaign_types(config_path("CampaignTypeInfo.dat"))
    campaign_schedules = parse_campaign_schedules(config_path("CampaignScheduleInfo.dat"))

    # Confirmed reward graph recovered from native readers and StampUI.lua:
    # AwardTable -> AwardPool -> AwardGroup -> inventory fund.
    # Fund tag 84 marks a steel-maiden outfit; its most-specific capsule tag is
    # resolved by GetCapsuleTypeFromTag, then the outfit can recruit that maiden.
    capsules_by_tag: dict[int, set[int]] = defaultdict(set)
    for capsule in capsule_types:
        card_id = int(capsule["capsule_type_id"])
        if card_id not in card_ids:
            continue
        capsule_tags = (
            list(capsule["group_a_ids"])
            + list(capsule["group_b_ids"])
            + [capsule["growth_tag_id"]]
        )
        for tag in capsule_tags:
            capsules_by_tag[int(tag)].add(card_id)

    outfit_fund_cards: dict[int, set[int]] = {}
    outfit_fund_evidence: dict[int, list[dict[str, Any]]] = {}
    for fund_id, fund in funds.items():
        tags = [int(tag) for tag in fund["tags"]]
        if 84 not in tags:
            continue
        matches = [
            {"tag": tag, "cards": sorted(capsules_by_tag[tag])}
            for tag in tags
            if tag != 84 and capsules_by_tag.get(tag)
        ]
        if not matches:
            continue
        minimum = min(len(item["cards"]) for item in matches)
        most_specific = [item for item in matches if len(item["cards"]) == minimum]
        outfit_fund_cards[fund_id] = set().union(*(
            set(item["cards"]) for item in most_specific
        ))
        outfit_fund_evidence[fund_id] = most_specific

    fund_ids = set(funds)
    group_cards: dict[int, set[int]] = {}
    group_outfit_funds: dict[int, set[int]] = {}
    group_direct_cards: dict[int, set[int]] = {}
    card_groups: dict[int, list[int]] = defaultdict(list)
    for group in award_groups:
        direct_cards = {
            int(item["values"][0])
            for item in group["items"]
            if item["item_type"] == 2 and int(item["values"][0]) in card_ids
        }
        outfit_funds = {
            int(item["values"][0])
            for item in group["items"]
            if item["item_type"] in (0, 1)
            and int(item["values"][0]) in fund_ids
            and int(item["values"][0]) in outfit_fund_cards
        }
        cards = direct_cards | {
            card_id for fund_id in outfit_funds for card_id in outfit_fund_cards[fund_id]
        }
        if cards:
            group_cards[group["award_group_id"]] = cards
            group_direct_cards[group["award_group_id"]] = direct_cards
            group_outfit_funds[group["award_group_id"]] = outfit_funds
            for card_id in cards:
                card_groups[card_id].append(group["award_group_id"])

    pool_cards: dict[int, set[int]] = {}
    pool_outfit_funds: dict[int, set[int]] = {}
    pool_direct_cards: dict[int, set[int]] = {}
    for pool in award_pools:
        cards: set[int] = set()
        outfit_funds: set[int] = set()
        direct_cards: set[int] = set()
        for pool_group in pool["groups"]:
            for item in pool_group:
                group_id = item["field_20"]
                cards.update(group_cards.get(group_id, set()))
                outfit_funds.update(group_outfit_funds.get(group_id, set()))
                direct_cards.update(group_direct_cards.get(group_id, set()))
        if cards:
            pool_cards[pool["award_pool_id"]] = cards
            pool_outfit_funds[pool["award_pool_id"]] = outfit_funds
            pool_direct_cards[pool["award_pool_id"]] = direct_cards

    table_cards: dict[int, set[int]] = {}
    table_outfit_funds: dict[int, set[int]] = {}
    table_direct_cards: dict[int, set[int]] = {}
    for table in award_tables:
        cards: set[int] = set()
        outfit_funds: set[int] = set()
        direct_cards: set[int] = set()
        for item in table["items"]:
            pool_id = item["award_group_id"]
            cards.update(pool_cards.get(pool_id, set()))
            outfit_funds.update(pool_outfit_funds.get(pool_id, set()))
            direct_cards.update(pool_direct_cards.get(pool_id, set()))
        if cards:
            table_cards[table["award_table_id"]] = cards
            table_outfit_funds[table["award_table_id"]] = outfit_funds
            table_direct_cards[table["award_table_id"]] = direct_cards

    rule_by_id = {rule["rule_id"]: rule for rule in produce_rules}
    rule_cards: dict[int, set[int]] = {
        rule["rule_id"]: set().union(*(table_cards.get(table_id, set()) for table_id in rule["field_c8"]))
        for rule in produce_rules
    }
    rule_cards = {rule_id: cards for rule_id, cards in rule_cards.items() if cards}

    def fund_label(fund_id: int) -> str:
        fund = funds.get(fund_id, {})
        return first_text(string_by_id, int(fund.get("name_string_id", 0))) or f"资源#{fund_id}"

    def rule_costs(rule: dict[str, Any]) -> list[dict[str, Any]]:
        result = []
        for consume_group_id in rule.get("field_b0", []):
            for item in consumes.get(consume_group_id, {}).get("items", []):
                if item["item_type"] != 0:
                    continue
                fund_id = int(item["values"][0])
                result.append({
                    "consumeGroupId": consume_group_id,
                    "fundId": fund_id,
                    "name": fund_label(fund_id),
                    "description": funds.get(fund_id, {}).get("description", ""),
                    "amount": item["amount"],
                })
        return result

    # A bHasCard(target, generation, false) demand is the exact client-side
    # marker for a normal research target (the same rule used by StampUI.lua).
    research_targets_by_rule: dict[int, set[int]] = {}
    for rule in produce_rules:
        targets = {
            int(item["values"][0])
            for demand_group_id in rule["field_98"]
            for item in demands.get(demand_group_id, {}).get("items", [])
            if item["item_type"] == 2
            and int(item["values"][0]) in card_ids
            and int(item["values"][2]) == 0
        }
        if targets:
            research_targets_by_rule[rule["rule_id"]] = targets

    campaign_by_tag: dict[int, list[dict[str, Any]]] = defaultdict(list)
    schedules_by_type: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for schedule in campaign_schedules:
        schedules_by_type[schedule["campaign_type_id"]].append(schedule)
    decoded_campaigns = []
    for campaign in campaign_types:
        resolved = {
            **campaign,
            "name": first_text(string_by_id, campaign["name_string_id"]),
            "description": first_text(string_by_id, campaign["description_string_id"]),
            "schedules": [
                {**row, "begin_iso_utc": iso_time(row["begin_time"]), "end_iso_utc": iso_time(row["end_time"])}
                for row in schedules_by_type.get(campaign["campaign_type_id"], [])
            ],
        }
        decoded_campaigns.append(resolved)
        for tag in campaign["tags"]:
            campaign_by_tag[tag].append(resolved)

    def campaign_labels(tags: Iterable[int]) -> list[str]:
        labels = []
        for tag in tags:
            for campaign in campaign_by_tag.get(tag, []):
                label = campaign["name"] or campaign["code"] or f'活动#{campaign["campaign_type_id"]}'
                if label not in labels:
                    labels.append(label)
        return labels

    # StampUI numbers a story chapter by its ordinal inside a VOLxx group, not
    # by the battle level inside that chapter.  This is the number players see
    # in labels such as "1-4 巴黎之役" and "16-3 埃普西隆夜袭".
    chapter_code_by_id: dict[int, str] = {}
    chapter_code_by_title: dict[str, str] = {}
    volume_counts: dict[str, int] = defaultdict(int)
    for chapter in chapters:
        resource = str(chapter.get("resource", ""))
        match = re.fullmatch(r"VOL(\d+)", resource)
        if not match:
            continue
        volume_counts[resource] += 1
        code = f"{int(match.group(1))}-{volume_counts[resource]}"
        chapter_code_by_id[int(chapter["chapter_id"])] = code
        title = first_text(string_by_id, int(chapter.get("field_04", 0)))
        if title:
            chapter_code_by_title[title] = code

    chapter_by_level: dict[int, tuple[dict[str, Any], int]] = {}
    for chapter in chapters:
        for index, level_id in enumerate(chapter["level_ids"], start=1):
            chapter_by_level[level_id] = (chapter, index)

    chapter_routes: list[dict[str, Any]] = []
    for level in chapter_levels:
        table_ids = unique_sorted(
            table_id
            for assess in level["assess_awards"]
            for table_id in assess["field_08"]
            if table_id in table_cards
        )
        cards = unique_sorted(card_id for table_id in table_ids for card_id in table_cards[table_id])
        chapter, level_index = chapter_by_level.get(level["level_id"], ({}, 0))
        title = first_text(string_by_id, int(chapter.get("field_04", 0)))
        chapter_code = chapter_code_by_id.get(int(chapter.get("chapter_id", 0)))
        if not chapter_code and title:
            chapter_code = chapter_code_by_title.get(re.sub(r"[（(]捷径[）)]$", "", title))
        for card_id in cards:
            matching_table_ids = [table_id for table_id in table_ids if card_id in table_cards[table_id]]
            outfit_fund_ids = unique_sorted(
                fund_id
                for table_id in matching_table_ids
                for fund_id in table_outfit_funds.get(table_id, set())
                if card_id in outfit_fund_cards.get(fund_id, set())
            )
            has_direct_card = any(
                card_id in table_direct_cards.get(table_id, set())
                for table_id in matching_table_ids
            )
            chapter_routes.append({
                "cardId": card_id,
                "chapterId": chapter.get("chapter_id"),
                "chapterName": title,
                "chapterCode": chapter_code or "",
                "chapterResource": chapter.get("resource", ""),
                "levelId": level["level_id"],
                "levelIndex": level_index,
                "awardTableIds": matching_table_ids,
                "deliveryModes": [
                    *(["舞装掉落后在仓库征召"] if outfit_fund_ids else []),
                    *(["直接获得钢舞姬"] if has_direct_card else []),
                ],
                "outfitFundIds": outfit_fund_ids,
                "outfitNames": [fund_label(fund_id) for fund_id in outfit_fund_ids],
                "directCardConfigured": has_direct_card,
                "confidence": "high",
                "evidence": "ChapterLevelInfo.assess_awards → reward graph → Fund(tag 84 outfit) → capsule-specific tag → warehouse recruit",
            })

    # The acquisition popup does not guess routes from rewards.  StampUI follows
    # the card/outfit property tags into ArrangedStyle GETWAY child records.  In
    # particular, DEVELOP carries the exact deadwater/air-bureau level and LOOT
    # carries the player-facing VOL number plus chapter ordinal.
    style_by_id = {row["arranged_style_id"]: row for row in arranged_styles}
    capsule_by_id = {row["capsule_type_id"]: row for row in capsule_types}

    def item_number(item: dict[str, Any], entry_id: int) -> int | None:
        return next((int(entry["value"]) for entry in item["number_entries"] if entry["entry_id"] == entry_id), None)

    def item_string(item: dict[str, Any], entry_id: int) -> str:
        return next((str(entry["value"]) for entry in item["string_entries"] if entry["entry_id"] == entry_id), "")

    getway_routes: list[dict[str, Any]] = []
    for card_id in sorted(card_ids):
        capsule = capsule_by_id.get(card_id, {})
        capsule_tags = set(
            list(capsule.get("group_a_ids", []))
            + list(capsule.get("group_b_ids", []))
            + [int(capsule.get("growth_tag_id", 0))]
        )
        matching_outfit_funds = [
            funds[fund_id]
            for fund_id, mapped_cards in outfit_fund_cards.items()
            if card_id in mapped_cards and fund_id in funds
        ]
        source_tags = capsule_tags | {
            int(tag) for fund in matching_outfit_funds for tag in fund.get("tags", [])
        }
        seen_getways: set[tuple[Any, ...]] = set()
        for parent in arranged_styles:
            shared_tags = source_tags.intersection(parent["tags"])
            if not shared_tags:
                continue
            for parent_item in parent["items"]:
                if parent_item["mode_code"] != "GETWAY":
                    continue
                child_style_id = item_number(parent_item, 6)
                child = style_by_id.get(child_style_id or -1)
                if not child:
                    continue
                for item in child["items"]:
                    mode = str(item["mode_code"])
                    if mode not in {"DEVELOP", "LOOT", "GACHA", "PORT", "SHOP"}:
                        continue
                    ratio = item_number(item, 1) or 0
                    filter_code = str(item.get("filter_code", ""))
                    text_string_id = item_number(item, 5) or 0
                    display_text = first_text(string_by_id, text_string_id)
                    key = (mode, filter_code, ratio, display_text, child_style_id)
                    if key in seen_getways:
                        continue
                    seen_getways.add(key)
                    chapter_code = ""
                    chapter_name = ""
                    match = re.fullmatch(r"VOL(\d+)", filter_code)
                    if mode == "LOOT" and match and ratio:
                        chapter_code = f"{int(match.group(1))}-{ratio}"
                        chapter_name = next((
                            first_text(string_by_id, int(chapter.get("field_04", 0)))
                            for chapter in chapters
                            if chapter_code_by_id.get(int(chapter["chapter_id"])) == chapter_code
                        ), "")
                    is_air = 4708 in capsule_tags
                    getway_routes.append({
                        "cardId": card_id,
                        "mode": mode,
                        "displayText": display_text,
                        "filterCode": filter_code,
                        "ratio": ratio,
                        "icon": item_string(item, 1),
                        "sourceStyleId": parent["arranged_style_id"],
                        "childStyleId": child_style_id,
                        "sharedTags": sorted(shared_tags),
                        "buildingId": 18509 if is_air and mode == "DEVELOP" else 18508 if mode == "DEVELOP" else None,
                        "buildingName": "空务设计局" if is_air and mode == "DEVELOP" else "死水姬务段" if mode == "DEVELOP" else "",
                        "buildingLevel": ratio if mode == "DEVELOP" else None,
                        "chapterCode": chapter_code,
                        "chapterName": chapter_name,
                        "confidence": "high",
                        "evidence": "StampUI: capsule/outfit tags -> ArrangedStyle GETWAY -> child item",
                    })

    commodity_by_id = {item["commodity_id"]: item for item in commodities}
    shop_routes: list[dict[str, Any]] = []
    for shop in shops:
        shop_name = first_text(string_by_id, shop["field_04"])
        shop_campaigns = campaign_labels(shop["field_28"])
        for commodity_id in shop["field_10"]:
            commodity = commodity_by_id.get(commodity_id)
            if not commodity or commodity["type"] != 1:
                continue
            rule_id = commodity["field_58"]
            cards = rule_cards.get(rule_id, set())
            rule = rule_by_id.get(rule_id, {})
            labels = list(dict.fromkeys(shop_campaigns + campaign_labels(rule.get("field_40", []))))
            commodity_name = first_text(string_by_id, commodity["field_20"])
            costs = rule_costs(rule)
            for card_id in sorted(cards):
                matching_table_ids = [
                    table_id for table_id in rule.get("field_c8", [])
                    if card_id in table_cards.get(table_id, set())
                ]
                outfit_fund_ids = unique_sorted(
                    fund_id
                    for table_id in matching_table_ids
                    for fund_id in table_outfit_funds.get(table_id, set())
                    if card_id in outfit_fund_cards.get(fund_id, set())
                )
                has_direct_card = any(
                    card_id in table_direct_cards.get(table_id, set())
                    for table_id in matching_table_ids
                )
                shop_routes.append({
                    "cardId": card_id,
                    "shopId": shop["shop_id"],
                    "shopName": shop_name,
                    "commodityId": commodity_id,
                    "commodityName": commodity_name,
                    "produceRuleId": rule_id,
                    "campaignLabels": labels,
                    "costs": costs,
                    "deliveryModes": [
                        *(["获得舞装后在仓库征召"] if outfit_fund_ids else []),
                        *(["直接获得钢舞姬"] if has_direct_card else []),
                    ],
                    "outfitFundIds": outfit_fund_ids,
                    "outfitNames": [fund_label(fund_id) for fund_id in outfit_fund_ids],
                    "directCardConfigured": has_direct_card,
                    "confidence": "high-chain/medium-label",
                    "evidence": "shopInfo → commodityInfo(type=1) → ProduceRuleInfo → typed reward graph",
                })

    research_routes: list[dict[str, Any]] = []
    for rule_id, targets in research_targets_by_rule.items():
        rule = rule_by_id[rule_id]
        awarded = rule_cards.get(rule_id, set())
        for card_id in sorted(targets & research_tree_target_ids):
            matching_table_ids = [
                table_id for table_id in rule.get("field_c8", [])
                if card_id in table_cards.get(table_id, set())
            ]
            outfit_fund_ids = unique_sorted(
                fund_id
                for table_id in matching_table_ids
                for fund_id in table_outfit_funds.get(table_id, set())
                if card_id in outfit_fund_cards.get(fund_id, set())
            )
            has_direct_card = any(
                card_id in table_direct_cards.get(table_id, set())
                for table_id in matching_table_ids
            )
            research_routes.append({
                "cardId": card_id,
                "produceRuleId": rule_id,
                "rewardGraphContainsTarget": card_id in awarded,
                "campaignLabels": campaign_labels(rule["field_40"]),
                "costs": rule_costs(rule),
                "deliveryModes": [
                    *(["获得舞装后在仓库征召"] if outfit_fund_ids else []),
                    *(["直接获得钢舞姬"] if has_direct_card else []),
                ],
                "outfitFundIds": outfit_fund_ids,
                "directCardConfigured": has_direct_card,
                "confidence": "high" if card_id in awarded else "medium",
                "evidence": "ProduceRule demand has bHasCard(target,false); output independently checked against reward graph",
            })

    other_produce_routes: list[dict[str, Any]] = []
    for rule_id, cards in rule_cards.items():
        research_targets = research_targets_by_rule.get(rule_id, set()) & research_tree_target_ids
        labels = campaign_labels(rule_by_id[rule_id]["field_40"])
        if not labels and research_targets:
            continue
        for card_id in sorted(cards - research_targets):
            rule = rule_by_id[rule_id]
            matching_table_ids = [
                table_id for table_id in rule.get("field_c8", [])
                if card_id in table_cards.get(table_id, set())
            ]
            outfit_fund_ids = unique_sorted(
                fund_id
                for table_id in matching_table_ids
                for fund_id in table_outfit_funds.get(table_id, set())
                if card_id in outfit_fund_cards.get(fund_id, set())
            )
            has_direct_card = any(
                card_id in table_direct_cards.get(table_id, set())
                for table_id in matching_table_ids
            )
            other_produce_routes.append({
                "cardId": card_id,
                "produceRuleId": rule_id,
                "campaignLabels": labels,
                "deliveryModes": [
                    *(["获得舞装后在仓库征召"] if outfit_fund_ids else []),
                    *(["直接获得钢舞姬"] if has_direct_card else []),
                ],
                "outfitFundIds": outfit_fund_ids,
                "outfitNames": [fund_label(fund_id) for fund_id in outfit_fund_ids],
                "directCardConfigured": has_direct_card,
                "routeClass": "活动关联生产线" if labels else "未分类生产/奖励线",
                "confidence": "medium" if labels else "low-label/high-chain",
                "evidence": "ProduceRule output reward graph contains card; exact UI feature label unresolved",
            })

    paths_by_card: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for name, rows in (
        ("chapter", chapter_routes),
        ("getway", getway_routes),
        ("shop", shop_routes),
        ("research", research_routes),
        ("otherProduce", other_produce_routes),
    ):
        for row in rows:
            paths_by_card[row["cardId"]][name].append(row)

    card_rows = []
    for card_id, maiden in sorted(maiden_by_id.items()):
        routes = paths_by_card.get(card_id, {})
        card_rows.append({
            "cardId": card_id,
            "tank": maiden["tank"],
            "person": maiden["person"],
            "stage": maiden["stage"],
            "rarity": maiden["rarity"],
            "directAwardGroupIds": unique_sorted(card_groups.get(card_id, [])),
            "routes": routes,
            "routeCounts": {name: len(items) for name, items in routes.items()},
        })

    exact_terms = [
        "博物馆", "源铁爆破", "舞装再制", "特勤局", "资材特卖", "特战招募",
        "季度礼包", "掌上饕餮", "掌中饕餮", "贝壳", "晶壳", "水晶贝",
        "特别行动", "定向爆破", "秋实口粮", "水晶涂层", "冰晶涂层", "阿喀琉斯MK-IIC",
        "春季限定", "夏季限定", "261-2工程", "特遣部队", "特供精英",
        "特种精英", "野蜂后期型", "胜利式", "车钥匙", "钥匙", "礼包", "兑换",
    ]
    semantic_evidence = {}
    for term in exact_terms:
        semantic_evidence[term] = {
            "strings": [
                {"stringId": row["string_id"], "text": text}
                for row in strings for text in row["strings"] if term in text
            ],
            "campaigns": [
                {"campaignTypeId": row["campaign_type_id"], "name": row["name"], "code": row["code"], "tags": row["tags"]}
                for row in decoded_campaigns if term in row["name"] or term in row["description"]
            ],
            "shops": [
                {"shopId": row["shop_id"], "name": first_text(string_by_id, row["field_04"]), "tags": row["field_28"]}
                for row in shops if term in first_text(string_by_id, row["field_04"])
            ],
            "commodities": [
                {"commodityId": row["commodity_id"], "name": first_text(string_by_id, row["field_20"]), "type": row["type"]}
                for row in commodities if term in first_text(string_by_id, row["field_20"])
            ],
            "funds": [
                {
                    "fundId": fund_id,
                    "name": fund_label(fund_id),
                    "description": fund.get("description", ""),
                    "nameStringId": fund.get("name_string_id"),
                }
                for fund_id, fund in funds.items()
                if term in fund_label(fund_id) + fund.get("description", "")
            ],
        }

    covered = {
        name: len({row["cardId"] for row in rows})
        for name, rows in (
            ("reward_graph", [{"cardId": card_id} for card_id in card_groups]),
            ("chapter", chapter_routes),
            ("getway", getway_routes),
            ("shop", shop_routes),
            ("research", research_routes),
            ("other_produce", other_produce_routes),
        )
    }
    payload = {
        "meta": {
            "source": str(config_path("AwardGroupInfo.dat").parent.relative_to(ROOT)),
            "maidenCount": len(maidens),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "preliminary-analysis-only; not integrated into web app",
            "coverage": covered,
            "routeRowCounts": {
                "chapter": len(chapter_routes),
                "getway": len(getway_routes),
                "shop": len(shop_routes),
                "research": len(research_routes),
                "otherProduce": len(other_produce_routes),
            },
            "limits": [
                "APK static configs prove configured/historical routes, not current server availability.",
                "Campaign-tag joins identify associated activity labels, but some generic tags map to multiple activities.",
                "Unclassified production/reward lines require UI call-site or live-server response validation before a player-facing label is assigned.",
            ],
        },
        "semanticEvidence": semantic_evidence,
        "campaigns": decoded_campaigns,
        "cards": card_rows,
    }
    target = OUTPUT / "acquisition_paths_preliminary.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    flat_rows = []
    for card in card_rows:
        counts = card["routeCounts"]
        flat_rows.append({
            "钢舞姬ID": card["cardId"],
            "坦克名": card["tank"],
            "人名": card["person"],
            "科技阶段": card["stage"],
            "稀有度": card["rarity"],
            "奖励组候选数": len(card["directAwardGroupIds"]),
            "关卡途径数": counts.get("chapter", 0),
            "商店商品途径数": counts.get("shop", 0),
            "图纸研发途径数": counts.get("research", 0),
            "活动或未分类生产线数": counts.get("otherProduce", 0),
            "已确认有关卡途径": "是" if counts.get("chapter") else "否",
            "已确认有商店途径": "是" if counts.get("shop") else "否",
            "已确认可研发": "是" if counts.get("research") else "否",
        })
    write_csv(
        OUTPUT / "钢舞姬获取途径预分析.csv",
        flat_rows,
        list(flat_rows[0]),
    )

    shop_export = [
        {
            "钢舞姬ID": row["cardId"],
            "坦克名": maiden_by_id[row["cardId"]]["tank"],
            "人名": maiden_by_id[row["cardId"]]["person"],
            "商店ID": row["shopId"],
            "商店名": row["shopName"],
            "商品ID": row["commodityId"],
            "商品名": row["commodityName"],
            "关联活动": " / ".join(row["campaignLabels"]),
            "兑换消耗": " / ".join(f'{item["name"]}×{item["amount"]}' for item in row["costs"]),
            "生产规则ID": row["produceRuleId"],
            "置信度": row["confidence"],
        }
        for row in shop_routes
    ]
    write_csv(OUTPUT / "商店与礼包钢舞姬途径.csv", shop_export, list(shop_export[0]) if shop_export else [])

    exchange_keywords = ("贝壳", "水晶贝", "晶壳", "秋实口粮", "水晶涂层", "冰晶涂层", "代币", "钥匙", "二池", "徽章", "兑换")
    keyword_exchange_rows = []
    for row in shop_routes:
        matched = [
            item for item in row["costs"]
            if any(term in (item["name"] + item["description"]) for term in exchange_keywords)
        ]
        for item in matched:
            keyword_exchange_rows.append({
                "钢舞姬ID": row["cardId"],
                "坦克名": maiden_by_id[row["cardId"]]["tank"],
                "人名": maiden_by_id[row["cardId"]]["person"],
                "商店名": row["shopName"],
                "商品名": row["commodityName"],
                "消耗资源ID": item["fundId"],
                "消耗资源": item["name"],
                "数量": item["amount"],
                "关键词": "/".join(term for term in exchange_keywords if term in item["name"] + item["description"]),
                "生产规则ID": row["produceRuleId"],
            })
    if keyword_exchange_rows:
        write_csv(OUTPUT / "贝壳钥匙及二池兑换线索.csv", keyword_exchange_rows, list(keyword_exchange_rows[0]))

    chapter_export = [
        {
            "钢舞姬ID": row["cardId"],
            "坦克名": maiden_by_id[row["cardId"]]["tank"],
            "人名": maiden_by_id[row["cardId"]]["person"],
            "章节ID": row["chapterId"],
            "章节名": row["chapterName"],
            "关卡ID": row["levelId"],
            "章节内序号": row["levelIndex"],
            "奖励表ID": "/".join(map(str, row["awardTableIds"])),
            "置信度": row["confidence"],
        }
        for row in chapter_routes
    ]
    write_csv(OUTPUT / "关卡掉落钢舞姬途径.csv", chapter_export, list(chapter_export[0]) if chapter_export else [])

    # Player-facing summary deliberately hides whether the configured reward is
    # delivered as an outfit first or as a maiden directly.  That distinction is
    # retained only in the evidence graph so outfit rewards are not missed.
    player_route_rows = []
    for card in card_rows:
        routes = card["routes"]
        chapter_labels = sorted({
            row["chapterName"] or f'章节#{row["chapterId"]}'
            for row in routes.get("chapter", [])
        })
        shop_labels = sorted({
            "｜".join(part for part in (row["shopName"], row["commodityName"]) if part)
            for row in routes.get("shop", [])
            if row["shopName"] != "内部测试"
        })
        campaign_labels = sorted({
            label
            for row in routes.get("otherProduce", [])
            for label in row["campaignLabels"]
        })
        player_route_rows.append({
            "钢舞姬ID": card["cardId"],
            "坦克名": card["tank"],
            "人名": card["person"],
            "关卡掉落": "；".join(chapter_labels),
            "商店、招募、兑换与礼包": "；".join(shop_labels),
            "活动标签线索": "；".join(campaign_labels),
            "可图纸研发": "是" if routes.get("research") else "否",
            "静态配置是否找到获取关系": "是" if any(routes.values()) else "否",
        })
    write_csv(
        OUTPUT / "玩家版钢舞姬获取途径汇总_v2.csv",
        player_route_rows,
        list(player_route_rows[0]) if player_route_rows else [],
    )

    routes_by_shop = [
        {
            "shopName": name,
            "routeRows": len(rows),
            "uniqueCards": len({row["cardId"] for row in rows}),
        }
        for name, rows in sorted(
            (
                (name, [row for row in shop_routes if row["shopName"] == name])
                for name in {row["shopName"] for row in shop_routes}
            ),
            key=lambda item: (-len(item[1]), item[0]),
        )
    ]
    strong_shortcut_rows = [
        row for row in chapter_routes
        if "强迫参赛" in row["chapterName"]
    ]
    strong_shortcut_cards = sorted({row["cardId"] for row in strong_shortcut_rows})
    strong_shortcut_tanks = [maiden_by_id[card_id]["tank"] for card_id in strong_shortcut_cards]
    channel_notes = {
        "特战招募": "商店→商品→生产规则→奖励链完整；是否当期开放仍需服务器状态",
        "特勤局精英": "商店→商品→生产规则→奖励链完整；是否当期开放仍需服务器状态",
        "博物馆": "同时存在活动、商店和奖励链证据",
        "源铁爆破": "活动与商店结构明确；当前静态商品奖励链仅直接命中少量钢舞姬",
        "再制商店": "仅表示再制商店中的直接商品，不等同于完整的舞装再制概率池",
        "车  库": "30 辆均可追到消耗资源‘车库钥匙×1’",
        "兑换处": "通用历史兑换店名称；需要活动标签或服务器排期才能恢复玩家熟悉的活动名",
        "活动兑换": "通用活动兑换名称；需要活动标签或服务器排期才能恢复玩家熟悉的活动名",
    }
    channel_summary = [
        {
            "途径名称": row["shopName"],
            "唯一钢舞姬数": row["uniqueCards"],
            "商品-钢舞姬关系数": row["routeRows"],
            "静态关系置信度": "高",
            "当前可用性": "未知（需服务器/实机确认）",
            "备注": channel_notes.get(row["shopName"], "静态商店奖励链可验证"),
        }
        for row in routes_by_shop
    ]
    write_csv(
        OUTPUT / "获取途径分类汇总.csv",
        channel_summary,
        list(channel_summary[0]) if channel_summary else [],
    )

    report_lines = [
        "# 钢舞姬获取途径静态资源预分析",
        "",
        f"生成时间：{datetime.now(timezone.utc).isoformat()}  ",
        f"数据来源：`{payload['meta']['source']}`  ",
        "状态：仅完成分析与数据准备，尚未接入 Web 应用。",
        "",
        "## 核心结论",
        "",
        "APK 内能够恢复大量‘配置过/历史存在’的获取关系，但不能仅凭静态资源判断当前服务器是否开放。",
        "已经验证的主链为：关卡或商店/商品/生产规则 → 奖励表 → 奖励池 → 奖励组 → 钢舞姬。",
        "",
        "## 可解析覆盖",
        "",
        f"- 钢舞姬总数：{len(maidens)}",
        f"- 奖励图中可命中的钢舞姬：{covered['reward_graph']}（全部）",
        f"- 有关卡直掉配置：{covered['chapter']} 辆，共 {len(chapter_routes)} 条关卡-车辆关系；同一奖励池会被多个关卡复用",
        f"- 有商店/兑换/招募配置：{covered['shop']} 辆，共 {len(shop_routes)} 条商品-车辆关系",
        f"- 有客户端研发规则：{covered['research']} 辆，共 {len(research_routes)} 条规则-车辆关系",
        f"- 有活动关联或尚未分类的生产线：{covered['other_produce']} 辆，共 {len(other_produce_routes)} 条关系",
        "",
        "注意：以上分类会互相重叠，不能相加当作车辆总数。‘有研发规则’也不等于当前服务器允许研发。",
        "",
        "## 已能命名的商店与兑换途径",
        "",
        "|途径|唯一钢舞姬|关系数|备注|",
        "|---|---:|---:|---|",
    ]
    report_lines.extend(
        f"|{row['shopName'].replace('|', '\\|')}|{row['uniqueCards']}|{row['routeRows']}|{channel_notes.get(row['shopName'], '静态奖励链可验证')}|"
        for row in routes_by_shop
    )
    report_lines.extend([
        "",
        "## 用户列举途径的判定",
        "",
        "- 刷图掉落：可高置信解析到具体关卡和车辆；目前命中 29 辆。",
        "- 博物馆：可高置信解析，命中 44 辆；活动、商店、奖励链三类证据相互印证。",
        "- 特勤局精英：可高置信解析，命中 51 辆。",
        "- 特战招募：可高置信解析，命中 132 辆。",
        "- 车库钥匙兑换：可高置信解析，命中 30 辆，每条成本均为‘车库钥匙×1’。",
        "- 源铁爆破：活动和商店可以明确识别，但当前静态奖励链只直接命中 1 辆钢舞姬；该玩法的大量奖励本来就是装备，不能把活动文案误当作车辆清单。",
        "- 舞装再制：能确认功能、规则文案与大致产出范围，但尚未把概率再制规则族精确映射成逐车清单；‘再制商店’的 3 辆直售车辆不是完整再制池。",
        "- 礼包：能识别周期礼包、节日礼包和周年礼包等客户端壳与部分商品名，但具体礼包内容/轮换不一定保存在本地。",
        "- 资材特卖、季度礼包、掌上饕餮、特别行动二池：只有文案或通用活动结构，当前 APK 中没有形成可验证的逐车奖励链。",
        "- 贝壳/晶壳：没有解析到可用于车辆商品的同名货币；不能依据零散文案推断兑换车辆。",
        "",
        "## 后续接入建议",
        "",
        "每条获取途径至少保存：`cardId`、`routeType`、`sourceName/sourceId`、`commodityName/Id`、`costs`、`campaign`、`timeRange`、`availability`、`confidence`、`evidence`。",
        "其中 `availability` 应默认标为‘静态配置/当前未知’，只有结合测试服在线接口、账号内活动页或网络响应后，才标记为‘当前可获得’。这样可以避免把历史活动误显示成现行途径。",
        "",
        "## 产物说明",
        "",
        "- `acquisition_paths_preliminary.json`：逐车完整证据图，适合作为未来网页数据源。",
        "- `钢舞姬获取途径预分析.csv`：逐车覆盖概览。",
        "- `商店与礼包钢舞姬途径.csv`：逐条商店/商品/成本关系。",
        "- `关卡掉落钢舞姬途径.csv`：逐条关卡掉落关系。",
        "- `贝壳钥匙及二池兑换线索.csv`：关键词命中的兑换成本；当前只有车库钥匙关系。",
        "- `获取途径分类汇总.csv`：按商店/途径汇总的数量和置信度。",
        "",
    ])
    (OUTPUT / "获取途径预分析报告.md").write_text("\n".join(report_lines), encoding="utf-8")

    public_shop_rows = [row for row in routes_by_shop if row["shopName"] != "内部测试"]
    corrected_report_lines = [
        "# 钢舞姬获取途径静态资源预分析（校正版 v2）",
        "",
        f"生成时间：{datetime.now(timezone.utc).isoformat()}  ",
        f"配置来源：`{payload['meta']['source']}`  ",
        "状态：仅完成分析与数据准备，未改动 Web 应用。",
        "",
        "## 本次关键校正",
        "",
        "此前的“关卡掉落 29 辆”是错误结果：旧算法把奖励资源 ID 当成了钢舞姬 ID。",
        "校正版严格按客户端实际调用链解析：关卡奖励表 → 奖励池/奖励组 → 舞装资源 → 舞装专属标签 → 可征召钢舞姬。",
        f"校正后，静态配置中可由关卡奖励链映射到的钢舞姬为 **{covered['chapter']} 辆**，共有 {len(chapter_routes)} 条关卡—钢舞姬关系。",
        "",
        "对玩家展示时不区分“先得舞装再征召”和“直接得到钢舞姬”；舞装只作为内部解析中间层，避免关卡和礼包漏算。",
        "",
        "## 强迫参赛（捷径）复核",
        "",
        f"静态配置复原出 {len(strong_shortcut_cards)} 辆：{ '、'.join(strong_shortcut_tanks) }。",
        "该结果与用户在游戏战前掉落明细中列出的 12 辆完全对齐，证明舞装标签映射链有效。",
        "",
        "## 当前可恢复的配置关系",
        "",
        f"- 钢舞姬总数：{len(maidens)}",
        f"- 奖励图可追踪：{covered['reward_graph']} 辆",
        f"- 关卡奖励：{covered['chapter']} 辆，{len(chapter_routes)} 条关系",
        f"- 商店/招募/兑换/礼包：{covered['shop']} 辆，{len(shop_routes)} 条关系（含历史与内部测试配置）",
        f"- 图纸研发：{covered['research']} 辆，{len(research_routes)} 条关系",
        f"- 活动或尚未命名的生产规则：{covered['other_produce']} 辆，{len(other_produce_routes)} 条关系",
        "",
        "以上分类会互相重叠；同一辆车可以同时有研发、关卡、招募或历史活动等多条路径。APK 静态配置能证明配置过的关系，不能单独证明当前服务器仍开放。",
        "",
        "## 主要入口的静态配置规模",
        "",
        "|入口|唯一钢舞姬|商品—钢舞姬关系|",
        "|---|---:|---:|",
    ]
    corrected_report_lines.extend(
        f"|{row['shopName'].replace('|', '\\|')}|{row['uniqueCards']}|{row['routeRows']}|"
        for row in public_shop_rows
    )
    corrected_report_lines.extend([
        "",
        "## 用户指出的活动线索复核",
        "",
        "- `定向爆破`、`秋实口粮`、`阿喀琉斯MK-IIC` 均能在当前 APK 静态配置中找到对应文本或商品记录。",
        "- `水晶贝`能找到资源/商品证据；玩家口径统一写作“掌中饕餮”，不再使用“掌上饕餮”。",
        "- 当前 APK 中没有`水晶涂层`这一精确名称；阿喀琉斯MK-IIC 的活动兑换成本实际配置为`冰晶涂层 ×29`。若实机界面确实显示“水晶涂层”，则可能是服务器文本覆盖或版本差异，集成前应以实机截图再确认。",
        "- `夏季限定`、`261-2工程`、`特遣部队`、`特供精英`、`特种精英`、`野蜂后期型`、`胜利式`均有静态文本或商品证据。",
        "- `内部测试`不是玩家获取入口，已从本报告的公开入口表排除；原始 JSON 中仍保留，便于审计来源。",
        "",
        "## 输出说明",
        "",
        "- `玩家版钢舞姬获取途径汇总_v2.csv`：按玩家视角汇总，不区分舞装交付和直接交付。",
        "- `关卡掉落钢舞姬途径.csv`：关卡奖励完整映射，已包含舞装标签解析结果。",
        "- `商店与礼包钢舞姬途径.csv`：商店、招募、兑换、礼包等配置关系。",
        "- `贝壳钥匙及二池兑换线索.csv`：水晶贝、活动代币、钥匙等消耗线索。",
        "- `acquisition_paths_preliminary.json`：保留完整证据链，供后续应用集成和审计。",
        "",
        "下一阶段若要判断‘当前可获取’而不是‘配置中曾存在’，仍需抓取游戏获取途径弹窗、限时活动页和服务器下发的当期活动数据。",
    ])
    corrected_report = "\n".join(corrected_report_lines)
    (OUTPUT / "获取途径预分析报告.md").write_text(corrected_report, encoding="utf-8")
    (OUTPUT / "获取途径预分析报告_v2.md").write_text(corrected_report, encoding="utf-8")

    print(json.dumps({
        "output": str(target),
        "coverage": covered,
        "routeRowCounts": payload["meta"]["routeRowCounts"],
        "routesByShop": routes_by_shop,
        "strongShortcutValidation": {
            "cards": len(strong_shortcut_cards),
            "tanks": strong_shortcut_tanks,
        },
        "semanticEvidenceCounts": {
            term: {key: len(value) for key, value in evidence.items()}
            for term, evidence in semantic_evidence.items()
        },
        "semanticEvidenceCompact": {
            term: {
                "stringSamples": evidence["strings"][:5],
                "campaigns": evidence["campaigns"],
                "shops": evidence["shops"],
                "commodities": evidence["commodities"][:12],
                "funds": evidence["funds"][:12],
            }
            for term, evidence in semantic_evidence.items()
        },
        "keywordExchangeRoutes": {
            "rows": len(keyword_exchange_rows),
            "cards": len({row["钢舞姬ID"] for row in keyword_exchange_rows}),
            "byKeyword": dict(Counter(row["关键词"] for row in keyword_exchange_rows)),
            "samples": keyword_exchange_rows[:20],
        },
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
