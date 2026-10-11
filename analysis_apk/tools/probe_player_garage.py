"""Read-only game/device preflight; never opens credentials or invokes game actions."""
import argparse
import base64
import hashlib
import json
import re
import subprocess
import struct
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = 'com.astrogame.sherman'
SUPPORTED_SHA256 = '78867677089c66c55d572f26b78ec90a4f952fcec6ba7c210a1fd48f421ad2fa'

def adb_run(adb, serial, *args):
    return subprocess.check_output([adb, '-s', serial, *args], timeout=20).decode('utf-8', errors='replace').strip()

def preflight(adb, serial, verify_local=True):
    run = lambda *args: adb_run(adb, serial, *args)
    if 'uid=0(' not in run('shell', 'su', '0', 'id'):
        raise RuntimeError('Root is required for this read-only probe')
    pid = int(run('shell', 'pidof', PACKAGE))
    maps = run('shell', 'su', '0', 'cat', f'/proc/{pid}/maps')
    modules = [line for line in maps.splitlines() if line.endswith('/libasgame.so')]
    zero = [line for line in modules if line.split()[2] == '00000000']
    if len(zero) != 1:
        raise RuntimeError('Cannot resolve unique game library')
    base = int(zero[0].split('-')[0], 16)
    libpath = zero[0].split()[-1]
    device_hash = run('shell', 'su', '0', 'sha256sum', libpath).split()[0]
    local_lib = ROOT / 'analysis_apk/scout_native_trace/libasgame.device.so'
    local_hash = hashlib.sha256(local_lib.read_bytes()).hexdigest() if verify_local else SUPPORTED_SHA256
    version_info = run('shell', 'dumpsys', 'package', PACKAGE)
    versions = re.findall(r'\bversion(?:Code|Name)=[^\s]+', version_info)
    return {'pid': pid, 'base': hex(base), 'library_path': libpath, 'sha256': device_hash,
            'matches_local_binary': local_hash == device_hash, 'versions': versions,
            'abi': run('shell', 'getprop', 'ro.product.cpu.abi')}

