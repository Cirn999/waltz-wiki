"""Search localized config strings and show referring craft records."""

from __future__ import annotations

import argparse
import json
import sys

from decode_configs import Reader, config_path, parse_crafts, parse_string_table


def parse_client_shows() -> list[dict[str, object]]:
    return Reader(config_path("ClientShowInfo.dat").read_bytes()).records(lambda reader: {
        "showId": reader.u32(),
        "code": reader.cstring(),
        "stringId": reader.u32(),
    })


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("terms", nargs="+")
    args = parser.parse_args()

    strings = parse_string_table(config_path("StringTableInfo.dat"))
    crafts = parse_crafts(config_path("CraftInfo.dat"))
    shows_by_string: dict[int, list[dict[str, object]]] = {}
    for show in parse_client_shows():
        shows_by_string.setdefault(int(show["stringId"]), []).append(show)
    craft_by_string: dict[int, list[dict[str, object]]] = {}
    for craft in crafts:
        craft_by_string.setdefault(int(craft["name_string_id"]), []).append({
            "craftId": craft["craft_id"],
            "craftType": craft["craft_type"],
            "code": craft["name"],
            "tags": craft["tags"],
            "levels": [row["level"] for row in craft["levels"]],
        })

    results = []
    for row in strings:
        matches = [text for text in row["strings"] if any(term in text for term in args.terms)]
        if matches:
            results.append({
                "stringId": row["string_id"],
                "texts": matches,
                "crafts": craft_by_string.get(int(row["string_id"]), []),
                "clientShows": shows_by_string.get(int(row["string_id"]), []),
            })
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
