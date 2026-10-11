"""Enrich only ammunition efficiency fields, preserving the archive snapshot.

EnhanceUI: GetCardFacultyAttribute(card, 1, 3, 1, trend, 22/23, false).
Raw values are basis points; the UI displays floor(value / 100) percent.
Keep them separate from additive panel stats and the loadout calculator.
"""
import argparse
import json
from collections import Counter

from build_steel_maiden_catalog import faculty_preview_stats, stats_for_template, extract_attribute_template_ids
from decode_configs import (
    ROOT, config_path, parse_capsule_phases, parse_faculty_trend_groups,
    parse_faculty_extend_links, parse_growth_templates, parse_growth_rules,
    parse_unit_attributes, parse_capsule_types,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    public = ROOT / 'steel-maiden-browser/public/data'
    paths = [public / 'maidens.json', public / 'technology-catalog.json']
    archive, technology = [json.loads(p.read_text('utf-8')) for p in paths]
    phases = {(r['capsule_type_id'], r['phase']): r for r in parse_capsule_phases(config_path('CapsulePhaseInfo.dat'))[0]}
    groups = {r['trend_group_id']: r for r in parse_faculty_trend_groups(config_path('FacultyTrendGroupInfo.dat'))}
    links = {r['extend_group_id']: r for r in parse_faculty_extend_links(config_path('FacultyExtendLinkInfo.dat'))}
    templates = {r['template_id']: r for r in parse_growth_templates(config_path('AttributeGrowthTemplateInfo.dat'))}
    rules = {(r['rule_type'], r['rule_id']): r for r in parse_growth_rules(config_path('AttributeGrowthRuleInfo.dat'))}
    attrs = {r['id']: r for r in parse_unit_attributes(config_path('UnitAttributeInfo.dat'))}
    assert attrs[22]['code'] == 'TOGROUND' and attrs[23]['code'] == 'TOAIR'
    cache = {}
    by_craft = {}
    distribution = Counter()

    def from_templates(tids):
        key = tuple(tids)
        if key not in cache:
            values = Counter()
            for tid in tids:
                values.update(stats_for_template(templates[tid], 1, rules))
            assert 22 in values and 23 in values, tids
            cache[key] = {'ground': values[22], 'air': values[23]}
        return cache[key]

    def efficiency(card_id, trend_id=None):
        phase = phases[(card_id, 1)]
        category = next(c for c in phase['faculty_categories'] if c['category_id'] == 3)
        group = groups[category['limit_config']['field_0']]
        if trend_id is None:
            trend_id = group['field_2']
        assert any(t['trend_id'] == trend_id for t in group['items']), (card_id, trend_id)
        # Include all selected templates (including category base effects).
        _, tids = faculty_preview_stats(phase, 3, trend_id, groups, links, templates, rules, attrs)
        return from_templates(tids)

    def assign(target, key, value):
        if args.check:
            assert target.get(key) == value, (target.get('id', target.get('craftId')), key, target.get(key), value)
        else:
            target[key] = value

    count = 0
    for maiden in archive['rows']:
        assign(maiden, 'baseAmmoEfficiency', efficiency(maiden['id']))
        for ammo in maiden['allAmmunition']:
            value = efficiency(maiden['id'], ammo['id'])
            assign(ammo, 'efficiency', value)
            by_craft.setdefault(ammo['id'], set()).add((value['ground'], value['air']))
            distribution[(value['ground'], value['air'])] += 1
            count += 1
        for ammo in maiden['ammunition']:
            assign(ammo, 'efficiency', efficiency(maiden['id'], ammo['id']))

    hidden_by_tag = {tag: c['capsule_type_id'] for c in parse_capsule_types(config_path('CapsuleTypeInfo.dat'))
                     if c['field_2'] == 3 for tag in c['group_b_ids']}
    nodes = 0
    for block in technology['blocks']:
        if block['category'] != '主炮':
            continue
        for node in block['nodes']:
            # CardInfoUI uses the hidden item capsule, even for crafts with no
            # currently listed compatible vehicle (e.g. craft 6588).
            capsule_id = hidden_by_tag[10000 + node['craftId']]
            value = from_templates(extract_attribute_template_ids(phases[(capsule_id, 1)]))
            values = by_craft.get(node['craftId'], set())
            assert not values or values == {(value['ground'], value['air'])}, (node['craftId'], values, value)
            assign(node, 'efficiency', value)
            nodes += 1
    if not args.check:
        for path, data in zip(paths, [archive, technology]):
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'mode': 'check' if args.check else 'prepare', 'vehicles': len(archive['rows']),
                      'ammunitionCards': count, 'crafts': len(by_craft), 'technologyNodes': nodes,
                      'efficiencyPairs': len(distribution)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
