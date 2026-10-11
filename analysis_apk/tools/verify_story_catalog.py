"""Cross-check web reader lines against native binary scripts, without rebuilding."""
import json
from pathlib import Path
from decode_configs import config_path
from research_story_chain import scripts, templates

root = Path(__file__).resolve().parents[2]
data = root/'steel-maiden-browser/public/data'
catalog = json.loads((data/'story-catalog.json').read_text('utf-8'))
native = {}
for script in scripts(config_path('DramaScriptInfo.dat').read_bytes()):
    native.setdefault(script['id'], script)
types = {t['id']: t for t in templates(config_path('DramaTemplateTypeInfo.dat').read_bytes())}
dialogues = {'HEAD','AUTO_HEAD','PLAYER_HEAD','RICH_HEAD','AUTO_RICH_HEAD'}
checked = 0
for m in catalog['maps']:
    story = json.loads((data/'stories'/f'{m["id"]}.json').read_text('utf-8'))
    for f in story['frames']:
        sid, index = map(int, f['id'].rsplit(':',2)[1:])
        entry = native[sid]['entries'][index]
        template = types[entry['template_id']]
        assert f['text'] == entry['text'].rstrip(), f['id']
        assert template['mode'] in dialogues | {'VOICE_OVER','GAIN'}, f['id']
        if template['mode'] in dialogues:
            assert f['head'] == entry['head_id'], f['id']
            assert f['side'] == ('left' if template['field_48']==1 else 'right'), f['id']
            assert f['player'] == (template['mode']=='PLAYER_HEAD'), f['id']
        checked += 1
    for section in story['sections']:
        expected = [(sid, i) for sid in section['scripts'] for i,e in enumerate(native[sid]['entries'])
                    if types[e['template_id']]['mode'] in dialogues | {'VOICE_OVER'}
                    or (types[e['template_id']]['mode']=='GAIN' and e['text'])]
        actual = [tuple(map(int,f['id'].rsplit(':',2)[1:])) for f in story['frames'][section['start']:section['start']+section['count']]]
        assert actual == expected, section['id']
print(f'Native story verification passed: {checked} lines; content, side, speaker id and order match binary scripts.')
