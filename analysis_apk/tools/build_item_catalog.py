"""Native warehouse tabs 82/99. Never turn alternative awards into guaranteed loot."""
import argparse
import hashlib
import json
from collections import defaultdict
from decode_configs import (config_path, parse_string_table, parse_arranged_styles,
    parse_produce_rules, parse_consume_groups, parse_fund_achievements,
    parse_demand_groups, parse_capsule_phases, parse_unit_appearances, parse_role_models, parse_capsule_faculty_trains, parse_crafts, parse_capsule_types)
from export_level_enemy_data import parse_fund_types, parse_award_tables, parse_award_pools, parse_award_groups, parse_chapter_levels
from inspect_acquisition_configs import parse_commodities
from stage_assets import ROOT, StageAssets
from build_task_catalog import clean
from stage_requirements import parse_cooldowns
from item_timed_effects import guaranteed_cooldowns, timed_effect_index, describe_timed_effects
from item_exchanges import build_exchanges

PUBLIC = ROOT/'steel-maiden-browser/public'
OUTPUT = PUBLIC/'data/item-catalog.json'


def build(check=False):
    sources = {}
    def table(name, parser, key, overlay=False):
        result = {}
        for p in ([ROOT/'Resources/config'/name, ROOT/'patch/_1.18/config'/name] if overlay else [config_path(name)]):
            if p.exists():
                result.update({r[key]: r for r in parser(p)})
                sources[p.relative_to(ROOT).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
        return result
    strings = table('StringTableInfo.dat', parse_string_table, 'string_id', True)
    def text(sid): return clean((strings.get(sid, {}).get('strings') or [''])[0])
    funds = table('FundTypeInfo.dat', parse_fund_types, 'fund_id', True)
    descriptions = table('FundAchievementInfo.dat', parse_fund_achievements, 'fund_id', True)
    styles = table('ArrangedStyleInfo.dat', parse_arranged_styles, 'arranged_style_id')
    rules = table('ProduceRuleInfo.dat', parse_produce_rules, 'rule_id')
    consumes = table('ConsumeGroupInfo.dat', parse_consume_groups, 'consume_group_id')
    demands = table('DemandGroupInfo.dat', parse_demand_groups, 'demand_group_id')
    tables = table('AwardTableInfo.dat', parse_award_tables, 'award_table_id')
    pools = table('AwardPoolInfo.dat', parse_award_pools, 'award_pool_id')
    groups = table('AwardGroupInfo.dat', parse_award_groups, 'award_group_id')
    commodities = table('CommodityInfo.dat', parse_commodities, 'commodity_id')
    cooldowns = table('CooldownGroupInfo.dat', parse_cooldowns, 'id')
    crafts = table('CraftInfo.dat', parse_crafts, 'craft_id')
    levels = table('ChapterLevelInfo.dat', parse_chapter_levels, 'level_id')
    stage_path = PUBLIC/'data/stage-catalog.json'
    stages = json.loads(stage_path.read_text(encoding='utf-8'))
    sources[stage_path.relative_to(ROOT).as_posix()] = hashlib.sha256(stage_path.read_bytes()).hexdigest()
    stage_owners = {lid: m for m in stages['maps'] for lid in m['nodes']}
    quest_levels = {l['raw_scalar_3']: l['level_id'] for l in levels.values() if l['raw_scalar_3']}
    result_grades = {int(i['filter_code'].removeprefix('LETTER_RESULT_')): text(e['value'])
        for s in styles.values() for i in s['items'] if i['mode_code'] == 'LETTER_RESULT'
        for e in i['number_entries'] if e['entry_id'] == 5}
    def sale_condition(d):
        typ, v = d['item_type'], d['values']
        if typ == 3 and v[1] == 9 and v[0] in quest_levels and v[2] in result_grades and v[3] == 2147483647:
            lid = quest_levels[v[0]]; m = stage_owners[lid]
            return f'{m["code"]}「{m["name"]}」第{m["nodes"].index(lid)+1}战斗节点达到{result_grades[v[2]]}评价或以上'
        if typ == 1 and v[0] in crafts:
            name = text(crafts[v[0]]['name_string_id'])
            bounds = f'≥{v[1]}' if v[2] in (32767, 2147483647) else f'{v[1]}–{v[2]}'
            # EXPANSION is an internal unlock, not a named player building.
            if name == 'EXPANSION': return f'需满足客户端功能解锁条件（EXPANSION {bounds}；原版未提供中文名称）'
            return f'{name}等级{bounds}'
        raise AssertionError(('Unreviewed item sale condition', d))
    def timed_effects(rid):
        return guaranteed_cooldowns(rid, rules, tables, pools, groups, demands)
    timed_index = timed_effect_index(commodities, timed_effects, text)
    phases = table('CapsulePhaseInfo.dat', lambda p: [r for r in parse_capsule_phases(p)[0] if r['phase'] == 1], 'capsule_type_id')
    appearances = table('UnitAppearanceInfo.dat', parse_unit_appearances, 'appearance_id')
    models = table('roleModelInfo.dat', parse_role_models, 'role_model_id')
    trains = table('CapsuleFacultyTrainInfo.dat', parse_capsule_faculty_trains, 'train_id')
    training_uses = defaultdict(set)
    for train in trains.values():
        action = '亮星' if train['group_d_values'] else '授勋' if 1550 in train['group_a_ids'] else '培养'
        for cid in train['group_f_ids']:
            for i in consumes[cid]['items']:
                if i['item_type'] == 0: training_uses[i['values'][0]].add(action)
    assets = StageAssets(check=check)
    assets.out = PUBLIC/'art/items'
    if not check: assets.out.mkdir(parents=True, exist_ok=True)
    def image(code): return assets.export(code).replace('/art/stages/', '/art/items/')
    def fund_image(fid):
        for r in sorted(funds[fid]['resources'], key=lambda r: (r['resource_type'] != 9, r['resource_type'] != 5)):
            if r['resource_type'] not in (5, 9): continue
            icon = image(r['resource'])
            if icon: return icon
        return ''
    def consumed(rule): return [i for cid in rule['field_b0'] for i in consumes[cid]['items']]
    spending = defaultdict(list)
    for rule in rules.values():
        for i in consumed(rule):
            if i['item_type'] == 0: spending[i['values'][0]].append(rule)
    products = defaultdict(set)
    for c in commodities.values():
        if text(c['field_20']): products[c['field_58']].add(text(c['field_20']))
    grades = {t: e['value'] for s in styles.values() for t in s['tags'] for i in s['items']
        if i['mode_code'] == 'EQULEVEL' for e in i['number_entries'] if e['entry_id'] == 1}
    def reward(i):
        typ, rid, amount = i['item_type'], i['values'][0], i['amount_or_weight']
        if typ in (3, 4, 7): return None  # Quest bookkeeping / effects, not inventory loot.
        row = {'key': f'{typ}:{rid}', 'amount': amount}
        if typ == 1:
            f = funds[rid]
            row.update(name=text(f['name_string_id']), image=fund_image(rid))
            if 83 in f['tags']:
                levels = {grades[t] for t in f['tags'] if t in grades}
                assert len(levels) == 1, rid
                row['equipmentLevel'] = levels.pop()
        elif typ == 0:
            assert rid == 1, i
            row.update(name='指挥官经验', image=image('zjm-006'))
        elif typ == 2:
            a = appearances[phases[rid]['appearance_id']]
            row.update(name=text(a['name_string_id']), image=image(models[a['model_id']]['resource_a']))
        else: raise AssertionError(i)
        assert row['name'] and amount > 0, i
        return row
    def empty_demands(ids): return all(not demands[d]['items'] for d in ids)
    def use_rewards(rule, single_choice_sale=False):
        fixed, possible, effects = [], [], []
        for tid in rule['field_c8']:
            for entry in tables[tid]['items']:
                pool = pools[entry['award_pool_id']]
                picks = [p for g in pool['groups'] for p in g['items'] if p['enabled_flag'] > 0]
                # Legacy silver tickets use a single-choice pool (0), with one
                # full-weight, unconditional choice. This is also a fixed sale.
                fixed_pool = pool['pool_flag'] == 1 or (single_choice_sale and pool['pool_flag'] == 0 and len(pool['groups']) == 1)
                certain = (entry['raw_selector'] == 10000000 and fixed_pool and len(picks) == 1
                    and picks[0]['enabled_flag'] == 10000000 and empty_demands(picks[0]['demand_group_ids']))
                for pick in picks:
                    for i in groups[pick['award_group_id']]['items']:
                        r = reward(i)
                        if r: (fixed if certain else possible).append(r)
                        if i['item_type'] in (4, 7): effects.append(i)
        # Aggregate guaranteed entries only; alternatives keep distinct quantities.
        merged = {}
        for r in fixed:
            if r['key'] in merged: merged[r['key']]['amount'] += r['amount']
            else: merged[r['key']] = dict(r)
        possible = list({(r['key'], r['amount']): r for r in possible}.values())
        return list(merged.values()), possible, effects
    maiden_path = PUBLIC/'data/maidens.json'
    maiden_data = json.loads(maiden_path.read_text(encoding='utf-8'))
    sources[maiden_path.relative_to(ROOT).as_posix()] = hashlib.sha256(maiden_path.read_bytes()).hexdigest()
    maiden_ids = {m['id'] for m in maiden_data['rows']}
    capsule_types = table('CapsuleTypeInfo.dat', parse_capsule_types, 'capsule_type_id')
    capsules_by_tag = defaultdict(set)
    for c in capsule_types.values():
        if c['capsule_type_id'] in maiden_ids:
            for tag in c['group_a_ids'] + c['group_b_ids'] + [c['growth_tag_id']]:
                capsules_by_tag[tag].add(c['capsule_type_id'])
    outfit_cards = {}
    for fid, f in funds.items():
        if 84 not in f['tags']: continue
        matches = [capsules_by_tag[t] for t in f['tags'] if t != 84 and capsules_by_tag[t]]
        if matches:
            size = min(map(len, matches))
            outfit_cards[fid] = set().union(*(m for m in matches if len(m) == size))
    item_ids = {fid for fid, f in funds.items() if 81 in f['tags'] and set(f['tags']) & {82, 99}}
    exchanges, item_exchanges = build_exchanges(commodities, rules, consumes, tables, pools, groups,
        demands, item_ids, text, image, reward, maiden_ids, outfit_cards)
    rows = []
    for fid, f in sorted(funds.items()):
        cats = set(f['tags']) & {82, 99}
        if 81 not in f['tags'] or not cats: continue
        assert len(cats) == 1
        description = text(descriptions.get(fid, {}).get('description_string_id'))
        uses, fixed, possible, rule_ids = [], [], [], []
        timed_evidence = []
        sale = None
        # FundUI.lua:10381–10405 checks fund tag 1701, then recipe tags 1701/1501
        # and the exact consumed fund. A sale tag alone is NOT a valid sell recipe.
        sale_rules = [r for r in spending[fid] if {1701, 1501} <= set(r['field_40']) and 1701 in f['tags']]
        assert len(sale_rules) <= 1, (fid, sale_rules)
        if sale_rules:
            sell = sale_rules[0]
            assert consumed(sell) == [{'item_type': 0, 'values': [fid], 'amount': 1}], sell
            sale_fixed, sale_possible, sale_effects = use_rewards(sell, single_choice_sale=True)
            assert sale_fixed and not sale_possible and not sale_effects, ('Non-fixed sale', fid)
            conditions = [d for did in sell['field_98'] for d in demands[did]['items']]
            sale = {'quantity': 1, 'rewards': sale_fixed,
                    'conditions': [sale_condition(d) for d in conditions]}
        kind = '其他'
        gift = [r for r in spending[fid] if set(r['field_40']) & {773, 1702, 1704} and
            len(consumed(r)) == 1 and consumed(r)[0]['amount'] == 1]
        assert len(gift) <= 1, (fid, [r['rule_id'] for r in gift])
        if gift:
            rule = gift[0]; rule_ids = [rule['rule_id']]
            fixed, possible, effects = use_rewards(rule)
            kind = '消耗品'
            uses.append('每使用 1 个，获得下列奖励。' if not possible else '每使用 1 个按原版奖池发放奖励；随机或条件奖励并非全部获得。')
            if effects:
                resolved = describe_timed_effects(timed_effects(rule['rule_id']), timed_index, cooldowns)
                if resolved:
                    uses, timed_evidence = resolved
                else:
                    uses = [description or f'使用后触发「{text(f["name_string_id"])}」对应的功能效果，不直接发放背包物资；效果详情以游戏内使用界面为准。']
            elif not fixed and not possible:
                uses = ['使用后写入对应解锁记录，不直接发放背包物资。']
        if training_uses[fid]:
            uses.insert(0, '用于钢舞姬' + '、'.join(sorted(training_uses[fid])) + '，用量依具体车辆及阶段而定。')
            if kind == '其他': kind = '培养材料'
        product_names = sorted({n for r in spending[fid] if r not in gift for n in products[r['rule_id']]})
        if product_names:
            uses.append('可作为兑换消耗，用于：' + '、'.join(product_names) + '。兑换仍需满足对应开放条件及其他费用。')
            if kind == '其他': kind = '兑换材料'
        skin_styles = [s for s in styles.values() if set(s['tags']) & set(f['tags']) and any(i['mode_code'] == 'Skinname' for i in s['items'])]
        if skin_styles:
            # Shared Train tags identify the maiden, NOT one specific skin.
            # Do not attribute all that maiden's skins to a single costume box.
            uses.append('钢舞姬时装道具，用于对应钢舞姬的时装功能。')
            kind = '时装'
        if fid in (4254, 4255, 4256, 4257):
            assert not spending[fid]
            assert {i['values'][0] for i in demands[2094]['items'] if i['item_type'] == 5} == {4254,4255,4256,4257}
            assert all(2094 in commodities[c]['field_40'] for c in (549, 35218))
            uses = ['集齐 T、H、I、S 型地雷各至少 1 个，可满足「探雷标兵」的购买资格条件。地雷本身不被消耗；徽章仍需另行购买，并非集齐自动领取。',
                '来自「探雷行动」活动。游戏说明中的战场描述是背景文字，未发现将此道具直接用于战斗的消耗配置。']
            kind = '解锁凭证'
        if sale:
            uses.append('可在仓库出售；每出售1个的所得列于下方，与使用奖励、兑换用途分开计算。')
            if kind == '其他': kind = '可出售道具'
        elif 1701 in f['tags']:
            uses.append('客户端带有出售标记，但本地未找到对应的仓库出售配方，暂不列出未经确认的出售所得。')
        if not uses and spending[fid]:
            uses = ['本地配方将此道具列为消耗材料；具体用途与用量以对应研发、兑换或活动界面为准。']
            kind = '材料'
        if not uses: uses = [description or '本地配置未提供明确用途说明；保留原版道具记录，暂不推测效果。']
        rows.append({'id': fid, 'name': text(f['name_string_id']), 'image': fund_image(fid),
            'category': cats.pop(), 'kind': kind, 'description': description, 'uses': uses,
            'fixedRewards': fixed, 'possibleRewards': possible,
            'sale': sale, 'exchangeIds': item_exchanges[fid],
            'source': {'tags': f['tags'], 'useRuleIds': rule_ids, 'consumeRuleIds': sorted({r['rule_id'] for r in spending[fid]}),
                'timedEffects': timed_evidence,
                'saleRuleIds': [r['rule_id'] for r in sale_rules],
                'saleAwardTableIds': [tid for r in sale_rules for tid in r['field_c8']],
                'saleDemandGroups': [demands[did] for r in sale_rules for did in r['field_98']],
                'awardTableIds': [t for r in gift for t in r['field_c8']]}})
    assets.close()
    assert len(rows) == 413
    # Native tm-001 is deliberately transparent, not a missing replacement icon.
    assert [r['id'] for r in rows if not r['image']] == [4229]
    assert all(r['name'] for r in rows)
    return {'schemaVersion': 1, 'items': rows, 'exchanges': exchanges, 'sources': sources,
        'audit': {'count': len(rows), 'missingImages': sorted(assets.missing),
            'saleCount': sum(r['sale'] is not None for r in rows),
            'saleTagWithoutRecipe': [r['id'] for r in rows if 1701 in r['source']['tags'] and not r['sale']]}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    data = build(args.check)
    if args.check: assert json.loads(OUTPUT.read_text(encoding='utf-8')) == data, 'Item catalog is stale'
    else: OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps(data['audit'], ensure_ascii=False))
