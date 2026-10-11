"""Build the silent story archive from native drama tables (no account callbacks)."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import plistlib
import re
from PIL import Image
from decode_configs import Reader, config_path, parse_string_table, parse_role_models
from export_level_enemy_data import parse_chapter_levels
from research_story_chain import scripts, templates, heads
from stage_assets import StageAssets
from export_ui_images import sprite_image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT/'steel-maiden-browser/public'
OUT = PUBLIC/'data/stories'
ART = PUBLIC/'art/stories'
RESEARCH = ROOT/'analysis_apk/story_research'
DIALOGUE = {'HEAD','PLAYER_HEAD','AUTO_HEAD','RICH_HEAD','AUTO_RICH_HEAD'}
# These models reuse unrelated icons in roleModelInfo.resource_a. Crop only the
# verified model's own portrait, preserving gender/outfit selection per script.
PORTRAIT_AVATAR_CROPS = {
    11301: {'x':50,'y':0,'size':250,'sourceWidth':320},  # Yellow male commander.
    11307: {'x':100,'y':0,'size':300,'sourceWidth':408},  # Deadwater sentries A-E.
    11308: {'x':260,'y':0,'size':300,'sourceWidth':806},  # Alice, blue uniform.
    11309: {'x':260,'y':0,'size':300,'sourceWidth':806},  # Alice, red uniform.
    11310: {'x':140,'y':0,'size':320,'sourceWidth':490},  # Rebbe.
    11311: {'x':90,'y':0,'size':320,'sourceWidth':892},  # Rommel.
    11315: {'x':235,'y':0,'size':310,'sourceWidth':870},  # Sickleaf Grey.
    11319: {'x':0,'y':0,'size':285,'sourceWidth':285},  # Claire, normal.
    11320: {'x':95,'y':0,'size':250,'sourceWidth':522},  # Lawrence, normal.
    11322: {'x':95,'y':0,'size':250,'sourceWidth':522},  # Lawrence, alternate expression.
    11323: {'x':0,'y':0,'size':285,'sourceWidth':285},  # Claire, alternate expression.
    11324: {'x':0,'y':0,'size':285,'sourceWidth':285},  # Claire, alternate expression.
    11325: {'x':110,'y':0,'size':280,'sourceWidth':427},  # Special Service officers A-F/unknown.
    11327: {'x':630,'y':0,'size':310,'sourceWidth':1378},  # Adams.
    11331: {'x':100,'y':0,'size':290,'sourceWidth':525},  # Phoenix.
    11332: {'x':110,'y':0,'size':290,'sourceWidth':545},  # Dwight.
    11333: {'x':35,'y':0,'size':280,'sourceWidth':459},  # General de Gaulle, NOT Alice.
}
# These native icon fields are placeholders on unrelated story-only models.
# Never silently borrow them for a newly added NPC; require a reviewed crop.
RESERVED_AVATAR_MODELS = {'ctx-163': {11304}, 'ctx-026': {6120}}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',',':'))+'\n', 'utf-8')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    ts = {t['id']: t for t in templates(config_path('DramaTemplateTypeInfo.dat').read_bytes())}
    hs = {h['id']: h for h in heads(config_path('DramaHeadTemplateInfo.dat').read_bytes())}
    ds = {}
    raw_scripts = scripts(config_path('DramaScriptInfo.dat').read_bytes())
    for d in raw_scripts:
        ds.setdefault(d['id'],d)  # Same unique-key behavior as native RawDataSet.
    strings = {}
    for root in ['Resources/config','patch/_1.18/config']:
        strings.update({x['string_id']: x['strings'][0] if x['strings'] else '' for x in parse_string_table(ROOT/root/'StringTableInfo.dat')})
    roles = {r['role_model_id']:r for r in parse_role_models(config_path('roleModelInfo.dat'))}
    expressions = {r['id']:r['name'] for r in Reader(config_path('charExpression.dat').read_bytes()).records(lambda r:{'id':r.u32(),'name':r.cstring()})}
    stage = json.loads((PUBLIC/'data/stage-catalog.json').read_text('utf-8'))
    levels = {l['level_id']:l for l in parse_chapter_levels(config_path('ChapterLevelInfo.dat'))}
    visual = {m['id']:m for m in json.loads((RESEARCH/'verified_visual_assets.json').read_text('utf-8'))}
    assets = StageAssets(check=True)
    exported = {}
    def ui(code):
        if not code:
            return ''
        if code in exported:
            return exported[code]
        image = assets.image(code)
        if image is None:
            exported[code] = ''
            return ''
        filename = re.sub(r'[^A-Za-z0-9_.-]','_',code)+'.webp'
        image.save(ART/filename,'WEBP',quality=93)
        exported[code] = '/art/stories/'+filename
        return exported[code]
    used_heads = {e['head_id'] for d in ds.values() for e in d['entries'] if ts[e['template_id']]['mode'] in DIALOGUE}
    used_heads.discard(0)
    jobs = {}
    characters = {0:{'id':0,'modelId':0,'name':'？？？','expressionId':0,'actionId':0,'image':'','avatar':'','avatarFromPortrait':False}}
    for hid in sorted(used_heads):
        h=hs[hid]; mid=h['field_04']; exp=h['field_0c']
        icon_code = roles.get(mid,{}).get('resource_a','') if mid else ''
        if (icon_code in RESERVED_AVATAR_MODELS and
                mid not in RESERVED_AVATAR_MODELS[icon_code] and
                mid not in PORTRAIT_AVATAR_CROPS):
            raise ValueError(f'Story model {mid} borrows reserved avatar {icon_code}; review its portrait crop')
        avatar = ui(icon_code)
        image = ''
        if mid:
            source = visual[mid]
            if source['kind']=='static':
                key=str(mid)
                target=ART/(key+'.webp')
                if not target.exists():
                    folder=ROOT/source['folder']; sheet=source['sheet']
                    frames=plistlib.loads((folder/(sheet+'.plist')).read_bytes())['frames']
                    original=Image.open(folder/(sheet+'.pn_')).convert('RGBA')
                    im=sprite_image(original,next(iter(frames.values())))
                    im=im.crop(im.getbbox())
                    im.thumbnail((1400,1400))
                    im.save(target,'WEBP',quality=94)
            else:
                key=f'{mid}-{exp}'
                model=Path(source['model'])
                # Build an overlay directory for the two patch-only model manifests.
                cache=ROOT/'steel-maiden-browser/.cache/story-models'/str(mid)
                cache.mkdir(parents=True, exist_ok=True)
                settings=json.loads(re.sub(r',\s*([}\]])',r'\1',re.sub(r'("(?:[^"\\]|\\.)*")(\s*)(")',r'\1,\2\3',(ROOT/model).read_text('utf-8'))))
                refs=settings['FileReferences']
                # Only model/texture/expression data: no sound or physics side files.
                refs.pop('Sounds',None); refs.pop('Physics',None); refs.pop('Pose',None)
                refs.pop('UserData',None); refs.pop('DisplayInfo',None); refs.pop('Motions',None)
                for relative, original in source['resolved_dependencies'].items():
                    if relative.startswith('motions/'):
                        continue
                    target=cache/relative
                    target.parent.mkdir(parents=True,exist_ok=True)
                    if not target.exists():
                        target.write_bytes((ROOT/original).read_bytes())
                write(cache/model.name,settings)
                name=expressions.get(exp,'normal')
                jobs[key]={'id':key,'modelPath':str(cache/model.name),'expression':name,
                           'outputPath':str(ROOT/'steel-maiden-browser/.cache/story-renders'/(key+'.png'))}
            image='/art/stories/'+key+'.webp'
        characters[hid]={'id':hid,'modelId':mid,'name':strings.get(h['field_08'],'？？？'),
                          'expressionId':exp,'actionId':h['field_10'],'image':image,'avatar':avatar,
                          'avatarFromPortrait':not bool(avatar)}
        if mid in PORTRAIT_AVATAR_CROPS:
            # Keep the original portrait intact; the reader crops its head in CSS.
            characters[hid].update(avatar=image, avatarFromPortrait=True,
                                   avatarCrop=PORTRAIT_AVATAR_CROPS[mid])
    write(RESEARCH/'story_render_jobs.json',list(jobs.values()))
    dialogue_assets={code:ui(code) for code in ['dhjm-008','dhjm-009','dhjm-010']}
    linked=set(); maps=[]; summary_count=0
    context_background={}
    def export_map(meta, segments):
        nonlocal summary_count
        frames=[]; sections=[]; summaries=[]
        state={'background':context_background.get(meta['mode'],'') or ui('zjm-047'),'left':None,'right':None}
        for segment in segments:
            start=len(frames)
            pending_shake=False
            for sid in segment['scripts']:
                for ei,e in enumerate(ds[sid]['entries']):
                    t=ts[e['template_id']]; mode=t['mode']; side='left' if t['field_48']==1 else 'right'
                    if mode=='PLOT_DESC':
                        if e['text'] and e['text'] not in summaries:
                            summaries.append(e['text'])
                        continue
                    if mode=='CHANGE_BG':
                        state['background']=ui(t['field_50']); continue
                    if mode=='HEAD_DISAPPEAR':
                        if t['field_48']==0: state['left']=state['right']=None
                        else: state[side]=None
                        continue
                    if mode=='SHAKE': pending_shake=True; continue
                    if mode in DIALOGUE:
                        hid=e['head_id']; state[side]=hid
                        frame={'kind':'dialogue','head':hid,'speaker':characters[hid]['name'],
                               'player':mode=='PLAYER_HEAD','side':side,'dialogue':ui(t['field_50'])}
                    elif mode=='VOICE_OVER':
                        frame={'kind':'narration','head':None,'speaker':'','side':None,'dialogue':ui('dhjm-010')}
                    elif mode=='GAIN' and e['text']:
                        frame={'kind':'notice','head':None,'speaker':'','side':None,'dialogue':ui('dhjm-010'),'item':ui(t['field_50'])}
                    else:
                        # Audio, achievements, account callbacks, metadata are not reader steps.
                        continue
                    frame.update(id=f'{segment["id"]}:{sid}:{ei}',scriptId=sid,text=e['text'].rstrip(),
                                 **deepcopy(state),section=len(sections),shake=pending_shake)
                    pending_shake=False
                    frames.append(frame)
            if len(frames)>start:
                sections.append({**segment,'start':start,'count':len(frames)-start})
        if not frames and not summaries:
            return
        context_background[meta['mode']]=state['background']
        summary_count+=not bool(frames)
        record={k:meta[k] for k in ['id','name','category','group','volume','code','image','imageKind','mode','simulation']}
        record.update(frameCount=len(frames),sectionCount=len(sections),summaryOnly=not bool(frames),preview=(summaries[0] if summaries else frames[0]['text'])[:130])
        maps.append(record)
        write(OUT/(str(meta['id'])+'.json'),{'schemaVersion':1,'id':meta['id'],'sections':sections,'frames':frames,'summaries':summaries})
    # Opening dialogue is triggered by the tutorial, before the first demo battle.
    opening={'id':-10000,'name':'序幕 · 莱茵河谷','category':'prologue','group':'初次相逢','mode':'PROLOGUE',
             'volume':None,'code':'序幕','image':ui('zjm-156'),'imageKind':'map','simulation':False}
    export_map(opening,[{'id':'opening','name':'启程','scripts':[1,2,3]}]); linked.update([1,2,3])
    for meta in stage['maps']:
        segments=[]
        for ni,lid in enumerate(meta['nodes']):
            refs=levels[lid]['drama_scripts']
            for phase,label in [('OPENING','开场'),('PROLOGUE','战前'),('EPILOGUE','战后')]:
                ids=[r['script_id'] for r in refs if r['mode_code']==phase]
                if ids:
                    name=stage['nodes'][str(lid)]['name']
                    label=f'第 {ni+1} 战 · {label}' if name=='战斗节点' else f'{name} · {label}'
                    segments.append({'id':f'{lid}-{phase}','name':label,'scripts':ids})
                    linked.update(ids)
        export_map(meta,segments)
    # Keep unmatched source scripts discoverable, explicitly not invented chapter assignments.
    unlinked=[]
    for sid in sorted(ds.keys()-linked):
        d=ds[sid]
        texts=[e['text'] for e in d['entries'] if ts[e['template_id']]['mode'] in DIALOGUE|{'VOICE_OVER'} and e['text']]
        if not texts: continue
        mid=-20000-sid
        meta={'id':mid,'name':f'独立片段 #{sid}','category':'appendix','group':'未归入关卡的剧情','mode':f'UNLINKED-{sid}',
              'volume':None,'code':str(sid),'image':ui('zjm-047'),'imageKind':'map','simulation':False}
        export_map(meta,[{'id':f'script-{sid}','name':f'原始脚本 {sid}','scripts':[sid]}]); unlinked.append(sid)
    categories=[{'id':'prologue','name':'序幕','description':'从莱茵河谷启程','image':ui('zjm-156'),'titleImage':''},*stage['categories'],
                {'id':'appendix','name':'剧情附录','description':'引导、独立片段及未归类关卡','image':ui('zjm-090'),'titleImage':''}]
    categories=[{**c,'mapCount':sum(m['category']==c['id'] for m in maps)} for c in categories]
    categories=[c for c in categories if c['mapCount']]
    catalog={'schemaVersion':1,'categories':categories,'maps':maps,'characters':characters,'dialogues':dialogue_assets,
             'meta':{'rawScripts':len(raw_scripts),'uniqueScripts':len(ds),'summaryMaps':summary_count,'unlinkedScripts':unlinked,'audio':False}}
    write(PUBLIC/'data/story-catalog.json',catalog)
    assets.close()
    print(json.dumps({'maps':len(maps),'frames':sum(m['frameCount'] for m in maps),'characters':len(characters),
                      'liveRenders':len(jobs),'categories':[(c['name'],c['mapCount']) for c in categories],
                      'expressions':expressions},ensure_ascii=False))

if __name__=='__main__': build()
