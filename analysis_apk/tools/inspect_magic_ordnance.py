#!/usr/bin/env python3
"""Inspect category-17 (magic ordnance) client configuration for a card."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    Reader,
    parse_capsule_faculty_trains,
    parse_capsule_phases,
    parse_skill_server,
    parse_string_table,
)


def parse_growth(path: Path) -> list[dict]:
    def one(r: Reader) -> dict:
        return {
            "template_id": r.u32(),
            "skill_id": r.u32(),
            "levels": [
                [
                    {"skill_id": r.u32(), "level": r.u32()}
                    for _ in range(r.u8())
                ]
                for _ in range(r.u8())
            ],
        }
    return Reader(path.read_bytes()).records(one)


def parse_skill_info(path: Path) -> list[dict]:
    def content(r: Reader) -> dict:
        content_id = r.u32()
        raw = r.take(r.u16())
        return {"content_id": content_id, "hex": raw.hex()}

    def param(r: Reader) -> dict:
        return {
            "param_id": r.u32(),
            "levels": [
                {"level": r.u32(), "contents": [content(r) for _ in range(r.u8())]}
                for _ in range(r.u8())
            ],
        }

    def one(r: Reader) -> dict:
        return {
            "skill_id": r.u32(),
            "name_string_id": r.u32(),
            "icon": r.cstring(),
            "flag": r.u8(),
            "group_a_ids": r.vec_u32(),
            "group_b_ids": r.vec_u32(),
            "field_6": r.u32(),
            "field_7": r.u32(),
            "params": [param(r) for _ in range(r.u8())],
            "group_c_ids": r.vec_u32(),
            "group_d_ids": r.vec_u32(),
            "field_11": r.u32(),
            "client_strings": [r.cstring() for _ in range(r.u8())],
        }
    return Reader(path.read_bytes()).records(one)


def parse_skill_desc(path: Path) -> list[dict]:
    return Reader(path.read_bytes()).records(lambda r: {
        "skill_id": r.u32(),
        "description_string_id": r.u32(),
        "params": [
            {"param_id": r.u32(), "rule_id": r.u32()}
            for _ in range(r.u8())
        ],
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query", help="tank name fragment or numeric card id")
    parser.add_argument("--skills-only", action="store_true")
    parser.add_argument("--server-only", action="store_true")
    args = parser.parse_args()

    maidens_path = ROOT / "steel-maiden-browser" / "public" / "data" / "maidens.json"
    dataset = json.loads(maidens_path.read_text(encoding="utf-8"))
    query = args.query.casefold()
    matches = [
        row for row in dataset["rows"]
        if str(row["id"]) == args.query or query in row["tank"].casefold()
    ]
    if not matches:
        raise SystemExit(f"no maiden matched {args.query!r}")

    config = ROOT / "patch" / "_1.18" / "config"
    phases, layout = parse_capsule_phases(config / "CapsulePhaseInfo.dat")
    trains = parse_capsule_faculty_trains(config / "CapsuleFacultyTrainInfo.dat")
    growth = parse_growth(config / "SkillGrowthTemplateInfo.dat")
    growth_by_id = {row["template_id"]: row for row in growth}
    skill_info = parse_skill_info(config / "SkillInfo.dat")
    skills_by_id = {row["skill_id"]: row for row in skill_info}
    skill_desc = parse_skill_desc(config / "SkillDesc.dat")
    desc_by_id = {row["skill_id"]: row for row in skill_desc}
    skill_server = parse_skill_server(config / "SkillServerInfo.dat")
    skill_server_by_id = {row["skill_id"]: row for row in skill_server}
    strings = parse_string_table(config / "StringTableInfo.dat")
    text_by_id = {row["string_id"]: next((value for value in row["strings"] if value), "") for row in strings}
    known_names = {"多重火力装置", "附配掩体", "应急掩护", "分析打击"}
    known_skill_ids = {
        row["skill_id"] for row in skill_info
        if text_by_id.get(row["name_string_id"], "") in known_names
    }
    for maiden in matches:
        card_id = int(maiden["id"])
        relevant_phases = [row for row in phases if row["capsule_type_id"] == card_id]
        relevant_trains = [
            row for row in trains
            if card_id in row["group_b_ids"]
            and any(group["category_id"] == 17 for change in row["trend_changes"] for group in change["ratio_groups"])
        ]
        talent_ids = [
            item["limit_config"]["field_0"]
            for row in relevant_phases
            for item in row["faculty_categories"]
            if item["category_id"] == 17
        ]
        trend_ids = {
            trend_id
            for train in relevant_trains
            for change in train["trend_changes"]
            for group in change["ratio_groups"] if group["category_id"] == 17
            for trend_id in group["trend_ids"]
        }
        growth_rows = [
            row for row in growth
            if row["template_id"] in set(talent_ids) | trend_ids
            or row["skill_id"] in set(talent_ids) | trend_ids
        ]
        skill_ids = sorted({
            pair["skill_id"]
            for growth_row in growth_rows if growth_row
            for level in growth_row["levels"]
            for pair in level
        })
        result = {
            "maiden": {"id": card_id, "tank": maiden["tank"], "stage": maiden["stage"]},
            "phase_layout": layout,
            "phases": [
                {
                    "phase": row["phase"],
                    "category17": [item for item in row["faculty_categories"] if item["category_id"] == 17],
                }
                for row in relevant_phases
            ],
            "trains": relevant_trains,
            "growth": growth_rows,
            "skills": [
                {
                    **skills_by_id[skill_id],
                    "name": text_by_id.get(skills_by_id[skill_id]["name_string_id"], ""),
                    "server": skill_server_by_id.get(skill_id),
                }
                for skill_id in skill_ids if skill_id in skills_by_id
            ],
            "t39_known": {
                "skills": [
                    {
                        **row,
                        "name": text_by_id.get(row["name_string_id"], ""),
                        "description": {
                            **desc_by_id.get(row["skill_id"], {}),
                            "template": text_by_id.get(desc_by_id.get(row["skill_id"], {}).get("description_string_id"), ""),
                        },
                        "server": skill_server_by_id.get(row["skill_id"]),
                    }
                    for row in skill_info if row["skill_id"] in known_skill_ids
                ],
                "growth": [
                    row for row in growth
                    if any(pair["skill_id"] in known_skill_ids for level in row["levels"] for pair in level)
                ],
            },
        }
        if args.skills_only:
            result = {key: result[key] for key in ("maiden", "growth", "skills", "t39_known")}
            result["t39_known"]["skills"] = [
                {key: row[key] for key in ("skill_id", "name", "icon", "group_a_ids", "group_b_ids", "field_6", "field_7", "params", "group_c_ids", "group_d_ids", "field_11", "description", "server")}
                for row in result["t39_known"]["skills"]
            ]
        if args.server_only:
            result = {
                "maiden": result["maiden"],
                "skills": [
                    {"skill_id": row["skill_id"], "name": row["name"], "server": row["server"]}
                    for row in result["t39_known"]["skills"]
                ],
            }
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
