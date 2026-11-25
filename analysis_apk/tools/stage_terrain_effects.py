"""Terrain wording and artwork from the game's field styles and help pages."""
import re
from html import unescape


def plain_text(value):
    return unescape(re.sub(r'<[^>]*>', '', value)).strip()


def text_id(style, mode):
    ids = [n['value'] for i in style['items'] if i['mode_code'] == mode
           for n in i['number_entries'] if n['entry_id'] == 5]
    assert len(ids) == 1, f'Missing/ambiguous {mode} text for {style["arranged_style_id"]}'
    return ids[0]


def manual_pages(styles, text, scope):
    title_pattern = r'地形效果\s*\d*' if scope == 'ground' else r'空钢地形攻略\s*\d*'
    for style in styles.values():
        modes = {item['mode_code'] for item in style['items']}
        if {'MANUAL', 'TITLE'} <= modes and re.fullmatch(title_pattern, plain_text(text(text_id(style, 'TITLE')))):
            string_id = text_id(style, 'MANUAL')
            yield string_id, re.split(r'</?br\s*/?>', text(string_id), flags=re.I)


def terrain_manual(styles, text, scope, names):
    definitions, sequences = {}, []
    for string_id, lines in manual_pages(styles, text, scope):
        for line in lines:
            visible = plain_text(line)
            header = re.fullmatch(r'.+，带有(.+)的影响：', visible)
            if scope == 'air' and header:
                sequences.append(header[1].split('、'))
                continue
            name, sep, description = visible.partition('：')
            icon = re.search(r'<img\s+src="(tjsx-\d+)"', line)
            if not sep or name not in names or (scope == 'air' and not icon):
                continue
            assert description, f'Empty manual definition: {name}'
            content = (description, icon[1] if icon and scope == 'air' else '')
            if name in definitions:
                assert definitions[name][:2] == content, f'Conflicting manual definitions: {name}'
            else:
                definitions[name] = (*content, string_id)

    # Respect help-page order where documented. A new field can use combinations
    # that aren't illustrated, without adding/removing any configured effects.
    predecessors = {name: set() for name in definitions}
    for sequence in sequences:
        documented = [name for name in sequence if name in definitions]
        for first, second in zip(documented, documented[1:]):
            predecessors[second].add(first)
    order = {}
    while len(order) < len(definitions):
        ready = next((name for name in definitions if name not in order and predecessors[name] <= order.keys()), None)
        assert ready, 'Conflicting terrain manual display order'
        order[ready] = len(order)
    return definitions, order


def terrain_icon(style):
    for mode in ('ENV', 'ANTI'):
        code = next((s['value'] for i in style['items'] if i['mode_code'] == mode
                     for s in i['string_entries'] if s['entry_id'] == 1 and s['value']), '')
        if code:
            return code, mode
    return '', ''


def build_terrain_effects(fields, styles, text, assets, scope='ground'):
    assert scope in {'ground', 'air'}
    scope_tag = 4712 if scope == 'ground' else 4708
    field_effect_ids = {}
    for fid, field in fields.items():
        # ENV_ITEM order and the game's capsule-tag intersection determine
        # field membership (ChapterUI.lua:22848-22853).
        ids = [n['value'] for sid in field['style_ids'] for item in styles[sid]['items']
               if item['mode_code'] == 'ENV_ITEM' for n in item['number_entries']
               if n['entry_id'] == 6 and scope_tag in styles[n['value']]['tags']]
        field_effect_ids[fid] = list(dict.fromkeys(ids))
    used_ids = {sid for ids in field_effect_ids.values() for sid in ids}
    title_ids = {sid: text_id(styles[sid], 'TITLE') for sid in sorted(used_ids)}
    names = {sid: plain_text(text(title_id)) for sid, title_id in title_ids.items()}
    # The aircraft help calls the legacy 晴天 entry 干燥.
    if scope == 'air' and names.get(188) == '晴天':
        names[188] = '干燥'
    assert len(set(names.values())) == len(names), f'Ambiguous {scope} terrain titles'
    definitions, order = terrain_manual(styles, text, scope, set(names.values()))

    effects = {}
    for sid, name in names.items():
        style = styles[sid]
        icon, icon_source = terrain_icon(style)
        name_id = title_ids[sid]
        name_source = {}
        legacy_ground = scope == "ground" and sid in {163, 165, 166, 167}
        if name in definitions and not legacy_ground:
            description, manual_icon, description_id = definitions[name]
            source = 'MANUAL'
            if scope == 'air':
                icon, icon_source = manual_icon, 'MANUAL'
                name_source = {'nameSource': 'MANUAL', 'legacyNameStringId': name_id}
                name_id = description_id
        else:
            # Keep the more specific reviewed ENV wording for legacy entries.
            # For 迟钝, ANTI matches the critical-hit effect where ENV says armor loss.
            source = 'ANTI' if scope == 'ground' and sid == 167 else 'ENV'
            description_id = text_id(style, source)
            description = plain_text(text(description_id))
        image = assets.export(icon)
        assert name and description and image, f'Incomplete terrain effect: {sid} {name}'
        assert not re.search(r'[<>]|\(具有', description), f'Legacy/markup text leaked: {name}'
        effects[sid] = {
            'name': name, 'description': description, 'image': image,
            'iconSource': icon_source, 'styleId': sid, **name_source,
            'nameStringId': name_id, 'descriptionSource': source, 'descriptionStringId': description_id,
        }
    result = {fid: [effects[sid] for sid in ids] for fid, ids in field_effect_ids.items()}
    if scope == 'air':
        for entries in result.values():
            entries.sort(key=lambda effect: order.get(effect['name'], len(order)))
    return result
