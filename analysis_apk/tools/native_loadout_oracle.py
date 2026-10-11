"""Run the extracted client's ARM64 attribute routines, with its original Lua math.

Unicorn executes native parameter combining, template calculation, per-step integer
conversion, and rule composition. Hooks supply config records and host services
(allocation, lookup, role properties, Lua); they do not replace attribute math.
This never connects to an account or changes an installed game.
"""
from __future__ import annotations

import io
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis_apk/pydeps'))
from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_HOOK_CODE, UcError
from unicorn.arm64_const import UC_ARM64_REG_X0, UC_ARM64_REG_X8, UC_ARM64_REG_X30, UC_ARM64_REG_SP, UC_ARM64_REG_PC, UC_ARM64_REG_TPIDR_EL0, UC_ARM64_REG_CPACR_EL1
from lupa.lua53 import LuaRuntime
from elftools.elf.elffile import ELFFile
from analyze_elf import load_symbols, load_plt_symbols
from decode_configs import (config_path, parse_growth_templates, parse_growth_rules, parse_faculty_attribute_param_rules, parse_faculty_trend_groups, parse_faculty_extend_links,
    parse_capsule_types, parse_capsule_phases, parse_unit_trait_types, parse_unit_trait_growth_rules, parse_feature_calculations, parse_role_properties, Reader)


def source_path(name):
    try:
        return config_path(name)
    except FileNotFoundError:
        return ROOT / 'analysis_apk/apk_bootstrap_config' / name


