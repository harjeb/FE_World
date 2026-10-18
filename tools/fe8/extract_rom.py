#!/usr/bin/env python3
"""Read FE8 chapter terrain, units and event bytecode directly from a local GBA ROM.

The input ROM is opened read-only. Symbol names and pointer-location profiles
come from formats.json; all chapter values are read from the supplied ROM.
"""
from __future__ import annotations

import argparse
from collections import Counter, deque
import csv
import hashlib
import json
from pathlib import Path
import struct
import sys

from rom import decompress_lz77, pointer_offset, read_at, read32
from extract_ch08 import TERRAIN_STYLE, integration_report
from preview import write_preview

HERE = Path(__file__).resolve().parent
FORMAT = json.loads((HERE / 'formats.json').read_text(encoding='utf-8'))
LIST_LENGTHS = {0: 1, 1: 3, 2: 3, 3: 4, 4: 4, 5: 3, 6: 3, 7: 3,
                8: 3, 9: 3, 10: 3, 11: 3, 12: 3, 13: 3, 14: 3, 15: 4, 16: 4}
LIST_NAMES = ['END', 'FLAG', 'TURN', 'TALK', 'CHARASM', 'LOCATION', 'VILLAGE', 'CHEST',
              'DOOR', 'DRAWBRIDGE', 'SHOP', 'AREA', 'NEVER_C', 'NEVER_D', 'TYPE_E', 'TYPE_F', 'TYPE_10']


def hx(value: int) -> str:
    return f'0x{value:08X}'


def symbol(group: str, value: int) -> str:
    return FORMAT['symbols'][group].get(str(value), f'{group.upper()}_{value:02X}')


def matrix(values, width: int) -> list[list]:
    return [list(values[start:start + width]) for start in range(0, len(values), width)]


