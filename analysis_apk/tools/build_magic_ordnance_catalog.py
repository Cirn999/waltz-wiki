#!/usr/bin/env python3
"""Build per-card category-17 (magic ordnance) skills from client data."""

from __future__ import annotations

import argparse
import ast
import html
import json
import math
import operator
import re
import struct
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

from decode_configs import (  # noqa: E402
    Reader,
    parse_capsule_faculty_trains,
    parse_skill_server,
    parse_string_table,
)
from inspect_magic_ordnance import parse_growth, parse_skill_desc, parse_skill_info  # noqa: E402


def parse_binary_param_config(path: Path) -> dict[int, int]:
    rows = Reader(path.read_bytes()).records(
        lambda r: {"param_id": r.u32(), "param_type": r.u32()}
    )
    return {row["param_id"]: row["param_type"] for row in rows}


def parse_modify_rules(path: Path) -> dict[int, str]:
    rows = Reader(path.read_bytes()).records(
        lambda r: {"rule_id": r.u32(), "script": r.cstring()}
    )
    return {row["rule_id"]: row["script"] for row in rows}


_BIN_FORMATS = {
    0: "<?",
    1: "<b",
    2: "<B",
    3: "<h",
    4: "<H",
    5: "<i",
    6: "<I",
    7: "<q",
    8: "<Q",
    9: "<f",
    10: "<d",
}


def decode_binary_value(raw: bytes, param_type: int) -> int | float:
    fmt = _BIN_FORMATS.get(param_type)
    if fmt and struct.calcsize(fmt) == len(raw):
        return struct.unpack(fmt, raw)[0]
    if len(raw) == 1:
        return struct.unpack("<b", raw)[0]
    if len(raw) == 2:
        return struct.unpack("<h", raw)[0]
    if len(raw) == 4:
        return struct.unpack("<i", raw)[0]
    if len(raw) == 8:
        return struct.unpack("<q", raw)[0]
    raise ValueError(f"unsupported binary value type={param_type} size={len(raw)}")


_SAFE_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_SAFE_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_SAFE_FUNCS = {
    "floor": math.floor,
    "ceil": math.ceil,
    "abs": abs,
    "min": min,
    "max": max,
    "IntToString": lambda value: value,
}


