"""Export default weapon names and permanent bonuses from researched crafts.

SkillGrowthTemplateInfo's second field is the faculty display-name string ID
(GetSkillFacultyName), despite the legacy decoder's `skill_id` field name.
CraftInfo level-1 property effects are permanent research bonuses, separate
from both branch-level effects and the equipped craft's panel attributes.
"""
import argparse
import json
from pathlib import Path

from decode_configs import (config_path, parse_capsule_phases, parse_crafts,
                            parse_faculty_extend_links, parse_faculty_trend_groups,
                            parse_string_table)
from inspect_magic_ordnance import parse_growth

ROOT = Path(__file__).resolve().parents[2]


def build(check=False):
    public = ROOT / 'steel-maiden-browser/public/data'
    paths = [public / 'maidens.json', public / 'technology-catalog.json']
    archive, technology = [json.loads(p.read_text(encoding='utf-8')) for p in paths]
    native = json.loads((public / 'loadout-rules.json').read_text(encoding='utf-8'))
    phases = {(r['capsule_type_id'], r['phase']): r for r in parse_capsule_phases(config_path('CapsulePhaseInfo.dat'))[0]}
    groups = {r['trend_group_id']: r for r in parse_faculty_trend_groups(config_path('FacultyTrendGroupInfo.dat'))}
    links = {r['extend_group_id']: r for r in parse_faculty_extend_links(config_path('FacultyExtendLinkInfo.dat'))}
    growth = {r['template_id']: r for r in parse_growth(config_path('SkillGrowthTemplateInfo.dat'))}
    strings = {r['string_id']: (r['strings'] or [''])[0] for r in parse_string_table(config_path('StringTableInfo.dat'))}
    crafts = {r['craft_id']: r for r in parse_crafts(config_path('CraftInfo.dat'))}
    properties = set()
    for card in native['cards'].values():
        for phase in card['phases'].values():
            for c in phase['categories'].values(): properties.update(c['properties'])
    for e in native['effects']: properties.update(e['properties'])
    for p in native['params'].values():
        for i in p['inputs']: properties.update(i['properties'])
    for t in native['traitTypes'].values(): properties.update(t['properties'])

    def assign(target, key, value):
        if check: assert target.get(key) == value, (target.get('id', target.get('craftId')), key)
        else: target[key] = value

    node_count = 0
    for block in technology['blocks']:
        for node in block['nodes']:
            craft = crafts.get(node['craftId'])
            assert not craft or len(craft['levels']) == 2, ('Multi-level research requires explicit UI support', node['craftId'])
            effects = [] if not craft else craft['levels'][1]['property_effects']
            effects = [e for e in effects if e['property_id'] in properties and e['value']]
            assert all(e['effect_type'] == 0 for e in effects), (node['craftId'], effects)
            assign(node, 'researchAttributes', [
                {'propertyId': e['property_id'], 'value': e['value'], 'effectType': e['effect_type']}
                for e in effects
            ])
            node_count += bool(effects)

    def expand(container):
        return [*container['extend_effects'], *[e for key in container['extend_group_ids'] for e in links[key]['extend_effects']]]

    def weapon_names(phase):
        c = next(c['limit_config'] for c in phase['faculty_categories'] if c['category_id'] == 3)
        group = groups[c['field_0']]
        trend = next(t for t in group['items'] if t['trend_id'] == group['field_2'])
        talent_ids = [t for e in [*expand(c), *expand(trend)] for t in e['group_a_ids']]
        return list(dict.fromkeys(strings[growth[t]['skill_id']] for t in talent_ids if t in growth and strings.get(growth[t]['skill_id'])))

    for maiden in archive['rows']:
        names = weapon_names(phases[(maiden['id'], 1)])
        assert len(names) == 1, (maiden['id'], names)
        for p in native['cards'][str(maiden['id'])]['phases']:
            assert weapon_names(phases[(maiden['id'], int(p))]) == names, ('Default weapon varies by phase', maiden['id'], p)
        weapon = names[0].split('|')[1]
        ammo_type = {
            '试验型穿甲弹': '穿甲弹', '试验型高速穿甲弹': '硬芯弹',
            '试验型脱壳穿甲弹': '脱壳弹', '试验型榴弹炮': '榴弹',
            '试验型火箭弹': '火箭弹', '试验型破甲弹': '破甲弹',
            '试验型黏着榴弹': '碎甲弹', '常规航空火箭弹': '飞弹',
            '常规航空穿甲弹': '机炮弹' if '机炮弹' in maiden['ammo'] else '航空火炮弹',
        }[weapon]
        assign(maiden, 'baseAmmunition', {'name': names[0], 'type': ammo_type})

    assert next(m for m in archive['rows'] if m['id'] == 9865)['baseAmmunition']['name'] == '155mm|试验型榴弹炮|试验型炮体'
    if not check:
        for path, data in zip(paths, [archive, technology]):
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'mode': 'check' if check else 'build', 'defaultWeapons': len(archive['rows']), 'researchNodesWithPanelBonuses': node_count}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
