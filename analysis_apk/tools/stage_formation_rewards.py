"""AssaultUI's separate formation-S rewards, not map admission predicates."""
from collections import Counter

from decode_configs import parse_produce_rules


def attach_formation_rewards(table, assets, text, maps, levels, styles, funds,
                             quests, demands, rich_parts, awards, pools, groups):
    rules = table('ProduceRuleInfo.dat', parse_produce_rules, 'rule_id')
    bonus_rules = [r for r in rules.values() if 96 in r['field_40']]
    audit = {'checked': Counter(), 'withReward': Counter()}
    signature = lambda d: (d['item_type'], tuple(d['values']))
    for row in maps:
        if row['category'] not in ('assault', 'air') or row['simulation']:
            continue
        audit['checked'][row['category']] += 1
        quest_id = levels[row['nodes'][0]]['raw_scalar_3']
        tags = set(quests[quest_id]['achievement_ids'])
        # AssaultUI.lua:1973-1983: tag 95 uses the entry-restriction layout.
        # Its historical tag-96 recipes must NOT become formation-S rewards.
        if 95 in tags:
            continue
        matching = [r for r in bonus_rules if tags.intersection(r['field_40'])]
        if not matching:
            continue
        assert len(matching) == 1, f'Ambiguous formation reward: {row["id"]}'
        rule = matching[0]
        # Same quest-tag -> ArrangedStyle -> RAID_XQ join used by AssaultUI.
        condition_items = [item for style in styles.values() if tags.intersection(style['tags'])
                           for item in style['items'] if item['mode_code'] == 'RAID_XQ']
        condition_ids = [gid for item in condition_items for gid in item['demands']]
        shown = {signature(d) for gid in condition_ids for d in demands[gid]['items']}
        recipe = {signature(d) for gid in rule['field_98'] for d in demands[gid]['items']
                  if d['item_type'] in (19, 20)}
        assert shown and shown == recipe, f'Formation reward predicates differ: {row["id"]}'
        requirements = []
        for item in condition_items:
            predicates = [d for gid in item['demands'] for d in demands[gid]['items']]
            assert len(predicates) == 1, item
            raw = next(text(n['value']) for n in item['number_entries'] if n['entry_id'] == 5)
            assert raw and '#$' not in raw, raw
            # Use this quest's exact UI wording; unrelated quests may describe
            # the same predicate as "钢舞姬或空舞姬" instead of "钢舞姬".
            parts = rich_parts(raw)
            d = predicates[0]
            requirements.append({'key': ':'.join(map(str, [d['item_type'], *d['values']])),
                                 'kind': 'formation', 'image': '', 'parts': parts,
                                 'text': ''.join(p['text'] for p in parts)})
        amounts = Counter()
        for tid in rule['field_c8']:
            sources = [s for s in awards[tid]['items'] if s['raw_selector']]
            # Fail rather than treating an unknown weighted branch as guaranteed.
            assert len(sources) == 1 and sources[0]['raw_selector'] == 10000000, tid
            pool = pools[sources[0]['award_pool_id']]
            picks = [p for branch in pool['groups'] for p in branch['items'] if p['enabled_flag']]
            assert pool['pool_flag'] == 0 and len(picks) == 1 and not picks[0]['demand_group_ids'], tid
            for item in groups[picks[0]['award_group_id']]['items']:
                if item['item_type'] == 3:
                    # Quest assessment update is internal bookkeeping, not loot.
                    assert item['values'] == [quest_id, 11, 2147483648, 2147483647], item
                    continue
                assert item['item_type'] == 1, f'Unknown formation reward: {item}'
                amounts[item['values'][0]] += item['amount_or_weight']
        rewards = []
        for fid, amount in amounts.items():
            fund = funds[fid]
            resources = sorted(fund['resources'], key=lambda r: (r['resource_type'] != 5, r['resource_type']))
            image = next((image for r in resources if (image := assets.export(r['resource']))), '')
            assert image and amount > 0 and fid not in (16, 406), (fid, amount)
            rewards.append({'fundId': fid, 'name': text(fund['name_string_id']), 'image': image, 'amount': amount})
        assert rewards, f'Empty formation reward: {row["id"]}'
        row['formationReward'] = {'grade': 'S', 'requirements': requirements,
                                  'rewards': rewards, 'ruleId': rule['rule_id']}
        audit['withReward'][row['category']] += 1
    return {key: dict(value) for key, value in audit.items()}
