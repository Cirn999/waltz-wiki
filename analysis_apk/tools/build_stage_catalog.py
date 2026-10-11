"""Export the stage archive from the active client tables (no enemy panel guesses).

Run from any directory. --check rebuilds in memory and verifies the committed JSON.
Native sources/semantics are documented in steel-maiden-browser/docs/stages.md.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from decode_configs import (config_path, parse_arranged_styles, parse_string_table,
    parse_unit_templates, parse_unit_appearances, parse_role_models, parse_skill_server,
    parse_capsule_types, parse_capsule_phases, APPEARANCE_TYPE_CHINESE)
from export_level_enemy_data import (parse_chapters, parse_chapter_levels, parse_deploy_templates,
    parse_award_tables, parse_award_pools, parse_award_groups, parse_fund_types)
from decode_scout_status import parse_fields
from inspect_magic_ordnance import parse_skill_info
from stage_assets import StageAssets, ROOT
from build_equipment_catalog import SLOT_ICON_CODES
from stage_requirements import attach_requirements
from stage_income import attach_income
from stage_map_details import attach_map_details
from stage_terrain_effects import build_terrain_effects

PUBLIC = ROOT/'steel-maiden-browser/public'
CATEGORIES = [
    # ChapterUI uses the gold titles; gkh-01/03 are legacy grey/disabled variants.
    ('campaign', '战役', '主线故事与战役', 'zj-116', 'zj-011'),
    ('event', '活动', '特别行动与物资补给', 'zj-079', 'zj-009'),
    ('assault', '突袭', '向未知区域推进', 'zj-124', 'zj-092'),
    ('air', '空袭', '空中作战与补给', 'zj-125', 'zj-120'),
    ('messenger', '信使计划', '追寻新的故事线索', 'zj-117', 'zj-118'),
    ('prison', '多福莱尼', '异国寻人与营救行动', 'zj-133', 'zj-131'),
]

def classify(mode):
    normal = mode.removeprefix('_SIM_')
    if re.fullmatch(r'VOL\d+', mode): return 'campaign', '主线战役'
    if mode == 'VOL_SPECIAL': return 'campaign', '特殊任务'
    if mode == 'VOL_FARM': return 'campaign', '战役捷径'
    for prefix, category in [('VOL_EXPANSION', 'assault'), ('VOL_AIRCRAFT', 'air'), ('VOL_PRISON', 'prison'), ('VOL_SENIOR', 'messenger')]:
        if normal.startswith(prefix): return category, '模拟关卡' if mode.startswith('_SIM_') else '普通关卡'
    if mode in ('DEMO', 'HIDDEN', 'UNLINKED'): return 'appendix', '客户端附录'
    for prefix, label in [('VOL_MATERIAL','材料行动'), ('VOL_FOOD','补给行动'), ('VOL_LUCKY_AL','特殊补给'),
            ('VOL_LUCKY','幸运行动'), ('VOL_POINTS','积分行动'), ('CHALLENGE','挑战行动'),
            ('CEREMONY_CARD','限时行动'), ('GATHER_MARK_NT','群岛任务'), ('GATHER_MARK','群岛任务'),
            ('_BACKUPARMY_GATHER_MARK','预备队任务')]:
        if mode.startswith(prefix): return 'event', label
    raise ValueError(f'Unclassified chapter mode: {mode}')

def build(check=False):
    assets = StageAssets(check=check)
    sources = {}
    def table(name, parser, key, overlay=False):
        rows = {}
        paths = [ROOT/'Resources/config'/name, ROOT/'patch/_1.18/config'/name] if overlay else [config_path(name)]
        for path in paths:
            if path.exists():
                rows.update({r[key]:r for r in parser(path)})
                sources[str(path.relative_to(ROOT)).replace('\\','/')] = hashlib.sha256(path.read_bytes()).hexdigest()
        return rows
    strings=table('StringTableInfo.dat',parse_string_table,'string_id',True)
    def text(sid): return (strings.get(sid,{}).get('strings') or [''])[0]
    chapters=table('ChapterInfo.dat',parse_chapters,'chapter_id')
    levels=table('ChapterLevelInfo.dat',parse_chapter_levels,'level_id')
    deploys=table('DeployTemplateInfo.dat',parse_deploy_templates,'deploy_template_id')
    units=table('UnitTemplateInfo.dat',parse_unit_templates,'unit_id')
    appearances=table('UnitAppearanceInfo.dat',parse_unit_appearances,'appearance_id')
    roles=table('roleModelInfo.dat',parse_role_models,'role_model_id')
    styles=table('ArrangedStyleInfo.dat',parse_arranged_styles,'arranged_style_id')
    fields=table('FieldImplementTypeInfo.dat',parse_fields,'field_type')
    skills=table('SkillInfo.dat',parse_skill_info,'skill_id')
    server=table('SkillServerInfo.dat',parse_skill_server,'skill_id')
    funds=table('FundTypeInfo.dat',parse_fund_types,'fund_id',True)
    awards=table('AwardTableInfo.dat',parse_award_tables,'award_table_id')
    pools=table('AwardPoolInfo.dat',parse_award_pools,'award_pool_id')
    groups=table('AwardGroupInfo.dat',parse_award_groups,'award_group_id')
    capsules=table('CapsuleTypeInfo.dat',parse_capsule_types,'capsule_type_id')
    first_phases=table('CapsulePhaseInfo.dat',lambda path:[p for p in parse_capsule_phases(path)[0] if p['phase']==1],'capsule_type_id')
    outfit_funds={f['raw_field_10']:f['fund_id'] for f in funds.values() if 84 in f['tags'] and f['raw_field_10']}
    capsules_by_tag={}
    for cid,capsule in capsules.items():
        for tag in capsule['group_b_ids']: capsules_by_tag.setdefault(tag,set()).add(cid)

    def outfit_icon(f,base_code):
        # ChapterUI.lua:2380-2404: outfit tag -> capsule -> generation-1 model
        # -> Head_Square, drawn over the resource-type-5 suitcase. The portrait
        # is NOT roleModel.resource_a (the wide list portrait).
        candidates={cid for tag in f['tags'] for cid in capsules_by_tag.get(tag,())}
        cid=f['raw_field_10']
        assert candidates=={cid}, f'Ambiguous outfit capsule for {f["fund_id"]}: {candidates}, linked {cid}'
        model=roles[appearances[first_phases[cid]['appearance_id']]['model_id']]
        heads={e['value'] for sid in model['group_b_ids'] for item in styles[sid]['items'] if item['mode_code']=='Head_Square' for e in item['string_entries'] if e['entry_id']==1}
        assert len(heads)==1, f'Missing/ambiguous square portrait for outfit {f["fund_id"]}: {heads}'
        head_code=next(iter(heads))
        base_image=assets.image(base_code); head_image=assets.image(head_code)
        assert base_image is not None and head_image is not None, f'Missing outfit image for {f["fund_id"]}'
        return {'capsuleId':cid,'headImage':assets.export(head_code),
            'baseSize':list(base_image.size),'headSize':list(head_image.size)}
    maidens=json.loads((PUBLIC/'data/maidens.json').read_text(encoding='utf-8'))['rows']
    class_icons={r['classId']:r['classIcon'] for r in maidens}
    def head(ap): return assets.export(roles.get(ap.get('model_id'),{}).get('resource_a',''))
    enemies={}
    for uid in sorted({u['unit_template_id'] for l in levels.values() for u in deploys[l['deploy_template_id']]['units']}):
        unit=units[uid]; ap=appearances[unit['appearance_id']]
        enemies[uid]={'id':uid,'name':text(ap['name_string_id']) or '未命名单位','level':unit['visible_level'],
            'className':APPEARANCE_TYPE_CHINESE.get(ap['unit_class_id'],'未知类别'),
            'classIcon':class_icons.get(ap['unit_class_id'],''),'image':head(ap)}
        assert enemies[uid]['image'], f'Missing enemy portrait {uid}'

    def values(sid,pid):
        return [c['int32'] for p in server[sid]['params'] if p['param_id']==pid for lv in p['levels'] if lv['level']==0 for c in lv['contents'] if 'int32' in c]
    field_effects=build_terrain_effects(fields,styles,text,assets)
    air_field_effects=build_terrain_effects(fields,styles,text,assets,scope='air')
    terrain={}
    for fid,f in fields.items():
        items=[i for s in f['style_ids'] for i in styles[s]['items']]
        names=[text(n['value']) for i in items if i['mode_code']=='TERRAIN_TEXT' for n in i['number_entries']]
        icon=next((e['value'] for i in items if i['mode_code']=='TERRAIN_ICON' for e in i['string_entries']),'')
        result={'id':fid,'name':''.join(names), 'image':assets.export(icon),
            'distances':[], 'distanceIcon':assets.export('pvp-012'),
            'altitudes':[], 'altitudeIcon':assets.export('jl-017'), 'effects':field_effects[fid],
            'airEffects':air_field_effects[fid]}
        for skill in f['carrying_skills']:
            sid=skill['skill_id']
            # ChapterUI's tag 3310 / jl-017 row is ALTITUDE, not another
            # horizontal distance. The UI shows the third-to-first range.
            for key,tag,pids in [('distances',3309,(3036,3039,3042)),('altitudes',3310,(5006,5009,5012))]:
                if tag not in skills[sid]['group_a_ids']: continue
                ds=[values(sid,p) for p in pids]
                if all(ds): result[key]=[v[0] for v in ds]
        assert len(result['distances'])==3, f'Missing battle distance for {fid}'
        assert len(result['altitudes'])==3 and result['altitudes']==sorted(result['altitudes'],reverse=True), f'Missing/unordered battle altitudes for {fid}'
        assert result['distanceIcon'] and result['altitudeIcon'], 'Missing native distance/altitude icon'
        terrain[fid]=result
    assert terrain[6]['distances']==[500,100,50]
    assert terrain[55]['distances']==[8000,5500,3000]

    slots={}
    for style in styles.values():
        for item in style['items']:
            if item['mode_code']!='SHEBEITUJIAN_PAGE': continue
            name=next((text(n['value']).replace(' ','') for n in item['number_entries'] if n['entry_id']==5),'')
            for tag in style['tags']:
                if tag in SLOT_ICON_CODES: slots[tag]={'name':name,'iconCode':SLOT_ICON_CODES[tag]}
    rewards={}; unresolved=Counter(); ignored=Counter()
    converted_capsules={}
    def reward(item):
        kind=item['item_type']; rid=item['values'][0]
        # Native generateAwardItem*: 0=Craft/account progression, 1=Fund/inventory,
        # 2=Capsule, 3=Quest, 4=Cooldown. Equal numeric IDs are NOT interchangeable.
        if kind not in (1,2):
            ignored[kind]+=1; return None
        if kind==2:
            # deployTag 3 is an experience/feed capsule, hidden by ChapterUI.
            if capsules[rid]['field_2']==3:
                ignored['experienceCapsule']+=1; return None
            # The stage archive displays outfits, never a direct recruit. Resolve
            # the associated outfit through its explicit FundTypeInfo capsule link,
            # not an ID offset, a name heuristic, or the experience-absorption table.
            outfit=outfit_funds.get(rid)
            if outfit is None:
                unresolved[f'capsuleOutfit:{rid}']+=1; return None
            key=reward({'item_type':1,'values':[outfit]}); converted_capsules[rid]=key
            return key
        key=f'fund:{rid}'
        if key in rewards: return key
        f=funds[rid]
        # r_GetFundType reads the uint32 after the tag vector (native offset 0x28),
        # NOT the earlier serialized byte called fund_type by the legacy decoder.
        if f['raw_field_5']!=5:
            ignored['nonPreviewFund']+=1; return None
        name=text(f['name_string_id']); image=''
        for resource in sorted(f['resources'],key=lambda x:x['resource_type']):
            image=assets.export(resource['resource'])
            if image: break
        label='舞装' if 84 in f['tags'] else '装备' if 83 in f['tags'] or 90 in f['tags'] else '物品'
        slot=next((slots[tag] for tag in f['tags'] if tag in slots),None) if label=='装备' else None
        assert label!='装备' or slot, f'Missing equipment slot for {rid}'
        if not name:
            unresolved[key]+=1;return None
        rewards[key]={'id':key,'name':name,'image':image,'kind':label,
            'slotName':slot['name'] if slot else '', 'slotIcon':assets.export(slot['iconCode']) if slot else ''}
        if label=='舞装':
            base_code=next(r['resource'] for r in f['resources'] if r['resource_type']==5)
            rewards[key]['image']=assets.export(base_code)
            rewards[key]['outfit']=outfit_icon(f,base_code)
        return key
    @lru_cache(maxsize=None)
    def table_rewards(tid):
        found=set()
        for t in awards[tid]['items']:
            if not t['raw_selector']: continue
            for branch in pools[t['award_pool_id']]['groups']:
                for pick in branch['items']:
                    # AwardTableInfoReader::getAwardGroup skips entries whose weight is zero.
                    if not pick['enabled_flag']: continue
                    for item in groups[pick['award_group_id']]['items']:
                        if not item['amount_or_weight']: continue
                        key=reward(item)
                        if key: found.add(key)
        return tuple(sorted(found))
    nodes={}
    def merge_scores(ranges):
        merged=[]
        for lo,hi in sorted(set(ranges)):
            assert 0 <= lo <= hi <= 100
            if merged and lo <= merged[-1][1]+1: merged[-1][1]=max(merged[-1][1],hi)
            else: merged.append([lo,hi])
        return merged
    for lid,l in levels.items():
        tids=l['award_table_ids']+[tid for a in l['assessment_awards'] for tid in a['award_table_ids']]
        loot=sorted({r for tid in tids for r in table_rewards(tid)},key=lambda k:({'装备':0,'舞装':1}.get(rewards[k]['kind'],2),int(k.split(':')[1])))
        scores={key:[] for key in loot}
        for low,high,branch in [(0,100,l['award_table_ids'])]+[(a['assessment_type'],a['assessment_value'],a['award_table_ids']) for a in l['assessment_awards']]:
            for tid in branch:
                for key in table_rewards(tid): scores[key].append((low,high))
        placements=deploys[l['deploy_template_id']]['units']
        nodes[lid]={'id':lid,'name':text(l['name_string_id']) or '战斗节点','fieldId':l['field_type'],
            'enemies':[{'id':u['unit_template_id'],'position':u['formation_position']} for u in placements],
            'drops':loot, 'dropScores':{key:merge_scores(ranges) for key,ranges in scores.items()}, 'hasRewardConfig':bool(tids)}
    # Retain unlinked nodes as an explicit appendix, never pretend they belong to a normal map.
    linked={lid for c in chapters.values() for lid in c['level_ids']}
    orphan_ids=sorted(levels.keys()-linked)
    if orphan_ids: chapters[-1]={'chapter_id':-1,'mode_code':'UNLINKED','name_string_id':0,'title_string_id':0,'background_resource':'','level_ids':orphan_ids}
    maps=[]; ordinals=Counter()
    for c in chapters.values():
        mode=c['mode_code']; category,group=classify(mode);ordinals[mode]+=1
        match=re.fullmatch(r'VOL(\d+)',mode)
        messenger=re.fullmatch(r'VOL_SENIOR_(\d+)',mode)
        volume=int(match[1]) if match else int(messenger[1]) if messenger else None
        code=f'{volume}-{ordinals[mode]}' if volume else str(ordinals[mode])
        if category in ('assault','air','prison'): code=str(int(re.search(r'(\d+)$',mode)[1]))
        name=text(c['name_string_id']) or ('未归入地图的节点' if c['chapter_id']==-1 else f'未命名地图 #{c["chapter_id"]}')
        image=assets.export(c['background_resource'])
        assert not c['background_resource'] or image, f'Missing map image {c["background_resource"]}'
        image_kind='map' if image else 'terrain'
        # Native special-event UI uses the first node's TERRAIN_ICON when no chapter backdrop exists.
        if not image and c['level_ids']: image=terrain[nodes[c['level_ids'][0]]['fieldId']]['image']
        enemy_levels=[enemies[u['id']]['level'] for lid in c['level_ids'] for u in nodes[lid]['enemies']]
        maps.append({'id':c['chapter_id'],'name':name,'category':category,'group':group,'mode':mode,
            'volume':volume,'code':code,'image':image,'imageKind':image_kind,'nodes':c['level_ids'],'simulation':mode.startswith('_SIM_'),
            'levels':[min(enemy_levels),max(enemy_levels)] if enemy_levels else [0,0]})
    requirements_audit=attach_requirements(table,assets,text,maps,levels,styles,funds,awards,pools,groups)
    income=attach_income(table,assets,text,maps,levels,nodes,funds,awards,pools,groups)
    attach_map_details(table,assets,text,maps,levels,nodes,funds,awards,pools,groups,capsules,styles)
    # BattleUI resolves evaluation letters through ArrangedStyle tag 51.
    letters={}; assessment=[]
    for style in styles.values():
        if 51 not in style['tags']: continue
        for item in style['items']:
            if item['mode_code']=='LETTER_RESULT':
                letters[int(item['filter_code'].split('_')[-1])]=text(next(n['value'] for n in item['number_entries'] if n['entry_id']==5))
            elif item['mode_code']=='SCORE':
                assessment.append({'score':next(n['value'] for n in item['number_entries'] if n['entry_id']==1),
                    'name':text(next(n['value'] for n in item['number_entries'] if n['entry_id']==5)), 'win':item['filter_code']=='WIN'})
    for item in assessment: item['grade']=letters[item['score']]
    income['assessments']=sorted(assessment,key=lambda a:a['score'])
    categories=[{'id':cid,'name':name,'description':desc,'image':assets.export(code),'titleImage':assets.export(title),
        'mapCount':sum(m['category']==cid and not m['simulation'] for m in maps),
        'nodeCount':sum(len(m['nodes']) for m in maps if m['category']==cid and not m['simulation'])}
        for cid,name,desc,code,title in CATEGORIES]
    used_units={u['id'] for n in nodes.values() for u in n['enemies']}
    result={'schemaVersion':2,'categories':categories,'maps':maps,'nodes':nodes,'income':income,
        'enemies':{uid:e for uid,e in enemies.items() if uid in used_units},'terrains':terrain,'rewards':rewards,
        'meta':{'sourceChapters':len(chapters)-bool(orphan_ids),'sourceNodes':len(nodes),'orphanNodes':orphan_ids,
            'sourceHashes':sources,'missingAssets':sorted(assets.missing),'unresolvedRewards':dict(unresolved),
            'ignoredNonInventoryTypes':dict(ignored),'requirements':requirements_audit}}
    assert not unresolved, f'Unresolved inventory drops: {dict(unresolved)}'
    result['meta']['capsuleOutfits']=converted_capsules
    assets.close()
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    result=build(check=args.check);dest=PUBLIC/'data/stage-catalog.json'
    payload=json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n'
    if args.check:
        assert payload==dest.read_text(encoding='utf-8'), 'Stage catalog differs from active client data'
    else: dest.write_text(payload,encoding='utf-8')
    print(json.dumps({'maps':len(result['maps']),'nodes':len(result['nodes']),'enemies':len(result['enemies']),
        'rewards':len(result['rewards']),'categories':result['categories'],
        'missingAssets':result['meta']['missingAssets'],'unresolvedRewards':result['meta']['unresolvedRewards']},ensure_ascii=False,indent=2))
