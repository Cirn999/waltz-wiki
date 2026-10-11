"""Resolve named skins through the same chain as CardInfoUI's ChangeSkin view.

Card tag -> ArrangedStyle Skin/entry7 -> FacultyTrendCategory -> phase 1,
category 19 trend -> faculty -> UnitAppearance conditional model.  Category 20
is the default Live2D switch, not an additional skin. Keep existing default art.
"""
import json
import re
from decode_configs import (
    ROOT, config_path, parse_arranged_styles, parse_capsule_types,
    parse_unit_appearances, parse_string_table, parse_capsule_phases,
    parse_faculty_trend_categories, parse_faculty_trend_groups,
    parse_faculty_extend_links,
)


def build():
    maidens = json.loads((ROOT / 'steel-maiden-browser/public/data/maidens.json').read_text('utf-8'))['rows']
    cards = {r['capsule_type_id']: r for r in parse_capsule_types(config_path('CapsuleTypeInfo.dat'))}
    apps = {r['appearance_id']: r for r in parse_unit_appearances(config_path('UnitAppearanceInfo.dat'))}
    phases = {(r['capsule_type_id'], r['phase']): r for r in parse_capsule_phases(config_path('CapsulePhaseInfo.dat'))[0]}
    strings = {r['string_id']: r['strings'][0] if r['strings'] else '' for r in parse_string_table(config_path('StringTableInfo.dat'))}
    styles = [s for s in parse_arranged_styles(config_path('ArrangedStyleInfo.dat')) if 120 in s['tags'] and any(i['mode_code'] == 'Skin' for i in s['items'])]
    trends = {tag: r['trend_id'] for r in parse_faculty_trend_categories(config_path('FacultyTrendCategoryInfo.dat')) for tag in r['tags']}
    groups = {r['trend_group_id']: r for r in parse_faculty_trend_groups(config_path('FacultyTrendGroupInfo.dat'))}
    links = {r['extend_group_id']: r['extend_effects'] for r in parse_faculty_extend_links(config_path('FacultyExtendLinkInfo.dat'))}
    rows, errors = {}, []

    def number(style, mode, entry):
        return next((n['value'] for i in style['items'] if i['mode_code'] == mode for n in i['number_entries'] if n['entry_id'] == entry), None)

    def label(style, mode):
        return re.sub(r'<[^>]+>', '', strings.get(number(style, mode, 5), '')).strip()

    for maiden in maidens:
        card = cards[maiden['id']]
        relevant = [s for s in styles if set(s['tags']) & set(card['group_b_ids'])]
        if not relevant:
            continue
        phase = phases[(maiden['id'], 1)]
        app = apps[phase['appearance_id']]
        category = next(c for c in phase['faculty_categories'] if c['category_id'] == 19)
        limit = category['limit_config']
        group = groups[limit['field_0']]
        skins = []
        for style in relevant:
            tag = number(style, 'Skin', 7)
            trend_id = trends[tag]
            trend = next((t for t in group['items'] if t['trend_id'] == trend_id), None)
            if not trend:
                errors.append(f"{maiden['id']} style {style['arranged_style_id']}: no trend {trend_id}")
                continue
            effects = limit['extend_effects'] + trend['extend_effects']
            for gid in limit['extend_group_ids'] + trend['extend_group_ids']:
                effects += links[gid]
            faculties = {f for effect in effects for f in effect['group_a_ids']}
            matches = [a for a in app['conditional_appearances'] if all(
                r['min_level'] <= (1 if r['faculty_id'] in faculties else 0) <= r['max_level']
                for r in a['faculty_rules']
            )]
            if len(matches) != 1:
                errors.append(f"{maiden['id']} style {style['arranged_style_id']}: {len(matches)} appearances")
                continue
            model_id = matches[0]['model_id']
            if any(s['modelId'] == model_id for s in skins):
                continue
            skins.append({'id': style['arranged_style_id'], 'name': label(style, 'Skinname'),
                          'painter': label(style, 'Painter'), 'modelId': model_id,
                          'skinTag': tag, 'trendId': trend_id, 'facultyIds': sorted(faculties)})
        if skins:
            rows[str(maiden['id'])] = {'tank': maiden['tank'], 'skins': skins}
    if errors:
        raise ValueError('\n'.join(errors))
    output = ROOT / 'analysis_apk/output/maiden_skins.json'
    output.write_text(json.dumps({'version': 1, 'rows': rows}, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(f"Resolved {sum(len(r['skins']) for r in rows.values())} skins across {len(rows)} vehicles")
    print(output)


if __name__ == '__main__':
    build()
