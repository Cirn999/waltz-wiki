"""Export the base handbook directly from current private client configuration.
Only generated catalogue and resolved original sprites belong in the web app.
"""
import argparse, hashlib, io, json, re
from collections import defaultdict
from pathlib import Path
from decode_configs import (ROOT, Reader, config_path, parse_crafts, parse_string_table,
    parse_produce_rules, parse_demand_groups, parse_consume_groups, parse_fund_types,
    parse_arranged_styles, parse_achievement_list, parse_award_tables, parse_award_groups,
    parse_capsule_phases, parse_unit_appearances, parse_role_models)
from inspect_acquisition_configs import parse_award_pools
from stage_assets import StageAssets

PUBLIC=ROOT/'steel-maiden-browser/public'
LABELS={2:('银币容量贡献',''),17:('燃油容量',''),18:('燃油恢复','/小时'),
23:('源奶容量',''),24:('源奶恢复','/小时'),37151:('银币产量','/小时'),
47151:('银币待收上限',''),37353:('源铁产量','/小时'),47353:('源铁待收上限',''),
91:('软钢产量','/小时'),92:('密水产量','/小时'),93:('钛糖产量','/小时'),
94:('软钢容量',''),95:('密水容量',''),96:('钛糖容量',''),
72:('催化剂恢复','/小时'),73:('催化剂容量贡献','')}

