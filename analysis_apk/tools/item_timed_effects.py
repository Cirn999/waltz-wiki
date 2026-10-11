"""Join warehouse-use cooldowns to the SAME cooldown's native shop description.

Never borrow the shop's duration: warehouse coupons have different durations.
Only traverse unconditional, guaranteed awards; type 7 invokes another recipe.
"""


def signed32(value):
    return value if value < 0x80000000 else value - 0x100000000


def guaranteed_cooldowns(rid, rules, tables, pools, groups, demands, trail=()):
    if rid in trail:
        raise ValueError(f'Cyclic item effect recipe: {trail + (rid,)}')
    result = []
    for tid in rules[rid]['field_c8']:
        for entry in tables[tid]['items']:
            pool = pools[entry['award_pool_id']]
            picks = [p for g in pool['groups'] for p in g['items'] if p['enabled_flag'] > 0]
            if not (entry['raw_selector'] == 10000000 and pool['pool_flag'] == 1 and len(picks) == 1
                    and picks[0]['enabled_flag'] == 10000000
                    and all(not demands[d]['items'] for d in picks[0]['demand_group_ids'])):
                return None
            for award in groups[picks[0]['award_group_id']]['items']:
                if award['item_type'] == 7:
                    # These native coupons invoke one recipe, once. Do not guess other modes.
                    if award['values'][1:] != [1, 0] or award['amount_or_weight'] != 1:
                        return None
                    nested = guaranteed_cooldowns(award['values'][0], rules, tables, pools,
                                                  groups, demands, trail + (rid,))
                    if nested is None:
                        return None
                    result.extend(nested)
                elif award['item_type'] == 4:
                    seconds = -signed32(award['amount_or_weight'])
                    if seconds <= 0:
                        return None
                    result.append({'cooldownId': award['values'][0], 'durationSeconds': seconds,
                                   'effectRuleIds': list(trail + (rid,))})
                elif award['item_type'] != 3:  # Internal quest bookkeeping is harmless.
                    return None  # Mixed inventory/effect awards need separate presentation.
    return result


def timed_effect_index(commodities, resolve, text):
    """Reviewed native sustained-effect descriptions, matched by cooldown, not name."""
    result = {}
    for c in commodities.values():
        sid = c['field_60']
        if not 2700009 <= sid <= 2700021:
            continue
        effects = resolve(c['field_58'])
        assert effects and len(effects) == 1, c
        cid = effects[0]['cooldownId']
        row = result.setdefault(cid, {'descriptionStringId': sid, 'nativeDescription': text(sid),
                                      'commodityIds': []})
        assert row['descriptionStringId'] == sid and row['nativeDescription'], c
        row['commodityIds'].append(c['commodity_id'])
    return result


def describe_timed_effects(effects, index, cooldowns):
    if not effects or any(e['cooldownId'] not in index for e in effects):
        return None
    uses, evidence = [], []
    for effect in effects:
        cid, seconds = effect['cooldownId'], effect['durationSeconds']
        if seconds % 3600:
            return None
        native = index[cid]
        hours = seconds // 3600
        duration = f'{hours}小时' + (f'（{hours // 24}天）' if hours % 24 == 0 else '')
        uses.append(f'使用后：{native["nativeDescription"]}。持续{duration}。')
        if cid == 206:
            uses.append('领地密码子额外产出按基础产出的350%向下取整，再加上基础产出；不是立即领取对应时长的产量。')
        elif cid in (201, 202, 203, 204, 205, 207, 208, 209):
            uses.append('这是持续恢复／生产加成，不会立即发放对应时长的资源。')
        elif cid in (211, 212, 214):
            uses.append('只提高存储上限，不会立即补满资源；到期后扣除超出恢复后上限的部分。')
        evidence.append({**effect, **native, 'cooldownProperties': cooldowns[cid]['properties'],
                         'cooldownVolatile': cooldowns[cid]['volatile'],
                         'cooldownTags': cooldowns[cid]['tags']})
    return uses, evidence
