"""Export every displayed equipment slot's native unlock conditions.

CardInfoUI.lua joins EQU tags to 1502 equip trains and 1510 activation trains.
Do not use the displayed ordinal: some cards omit slots and some have additional
special slots. See steel-maiden-browser/docs/equipment-slot-unlocks.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from decode_configs import (
    config_path, parse_arranged_styles, parse_capsule_types,
    parse_capsule_faculty_trains, parse_demand_groups, parse_capsule_phases,
    parse_string_table, parse_unit_appearances, parse_fund_types,
)
from stage_assets import StageAssets

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'steel-maiden-browser'
OUTPUT = APP / 'public/data/equipment-slot-unlocks.json'


def build(check=False):
    rows = json.loads((APP / 'public/data/maidens.json').read_text(encoding='utf-8'))['rows']
    sources = {}

    def read(name, parser):
        source = config_path(name)
        sources[name] = hashlib.sha256(source.read_bytes()).hexdigest()
        return parser(source)

    capsules = {x['capsule_type_id']: x for x in read('CapsuleTypeInfo.dat', parse_capsule_types)}
    styles = read('ArrangedStyleInfo.dat', parse_arranged_styles)
    trains = read('CapsuleFacultyTrainInfo.dat', parse_capsule_faculty_trains)
    demands = {x['demand_group_id']: x['items'] for x in read('DemandGroupInfo.dat', parse_demand_groups)}
    phases = read('CapsulePhaseInfo.dat', parse_capsule_phases)[0]
    appearances = {x['appearance_id']: x for x in read('UnitAppearanceInfo.dat', parse_unit_appearances)}
    texts = {x['string_id']: next((s for s in x['strings'] if s), '') for x in read('StringTableInfo.dat', parse_string_table)}
    funds = read('FundTypeInfo.dat', parse_fund_types)
    equ, active = {}, {}
    for style in styles:
        for item in style['items']:
            if item['mode_code'] not in ('EQU', 'ACTIVE_CONDITION'):
                continue
            target = equ if item['mode_code'] == 'EQU' else active
            for tag in style['tags']:
                assert tag not in target, ('Ambiguous slot style', tag)
                target[tag] = item
    by_tag = defaultdict(list)
    for train in trains:
        for tag in set(train['group_a_ids']) & equ.keys():
            by_tag[tag].append(train)
    card_phases = defaultdict(dict)
    for p in phases:
        card_phases[p['capsule_type_id']][p['phase']] = p

    # Native invoke module 44, used by CardInfoUI when faculty 20 is zero.
    lua = (ROOT / 'patch/_1.18/RanaScripts/invoke.lua').read_text(encoding='utf-8')
    module = lua.split('function trigger_____59_Actions()', 1)[1].split('function trigger_____61_Conditions()', 1)[0]
    base_stars = {int(k): int(v) for k, v in re.findall(r'StarNum_Array\[(\d+)\]\s*=\s*(\d+)', module)}
    assert base_stars == {1: 1, 2: 1, 3: 2, 4: 3}

    def expanded(train):
        assert not train['demands'] and not train['group_b_ids'] and not train['group_d_values'], ('New demand protocol', train['train_id'])
        return [d for group in train['group_e_ids'] for d in demands[group]]

    rules, cards = {}, {}
    counts = Counter()
    for card in rows:
        cid = card['id']
        tags = [tag for tag in capsules[cid]['group_b_ids'] if tag in equ]
        assert len(tags) == len(card['slotDetails']), ('Slot count changed', cid)
        rarity = appearances[card_phases[cid][1]['appearance_id']]['rarity']
        assert rarity == card['rarityId'], ('Rarity changed', cid)
        cards[cid] = {'baseStars': base_stars[rarity], 'tags': tags}
        for idx, tag in enumerate(tags):
            if tag not in rules:
                item = equ[tag]
                numbers = {e['entry_id']: e['value'] for e in item['number_entries']}
                name = re.sub(r'\s+', '', texts[numbers[5]])
                equips = [t for t in by_tag[tag] if 1502 in t['group_a_ids']]
                activations = [t for t in by_tag[tag] if 1510 in t['group_a_ids']]
                assert equips and len(activations) <= 1, ('Missing/ambiguous slot trains', tag)
                phase_sets = {tuple(t['group_c_values']) for t in equips}
                assert len(phase_sets) == 1, ('Equipment-specific unlock phase', tag)
                allowed = next(iter(phase_sets))
                assert allowed in ((1, 2, 3), (2, 3), (3,)), ('Unknown phases', tag, allowed)
                categories = {r['category_id'] for t in equips for c in t['trend_changes'] for r in c['ratio_groups']}
                assert len(categories) == 1, ('Ambiguous native faculty', tag)
                category = next(iter(categories))
                for t in equips:
                    expected = [
                        {'item_type': 12, 'values': [tag, 1]},
                        {'item_type': 14, 'values': [category, 1, 1]},
                    ]
                    if activations:
                        expected.append({'item_type': 13, 'values': [category, 1, 2147483647]})
                    assert expanded(t) == expected, ('Unhandled equip condition', tag, t['train_id'], expanded(t))
                rule = {'name': name, 'nativeIndex': numbers[1], 'category': category, 'stars': min(allowed), 'marks': 0, 'honor': False,
                        'equipTrainId': equips[0]['train_id'], 'equipTrainCount': len(equips)}
                assert bool(activations) == (tag in active), ('Missing activation style/train', tag)
                if activations:
                    train = activations[0]
                    assert train['group_c_values'] == list(allowed) and not train['group_f_ids'], ('New activation cost/phase', tag)
                    ds = expanded(train)
                    assert ds[0] == {'item_type': 13, 'values': [category, 0, 0]}, ('New activation-state check', tag)
                    for d in ds[1:]:
                        if d['item_type'] == 3 and d['values'][:2] == [51, 10] and d['values'][3] == 2147483647:
                            rule['marks'] = d['values'][2]
                        elif d == {'item_type': 13, 'values': [20, 1, 2147483647]}:
                            rule['honor'] = True
                        else:
                            raise ValueError(('Unhandled activation requirement', tag, d))
                    style_demands = [d for group in active[tag]['demands'] for d in demands[group]]
                    assert style_demands == [d for d in ds if d['item_type'] == 3], ('UI/activation eagle-mark mismatch', tag)
                    rule['activationTrainId'] = train['train_id']
                    rule['activationDemandGroups'] = train['group_e_ids']
                    assert rule['marks'] > 0
                rules[tag] = rule
            rule = rules[tag]
            assert rule['name'] == card['slotDetails'][idx]['name'], ('Slot order/name changed', cid, idx, rule['name'], card['slotDetails'][idx])
            assert rule['stars'] in card_phases[cid], ('Required phase unavailable', cid, tag)
            honor = rule['honor'] or rule['stars'] > base_stars[rarity]
            counts[f"stars={rule['stars']},marks={rule['marks']},honor={honor}"] += 1

    # The compact badge is the inventory sprite of the named fund, not an
    # equipment-assessment medal or a fabricated Unicode star.
    medal = [f for f in funds if texts.get(f['name_string_id']) == '命运之勋']
    assert len(medal) == 1
    medal_code = next(r['resource'] for r in medal[0]['resources'] if r['resource_id'] == 9)
    codes = {'star': 'tkdm-001', 'eagle': 'bjk-031', 'honor': medal_code}
    assets = StageAssets(check=True)
    icons = {}
    out = APP / 'public/art/slot-unlocks'
    if not check: out.mkdir(parents=True, exist_ok=True)
    try:
        for kind, code in codes.items():
            image = assets.image(code)
            assert image is not None and image.getbbox(), ('Missing native icon', code)
            dest = out / f'{code}.webp'
            if check:
                assert dest.is_file(), ('Missing exported icon', dest)
            else:
                image.save(dest, 'WEBP', lossless=True)
            icons[kind] = f'/art/slot-unlocks/{code}.webp'
    finally:
        assets.close()

    result = {'version': 1, 'sources': sources, 'icons': icons, 'rules': rules, 'cards': cards}
    serialized = json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
    if check:
        assert OUTPUT.read_text(encoding='utf-8') == serialized, 'Slot unlock export out of date; run prepare:slot-unlocks'
    else:
        OUTPUT.write_text(serialized, encoding='utf-8')
    print(json.dumps({'checked': check, 'cards': len(cards), 'slots': sum(counts.values()), 'tags': len(rules), 'requirements': dict(sorted(counts.items()))}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