def build(check=False):
    sources={}
    def table(name,parser,key,overlay=False):
        result={}
        paths=[ROOT/'Resources/config'/name,ROOT/'patch/_1.18/config'/name] if overlay else [config_path(name)]
        for p in paths:
            if not p.exists():continue
            result.update({r[key]:r for r in parser(p)})
            sources[p.relative_to(ROOT).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
        return result
    strings=table('StringTableInfo.dat',parse_string_table,'string_id',True)
    text=lambda sid: re.sub(r'<[^>]*>',' ',(strings.get(sid,{}).get('strings') or [''])[0]).strip()
    crafts=table('CraftInfo.dat',parse_crafts,'craft_id')
    rules=table('ProduceRuleInfo.dat',parse_produce_rules,'rule_id')
    demands=table('DemandGroupInfo.dat',parse_demand_groups,'demand_group_id')
    consumes=table('ConsumeGroupInfo.dat',parse_consume_groups,'consume_group_id')
    funds=table('FundTypeInfo.dat',parse_fund_types,'fund_id',True)
    styles=table('ArrangedStyleInfo.dat',parse_arranged_styles,'arranged_style_id')
    achievements=table('AchievementListInfo.dat',parse_achievement_list,'achievement_id')
    awards=table('AwardTableInfo.dat',parse_award_tables,'award_table_id')
    pools=table('AwardPoolInfo.dat',parse_award_pools,'award_pool_id')
    groups=table('AwardGroupInfo.dat',parse_award_groups,'award_group_id')
    phases=table('CapsulePhaseInfo.dat',lambda p:[r for r in parse_capsule_phases(p)[0] if r['phase']==1],'capsule_type_id')
    appearances=table('UnitAppearanceInfo.dat',parse_unit_appearances,'appearance_id')
    models=table('roleModelInfo.dat',parse_role_models,'role_model_id')
    def parse_cooldowns(p):
        def one(r):
            return {'id':r.u32(),'properties':[(r.u32(),r.i32()) for _ in range(r.u8())],
                'volatile':[(r.u32(),r.vec_u32()) for _ in range(r.u8())],'tags':r.vec_u32()}
        return Reader(p.read_bytes()).records(one)
    cool=table('CooldownGroupInfo.dat',parse_cooldowns,'id')
    nv=lambda i,n:next((e['value'] for e in i['number_entries'] if e['entry_id']==n),None)
    sv=lambda i,n:next((e['value'] for e in i['string_entries'] if e['entry_id']==n),'')
    linked=defaultdict(list)
    for s in styles.values():
        for tag in s['tags']:linked[tag].append(s)
    def items(tags):
        return [i for s in {s['arranged_style_id']:s for tag in tags for s in linked[tag]}.values() for i in s['items']]
    def ds(ids):return [d for gid in ids for d in demands[gid]['items']]
    def leaves(ids):
        return [dict(i,conditions=ds(p['field_04'])) for tid in ids for t in awards[tid]['items']
                for g in pools[t['award_group_id']]['groups'] for p in g for i in groups[p['field_20']]['items']]
    assets=StageAssets(check=True)
    output=PUBLIC/'art/base'
    if not check:output.mkdir(parents=True,exist_ok=True)
    exported={};missing=set()
    def image(code,required=False):
        if not code:return ''
        if code in exported:return exported[code]['path']
        im=assets.image(code)
        if im is None:
            if required:raise ValueError('Missing required original asset '+code)
            missing.add(code);return ''
        filename=re.sub(r'[^\w.-]','_',code)+'.png'
        buf=io.BytesIO();im.save(buf,format='PNG',optimize=True);blob=buf.getvalue()
        p=output/filename
        if check:assert p.read_bytes()==blob,('Asset changed',code)
        else:p.write_bytes(blob)
        exported[code]={'path':'/art/base/'+filename,'width':im.width,'height':im.height}
        return exported[code]['path']
    fund_name=lambda fid:text(funds[fid]['name_string_id'])
    craft_name=lambda cid:text(crafts[cid]['name_string_id'])
    def card_info(cid):
        a=appearances[phases[cid]['appearance_id']]
        model=models[a['model_id']]
        icon=next((sv(i,1) for sid in model['group_b_ids'] for i in styles.get(sid,{}).get('items',[]) if i['mode_code']=='Head_Square'),model['resource_a'])
        return {'id':cid,'name':text(a['name_string_id']),'image':image(icon)}
    def fund_info(fid):
        f=funds[fid]
        code=next((r['resource'] for r in sorted(f['resources'],key=lambda x:(x['resource_id']!=9,x['resource_id']!=5)) if r['resource_id'] in (9,5)),'')
        return {'id':fid,'name':fund_name(fid),'image':image(code)}
    def costs(ids):
        return [dict(fund_info(i['values'][0]),amount=i['amount']) for gid in ids for i in consumes[gid]['items'] if i['item_type']==0 and i['amount']]
    def requirements(r,own=None):
        result=[]
        for d in ds(r['field_98']):
            if d['item_type']!=1:continue
            cid,lo,hi=d['values']
            if cid==own:continue
            result.append(craft_name(cid)+(' ≥ '+str(lo)+'级' if hi>=32767 else ' '+str(lo)+'–'+str(hi)+'级'))
        return list(dict.fromkeys(result))
    background=image('gjd-007',True)
    assert exported['gjd-007']['width']==960 and exported['gjd-007']['height']==540
    layout={nv(i,7):{'x':nv(i,2),'y':nv(i,3)} for i in styles[358001]['items']}
    building_rows=[]
    for cid in [18501,18503,18504,18505,18506,18507,18508,18509]:
        c=crafts[cid];tag=next(t for t in c['tags'] if t in layout)
        icon=image(c['name'],True);meta=exported[c['name']]
        upgrades=[]
        for r in rules.values():
            if 1400 not in r['field_40'] or cid not in r['field_78']:continue
            own=next(d for d in ds(r['field_98']) if d['item_type']==1 and d['values'][0]==cid)
            assert own['values'][1]==own['values'][2]
            assert any(i['item_type']==0 and i['values']==[cid] and i['weight']==1 for i in leaves(r['field_c8']))
            upgrades.append({'id':r['rule_id'],'from':own['values'][1],'to':own['values'][1]+1,
                'seconds':r['field_38'],'requirements':requirements(r,cid),'costs':costs(r['field_b0'])})
        upgrades.sort(key=lambda u:u['to'])
        maximum=c['field_7']+len(c['levels'])-1
        assert [u['to'] for u in upgrades]==list(range(1,maximum+1))
        columns=list(dict.fromkeys(e['property_id'] for l in c['levels'] for e in l['property_effects'] if e['property_id'] in LABELS))
        effects=[{'level':i+c['field_7'],'values':{str(e['property_id']):e['value'] if e['value']<2**31 else e['value']-2**32 for e in l['property_effects'] if e['property_id'] in columns}} for i,l in enumerate(c['levels']) if i+c['field_7']>0]
        building_rows.append({'id':cid,'name':craft_name(cid),'description':text(c['field_5']),
            'image':icon,'width':meta['width'],'height':meta['height'],**layout[tag],'maxLevel':maximum,
            'upgrades':upgrades,'columns':[{'key':str(k),'label':LABELS[k][0],'unit':LABELS[k][1]} for k in columns],'effects':effects})
    # Qualitative reward previews use the original resource sprite; never invent amounts.
    names_by_icon=defaultdict(set)
    for f in funds.values():
        if fund_name(f['fund_id'])=='挖取':continue
        for r in f['resources']:names_by_icon[r['resource']].add(fund_name(f['fund_id']))
    for cid in phases:
        a=appearances.get(phases[cid]['appearance_id'])
        if not a:continue
        for sid in models[a['model_id']]['group_b_ids']:
            for i in styles.get(sid,{}).get('items',[]):
                if i['mode_code']=='Head_Square':names_by_icon[sv(i,1)].add(text(a['name_string_id']))
    def preview(i):
        code=sv(i,1)
        return {'name':'／'.join(sorted(names_by_icon[code])) or '奖励','image':image(code),'description':text(nv(i,5))}
    talent_names={tag:text(nv(i,5)) for s in styles.values() for i in s['items'] if i['mode_code']=='CAIYI' for tag in s['tags']}
    talent_icons={tag:image(sv(i,1)) for s in styles.values() for i in s['items'] if i['mode_code']=='CAIYI' for tag in s['tags']}
    military=[]
    for r in rules.values():
        group=next((t for t in r['field_40'] if 1176051<=t<=1176056),None)
        if not group or r['rule_id'] not in achievements or 20 not in r['field_40']:continue
        ii=items(r['field_40']);modes={i['mode_code']:i for i in ii}
        if 'DAGONG_RECOMMEND_LEVEL' not in modes:continue
        a=achievements[r['rule_id']]
        gate=[d['values'][1] for d in ds(r['field_98']) if d['item_type']==1 and d['values'][0]==18506]
        assert len(gate)==1
        bonuses=[]
        for j in (1,2):
            it=modes.get('DAGONG_CAIYI_'+str(j))
            if not it:continue
            tag=nv(it,7)
            bonuses.append({'talent':talent_names[tag],'image':talent_icons[tag],'reward':preview(modes['DAGONG_CAIYI_AWARD_'+str(j)])})
        military.append({'id':r['rule_id'],'name':text(a['name_string_id']),'description':text(a['description_string_id']),
            'image':image(a['icon'],True),
            'stationLevel':gate[0],'group':group-1176050,'recommendedLevel':nv(modes['DAGONG_RECOMMEND_LEVEL'],1),
            'difficulty':nv(modes['DAGONG_DIFFICULTY'],1),
            'times':[{'label':text(nv(i,5)),'seconds':r['field_38']*nv(i,1)} for i in ii if i['mode_code']=='VALID_COUNT'],
            'rewards':[preview(i) for i in ii if i['mode_code']=='DAGONG_BASE_AWARD'],'bonuses':bonuses})
    assert len(military)==96
    military_levels=[{'level':lv,'groups':len({w['group'] for w in military if w['stationLevel']<=lv}),'activities':sum(w['stationLevel']<=lv for w in military)} for lv in range(1,8)]
    assert [l['activities'] for l in military_levels]==[0,12,24,36,56,76,96]
    objects={};slot_levels=defaultdict(set)
    for r in rules.values():
        dd=ds(r['field_98'])
        gate=[d for d in dd if d['item_type']==1 and d['values'][0]==18505]
        if 20 not in r['field_40'] or not gate:continue
        cd=[d for d in dd if d['item_type']==6 and d['values'][1]==1]
        assert len(cd)==1
        tags=[t for t in cool[cd[0]['values'][0]]['tags'] if 1176001<=t<=1176012];assert len(tags)==1
        slot=tags[0]-1176000;lv=gate[0]['values'][1];slot_levels[slot].add(lv)
        for award in leaves(r['field_c8']):
            kind=award['item_type'];v=award['values']
            if kind not in (0,1,2) or (kind==1 and v[0]==10):continue
            if kind==0:assert v==[1], ("Unreviewed harbour craft reward",award)
            key=str(kind)+':'+str(v[0])
            if key not in objects:
                info={'id':v[0],'name':craft_name(v[0])+'经验','image':image('djtb-031',True)} if kind==0 else fund_info(v[0]) if kind==1 else card_info(v[0])
                objects[key]={'key':key,**info,'kind':'卡牌' if kind==2 else '物资','offers':[]}
            offer={'purchaseLevel':lv,'amount':award['weight'],'costs':costs(r['field_b0']),'slots':[slot]}
            signature=json.dumps({k:v for k,v in offer.items() if k!='slots'},sort_keys=True)
            existing=next((o for o in objects[key]['offers'] if o['_signature']==signature),None)
            if existing:existing['slots'].append(slot)
            else:objects[key]['offers'].append(dict(offer,_signature=signature))
    assert len(objects)==131
    for o in objects.values():
        for offer in o['offers']:del offer['_signature']
        o['offers'].sort(key=lambda v:(v['purchaseLevel'],v['amount']))

    # BuildingUI.lua harbour product renderer: gk-005 sale tile; centered native
    # inventory frame, quantity at bottom-right, currency + price at y=20.
    shop_ui={'tile':image('gk-005',True)}
    for g in objects.values():
        card=g['kind']=='卡牌';experience=g['key'].startswith('0:')
        code=next((r['resource'] for r in funds[g['id']]['resources'] if r['resource_id']==5),'') if not card and not experience else ''
        icon=image(code,True) if code else g['image']
        frame=image('zdjm-029' if card else 'djbb-001',True)
        equipment=[i for i in items(funds[g['id']]['tags']) if i['mode_code']=='EQULEVEL'] if not card and not experience else []
        g['shop']={'image':icon,'frame':frame,'backdrop':'' if card else image('sd-020',True),
            'grade':('S'+str(nv(equipment[0],1))) if equipment else ''}
        for offer in g['offers']:
            for cost in offer['costs']:
                code=next((r['resource'] for r in funds[cost['id']]['resources'] if r['resource_id']==5),'')
                if code:cost['image']=image(code,True)

    assert all(len(v)==1 for v in slot_levels.values())
    assert [next(iter(slot_levels[i])) for i in range(1,13)]==[1,1,1,1,1,2,3,4,5,5,6,7]
    port_levels=[]
    for lv in range(1,9):
        silver=[]
        for r in rules.values():
            if 500 not in r['field_40']:continue
            gate=[d for d in ds(r['field_98']) if d['item_type']==1 and d['values'][0]==18505]
            if not gate or not all(d['values'][1]<=lv<=d['values'][2] for d in gate):continue
            cc=costs(r['field_b0'])
            silver.extend(c['amount'] for c in cc if c['id']==1)
        port_levels.append({'level':lv,'slots':sum(next(iter(v))<=lv for v in slot_levels.values()),'silverRefreshCosts':silver,'goods':sum(any(o['purchaseLevel']<=lv for o in g['offers']) for g in objects.values())})
    assert [l['slots'] for l in port_levels]==[5,6,7,8,10,11,12,12]
    notes={
        18501:['容量为本设施提供的数值，账号总容量还需合并其他设施。','升级同时放宽其他建筑的建造与升级前置，详见下方解锁表。'],
        18503:['展示设施配置的每小时产量与待收上限。'],
        18504:['展示本设施对银币存储容量的贡献。'],
        18505:['开放格数按码头组与购买前置核定。物资为客户端购买配置候选；购买前置等级不代表实际刷新等级，刷新等级尚未确认。','免费调配冷却8小时；银币调配各方案冷却24小时，源铁调配消耗60源铁。'],
        18506:['钢舞姬等级影响成功率与基础奖励；合适的才艺用于追加奖励，不影响成功率。'],
        18507:['展示设施配置的每小时产量与待收上限。'],
        18508:['1级开放再制相关黑科技入口，相关规则另需指挥官30级；2级允许建造空务设计局。','催化剂容量贡献为6720，加基础容量480为7200；其他账号修正另计。'],
        18509:['1级开放航空相关黑科技入口，对应规则另需指挥官30级。','当前客户端配置未列出2、3级新增效果，不据此判定服务器中升级无效。']}
    for b in building_rows:
        b['notes']=notes[b['id']]
        b['unlocks']=[]
        for target in building_rows:
            if target['id']==b['id']:continue
            for u in target['upgrades']:
                rr=rules[u['id']]
                for d in ds(rr['field_98']):
                    if d['item_type']==1 and d['values'][0]==b['id'] and 0<d['values'][1]<=b['maxLevel'] and d['values'][2]>=32767:
                        b['unlocks'].append({'level':d['values'][1],'building':target['name'],'targetLevel':u['to'],'requirements':u['requirements']})
    for name in ['UIStyle.dat']:
        p=config_path(name);sources[p.relative_to(ROOT).as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
    data={'schemaVersion':2,'map':{'width':960,'height':540,'background':background,'title':image('gjd-002',True),'nameplate':image('gjd-011',True)},
        'buildings':building_rows,'military':military,'militaryLevels':military_levels,'port':{'levels':port_levels,'goods':list(objects.values()),'ui':shop_ui},
        'sources':sources,'missingAssets':sorted(missing)}
    destination=PUBLIC/'data/base-catalog.json'
    blob=json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n'
    if check:assert destination.read_text(encoding='utf8')==blob,'Base catalogue differs from current sources'
    else:destination.write_text(blob,encoding='utf8')
    assets.close()
    print(json.dumps({'buildings':len(building_rows),'upgrades':sum(len(b['upgrades']) for b in building_rows),'military':len(military),'portGoods':len(objects),'assets':len(exported),'missing':sorted(missing)},ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');build(p.parse_args().check)
