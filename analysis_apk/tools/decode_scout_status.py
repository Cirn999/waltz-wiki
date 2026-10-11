"""Decode field/status layouts verified against the current device library.

Readers: 0x85fe3c, 0x860108, 0x89963c, 0x899980, 0x8970a0.
Unresolved field semantics are intentionally raw. EOF checks use Reader.records.
"""
import hashlib
import json
import re
from pathlib import Path
from decode_configs import Reader, config_path, parse_arranged_styles, parse_string_table, parse_skill_server

def parse_fields(path):
    def one(r):
        return {'field_type':r.u16(), 'style_ids':r.vec_u32(),
                'carrying_skills':[{'skill_id':r.u32(),'raw_faculty':r.u32()} for _ in range(r.u8())]}
    return Reader(path.read_bytes()).records(one)

def parse_status(path):
    def one(r):
        row = {'status_id':r.u32(),'raw_4':r.u32(),'icon':r.cstring(),'raw_20':r.u8(), 'raw_28':r.vec_u32(), 'raw_40':r.u32(), 'params':[]}
        for _ in range(r.u8()):
            p = {'param_id':r.u32(),'contents':[]}
            for _ in range(r.u8()):
                cid = r.u32()
                raw = r.take(r.u16())
                p['contents'].append({'content_id':cid,'hex':raw.hex(),'signed_integer':int.from_bytes(raw,'little',signed=True) if len(raw) in (1,2,4,8) else None})
            row['params'].append(p)
        row.update({'raw_60':r.vec_u32(),'raw_78':r.u32(),'raw_7c':r.u8(),'raw_7e':r.u16()})
        if row['raw_7e']==0:row['raw_80']=r.u16()
        return row
    return Reader(path.read_bytes()).records(one)

def parse_skill_info(path):
    # Current device reader 0x896794; leveled parameter structure also used by SkillServerInfo.
    def one(r):
        row={'skill_id':r.u32(),'raw_4':r.u32(),'icon':r.cstring(),'raw_20':r.u8(),
             'raw_28':r.vec_u32(),'raw_40':r.vec_u32(),'raw_58':r.u32(),'raw_5c':r.u32(),'params':[]}
        for _ in range(r.u8()):
            p={'param_id':r.u32(),'levels':[]}
            for _ in range(r.u8()):
                lv={'level':r.u32(),'contents':[]}
                for _ in range(r.u8()):
                    cid=r.u32(); raw=r.take(r.u16())
                    lv['contents'].append({'content_id':cid,'hex':raw.hex(),'signed_integer':int.from_bytes(raw,'little',signed=True) if len(raw) in (1,2,4,8) else None})
                p['levels'].append(lv)
            row['params'].append(p)
        row.update({'raw_78':r.vec_u32(),'raw_90':r.vec_u32(),'raw_a8':r.u32(),'texts':[r.cstring() for _ in range(r.u8())]})
        return row
    return Reader(path.read_bytes()).records(one)

def parse_skill_desc(path):
    return Reader(path.read_bytes()).records(lambda r: {'description_id':r.u32(),'string_id':r.u32(),'param_pairs':[[r.u32(),r.u32()] for _ in range(r.u8())]})

def main():
    base=Path(__file__).resolve().parents[1]
    out=base/'scout_formula_recheck'
    fields=parse_fields(out/'FieldImplementTypeInfo.device.dat')
    statuses=parse_status(out/'StatusInfo.device.dat')
    strings={r['string_id']:r['strings'] for r in parse_string_table(config_path('StringTableInfo.dat'))}
    styles={r['arranged_style_id']:r for r in parse_arranged_styles(config_path('ArrangedStyleInfo.dat'))}
    skills={r['skill_id']:r for r in parse_skill_server(base/'scout_native_trace/SkillServerInfo.patch.device.dat')}
    skill_info={r['skill_id']:r for r in parse_skill_info(out/'SkillInfo.device.dat')}
    descriptions={r['description_id']:{**r,'text':strings.get(r['string_id'])} for r in parse_skill_desc(out/'SkillDesc.device.dat')}
    manifest=[]
    for stem in ('FieldImplementTypeInfo','StatusInfo','SkillInfo','SkillDesc','ChapterLevelInfo','ArrangedStyleInfo','StringTableInfo'):
        device=out/(stem+'.device.dat'); local=config_path(stem+'.dat')
        manifest.append({'name':stem,'device_copy':str(device),'local_source':str(local),
                         'device_sha256':hashlib.sha256(device.read_bytes()).hexdigest(),
                         'local_sha256':hashlib.sha256(local.read_bytes()).hexdigest(),
                         'identical':device.read_bytes()==local.read_bytes()})
    (out/'config_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    assert all(r['identical'] for r in manifest), 'Device/local configuration mismatch; stop interpretation.'
    selected=[]
    for f in fields:
        if f['field_type'] not in (2,8,9,14):continue
        expanded=[]
        for sid in f['style_ids']:
            st=styles.get(sid,{})
            for item in st.get('items',[]):
                refs=[{'id':e['value'],'text':strings[e['value']]} for e in item['number_entries'] if e['value'] in strings]
                expanded.append({'mode':item['mode_code'],'string_refs':refs})
        selected.append({**f,'style_text':expanded,'skill_info':{str(k['skill_id']):skill_info.get(k['skill_id']) for k in f['carrying_skills']},'skill_config':{str(k['skill_id']):skills.get(k['skill_id']) for k in f['carrying_skills']}})
    openings=json.loads((out/'opening_evidence.json').read_text(encoding='utf-8'))
    logged=[]
    for n in openings:
        ids=sorted({int.from_bytes(bytes.fromhex(m.group(1)),'little') for r in n['opening_log'] if (m:=re.search(r'状态====([A-Fa-f0-9]{8})$',r['text']))})
        logged.append({'node':n['node'],'status_ids':ids,'status_config':[r for r in statuses if r['status_id'] in ids]})
    result={'counts':{'fields':len(fields),'statuses':len(statuses),'skill_info':len(skill_info),'skill_descriptions':len(descriptions)},'sources':{name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in ('FieldImplementTypeInfo.device.dat','StatusInfo.device.dat','SkillInfo.device.dat','SkillDesc.device.dat')},'fields':selected,'opening_statuses':logged}
    (out/'status_field_links.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for f in selected:
        print('FIELD', f['field_type'], [r for r in f['style_text'] if r['string_refs']], f['carrying_skills'])
        for sid, skill in f['skill_config'].items():
            print('SKILL',sid,{p['param_id']:[[c.get('int32',c['hex']) for c in lv['contents']] for lv in p['levels']] for p in skill['params']})
    print('LOGGED STATUS IDS',[(r['node'],r['status_ids']) for r in logged])
    for r in skill_info.values():
        if r['skill_id'] in {s['skill_id'] for f in selected for s in f['carrying_skills']} or any(k in str(r['texts']) for k in ('侦','索敌','隐蔽','回声','潮湿')):
            print('SKILL INFO',json.dumps({k:v for k,v in r.items() if k!='params'},ensure_ascii=False))
    (out/'skill_info_decoded.json').write_text(json.dumps(list(skill_info.values()),ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'skill_descriptions.json').write_text(json.dumps(list(descriptions.values()),ensure_ascii=False,indent=2),encoding='utf-8')
    for d in descriptions.values():
        if any(k in str(d['text']) for k in ('侦','索敌','隐蔽','回声','潮湿')):
            print('DESCRIPTION',d)
    for i in (22,24,50):print('FULL SKILL',i,skill_info.get(i))
    print('VALIDATION',result['counts'],'device_local_matches',len(manifest))

if __name__=='__main__':main()