def _eval_node(node: ast.AST, variables: dict[str, float]) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, variables)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in variables:
        return variables[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_BINOPS:
        return _SAFE_BINOPS[type(node.op)](
            _eval_node(node.left, variables), _eval_node(node.right, variables)
        )
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_UNARY:
        return _SAFE_UNARY[type(node.op)](_eval_node(node.operand, variables))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCS:
        return _SAFE_FUNCS[node.func.id](*[_eval_node(arg, variables) for arg in node.args])
    raise ValueError(f"unsupported expression node: {ast.dump(node)}")


def eval_lua_return(script: str, **variables: float) -> float:
    expression = script.strip()
    expression = re.sub(r"^return\s+", "", expression)
    expression = expression.rstrip(";")
    expression = expression.replace("math.floor", "floor").replace("math.ceil", "ceil")
    expression = expression.replace("math.abs", "abs").replace("math.min", "min").replace("math.max", "max")
    return _eval_node(ast.parse(expression, mode="eval"), variables)


def format_number(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def select_param_content(param: dict[str, Any], intensity: int) -> dict[str, Any] | None:
    levels = sorted(param["levels"], key=lambda item: item["level"])
    eligible = [item for item in levels if item["level"] <= intensity]
    chosen = eligible[-1] if eligible else (levels[0] if levels else None)
    if not chosen or not chosen["contents"]:
        return None
    return chosen["contents"][0]


def compute_param(
    server: dict[str, Any],
    param_id: int,
    rule_id: int,
    intensity: int,
    param_types: dict[int, int],
    modify_rules: dict[int, str],
) -> str:
    param = next((row for row in server["params"] if row["param_id"] == param_id), None)
    if not param:
        return "--"
    content = select_param_content(param, intensity)
    if not content:
        return "--"
    raw = bytes.fromhex(content["hex"])
    if content["content_id"] == 1:
        script = raw.rstrip(b"\0").decode("utf-8")
        value = eval_lua_return(script, level=float(intensity))
    else:
        value = float(decode_binary_value(raw, param_types.get(param_id, -1)))
    if rule_id:
        script = modify_rules.get(rule_id, "")
        if not script:
            raise ValueError(f"missing modify rule {rule_id}")
        value = eval_lua_return(script, value=value, paramValue=value)
    return format_number(value)


def clean_markup(value: str) -> str:
    value = re.sub(r"</?font(?:\s+[^>]*)?>", "", value, flags=re.IGNORECASE)
    value = value.replace("</br>", "\n").replace("<br>", "\n").replace("<br/>", "\n")
    return html.unescape(value).strip()


def render_description(
    template: str,
    desc_params: list[dict[str, int]],
    server: dict[str, Any],
    intensity: int,
    param_types: dict[int, int],
    modify_rules: dict[int, str],
) -> dict[str, str]:
    rendered = template
    for index, desc_param in enumerate(desc_params, start=1):
        value = compute_param(
            server,
            desc_param["param_id"],
            desc_param["rule_id"],
            intensity,
            param_types,
            modify_rules,
        )
        rendered = rendered.replace(f"#${index}", value)
    rendered = clean_markup(rendered)
    lines = rendered.splitlines()
    timing = ""
    body = rendered
    if lines and lines[0].startswith("发动时机:"):
        timing = lines[0].split(":", 1)[1].strip()
        body = "\n".join(lines[1:]).strip()
    effect, separator, condition = body.partition("|")
    return {
        "timing": timing,
        "effect": effect.strip(),
        "condition": condition.strip() if separator else "",
        "description": rendered,
    }


def build_catalog() -> tuple[dict[str, Any], dict[str, Any]]:
    config = ROOT / "patch" / "_1.18" / "config"
    maidens_path = ROOT / "steel-maiden-browser" / "public" / "data" / "maidens.json"
    maidens = json.loads(maidens_path.read_text(encoding="utf-8"))["rows"]
    card_ids = {int(row["id"]) for row in maidens}

    trains = parse_capsule_faculty_trains(config / "CapsuleFacultyTrainInfo.dat")
    growth_by_id = {row["template_id"]: row for row in parse_growth(config / "SkillGrowthTemplateInfo.dat")}
    skills_by_id = {row["skill_id"]: row for row in parse_skill_info(config / "SkillInfo.dat")}
    desc_by_id = {row["skill_id"]: row for row in parse_skill_desc(config / "SkillDesc.dat")}
    server_by_id = {row["skill_id"]: row for row in parse_skill_server(config / "SkillServerInfo.dat")}
    strings = parse_string_table(config / "StringTableInfo.dat")
    text_by_id = {
        row["string_id"]: next((text for text in row["strings"] if text), "")
        for row in strings
    }
    param_types = parse_binary_param_config(config / "BinaryParamConfigInfo.dat")
    modify_rule_path = config / "StringTableParamModifyRuleInfo.dat"
    if not modify_rule_path.exists():
        modify_rule_path = ROOT / "Resources" / "config" / "StringTableParamModifyRuleInfo.dat"
    modify_rules = parse_modify_rules(modify_rule_path)

    trends_by_card: dict[int, set[int]] = {card_id: set() for card_id in card_ids}
    for train in trains:
        target_cards = card_ids.intersection(train["group_b_ids"])
        if not target_cards:
            continue
        trend_ids = {
            trend_id
            for change in train["trend_changes"]
            for group in change["ratio_groups"]
            if group["category_id"] == 17
            for trend_id in group["trend_ids"]
        }
        for card_id in target_cards:
            trends_by_card[card_id].update(trend_ids)

    rows: dict[str, list[dict[str, Any]]] = {}
    missing_talents: list[dict[str, int]] = []
    failures: list[dict[str, Any]] = []
    used_rules: set[int] = set()
    used_scripts: set[str] = set()
    for card_id, trend_ids in trends_by_card.items():
        card_skills: list[dict[str, Any]] = []
        seen: set[tuple[int, int]] = set()
        for trend_id in sorted(trend_ids):
            talent_id = 1_010_000 + trend_id
            growth = growth_by_id.get(talent_id)
            if not growth:
                missing_talents.append({"card_id": card_id, "trend_id": trend_id, "talent_id": talent_id})
                continue
            nonempty_levels = [(index, pairs) for index, pairs in enumerate(growth["levels"]) if pairs]
            if not nonempty_levels:
                continue
            skill_id = nonempty_levels[0][1][0]["skill_id"]
            key = (trend_id, skill_id)
            if key in seen:
                continue
            seen.add(key)
            skill = skills_by_id.get(skill_id)
            desc = desc_by_id.get(skill_id)
            server = server_by_id.get(skill_id)
            if not skill or not desc or not server:
                failures.append({"card_id": card_id, "trend_id": trend_id, "skill_id": skill_id, "reason": "missing skill/desc/server"})
                continue
            for item in desc["params"]:
                used_rules.add(item["rule_id"])
                param = next((row for row in server["params"] if row["param_id"] == item["param_id"]), None)
                if param:
                    for level in param["levels"]:
                        for content in level["contents"]:
                            if content["content_id"] == 1:
                                used_scripts.add(bytes.fromhex(content["hex"]).rstrip(b"\0").decode("utf-8"))
            levels: list[dict[str, Any]] = []
            for level_number, pairs in nonempty_levels:
                pair = next((item for item in pairs if item["skill_id"] == skill_id), pairs[0])
                intensity = pair["level"]
                try:
                    rendered = render_description(
                        text_by_id.get(desc["description_string_id"], ""),
                        desc["params"],
                        server,
                        intensity,
                        param_types,
                        modify_rules,
                    )
                except Exception as exc:  # keep audit details instead of silently inventing text
                    failures.append({
                        "card_id": card_id,
                        "trend_id": trend_id,
                        "skill_id": skill_id,
                        "level": level_number,
                        "reason": str(exc),
                    })
                    rendered = {"timing": "", "effect": "参数解析失败", "condition": "", "description": "参数解析失败"}
                levels.append({"level": level_number, "intensity": intensity, **rendered})
            card_skills.append({
                "trendId": trend_id,
                "talentId": talent_id,
                "skillId": skill_id,
                "name": text_by_id.get(skill["name_string_id"], f"技能 {skill_id}"),
                "iconCode": skill["icon"],
                "levels": levels,
            })
        rows[str(card_id)] = card_skills

    audit = {
        "cardCount": len(card_ids),
        "configuredCardCount": sum(bool(items) for items in rows.values()),
        "skillInstanceCount": sum(len(items) for items in rows.values()),
        "uniqueSkillCount": len({item["skillId"] for items in rows.values() for item in items}),
        "missingTalents": missing_talents,
        "failures": failures,
        "usedModifyRules": {str(rule_id): modify_rules.get(rule_id, "") for rule_id in sorted(used_rules)},
        "usedLuaScripts": sorted(used_scripts),
    }
    return {"source": "test-server-client-category-17", "rows": rows}, audit


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "analysis_apk" / "output" / "magic_ordnance" / "magic_ordnance_catalog.json",
    )
    parser.add_argument("--audit", action="store_true")
    args = parser.parse_args()
    catalog, audit = build_catalog()
    if args.audit:
        print(json.dumps(audit, ensure_ascii=False, indent=2))
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=False, indent=2))
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
