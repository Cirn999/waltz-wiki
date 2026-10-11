"""Native stage gates, including UI-mode gates and formation descriptions.

Keep demand kinds distinct: 3 is quest assessment, 5 inventory, 6 a live
cooldown/progress window, 7 an active campaign, 18 a cooldown-tag count.
See docs/stages.md for the disassembly and Lua evidence.
"""
import html
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta

from decode_configs import Reader, parse_demand_groups, parse_crafts
from inspect_hunt_conditions import parse_quest_achievement
from build_acquisition_dataset import parse_campaign_types
from stage_formation_rewards import attach_formation_rewards


def parse_cooldowns(path):
    return Reader(path.read_bytes()).records(lambda r: {
        'id': r.u32(),
        'properties': [[r.u32(), r.u32()] for _ in range(r.u8())],
        'volatile': [[r.u32(), r.vec_u32()] for _ in range(r.u8())],
        'tags': r.vec_u32(),
    })


def attach_requirements(table, assets, text, maps, levels, styles, funds, awards, pools, groups):
    demands = table('DemandGroupInfo.dat', parse_demand_groups, 'demand_group_id')
    crafts = table('CraftInfo.dat', parse_crafts, 'craft_id')
    quests = table('QuestAchievementInfo.dat', parse_quest_achievement, 'quest_id')
    campaigns = table('CampaignTypeInfo.dat', parse_campaign_types, 'campaign_type_id')
    cooldowns = table('CooldownGroupInfo.dat', parse_cooldowns, 'id')
    owner = {lid: m for m in maps for lid in m['nodes']}
    # ChapterLevelInfo native offset 0x9c (raw_scalar_3), not ID arithmetic.
    quest_nodes = {l['raw_scalar_3']: lid for lid, l in levels.items() if l['raw_scalar_3']}
    audit = {'ignoredNoOp': 0, 'ignoredRuntimeProgress': 0, 'unresolved': [], 'kinds': Counter()}

    def signature(d): return d['item_type'], tuple(d['values'])
    def group_items(ids): return [d for gid in ids for d in demands[gid]['items']]
    def clean(raw): return html.unescape(re.sub(r'<[^>]*>', '', raw)).strip()
    icon_names = {'gjbz-001': '英国', 'gjbz-002': '德国', 'gjbz-003': '苏联', 'gjbz-004': '法国', 'gjbz-005': '日本'}

    def rich_parts(raw):
        parts = []
        for part in re.split(r'(<img\b[^>]*>)', raw):
            image = re.search(r'<img\b[^>]*\bsrc\s*=\s*"([\w-]+)"', part)
            if image:
                code = image[1]
                parts.append({'image': assets.export(code), 'text': icon_names.get(code, '')})
            elif clean(part): parts.append({'text': clean(part)})
        return parts

    # Match complete predicates, never a shared partial tag or a similar name.
    # Styling-only variants collapse to the same text/image tokens.
    descriptions = defaultdict(dict)
    for s in styles.values():
        for item in s['items']:
            if item['mode_code'] != 'RAID_XQ': continue
            ds = group_items(item['demands'])
            if len(ds) != 1: continue
            raw = next((text(e['value']) for e in item['number_entries'] if e['entry_id'] == 5), '')
            if raw and '#$' not in raw:
                canonical = re.sub(r'</?font\b[^>]*>', '', raw)
                descriptions[signature(ds[0])][canonical] = raw

    scores = {}
    for s in styles.values():
        for item in s['items']:
            if item['mode_code'] == 'LETTER_RESULT':
                score = int(item['filter_code'].removeprefix('LETTER_RESULT_'))
                scores[score] = next(text(n['value']) for n in item['number_entries'] if n['entry_id'] == 5)

    def reference(lid, whole_map=False):
        m = owner[lid]
        prefix = f'{m["code"]} ' if m['volume'] else ''
        name = prefix + m['name']
        if not whole_map: name += f' · 节点 {m["nodes"].index(lid) + 1}'
        return {'mapId': m['id'], 'nodeId': lid, 'name': name}

    def condition(kind, description, image='', **extra):
        audit['kinds'][kind] += 1
        return {'kind': kind, 'text': description, 'image': assets.export(image) if image else '', **extra}

    def decode(d):
        typ = d['item_type']; v = d['values']; key = signature(d)
        if typ in (19, 20) or (typ == 3 and v[0] == 310):
            options = descriptions.get(key, {})
            assert len(options) == 1, f'Ambiguous native requirement description: {key}: {options}'
            parts = rich_parts(next(iter(options.values())))
            return condition('formation' if typ in (19, 20) else 'prerequisite', ''.join(p['text'] for p in parts), parts=parts)
        if typ == 1:
            cid, lo, hi = v
            name = text(crafts[cid]['name_string_id'])
            suffix = f'{lo} 级' if hi in (32767, 2147483647) else f'{lo} 级（客户端限定）' if hi == lo else f'{lo}–{hi} 级'
            relation = '=' if lo == hi else '≥' if hi in (32767, 2147483647) else '为'
            return condition('level', f'{name}等级 {relation} {suffix}', crafts[cid]['name'], value=lo, craftId=cid)
        if typ == 3:
            qid, assessment, lo, hi = v
            if assessment == 10:
                tags = quests[qid]['achievement_ids']
                if 7 in tags: name, icon = '鹰标总和', 'kjtx-007'
                elif 49 in tags: name, icon = '金桨总和', 'kjtx-040'
                elif qid in (71, 72):
                    name, icon = ('多福莱尼前段累计评价' if qid == 71 else '多福莱尼后段累计评价'), ''
                else: raise AssertionError(f'Unknown cumulative quest {qid}')
                return condition('medal', f'{name} ≥ {lo}', icon, value=lo, questId=qid)
            if assessment == 9:
                assert hi == 2147483647 and lo in scores, v
                lid = quest_nodes[qid]; ref = reference(lid, True)
                return condition('prerequisite', f'{ref["name"]}：{scores[lo]} 评价或以上',
                    refs=[ref], score=lo, grade=scores[lo])
        if typ == 5:
            fid, lo, hi = v
            if lo == 0 and hi == 2147483647:
                audit['ignoredNoOp'] += 1; return None
            f = funds[fid]; name = text(f['name_string_id'])
            icon = next((r['resource'] for r in f['resources'] if r['resource_type'] == 5), '')
            return condition('item', f'持有{name} ≥ {lo}', icon, fundId=fid, value=lo)
        if typ == 6:
            cid, lo, hi = v
            assert lo == 1 and hi == 2147483647, v
            if cid in (302, 304):
                # Group 302/304 carries ceremony eligibility tags 741/771;
                # positive remaining time means valid admission, not a wait.
                return condition('availability', '群岛活动入场资格仍在有效期内', cooldownId=cid)
            assert 11 in cooldowns[cid]['tags'], f'Unknown progress token {cid}'
            # User only wants map admission, not individual battle-node flow.
            audit['ignoredRuntimeProgress'] += 1
            return None
        if typ == 7:
            cid, active = v; c = campaigns[cid]
            name = text(c['name_string_id']) or '对应活动'
            return condition('availability', f'{name}处于开放期' if active else f'{name}未开放时', campaignId=cid)
        if typ == 9:
            start, end, inside = v
            assert inside == 1, v
            date = lambda stamp: datetime.fromtimestamp(stamp, timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
            value = f'{date(start)} 后开放' if end == 4294967295 else f'开放时间：{date(start)}–{date(end)}'
            return condition('availability', value + '（北京时间；实际开放以游戏内为准）')
        if typ == 18:
            assert v == [11, 0, 0], v
            audit['ignoredRuntimeProgress'] += 1
            return None
        raise AssertionError(f'Unparsed stage demand: {d}')

    def collect(ids):
        result = []; seen = set()
        for d in group_items(ids):
            key = signature(d)
            if key in seen: continue
            seen.add(key)
            row = decode(d)
            if row:
                row['key'] = ':'.join(map(str, [d['item_type'], *d['values']]))
                result.append(row)
        return result

    def compact(rows):
        # A volume gate names all four prerequisite maps; collapse only when the
        # complete set is present at the same grade. Keep refs for the full names.
        grouped = defaultdict(list)
        for row in rows:
            if row.get('score') and len(row.get('refs', [])) == 1:
                m = owner[row['refs'][0]['nodeId']]
                grouped[(m['mode'], row['score'])].append(row)
        replacements = {}; removed = set()
        for (mode, score), group in grouped.items():
            matching = [m for m in maps if m['mode'] == mode]
            if len(group) < 2 or not re.fullmatch(r'VOL\d+', mode): continue
            if {r['refs'][0]['mapId'] for r in group} != {m['id'] for m in matching}: continue
            keys = [r['key'] for r in group]
            replacements[keys[0]] = {**group[0], 'key': '|'.join(keys),
                'text': f'第 {matching[0]["volume"]} 卷全部 {len(matching)} 张地图达到 {scores[score]} 评价或以上',
                'refs': [ref for row in group for ref in row['refs']]}
            removed.update(keys[1:])
        return [replacements.get(r['key'], r) for r in rows if r['key'] not in removed]

    mode_gates = defaultdict(set)
    for s in styles.values():
        for item in s['items']:
            if item['mode_code'] == 'STORY': mode_gates[item['filter_code']].update(item['demands'])
    for m in maps:
        ids = sorted(mode_gates[m['mode']])
        # The synthetic orphan list is not an actual map entry point.
        if m['id'] != -1: ids += levels[m['nodes'][0]]['demand_group_ids']
        m['requirements'] = compact(collect(ids))
    audit['formationRewards'] = attach_formation_rewards(table, assets, text, maps, levels,
        styles, funds, quests, demands, rich_parts, awards, pools, groups)
    audit['kinds'] = dict(audit['kinds'])
    return audit
