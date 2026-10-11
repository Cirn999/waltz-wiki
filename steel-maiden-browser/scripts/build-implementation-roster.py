"""Export handbook membership and client time gates without deleting archive rows.

Native ListAchievementedCardList enumerates CardAchievementInfo record IDs.
StampUI separates aircraft with tag 4708; special recruitment uses rule tag 905.
GetProduceLineDemand(..., 16, true) returns FAILED time demands, not all demands.
Account-specific research prerequisites must not mark a released maiden unreleased.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
sys.path.insert(0, str(ROOT / "analysis_apk" / "tools"))
from decode_configs import Reader, config_path, parse_capsule_types, parse_produce_rules, parse_demand_groups, parse_award_groups, parse_award_tables


def time_demand_failed(values, now):
    start, duration, expected = values
    # Native uses signed duration: 0xffffffff means no end, not a timestamp.
    within = now >= start and (duration >= 0x80000000 or now < start + duration)
    return within != bool(expected)


def build_roster(now):
    def achievement(r):
        return {"id": r.u32(), "achievementId": r.u32(), "achievementTag": r.u32(),
                "relatedId": r.u32(), "extraIds": r.vec_u32()}
    book = {r["id"] for r in Reader(config_path("CardAchievementInfo.dat").read_bytes()).records(achievement)}
    capsules = {r["capsule_type_id"]: r for r in parse_capsule_types(config_path("CapsuleTypeInfo.dat"))}
    demands = {r["demand_group_id"]: r["items"] for r in parse_demand_groups(config_path("DemandGroupInfo.dat"))}
    awards = {r["award_group_id"]: [i["values"][0] for i in r["items"] if i["item_type"] == 2]
              for r in parse_award_groups(config_path("AwardGroupInfo.dat"))}
    award_tables = {r["award_table_id"]: [i["award_group_id"] for i in r["items"]]
                    for r in parse_award_tables(config_path("AwardTableInfo.dat"))}
    methods = defaultdict(list)
    special = set()
    for rule in parse_produce_rules(config_path("ProduceRuleInfo.dat")):
        items = [i for group in rule["field_98"] for i in demands.get(group, [])]
        demanded_cards = {i["values"][0] for i in items if i["item_type"] == 2}
        if 905 in rule["field_40"]:
            special.update(demanded_cards)
        if 1408 in rule["field_40"]:
            continue
        awarded_cards = {card for table in rule["field_c8"] for group in award_tables.get(table, []) for card in awards.get(group, [])}
        for card in awarded_cards or demanded_cards:
            capsule = capsules.get(card)
            if capsule and set(rule["field_40"]).intersection(capsule["group_b_ids"]):
                times = [i["values"] for i in items if i["item_type"] == 9]
                methods[card].append({"ruleId": rule["rule_id"], "timeDemands": times})
    source = json.loads((ROOT / "analysis_apk/output/steel_maiden_catalog_v4/钢舞姬汇总数据.json").read_text(encoding="utf-8"))
    rows = []
    for maiden in source["rows"]:
        card = int(maiden["钢舞姬卡牌ID"])
        capsule = capsules[card]
        member = card in book or card in special
        # StampUI ignores mixed passed/failed time demands, but rejects a route
        # when every time demand fails. Keep the rule and timestamps as evidence.
        closed = [r for r in methods[card] if r["timeDemands"] and all(time_demand_failed(t, now) for t in r["timeDemands"])]
        reason = "not-in-handbook" if not member else "non-display-unit" if capsule["field_2"] == 3 else "time-gated" if closed else "implemented"
        rows.append({"id": card, "implemented": reason == "implemented", "reason": reason,
                     "inHandbook": card in book, "specialRecruitment": card in special,
                     "aircraft": 4708 in capsule["group_b_ids"], "closedRules": closed})
    return {"asOf": datetime.fromtimestamp(now, timezone.utc).isoformat(),
            "source": "CardAchievementInfo / CapsuleTypeInfo / ProduceRuleInfo / DemandGroupInfo / AwardTableInfo / AwardGroupInfo; patch preferred",
            "semantics": "Handbook roster plus special recruitment, deduplicated by card ID, excluding non-display units and failed client time gates; account research prerequisites are not release status.",
            "counts": {"archive": len(rows), "inHandbook": sum(r["inHandbook"] for r in rows),
                       "implemented": sum(r["implemented"] for r in rows), "unimplemented": sum(not r["implemented"] for r in rows)},
            "rows": rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="ISO date/time for a reproducible snapshot")
    parser.add_argument("--output", type=Path, default=APP / "public/data/implementation-roster.json")
    args = parser.parse_args()
    snapshot = datetime.fromisoformat(args.as_of) if args.as_of else datetime.now(timezone.utc)
    if snapshot.tzinfo is None:
        snapshot = snapshot.replace(tzinfo=timezone.utc)
    now = snapshot.timestamp()
    roster = build_roster(int(now))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(roster, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(roster["counts"]))


if __name__ == "__main__":
    main()
