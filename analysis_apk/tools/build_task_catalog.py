"""Export AwardUI's five task tabs and their native requirements/rewards.

AchievementListInfo.tags is the visibility-demand vector, NOT category tags.
Categories come from ProduceRuleInfo tags joined to ArrangedStyle SUCCESS.
See steel-maiden-browser/docs/tasks.md for provenance and limitations.
"""
import argparse
import hashlib
import html
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from decode_configs import (config_path, parse_achievement_list, parse_arranged_styles,
    parse_string_table, parse_produce_rules, parse_demand_groups, parse_crafts,
    parse_capsule_phases, parse_unit_appearances, parse_role_models)
from export_level_enemy_data import (parse_award_tables, parse_award_pools,
    parse_award_groups, parse_fund_types, parse_chapter_levels)
from stage_assets import StageAssets, ROOT

PUBLIC = ROOT / 'steel-maiden-browser/public'
OUTPUT = PUBLIC / 'data/task-catalog.json'
CATEGORIES = [(2503, '新手'), (2502, '建设'), (2501, '挑战'), (2500, '主线'), (2506, '退返')]


def signature(d):
    return d['item_type'], tuple(d['values'])


def clean(value):
    return html.unescape(re.sub(r'<[^>]*>', '', value)).strip()


def build(check=False):
    sources = {}
    def table(name, parser, key, overlay=False):
        result = {}
        paths = [ROOT/'Resources/config'/name, ROOT/'patch/_1.18/config'/name] if overlay else [config_path(name)]
        for path in paths:
            if path.exists():
                result.update({r[key]: r for r in parser(path)})
                sources[str(path.relative_to(ROOT)).replace('\\', '/')] = hashlib.sha256(path.read_bytes()).hexdigest()
        return result

    strings = table('StringTableInfo.dat', parse_string_table, 'string_id', True)
    def text(sid): return clean((strings.get(sid, {}).get('strings') or [''])[0])
    achievements = table('AchievementListInfo.dat', parse_achievement_list, 'achievement_id')
    rules = table('ProduceRuleInfo.dat', parse_produce_rules, 'rule_id')
    demands = table('DemandGroupInfo.dat', parse_demand_groups, 'demand_group_id')
    styles = table('ArrangedStyleInfo.dat', parse_arranged_styles, 'arranged_style_id')
    crafts = table('CraftInfo.dat', parse_crafts, 'craft_id')
    funds = table('FundTypeInfo.dat', parse_fund_types, 'fund_id', True)
    awards = table('AwardTableInfo.dat', parse_award_tables, 'award_table_id')
    pools = table('AwardPoolInfo.dat', parse_award_pools, 'award_pool_id')
    groups = table('AwardGroupInfo.dat', parse_award_groups, 'award_group_id')
    phases = table('CapsulePhaseInfo.dat', lambda p: [r for r in parse_capsule_phases(p)[0] if r['phase'] == 1], 'capsule_type_id')
    appearances = table('UnitAppearanceInfo.dat', parse_unit_appearances, 'appearance_id')
    models = table('roleModelInfo.dat', parse_role_models, 'role_model_id')
    levels = table('ChapterLevelInfo.dat', parse_chapter_levels, 'level_id')
    stages = json.loads((PUBLIC/'data/stage-catalog.json').read_text(encoding='utf-8'))
    maidens = {r['id']: r for r in json.loads((PUBLIC/'data/maidens.json').read_text(encoding='utf-8'))['rows']}
    maps = {m['id']: m for m in stages['maps']}
    owners = {lid: m for m in stages['maps'] for lid in m['nodes']}
    quest_levels = {l['raw_scalar_3']: l['level_id'] for l in levels.values() if l['raw_scalar_3']}
    assets = StageAssets(check=check)
    # Keep task assets separate; no rewrite of existing stage sprites.
    assets.out = PUBLIC/'art/tasks'
    if not check: assets.out.mkdir(parents=True, exist_ok=True)
    def image(code): return assets.export(code).replace('/art/stages/', '/art/tasks/')
    def items(ids): return [d for gid in ids for d in demands[gid]['items']]
    task_rows = [a for a in achievements.values() if a['award_code'] == 'AWARD'
        and set(rules[a['achievement_id']]['field_40']) & dict(CATEGORIES).keys()]
    grades = {int(i['filter_code'].removeprefix('LETTER_RESULT_')): text(e['value'])
        for s in styles.values() for i in s['items'] if i['mode_code'] == 'LETTER_RESULT'
        for e in i['number_entries'] if e['entry_id'] == 5}
    equipment_levels = {tag: next(e['value'] for e in i['number_entries'] if e['entry_id'] == 1)
        for s in styles.values() for tag in s['tags'] for i in s['items'] if i['mode_code'] == 'EQULEVEL'}
    for tag, name in CATEGORIES:
        labels = {text(e['value']).replace(' ', '') for s in styles.values() if tag in s['tags']
            for i in s['items'] if i['mode_code'] == 'SUCCESS' for e in i['number_entries'] if e['entry_id'] == 5}
        assert labels == {name}, (tag, labels)

    done_quests = {}
    for a in achievements.values():
        for d in items(a['demands']):
            if d['item_type'] == 3 and d['values'][1:] == [1, 1, 2147483647]:
                done_quests[d['values'][0]] = a
    # Exact complete predicate -> native task wording, never a fuzzy ID/name match.
    predicate_text = defaultdict(set)
    for a in task_rows:
        visible = set(map(signature, items(a['tags'])))
        own = {d['values'][0] for d in items(a['demands']) if d['item_type'] == 3}
        core = [d for d in items(rules[a['achievement_id']]['field_98']) if signature(d) not in visible
            and not (d['item_type'] == 3 and d['values'][0] in own)]
        if len(core) == 1:
            predicate_text[signature(core[0])].add(text(a['name_string_id']) if 2506 in rules[a['achievement_id']]['field_40'] else text(a['description_string_id']))

    unresolved = Counter()
    # The only unnamed prerequisite marker in these tabs is written by the
    # recipe awarding the novice-selection token. Derive the token name from
    # the actual writer, not from the unrelated task's title (募兵硬币).
    token_writers = [g for g in groups.values() if any(i['item_type'] == 3 and i['values'][0] == 1218 for i in g['items'])]
    assert len(token_writers) == 1 and token_writers[0]['award_group_id'] == 26
    token_funds = [i['values'][0] for i in token_writers[0]['items'] if i['item_type'] == 1]
    assert token_funds == [4246]
    def decode(d):
        kind, v = d['item_type'], d['values']
        row = {'key': ':'.join(map(str, [kind, *v])), 'text': ''}
        def result(value, **extra): return {**row, 'text': value, **extra}
        if kind == 1:
            cid, lo, hi = v
            name = text(crafts[cid]['name_string_id'])
            return result(f'{name}等级 ≥ {lo}' if hi in (32767, 2147483647) else f'{name}等级 {lo}–{hi}')
        if kind == 3:
            qid, assessment, lo, hi = v
            if qid in quest_levels:
                lid = quest_levels[qid]; m = owners[lid]
                name = f'{m["code"]} {m["name"]}'.strip()
                if assessment == 9:
                    grade = grades[lo]
                    return result(f'{name} · 节点 {m["nodes"].index(lid)+1}：{grade} 评价或以上', mapId=m['id'], nodeId=lid, grade=grade)
                if assessment == 3:
                    return result(f'关卡「{name}」进度记录 ≥ {lo}', mapId=m['id'])
            if assessment == 1 and qid in done_quests:
                a = done_quests[qid]; name = text(a['name_string_id'])
                if name:
                    return result(f'{"未领取" if hi == 0 else "已领取"}「{name}」奖励', taskId=a['achievement_id'])
            if assessment == 10 and qid in (51, 61):
                return result(f'{"鹰标" if qid == 51 else "金桨"}总和 ≥ {lo}')
            if assessment == 1 and qid in (101, 102):
                return result(f'{"主线战役或特殊任务" if qid == 101 else "活动章节"}累计战败 ≥ {lo} 次')
            if assessment == 4 and qid in maidens:
                return result(f'{"未获得过" if hi == 0 else "获得过"}{maidens[qid]["tank"]}')
            if qid == 8 and assessment == 1:
                return result('持有规定日期内参与蒙特卡洛活动的历史记录（任务显示条件）')
            if [qid, assessment, lo, hi] == [1218, 1, 0, 0]:
                return result(f'尚未触发「{text(funds[token_funds[0]]["name_string_id"])}」发放记录')
        if kind == 17:
            tag, assessment, low, high, count, maximum = v
            assert high == maximum == 2147483647, d
            if assessment == 4 and tag in range(801, 807):
                name = {801: '重型坦克', 802: '中型坦克', 803: '轻型坦克', 804: '坦克歼击车', 805: '自行火炮', 806: '装甲车'}[tag]
                return result(f'获得过至少 {count} 种{name}钢舞姬')
            if assessment == 5 and tag == 800:
                return result(f'对至少 {count} 位不同钢舞姬完成亮星（达到二星及以上）')
            if assessment == 7 and tag in (811, 812, 813):
                return result(f'培养过至少 {count} 位 {low} 级以上的{dict(zip((811,812,813), ("初期", "二期", "三期")))[tag]}钢舞姬（需授勋{"并亮星" if tag != 813 else ""}）')
        if kind == 9:
            start, duration, inside = v
            assert inside == 1, d
            date = lambda t: datetime.fromtimestamp(t, timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
            end = None if duration >= 2147483648 else start + duration
            return result(f'开放时间：{date(start)} 起' if end is None else f'开放时间：{date(start)}–{date(end)}',
                timed=True, timeWindow={'start': start, 'end': end})
        if kind == 7:
            return result(f'限对应活动开放期间（活动编号 {v[0]}）', timed=True)
        candidates = predicate_text.get(signature(d), set())
        if len(candidates) == 1:
            return result(next(iter(candidates)))
        unresolved[row['key']] += 1
        return result(f'客户端状态条件 {row["key"]}（未提供可读名称）', unresolved=True)

    def collect(ids, skip_quest=None):
        seen, result = set(), []
        for d in items(ids):
            if skip_quest and d['item_type'] == 3 and d['values'][0] in skip_quest and d['values'][1:] == [1, 0, 0]:
                continue  # Own unclaimed latch is not a prerequisite task.
            key = signature(d)
            if key not in seen:
                seen.add(key); result.append(decode(d))
        # Compress only complete sets of nodes/maps at exactly the same grade.
        grouped = defaultdict(list)
        for r in result:
            if 'grade' in r: grouped[(r['mapId'], r['grade'])].append(r)
        replacements, removed = {}, set()
        for (mid, grade), rs in grouped.items():
            m = maps[mid]
            if {r['nodeId'] for r in rs} != set(m['nodes']): continue
            keys = [r['key'] for r in rs]
            replacements[keys[0]] = {**rs[0], 'key': '|'.join(keys), 'text': f'{m["code"]} {m["name"]}：全节点 {grade} 评价或以上', 'wholeMap': True}
            removed.update(keys[1:])
        result = [replacements.get(r['key'], r) for r in result if r['key'] not in removed]
        grouped = defaultdict(list)
        for r in result:
            if r.get('wholeMap'): grouped[(maps[r['mapId']]['mode'], r['grade'])].append(r)
        replacements, removed = {}, set()
        for (mode, grade), rs in grouped.items():
            ms = [m for m in maps.values() if m['mode'] == mode]
            if not re.fullmatch(r'VOL\d+', mode) or {r['mapId'] for r in rs} != {m['id'] for m in ms}: continue
            keys = [r['key'] for r in rs]
            replacements[keys[0]] = {'key': '|'.join(keys), 'text': f'主线第 {ms[0]["volume"]} 卷全部关卡达到 {grade} 评价或以上'}
            removed.update(keys[1:])
        return [replacements.get(r['key'], r) for r in result if r['key'] not in removed]

    def rewards(rule):
        rows = []
        for tid in rule['field_c8']:
            entries = awards[tid]['items']
            assert len(entries) == 1 and entries[0]['raw_selector'] == 10000000, tid
            pool = pools[entries[0]['award_pool_id']]
            assert pool['pool_flag'] == 1 and len(pool['groups']) == 1 and len(pool['groups'][0]['items']) == 1, pool
            pick = pool['groups'][0]['items'][0]
            assert pick['enabled_flag'] == 10000000 and not pick['demand_group_ids'], pick
            for i in groups[pick['award_group_id']]['items']:
                typ, rid, amount = i['item_type'], i['values'][0], i['amount_or_weight']
                equipment_level = None
                if typ == 3: continue  # Internal achievement records are not inventory rewards.
                if typ == 0:
                    assert rid == 1, i
                    name, icon, kind = '指挥官经验', image('zjm-006'), '经验'
                elif typ == 1:
                    f = funds[rid]; name = text(f['name_string_id']); kind = '物资'
                    if 83 in f['tags']:
                        ls = {equipment_levels[t] for t in f['tags'] if t in equipment_levels}
                        assert len(ls) == 1, (rid, ls)
                        equipment_level = ls.pop()
                        assert 1 <= equipment_level <= 10, (rid, equipment_level)
                        kind = '装备'
                    icon = next((image(r['resource']) for r in sorted(f['resources'], key=lambda r: r['resource_type'] != 5) if r['resource']), '')
                elif typ == 2:
                    assert i['values'][1:] == [1, []], i
                    ap = appearances[phases[rid]['appearance_id']]
                    name = text(ap['name_string_id']); kind = '钢舞姬' if rid in maidens else '道具'
                    icon = image(models[ap['model_id']]['resource_a'])
                else: raise AssertionError(('Unknown reward', i))
                assert name and amount > 0, i
                rows.append({'key': f'{typ}:{rid}', 'name': name, 'image': icon, 'amount': amount, 'kind': kind,
                    **({'equipmentLevel': equipment_level} if equipment_level is not None else {})})
        return rows

    result = []
    for a in sorted(task_rows, key=lambda a: (a['field_4'], a['achievement_id'])):
        aid = a['achievement_id']; rule = rules[aid]
        cats = set(rule['field_40']) & dict(CATEGORIES).keys()
        assert len(cats) == 1 and not rule['field_b0'], (aid, cats)
        own = {d['values'][0] for d in items(a['demands']) if d['item_type'] == 3}
        prerequisites = collect(a['tags'])
        requirements = collect(rule['field_98'], own)
        disabled = any(d['item_type'] == 1 and d['values'][1] > len(crafts[d['values'][0]]['levels'])
            for d in items(a['tags'] + rule['field_98']))
        result.append({'id': aid, 'category': cats.pop(), 'name': text(a['name_string_id']),
            'description': text(a['description_string_id']), 'prerequisites': prerequisites,
            'requirements': requirements, 'rewards': rewards(rule),
            'timed': any(r.get('timed') for r in prerequisites + requirements), 'disabled': disabled,
            'source': {'visibilityDemandIds': a['tags'], 'claimDemandIds': rule['field_98'], 'awardTableIds': rule['field_c8']}})
        if aid == 651010:
            # Native visibility: Quest 8 / assessment 1. Completion: map 245,
            # whose entry requires campaign 51. Its retirement is user-confirmed;
            # do not pretend static tables contain live server campaign status.
            assert a['tags'] == [4735104] and any(r.get('mapId') == 245 for r in requirements)
            assert any(r.get('campaignId') == 51 for r in maps[245]['requirements'])
            result[-1]['retiredReason'] = '所需关卡「沃尔夫斯凯尔悬赏（初级）」已停止开放'
    assert all(r['name'] and r['description'] for r in result)
    assets.close()
    return {'schemaVersion': 1, 'categories': [{'id': tag, 'name': name, 'count': sum(r['category'] == tag for r in result)} for tag, name in CATEGORIES],
        'tasks': result, 'sources': sources, 'audit': {'unresolved': dict(unresolved), 'missingImages': sorted(assets.missing)}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data = build(args.check)
    if args.check:
        assert data == json.loads(OUTPUT.read_text(encoding='utf-8')), 'Task catalog is stale'
    else:
        OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps({'categories': data['categories'], 'audit': data['audit']}, ensure_ascii=False))
