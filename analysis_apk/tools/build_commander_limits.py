"""Resolve permanent technology research prerequisites to commander thresholds.

Only normal research rules (tags 1401/1405) are used. Gift/event grants are not
research unlocks. All AND prerequisites are resolved recursively; material
costs and research durations are outside this resource-unlimited simulation.
"""
import argparse
import hashlib
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

from decode_configs import (config_path, parse_produce_rules, parse_demand_groups,
                            parse_award_tables, parse_award_groups, parse_capsule_faculty_trains)

ROOT = Path(__file__).resolve().parents[2]


def build(check=False):
    output = ROOT/'steel-maiden-browser/public/data/technology-catalog.json'
    data = json.loads(output.read_text(encoding='utf-8'))
    nodes = {n['craftId']: n for b in data['blocks'] for n in b['nodes']}
    blocks = {b['craftId']: b for b in data['blocks']}
    domain = {**{key: 1 for key in nodes}, **{key: max(l['level'] for l in b['levels']) for key,b in blocks.items()}}
    demands = {r['demand_group_id']: r for r in parse_demand_groups(config_path('DemandGroupInfo.dat'))}
    tables = {r['award_table_id']: r for r in parse_award_tables(config_path('AwardTableInfo.dat'))}
    groups = {r['award_group_id']: r for r in parse_award_groups(config_path('AwardGroupInfo.dat'))}
    blob = config_path('AwardPoolInfo.dat').read_bytes()
    pools = {}

    def pool_group(pid):
        if pid not in pools:
            pos, found = blob.find(struct.pack('<I', pid), 4), set()
            while pos >= 0:
                if pos+16 <= len(blob):
                    candidate = struct.unpack_from('<I', blob, pos+12)[0]
                    if candidate in groups: found.add(candidate)
                pos = blob.find(struct.pack('<I', pid), pos+1)
            assert len(found) == 1, ('Ambiguous award pool', pid, found)
            pools[pid] = next(iter(found))
        return pools[pid]

    rules = {}
    for rule in parse_produce_rules(config_path('ProduceRuleInfo.dat')):
        if not set(rule['field_40']) & {1401, 1405}: continue
        awarded = {i['values'][0] for tid in [*rule['field_c8'], *rule['field_e0']]
                   for t in tables[tid]['items'] for i in groups[pool_group(t['award_group_id'])]['items']
                   if i['item_type'] in (0,1) and i['values'][0] in domain}
        for target in awarded:
            items = [i for gid in rule['field_98'] for i in demands[gid]['items']]
            assert all(i['item_type'] == 1 for i in items), ('Unsupported research requirement', rule['rule_id'], items)
            requirements = [i['values'] for i in items]
            previous = next((low for ref,low,high in requirements if ref == target and low == high), None)
            assert previous is not None, ('Missing exact previous level', rule['rule_id'])
            level = previous+1
            assert 1 <= level <= domain[target]
            for ref,low,high in requirements:
                assert ref == 1 or ref in domain, ('Unresolved research dependency', rule['rule_id'], ref)
                if ref != target:
                    assert high >= (32767 if ref == 1 else domain[ref]), ('Nonmonotonic prerequisite', rule['rule_id'], ref, low, high)
            key = (target,level)
            assert key not in rules, ('Multiple permanent rules', key)
            rules[key] = {'ruleId':rule['rule_id'], 'requirements':requirements}
    expected = {(ref, level) for ref,maximum in domain.items() for level in range(1,maximum+1)}
    assert set(rules) == expected, ('Incomplete research coverage', expected-set(rules), set(rules)-expected)
    resolved, visiting = {}, set()

    def unlock(ref, level):
        if level == 0: return 1
        key = (ref,level)
        if key in resolved: return resolved[key]
        assert key not in visiting, ('Cyclic research prerequisites', key)
        visiting.add(key)
        result = max([1, *[low if dep == 1 else unlock(dep,low) for dep,low,high in rules[key]['requirements']]])
        visiting.remove(key)
        resolved[key] = result
        return result

    def assign(obj,key,value):
        if check: assert obj.get(key) == value, (obj.get('id',obj.get('craftId',obj.get('level'))), key)
        else: obj[key] = value

    for ref, block in blocks.items():
        for level in block['levels']:
            assign(level,'unlockCommanderLevel',unlock(ref,level['level']))
    for ref,node in nodes.items():
        assign(node,'unlockCommanderLevel',unlock(ref,1))
        assign(node,'researchRequirements',rules[(ref,1)]['requirements'])
        assign(node,'researchRuleId',rules[(ref,1)]['ruleId'])

    # Confirm the existing per-card magic paths have no omitted commander or
    # vehicle-level gate beyond the explicit phase list: previous magic level,
    # selector, global scout technology and eagle/propeller resources.
    maidens = json.loads((output.parent/'maidens.json').read_text(encoding='utf-8'))
    ids = {l['trainId'] for variants in maidens['magicProgression']['progression'].values()
           for kinds in variants.values() for paths in kinds.values() for p in paths for l in p['levels']}
    magic_rules = [t for t in parse_capsule_faculty_trains(config_path('CapsuleFacultyTrainInfo.dat')) if t['train_id'] in ids]
    assert len(magic_rules) == len(ids)
    for t in magic_rules:
        items = [i for gid in t['group_e_ids'] for i in demands[gid]['items']]
        assert t['group_c_values'] and set(t['group_c_values']) <= {1,2,3} and not t['group_d_values'] and not t['demands'], t['train_id']
        assert sorted(i['item_type'] for i in items) == [0,3,9,12,13], (t['train_id'], items)
        assert next(i for i in items if i['item_type'] == 0)['values'][0] == 64, t['train_id']
        opening = next(i for i in items if i['item_type'] == 9)['values']
        assert opening[0] <= int(datetime.now(timezone.utc).timestamp()) and opening[1:] == [4294967295,1], (t['train_id'], opening)
    magic_by_id = {t['train_id']:t for t in magic_rules}
    for variants in maidens['magicProgression']['progression'].values():
        for kinds in variants.values():
            for paths in kinds.values():
                for p in paths:
                    for level in p['levels']:
                        assign(level,'phases',magic_by_id[level['trainId']]['group_c_values'])
    source_names = ['ProduceRuleInfo.dat','DemandGroupInfo.dat','AwardTableInfo.dat','AwardGroupInfo.dat','AwardPoolInfo.dat','CapsuleFacultyTrainInfo.dat']
    assign(data,'commanderLimits',{'version':1,'maximumRequiredLevel':max(resolved.values()),'researchRuleCount':len(rules),
                                 'magicRuleCount':len(magic_rules), 'sourceSha256':{n:hashlib.sha256(config_path(n).read_bytes()).hexdigest() for n in source_names}})
    if not check:
        output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        (output.parent/'maidens.json').write_text(json.dumps(maidens,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({'mode':'check' if check else 'build','technologyPeriods':len(blocks),'nodes':len(nodes),'resolvedRules':len(rules),
                      'magicRulesVerified':len(magic_rules),'maximumRequiredCommanderLevel':max(resolved.values())},ensure_ascii=False))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    build(parser.parse_args().check)
