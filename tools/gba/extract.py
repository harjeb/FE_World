#!/usr/bin/env python3
"""Export selected FE6J/FE7J/FE8J ROM chapters as versioned scenario assets."""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import csv
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'fe8'))
from rom import read_at, read32, pointer_offset, decompress_lz77
from extract_rom import RomChapterReader
from terrain import TERRAIN_VISUALS

METADATA = json.loads((HERE / 'metadata.json').read_text(encoding='utf-8'))
GAME_NAMES = {'fe6': '封印之剑', 'fe7': '烈火之剑', 'fe8': '圣魔之光石'}


def hx(value):
    return f'0x{value:08X}'


def rows(values, width):
    return [list(values[i:i + width]) for i in range(0, len(values), width)]


def dump(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


class GbaReader:
    def __init__(self, path: Path):
        self.path = path
        self.data = path.read_bytes()
        header = read_at(self.data, 0xA0, 32)
        self.code = header[12:16].decode('ascii')
        if self.code not in METADATA['profiles']:
            raise ValueError(f'Unsupported game code {self.code}')
        if ((-sum(self.data[0xA0:0xBD]) - 0x19) & 255) != self.data[0xBD]:
            raise ValueError('Invalid GBA header complement')
        self.profile = dict(METADATA['profiles'][self.code])
        self.game = self.profile['game']
        if self.game == 'fe6' and self.u16(0x2BB12) == 0x2048:
            self.profile['chapterStride'] = 72
        self.chapter_table = self.deref(self.profile['chapterPointer'])
        self.assets = self.deref(self.profile['assetPointer'])
        self.classes = self.deref(self.profile['classPointer'])
        self.characters = self.deref(self.profile['characterPointer'])
        self.items = self.deref(self.profile['itemPointer'])
        self.character_index_bias = -1 if self.game in ['fe7', 'fe8'] else 0
        for table, stride, bias in [(self.classes, self.profile['classStride'], 0),
                                    (self.characters, self.profile['characterStride'], self.character_index_bias)]:
            if read_at(self.data, table + (1 + bias) * stride + 4, 1)[0] != 1:
                raise ValueError('Profile identity check failed for class/character table')
        self.sha1 = hashlib.sha1(self.data).hexdigest()
        self.sha256 = hashlib.sha256(self.data).hexdigest()
        self.unit_cache = {}
        self.patterns = []
        for pattern in METADATA['instructionPatterns'].get(self.game, []):
            self.patterns.append({**pattern, 'maskBytes': bytes.fromhex(pattern['mask']),
                                  'valueBytes': bytes.fromhex(pattern['value'])})

    def u16(self, at):
        return int.from_bytes(read_at(self.data, at, 2), 'little')

    def deref(self, at):
        return pointer_offset(self.data, read32(self.data, at))

    def asset(self, index):
        return self.deref(self.assets + index * 4)

    def symbol(self, kind, value):
        return METADATA['symbols'][self.game].get(kind, {}).get(str(value))

    def units(self, pointer):
        if pointer in self.unit_cache:
            return self.unit_cache[pointer]
        at = pointer_offset(self.data, pointer)
        stride = self.profile['unitStride']
        units = []
        for i in range(257):
            address = at + i * stride
            if not read_at(self.data, address, 1)[0]:
                self.unit_cache[pointer] = units
                return units
            if i == 256:
                break
            raw = read_at(self.data, address, stride)
            faction = (raw[3] >> 1) & 3
            if faction > 2:
                raise ValueError(f'Unknown faction at {hx(address)}')
            cid = raw[1]
            effective_class = cid or read_at(self.data, self.characters + (raw[0] + self.character_index_bias) * self.profile['characterStride'] + 5, 1)[0]
            if not 0 < effective_class < 0x90:
                raise ValueError(f'Invalid effective class {effective_class} at {hx(address)}')
            route = []
            if stride == 20:
                pos = int.from_bytes(raw[4:6], 'little')
                entry = [pos & 63, (pos >> 6) & 63]
                if raw[7]:
                    red_at = pointer_offset(self.data, read32(raw, 8))
                    for j in range(raw[7]):
                        red = read_at(self.data, red_at + j * 8, 8)
                        bits = int.from_bytes(red[:3], 'little')
                        route.append({'position': [bits & 63, (bits >> 6) & 63], 'flags': (bits >> 12) & 63,
                                      'a': red[3], 'b': int.from_bytes(red[4:6], 'little'),
                                      'delayFrames': int.from_bytes(red[6:8], 'little')})
                absolute = all(step['flags'] == 0 and step['b'] == 0xFFFF for step in route)
                final = (route[-1]['position'] if route else entry) if absolute else None
                items, ai = raw[12:16], raw[16:20]
                drop = bool(pos & 0x2000)
            else:
                entry, final = list(raw[4:6]), list(raw[6:8])
                items, ai, drop = raw[8:12], raw[12:16], None
            units.append({'index': i, 'characterId': raw[0], 'characterSymbol': self.symbol('character', raw[0]),
                          'classId': cid, 'effectiveClassId': effective_class,
                          'classSymbol': self.symbol('class', effective_class), 'leaderId': raw[2],
                          'faction': ['player', 'ally', 'enemy'][faction], 'level': raw[3] >> 3,
                          'autolevel': bool(raw[3] & 1), 'entryPosition': entry, 'position': final,
                          'route': route, 'itemIds': [value for value in items if value],
                          'aiBytes': list(ai), 'dropItem': drop,
                          'sourceAddress': hx(0x08000000 + address), 'sourceRecordHex': raw.hex()})
        raise ValueError(f'Unit list at {hx(pointer)} has no terminator')

    def event_list(self, pointer, kind):
        at = pointer_offset(self.data, pointer)
        result = []
        for _ in range(1024):
            header = read32(self.data, at)
            if header == 0:
                return result
            command = header & 0xFFFF
            if command > 0x20:
                raise ValueError(f'Unknown event-list command {command} at {hx(at)}')
            size = self.profile['turnStride'] if kind == 'turn' else self.profile['talkStride'] if kind == 'talk' else 12
            if self.game == 'fe7' and kind == 'turn' and command == 1:
                size = 12
            raw = read_at(self.data, at, size)
            payload = raw[8:12]
            event = {'sourceAddress': hx(0x08000000 + at), 'typeId': command,
                     'flag': header >> 16, 'words': list(struct.unpack(f'<{size // 4}I', raw)),
                     'scriptPointer': read32(raw, 4)}
            if kind == 'turn':
                event['turnBytes'] = list(payload)
            elif kind == 'talk':
                event['characters'] = list(payload[:2])
            elif kind == 'location':
                event.update(position=list(payload[:2]), command=payload[2])
            elif command in [10, 11]:
                event['bounds'] = {'min': list(payload[:2]), 'max': list(payload[2:])}
            result.append(event)
            at += size
        raise ValueError('Event list exceeds limit')

    def old_script(self, pointer):
        at = pointer_offset(self.data, pointer)
        commands = []
        for _ in range(8192):
            matched = None
            for pattern in self.patterns:
                size = pattern['size']
                if at + size > len(self.data):
                    continue
                raw = self.data[at:at + size]
                if all((b & mask) == wanted for b, mask, wanted in zip(raw, pattern['maskBytes'], pattern['valueBytes'])):
                    matched = pattern
                    break
            if matched is None:
                return commands, f'Unknown instruction at {hx(0x08000000 + at)}'
            raw = read_at(self.data, at, matched['size'])
            command = {'sourceAddress': hx(0x08000000 + at), 'rawHex': raw.hex(),
                       'unitPointers': [read32(raw, offset) for offset in matched['unitOffsets']],
                       'eventPointers': [read32(raw, offset) for offset in matched['eventOffsets']]}
            commands.append(command)
            at += len(raw)
            if matched['terminal']:
                return commands, None
        return commands, 'Instruction limit reached'

    def scan_scripts(self, roots):
        scripts = {}
        warnings = []
        # Track the owning root so an enemy reference keeps its original trigger.
        unit_refs = defaultdict(list)
        visited = set()
        pending = deque((pointer, name, None) for pointer, name in roots)
        fe8_reader = object.__new__(RomChapterReader)
        fe8_reader.data = self.data
        while pending:
            pointer, root, inherited_slot2 = pending.popleft()
            visit_key = pointer, root, inherited_slot2
            if visit_key in visited:
                continue
            visited.add(visit_key)
            if len(visited) > 4096:
                raise ValueError('Event reference graph exceeds limit')
            if not 0x08000000 <= pointer < 0x08000000 + len(self.data):
                continue
            if pointer not in scripts:
                if self.game == 'fe8':
                    decoded = fe8_reader.script(pointer)
                    scripts[pointer] = decoded['commands']
                else:
                    commands, warning = self.old_script(pointer)
                    scripts[pointer] = commands
                    if warning:
                        warnings.append({'script': hx(pointer), 'issue': warning})
            slot2 = inherited_slot2
            for command in scripts[pointer]:
                if self.game == 'fe8':
                    opcode = command['opcode']
                    if opcode == 5 and command['slot'] == 2:
                        slot2 = command['value']
                    elif opcode == 6 and command['arg0'] & 15 == 2:
                        slot2 = None
                    elif opcode in [10, 11]:
                        pending.append((command['pointer'], root, slot2))
                    elif opcode == 0x2C and command['subcode'] != 3:
                        target = command['pointer'] if command['pointer'] != 0xFFFFFFFF else slot2
                        if target and 0x08000000 <= target < 0x08000000 + len(self.data):
                            unit_refs[target].append({'kind': root, 'instruction': command['romAddress'],
                                                       'loadMode': command['subcode'], 'restriction': command['arg0']})
                else:
                    for target in command['eventPointers']:
                        pending.append((target, root, None))
                    for target in command['unitPointers']:
                        unit_refs[target].append({'kind': root, 'instruction': command['sourceAddress']})
        return scripts, unit_refs, warnings

    def class_catalog(self, ids, terrain_ids):
        result = {}
        for cid in sorted(ids):
            at = self.classes + cid * self.profile['classStride']
            raw = read_at(self.data, at, self.profile['classStride'])
            if raw[4] != cid:
                raise ValueError(f'Class identity mismatch for {cid}')
            offset_list = [0x34, 0x38, 0x3C, 0x40] if self.game == 'fe6' else [0x38, 0x44, 0x48, 0x4C]
            tables = [self.deref(at + offset) if read32(self.data, at + offset) else None for offset in offset_list]
            rule_names = ['movementCost', 'avoid', 'defense', 'resistance']
            rules = {}
            for terrain in sorted(terrain_ids):
                rule = {name: int.from_bytes(read_at(self.data, table + terrain, 1), 'little', signed=True) if table is not None else None
                        for name, table in zip(rule_names, tables)}
                if rule['movementCost'] is not None and rule['movementCost'] < 0:
                    rule['movementCost'] = None
                rules[str(terrain)] = rule
            result[str(cid)] = {'id': cid, 'symbol': self.symbol('class', cid), 'nameTextId': self.u16(at),
                                'baseStats': dict(zip(['hp', 'power', 'skill', 'speed', 'defense', 'resistance', 'constitution', 'movement'],
                                                     struct.unpack('<8b', raw[0x0B:0x13]))),
                                'growthRates': dict(zip(['hp', 'power', 'skill', 'speed', 'defense', 'resistance', 'luck'], raw[0x1B:0x22])),
                                'normalTerrainRules': rules,
                                'missingRuleTables': [name for name, table in zip(rule_names, tables) if table is None],
                                'sourceAddress': hx(0x08000000 + at), 'sourceRecordHex': raw.hex()}
        return result

    def map_changes(self, asset_id, config, width, height):
        if asset_id == 0:
            return []
        at = self.asset(asset_id)
        result = []
        for _ in range(256):
            raw = read_at(self.data, at, 12)
            if raw[0] == 255:
                return result
            cid, x, y, w, h = raw[:5]
            if not 0 < w <= width or not 0 < h <= height or x + w > width or y + h > height:
                raise ValueError('Map change outside map bounds')
            data_at = pointer_offset(self.data, read32(raw, 8))
            words = struct.unpack(f'<{w*h}H', read_at(self.data, data_at, w*h*2))
            if any(v & 3 or v >> 2 >= 1024 for v in words):
                raise ValueError('Invalid map-change tile')
            result.append({'id': f'change-{cid}', 'sourceId': cid, 'position': [x, y], 'width': w, 'height': h,
                           'terrainIds': rows([config[0x2000 + (v >> 2)] if v else None for v in words], w),
                           'metatileIndices': rows([v >> 2 if v else None for v in words], w),
                           'sourceAddress': hx(0x08000000 + at)})
            at += 12
        raise ValueError('Map-change table has no terminator')

    def chapter(self, chosen):
        index = chosen['index']
        at = self.chapter_table + index * self.profile['chapterStride']
        raw = read_at(self.data, at, self.profile['chapterStride'])
        internal = read_at(self.data, pointer_offset(self.data, read32(raw, 0)), 32).split(b'\0', 1)[0].decode('ascii')
        if internal != chosen['expectedInternalName']:
            raise ValueError(f"Chapter identity mismatch: expected {chosen['expectedInternalName']}, got {internal}")
        layout_at, config_at = self.asset(raw[8]), self.asset(raw[7])
        layout, config = decompress_lz77(self.data, layout_at), decompress_lz77(self.data, config_at)
        width, height = layout[:2]
        if not 1 <= width <= 64 or not 1 <= height <= 64 or len(layout) != 2 + width * height * 2 or len(config) != 0x2400:
            raise ValueError('Invalid decompressed map/config dimensions')
        words = struct.unpack(f'<{width*height}H', layout[2:])
        if any(v & 3 or v >> 2 >= 1024 for v in words):
            raise ValueError('Invalid map word')
        metatiles = rows([v >> 2 for v in words], width)
        terrain = [[config[0x2000 + v] for v in row] for row in metatiles]
        event_at = self.asset(raw[self.profile['eventIdOffset']])
        pointers = struct.unpack(f"<{self.profile['eventWords']}I", read_at(self.data, event_at, self.profile['eventWords'] * 4))
        events = {kind: self.event_list(pointers[i], kind) for i, kind in enumerate(['turn', 'talk', 'location', 'misc'])}
        roots = []
        if self.game == 'fe7':
            roots += [(pointers[14], 'opening'), (pointers[15], 'ending')]
        elif self.game == 'fe8':
            roots += [(pointers[18], 'opening'), (pointers[19], 'ending')]
        else:
            roots += [(pointers[6], 'ending')]
        for kind, entries in events.items():
            for i, event in enumerate(entries):
                ptr = event['scriptPointer']
                if 0x08000000 <= ptr < 0x08000000 + len(self.data):
                    # Shops contain item arrays, not event code.
                    if kind == 'location' and event['command'] in ([0x16, 0x17, 0x18] if self.game == 'fe8' else [0x13, 0x14, 0x15]):
                        continue
                    roots.append((ptr, f'{kind}:{i}'))
        scripts, references, warnings = self.scan_scripts(roots)
        for slot in self.profile['enemySlots'] + self.profile['playerSlots']:
            ptr = pointers[slot]
            variant = {6: 'eliwood-normal', 7: 'eliwood-hard', 8: 'hector-normal', 9: 'hector-hard',
                       10: 'eliwood-normal', 11: 'eliwood-hard', 12: 'hector-normal', 13: 'hector-hard'}.get(slot, 'default') if self.game == 'fe7' else 'normal' if slot == 10 else 'hard' if slot == 11 else 'default'
            references[ptr].append({'kind': 'enemy-table' if slot in self.profile['enemySlots'] else 'deployment-table', 'slot': slot, 'variant': variant})
        if self.game == 'fe8':
            for slot in range(12, 18):
                if pointers[slot]:
                    references[pointers[slot]].append({'kind': 'encounter-table', 'slot': slot})
        groups = []
        for pointer, refs in sorted(references.items()):
            units = self.units(pointer)
            if not units:
                continue
            exported = []
            for unit in units:
                copy = dict(unit)
                p = unit['position']
                copy['positionStatus'] = 'unresolved' if p is None else 'on-map' if 0 <= p[0] < width and 0 <= p[1] < height else 'off-map'
                exported.append(copy)
            groups.append({'id': f'group-{pointer - 0x08000000:06x}', 'sourceAddress': hx(pointer),
                           'references': sorted({json.dumps(ref, sort_keys=True): ref for ref in refs}.values(), key=lambda ref: json.dumps(ref, sort_keys=True)),
                           'units': exported})
        enemy_count = sum(u['faction'] == 'enemy' for g in groups for u in g['units'])
        if enemy_count == 0:
            raise ValueError(f'{internal}: no enemy records were found')
        changes = self.map_changes(raw[11], config, width, height)
        terrain_ids = {v for row in terrain for v in row}
        terrain_ids.update(v for c in changes for row in c['terrainIds'] for v in row if v is not None)
        terrain_catalog = {}
        for tid in sorted(terrain_ids):
            if tid >= self.profile['terrainCount']:
                raise ValueError(f'Unexpected terrain ID {tid}')
            source_symbol = METADATA['symbols']['fe8']['terrain'].get(str(tid))
            label, color, glyph = TERRAIN_VISUALS.get(tid, (source_symbol or f'地形{tid:02X}', '#777777', '?'))
            terrain_catalog[str(tid)] = {'id': tid, 'label': label, 'color': color, 'glyph': glyph,
                                         'symbol': METADATA['symbols']['fe8']['terrain'].get(str(tid)),
                                         'annotationBasis': 'shared GBA terrain IDs; class-specific rules are read separately'}
        all_units = [u for g in groups for u in g['units']]
        character_ids = {u['characterId'] for u in all_units}
        item_ids = {i for u in all_units for i in u['itemIds']}
        chest_command = 0x14 if self.game == 'fe8' else 0x12
        item_ids.update(e['scriptPointer'] for e in events['location'] if e['command'] == chest_command and 0 < e['scriptPointer'] < 256)
        characters = {}
        for pid in sorted(character_ids):
            addr = self.characters + (pid + self.character_index_bias) * self.profile['characterStride']
            data = read_at(self.data, addr, self.profile['characterStride'])
            characters[str(pid)] = {'id': pid, 'symbol': self.symbol('character', pid), 'nameTextId': self.u16(addr),
                                     'baseStats': dict(zip(['hp', 'power', 'skill', 'speed', 'defense', 'resistance', 'luck'], struct.unpack('<7b', data[0x0C:0x13]))),
                                     'growthRates': dict(zip(['hp', 'power', 'skill', 'speed', 'defense', 'resistance', 'luck'], data[0x1C:0x23])),
                                     'sourceAddress': hx(0x08000000 + addr), 'sourceRecordHex': data.hex()}
        items = {}
        for iid in sorted(item_ids):
            addr = self.items + iid * self.profile['itemStride']
            items[str(iid)] = {'id': iid, 'symbol': self.symbol('item', iid), 'nameTextId': self.u16(addr),
                               'sourceAddress': hx(0x08000000 + addr),
                               'sourceRecordHex': read_at(self.data, addr, self.profile['itemStride']).hex()}
        classes = self.class_catalog({u['effectiveClassId'] for u in all_units}, terrain_ids)
        objects = []
        for event in events['location']:
            types = {0x11: 'seize', 0x12: 'door', 0x14: 'chest'} if self.game == 'fe8' else {0x0F: 'seize', 0x10: 'door', 0x12: 'chest'}
            kind = types.get(event['command'], 'source-location')
            objects.append({'id': f'object-{len(objects)}', 'kind': kind, 'position': event['position'],
                            'positionStatus': 'on-map' if event['position'][0] < width and event['position'][1] < height else 'off-map',
                            'sourceCommand': event['command'], 'sourceAddress': event['sourceAddress'],
                            'itemId': event['scriptPointer'] if kind == 'chest' and event['scriptPointer'] < 256 else None})
        # Preserve selected edition/route labels and pointer evidence. The format
        # does not pretend source class/item IDs are project catalog IDs.
        return {'format': 'agent-tactics.scenario', 'schemaVersion': 1,
                'id': f"{self.game}-ch{chosen['chapter']}-{chosen['route']}",
                'name': f"{GAME_NAMES[self.game]} · {chosen['name']}",
                'chapter': {'number': chosen['chapter'], 'route': chosen['route'], 'tableIndex': index, 'internalName': internal},
                'source': {'kind': 'gba-rom', 'game': self.game, 'gameCode': self.code, 'fileName': self.path.name,
                           'bytes': len(self.data), 'sha1': self.sha1, 'sha256': self.sha256,
                           'profileRevision': METADATA['profileSource']['revision']},
                'coordinates': {'origin': 'top-left', 'indexBase': 0, 'pointOrder': ['x', 'y'], 'matrixOrder': 'rows-y-columns-x'},
                'map': {'width': width, 'height': height, 'tilePixels': 16, 'terrainIds': terrain, 'metatileIndices': metatiles},
                'terrainCatalog': terrain_catalog, 'classCatalog': classes, 'characterCatalog': characters, 'itemCatalog': items,
                'unitGroups': groups, 'objects': objects, 'mapChanges': changes,
                'events': events, 'eventScripts': {hx(p): value for p, value in sorted(scripts.items())},
                'coverage': {'enemyTemplateCount': enemy_count, 'unitGroupCount': len(groups),
                             'primaryEnemyTemplateCount': sum(u['faction'] == 'enemy' for g in groups for u in g['units']
                                 if any(r['kind'] == 'enemy-table' and r['slot'] == self.profile['enemySlots'][0] for r in g['references'])) if self.profile['enemySlots'] else None,
                             'initialEnemySelection': 'chapter-table' if self.game in ['fe6', 'fe7'] else 'opening-script-references',
                             'scriptScanWarnings': warnings,
                             'scriptScanMode': 'static-packets-and-calls' if self.game == 'fe8' else 'static-patterns-to-first-terminator',
                             'runtimeExecuted': False, 'asmSpawnEffectsExecuted': False},
                'adaptation': {'status': 'source-template', 'requires': ['project-class-and-item-mapping', 'source-event-conditions', 'interactive-map-objects'],
                               'notes': ['单位组是静态引用，不能把所有组同时放到初始地图。',
                                         '等级、成长和职业基础值已保存；未计算难度、自动升级或存档影响后的最终战斗属性。',
                                         '未识别的名称保留编号与原始记录；汉化字体编码没有当作标准日文强行解码。']},
                'provenance': {'chapterAddress': hx(0x08000000 + at), 'chapterRecordHex': raw.hex(),
                               'layoutAddress': hx(0x08000000 + layout_at), 'configAddress': hx(0x08000000 + config_at),
                               'eventGroupAddress': hx(0x08000000 + event_at), 'eventPointerWords': [hx(p) for p in pointers],
                               'layoutSha256': hashlib.sha256(layout).hexdigest(), 'configSha256': hashlib.sha256(config).hexdigest()}}


def write_enemies(path, document):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['scenario', 'group', 'reference_kinds', 'variants', 'unit_index', 'character_id', 'character_symbol',
                         'class_id', 'class_symbol', 'level', 'autolevel', 'entry_x', 'entry_y', 'x', 'y',
                         'position_status', 'item_ids', 'item_symbols', 'ai_bytes', 'source_address'])
        for group in document['unitGroups']:
            for unit in group['units']:
                if unit['faction'] != 'enemy':
                    continue
                writer.writerow([document['id'], group['id'], '|'.join(sorted({r['kind'] for r in group['references']})),
                                 '|'.join(sorted({r['variant'] for r in group['references'] if 'variant' in r})),
                                 unit['index'], unit['characterId'], unit['characterSymbol'], unit['effectiveClassId'],
                                 unit['classSymbol'], unit['level'], unit['autolevel'], *unit['entryPosition'],
                                 *(unit['position'] or [None, None]), unit['positionStatus'],
                                 '|'.join(map(str, unit['itemIds'])),
                                 '|'.join(document['itemCatalog'][str(i)]['symbol'] or str(i) for i in unit['itemIds']),
                                 '|'.join(f'{v:02X}' for v in unit['aiBytes']), unit['sourceAddress']])


