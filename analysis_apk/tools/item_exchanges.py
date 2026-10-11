"""Commodity -> production recipe -> full costs / guaranteed outcomes.

Do not flatten random/conditional award pools into a list of guaranteed vehicles.
Keep separate commodity offers (prices and opening conditions may differ).
"""
from collections import defaultdict


def build_exchanges(commodities, rules, consumes, tables, pools, groups, demands,
                    item_ids, text, image, reward, maiden_ids, outfit_cards):
    offers, by_fund = [], defaultdict(list)
    for c in sorted(commodities.values(), key=lambda c: c['commodity_id']):
        rule = rules.get(c['field_58'])
        if not rule or set(rule['field_40']) & {1501, 773, 1702, 1704}:
            continue  # Warehouse sale/use is shown separately, never as an exchange.
        raw_costs = [i for cid in rule['field_b0'] for i in consumes[cid]['items']]
        linked = {i['values'][0] for i in raw_costs if i['item_type'] == 0} & item_ids
        if not linked:
            continue
        costs, fixed, notes = {}, {}, []
        for i in raw_costs:
            if i['item_type'] != 0:
                # Non-fund consumption is not an inventory currency. Retain raw
                # evidence rather than calling a cooldown amount an item price.
                notes.append('此外还有非道具消耗限制，需以游戏兑换界面为准。')
                continue
            r = reward({'item_type': 1, 'values': i['values'], 'amount_or_weight': i['amount']})
            if r['key'] in costs:
                costs[r['key']]['amount'] += r['amount']
            else:
                costs[r['key']] = r
        uncertain = False
        effects = set()
        for tid in rule['field_c8']:
            for entry in tables[tid]['items']:
                pool = pools[entry['award_pool_id']]
                picks = [p for g in pool['groups'] for p in g['items'] if p['enabled_flag'] > 0]
                certain = (entry['raw_selector'] == 10000000
                    and (pool['pool_flag'] == 1 or (pool['pool_flag'] == 0 and len(pool['groups']) == 1))
                    and len(picks) == 1 and picks[0]['enabled_flag'] == 10000000
                    and all(not demands[d]['items'] for d in picks[0]['demand_group_ids']))
                for p in picks:
                    for i in groups[p['award_group_id']]['items']:
                        typ, rid = i['item_type'], i['values'][0]
                        if typ == 3:
                            continue  # Quest progress, not a physical reward.
                        if not certain:
                            uncertain = True
                            continue
                        if typ not in (0, 1, 2):
                            effects.add(typ)
                            continue
                        r = reward(i)
                        if typ == 2 and rid in maiden_ids:
                            r['maidenId'] = rid
                        if typ == 1 and len(outfit_cards.get(rid, [])) == 1:
                            r['maidenId'] = next(iter(outfit_cards[rid]))
                            r['outfit'] = True
                        if r['key'] in fixed:
                            fixed[r['key']]['amount'] += r['amount']
                        else:
                            fixed[r['key']] = r
        if uncertain:
            notes.append('含随机或条件结果；仅列出已确认必得的物品，不把奖池中的车辆标为必得。')
        if effects:
            notes.append('另含功能效果，不属于直接发放的背包物品。')
        name = text(c['field_20']).split('|')[0]
        if not name:
            name = ' / '.join(r['name'] for r in fixed.values())
        assert name and costs, c
        offer = {'id': c['commodity_id'], 'name': name,
            'image': image(c['name']), 'rewards': list(fixed.values()),
            'costs': list(costs.values()),
            'kind': '随机／条件兑换' if uncertain else '物品兑换' if fixed else '功能解锁／效果',
            'notes': list(dict.fromkeys(notes)),
            'source': {'ruleId': rule['rule_id'], 'awardTableIds': rule['field_c8'],
                'visibilityDemandIds': c['field_40'], 'demandIds': rule['field_98'],
                'otherConsumes': [i for i in raw_costs if i['item_type'] != 0]}}
        offers.append(offer)
        for fid in linked:
            by_fund[fid].append(offer['id'])
    return offers, by_fund
