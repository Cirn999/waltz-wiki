"""Export the native panel calculation inputs without folding its operations.

Kept separate from display-card stats: those are preview values, not executable
loadout rules. See loadout_native_trace and native_loadout_oracle.py for evidence.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

from decode_configs import (
    config_path, parse_capsule_types, parse_capsule_phases, parse_faculty_trend_groups,
    parse_faculty_extend_links, parse_faculty_attribute_param_rules, parse_growth_templates,
    parse_growth_rules, parse_unit_trait_growth_rules, parse_feature_calculations,
    parse_capsule_faculty_trains, parse_consume_groups, parse_arranged_styles, parse_unit_trait_types, parse_role_properties, Reader,
)

ROOT = Path(__file__).resolve().parents[2]
ATTRIBUTES = {0: 'durability', 2: 'power', 3: 'piercing', 4: 'armor', 5: 'accuracy', 6: 'evasion', 8: 'stealth', 9: 'recon', 11: 'fireproof', 13: 'coverage', 14: 'homogeneity'}


def source_path(name):
    try:
        return config_path(name)
    except FileNotFoundError:
        return ROOT / 'analysis_apk/apk_bootstrap_config' / name


def build():
    frontend = json.loads((ROOT / 'steel-maiden-browser/public/data/maidens.json').read_text(encoding='utf-8'))
    equipment = json.loads((ROOT / 'steel-maiden-browser/public/data/equipment-catalog.json').read_text(encoding='utf-8'))
    capsules = {x['capsule_type_id']: x for x in parse_capsule_types(source_path('CapsuleTypeInfo.dat'))}
    phases = parse_capsule_phases(source_path('CapsulePhaseInfo.dat'))[0]
    groups = {x['trend_group_id']: x for x in parse_faculty_trend_groups(source_path('FacultyTrendGroupInfo.dat'))}
    links = {x['extend_group_id']: x for x in parse_faculty_extend_links(source_path('FacultyExtendLinkInfo.dat'))}
    params = {x['param_rule_id']: x for x in parse_faculty_attribute_param_rules(source_path('FacultyAttributeParamRuleInfo.dat'))}
    templates = {x['template_id']: x for x in parse_growth_templates(source_path('AttributeGrowthTemplateInfo.dat'))}
    rules = {(x['rule_type'], x['rule_id']): x for x in parse_growth_rules(source_path('AttributeGrowthRuleInfo.dat'))}
    trait_rules = {x['growth_rule_id']: x for x in parse_unit_trait_growth_rules(source_path('UnitTraitGrowthRuleInfo.dat'))}
    features = {(x['feature_type'], x['feature_id']): x for x in parse_feature_calculations(source_path('FeatureCalculateInfo.dat'))}
    trait_types = parse_unit_trait_types(source_path('UnitTraitTypeInfo.dat'))
    properties = parse_role_properties(source_path('RolePropertyInfo.dat'))
    faculty_growth = dict(Reader(source_path('FacultyGrowthRuleInfo.dat').read_bytes()).records(lambda r: (r.u32(), [r.i32() for _ in range(r.u8())])))

    def initial_level(growth_id):
        level = 0
        costs = faculty_growth[growth_id]
        while level + 1 < len(costs) and costs[level + 1] == 0:
            level += 1
        return level
    trains = parse_capsule_faculty_trains(source_path('CapsuleFacultyTrainInfo.dat'))
    consumes = {x['consume_group_id']: x for x in parse_consume_groups(source_path('ConsumeGroupInfo.dat'))}
    equ_tags = {tag for s in parse_arranged_styles(source_path('ArrangedStyleInfo.dat')) for i in s['items'] if i['mode_code'] == 'EQU' for tag in s['tags']}
    fund_ids = {l['fundId'] for f in equipment['families'] for l in f['levels']}
    fund_trends = defaultdict(set)
    tag_categories = defaultdict(set)
    for t in trains:
        consumed = {i['values'][0] for g in t['group_f_ids'] for i in consumes.get(g, {}).get('items', []) if i['item_type'] == 0 and i['values'][0] in fund_ids}
        for change in t['trend_changes']:
            for r in change['ratio_groups']:
                if r['category_id'] not in [*range(7, 15), 28, 29, 30, 31]:
                    continue
                for fund in consumed:
                    fund_trends[fund].update(r['trend_ids'])
                for tag in set(t['group_a_ids']) & equ_tags:
                    tag_categories[tag].add(r['category_id'])
    assert all(len(v) == 1 for v in fund_trends.values()), 'Ambiguous equipment -> native trend'
    missing = fund_ids - fund_trends.keys()
    assert not missing, f'Equipment without native training mapping: {sorted(missing)}'
    assert all(len(v) == 1 for v in tag_categories.values()), 'Ambiguous equipment slot category'

    effect_cache = {}
    effects = []
    used_templates, used_params, used_traits, used_groups = set(), set(), set(), set()

    def effect(e):
        assert e['intensity_adjust']['value'] == 0, 'New conditional intensity protocol requires a native implementation'
        for a in e['attribute_configs']:
            used_templates.update(a['group_a_ids'])
            used_params.update(a['group_b_ids'])
        used_traits.update(e['group_b_ids'])
        clean = {
            'properties': e['intensity_adjust']['group_a_ids'],
            'traits': e['intensity_adjust']['group_b_ids'],
            'attributes': [{'templates': a['group_a_ids'], 'presets': a['flags'], 'params': a['group_b_ids']} for a in e['attribute_configs']],
            'traitRules': e['group_b_ids'],
        }
        key = json.dumps(clean, sort_keys=True)
        if key not in effect_cache:
            effect_cache[key] = len(effects)
            effects.append(clean)
        return effect_cache[key]

    def expand(row):
        return [*row['extend_effects'], *(e for link in row['extend_group_ids'] for e in links[link]['extend_effects'])]

    cards = {}
    for m in frontend['rows']:
        id = m['id']
        card_phases = [p for p in phases if p['capsule_type_id'] == id]
        slots = []
        for tag in capsules[id]['group_b_ids']:
            if tag in equ_tags:
                assert tag in tag_categories, (id, tag)
                slots.append(next(iter(tag_categories[tag])))
        assert len(slots) == len(m['slotDetails']), (id, slots, m['slotDetails'])
        result = {}
        for p in card_phases:
            preset = {x['category_id']: x['values'] for x in p['preset_categories']}
            used_templates.update(v for values in preset.values() for v in values)
            cats = {}
            for c in p['faculty_categories']:
                l = c['limit_config']
                if l['field_0']:
                    used_groups.add(l['field_0'])
                cats[c['category_id']] = {
                    'effects': [effect(e) for e in expand(l)], 'group': l['field_0'],
                    'properties': l['group_a_ids'], 'traits': l['group_b_ids'],
                }
            result[p['phase']] = {'presets': preset, 'categories': cats}
        cards[id] = {'slots': slots, 'phases': result, 'initialLevels': {r['faculty_id']: initial_level(r['growth_value']) for r in capsules[id]['faculty_growth']}}

    exported_groups = {}
    for id in sorted(used_groups):
        g = groups[id]
        exported_groups[id] = {'default': g['field_2'], 'items': {t['trend_id']: [effect(e) for e in expand(t)] for t in g['items']}}
    exported_params = {id: {'rule': f"{params[id]['header_type']}:{params[id]['header_id']}",
                            'inputs': [{'id': a['input_id'], 'properties': a['role_property_ids'], 'traits': a['trait_ids']} for a in params[id]['adjusts']]}
                       for id in sorted(used_params)}
    used_rules = {(params[id]['header_type'], params[id]['header_id']) for id in used_params}
    exported_templates = {}
    for id in sorted(used_templates):
        assert id in templates, f'Missing template {id}'
        entries = []
        for a in templates[id]['attributes']:
            if a['attribute_id'] not in ATTRIBUTES:
                continue
            entries.append({'id': a['attribute_id'], 'rules': [[f"{r['rule_type']}:{r['rule_id']}", r['selector']] for r in a['rules']], 'multiplier': a['multiplier'], 'base': a['base']})
            used_rules.update((r['rule_type'], r['rule_id']) for r in a['rules'])
        exported_templates[id] = entries
    exported_traits = {}
    for id in sorted(used_traits):
        entries = []
        for t in trait_rules[id]['traits']:
            entries.append({'id': t['trait_id'], 'functions': [features[(r['feature_type'], r['feature_id'])] for r in t['feature_calculations']], 'multiplier': t['multiplier'], 'base': t['base']})
        exported_traits[id] = entries
    exported_rules = {f'{t}:{i}': rules[(t,i)]['functions'] for t,i in sorted(used_rules)}
    # All executable functions must be among the three present in AttributeManager.lua.
    functions = [f for r in exported_rules.values() for f in r] + [f for ts in exported_traits.values() for t in ts for f in t['functions']]
    assert all(f['function_id'] in [1,100,101] for f in functions)
    payload = {'version': 1, 'clientSha256': hashlib.sha256((ROOT / 'analysis_apk/extracted/lib/arm64-v8a/libasgame.so').read_bytes()).hexdigest(),
               'attributes': ATTRIBUTES, 'cards': cards, 'effects': effects, 'groups': exported_groups,
               'params': exported_params, 'templates': exported_templates, 'rules': exported_rules,
               'propertyDefaults': {r['property_id']: r['field_1'] for r in properties if r['field_1']},
               'traitTypes': {r['trait_id']: {'properties': r['affected_property_ids'], 'base': r['field_3']} for r in trait_types},
               'traitRules': exported_traits, 'equipmentTrends': {id: next(iter(v)) for id,v in fund_trends.items()}}
    out = ROOT / 'steel-maiden-browser/public/data/loadout-rules.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'output': str(out), 'bytes': out.stat().st_size, 'cards': len(cards), 'effects': len(effects), 'templates': len(exported_templates), 'params': len(exported_params), 'equipment': len(fund_trends)}))
    return payload


if __name__ == '__main__':
    build()