class RomChapterReader:
    def __init__(self, path: Path):
        self.path = path
        self.data = path.read_bytes()
        read_at(self.data, 0, 0xC0)
        self.code = self.data[0xAC:0xB0].decode('ascii')
        if self.code not in FORMAT['profiles']:
            raise ValueError(f'Unsupported ROM game code {self.code!r}; this reader supports FE8J/FE8U')
        # The GBA header complement excludes the first 0xA0 bytes and offset 0xBD.
        if (-sum(self.data[0xA0:0xBD]) - 0x19) & 255 != self.data[0xBD]:
            raise ValueError('Invalid GBA header complement')
        self.profile = FORMAT['profiles'][self.code]
        self.chapter_table = self.deref(self.profile['chapterTablePointer'])
        self.asset_table = self.deref(self.profile['assetTablePointer'])
        self.class_table = self.deref(self.profile['classTablePointer'])
        self.unit_cache = {}

    def deref(self, offset: int) -> int:
        return pointer_offset(self.data, read32(self.data, offset))

    def asset(self, index: int) -> int:
        return self.deref(self.asset_table + index * 4)

    def name_at(self, pointer: int) -> str:
        offset = pointer_offset(self.data, pointer)
        return read_at(self.data, offset, 32).split(b'\0', 1)[0].decode('ascii')

    def units(self, pointer: int) -> dict:
        if pointer in self.unit_cache:
            return self.unit_cache[pointer]
        start = pointer_offset(self.data, pointer)
        units = []
        for index in range(65):
            at = start + index * 20
            if read_at(self.data, at, 1)[0] == 0:
                group = {'symbol': 'ROM_' + hx(pointer), 'romAddress': hx(pointer), 'units': units}
                self.unit_cache[pointer] = group
                return group
            if index == 64:
                break
            raw = read_at(self.data, at, 20)
            character, class_id, leader, packed_level = raw[:4]
            faction = (packed_level >> 1) & 3
            if faction > 2 or not 0 < class_id <= 0x7F:
                raise ValueError(f'Unsupported unit definition at {hx(at)}')
            packed_position = int.from_bytes(raw[4:6], 'little')
            entry = [packed_position & 63, (packed_position >> 6) & 63]
            path = []
            if raw[7]:
                route = pointer_offset(self.data, read32(raw, 8))
                for step in range(raw[7]):
                    red = read_at(self.data, route + step * 8, 8)
                    bits = int.from_bytes(red[:3], 'little')
                    path.append({'x': bits & 63, 'y': (bits >> 6) & 63, 'flags': (bits >> 12) & 63,
                                 'a': red[3], 'b': int.from_bytes(red[4:6], 'little'),
                                 'delayFrames': int.from_bytes(red[6:8], 'little')})
            # A non-FFFF b can reference another unit rather than an absolute tile.
            absolute = all(step['flags'] == 0 and step['b'] == 0xFFFF for step in path)
            final = ([path[-1]['x'], path[-1]['y']] if path else entry) if absolute else None
            units.append({'index': index, 'romAddress': hx(0x08000000 + at),
                          'characterId': character, 'character': symbol('character', character),
                          'classId': class_id, 'class': symbol('class', class_id), 'leaderId': leader,
                          'faction': ['player', 'ally', 'enemy'][faction], 'level': packed_level >> 3,
                          'autolevel': bool(packed_level & 1), 'entryPosition': entry,
                          'redaPath': path, 'finalPosition': final,
                          'items': [{'id': value, 'symbol': symbol('item', value)} for value in raw[12:16] if value],
                          'dropFlag': bool(packed_position & 0x2000), 'genMonster': bool(packed_position & 0x1000),
                          'sumFlag': bool(packed_position & 0x4000), 'extraData': raw[6],
                          'aiBytes': list(raw[16:20])})
        raise ValueError(f'Unit list at {hx(pointer)} has no terminator within 64 records')

    def event_list(self, pointer: int) -> list[dict]:
        at = pointer_offset(self.data, pointer)
        result = []
        for _ in range(256):
            header = read32(self.data, at)
            command, flag = header & 0xFFFF, header >> 16
            if command == 0:
                return result
            if command not in LIST_LENGTHS:
                raise ValueError(f'Unknown event-list command {command} at {hx(at)}')
            words = struct.unpack(f'<{LIST_LENGTHS[command]}I', read_at(self.data, at, LIST_LENGTHS[command] * 4))
            entry = {'romAddress': hx(at + 0x08000000), 'type': LIST_NAMES[command], 'typeId': command,
                     'flag': flag, 'words': [hx(word) for word in words]}
            payload = words[2].to_bytes(4, 'little')
            if command not in [7, 8]:
                entry['scriptPointer'] = words[1]
            if command == 2:
                entry.update(startTurn=payload[0], endTurn=payload[1], factionId=payload[2])
            elif command in [3, 4]:
                entry.update(characterA=payload[0], characterB=payload[1], conditionWord=words[3])
            elif command in [5, 6, 7, 8, 9, 10]:
                entry.update(position=list(payload[:2]), tileCommand=payload[2])
                if command == 7:
                    entry['item'] = {'id': words[1], 'symbol': symbol('item', words[1])}
            elif command == 11:
                entry['boundsInclusive'] = {'min': list(payload[:2]), 'max': list(payload[2:])}
            elif command == 1:
                entry['triggerFlag'] = words[2]
            result.append(entry)
            at += LIST_LENGTHS[command] * 4
        raise ValueError('Event list has no terminator within limit')

    def script(self, pointer: int) -> dict:
        at = pointer_offset(self.data, pointer)
        commands = []
        labels, requested_labels = set(), set()
        for _ in range(4096):
            header = read_at(self.data, at, 4)
            length = header[0] >> 4
            opcode = header[1]
            if length < 2 or length > 15:
                raise ValueError(f'Invalid event instruction length at {hx(at + 0x08000000)}')
            raw = read_at(self.data, at, length * 2)
            command = {'romAddress': hx(at + 0x08000000), 'opcode': opcode,
                       'name': symbol('opcode', opcode), 'subcode': header[0] & 15,
                       'arg0': int.from_bytes(header[2:4], 'little'),
                       'halfwords': list(struct.unpack(f'<{length}H', raw))}
            if opcode == 5:
                command.update(slot=command['arg0'], value=read32(raw, 4))
            elif opcode in [0x0A, 0x0B, 0x0D, 0x2C]:
                command['pointer'] = read32(raw, 4)
            if opcode == 8:
                labels.add(command['arg0'])
            elif opcode in [9, 12]:
                requested_labels.add(command['arg0'])
            commands.append(command)
            at += length * 2
            # Forward branch labels can occur after an early ENDA. Continue to
            # decode until their labels and a following ENDA have been visited.
            if opcode == 1 and requested_labels.issubset(labels):
                return {'romAddress': hx(pointer), 'commands': commands, 'terminated': True}
        raise ValueError(f'Event script at {hx(pointer)} exceeds instruction limit')

    def script_graph(self, seeds: set[int]) -> dict:
        pending = deque(sorted(seeds))
        scripts, dynamic_calls = {}, []
        while pending:
            pointer = pending.popleft()
            if pointer in scripts:
                continue
            if len(scripts) >= 256:
                raise ValueError('Event call graph exceeds 256 scripts')
            decoded = self.script(pointer)
            scripts[pointer] = decoded
            for command in decoded['commands']:
                if command['opcode'] in [0x0A, 0x0B]:
                    target = command['pointer']
                    if target >= 0x08000000 and target != 0xFFFFFFFF:
                        pointer_offset(self.data, target)
                        pending.append(target)
                    else:
                        dynamic_calls.append({'from': command['romAddress'], 'pointer': hx(target)})
        return {'scripts': scripts, 'dynamicCalls': dynamic_calls}

    def map_changes(self, pointer: int, config: bytes) -> list[dict]:
        at = pointer_offset(self.data, pointer)
        result = []
        for _ in range(256):
            raw = read_at(self.data, at, 12)
            if raw[0] == 255:
                return result
            index, x, y, width, height = raw[:5]
            if not 0 < width <= 64 or not 0 < height <= 64:
                raise ValueError('Invalid map change size')
            data_at = pointer_offset(self.data, read32(raw, 8))
            words = struct.unpack(f'<{width * height}H', read_at(self.data, data_at, width * height * 2))
            if any(word & 3 or word >> 2 >= 1024 for word in words):
                raise ValueError('Invalid map change metatile')
            indices = [word >> 2 if word else None for word in words]
            result.append({'id': index, 'x': x, 'y': y, 'w': width, 'h': height,
                           'romAddress': hx(at + 0x08000000), 'dataPointer': hx(read32(raw, 8)),
                           'zeroMeansUnchanged': True, 'metatileIndices': matrix(indices, width),
                           'terrainIds': matrix([config[0x2000 + index] if index is not None else None
                                                 for index in indices], width)})
            at += 12
        raise ValueError('Map change table has no terminator')

    def terrain_catalog(self, terrain_ids: set[int]) -> tuple[dict, dict]:
        # Representative class records lead to their actual movement/bonus tables.
        tables, pointers = {}, {}
        for role, class_id in {'foot': 1, 'armored': 9, 'mounted': 5, 'flying': 0x48}.items():
            record = read_at(self.data, self.class_table + class_id * 84, 84)
            if record[4] != class_id:
                raise ValueError('Class table profile failed identity check')
            offsets = [0x38, 0x44, 0x48, 0x4C]
            pointers[role] = {key: hx(read32(record, offset)) for key, offset in zip(
                ['normalMovement', 'avoid', 'defense', 'resistance'], offsets)}
            tables[role] = [struct.unpack('<65b', read_at(self.data, pointer_offset(self.data, read32(record, offset)), 65))
                            for offset in offsets]
        healing_at = self.deref(self.profile['healTablePointer'])
        status_at = self.deref(self.profile['statusHealTablePointer'])
        healing = read_at(self.data, healing_at, 65)
        status = read_at(self.data, status_at, 65)
        catalog = {}
        for value in sorted(terrain_ids):
            if not 0 <= value < 65:
                raise ValueError(f'Unexpected FE8 terrain ID {value}')
            name = symbol('terrain', value)
            label, color, glyph = TERRAIN_STYLE.get(value, (name, '#aaaaaa', '?'))
            if value == 32:
                label, color, glyph = '已开宝箱', '#ae915d', '空'
            catalog[str(value)] = {'symbol': name, 'label': label, 'color': color, 'glyph': glyph,
                                   'normalMovementCosts': {role: table[0][value] for role, table in tables.items()},
                                   'commonBattleBonuses': {key: tables['foot'][i][value] for i, key in enumerate(
                                       ['avoid', 'defense', 'resistance'], 1)},
                                   'flyingBattleBonuses': {key: tables['flying'][i][value] for i, key in enumerate(
                                       ['avoid', 'defense', 'resistance'], 1)},
                                   'healingAmountRaw': healing[value], 'healsStatus': bool(status[value])}
        pointers['healingAmount'] = hx(healing_at + 0x08000000)
        pointers['statusHealing'] = hx(status_at + 0x08000000)
        return catalog, pointers

    def chapter(self, index: int) -> dict:
        if not 0 <= index < 128:
            raise ValueError('Chapter index must be between 0 and 127')
        chapter_at = self.chapter_table + index * 148
        record = read_at(self.data, chapter_at, 148)
        name = self.name_at(read32(record, 0))
        fields = ['obj1Id', 'obj2Id', 'paletteId', 'tileConfigId', 'mainLayerId',
                  'objAnimId', 'paletteAnimId', 'changeLayerId']
        map_ids = dict(zip(fields, record[4:12]))
        layout_at = self.asset(map_ids['mainLayerId'])
        config_at = self.asset(map_ids['tileConfigId'])
        layout = decompress_lz77(self.data, layout_at)
        config = decompress_lz77(self.data, config_at)
        width, height = layout[:2]
        if not 1 <= width <= 64 or not 1 <= height <= 64 or len(layout) != 2 + width * height * 2:
            raise ValueError('Map dimensions disagree with decompressed length')
        if len(config) != 0x2400:
            raise ValueError('Unexpected tileset configuration length')
        words = struct.unpack(f'<{width * height}H', layout[2:])
        if any(word & 3 or word >> 2 >= 1024 for word in words):
            raise ValueError('Invalid map metatile words')
        indices = matrix([word >> 2 for word in words], width)
        terrain = [[config[0x2000 + value] for value in row] for row in indices]
        event_at = self.asset(record[0x74])
        event_pointers = struct.unpack('<20I', read_at(self.data, event_at, 80))
        lists = {key: self.event_list(event_pointers[i]) for i, key in enumerate(['turn', 'character', 'location', 'misc'])}
        seeds = {event_pointers[18], event_pointers[19]}
        seeds.update(event['scriptPointer'] for entries in lists.values() for event in entries
                     if event.get('scriptPointer', 0) > 0x08000000)
        graph = self.script_graph(seeds)
        scripts = graph['scripts']
        direct_loads, slot_candidates = {}, {}
        def reads_inherited_slot2(pointer, visiting=frozenset()):
            if pointer not in scripts or pointer in visiting:
                return False
            inherited = True
            for command in scripts[pointer]['commands']:
                if command['opcode'] == 5 and command['slot'] == 2:
                    inherited = False
                elif command['opcode'] == 6 and command['arg0'] & 15 == 2:
                    inherited = False
                elif inherited and command['opcode'] == 0x2C and command['pointer'] == 0xFFFFFFFF:
                    return True
                elif inherited and command['opcode'] in [0x0A, 0x0B] and reads_inherited_slot2(
                        command['pointer'], visiting | {pointer}):
                    return True
            return False
        for pointer, script in scripts.items():
            direct_loads[pointer] = [command['pointer'] for command in script['commands']
                                     if command['opcode'] == 0x2C and command['pointer'] not in [0, 0xFFFFFFFF]
                                     and command['subcode'] != 3]
            # A literal assigned to slot2 becomes a candidate when the called
            # helper, or a nested helper, loads its inherited slot2 value.
            # This records a static reference without choosing branch outcomes.
            candidates = []
            slot2 = None
            for command in script['commands']:
                if command['opcode'] == 5 and command['slot'] == 2:
                    slot2 = command['value']
                elif command['opcode'] in [0x0A, 0x0B] and slot2 is not None:
                    if reads_inherited_slot2(command['pointer']):
                        if slot2 >= 0x08000000 and slot2 != 0xFFFFFFFF:
                            candidates.append(slot2)
            slot_candidates[pointer] = candidates
        all_unit_pointers = set(direct_loads[event_pointers[18]])
        for values in direct_loads.values():
            all_unit_pointers.update(values)
        for values in slot_candidates.values():
            all_unit_pointers.update(values)
        all_unit_pointers.update(p for p in event_pointers[10:18] if p)
        for pointer in sorted(all_unit_pointers):
            self.units(pointer)

        groups, evidence = {}, {}
        if index == 9 and name == 'L08':
            # Chapter-specific semantic roles are selected from decoded ROM
            # references. No US group addresses or C initializer values are used.
            groups['playerDeploymentTemplates'] = self.units(event_pointers[10])
            evidence['playerDeploymentTemplates'] = {'eventTableOffset': '0x28'}
            opening_loads = direct_loads[event_pointers[18]]
            enemy_loads = [p for p in opening_loads if self.units(p)['units'] and all(
                u['faction'] == 'enemy' for u in self.units(p)['units'])]
            if not enemy_loads:
                raise ValueError('No enemy LOAD in chapter 8 beginning scene')
            groups['initialEnemyTemplates'] = self.units(enemy_loads[-1])
            evidence['initialEnemyTemplates'] = {'script': hx(event_pointers[18]), 'selection': 'last direct enemy LOAD'}
            for role, turn, flag in [('turn2PlayerReinforcements', 2, 0),
                                      ('turn5EnemyReinforcements', 5, 0),
                                      ('areaEnemyReinforcements', 1, 12)]:
                matches = [event for event in lists['turn'] if event['startTurn'] == turn and event['flag'] == flag]
                if len(matches) != 1:
                    raise ValueError(f'Cannot select ROM turn event for {role}')
                pointer = matches[0]['scriptPointer']
                loads = direct_loads[pointer] + slot_candidates[pointer]
                if len(loads) != 1:
                    raise ValueError(f'Ambiguous ROM unit reference for {role}')
                groups[role] = self.units(loads[0])
                evidence[role] = {'script': hx(pointer), 'turnEventAddress': matches[0]['romAddress']}
        else:
            # Numeric chapter data can be extracted elsewhere, but this CLI
            # currently promises chapter-8 role/preview adaptation only.
            raise ValueError('This sample currently supports chapter table index 9 (L08)')
        selected = {int(group['romAddress'], 16) for group in groups.values()}
        extra_groups = [self.units(pointer) for pointer in sorted(all_unit_pointers - selected)]
        objects = []
        for event in lists['location']:
            command = event.get('tileCommand')
            if command in [0x11, 0x12, 0x14]:
                obj = {'kind': {0x11: 'seize', 0x12: 'door', 0x14: 'chest'}[command],
                       'position': event['position'], 'romEventAddress': event['romAddress']}
                if 'item' in event:
                    obj['item'] = event['item']
                objects.append(obj)
        changes_pointer = read32(self.data, self.asset_table + map_ids['changeLayerId'] * 4)
        changes = self.map_changes(changes_pointer, config)
        terrain_set = {value for row in terrain for value in row}
        terrain_set.update(value for change in changes for row in change['terrainIds'] for value in row if value is not None)
        catalog, rule_pointers = self.terrain_catalog(terrain_set)
        area_entries = [event for event in lists['misc'] if event['type'] == 'AREA']
        area = area_entries[0]['boundsInclusive'] if area_entries else None
        return {'schemaVersion': 1, 'id': self.profile['game'].lower() + '-ch08-rom',
                'title': '圣魔之光石·第8章·ROM解析', 'dataKind': 'rom-chapter-extraction',
                'source': {'inputKind': 'local-rom', 'fileName': self.path.name,
                           'bytes': len(self.data), 'gameCode': self.code,
                           'headerTitle': self.data[0xA0:0xAC].rstrip(b'\0').decode('ascii'),
                           'sha1': hashlib.sha1(self.data).hexdigest(),
                           'sha256': hashlib.sha256(self.data).hexdigest(), 'localRomVerified': True,
                           'meaningOfVerified': 'Chapter values were read from this ROM and passed structural checks; not an emulator run.',
                           'formatMetadata': FORMAT['symbolSource'], 'profileMetadata': FORMAT['profileSource']},
                'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
                'chapterTableIndex': index, 'internalName': name, 'width': width, 'height': height,
                'chapterSettings': {'map': map_ids, 'mapEventDataId': record[0x74],
                                    'initialFogLevel': record[0x0C], 'initialWeather': record[0x12],
                                    'initialCamera': list(record[0x10:0x12]), 'crackedWallHealth': record[0x2C]},
                'metatileIndices': indices, 'terrainIds': terrain, 'terrainCatalog': catalog,
                'terrainCounts': {catalog[str(value)]['symbol']: count for value, count in sorted(
                    Counter(value for row in terrain for value in row).items())},
                'objects': objects, 'mapChanges': changes, 'unitGroups': groups,
                'unitRoleEvidence': evidence, 'otherUnitGroups': extra_groups,
                'eventLists': lists,
                'eventScripts': {hx(pointer): script for pointer, script in sorted(scripts.items())},
                'dynamicCalls': graph['dynamicCalls'],
                'eventInterpretation': {'basis': 'ROM事件表与字节码静态解码；未模拟分支、存档或随机数',
                                        'area': {'boundsInclusive': area},
                                        'turn2': {'phase': 'player', 'group': 'turn2PlayerReinforcements'},
                                        'turn5': {'phase': 'player', 'group': 'turn5EnemyReinforcements'}},
                'provenance': {'chapterTable': hx(self.chapter_table + 0x08000000),
                               'chapterRecord': hx(chapter_at + 0x08000000),
                               'assetTable': hx(self.asset_table + 0x08000000),
                               'layout': hx(layout_at + 0x08000000), 'tilesetConfig': hx(config_at + 0x08000000),
                               'chapterEventGroup': hx(event_at + 0x08000000), 'mapChanges': hx(changes_pointer),
                               'chapterRecordHex': record.hex(), 'chapterEventPointerWords': [hx(p) for p in event_pointers],
                               'terrainRules': rule_pointers,
                               'decompressedLayoutSha256': hashlib.sha256(layout).hexdigest(),
                               'decompressedConfigSha256': hashlib.sha256(config).hexdigest()},
                'limitations': ['单位是静态模板，最终阵容、属性和出击状态仍受存档、难度及准备画面影响。',
                                '事件已按指令边界解码并跟随直接CALL；动态CALL和ASM效果没有执行。',
                                '单位角色按第8章特征选取，其他LOAD引用单列，包含过场及条件加载。',
                                '基础地图尚未执行开场地图变化；不是模拟器中某一回合的完整状态。']}


