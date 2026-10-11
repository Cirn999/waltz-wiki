"""Map-level entry costs and output groups, joined from native tables."""
from collections import Counter
from decode_configs import parse_consume_groups


def attach_map_details(table, assets, text, maps, levels, nodes, funds, awards, pools, groups, capsules, styles):
    consumes = table('ConsumeGroupInfo.dat', parse_consume_groups, 'consume_group_id')
    # ChapterUI resolves action headings from VOL_TEXT, number entry 5.
    # Include the historical CHALLENGE_02 heading in style 5000 as well as 5003.
    challenge_names = {}
    for style in styles.values():
        for item in style['items']:
            mode = item['filter_code']
            if item['mode_code'] != 'VOL_TEXT' or not mode.startswith(('CHALLENGE_', 'VOL_LUCKY_AL')):
                continue
            name = next((text(e['value']) for e in item['number_entries'] if e['entry_id'] == 5), '')
            assert name and challenge_names.get(mode, name) == name, f'Ambiguous challenge heading: {mode}'
            challenge_names[mode] = name

    def fund_info(fid):
        fund = funds[fid]
        resources = sorted(fund['resources'], key=lambda r: (r['resource_type'] != 5, r['resource_type']))
        image = next((image for r in resources if (image := assets.export(r['resource']))), '')
        assert image, f'Missing entry/output resource icon: {fid}'
        return {'fundId': fid, 'name': text(fund['name_string_id']), 'image': image}

    resource_modes = {'VOL_MATERIAL01': 3001, 'VOL_MATERIAL02': 3002,
        'VOL_MATERIAL03': 3003, 'VOL_MATERIAL04': 3004, 'VOL_LUCKY': 8, 'VOL_POINTS': 12}

    def outputs(map_row):
        result = set()
        for lid in map_row['nodes']:
            level = levels[lid]
            tids = level['award_table_ids'] + [tid for a in level['assessment_awards'] for tid in a['award_table_ids']]
            for tid in tids:
                for source in awards[tid]['items']:
                    if not source['raw_selector']: continue
                    for branch in pools[source['award_pool_id']]['groups']:
                        for pick in branch['items']:
                            if not pick['enabled_flag']: continue
                            for item in groups[pick['award_group_id']]['items']:
                                if item['amount_or_weight']:
                                    result.add((item['item_type'], item['values'][0]))
        return result

    for row in maps:
        # ChapterUI calls GetChapterLevelCost on the FIRST node on entry.
        # Type 1 updates a cooldown: it is not an inventory item/currency.
        costs = Counter()
        if row['id'] != -1:  # The unlinked-node appendix is not an enterable map.
            for gid in levels[row['nodes'][0]]['consume_group_ids']:
                for item in consumes[gid]['items']:
                    assert item['item_type'] in (0, 1), f'Unresolved entry cost: {item}'
                    if item['item_type'] == 0 and item['amount']:
                        costs[item['values'][0]] += item['amount']
        row['entryCosts'] = []
        for fid, raw_amount in costs.items():
            # These regenerating sortie resources use hundredths internally.
            # AssaultUI.lua:15650 displays their inventory/bound as floor(n/100).
            # Fuel, source iron, refined fuel and tickets use ordinary units.
            divisor = 100 if fid in (16, 406) else 1
            assert raw_amount % divisor == 0, f'Fractional sortie entry cost: {fid} / {raw_amount}'
            row['entryCosts'].append(dict(fund_info(fid), amount=raw_amount // divisor,
                rawAmount=raw_amount, displayDivisor=divisor))
        mode = row['mode']
        if mode in resource_modes:
            fid = resource_modes[mode]
            assert (1, fid) in outputs(row), f'Primary output missing from native awards: {mode}'
            row['group'] = '资源行动'
            row['outputGroup'] = fund_info(fid)['name']
        elif mode == 'VOL_FOOD':
            assert any(kind == 2 and capsules[rid]['field_2'] == 3 for kind, rid in outputs(row)), 'Missing experience feed'
            row['group'] = '资源行动'
            row['outputGroup'] = '经验道具'
        elif mode.startswith('CHALLENGE_') or mode == 'VOL_LUCKY_AL':
            assert mode in challenge_names, f'Missing native challenge heading: {mode}'
            row['group'] = '挑战行动'
            row['challengeGroup'] = challenge_names[mode]
        if row['category'] in ('assault', 'air') and not row['simulation']:
            for lid in row['nodes']:
                # Quest_Set::getCompetitionExp takes max(local Craft 1 awards,
                # ChallengeChapter_Ack.experience). No static formula for the
                # latter is available: a missing local award is NOT zero XP.
                nodes[lid]['income']['serverExperience'] = True