def memory_read(adb, serial, pid, address, size):
    if not (0 < address < 2**63 and 0 < size <= 65536):
        raise ValueError('Invalid bounded memory read')
    # This emulator's su normalizes LF on its output. Encode inside the root
    # shell rather than trying to repair arbitrary binary bytes after transport.
    command = (f'/system/bin/toybox dd if=/proc/{int(pid)}/mem bs=4096 iflag=skip_bytes,count_bytes '
               f'skip={address} count={size} status=none | /system/bin/toybox base64 -w 0')
    result = subprocess.run([adb, '-s', serial, 'shell', '-T', f"su 0 /system/bin/sh -c '{command}'"],
                            capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(f'Memory read failed: {result.stderr[:300]!r}; {result.stdout[:100]!r}')
    data = base64.b64decode(result.stdout.strip(), validate=True)
    if len(data) != size:
        raise RuntimeError(f'Short memory read: expected {size}, got {len(data)}; stderr={result.stderr[:200]!r}')
    return data

def read_garage(adb, serial, info, read_memory=None, progress=None):
    if not info['matches_local_binary'] or info['sha256'] != SUPPORTED_SHA256:
        raise RuntimeError('Unsupported binary: refuse to reuse offsets')
    read = read_memory or (lambda address, size: memory_read(adb, serial, info['pid'], address, size))
    base = int(info['base'], 16)
    unit = struct.unpack('<Q', read(base + 0x12b5818, 8))[0]
    if unit == 0:
        raise RuntimeError('Player unit set is not initialized')
    header = read(unit + 0x20, 24)
    first, root, count = struct.unpack('<QQQ', header)
    if not 0 < count <= 10000:
        raise RuntimeError(f'Invalid/empty garage: {count}')
    stack = [root]
    seen = set()
    cards = []
    while stack:
        address = stack.pop()
        if not address:
            continue
        if address in seen or len(seen) >= count:
            raise RuntimeError('Garage tree changed or is corrupt')
        seen.add(address)
        node = read(address, 0x50)
        left, right = struct.unpack_from('<QQ', node)
        instance_id = struct.unpack_from('<I', node, 0x20)[0]
        template_id = struct.unpack_from('<I', node, 0x30)[0]
        phase = node[0x34]
        begin, end, capacity = struct.unpack_from('<QQQ', node, 0x38)
        size = end - begin
        if size < 0 or size > 12 * 256 or size % 12 or end > capacity:
            raise RuntimeError(f'Invalid faculty vector for card {instance_id}')
        data = read(begin, size) if size else b''
        faculties = [{'category': data[i], 'trend': struct.unpack_from('<H', data, i+2)[0],
                      'level': struct.unpack_from('<i', data, i+4)[0],
                      'experience': struct.unpack_from('<i', data, i+8)[0]}
                     for i in range(0, size, 12)]
        if len({item['category'] for item in faculties}) != len(faculties):
            raise RuntimeError('Duplicate faculty category')
        level = next((item['level'] for item in faculties if item['category'] == 1), None)
        cards.append({'instance_id': instance_id, 'template_id': template_id, 'generation': phase,
                       'level': level, 'faculties': faculties})
        if progress:
            progress(len(cards), count)
        stack.extend([right, left])
    if len(cards) != count or len({card['instance_id'] for card in cards}) != count or first not in seen:
        raise RuntimeError('Incomplete/duplicate garage capture')
    if header != read(unit + 0x20, 24):
        raise RuntimeError('Garage changed during read; retry while idle')
    return sorted(cards, key=lambda card: card['instance_id'])


def read_panel_globals(adb, serial, info, read_memory=None, rules=None, tech=None):
    """Only query property IDs referenced by panel rules; no login/account fields."""
    if not info['matches_local_binary'] or info['sha256'] != SUPPORTED_SHA256:
        raise RuntimeError('Unsupported binary: refuse to reuse offsets')
    read = read_memory or (lambda address, size: memory_read(adb, serial, info['pid'], address, size))
    base = int(info['base'], 16)
    prop = struct.unpack('<Q', read(base + 0x12b5810, 8))[0]
    social = struct.unpack('<Q', read(base + 0x12b5838, 8))[0]
    if not prop or not social:
        raise RuntimeError('Panel globals not initialized')
    rules = rules if rules is not None else json.loads((ROOT / 'steel-maiden-browser/public/data/loadout-rules.json').read_text(encoding='utf-8'))
    tech = tech if tech is not None else json.loads((ROOT / 'steel-maiden-browser/public/data/technology-catalog.json').read_text(encoding='utf-8'))
    ids = set()
    for card in rules['cards'].values():
        for phase in card['phases'].values():
            for category in phase['categories'].values():
                ids.update(category['properties'])
    for effect in rules['effects']:
        ids.update(effect['properties'])
    for param in rules['params'].values():
        for item in param['inputs']:
            ids.update(item['properties'])
    for trait in rules['traitTypes'].values():
        ids.update(trait['properties'])
    headers = {kind: read(address, 24) for kind, address in
               [('role', prop + 0x48), ('volatile', prop + 0x60), ('campaign', social + 0x20)]}

    def lookup(header, key, vector=False):
        _, root, count = struct.unpack('<QQQ', header)
        if count > 100000:
            raise RuntimeError('Invalid property tree size')
        ptr, seen = root, set()
        while ptr:
            if ptr in seen or len(seen) >= 128:
                raise RuntimeError('Invalid property lookup path')
            seen.add(ptr)
            cache_key = (ptr, vector)
            if cache_key not in cache:
                cache[cache_key] = read(ptr, 64 if vector else 40)
            data = cache[cache_key]
            found = struct.unpack_from('<I', data, 0x20 if vector else 0x1c)[0]
            if found == key:
                if not vector:
                    return struct.unpack_from('<i', data, 0x20)[0]
                begin, end, capacity = struct.unpack_from('<QQQ', data, 0x28)
                size = end - begin
                if not 0 <= size <= 4096 or size % 4 or end > capacity:
                    raise RuntimeError('Invalid volatile property vector')
                return list(struct.unpack('<' + 'I' * (size // 4), read(begin, size))) if size else []
            ptr = struct.unpack_from('<Q', data, 0 if key < found else 8)[0]
        return [] if vector else 0

    cache = {}
    properties = {str(key): {'role': lookup(headers['role'], key),
                             'campaign': lookup(headers['campaign'], key),
                             'volatile_measure_ids': lookup(headers['volatile'], key, True)}
                  for key in sorted(ids)}
    craft_header = read(prop + 0x30, 24)
    begin, end, capacity = struct.unpack('<QQQ', craft_header)
    size = end - begin
    if not 0 <= size <= 65536 or size % 16 or end > capacity:
        raise RuntimeError('Invalid craft status vector')
    data = read(begin, size) if size else b''
    wanted = {b['craftId']: b for b in tech['blocks']}
    crafts = {}
    for i in range(0, size, 16):
        key = struct.unpack_from('<H', data, i)[0]
        if key in wanted:
            crafts[key] = struct.unpack_from('<h', data, i + 4)[0]
    technologies = [{'block_id': b['id'], 'craft_id': b['craftId'], 'title': b['title'],
                     'level': crafts.get(b['craftId'], 0)} for b in tech['blocks']]
    for kind, address in [('role', prop + 0x48), ('volatile', prop + 0x60), ('campaign', social + 0x20)]:
        if headers[kind] != read(address, 24):
            raise RuntimeError('Global property tree changed; retry while idle')
    if craft_header != read(prop + 0x30, 24):
        raise RuntimeError('Technology vector changed; retry while idle')
    return {'properties': properties, 'technologies': technologies}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--adb', default=r'D:\Program Files\leidian\LDPlayer14\adb.exe')
    parser.add_argument('--serial', default='emulator-5554')
    parser.add_argument('--probe-memory', action='store_true')
    parser.add_argument('--capture', action='store_true', help='Read garage twice; save matching records locally without importing')
    parser.add_argument('--globals', action='store_true', help='Include panel-related global properties and technology levels')
    args = parser.parse_args()
    info = preflight(args.adb, args.serial)
    if args.capture:
        globals_first = read_panel_globals(args.adb, args.serial, info) if args.globals else None
        first = read_garage(args.adb, args.serial, info)
        second = read_garage(args.adb, args.serial, info)
        globals_second = read_panel_globals(args.adb, args.serial, info) if args.globals else None
        if first != second:
            raise RuntimeError('Two complete captures differ; nothing saved. Keep garage idle and retry.')
        if globals_first != globals_second:
            raise RuntimeError('Global panel properties changed; nothing saved. Retry while idle.')
        catalog = json.loads((ROOT / 'steel-maiden-browser/public/data/maidens.json').read_text(encoding='utf-8'))
        by_id = {row['id']: row for row in catalog['rows']}
        for card in second:
            row = by_id.get(card['template_id'])
            card['tank'] = row['tank'] if row else None
        now = datetime.now(timezone.utc)
        output = ROOT / '.private/garage-captures' / (now.strftime('%Y%m%dT%H%M%S%fZ') + '.json')
        payload = {'schema_version': 1, 'captured_at': now.isoformat(),
                   'source': {'method': 'adb-root-proc-mem-read-only', 'binary_sha256': info['sha256'], 'versions': info['versions']},
                   'validation': {'two_complete_reads_equal': True, 'atomic_snapshot': False, 'count': len(second)},
                    'cards': second}
        if globals_second is not None:
            payload['panel_globals'] = globals_second
            payload['validation']['global_reads_equal'] = True
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open('x', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        info['capture'] = {'output': str(output), 'count': len(second),
                           'known_templates': sum(card['tank'] is not None for card in second),
                           'missing_explicit_levels': sum(card['level'] is None for card in second),
                           'sample': [{key: card[key] for key in ('template_id', 'tank', 'level', 'generation')} for card in second[:8]]}
    if args.probe_memory:
        if not info['matches_local_binary']:
            raise RuntimeError('Unknown binary; refusing to use known offsets')
        base = int(info['base'], 16)
        unit = struct.unpack('<Q', memory_read(args.adb, args.serial, info['pid'], base + 0x12b5818, 8))[0]
        if unit == 0:
            raise RuntimeError('Player unit set is not initialized')
        header = memory_read(args.adb, args.serial, info['pid'], unit + 0x20, 24)
        first, root, count = struct.unpack('<QQQ', header)
        info['garage_probe'] = {'unit': hex(unit), 'first': hex(first), 'root': hex(root), 'count': count}
    print(json.dumps(info, ensure_ascii=False, indent=2))
