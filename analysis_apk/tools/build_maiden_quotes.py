"""Export native dialogue and explicitly mapped recruitment stories."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

from decode_configs import Reader, config_path, parse_role_models, parse_string_table
from research_story_chain import scripts, templates, heads

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'steel-maiden-browser/public'
OUT = PUBLIC / 'data/maiden-quotes'
GROUPS = {
    'recruit': [(1003, '入队')],
    'honor': [(1029, '授勋')],
    'touch': [(1004, '主界面触摸'), (1034, '特殊触摸')],
    'battle': [(1011, '出征'), (1012, '攻击'), (1016, '轻伤'),
               (1015, '重伤'), (1024, '受击'), (1018, '撤退'),
               (1019, '胜利'), (1020, '失败'), (1002, '战斗对白')],
}
DIALOGUE = {'HEAD', 'PLAYER_HEAD', 'AUTO_HEAD', 'RICH_HEAD', 'AUTO_RICH_HEAD'}


def clean_text(text):
    # CardInfoUI/MainUI remove this timing/voice prefix before displaying text.
    return text.split('#VOICE#', 1)[-1].strip()


def decode_dialogue(path):
    """DialogueParamItem layout, verified at libasgame.so 0x8895d0."""
    r = Reader(path.read_bytes())
    model_id, name = r.u32(), r.cstring()
    items = []
    for index in range(r.u8()):
        flag, tags = r.u32(), r.vec_u32()
        texts = [r.cstring() for _ in range(r.u8())]
        additions = [r.cstring() for _ in range(r.u8())]
        expression, voice, param, motion = r.cstring(), r.cstring(), r.u32(), r.cstring()
        items.append({'index': index, 'tags': tags, 'text': clean_text(texts[0]) if texts else ''})
    if r.offset != len(r.data):
        raise ValueError(f'{path}: unread bytes at {r.offset}/{len(r.data)}')
    return {'modelId': model_id, 'name': name, 'items': items}


def recruitment_mapping():
    """Read FirstMeet -> MeetDrama arrays, not arbitrary DRAMA references."""
    results = []
    for name in ['MPUI.lua', 'PCUI.lua']:
        text = (ROOT / 'patch/_1.18/RanaScripts/ui' / name).read_text('utf-8')
        blocks = re.findall(r'Card_id_Array\[1\]\s*=\s*7001.*?"_MeetDrama_BT"', text, re.S)
        if len(blocks) != 1:
            raise ValueError(f'{name}: expected one recruitment story mapping')
        cards = dict(re.findall(r'Card_id_Array\[(\d+)\]\s*=\s*(\d+)', blocks[0]))
        dramas = dict(re.findall(r'drama_array\[(\d+)\]\s*=\s*(\d+)', blocks[0]))
        if cards.keys() != dramas.keys():
            raise ValueError(f'{name}: unmatched card/story array indices')
        results.append({int(card): int(dramas[i]) for i, card in cards.items()})
    if results[0] != results[1]:
        raise ValueError('Mobile/PC recruitment story mappings disagree')
    return results[0]


def read_stories(mapping):
    # Reuse the story archive's reviewed avatars, including portrait crops for NPCs.
    characters = json.loads((PUBLIC / 'data/story-catalog.json').read_text('utf-8'))['characters']
    ts = {t['id']: t for t in templates(config_path('DramaTemplateTypeInfo.dat').read_bytes())}
    hs = {h['id']: h for h in heads(config_path('DramaHeadTemplateInfo.dat').read_bytes())}
    ds = {}
    for d in scripts(config_path('DramaScriptInfo.dat').read_bytes()):
        ds.setdefault(d['id'], d)
    names = {}
    for directory in ['Resources/config', 'patch/_1.18/config']:
        names.update({r['string_id']: r['strings'][0] if r['strings'] else ''
                      for r in parse_string_table(ROOT / directory / 'StringTableInfo.dat')})
    result = {}
    for card_id, script_id in mapping.items():
        lines, used_characters = [], {}
        for index, entry in enumerate(ds[script_id]['entries']):
            mode = ts[entry['template_id']]['mode']
            # Do not silently truncate a future branch/continuation.
            if entry['additions']:
                raise ValueError(f'Review recruitment story additions: {script_id}/{index}')
            if mode in DIALOGUE:
                player = mode == 'PLAYER_HEAD'
                speaker = '指挥官' if player else names.get(hs[entry['head_id']]['field_08'], '？？？')
                kind = 'dialogue'
                head = entry['head_id']
                side = 'left' if ts[entry['template_id']]['field_48'] == 1 else 'right'
                character = characters[str(head)]
                used_characters[str(head)] = character
                for asset in [character['avatar'], character['image']]:
                    if asset and not (PUBLIC / asset.lstrip('/')).is_file():
                        raise FileNotFoundError(f'Missing story character asset: {asset}')
            elif mode == 'VOICE_OVER':
                speaker, kind = '旁白', 'narration'
                head, side, player = None, None, False
            elif mode == 'GAIN' and entry['text']:
                speaker, kind = '提示', 'notice'
                head, side, player = None, None, False
            else:
                continue  # No audio, visual instructions or account-side callbacks.
            text = clean_text(entry['text'])
            if text:
                lines.append({'id': f'{script_id}:{index}', 'kind': kind, 'speaker': speaker,
                              'text': text, 'head': head, 'side': side, 'player': player})
        if not lines:
            raise ValueError(f'Empty recruitment story: {script_id}')
        result[card_id] = {'scriptId': script_id, 'lines': lines, 'characters': used_characters}
    return result


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'


def build(check=False):
    rows = json.loads((PUBLIC / 'data/maidens.json').read_text('utf-8'))['rows']
    roles = {r['role_model_id']: r for r in parse_role_models(config_path('roleModelInfo.dat'))}
    stories = read_stories(recruitment_mapping())
    cache, sources, records = {}, {}, {}
    coverage = Counter()
    for maiden in rows:
        model_id = maiden['modelId']
        if model_id not in cache:
            # Native loader uses resource_b, not necessarily modelId.
            resource = roles[model_id]['resource_b']
            source = next((ROOT / directory / 'dialogueConfig' / f'{resource}.zh.dc'
                           for directory in ['patch/_1.18', 'Resources']
                           if (ROOT / directory / 'dialogueConfig' / f'{resource}.zh.dc').exists()), None)
            if not source:
                raise FileNotFoundError(f'No Chinese dialogue config: {model_id}/{resource}')
            cache[model_id] = decode_dialogue(source)
            sources[str(model_id)] = {'path': source.relative_to(ROOT).as_posix(),
                                      'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        groups = {}
        for category, tags in GROUPS.items():
            groups[category] = []
            for tag, label in tags:
                lines, seen = [], set()
                for item in cache[model_id]['items']:
                    text = item['text']
                    if tag in item['tags'] and text and text not in seen:
                        seen.add(text)
                        lines.append({'id': f'{model_id}:{item["index"]}', 'text': text})
                if lines:
                    groups[category].append({'tag': tag, 'label': label, 'lines': lines})
            coverage[category] += bool(groups[category])
        records[maiden['id']] = {
            'schemaVersion': 2, 'cardId': maiden['id'], 'modelId': model_id,
            'groups': groups, 'recruitmentStory': stories.get(maiden['id']),
        }
    if not stories.keys() <= records.keys():
        raise ValueError('Recruitment mapping has unknown card IDs')
    outputs = {OUT / f'{card_id}.json': record for card_id, record in records.items()}
    outputs[PUBLIC / 'data/maiden-quotes-index.json'] = {
        'schemaVersion': 2, 'cards': sorted(records), 'modelCount': len(cache),
        'coverage': dict(coverage),
        'recruitmentStories': {str(k): v['scriptId'] for k, v in stories.items()},
        'sources': sources,
    }
    for path, value in outputs.items():
        text = encode(value)
        if check:
            if not path.exists() or path.read_text('utf-8') != text:
                raise ValueError(f'Stale/missing generated file: {path}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, 'utf-8')
    print(json.dumps({'ok': True, 'checked': check, 'cards': len(records),
                      'models': len(cache), 'coverage': dict(coverage),
                      'recruitmentStories': len(stories)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
