"""Terrain wording from the in-game manual, not legacy SkillDesc prose.

The manual (ArrangedStyle 1378023 / MANUAL) is the page in the user's
reference. Some old ENV descriptions disagree with both that manual and
the corresponding ANTI status: do not blindly prefer ENV for every effect.
"""
import re
from html import unescape


def plain_text(value):
    return unescape(re.sub(r'<[^>]*>', '', value)).strip()


def text_id(style, mode):
    ids = [n['value'] for i in style['items'] if i['mode_code'] == mode
           for n in i['number_entries'] if n['entry_id'] == 5]
    assert len(ids) == 1, f'Missing/ambiguous {mode} text for {style["arranged_style_id"]}'
    return ids[0]


def aircraft_manual(styles, text):
    """Read aircraft labels/icons/prose and ordering from both native help pages.

    ENV_ITEM still determines which effects apply to each field. Help-page
    examples must not overwrite different same-name field configurations.
    """
    definitions, sequences = {}, []
    for style_id in (1378036, 1378037):
        string_id = text_id(styles[style_id], 'MANUAL')
        for line in re.split(r'</?br\s*/?>', text(string_id), flags=re.I):
            visible = plain_text(line)
            header = re.fullmatch(r'.+，带有(.+)的影响：', visible)
            if header:
                sequences.append(header[1].split('、'))
                continue
            name, sep, description = visible.partition('：')
            icon = re.search(r'<img\s+src="(tjsx-\d+)"', line)
            if not (sep and icon):
                continue
            assert name and description, f'Incomplete aircraft manual definition: {visible}'
            if name in definitions:
                assert (definitions[name]['description'], definitions[name]['icon']) == (description, icon[1]), f'Conflicting aircraft manual definition: {name}'
            else:
                definitions[name] = {'description': description, 'icon': icon[1], 'stringId': string_id}
    assert len(definitions) == 17 and len(sequences) == 20, 'Re-audit aircraft manual coverage'

    # A common order satisfying every manual example also handles combinations
    # not illustrated there, without adding/removing configured effects.
    predecessors = {name: set() for name in definitions}
    for sequence in sequences:
        assert set(sequence) <= definitions.keys(), f'Unknown manual effects: {sequence}'
        for first, second in zip(sequence, sequence[1:]):
            predecessors[second].add(first)
    order = []
    while len(order) < len(definitions):
        ready = next((name for name in definitions if name not in order and predecessors[name] <= set(order)), None)
        assert ready, 'Conflicting aircraft manual display order'
        order.append(ready)
    return definitions, {name: index for index, name in enumerate(order)}


def build_aircraft_effects(field_effect_ids, styles, text, assets):
    definitions, order = aircraft_manual(styles, text)
    effects = {}
    for sid in sorted({sid for ids in field_effect_ids.values() for sid in ids}):
        assert sid in range(180, 197), f'Unreviewed aircraft effect: {sid}'
        title_id = text_id(styles[sid], 'TITLE')
        name = plain_text(text(title_id))
        if sid == 188:
            assert name == '晴天', 'Re-audit aircraft dry-weather alias'
            name = '干燥'
        definition = definitions[name]
        image = assets.export(definition['icon'])
        assert image, f'Missing aircraft manual icon: {name}'
        effects[sid] = {
            'name': name, 'description': definition['description'], 'image': image,
            'styleId': sid, 'nameSource': 'MANUAL', 'nameStringId': definition['stringId'],
            'legacyNameStringId': title_id, 'descriptionSource': 'MANUAL',
            'descriptionStringId': definition['stringId'], 'iconSource': 'MANUAL',
        }
    assert {effect['name'] for effect in effects.values()} == definitions.keys()
    return {fid: sorted((effects[sid] for sid in ids), key=lambda effect: order[effect['name']])
            for fid, ids in field_effect_ids.items()}


def build_terrain_effects(fields, styles, text, assets, scope='ground'):
    assert scope in {'ground', 'air'}
    scope_tag = 4712 if scope == 'ground' else 4708
    field_effect_ids = {}
    for fid, field in fields.items():
        # Preserve ENV_ITEM order and the client's capsule-tag intersection
        # (ChapterUI.lua:22848-22853). Never mix aircraft and ground effects.
        ids = [n['value'] for sid in field['style_ids'] for item in styles[sid]['items']
               if item['mode_code'] == 'ENV_ITEM' for n in item['number_entries']
               if n['entry_id'] == 6 and scope_tag in styles[n['value']]['tags']]
        field_effect_ids[fid] = list(dict.fromkeys(ids))
    if scope == 'air':
        return build_aircraft_effects(field_effect_ids, styles, text, assets)
    used_ids = {sid for ids in field_effect_ids.values() for sid in ids}
    names = {sid: plain_text(text(text_id(styles[sid], 'TITLE'))) for sid in used_ids}
    assert len(set(names.values())) == len(names), f'Ambiguous {scope} terrain titles'

    # Extract only effect-definition lines, preserving their exact visible
    # text. Repeated definitions in different terrain examples must agree.
    manual_id = text_id(styles[1378023], 'MANUAL')
    definitions = {}
    for line in re.split(r'</?br\s*/?>', text(manual_id), flags=re.I):
        name, sep, description = plain_text(line).partition('：')
        if sep and name in names.values():
            assert description, f'Empty manual definition: {name}'
            assert name not in definitions or definitions[name] == description, f'Conflicting manual definitions: {name}'
            definitions[name] = description
    assert len(definitions) == 13, 'Re-audit the terrain manual after client updates'

    effects = {}
    for sid, name in names.items():
        style = styles[sid]
        source = 'MANUAL'
        description_id = manual_id
        if name in definitions:
            description = definitions[name]
        else:
            # Later terrains are absent from the manual. Their ENV text
            # agrees with ANTI except for 167 (迟钝): ENV incorrectly says
            # armor loss, while ANTI and SkillDesc 3000017 say critical hits.
            assert sid in {163, 164, 165, 166, 167}, f'Unreviewed terrain wording: {sid} {name}'
            source = 'ANTI' if sid == 167 else 'ENV'
            description_id = text_id(style, source)
            description = plain_text(text(description_id))
            if sid == 167:
                assert description == '易被暴击', 'Re-audit 迟钝 status wording'
        icon = ''
        for icon_source in ('ENV', 'ANTI'):
            icon = next((s['value'] for i in style['items'] if i['mode_code'] == icon_source
                         for s in i['string_entries'] if s['entry_id'] == 1), '')
            if icon:
                break
        image = assets.export(icon)
        assert name and description and image, f'Incomplete terrain effect: {sid}'
        assert not re.search(r'[<>]|\(具有', description), f'Legacy/markup text leaked: {name}'
        effects[sid] = {
            'name': name, 'description': description, 'image': image,
            'iconSource': icon_source, 'styleId': sid,
            'nameStringId': text_id(style, 'TITLE'),
            'descriptionSource': source, 'descriptionStringId': description_id,
        }
    return {fid: [effects[sid] for sid in ids] for fid, ids in field_effect_ids.items()}
