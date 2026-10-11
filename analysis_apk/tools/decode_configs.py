#!/usr/bin/env python3
"""Decode the recovered Sherman/Metal Waltz configuration formats.

The layouts in this file were recovered from the arm64 libasgame.so readers.
Unknown field names are deliberately kept conservative instead of guessed.
"""

from __future__ import annotations

import argparse
import csv
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "output"


class DecodeError(RuntimeError):
    pass


@dataclass
class Reader:
    data: bytes
    offset: int = 0

    def take(self, size: int) -> bytes:
        end = self.offset + size
        if end > len(self.data):
            raise DecodeError(f"read past EOF at 0x{self.offset:x}: wanted {size} bytes")
        value = self.data[self.offset:end]
        self.offset = end
        return value

    def u8(self) -> int:
        return self.take(1)[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.take(2))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.take(4))[0]

    def i32(self) -> int:
        return struct.unpack("<i", self.take(4))[0]

    def cstring(self) -> str:
        end = self.data.find(b"\0", self.offset)
        if end < 0:
            raise DecodeError(f"unterminated string at 0x{self.offset:x}")
        raw = self.data[self.offset:end]
        self.offset = end + 1
        return raw.decode("utf-8", errors="replace")

    def vec_u8(self) -> list[int]:
        return [self.u8() for _ in range(self.u8())]

    def vec_u16(self) -> list[int]:
        return [self.u16() for _ in range(self.u8())]

    def vec_u32(self) -> list[int]:
        return [self.u32() for _ in range(self.u8())]

    def records(self, parse_one: Callable[["Reader"], Any]) -> list[Any]:
        count = self.u32()
        result = [parse_one(self) for _ in range(count)]
        if self.offset != len(self.data):
            raise DecodeError(
                f"decoder stopped at 0x{self.offset:x}, file ends at 0x{len(self.data):x}"
            )
        return result