class NativeOracle:
    ELF = ROOT / 'analysis_apk/extracted/lib/arm64-v8a/libasgame.so'
    HEAP = 0x20000000
    STOP = 0x10000000

    def __init__(self):
        self.uc = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
        elf = ELFFile(io.BytesIO(self.ELF.read_bytes()))
        segments = [s for s in elf.iter_segments() if s['p_type'] == 'PT_LOAD']
        end = max(s['p_vaddr'] + s['p_memsz'] for s in segments)
        self.uc.mem_map(0, (end + 4095) & ~4095)
        for s in segments:
            self.uc.mem_write(s['p_vaddr'], s.data())
        self.symbols = {s['name']: s['value'] for s in load_symbols(elf)}
        self.plt = load_plt_symbols(elf)
        for section_name in ['.rela.dyn', '.rela.plt']:
            section = elf.get_section_by_name(section_name)
            if not section:
                continue
            symbols = elf.get_section(section['sh_link'])
            for r in section.iter_relocations():
                kind = r['r_info_type']
                if kind == 1027:
                    self.write(r['r_offset'], 'Q', r['r_addend'])
                elif kind in [257, 1025, 1026]:
                    value = symbols.get_symbol(r['r_info_sym'])['st_value']
                    self.write(r['r_offset'], 'Q', value + r['r_addend'])
        self.uc.mem_map(self.STOP, 0x200000)
        self.uc.mem_map(self.HEAP, 0x10000000)
        self.cursor = self.HEAP
        self.uc.reg_write(UC_ARM64_REG_TPIDR_EL0, self.STOP + 0x1000)
        self.uc.reg_write(UC_ARM64_REG_CPACR_EL1, 3 << 20)
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.lua.execute((ROOT / 'Resources/RanaScripts/luaFunction/AttributeManager.lua').read_text(encoding='utf-8-sig'))
        self.templates = {r['template_id']: r for r in parse_growth_templates(source_path('AttributeGrowthTemplateInfo.dat'))}
        self.rules = {(r['rule_type'], r['rule_id']): r for r in parse_growth_rules(source_path('AttributeGrowthRuleInfo.dat'))}
        self.params = {r['param_rule_id']: r for r in parse_faculty_attribute_param_rules(source_path('FacultyAttributeParamRuleInfo.dat'))}
        self.groups = {r['trend_group_id']: r for r in parse_faculty_trend_groups(source_path('FacultyTrendGroupInfo.dat'))}
        self.links = {r['extend_group_id']: r for r in parse_faculty_extend_links(source_path('FacultyExtendLinkInfo.dat'))}
        self.capsules = {r['capsule_type_id']: r for r in parse_capsule_types(source_path('CapsuleTypeInfo.dat'))}
        self.phases = {(r['capsule_type_id'], r['phase']): r for r in parse_capsule_phases(source_path('CapsulePhaseInfo.dat'))[0]}
        self.trait_types = {r['trait_id']: r for r in parse_unit_trait_types(source_path('UnitTraitTypeInfo.dat'))}
        self.trait_rules = {r['growth_rule_id']: r for r in parse_unit_trait_growth_rules(source_path('UnitTraitGrowthRuleInfo.dat'))}
        self.features = {(r['feature_type'], r['feature_id']): r for r in parse_feature_calculations(source_path('FeatureCalculateInfo.dat'))}
        self.faculty_growth = dict(Reader(source_path('FacultyGrowthRuleInfo.dat').read_bytes()).records(lambda r: (r.u32(), [r.i32() for _ in range(r.u8())])))
        self.property_defaults = {r['property_id']: r['field_1'] for r in parse_role_properties(source_path('RolePropertyInfo.dat'))}
        self.cache = {}
        self.properties = {}
        self.calls = 0
        self.uc.hook_add(UC_HOOK_CODE, self.hook, begin=min(self.plt), end=max(self.plt) + 15)
        self.call(self.symbols['lua_version'], 0)
        native_lua_version = self.read(self.uc.reg_read(UC_ARM64_REG_X0), 'd')
        assert native_lua_version == 503 and self.lua.lua_version == (5, 3), 'Oracle Lua ABI must match the client'

    def alloc(self, n, data=b''):
        p = self.cursor
        self.cursor += (max(n, len(data), 16) + 15) & ~15
        if self.cursor >= self.HEAP + 0x10000000:
            raise RuntimeError('Oracle heap exhausted')
        self.uc.mem_write(p, data + bytes(max(n - len(data), 0)))
        return p

    def write(self, p, fmt, *values):
        self.uc.mem_write(p, struct.pack('<' + fmt, *values))

    def read(self, p, fmt):
        return struct.unpack('<' + fmt, self.uc.mem_read(p, struct.calcsize('<' + fmt)))[0]

    def vector(self, blobs, at=None):
        b = b''.join(blobs)
        p = self.alloc(len(b), b) if b else 0
        header = struct.pack('<QQQ', p, p + len(b), p + len(b))
        if at is not None:
            self.uc.mem_write(at, header)
            return at
        return self.alloc(24, header)

    def elements(self, vector, size):
        return range(self.read(vector, 'Q'), self.read(vector + 8, 'Q'), size)

    def function_blob(self, f):
        p = self.alloc(32)
        self.write(p, 'H', f['function_id'])
        params = []
        for param in f['params']:
            a = self.alloc(40)
            self.write(a, 'B', param['param_id'])
            self.vector([struct.pack('<H', v) for v in param['input_ids']], a + 8)
            self.write(a + 32, 'i', param['default_value'])
            params.append(bytes(self.uc.mem_read(a, 40)))
        self.vector(params, p + 8)
        return bytes(self.uc.mem_read(p, 32))

    def template_ptr(self, id):
        key = ('template', id)
        if key not in self.cache:
            row = self.templates.get(id)
            if row is None:
                raise KeyError(key)
            p = self.alloc(32)
            self.write(p, 'I', id)
            entries = []
            for a in row['attributes']:
                q = self.alloc(40)
                self.write(q, 'B', a['attribute_id'])
                self.vector([struct.pack('<B3xIB3x', r['rule_type'], r['rule_id'], r['selector']) for r in a['rules']], q + 8)
                self.write(q + 32, 'ii', a['multiplier'], a['base'])
                entries.append(bytes(self.uc.mem_read(q, 40)))
            self.vector(entries, p + 8)
            self.cache[key] = p
        return self.cache[key]

    def rule_ptr(self, key):
        cache_key = ('rule', *key)
        if cache_key not in self.cache:
            row = self.rules.get(key)
            if row is None:
                raise KeyError(cache_key)
            p = self.alloc(32, struct.pack('<B3xI', *key))
            self.vector([struct.pack('<B7x', f['selector']) + self.function_blob(f) for f in row['functions']], p + 8)
            self.cache[cache_key] = p
        return self.cache[cache_key]

    def param_ptr(self, id):
        key = ('param', id)
        if key not in self.cache:
            row = self.params[id]
            # storeContentList returns the embedded FacultyAttributeRuleWithParam.
            p = self.alloc(32, struct.pack('<B3xI', row['header_type'], row['header_id']))
            adjusts = []
            for a in row['adjusts']:
                q = self.alloc(56, struct.pack('<H', a['input_id']))
                self.vector([struct.pack('<I', x) for x in a['role_property_ids']], q + 8)
                self.vector([struct.pack('<I', x) for x in a['trait_ids']], q + 32)
                adjusts.append(bytes(self.uc.mem_read(q, 56)))
            self.vector(adjusts, p + 8)
            self.cache[key] = p
        return self.cache[key]

    def effect_blob(self, row):
        p = self.alloc(128)
        a = row['intensity_adjust']
        self.vector([struct.pack('<I', x) for x in a['group_a_ids']], p)
        self.vector([struct.pack('<I', x) for x in a['group_b_ids']], p + 24)
        self.write(p + 48, 'I', a['value'])
        entries = []
        for entry in row['attribute_configs']:
            q = self.alloc(80)
            self.vector([struct.pack('<I', x) for x in entry['group_a_ids']], q + 8)
            self.vector([struct.pack('<B', x) for x in entry['flags']], q + 32)
            self.vector([struct.pack('<I', x) for x in entry['group_b_ids']], q + 56)
            entries.append(bytes(self.uc.mem_read(q, 80)))
        self.vector(entries, p + 56)
        self.vector([struct.pack('<I', x) for x in row.get('group_a_ids', [])], p + 80)
        self.vector([struct.pack('<I', x) for x in row.get('group_b_ids', [])], p + 104)
        return bytes(self.uc.mem_read(p, 128))

    def group_ptr(self, id):
        key = ('group', id)
        if key not in self.cache:
            row = self.groups[id]
            p = self.alloc(40, struct.pack('<I', id))
            entries = []
            for entry in row['items']:
                q = self.alloc(56, struct.pack('<H', entry['trend_id']))
                self.vector([self.effect_blob(e) for e in entry['extend_effects']], q + 8)
                self.vector([struct.pack('<I', x) for x in entry['extend_group_ids']], q + 32)
                entries.append(bytes(self.uc.mem_read(q, 56)))
            self.vector(entries, p + 8)
            self.write(p + 32, 'H', row['field_2'])
            self.cache[key] = p
        return self.cache[key]

    def limit_ptr(self, row):
        key = ('limit', json.dumps(row, sort_keys=True))
        if key not in self.cache:
            p = self.alloc(208)
            self.vector([self.effect_blob(e) for e in row['extend_effects']], p + 72)
            self.vector([struct.pack('<I', x) for x in row['extend_group_ids']], p + 96)
            self.write(p + 120, 'I', row['field_0'])
            self.vector([struct.pack('<I', x) for x in row['group_a_ids']], p + 128)
            self.vector([struct.pack('<I', x) for x in row['group_b_ids']], p + 152)
            self.write(p + 176, 'I', row['field_3'])
            self.vector([struct.pack('<I', x) for x in row['group_c_ids']], p + 184)
            self.cache[key] = p
        return self.cache[key]

    def ret(self, value=None):
        if value is not None:
            self.uc.reg_write(UC_ARM64_REG_X0, value & 0xffffffffffffffff)
        self.uc.reg_write(UC_ARM64_REG_PC, self.uc.reg_read(UC_ARM64_REG_X30))

    def extra_config_ptr(self, kind, id):
        key = (kind, id)
        if key in self.cache:
            return self.cache[key]
        if kind == 'UnitTraitTypeInfo':
            row = self.trait_types.get(id)
            if row is None: return 0
            p = self.alloc(64, struct.pack('<I', id))
            self.vector([struct.pack('<I', i) for i in row['affected_property_ids']], p + 32)
            self.write(p + 56, 'I', row['field_3'])
        elif kind == 'UnitTraitGrowthRuleInfo':
            row = self.trait_rules[id]
            p = self.alloc(32, struct.pack('<I', id))
            entries = []
            for t in row['traits']:
                q = self.alloc(40, struct.pack('<I', t['trait_id']))
                self.vector([struct.pack('<B3xI', r['feature_type'], r['feature_id']) for r in t['feature_calculations']], q + 8)
                self.write(q + 32, 'ii', t['multiplier'], t['base'])
                entries.append(bytes(self.uc.mem_read(q, 40)))
            self.vector(entries, p + 8)
        elif kind == 'FeatureCalculateInfo':
            p = self.alloc(40, struct.pack('<B3xI', *id) + self.function_blob(self.features[id]))
        elif kind == 'CapsuleTypeInfo':
            p = self.alloc(144, struct.pack('<I', id))
            self.vector([struct.pack('<B3xI24x', r['faculty_id'], r['growth_value']) for r in self.capsules[id]['faculty_growth']], p + 96)
        elif kind == 'FacultyGrowthRuleInfo':
            p = self.alloc(32, struct.pack('<I', id))
            self.vector([struct.pack('<i', v) for v in self.faculty_growth[id]], p + 8)
        elif kind == 'phase':
            row = self.phases[id]
            p = self.alloc(128, struct.pack('<IB', *id))
            presets = []
            for r in row['preset_categories']:
                q = self.alloc(32, struct.pack('<B', r['category_id']))
                self.vector([struct.pack('<I', i) for i in r['values']], q + 8)
                presets.append(bytes(self.uc.mem_read(q, 32)))
            self.vector(presets, p + 72)
            self.vector([struct.pack('<B31x', c['category_id']) + bytes(self.uc.mem_read(self.limit_ptr(c['limit_config']), 208)) for c in row['faculty_categories']], p + 96)
        else:
            raise RuntimeError(kind)
        self.cache[key] = p
        return p

    def hook(self, uc, address, size, _):
        name = self.plt.get(address)
        if name is None:
            return
        x = [uc.reg_read(UC_ARM64_REG_X0 + i) for i in range(9)]
        if name in ['_Znwm', '_Znam', 'malloc']:
            return self.ret(self.alloc(x[0]))
        if name in ['_ZdlPv', '_ZdaPv', 'free']:
            return self.ret()
        if name in ['memcpy', 'memmove']:
            if x[2]: uc.mem_write(x[0], bytes(uc.mem_read(x[1], x[2])))
            return self.ret(x[0])
        if name == 'memset':
            uc.mem_write(x[0], bytes([x[1] & 255]) * x[2])
            return self.ret(x[0])
        if 'CachedRawDataSet' in name and '7getItem' in name:
            if 'AttributeGrowthTemplateInfo' in name:
                p = self.template_ptr(self.read(x[1], 'I'))
            elif 'AttributeGrowthRuleInfo' in name:
                p = self.rule_ptr((self.read(x[1], 'B'), self.read(x[1] + 4, 'I')))
            elif 'FacultyTrendGroupInfo' in name:
                p = self.group_ptr(self.read(x[1], 'I'))
            else:
                kind = next((k for k in ['UnitTraitTypeInfo', 'UnitTraitGrowthRuleInfo', 'FeatureCalculateInfo', 'CapsuleTypeInfo', 'FacultyGrowthRuleInfo'] if k in name), None)
                if kind is None: raise RuntimeError('Unhandled config lookup ' + name)
                id = (self.read(x[1], 'B'), self.read(x[1] + 4, 'I')) if kind == 'FeatureCalculateInfo' else self.read(x[1], 'I')
                p = self.extra_config_ptr(kind, id)
            self.write(x[8], 'QQ', p, 0)
            return self.ret()
        if 'CapsulePhaseInfoReader8findItem' in name:
            key = (x[1], x[2]) if name.endswith('Ejh') else (self.read(x[1], 'I'), self.read(x[1] + 4, 'B'))
            self.write(x[8], 'QQ', self.extra_config_ptr('phase', key), 0)
            return self.ret()
        if 'FacultyExtendLinkInfoReader15storeExtendList' in name:
            pointers = list(self.elements(x[1], 128))
            for a in self.elements(x[2], 4):
                id = self.read(a, 'I')
                key = ('link', id)
                if key not in self.cache:
                    self.cache[key] = [self.alloc(128, self.effect_blob(e)) for e in self.links[id]['extend_effects']]
                pointers += self.cache[key]
            self.vector([struct.pack('<Q', p) for p in pointers], x[8])
            return self.ret()
        if 'FacultyAttributeParamRuleInfoReader16storeContentList' in name:
            self.vector([struct.pack('<Q', self.param_ptr(self.read(a, 'I'))) for a in self.elements(x[1], 4)], x[8])
            return self.ret()
        if 'checkProtocolAssemblity' in name:
            return self.ret(0)
        if 'getRolePropertyEi' in name:
            return self.ret(self.property_defaults.get(x[1], 0) + self.properties.get(x[1], 0))
        if 'getInstance' in name or 'getGlobalControler' in name or 'GetPrimSpace_BySpaceType' in name:
            return self.ret(self.STOP + 0x1000)
        if 'RanaSpace11runFunction' in name:
            args = list(self.elements(self.read(x[2] + 8, 'Q'), 8))
            wrappers = [self.read(a, 'Q') for a in args]
            fid = self.read(self.read(wrappers[0] + 8, 'Q'), 'H')
            source = self.read(self.read(wrappers[1] + 8, 'Q'), 'i')
            params = self.lua.table_from({self.read(a, 'B'): self.read(a + 4, 'i') for a in self.elements(self.read(wrappers[2] + 8, 'Q'), 8)})
            value = self.lua.globals()['__attribute_functions_execute'](fid, source, params)
            self.write(x[3], 'd', value)
            return self.ret(0)
        target = self.symbols.get(name)
        if target:
            uc.reg_write(UC_ARM64_REG_PC, target)
            return
        raise RuntimeError('Unhandled native dependency ' + name)

    def call(self, address, *args, result=None):
        self.calls += 1
        self.uc.reg_write(UC_ARM64_REG_SP, self.STOP + 0x1f0000)
        self.uc.reg_write(UC_ARM64_REG_X30, self.STOP)
        for i, arg in enumerate(args):
            self.uc.reg_write(UC_ARM64_REG_X0 + i, arg & 0xffffffffffffffff)
        if result is not None:
            self.uc.reg_write(UC_ARM64_REG_X8, result)
        try:
            self.uc.emu_start(address, self.STOP, count=1000000)
        except UcError as e:
            raise RuntimeError(f'Native emulation at {self.uc.reg_read(UC_ARM64_REG_PC):x}: {e}') from e
        if self.uc.reg_read(UC_ARM64_REG_PC) != self.STOP:
            raise RuntimeError('Native instruction budget exceeded')
        return self.read_register_i32()

    def read_register_i32(self):
        return struct.unpack('<i', struct.pack('<I', self.uc.reg_read(UC_ARM64_REG_X0) & 0xffffffff))[0]

    def function(self, f, source, inputs=None):
        p = self.alloc(32, self.function_blob(f))
        iv = self.vector([struct.pack('<H2xi', k, v) for k, v in (inputs or {}).items()])
        return self.call(0x849b98, p, source, iv)

    def effect(self, effect, level, presets, properties, traits, attributes):
        self.properties = properties
        switch = self.alloc(48)
        self.vector([struct.pack('<Ii', k, v) for k, v in traits.items()], switch + 24)
        adjustment = self.alloc(80)
        adjust = effect['intensity_adjust']
        self.vector([struct.pack('<I', k) for k in adjust['group_a_ids']], adjustment)
        self.vector([struct.pack('<I', k) for k in adjust['group_b_ids']], adjustment + 24)
        self.write(adjustment + 48, 'I', adjust['value'])
        intensity = self.call(0x709420, 0, switch, adjustment, level)
        pv = []
        for row in presets:
            p = self.alloc(32, struct.pack('<B', row['category_id']))
            self.vector([struct.pack('<I', k) for k in row['values']], p + 8)
            pv.append(bytes(self.uc.mem_read(p, 32)))
        preset_vector = self.vector(pv)
        ac = []
        for row in effect['attribute_configs']:
            p = self.alloc(80)
            self.vector([struct.pack('<I', k) for k in row['group_a_ids']], p + 8)
            self.vector([struct.pack('<B', k) for k in row['flags']], p + 32)
            self.vector([struct.pack('<I', k) for k in row['group_b_ids']], p + 56)
            ac.append(bytes(self.uc.mem_read(p, 80)))
        config = self.vector(ac)
        config_list = self.vector([struct.pack('<Q', config)])
        output = self.alloc(24)
        self.call(0x70abfc, 0, preset_vector, config_list, intensity, output, switch, 0)
        total = {id: 0 for id in attributes}
        for rule in self.elements(output, 32):
            for id in attributes:
                total[id] += self.call(0x713864, 0, rule, id)
        return total

    def category(self, limit, level, trend, presets, properties, traits, attributes):
        self.properties = properties
        switch = self.alloc(48)
        self.vector([struct.pack('<Ii', k, v) for k, v in traits.items()], switch + 24)
        pv = []
        for row in presets:
            p = self.alloc(32, struct.pack('<B', row['category_id']))
            self.vector([struct.pack('<I', k) for k in row['values']], p + 8)
            pv.append(bytes(self.uc.mem_read(p, 32)))
        preset_vector = self.vector(pv)
        status = self.alloc(12, struct.pack('<BBHiI', 1, 0, trend, level, 0))
        limit_ptr = self.limit_ptr(limit)
        return {id: self.call(0x714a18, 0, preset_vector, limit_ptr, id, status, switch) for id in attributes}

    def initial_level(self, card, category):
        return self.call(0x70917c, 0, card, category, 0, 0)

    def panel(self, card, phase, state, properties, attributes):
        self.properties = {int(k): v for k, v in properties.items()}
        carry = self.alloc(40)
        self.write(carry + 8, 'IB', card, phase)
        self.vector([struct.pack('<BBHiI', int(k), 0, v['trend'], v['level'], 0) for k, v in state.items()], carry + 16)
        return {id: self.call(0x712f74, 0, carry, id, 1) for id in attributes}

    def component(self, card, phase, state, properties, category, attributes):
        """Native trait collection + one native faculty, for exhaustive catalog tests."""
        self.properties = {int(k): v for k, v in properties.items()}
        phase_type = self.alloc(8, struct.pack('<IB', card, phase))
        switch = self.alloc(48)
        statuses = {}
        for id, status in state.items():
            p = self.alloc(12, struct.pack('<BBHiI', int(id), 0, status['trend'], status['level'], 0))
            statuses[int(id)] = p
            self.call(0x70c378, 0, phase_type, p, switch)
        return {id: self.call(0x714d20, 0, phase_type, id, statuses[category], switch) for id in attributes}


if __name__ == '__main__':
    oracle = NativeOracle()
    f = {'function_id': 100, 'params': [{'param_id': 101, 'input_ids': [102], 'default_value': 10000}, {'param_id': 102, 'input_ids': [], 'default_value': 0}]}
    assert oracle.function(f, 101, {102: -6500}) == 35
    e = {'intensity_adjust': {'group_a_ids': [], 'group_b_ids': [], 'value': 0}, 'attribute_configs': [{'group_a_ids': [6059], 'flags': [], 'group_b_ids': []}]}
    print(json.dumps({'primitive': oracle.function(f, 101, {102: -6500}), 'base': oracle.effect(e, 60, [], {}, {}, [0,2,3,4,5,6,8,9]), 'native_calls': oracle.calls}))