def review_selection(document, chosen, policy):
    goal = chosen.get('goal')
    if goal not in policy.get('allowedGoals', []):
        raise ValueError(f"{document['id']}: selection goal is not allowed")
    raw = bytes.fromhex(document['provenance']['chapterRecordHex'])
    if document['source']['game'] in ['fe7', 'fe8']:
        actual_goal = {0: 'seize', 1: 'rout', 2: 'defend', 3: 'boss'}.get(raw[0x8C])
        if actual_goal != goal:
            raise ValueError(f"{document['id']}: ROM goal {actual_goal!r} does not match reviewed goal {goal!r}")
    elif goal == 'seize' and not any(obj['kind'] == 'seize' for obj in document['objects']):
        raise ValueError(f"{document['id']}: no source seize objective")
    deployments = [group for group in document['unitGroups'] if any(
        ref['kind'] == 'deployment-table' for ref in group['references'])]
    minimum = policy.get('minimumDeploymentTemplates', 6)
    if not deployments or any(len(group['units']) < minimum for group in deployments):
        raise ValueError(f"{document['id']}: deployment is below the {minimum}-template regular-battle threshold")
    primary = document['coverage']['primaryEnemyTemplateCount']
    if primary is None:
        primary = max((sum(unit['faction'] == 'enemy' for unit in group['units']) for group in document['unitGroups']
                       if any(ref['kind'].startswith('opening') or ref['kind'] == 'encounter-table'
                              for ref in group['references'])), default=0)
    if primary < policy.get('minimumEnemyTemplates', 6):
        raise ValueError(f"{document['id']}: too few enemy templates for a regular battle")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rom-dir', type=Path, default=HERE.parents[1] / '火焰纹章系列')
    parser.add_argument('--selection', type=Path, default=HERE / 'selection.json')
    parser.add_argument('--out', type=Path, default=HERE.parents[1] / 'content/scenarios/gba-classics-v1')
    args = parser.parse_args()
    selection = json.loads(args.selection.read_text(encoding='utf-8'))
    roms = {}
    for path in args.rom_dir.glob('*.gba'):
        code = read_at(path.read_bytes(), 0xAC, 4).decode('ascii')
        if code in roms:
            raise ValueError(f'Multiple ROMs share game code {code}; use a directory with one edition per game')
        roms[code] = path
    documents = []
    readers = []
    for game in selection['games']:
        if game['gameCode'] not in roms:
            raise ValueError(f"Missing local ROM for {game['gameCode']}")
        reader = GbaReader(roms[game['gameCode']])
        readers.append(reader)
        for chosen in game['chapters']:
            document = reader.chapter(chosen)
            review_selection(document, chosen, selection['policy'])
            document['adaptation']['notes'].append('Reviewed selection goal: ' + chosen['goal'])
            documents.append(document)
            print(document['id'], f"{document['map']['width']}x{document['map']['height']}",
                  f"{document['coverage']['enemyTemplateCount']} enemy templates / {len(document['unitGroups'])} groups")
    # Collect and check all chapters before writing the requested pack.
    if len(documents) != 30 or any(sum(d['source']['game'] == g for d in documents) != 10 for g in GAME_NAMES):
        raise ValueError('Selection must contain exactly 10 chapters per game, 30 total')
    for game in GAME_NAMES:
        selected = [d for d in documents if d['source']['game'] == game]
        if len({d['provenance']['layoutSha256'] for d in selected}) != 10:
            raise ValueError(f'{game}: repeated map layout in selected chapters')
    for reader in readers:
        if hashlib.sha1(reader.path.read_bytes()).hexdigest() != reader.sha1:
            raise ValueError('ROM changed during export')
    previous_files = []
    previous_manifest = args.out / 'manifest.json'
    if previous_manifest.exists():
        previous = json.loads(previous_manifest.read_text(encoding='utf-8'))
        if previous.get('format') != 'agent-tactics.scenario-pack' or previous.get('id') != 'gba-classics-v1':
            raise ValueError('Output folder contains a different content pack')
        for entry in previous['scenarios']:
            old = (args.out / entry['file']).resolve()
            old.relative_to(args.out.resolve())
            if old.name != 'scenario.json':
                raise ValueError('Unexpected file in prior manifest')
            previous_files.append(old)
    manifest = {'format': 'agent-tactics.scenario-pack', 'schemaVersion': 1,
                'id': 'gba-classics-v1', 'scenarioCount': 30,
                'games': [{'game': reader.game, 'name': GAME_NAMES[reader.game], 'gameCode': reader.code,
                           'romSha1': reader.sha1, 'count': 10} for reader in readers], 'scenarios': []}
    for document in documents:
        folder = args.out / document['source']['game'] / document['id']
        path = folder / 'scenario.json'
        dump(path, document)
        write_enemies(folder / 'enemies.csv', document)
        payload = path.read_bytes()
        manifest['scenarios'].append({'id': document['id'], 'name': document['name'], 'game': document['source']['game'],
                                       'chapter': document['chapter']['number'], 'route': document['chapter']['route'],
                                       'width': document['map']['width'], 'height': document['map']['height'],
                                       'enemyTemplates': document['coverage']['enemyTemplateCount'],
                                       'file': path.relative_to(args.out).as_posix(), 'sha256': hashlib.sha256(payload).hexdigest()})
    dump(args.out / 'manifest.json', manifest)
    from preview_pack import write_pack_preview
    write_pack_preview(documents, manifest, args.out)
    subprocess.run(['node', '--experimental-strip-types', str(HERE / 'check-pack.ts'), str(args.out),
                    '--report', str(args.out / 'validation.json')], check=True)
    current_files = {(args.out / entry['file']).resolve() for entry in manifest['scenarios']}
    for old in previous_files:
        if old not in current_files:
            old.unlink(missing_ok=True)
            old.with_name('enemies.csv').unlink(missing_ok=True)
            if not any(old.parent.iterdir()):
                old.parent.rmdir()
    print(f'Saved {len(documents)} distinct chapter maps to {args.out}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except (ValueError, OSError, KeyError, IndexError, struct.error, subprocess.CalledProcessError) as error:
        print(f'Export failed: {error}', file=sys.stderr)
        raise SystemExit(1)
