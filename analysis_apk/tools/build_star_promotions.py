"""Export per-card star promotions from the native evolution train/consume tables."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from decode_configs import config_path, parse_capsule_types, parse_capsule_faculty_trains, parse_demand_groups, parse_consume_groups, parse_fund_types, parse_string_table
from stage_assets import StageAssets

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'steel-maiden-browser'
OUTPUT = APP / 'public/data/star-promotions.json'


def build(check=False):
    sources = {}

    def read(name, parser):
        file = config_path(name)
        sources[name] = hashlib.sha256(file.read_bytes()).hexdigest()
        return parser(file)

    rows = json.loads((APP / 'public/data/maidens.json').read_text(encoding='utf-8'))['rows']
    capsules = {c['capsule_type_id']: c for c in read('CapsuleTypeInfo.dat', parse_capsule_types)}
    trains = read('CapsuleFacultyTrainInfo.dat', parse_capsule_faculty_trains)
    demands = {g['demand_group_id']: g['items'] for g in read('DemandGroupInfo.dat', parse_demand_groups)}
    consumes = {g['consume_group_id']: g['items'] for g in read('ConsumeGroupInfo.dat', parse_consume_groups)}
    funds = {f['fund_id']: f for f in read('FundTypeInfo.dat', parse_fund_types)}
    texts = {r['string_id']: next((s for s in r['strings'] if s), '') for r in read('StringTableInfo.dat', parse_string_table)}
    evolution = {}
    for train in trains:
        if not train['group_d_values']:
            continue
        assert len(train['group_c_values']) == len(train['group_d_values']) == 1, train
        assert not any(train[k] for k in ['group_a_ids', 'demands', 'adjusts', 'trend_changes']), train
        for growth_tag in train['group_b_ids']:
            key = (growth_tag, train['group_c_values'][0])
            assert key not in evolution, ('Ambiguous native evolution train', key)
            evolution[key] = train

    # DevelopUI selects the honor recipe by the card's 811/812/813 tag.
    # Resolve its own level/phase gate before using evolution's 35/70 gate.
    honor_recipes = {}
    for train in trains:
        if 1550 not in train['group_a_ids']:
            continue
        tags = set(train['group_a_ids']) & {811, 812, 813}
        assert len(tags) == 1, train
        tag = tags.pop()
        assert tag not in honor_recipes, ('Ambiguous honor recipe', tag)
        assert len(train['group_c_values']) == 1 and not train['group_d_values'], train
        assert not any(train[k] for k in ['group_b_ids', 'demands', 'adjusts', 'trend_changes']), train
        items = [d for g in train['group_e_ids'] for d in demands[g]]
        levels = [d['values'][1] for d in items if d['item_type'] == 13 and d['values'][0] == 1 and d['values'][2] == 2147483647]
        assert len(levels) == 1, train
        assert all(d in [
            {'item_type': 13, 'values': [1, levels[0], 2147483647]},
            {'item_type': 13, 'values': [20, 0, 0]},
            {'item_type': 12, 'values': [tag, 1]},
            {'item_type': 3, 'values': [1128010, 9, 70, 2147483647]},
        ] for d in items), ('Unhandled honor prerequisite', train, items)
        honor_recipes[tag] = {'trainId': train['train_id'], 'level': levels[0], 'phase': train['group_c_values'][0]}
    assert set(honor_recipes) == {811, 812, 813}, honor_recipes

    cards, profiles, used_funds = {}, {}, set()
    counts = Counter()
    for card in rows:
        cid = card['id']
        cards[cid] = []
        honor_tags = set(capsules[cid]['group_b_ids']) & set(honor_recipes)
        assert len(honor_tags) == 1, ('Missing/ambiguous honor tag', cid)
        honor_recipe = honor_recipes[honor_tags.pop()]
        previous_level = 1
        # r_GetCapsuleTrainForEvolution joins the CapsuleTypeInfo growth tag,
        # not a guessed rarity/cost tier or the displayed N blueprint.
        for phase in (1, 2):
            train = evolution[(capsules[cid]['growth_tag_id'], phase)]
            target = train['group_d_values'][0]
            assert target == phase + 1, (cid, train)
            requirement = {'level': None, 'commanderLevel': None, 'honor': False}
            for item in [d for g in train['group_e_ids'] for d in demands[g]]:
                kind, values = item['item_type'], item['values']
                if kind == 13 and values[0] == 1 and values[2] == 2147483647:
                    assert requirement['level'] is None
                    requirement['level'] = values[1]
                elif kind == 1 and values[0] == 1 and values[2] == 32767:
                    assert requirement['commanderLevel'] is None
                    requirement['commanderLevel'] = values[1]
                elif kind == 13 and values == [20, 1, 2147483647]:
                    requirement['honor'] = True
                else:
                    raise ValueError(('Unhandled promotion requirement', cid, item))
            assert requirement['level'] == {2: 35, 3: 70}[target], (cid, requirement)
            assert requirement['commanderLevel'] is not None, cid
            requirement['recipeLevel'] = requirement['level']
            requirement['honorLevel'] = honor_recipe['level'] if requirement['honor'] else None
            if requirement['honor']:
                assert honor_recipe['phase'] <= phase, ('Honor requires a later star phase', cid, phase, honor_recipe)
            requirement['level'] = max(previous_level, requirement['recipeLevel'], requirement['honorLevel'] or 0)
            previous_level = requirement['level']
            costs = []
            for item in [i for g in train['group_f_ids'] for i in consumes[g]]:
                assert item['item_type'] == 0 and len(item['values']) == 1 and item['amount'] > 0, (cid, item)
                fund_id = item['values'][0]
                used_funds.add(fund_id)
                costs.append({'fundId': fund_id, 'amount': item['amount']})
            assert len(costs) in (2, 3), (cid, costs)
            assert sum(c['fundId'] in (2, 19) for c in costs) == 1, (cid, costs)
            assert sum(3001 <= c['fundId'] <= 3007 for c in costs) == 1, (cid, costs)
            assert all(c['fundId'] in {2, 12, 19, *range(3001, 3008)} for c in costs), (cid, costs)
            profile = {'stars': target, **requirement, 'costs': costs}
            key = '-'.join(map(str, train['group_f_ids']))
            if key in profiles:
                assert profiles[key] == profile, ('Same cost profile, different requirements', key)
            profiles[key] = profile
            cards[cid].append(key)
            counts[f"{target} stars at {requirement['level']}"] += 1
            if requirement['honor']:
                counts[f'{target} stars requires honor'] += 1

    out = APP / 'public/art/star-promotions'
    if not check:
        out.mkdir(parents=True, exist_ok=True)
    materials = {}
    assets = StageAssets(check=True)
    try:
        for fund_id in sorted(used_funds):
            fund = funds[fund_id]
            code = next(r['resource'] for r in fund['resources'] if r['resource_id'] == 9)
            image = assets.image(code)
            assert image is not None and image.getbbox(), ('Missing native material icon', fund_id, code)
            dest = out / f'{code}.webp'
            if check:
                assert dest.is_file(), ('Missing exported material', dest)
            else:
                image.save(dest, 'WEBP', lossless=True)
            materials[fund_id] = {'name': texts[fund['name_string_id']], 'image': f'/art/star-promotions/{code}.webp'}
    finally:
        assets.close()

    honor = next(f for f in funds.values() if texts.get(f['name_string_id']) == '命运之勋')
    honor_code = next(r['resource'] for r in honor['resources'] if r['resource_id'] == 9)
    honor_icon = f'/art/slot-unlocks/{honor_code}.webp'
    assert (APP / 'public' / honor_icon.lstrip('/')).is_file(), 'Missing existing native honor icon'
    result = {'version': 2, 'sources': sources, 'honorRecipes': honor_recipes, 'honorIcon': honor_icon, 'materials': materials, 'profiles': profiles, 'cards': cards}
    serialized = json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
    if check:
        assert OUTPUT.read_text(encoding='utf-8') == serialized, 'Star promotions need regeneration'
    else:
        OUTPUT.write_text(serialized, encoding='utf-8')
    print(json.dumps({'checked': check, 'cards': len(cards), 'profiles': len(profiles), 'materials': len(materials), 'audit': dict(counts), 'bison': [profiles[k] for k in cards[6242]]}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