def config_path(name: str) -> Path:
    candidates = [
        ROOT / "patch" / "_1.18" / "config" / name,
        ROOT / "Resources" / "config" / name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(name)


def parse_unit_attributes(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        result = {"id": r.u8(), "code": r.cstring(), "value_type": r.u8()}
        if result["value_type"] == 2:
            result["subtype"] = r.u8()
            result["enum_values"] = r.vec_u8()
        return result

    return Reader(path.read_bytes()).records(one)


def parse_attack_types(path: Path) -> list[dict[str, Any]]:
    """Decode the four fields read for each AttackType record."""

    def one(r: Reader) -> dict[str, Any]:
        return {
            "attack_type_id": r.u32(),
            "attack_family_id": r.u32(),
            "name": r.cstring(),
            "resource": r.cstring(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_unit_templates(path: Path) -> list[dict[str, int]]:
    return Reader(path.read_bytes()).records(
        lambda r: {
            "unit_id": r.u32(),
            "appearance_id": r.u32(),
            "visible_level": r.u32(),
        }
    )


def parse_unit_appearances(path: Path) -> list[dict[str, Any]]:
    def match_rule(r: Reader) -> dict[str, int]:
        return {"faculty_id": r.u32(), "min_level": r.u32(), "max_level": r.u32()}

    def appearance_match(r: Reader) -> dict[str, Any]:
        return {
            "faculty_rules": [match_rule(r) for _ in range(r.u8())],
            "model_id": r.u32(),
            "name_string_id": r.u32(),
        }

    def one(r: Reader) -> dict[str, Any]:
        return {
            "appearance_id": r.u16(),
            "attack_type": r.u32(),
            "unit_class_id": r.u32(),
            "visible_skill_faculties": r.vec_u32(),
            "rarity": r.u32(),
            "model_id": r.u32(),
            "name_string_id": r.u32(),
            "conditional_appearances": [appearance_match(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_achievement_list(path: Path) -> list[dict[str, Any]]:
    """AchievementListInfo reader at 0x88310c (arm64); consume every record/EOF."""
    return Reader(path.read_bytes()).records(
        lambda r: {
            "achievement_id": r.u32(),
            "name_string_id": r.u32(),
            "description_string_id": r.u32(),
            "award_code": r.cstring(),
            "field_4": r.i32(),
            "tags": r.vec_u32(),
            "demands": r.vec_u32(),
            "icon": r.cstring(),
            "field_8": r.u32(),
        }
    )


def parse_arranged_styles(path: Path) -> list[dict[str, Any]]:
    """Decode the profile-card layout used for names, flags and biography fields."""

    def number_entry(r: Reader) -> dict[str, int]:
        return {"entry_id": r.u8(), "value": r.u32()}

    def string_entry(r: Reader) -> dict[str, Any]:
        return {"entry_id": r.u8(), "value": r.cstring()}

    def item(r: Reader) -> dict[str, Any]:
        return {
            "mode_code": r.cstring(),
            "filter_code": r.cstring(),
            "demands": r.vec_u32(),
            "number_entries": [number_entry(r) for _ in range(r.u8())],
            "string_entries": [string_entry(r) for _ in range(r.u8())],
        }

    def one(r: Reader) -> dict[str, Any]:
        return {
            "arranged_style_id": r.u32(),
            "items": [item(r) for _ in range(r.u8())],
            "tags": r.vec_u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_string_table(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        string_id = r.u32()
        return {"string_id": string_id, "strings": [r.cstring() for _ in range(r.u8())]}

    return Reader(path.read_bytes()).records(one)


def parse_fund_achievements(path: Path) -> list[dict[str, int]]:
    """Decode the fixed flavour-text lookup used by GetFundAchievementDescription."""

    return Reader(path.read_bytes()).records(
        lambda r: {
            "fund_id": r.u16(),
            "description_string_id": r.u32(),
            "field_2": r.u8(),
        }
    )


def parse_skill_descriptions(path: Path) -> list[dict[str, Any]]:
    """Decode skill display templates consumed by GetSkillDescription.

    Each parameter pair controls the client's placeholder formatting.  The
    numeric skill intensity itself comes from SkillGrowthTemplateInfo.
    """

    def one(r: Reader) -> dict[str, Any]:
        return {
            "skill_id": r.u32(),
            "description_string_id": r.u32(),
            "parameters": [
                {"format_id": r.u32(), "field_1": r.u32()}
                for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_skill_growth_templates_for_ids(
    path: Path,
    template_ids: set[int],
    valid_skill_ids: set[int] | None = None,
) -> dict[int, dict[str, Any]]:
    """Decode selected fixed-intensity skill templates.

    SkillGrowthTemplateInfo contains several legacy record variants.  Hidden
    equipment capsules consistently reference the compact variant below.  We
    locate only those explicit template ids and validate their skill ids
    against SkillDesc, instead of guessing the unrelated legacy variants.
    """

    data = path.read_bytes()
    result: dict[int, dict[str, Any]] = {}
    for template_id in template_ids:
        needle = struct.pack("<I", template_id)
        offset = data.find(needle, 4)
        candidates: list[dict[str, Any]] = []
        while offset >= 0:
            if offset + 11 <= len(data):
                field_1 = struct.unpack_from("<I", data, offset + 4)[0]
                field_2 = data[offset + 8]
                field_3 = data[offset + 9]
                count = data[offset + 10]
                end = offset + 11 + count * 8
                if field_1 == 0 and field_2 in {2, 5} and field_3 == 0 and count <= 16 and end <= len(data):
                    skills = [
                        {
                            "skill_id": struct.unpack_from("<I", data, offset + 11 + index * 8)[0],
                            "intensity": struct.unpack_from("<i", data, offset + 15 + index * 8)[0],
                        }
                        for index in range(count)
                    ]
                    if valid_skill_ids is None or all(
                        item["skill_id"] in valid_skill_ids for item in skills
                    ):
                        candidates.append(
                            {
                                "template_id": template_id,
                                "field_1": field_1,
                                "field_2": field_2,
                                "field_3": field_3,
                                "skills": skills,
                            }
                        )
            offset = data.find(needle, offset + 1)
        # An id can occur incidentally inside another record's value.  The
        # real equipment record is the sole candidate whose skill ids exist.
        if len(candidates) == 1:
            result[template_id] = candidates[0]
    return result


def parse_unit_trait_types(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(
        lambda r: {
            "trait_id": r.u32(),
            "tags": r.vec_u32(),
            "affected_property_ids": r.vec_u32(),
            "field_3": r.u32(),
        }
    )


def parse_unit_trait_growth_rules(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        result: dict[str, Any] = {"growth_rule_id": r.u32(), "traits": []}
        for _ in range(r.u8()):
            trait = {"trait_id": r.u32(), "feature_calculations": []}
            for _ in range(r.u8()):
                trait["feature_calculations"].append(
                    {"feature_type": r.u8(), "feature_id": r.u32()}
                )
            trait["multiplier"] = r.i32()
            trait["base"] = r.i32()
            result["traits"].append(trait)
        return result

    return Reader(path.read_bytes()).records(one)


def parse_growth_templates(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        template = {"template_id": r.u32(), "attributes": []}
        for _ in range(r.u8()):
            attribute = {"attribute_id": r.u8(), "rules": []}
            for _ in range(r.u8()):
                attribute["rules"].append(
                    {
                        "rule_type": r.u8(),
                        "rule_id": r.u32(),
                        "selector": r.u8(),
                    }
                )
            attribute["multiplier"] = r.i32()
            attribute["base"] = r.i32()
            template["attributes"].append(attribute)
        return template

    return Reader(path.read_bytes()).records(one)


def parse_growth_rules(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        rule = {"rule_type": r.u8(), "rule_id": r.u32(), "functions": []}
        for _ in range(r.u8()):
            function = {"selector": r.u8(), "function_id": r.u16(), "params": []}
            for _ in range(r.u8()):
                function["params"].append(
                    {
                        "param_id": r.u8(),
                        "input_ids": r.vec_u16(),
                        "default_value": r.i32(),
                    }
                )
            rule["functions"].append(function)
        return rule

    return Reader(path.read_bytes()).records(one)


def parse_faculty_attribute_param_rules(path: Path) -> list[dict[str, Any]]:
    """Current arm64 reader 0x914e94 and adjust reader 0x915370; EOF checked.

    The first vector supplies role properties and the second supplies traits
    to an AttributeGrowthInputPair, as shown by convertAttributePair.
    Header byte/u32 names stay neutral until the consumer is traced.
    """
    def one(r: Reader) -> dict[str, Any]:
        return {
            "param_rule_id": r.u32(), "header_type": r.u8(), "header_id": r.u32(),
            "adjusts": [
                {"input_id": r.u16(), "role_property_ids": r.vec_u32(),
                 "trait_ids": r.vec_u32()}
                for _ in range(r.u8())
            ],
        }
    return Reader(path.read_bytes()).records(one)


def _parse_faculty_extend_effect(r: Reader) -> dict[str, Any]:
    """Decode the current-protocol FacultyExtendEffect wire structure.

    This layout is shared by CapsulePhaseInfo, FacultyTrendGroupInfo and
    FacultyExtendLinkInfo.  It is recovered from Config::operator>> at
    libasgame.so 0x8fed20.
    """

    def intensity_adjust() -> dict[str, Any]:
        return {
            "group_a_ids": r.vec_u32(),
            "group_b_ids": r.vec_u32(),
            "value": r.u32(),
        }

    def attribute_config() -> dict[str, Any]:
        return {
            "group_a_ids": r.vec_u32(),
            "flags": r.vec_u8(),
            "group_b_ids": r.vec_u32(),
        }

    return {
        "intensity_adjust": intensity_adjust(),
        "attribute_configs": [attribute_config() for _ in range(r.u8())],
        "group_a_ids": r.vec_u32(),
        "group_b_ids": r.vec_u32(),
    }


def parse_faculty_trend_categories(path: Path) -> list[dict[str, Any]]:
    """Native FacultyTrendCategoryInfo reader 0x914af4; EOF checked."""
    return Reader(path.read_bytes()).records(
        lambda r: {"trend_id": r.u16(), "tags": r.vec_u32()}
    )


def parse_faculty_trend_groups(path: Path) -> list[dict[str, Any]]:
    """Decode per-card faculty trend groups used by the equipment preview."""

    def one(r: Reader) -> dict[str, Any]:
        return {
            "trend_group_id": r.u32(),
            "items": [
                {
                    "trend_id": r.u16(),
                    "extend_effects": [
                        _parse_faculty_extend_effect(r) for _ in range(r.u8())
                    ],
                    "extend_group_ids": r.vec_u32(),
                }
                for _ in range(r.u8())
            ],
            "field_2": r.u16(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_faculty_extend_links(path: Path) -> list[dict[str, Any]]:
    """Decode reusable FacultyExtendEffect lists referenced by trend groups."""

    def one(r: Reader) -> dict[str, Any]:
        return {
            "extend_group_id": r.u32(),
            "extend_effects": [
                _parse_faculty_extend_effect(r) for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_skill_server(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        record: dict[str, Any] = {"skill_id": r.u32(), "params": []}
        for _ in range(r.u8()):
            param: dict[str, Any] = {"param_id": r.u32(), "levels": []}
            for _ in range(r.u8()):
                level: dict[str, Any] = {"level": r.u32(), "contents": []}
                for _ in range(r.u8()):
                    content_id = r.u32()
                    raw = r.take(r.u16())
                    content: dict[str, Any] = {"content_id": content_id, "hex": raw.hex()}
                    if len(raw) == 4:
                        content["int32"] = struct.unpack("<i", raw)[0]
                        content["uint32"] = struct.unpack("<I", raw)[0]
                    elif len(raw) == 8:
                        content["int64"] = struct.unpack("<q", raw)[0]
                    level["contents"].append(content)
                param["levels"].append(level)
            record["params"].append(param)
        record["tags"] = r.vec_u32()
        return record

    return Reader(path.read_bytes()).records(one)


def parse_combat_engage_rules(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        # The nested type names come directly from retained C++ symbols.
        result: dict[str, Any] = {
            "rule_id": r.u32(),
            "rule_type": r.u32(),
            "master_ids": r.vec_u32(),
            "object_ids": r.vec_u32(),
            "attend_reward": {
                "reward_types": r.vec_u16(),
                "reward_flags": r.vec_u8(),
                "reward_values": r.vec_u32(),
            },
            "trait_cost": {
                "trait_ids": r.vec_u32(),
                "cost_values": r.vec_u32(),
            },
            "expense_ratios": [],
        }
        for _ in range(r.u8()):
            result["expense_ratios"].append({"expense_id": r.u32(), "ratio": r.u32()})
        result["extra_ids"] = r.vec_u32()
        return result

    return Reader(path.read_bytes()).records(one)


def parse_battle_resolution(path: Path) -> list[dict[str, int]]:
    # Eight fixed-width values; semantic names are intentionally not guessed.
    return Reader(path.read_bytes()).records(
        lambda r: {f"field_{index}": r.u32() for index in range(8)}
    )


def parse_hit_events(path: Path) -> list[dict[str, int]]:
    # The first byte is the lookup key used by CachedRawDataSet.
    return Reader(path.read_bytes()).records(
        lambda r: {"event_id": r.u8(), **{f"field_{index}": r.u8() for index in range(1, 6)}}
    )


def parse_competition_models(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(
        lambda r: {"model_id": r.u32(), "implement_ids": r.vec_u32()}
    )


def parse_feature_calculations(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        result: dict[str, Any] = {
            "feature_type": r.u8(),
            "feature_id": r.u32(),
            "function_id": r.u16(),
            "params": [],
        }
        for _ in range(r.u8()):
            result["params"].append(
                {
                    "param_id": r.u8(),
                    "input_ids": r.vec_u16(),
                    "default_value": r.i32(),
                }
            )
        return result

    return Reader(path.read_bytes()).records(one)


def parse_role_properties(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(
        lambda r: {
            "property_id": r.u32(),
            "field_1": r.u32(),
            "related_ids": r.vec_u32(),
            "field_3": r.u32(),
            "code": r.cstring(),
            "field_5": r.u32(),
        }
    )


def parse_role_models(path: Path) -> list[dict[str, Any]]:
    return Reader(path.read_bytes()).records(
        lambda r: {
            "role_model_id": r.u32(),
            "group_a_ids": r.vec_u32(),
            "resource_a": r.cstring(),
            "group_b_ids": r.vec_u32(),
            "resource_b": r.cstring(),
            "resource_c": r.cstring(),
        }
    )


def parse_capsule_types(path: Path) -> list[dict[str, Any]]:
    def faculty_growth(r: Reader) -> dict[str, Any]:
        return {
            "faculty_id": r.u8(),
            "growth_value": r.i32(),
            "phase_ids": r.vec_u16(),
        }

    def attribute_pair(r: Reader) -> dict[str, int]:
        return {"attribute_id": r.u8(), "value": r.i32()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "capsule_type_id": r.u32(),
            "growth_tag_id": r.u32(),
            "field_2": r.u8(),
            "group_a_ids": r.vec_u32(),
            "field_4": r.u8(),
            "group_b_ids": r.vec_u32(),
            "appearance_ids": r.vec_u16(),
            "faculty_growth": [faculty_growth(r) for _ in range(r.u8())],
            "base_attributes": [attribute_pair(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_capsule_faculty_trains(path: Path) -> list[dict[str, Any]]:
    """Decode card training paths, including their craft/material demands."""

    def basic_demand(r: Reader) -> dict[str, int]:
        return {"demand_type": r.u8(), "resource_id": r.u32(), "value": r.u32()}

    def basic_adjust(r: Reader) -> dict[str, int]:
        return {"category_id": r.u8(), "value": r.u32()}

    def ratio_group(r: Reader) -> dict[str, Any]:
        return {"category_id": r.u8(), "ratio": r.u32(), "trend_ids": r.vec_u16()}

    def trend_change(r: Reader) -> dict[str, Any]:
        return {
            "ratio_groups": [ratio_group(r) for _ in range(r.u8())],
            "group_ids": r.vec_u32(),
            "field_2": r.u32(),
            "field_3": r.u32(),
        }

    def one(r: Reader) -> dict[str, Any]:
        return {
            "train_id": r.u32(),
            "group_a_ids": r.vec_u32(),
            "group_b_ids": r.vec_u32(),
            "group_c_values": r.vec_u8(),
            "group_d_values": r.vec_u8(),
            "demands": [basic_demand(r) for _ in range(r.u8())],
            "adjusts": [basic_adjust(r) for _ in range(r.u8())],
            "trend_changes": [trend_change(r) for _ in range(r.u8())],
            "group_e_ids": r.vec_u32(),
            "group_f_ids": r.vec_u32(),
            "group_g_ids": r.vec_u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_crafts(path: Path) -> list[dict[str, Any]]:
    """Decode craft records used by engines, chassis and other equipment."""

    def property_effect(r: Reader) -> dict[str, int]:
        return {"property_id": r.u32(), "value": r.u32(), "effect_type": r.u8()}

    def level_config(r: Reader) -> dict[str, Any]:
        return {
            "level": r.u32(),
            "property_effects": [property_effect(r) for _ in range(r.u8())],
        }

    def one(r: Reader) -> dict[str, Any]:
        return {
            "craft_id": r.u32(),
            "craft_type": r.u8(),
            "name_string_id": r.u32(),
            "name": r.cstring(),
            "icon": r.cstring(),
            "field_5": r.u32(),
            "field_6": r.u32(),
            "field_7": r.u32(),
            "levels": [level_config(r) for _ in range(r.u8())],
            "tags": r.vec_u32(),
            "field_10": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_demand_groups(path: Path) -> list[dict[str, Any]]:
    """Decode demand groups; item type 2 is a craft/material demand."""

    primitive_layouts: dict[int, tuple[str, ...]] = {
        0: ("u32", "u32", "u32"), 1: ("u32", "u32", "u32"),
        2: ("u32", "u8", "u8"), 3: ("u32", "u32", "u32", "u32"),
        4: ("u16", "u32", "u32"), 5: ("u16", "u32", "u32"),
        6: ("u32", "u32", "u32"), 7: ("u32", "u8"),
        8: ("u16", "u16", "u8"), 9: ("u32", "u32", "u8"),
        10: ("u32", "u8", "u32", "u32"),
        12: ("u32", "u8"), 60: ("u32", "u8"),
        13: ("u8", "u32", "u32"), 51: ("u8", "u32", "u32"),
        14: ("u8", "u16", "u8"), 52: ("u8", "u16", "u8"),
        15: ("u8", "u32", "u32"), 53: ("u8", "u32", "u32"),
        16: ("u32", "u32", "u8"), 54: ("u32", "u32", "u8"),
        17: ("u32", "u32", "u32", "u32", "u32", "u32"),
        55: ("u32", "u32", "u32", "u32", "u32", "u32"),
        18: ("u32", "u32", "u32"), 56: ("u32", "u32", "u32"),
        19: ("u32", "u8", "u32", "u32", "u8", "u32", "u32", "u8", "u32", "u8"),
        57: ("u32", "u8", "u32", "u32", "u8", "u32", "u32", "u8", "u32", "u8"),
        20: ("u32", "u8", "u32", "u8", "u32", "u32"),
        58: ("u32", "u8", "u32", "u8", "u32", "u32"),
        21: ("u32", "u8"), 59: ("u32", "u8"),
    }

    def demand_item(r: Reader) -> dict[str, Any]:
        item_type = r.u32()
        if item_type == 50:
            selector = r.u8()
            values = [selector, r.u32(), r.u32(), r.u32()]
            return {"item_type": item_type, "values": values}
        layout = primitive_layouts.get(item_type)
        if layout is None:
            raise DecodeError(f"unknown DemandGenerateItem type {item_type} at 0x{r.offset - 4:x}")
        values = [getattr(r, kind)() for kind in layout]
        return {"item_type": item_type, "values": values}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "demand_group_id": r.u32(),
            "name": r.cstring(),
            "items": [demand_item(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_consume_groups(path: Path) -> list[dict[str, Any]]:
    """Decode ConsumeGroupInfo and its typed resource requirements.

    The item wire layout is recovered from Config::operator>> for
    ConsumeGenerateItem in the test-server arm64 client.  The type-specific
    payload is kept lossless here; callers assign player-facing names after
    joining the craft/fund/card configuration tables.
    """

    def consume_item(r: Reader) -> dict[str, Any]:
        item_type = r.u8()
        if item_type == 0:
            values: list[int] = [r.u16()]
        elif item_type == 1:
            values = [r.u32()]
        elif item_type == 2:
            values = [struct.unpack("<Q", r.take(8))[0], r.u8()]
        elif item_type in (3, 50):
            values = [r.u8()]
        else:
            raise DecodeError(
                f"unknown ConsumeGenerateItem type {item_type} at 0x{r.offset - 1:x}"
            )
        return {"item_type": item_type, "values": values, "amount": r.u32()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "consume_group_id": r.u32(),
            "name": r.cstring(),
            "items": [consume_item(r) for _ in range(r.u8())],
        }

    return Reader(path.read_bytes()).records(one)


def parse_fund_types(path: Path) -> list[dict[str, Any]]:
    """Decode inventory/currency resource definitions used by consume groups."""

    def one(r: Reader) -> dict[str, Any]:
        return {
            "fund_id": r.u32(),
            "name_string_id": r.u32(),
            "field_08": r.u32(),
            "field_0c": r.u8(),
            "tags": r.vec_u32(),
            "field_28": r.u32(),
            "icon": r.cstring(),
            "resources": [
                {"resource_id": r.u32(), "resource": r.cstring()}
                for _ in range(r.u8())
            ],
            "description": r.cstring(),
            "field_78": r.u32(),
            "field_7c": r.u32(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_produce_rules(path: Path) -> list[dict[str, Any]]:
    """Decode the steel-maiden production/research recipe table.

    Field names remain offset-based here because the wire layout is recovered
    from the native reader. The research-tree builder assigns player-facing
    meanings after joining the referenced config tables.
    """

    def occupy_input_limit(r: Reader) -> dict[str, int]:
        return {"id": r.u32(), "value_a": r.u8(), "value_b": r.u8()}

    def exchange_convert_method(r: Reader) -> dict[str, int]:
        return {"value_a": r.u32(), "value_b": r.u32()}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "rule_id": r.u32(),
            "field_08": r.vec_u32(),
            "occupy_input_limits": [occupy_input_limit(r) for _ in range(r.u8())],
            "field_38": r.u32(),
            "field_40": r.vec_u32(),
            "field_58": r.vec_u32(),
            "field_70": r.u32(),
            "field_78": r.vec_u16(),
            "field_90": r.u16(),
            "field_98": r.vec_u32(),
            "field_b0": r.vec_u32(),
            "field_c8": r.vec_u32(),
            "field_e0": r.vec_u32(),
            "field_f8": r.u32(),
            "field_100": r.u32(),
            "exchange_convert_methods": [
                exchange_convert_method(r) for _ in range(r.u8())
            ],
            "field_120": r.u32(),
            "field_124": r.u8(),
        }

    return Reader(path.read_bytes()).records(one)


def parse_award_tables(path: Path) -> list[dict[str, Any]]:
    def one(r: Reader) -> dict[str, Any]:
        return {
            "award_table_id": r.u32(),
            "name": r.cstring(),
            "items": [
                {"weight": r.u32(), "award_group_id": r.u32()}
                for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_award_groups(path: Path) -> list[dict[str, Any]]:
    """Decode award groups, preserving the type-specific key payloads."""

    def award_key(r: Reader) -> dict[str, Any]:
        item_type = r.u8()
        values: list[Any]
        if item_type in (0, 1):
            values = [r.u16()]
        elif item_type == 2:
            values = [r.u32(), r.u8()]
            values.append([[r.u8(), r.u32()] for _ in range(r.u16())])
        elif item_type in (3, 19, 55):
            values = [r.u32(), r.u32(), r.u32(), r.u32()]
        elif item_type == 4:
            values = [r.u32(), r.u32(), r.u32()]
        elif item_type == 5:
            values = [r.u32(), r.take(r.u16()).hex()]
        elif item_type in (6, 9):
            values = [r.u32(), [r.u32() for _ in range(r.u16())]]
        elif item_type == 7:
            values = [r.u32(), r.u32(), r.u8()]
        elif item_type == 8:
            values = [r.u16(), r.u16()]
        elif item_type == 10:
            values = [r.u8(), r.u32()]
        elif item_type == 11:
            values = [r.u32(), r.u8()]
        elif item_type in (12, 13):
            values = [struct.unpack("<Q", r.take(8))[0]]
        elif item_type == 14:
            values = [struct.unpack("<Q", r.take(8))[0], r.u8(), r.u16()]
        elif item_type in (15, 51, 20, 56):
            values = [r.u32()]
        elif item_type in (16, 17, 18, 52, 53, 54):
            values = [r.u32(), r.u32(), r.u32()]
        elif item_type in (21, 57):
            values = [r.u32(), r.u32()]
        elif item_type in (22, 23, 58, 59):
            values = [r.u8()]
        elif item_type in (24, 60):
            values = [r.u8(), r.u16()]
        else:
            raise DecodeError(f"unknown AwardGenerateItemKey type {item_type} at 0x{r.offset - 1:x}")
        return {"item_type": item_type, "values": values}

    def one(r: Reader) -> dict[str, Any]:
        return {
            "award_group_id": r.u32(),
            "name": r.cstring(),
            "items": [
                {**award_key(r), "weight": r.u32()}
                for _ in range(r.u8())
            ],
        }

    return Reader(path.read_bytes()).records(one)


def parse_capsule_phases(path: Path) -> tuple[list[dict[str, Any]], str]:
    """Decode the card/capsule phase table.

    The client contains two wire layouts behind the OLDFACULTYEFFECT protocol
    switch.  Try the current layout first and accept only a complete EOF match;
    this keeps the choice evidence-based instead of tying it to a guessed build
    number.
    """

    def decode(old_faculty_effect: bool) -> list[dict[str, Any]]:
        def faculty_attribute(r: Reader) -> dict[str, Any]:
            if old_faculty_effect:
                result: dict[str, Any] = {"legacy_value": r.u32()}
            else:
                result = {"group_a_ids": r.vec_u32(), "flags": r.vec_u8()}
            result["group_b_ids"] = r.vec_u32()
            return result

        def intensity_adjust(r: Reader) -> dict[str, Any]:
            return {
                "group_a_ids": r.vec_u32(),
                "group_b_ids": r.vec_u32(),
                "value": r.u32(),
            }

        def faculty_extend_effect(r: Reader) -> dict[str, Any]:
            return {
                "intensity_adjust": intensity_adjust(r),
                "attribute_configs": [faculty_attribute(r) for _ in range(r.u8())],
                "group_a_ids": r.vec_u32(),
                "group_b_ids": r.vec_u32(),
            }

        def faculty_limit(r: Reader) -> dict[str, Any]:
            if old_faculty_effect:
                result: dict[str, Any] = {
                    "attribute_configs": [faculty_attribute(r) for _ in range(r.u8())],
                    "legacy_group_a_ids": r.vec_u32(),
                    "legacy_group_b_ids": r.vec_u32(),
                }
            else:
                result = {
                    "extend_effects": [faculty_extend_effect(r) for _ in range(r.u8())],
                    "extend_group_ids": r.vec_u32(),
                }
            result.update(
                {
                    "field_0": r.u32(),
                    "group_a_ids": r.vec_u32(),
                    "group_b_ids": r.vec_u32(),
                    "field_3": r.u32(),
                    "group_c_ids": r.vec_u32(),
                }
            )
            return result

        def fixed_absorb(r: Reader) -> dict[str, Any]:
            return {"faculty_ids": r.vec_u8(), "values": r.vec_u32()}

        def preset_category(r: Reader) -> dict[str, Any]:
            return {"category_id": r.u8(), "values": r.vec_u32()}

        def faculty_absorb(r: Reader) -> dict[str, Any]:
            return {"faculty_ids": r.vec_u8(), "value": r.u32()}

        def faculty_category(r: Reader) -> dict[str, Any]:
            return {
                "category_id": r.u8(),
                "absorb_configs": [faculty_absorb(r) for _ in range(r.u8())],
                "limit_config": faculty_limit(r),
            }

        def one(r: Reader) -> dict[str, Any]:
            result: dict[str, Any] = {
                "capsule_type_id": r.u32(),
                "phase": r.u8(),
                "appearance_id": r.u16(),
                "group_a_ids": r.vec_u32(),
                "field_4": r.u32(),
                "fixed_absorb_configs": [fixed_absorb(r) for _ in range(r.u8())],
            }
            if not old_faculty_effect:
                result["preset_categories"] = [preset_category(r) for _ in range(r.u8())]
            result["faculty_categories"] = [faculty_category(r) for _ in range(r.u8())]
            result["group_b_ids"] = r.vec_u32()
            return result

        return Reader(path.read_bytes()).records(one)

    failures: list[str] = []
    for old_faculty_effect, layout_name in ((False, "current"), (True, "legacy")):
        try:
            return decode(old_faculty_effect), layout_name
        except (DecodeError, struct.error, IndexError) as exc:
            failures.append(f"{layout_name}: {exc}")
    raise DecodeError("CapsulePhaseInfo did not match either layout: " + "; ".join(failures))


ATTRIBUTE_CHINESE: dict[str, str] = {
    "MAXHP": "最大耐久",
    "MAXMP": "最大能量",
    "POWER": "火力",
    "PIERCING": "穿甲",
    "ARMOR": "装甲",
    "TOHIT": "命中",
    "DODGE": "闪避",
    "RANGE": "射程",
    "HIDE": "隐蔽",
    "SCOUT": "侦查",
    "ECONOMY": "经济性",
    "ANTIFIRE": "阻燃",
    "IGNITE": "点燃",
    "COVERING": "覆盖度",
    "HOMOGENEITY": "均质度",
    "RICOCHET": "跳弹",
    "OVERHIT": "过穿",
    "PROTECTION": "防护",
    "SPRING": "弹性",
    "REDUCTION": "减伤",
    "POTENT": "潜能",
    "AIRCRAFT": "航空",
    "TOGROUND": "对地",
    "TOAIR": "对空",
    "HEIGHTORRANGE": "高度或射程",
    "BITRANGE": "位范围",
    "DISTANCE": "距离",
    "HEIGHT": "高度",
    "HP": "当前耐久",
    "MP": "当前能量",
    "REVEAL": "暴露",
    "FLUSTER": "慌乱",
}

APPEARANCE_TYPE_CHINESE: dict[int, str] = {
    1: "轻型坦克",
    2: "中型坦克",
    3: "重型坦克",
    4: "装甲车",
    5: "自行火炮",
    6: "坦克歼击车",
    7: "攻击机",
    8: "战斗机",
    9: "轰炸机",
    10: "重型战斗机",
}


def write_csv(path: Path, rows: list[dict[str, Any]], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def function_value(function: dict[str, Any], source: int, inputs: dict[int, int] | None = None) -> int:
    inputs = inputs or {}
    params: dict[int, int] = {}
    for param in function["params"]:
        value = param["default_value"]
        for input_id in param["input_ids"]:
            if input_id in inputs:
                value = inputs[input_id]
                break
        params[param["param_id"]] = value

    function_id = function["function_id"]
    if function_id == 1:  # growth_linearity in AttributeManager.lua
        offset_level = source - params.get(3, 0)
        return 0 if offset_level < 0 else params.get(1, 0) + offset_level * params.get(2, 0)
    if function_id == 100:  # convert_linearity
        return int(source * params.get(101, 0) / 10000 + params.get(102, 0))
    if function_id == 101:  # convert_airone
        return int(source * (10000 - params.get(101, 0) * params.get(102, 0)) / 10000)
    raise DecodeError(f"unknown attribute function {function_id}")


def stats_for_template(
    template: dict[str, Any],
    level: int,
    rules: dict[tuple[int, int], dict[str, Any]],
) -> dict[int, int]:
    result: dict[int, int] = {}
    for attribute in template["attributes"]:
        # A zero multiplier makes the configured base authoritative even when
        # the referenced rule does not expose a matching selector.
        if attribute["multiplier"] == 0:
            result[attribute["attribute_id"]] = attribute["base"]
            continue
        subtotal = 0
        calculable = True
        for reference in attribute["rules"]:
            rule = rules.get((reference["rule_type"], reference["rule_id"]))
            function = next(
                (f for f in (rule or {}).get("functions", []) if f["selector"] == reference["selector"]),
                None,
            )
            if function is None or any(p["input_ids"] for p in function["params"]):
                calculable = False
                break
            subtotal += function_value(function, level)
        if calculable:
            result[attribute["attribute_id"]] = int(
                subtotal * attribute["multiplier"] / 10000 + attribute["base"]
            )
    return result


def traits_for_growth_rule(
    growth_rule: dict[str, Any],
    intensity: int,
    feature_calculations: dict[tuple[int, int], dict[str, Any]],
) -> dict[int, int]:
    result: dict[int, int] = {}
    for trait in growth_rule["traits"]:
        subtotal = 0
        calculable = True
        for reference in trait["feature_calculations"]:
            calculation = feature_calculations.get(
                (reference["feature_type"], reference["feature_id"])
            )
            if calculation is None or any(p["input_ids"] for p in calculation["params"]):
                calculable = False
                break
            subtotal += function_value(calculation, intensity)
        if calculable:
            result[trait["trait_id"]] = int(
                subtotal * trait["multiplier"] / 10000 + trait["base"]
            )
    return result


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--levels", default="1,30,60,100")
    args = parser.parse_args()
    levels = [int(value) for value in args.levels.split(",")]
    args.output.mkdir(parents=True, exist_ok=True)

    attributes = parse_unit_attributes(config_path("UnitAttributeInfo.dat"))
    unit_templates = parse_unit_templates(config_path("UnitTemplateInfo.dat"))
    appearances = parse_unit_appearances(config_path("UnitAppearanceInfo.dat"))
    strings = parse_string_table(config_path("StringTableInfo.dat"))
    growth_templates = parse_growth_templates(config_path("AttributeGrowthTemplateInfo.dat"))
    growth_rules = parse_growth_rules(config_path("AttributeGrowthRuleInfo.dat"))
    skill_server = parse_skill_server(config_path("SkillServerInfo.dat"))
    engage_rules = parse_combat_engage_rules(config_path("CombatEngageRuleInfo.dat"))
    battle_resolution = parse_battle_resolution(config_path("battleResolution.dat"))
    hit_events = parse_hit_events(config_path("HitEventInfo.dat"))
    competition_models = parse_competition_models(config_path("CompetitionModel.dat"))
    feature_calculations = parse_feature_calculations(config_path("FeatureCalculateInfo.dat"))
    role_properties = parse_role_properties(config_path("RolePropertyInfo.dat"))
    role_models = parse_role_models(config_path("roleModelInfo.dat"))
    capsule_types = parse_capsule_types(config_path("CapsuleTypeInfo.dat"))
    capsule_phases, capsule_phase_layout = parse_capsule_phases(config_path("CapsulePhaseInfo.dat"))

    attribute_by_id = {item["id"]: item for item in attributes}
    appearance_by_id = {item["appearance_id"]: item for item in appearances}
    string_by_id = {item["string_id"]: item for item in strings}
    growth_by_id = {item["template_id"]: item for item in growth_templates}
    rule_by_id = {(item["rule_type"], item["rule_id"]): item for item in growth_rules}
    capsule_type_by_id = {item["capsule_type_id"]: item for item in capsule_types}

    rows: list[dict[str, Any]] = []
    for unit in unit_templates:
        appearance = appearance_by_id.get(unit["appearance_id"], {})
        string = string_by_id.get(appearance.get("name_string_id"), {})
        row: dict[str, Any] = {
            **unit,
            "name": (string.get("strings") or [""])[0],
            "model_id": appearance.get("model_id"),
            "appearance_type": appearance.get("unit_class_id"),
            "attribute_growth_template_id": appearance.get("attribute_growth_template_id"),
            "growth_template_found": False,
            "calculated_attribute_count_at_L1": 0,
        }
        growth = growth_by_id.get(appearance.get("attribute_growth_template_id"))
        if growth:
            row["growth_template_found"] = True
            for level in levels:
                stats = stats_for_template(growth, level, rule_by_id)
                if level == levels[0]:
                    row["calculated_attribute_count_at_L1"] = len(stats)
                for attribute_id, value in stats.items():
                    code = attribute_by_id.get(attribute_id, {}).get("code", f"ATTR_{attribute_id}")
                    row[f"L{level}_{code}"] = value
        rows.append(row)

    stat_columns = [
        f"L{level}_{attribute['code']}"
        for level in levels
        for attribute in attributes
        if any(f"L{level}_{attribute['code']}" in row for row in rows)
    ]
    base_columns = [
        "unit_id",
        "name",
        "appearance_id",
        "unit_type_id",
        "model_id",
        "appearance_type",
        "attribute_growth_template_id",
        "growth_template_found",
        "calculated_attribute_count_at_L1",
    ]
    write_csv(args.output / "units_with_base_stats.csv", rows, base_columns + stat_columns)

    chinese_base_names = {
        "unit_id": "单位模板ID",
        "name": "名称",
        "appearance_id": "外观ID",
        "unit_type_id": "单位类型ID",
        "model_id": "模型ID",
        "appearance_type": "外观类型",
        "attribute_growth_template_id": "属性成长模板ID",
        "growth_template_found": "是否找到成长模板",
        "calculated_attribute_count_at_L1": f"可计算属性数（{levels[0]}级）",
    }
    chinese_stat_names: dict[str, str] = {}
    for column in stat_columns:
        level_code, attribute_code = column.split("_", 1)
        chinese_stat_names[column] = (
            f"{level_code[1:]}级_{ATTRIBUTE_CHINESE.get(attribute_code, attribute_code)}"
        )
    chinese_all_rows: list[dict[str, Any]] = []
    for source in rows:
        translated = {
            chinese_base_names[key]: ("是" if value is True else "否" if value is False else value)
            for key, value in source.items()
            if key in chinese_base_names
        }
        translated.update(
            {chinese_stat_names[key]: value for key, value in source.items() if key in chinese_stat_names}
        )
        chinese_all_rows.append(translated)
    chinese_all_columns = [chinese_base_names[column] for column in base_columns] + [
        chinese_stat_names[column] for column in stat_columns
    ]
    write_csv(args.output / "全单位属性表_中文.csv", chinese_all_rows, chinese_all_columns)

    combat_phases = [
        phase
        for phase in capsule_phases
        if appearance_by_id.get(phase["appearance_id"], {}).get("unit_class_id", 0) != 0
    ]
    phases_by_capsule_type: dict[int, list[dict[str, Any]]] = {}
    for phase in combat_phases:
        phases_by_capsule_type.setdefault(phase["capsule_type_id"], []).append(phase)

    player_rows: list[dict[str, Any]] = []
    player_phase_rows: list[dict[str, Any]] = []
    for capsule_type_id, phase_group in sorted(phases_by_capsule_type.items()):
        capsule_type = capsule_type_by_id.get(capsule_type_id, {})
        names: list[str] = []
        appearance_ids: list[int] = []
        model_ids: list[int] = []
        appearance_types: list[int] = []
        related_growth_templates: list[int] = []
        for phase in sorted(phase_group, key=lambda item: item["phase"]):
            appearance = appearance_by_id.get(phase["appearance_id"], {})
            string = string_by_id.get(appearance.get("name_string_id"), {})
            name = (string.get("strings") or [""])[0]
            if name and name not in names:
                names.append(name)
            for target, value in (
                (appearance_ids, phase["appearance_id"]),
                (model_ids, appearance.get("model_id")),
                (appearance_types, appearance.get("unit_class_id")),
                (related_growth_templates, appearance.get("attribute_growth_template_id")),
            ):
                if value is not None and value not in target:
                    target.append(value)
            player_phase_rows.append(
                {
                    "卡牌类型ID": capsule_type_id,
                    "阶段": phase["phase"],
                    "角色名称": name,
                    "外观ID": phase["appearance_id"],
                    "模型ID": appearance.get("model_id"),
                    "外观类型ID": appearance.get("unit_class_id"),
                    "兵种（按客户端类型）": APPEARANCE_TYPE_CHINESE.get(
                        appearance.get("unit_class_id"), "未知"
                    ),
                    "外观关联配置ID": appearance.get("attribute_growth_template_id"),
                }
            )

        faculty_rules = capsule_type.get("faculty_growth", [])
        base_attributes = capsule_type.get("base_attributes", [])
        type_names = [APPEARANCE_TYPE_CHINESE.get(value, f"未知类型{value}") for value in appearance_types]
        player_rows.append(
            {
                "卡牌类型ID": capsule_type_id,
                "角色名称": "/".join(names),
                "兵种（按客户端类型）": "/".join(type_names),
                "外观类型ID": "/".join(map(str, appearance_types)),
                "可用阶段": "/".join(str(item["phase"]) for item in sorted(phase_group, key=lambda x: x["phase"])),
                "阶段配置数": len(phase_group),
                "外观ID": "/".join(map(str, appearance_ids)),
                "模型ID": "/".join(map(str, model_ids)),
                "成长标签ID": capsule_type.get("growth_tag_id"),
                "资质成长规则数": len(faculty_rules),
                "资质ID→成长规则ID": ";".join(
                    f'{item["faculty_id"]}→{item["growth_value"]}' for item in faculty_rules
                ),
                "卡牌类型基础属性": ";".join(
                    f'{ATTRIBUTE_CHINESE.get(attribute_by_id.get(item["attribute_id"], {}).get("code", ""), "属性" + str(item["attribute_id"]))}={item["value"]}'
                    for item in base_attributes
                ),
                "外观关联配置ID": "/".join(map(str, related_growth_templates)),
                "属性值说明": "最终面板需卡牌等级、代数、资质等级/倾向及装备等动态输入",
            }
        )
    player_base_columns = [
        "卡牌类型ID",
        "角色名称",
        "兵种（按客户端类型）",
        "外观类型ID",
        "可用阶段",
        "阶段配置数",
        "外观ID",
        "模型ID",
        "成长标签ID",
        "资质成长规则数",
        "资质ID→成长规则ID",
        "卡牌类型基础属性",
        "外观关联配置ID",
        "属性值说明",
    ]
    write_csv(args.output / "玩家可操控角色属性汇总_中文.csv", player_rows, player_base_columns)
    write_csv(
        args.output / "玩家角色阶段明细_中文.csv",
        player_phase_rows,
        [
            "卡牌类型ID",
            "阶段",
            "角色名称",
            "外观ID",
            "模型ID",
            "外观类型ID",
            "兵种（按客户端类型）",
            "外观关联配置ID",
        ],
    )

    write_json(args.output / "unit_attributes.json", attributes)
    write_json(args.output / "unit_appearances.json", appearances)
    write_json(args.output / "attribute_growth_templates.json", growth_templates)
    write_json(args.output / "attribute_growth_rules.json", growth_rules)
    write_json(args.output / "skill_server_info.json", skill_server)
    write_json(args.output / "combat_engage_rules.json", engage_rules)
    write_json(args.output / "battle_resolution.json", battle_resolution)
    write_json(args.output / "hit_events.json", hit_events)
    write_json(args.output / "competition_models.json", competition_models)
    write_json(args.output / "feature_calculations.json", feature_calculations)
    write_json(args.output / "role_properties.json", role_properties)
    write_json(args.output / "role_models.json", role_models)
    write_json(args.output / "capsule_types.json", capsule_types)
    write_json(args.output / "capsule_phases.json", capsule_phases)
    write_json(
        args.output / "decode_summary.json",
        {
            "source_config": str(config_path("UnitTemplateInfo.dat").parent.relative_to(ROOT)),
            "levels": levels,
            "counts": {
                "attributes": len(attributes),
                "unit_templates": len(unit_templates),
                "unit_appearances": len(appearances),
                "strings": len(strings),
                "growth_templates": len(growth_templates),
                "growth_rules": len(growth_rules),
                "skill_server_records": len(skill_server),
                "combat_engage_rules": len(engage_rules),
                "battle_resolution_records": len(battle_resolution),
                "hit_events": len(hit_events),
                "competition_models": len(competition_models),
                "feature_calculations": len(feature_calculations),
                "role_properties": len(role_properties),
                "role_models": len(role_models),
                "capsule_types": len(capsule_types),
                "capsule_phases": len(capsule_phases),
                "player_combat_capsule_types": len(player_rows),
                "player_combat_phase_rows": len(player_phase_rows),
                "player_rows_with_names": sum(bool(row["角色名称"]) for row in player_rows),
                "units_with_growth_template": sum(bool(row["growth_template_found"]) for row in rows),
                "units_with_calculated_attributes": sum(
                    row["calculated_attribute_count_at_L1"] > 0 for row in rows
                ),
            },
            "formula_scale": 10000,
            "formula_source": "Resources/RanaScripts/luaFunction/AttributeManager.lua",
            "capsule_phase_layout": capsule_phase_layout,
        },
    )
    print(
        f"wrote {len(rows)} template unit rows and {len(player_rows)} player combat-card rows "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
