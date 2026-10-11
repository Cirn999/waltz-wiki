"""Offline research only: decode and audit the game's story playback chain."""

import argparse
from collections import Counter, defaultdict
import contextlib
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

from decode_configs import Reader, config_path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis_apk' / 'story_research'


def save(name, data):
    OUT.mkdir(exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def trace():
    from analyze_elf import ELFFile, load_symbols, disassemble
    elf_path = ROOT / 'analysis_apk/scout_native_trace/libasgame.device.so'
    selectors = [
        'LoadTargetIN6Config15DramaScriptInfoEE22',
        'LoadTargetIN6Config21DramaTemplateTypeInfoEE22',
        'LoadTargetIN6Config21DramaHeadTemplateInfoEE22',
        'ZoicrsIN6Config15DramaScriptItemEh', 'ZoicrsIN6Config17DramaAdditionItemEh',
        'DramaScriptReader15extendedInitial', 'DramaScriptReader13getItemWithId',
        'r_GetChapterLevelDramaList', 'r_GetDramaEntryModeCode',
        'r_GetDramaEntryHeadPosX', 'r_GetDramaEntryDialogResource',
        'r_GetDramaEntryFontColor', 'r_GetDramaEntryDelayMSEL',
        'r_GetDramaEntryBGMResource', 'r_GetDramaEntrySEResource',
        'r_GetDramaEntryHeadModelID', 'r_GetDramaEntryHeadExpressionID',
        'r_GetDramaEntryHeadActionID', 'r_GetDramaEntryHeadPicture',
        'r_GetDramaEntryHeadName', 'r_GetDramaEntryTextContent',
        'r_GetDramaEntryAdditionalContent',
        'LoadTargetIN6Config9MusicInfoEE22',
        'LoadTargetIN6Config15SoundEffectInfoEE22',
        'RoleModelCacheConfigLoader4load',
    ]
    OUT.mkdir(exist_ok=True)
    blob = elf_path.read_bytes()
    with elf_path.open('rb') as stream:
        elf = ELFFile(stream)
        symbols = load_symbols(elf)
        for selector in selectors:
            found = [s for s in symbols if s['type'] == 'STT_FUNC' and selector in s['name']]
            assert len(found) == 1, found
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                disassemble(blob, elf, symbols, found[0])
            (OUT / (selector + '.asm.txt')).write_text(buffer.getvalue(), encoding='utf-8')
    print('Saved', len(selectors), 'native traces to', OUT)


def scripts(data, additions=True):
    def entry(r):
        item = {'template_id': r.u32(), 'head_id': r.u32(), 'text': r.cstring()}
        item['additions'] = [{'key': r.cstring(), 'value': r.cstring()} for _ in range(r.u8())] if additions else []
        return item
    return Reader(data).records(lambda r: {
        'id': r.u32(), 'variant': r.u8(), 'entries': [entry(r) for _ in range(r.u8())]
    })


def templates(data):
    return Reader(data).records(lambda r: {
        'id': r.u32(), 'mode': r.cstring(), 'field_48': r.i32(), 'field_4c': r.i32(),
        'field_50': r.cstring(), 'field_68': r.cstring(), 'field_80': r.i32(),
        'field_88': r.cstring(), 'field_a0': r.cstring(),
    })


def heads(data):
    return Reader(data).records(lambda r: {
        'id': r.u32(), 'field_04': r.u32(), 'field_08': r.u32(),
        'field_0c': r.u32(), 'field_10': r.u32(), 'field_18': r.cstring(),
    })


def decode():
    summaries = []
    sources = [(label, {name: (ROOT / folder / name).read_bytes() for name in (
        'DramaScriptInfo.dat', 'DramaTemplateTypeInfo.dat', 'DramaHeadTemplateInfo.dat')})
        for label, folder in [('resources', 'Resources/config'), ('patch', 'patch/_1.18/config')]]
    for index, apk in enumerate(sorted(ROOT.glob('*.apk'))):
        with zipfile.ZipFile(apk) as archive:
            data = {}
            for name in ('DramaScriptInfo.dat', 'DramaTemplateTypeInfo.dat', 'DramaHeadTemplateInfo.dat'):
                member = next((n for n in archive.namelist() if n.endswith('/config/' + name)), None)
                if member:
                    data[name] = archive.read(member)
            sources.append(('apk_' + apk.stem, data))
    for label, data in sources:
        result = {}
        for name, parser in [('DramaTemplateTypeInfo.dat', templates), ('DramaHeadTemplateInfo.dat', heads)]:
            result[name] = parser(data[name])
        errors = []
        for additions in (True, False):
            try:
                result['DramaScriptInfo.dat'] = scripts(data['DramaScriptInfo.dat'], additions)
                break
            except Exception as error:
                errors.append(str(error))
        else:
            raise RuntimeError((label, errors))
        save(label + '.json', result)
        rows = result['DramaScriptInfo.dat']
        summary = {'source': label, 'counts': {k: len(v) for k,v in result.items()},
                   'entries': sum(len(r['entries']) for r in rows), 'variants': dict(Counter(r['variant'] for r in rows)),
                   'additions_layout': additions,
                   'hashes': {k: hashlib.sha256(v).hexdigest() for k,v in data.items()}}
        summaries.append(summary)
        print(json.dumps(summary, ensure_ascii=False))
    save('sources.json', summaries)


def inspect():
    data = json.loads((OUT / 'patch.json').read_text('utf-8'))
    ts = {t['id']: t for t in data['DramaTemplateTypeInfo.dat']}
    used = Counter(e['template_id'] for d in data['DramaScriptInfo.dat'] for e in d['entries'])
    print('TEMPLATES')
    for tid, count in used.most_common():
        print(count, ts.get(tid, {'missing': tid}))
    print('HEAD SAMPLES', data['DramaHeadTemplateInfo.dat'][:12])
    print('SCRIPT SAMPLES', json.dumps(data['DramaScriptInfo.dat'][:3], ensure_ascii=False))
    print('ADDITIONS', Counter(a['key'] for d in data['DramaScriptInfo.dat'] for e in d['entries'] for a in e['additions']))
    for path in sorted(OUT.glob('r_GetDramaEntry*.asm.txt')):
        if 'Name' in path.name or 'Additional' in path.name:
            continue
        lines = path.read_text().splitlines()
        print('\nGETTER', path.name)
        for index, line in enumerate(lines):
            if 'getItemERKjb' in line:
                print('\n'.join(lines[index:index + 18]))


def audit():
    from decode_configs import parse_string_table
    from export_level_enemy_data import parse_chapters, parse_chapter_levels
    from stage_assets import StageAssets
    data = json.loads((OUT / 'patch.json').read_text('utf-8'))
    ts = {t['id']: t for t in data['DramaTemplateTypeInfo.dat']}
    hs = {h['id']: h for h in data['DramaHeadTemplateInfo.dat']}
    # Native RawDataSet uses a unique (id, variant) key: first record wins.
    ds = {}
    for d in data['DramaScriptInfo.dat']:
        ds.setdefault(d['id'], d)
    strings = {}
    for root in ['Resources/config', 'patch/_1.18/config']:
        strings.update({x['string_id']: x['strings'][0] if x['strings'] else ''
                        for x in parse_string_table(ROOT / root / 'StringTableInfo.dat')})
    entries = [e for d in ds.values() for e in d['entries']]
    modes = Counter(ts[e['template_id']]['mode'] for e in entries)
    summaries = [d['id'] for d in ds.values() if all(ts[e['template_id']]['mode'] == 'PLOT_DESC' for e in d['entries'])]
    chapters = parse_chapters(config_path('ChapterInfo.dat'))
    levels = parse_chapter_levels(config_path('ChapterLevelInfo.dat'))
    chapter_by_level = defaultdict(list)
    for chapter in chapters:
        for lid in chapter['level_ids']:
            chapter_by_level[lid].append({
                'id': chapter['chapter_id'], 'name': strings.get(chapter['name_string_id']),
                'title': strings.get(chapter['title_string_id']), 'mode': chapter['mode_code']})
    links = []
    for level in levels:
        for entry in level['drama_scripts']:
            links.append({'level': level['level_id'], 'name': strings.get(level['name_string_id']),
                          'chapters': chapter_by_level[level['level_id']], **entry})
    linked = {x['script_id'] for x in links}
    save('chapter_story_links.json', links)
    save('unlinked_scripts.json', [d for d in ds.values() if d['id'] not in linked])

    assets = StageAssets(check=True)
    ui_codes = {ts[e['template_id']]['field_50'] for e in entries if ts[e['template_id']]['field_50']}
    ui_codes.update(['dhjm-008', 'dhjm-009', 'dhjm-010'])
    images = []
    for code in sorted(ui_codes):
        im = assets.image(code)
        images.append({'code': code, 'style': assets.styles.get(code), 'size': list(im.size) if im else None})
    assets.close()
    used_heads = {e['head_id'] for e in entries if ts[e['template_id']]['field_48'] != 0 and e['head_id']}
    used_models = {hs[x]['field_04'] for x in used_heads}
    model_roots = ['patch/_1.18/modelConfig', 'package/preinitial/modelConfig', 'Resources/modelConfig']
    art_roots = ['patch/_1.18/char', 'package/preinitial/char', 'Resources/char']
    live_roots = ['patch/_1.18/live', 'package/preinitial/live', 'Resources/live']
    models = []
    for mid in sorted(used_models):
        rmc = next((ROOT / root / f'{mid}.rmc' for root in model_roots if (ROOT / root / f'{mid}.rmc').is_file()), None)
        item = {'id': mid, 'rmc': str(rmc.relative_to(ROOT)) if rmc else None, 'directories': [], 'assets': []}
        if rmc:
            values = sorted(set(re.findall(rb'[A-Za-z0-9_./-]{3,}', rmc.read_bytes())))
            item['references'] = [v.decode() for v in values]
            dirs = [v.decode() for v in values if v.endswith(b'_a')]
            item['directories'] = dirs
            for directory in dirs:
                for root in art_roots + live_roots:
                    folder = ROOT / root / directory
                    if folder.is_dir():
                        item['assets'].append({'folder': str(folder.relative_to(ROOT)),
                            'files': [str(p.relative_to(folder)) for p in folder.rglob('*') if p.is_file()]})
        models.append(item)
    save('model_assets.json', models)
    missing_heads = sorted(used_heads - hs.keys())
    result = {
        'counts': {'script_records': len(ds), 'entries': len(entries), 'summary_only_records': len(summaries),
            'other_script_records': len(ds) - len(summaries), 'entry_modes': dict(modes),
            'chapter_links': len(links), 'chapter_link_modes': dict(Counter(x['mode_code'] for x in links)),
            'linked_unique_scripts': len(linked), 'unlinked_scripts': len(ds.keys() - linked),
            'used_heads': len(used_heads), 'used_models': len(used_models)},
        'missing_templates': sorted({e['template_id'] for e in entries} - ts.keys()),
        'missing_heads': missing_heads,
        'missing_head_names': sorted({hs[x]['field_08'] for x in used_heads} - strings.keys()),
        'missing_linked_scripts': sorted(linked - ds.keys()),
        'models_without_local_rmc': [x['id'] for x in models if not x['rmc']],
        'models_without_local_art_folder': [x['id'] for x in models if not x['assets']],
        'ui_assets': images,
        'used_heads': [{**hs[x], 'name': strings.get(hs[x]['field_08'])} for x in sorted(used_heads)],
        'summary_only_script_ids': summaries,
    }
    save('audit.json', result)
    print(json.dumps({k:v for k,v in result.items() if k not in ['ui_assets','used_heads','summary_only_script_ids']}, ensure_ascii=False, indent=2))
    print('UI assets:', len(images), 'Missing:', [x['code'] for x in images if not x['size']])
    print('First links:', json.dumps(links[:8], ensure_ascii=False))
    print('First heads:', json.dumps(result['used_heads'][:10], ensure_ascii=False))


def details():
    import xml.etree.ElementTree as ET
    data = json.loads((OUT / 'patch.json').read_text('utf-8'))
    ts = {t['id']: t for t in data['DramaTemplateTypeInfo.dat']}
    ds = data['DramaScriptInfo.dat']
    ids = Counter(d['id'] for d in ds)
    print('Duplicate scripts:', json.dumps([d for d in ds if ids[d['id']] > 1], ensure_ascii=False))
    print('Missing UI template:', [t for t in ts.values() if t['field_50'] == 'swct-003'])
    models = json.loads((OUT / 'model_assets.json').read_text('utf-8'))
    classifications = defaultdict(list)
    for m in models:
        files = [f for a in m['assets'] for f in a['files']]
        typ = 'live' if any(f.endswith('.model3.json') for f in files) else 'static' if any(f.endswith('.xml') for f in files) else 'other'
        classifications[typ].append(m['id'])
        m['kind'] = typ
        if typ == 'static':
            a = next(a for a in m['assets'] if any(f.endswith('.xml') for f in a['files']))
            name = next(f for f in a['files'] if f.endswith('.xml'))
            root = ET.parse(ROOT / a['folder'] / name).getroot()
            m['animation_names'] = [x.attrib for x in root.findall('.//mov')]
            m['armature_bones'] = [x.attrib for x in root.findall('./armatures/armature/b')]
    save('model_details.json', models)
    print('Model kinds:', {k:len(v) for k,v in classifications.items()})
    print('Live models:', classifications['live'])
    print('Model 11301:', json.dumps(next(m for m in models if m['id'] == 11301), ensure_ascii=False))
    for filename in ['SoundEffectInfo.dat', 'MusicInfo.dat']:
        rows = Reader(config_path(filename).read_bytes()).records(lambda r: {'id': r.u32(), 'code': r.cstring(), 'resource': r.cstring()})
        save(filename + '.json', rows)
        used = {t['field_a0' if filename.startswith('Sound') else 'field_88'] for t in ts.values() if t['id'] in {e['template_id'] for d in ds for e in d['entries']}}
        used.discard('')
        if filename.startswith('Sound'):
            used.add('qiehuanjuqing')
        selected = [r for r in rows if r['code'] in used]
        print(filename, 'Used:', selected, 'MissingCodes:', used - {r['code'] for r in selected})
    audit = json.loads((OUT/'audit.json').read_text('utf-8'))
    print('Backgrounds:', [x for x in audit['ui_assets'] if x['code'] in {t['field_50'] for t in ts.values() if t['mode']=='CHANGE_BG'}])


def verify_visuals():
    import plistlib
    import xml.etree.ElementTree as ET
    from PIL import Image
    from export_ui_images import sprite_image
    models = json.loads((OUT / 'model_assets.json').read_text('utf-8'))
    result = []
    for m in models:
        if m['id'] == 0:
            result.append({'id': 0, 'kind': 'intentionally_no_model'})
            continue
        sheets = [v for v in m['references'] if '__200' in v]
        selected = None
        for a in m['assets']:
            folder = ROOT / a['folder']
            for sheet in sheets:
                if (folder / (sheet+'.plist')).is_file() and (folder / (sheet+'.pn_')).is_file():
                    meta = plistlib.loads((folder/(sheet+'.plist')).read_bytes())
                    im = Image.open(folder/(sheet+'.pn_')).convert('RGBA')
                    frames = []
                    for key, frame in meta['frames'].items():
                        crop = sprite_image(im, frame)
                        assert crop.getbbox() is not None, (m['id'], key)
                        frames.append({'key': key, 'size': list(crop.size)})
                    xmlfile = folder / (m['directories'][0]+'.xml')
                    xml = ET.parse(xmlfile).getroot() if xmlfile.is_file() else None
                    selected = {'id': m['id'], 'kind': 'static', 'folder': a['folder'],
                                'sheet': sheet, 'frames': frames, 'xml': str(xmlfile.relative_to(ROOT)) if xml is not None else None,
                                'actions': [x.attrib.get('name') for x in xml.findall('.//mov')] if xml is not None else []}
                    break
            if selected:
                break
        if selected is None:
            for a in m['assets']:
                folder = ROOT / a['folder']
                settingsfile = next((folder/f for f in a['files'] if f.endswith('.model3.json')), None)
                if not settingsfile:
                    continue
                settings = json.loads(re.sub(r',\s*([}\]])', r'\1', re.sub(r'("(?:[^"\\]|\\.)*")(\s*)(")', r'\1,\2\3', settingsfile.read_text('utf-8'))))
                refs = settings['FileReferences']
                required = [refs['Moc'], *refs['Textures']]
                optional = [e['File'] for e in refs.get('Expressions', [])]
                optional.extend(e['File'] for group in refs.get('Motions', {}).values() for e in group)
                # A patch manifest may reference unchanged files in preinitial.
                # Resolve every dependency through the same overlay precedence.
                roots = [ROOT/root/'live'/folder.name for root in ('patch/_1.18','package/preinitial','Resources')]
                def resolve_file(f):
                    return next((root/f for root in roots if (root/f).is_file()), None)
                selected = {'id':m['id'], 'kind':'live', 'model':str(settingsfile.relative_to(ROOT)),
                            'missing_required':[f for f in required if not resolve_file(f)],
                            'missing_expression_motion':[f for f in optional if not resolve_file(f)],
                            'resolved_dependencies':{f:str(resolve_file(f).relative_to(ROOT)) for f in required+optional if resolve_file(f)},
                            'expressions':[e['Name'] for e in refs.get('Expressions', [])],
                            'motion_groups':{k:len(v) for k,v in refs.get('Motions', {}).items()}}
                for texture in refs['Textures']:
                    if resolve_file(texture):
                        with Image.open(resolve_file(texture)) as img:
                            img.verify()
                break
        result.append(selected or {'id':m['id'], 'kind':'unresolved'})
    save('verified_visual_assets.json', result)
    print('Asset verification:', dict(Counter(x['kind'] for x in result)))
    print('Missing:', [x for x in result if x['kind']=='unresolved' or x.get('missing_required') or x.get('missing_expression_motion')])
    print('Static multiple frames:', [{'id':x['id'], 'frames':len(x['frames']), 'actions':x['actions']} for x in result if x['kind']=='static' and len(x['frames'])>1][:12])
    print('Sample RMC bytes:', repr((ROOT/'patch/_1.18/modelConfig/11301.rmc').read_bytes()[:600]))


def visual_chain():
    """Materialize a silent, data-only scene-state trace; no application/player edits."""
    from copy import deepcopy
    data = json.loads((OUT/'patch.json').read_text('utf-8'))
    audit = json.loads((OUT/'audit.json').read_text('utf-8'))
    ts = {t['id']:t for t in data['DramaTemplateTypeInfo.dat']}
    hs = {h['id']:h for h in audit['used_heads']}
    ds = {}
    for d in data['DramaScriptInfo.dat']:
        ds.setdefault(d['id'],d)
    models = {m['id']:m for m in json.loads((OUT/'verified_visual_assets.json').read_text('utf-8'))}
    assets = {x['code']:x for x in audit['ui_assets']}
    state = {'background': None, 'left':None, 'right':None}
    frames = []
    for sid in [1,2,3]:
        for i,e in enumerate(ds[sid]['entries'],1):
            t = ts[e['template_id']]
            mode = t['mode']
            side = 'left' if t['field_48']==1 else 'right'
            event = {'script_id':sid, 'index':i, 'mode':mode}
            if mode == 'CHANGE_BG':
                state['background'] = assets[t['field_50']]
                event['transition_ms'] = 300
            elif mode == 'HEAD_DISAPPEAR':
                if t['field_48']==0:
                    state['left']=state['right']=None
                else:
                    state[side]=None
            elif mode in ['HEAD','PLAYER_HEAD','AUTO_HEAD','RICH_HEAD','AUTO_RICH_HEAD']:
                h=hs[e['head_id']]
                state[side]={'head_id':h['id'], 'model_id':h['field_04'], 'name':h['name'],
                             'expression_id':h['field_0c'], 'action_id':h['field_10'],
                             'asset_kind':models[h['field_04']]['kind']}
                event.update(text=e['text'], speaker='玩家设定的指挥官姓名' if mode=='PLAYER_HEAD' else h['name'], active_side=side,
                             dialogue_style=assets[t['field_50']], advance='click')
            elif mode=='VOICE_OVER':
                event.update(text=e['text'],speaker=None,active_side=None,dialogue_style=assets['dhjm-010'],advance='click')
            else:
                # Preserve source information but do not invoke any game callbacks.
                event.update(skipped_in_silent_visual_trace=True)
            event['state']=deepcopy(state)
            frames.append(event)
    save('opening_visual_chain.json', {'purpose':'offline source/data chain verification, not a rendered player',
        'audio':False, 'script_queue':[1,2,3], 'events':frames})
    links=json.loads((OUT/'chapter_story_links.json').read_text('utf-8'))
    bgcodes={t['field_50'] for d in ds.values() for e in d['entries'] for t in [ts[e['template_id']]] if t['mode']=='CHANGE_BG'}
    manifest={
        'scope':'Silent story archive: backgrounds, character art, names, dialogue; no audio; production application unchanged',
        'sources':{'scripts':'patch/_1.18/config/DramaScriptInfo.dat', 'templates':'patch/_1.18/config/DramaTemplateTypeInfo.dat',
                   'heads':'patch/_1.18/config/DramaHeadTemplateInfo.dat','player':'patch/_1.18/RanaScripts/ui/NoviceUI.lua',
                   'chapter_order':'patch/_1.18/RanaScripts/ui/ChapterUI.lua:8444'},
        'raw_records':len(data['DramaScriptInfo.dat']), 'unique_script_ids':len(ds),
        'duplicate_id':371, 'duplicate_policy':'Native unique-key insertion retains first record; both raw records preserved in patch.json',
        'summary_only_records':audit['counts']['summary_only_records'],
        'dialogue_or_command_records':audit['counts']['other_script_records'],
        'background_count':len(bgcodes), 'missing_backgrounds':[c for c in bgcodes if not assets[c]['size']],
        'models':dict(Counter(x['kind'] for x in models.values())),
        'missing_visual_dependencies':[x['id'] for x in models.values() if x['kind']=='unresolved' or x.get('missing_required')],
        'missing_expression_motion_dependencies':[x['id'] for x in models.values() if x.get('missing_expression_motion')],
        'chapter_links':len(links),'unique_linked_scripts':len({x['script_id'] for x in links}),
        'missing_linked_scripts':audit['missing_linked_scripts'],
        'edge_cases':[
            'PLOT_DESC entries are plot summaries, not visible dialogue steps.',
            '89 script IDs have no ChapterLevelInfo link; tutorial/event direct calls require separate indexing.',
            'Model 0 is an intentionally unseen speaker (e.g. ???), not a missing portrait.',
            'Some script fragments inherit background/character state; standalone entry requires pre-roll/context.',
            'The optional GAIN item illustration swct-003 is unavailable in the current UI asset resolver; not a background/portrait.',
            'Live2D renders require resolving the patch + preinitial overlay per file, not just per directory.',
            'No full browser playback or pixel-level equivalence claimed; this stage verifies source logic/data/asset dependencies.'
        ]}
    save('silent_story_findings.json',manifest)
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
    print('Opening sample:',json.dumps([f for f in frames if f.get('text')][:3],ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['trace', 'decode', 'inspect', 'audit', 'details', 'verify_visuals', 'visual_chain'])
    args = parser.parse_args()
    globals()[args.action]()
