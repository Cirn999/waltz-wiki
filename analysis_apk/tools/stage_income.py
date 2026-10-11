"""Export typed stage settlement income, retaining score and progress gates.

Do not reuse the union-of-possible-drops preview, and do not extrapolate one
map's formula to other maps. Non-deterministic/extra-state pools stay separate.
"""
from collections import Counter
from functools import lru_cache
from decode_configs import parse_crafts, parse_demand_groups
from build_acquisition_dataset import parse_campaign_types

INCOME_KEYS = {(0, 1): 0, (1, 1): 1, (1, 2): 2}  # experience, silver, codons
FULL_WEIGHT = 10_000_000


def attach_income(table, assets, text, maps, levels, nodes, funds, awards, pools, groups):
    demands = table('DemandGroupInfo.dat', parse_demand_groups, 'demand_group_id')
    crafts = table('CraftInfo.dat', parse_crafts, 'craft_id')
    campaigns = table('CampaignTypeInfo.dat', parse_campaign_types, 'campaign_type_id')
    main = sorted((m for m in maps if m['group'] == '主线战役'), key=lambda m: tuple(map(int, m['code'].split('-'))))
    assert len(main) == 104
    quest_progress = {levels[lid]['raw_scalar_3']: rank for rank, m in enumerate(main, 1) for lid in m['nodes']}
    compiled = {}

    @lru_cache(maxsize=None)
    def compile_pool(pid):
        pool = pools[pid]
        picks = [p for g in pool['groups'] for p in g['items'] if p['enabled_flag']]
        variants = []
        for pick in picks:
            amount = [0, 0, 0]
            for item in groups[pick['award_group_id']]['items']:
                key = INCOME_KEYS.get((item['item_type'], item['values'][0]))
                if key is None: continue
                value = item['amount_or_weight']
                assert 0 <= value < 2**31, ('Unexpected signed currency amount', pid, item)
                amount[key] += value
            variants.append({'groupId': pick['award_group_id'], 'amount': amount,
                'weight': pick['enabled_flag'], 'minProgress': 0, 'maxProgress': 104, 'conditions': []})
        # Empty candidates matter in random pools, but all-zero pools need no entry.
        if not any(any(v['amount']) for v in variants): return None
        for pick, v in zip(picks, variants):
            for did in pick['demand_group_ids']:
                for d in demands[did]['items']:
                    kind = d['item_type']; args = d['values']
                    if kind == 3 and args[0] in quest_progress and args[1] == 1:
                        qid, _, lo, hi = args
                        threshold = quest_progress[qid]
                        if (lo, hi) == (0, 0): v['maxProgress'] = min(v['maxProgress'], threshold - 1)
                        elif lo == 1 and hi == 2147483647: v['minProgress'] = max(v['minProgress'], threshold)
                        else: raise AssertionError(('Unknown progress predicate', d))
                    elif kind == 7:
                        cid, active = args
                        name = text(campaigns[cid]['name_string_id']) or f'活动 #{cid}'
                        v['conditions'].append(f"{name}{'开放' if active else '未开放'}时")
                    elif kind == 1:
                        cid, lo, hi = args
                        name = text(crafts[cid]['name_string_id'])
                        v['conditions'].append(f'{name}等级 ≥ {lo}' if hi in (32767, 2147483647) else f'{name}等级 {lo}–{hi}')
                    else:
                        raise AssertionError(('Unresolved income demand', pid, d))
        # Current currency pools: one guaranteed item, or one mutually exclusive
        # progress row. Never sum alternative weighted outcomes.
        deterministic = (
            pool['pool_flag'] == 1 and len(variants) == 1 and variants[0]['weight'] == FULL_WEIGHT and not variants[0]['conditions']
        ) or (
            pool['pool_flag'] == 0 and all(not v['conditions'] for v in variants)
            and all(sum(v['minProgress'] <= rank <= v['maxProgress'] for v in variants) == 1 for rank in range(105))
        )
        compiled[pid] = {'id': pid, 'deterministic': deterministic, 'variants': variants}
        return pid

    audit = Counter()
    for lid, level in levels.items():
        sources = []
        dynamic = False
        branches = [(0, 100, level['award_table_ids'])] + [
            (a['assessment_type'], a['assessment_value'], a['award_table_ids']) for a in level['assessment_awards']]
        for low, high, tids in branches:
            assert 0 <= low <= high <= 100, ('Unrecognized assessment bounds', lid, low, high)
            for tid in tids:
                for entry in awards[tid]['items']:
                    if not entry['raw_selector']: continue
                    pid = entry['award_pool_id']
                    # These contextual/indirect outputs cannot be turned into a
                    # known currency amount from the three direct item kinds.
                    if any(i['item_type'] in (15, 16, 17, 18, 19, 51, 52, 53, 54, 55)
                           for pg in pools[pid]['groups'] for p in pg['items'] if p['enabled_flag']
                           for i in groups[p['award_group_id']]['items']): dynamic = True
                    if compile_pool(pid) is not None:
                        sources.append({'poolId': pid, 'tableId': tid, 'minScore': low, 'maxScore': high,
                            'guaranteedTable': entry['raw_selector'] == FULL_WEIGHT})
        nodes[lid]['income'] = {'sources': sources, 'dynamic': dynamic}
        audit['nodesWithIncome' if sources else 'nodesWithoutDirectIncome'] += 1
        if dynamic: audit['nodesWithContextualOutputs'] += 1

    def fund_icon(fid):
        candidates = sorted(funds[fid]['resources'], key=lambda r: r['resource_type'] != 5)
        return next((image for r in candidates if (image := assets.export(r['resource']))), '')
    # AwardUI.lua:1447-1451 explicitly uses zjm-006 for commander experience.
    exp_image = assets.export('zjm-006')
    resources = [{'key': 'experience', 'name': '指挥官经验', 'image': exp_image},
        {'key': 'silver', 'name': text(funds[1]['name_string_id']), 'image': fund_icon(1)},
        {'key': 'codons', 'name': text(funds[2]['name_string_id']), 'image': fund_icon(2)}]
    assert all(r['image'] for r in resources), ('Missing native income icons', resources)
    audit['pools'] = len(compiled)
    audit['variablePools'] = sum(not p['deterministic'] for p in compiled.values())
    # Only expose boundaries used by reward predicates, not every main map.
    boundaries = sorted({0} | {b for p in compiled.values() for v in p['variants']
        for b in (v['minProgress'], v['maxProgress'] + 1) if 0 < b <= len(main)})
    assert boundaries == list(range(0, 97, 4)), ('New reward tier boundary', boundaries)
    progress = [{'value': b, 'label': '尚未完整通关第 1 卷' if not b else
        f"完整通关第 {b // 4} 卷{'及以上' if b == boundaries[-1] else ''}（{main[b - 1]['code']}）"}
        for b in boundaries]
    return {'resources': resources, 'progress': progress, 'pools': compiled, 'audit': dict(audit)}