def validate(document: dict) -> dict:
    from extract_ch08 import validate_document
    validate_document(document)
    main_units = sum(len(group['units']) for group in document['unitGroups'].values())
    return {'passed': True, 'inputKind': 'local-rom', 'romSha1': document['source']['sha1'],
            'mapCells': document['width'] * document['height'], 'locationEvents': len(document['objects']),
            'mapChanges': len(document['mapChanges']), 'selectedUnitTemplates': main_units,
            'additionalUnitGroups': len(document['otherUnitGroups']),
            'decodedScripts': len(document['eventScripts']),
            'decodedInstructions': sum(len(script['commands']) for script in document['eventScripts'].values()),
            'dynamicCallsNotExecuted': len(document['dynamicCalls']),
            'asmInstructionsNotExecuted': sum(command['opcode'] == 0x0D for script in document['eventScripts'].values()
                                              for command in script['commands']),
            'emulatorValidated': False}


def write_results(document: dict, out: Path):
    out.mkdir(parents=True, exist_ok=True)
    def dump(name, value):
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    dump('chapter.json', document)
    dump('validation.json', validate(document))
    dump('provenance.json', {'source': document['source'], 'addresses': document['provenance']})
    dump('integration-report.json', integration_report(document))
    with (out / 'terrain.csv').open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['x', 'y', 'metatile_index', 'terrain_id', 'terrain_symbol'])
        for y, row in enumerate(document['terrainIds']):
            for x, value in enumerate(row):
                writer.writerow([x, y, document['metatileIndices'][y][x], value, symbol('terrain', value)])
    write_preview(document, out)


def compare_reference(document: dict, reference: dict) -> dict:
    differences = []
    fields = ['characterId', 'classId', 'faction', 'level', 'autolevel',
              'entryPosition', 'finalPosition', 'dropFlag']
    for role, group in document['unitGroups'].items():
        previous = reference['unitGroups'][role]['units']
        if len(group['units']) != len(previous):
            differences.append({'role': role, 'countInRom': len(group['units']), 'countInReference': len(previous)})
        for unit, old in zip(group['units'], previous):
            changes = {field: {'rom': unit[field], 'reference': old[field]} for field in fields if unit[field] != old[field]}
            items, old_items = [i['id'] for i in unit['items']], [i['id'] for i in old['items']]
            if items != old_items:
                changes['itemIds'] = {'rom': items, 'reference': old_items}
            if changes:
                differences.append({'role': role, 'index': unit['index'], 'character': unit['character'], 'differences': changes})
    return {'referenceSource': reference['source'], 'romSha1': document['source']['sha1'],
            'metatileGridEqual': document['metatileIndices'] == reference['metatileIndices'],
            'terrainGridEqual': document['terrainIds'] == reference['terrainIds'],
            'terrainRulesEqual': document['terrainCatalog'] == reference['terrainCatalog'],
            'mapChangesEqual': [(c['id'], c['x'], c['y'], c['terrainIds']) for c in document['mapChanges']] ==
                               [(c['id'], c['x'], c['y'], c['terrainIds']) for c in reference['mapChanges']],
            'unitDifferences': differences,
            'note': 'Reference is a separate cross-check; exported values remain those read from the local ROM.'}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--chapter-index', type=int, default=9)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--compare', type=Path, help='Optional independent comparison with an exported source chapter JSON')
    args = parser.parse_args()
    try:
        reader = RomChapterReader(args.rom)
        document = reader.chapter(args.chapter_index)
        validate(document)
        out = args.out or HERE.parents[1] / 'design/classic-maps/extracted' / document['id']
        comparison = None
        if args.compare:
            reference = json.loads(args.compare.read_text(encoding='utf-8'))
            comparison = compare_reference(document, reference)
        write_results(document, out)
        if comparison is not None:
            (out / 'comparison.json').write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            (out / 'comparison.json').unlink(missing_ok=True)
        result = validate(document)
        print(f"Extracted {reader.code} {document['internalName']}: {result['mapCells']} cells, "
              f"{result['selectedUnitTemplates']} selected unit templates, {result['decodedScripts']} event scripts to {out}")
        return 0
    except (OSError, ValueError, KeyError, IndexError, struct.error) as error:
        print(f'ROM extraction failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    raise SystemExit(main())
