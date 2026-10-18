#!/usr/bin/env python3
"""Extract ten mid/late FE3 chapters (terrain, player units, initial enemies) from the ROM.

All values come from the local Japanese ROM; labels come from the minirop/fe3
disassembly and its decoded text lists. The output is a platform-extended
scenario draft, not yet a playable battle.
"""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys

import fe3_maps
from fe3 import decompress

HERE = Path(__file__).resolve().parent
SELECTION = [
    (11, 'book1', 11), (12, 'book1', 12), (13, 'book1', 13), (14, 'book1', 14), (15, 'book1', 15),
    (16, 'book1', 16), (17, 'book1', 17), (18, 'book1', 18), (19, 'book1', 19), (20, 'book1', 20),
]
UNIT_TABLE = 0x40000
ENEMY_TABLE = 0x48000  # CHAPTERS_REINFORCEMENT_ENEMY_UNITS: 初始敌军指针表，按章节表索引
CHAPTER_IDS = 0x20C15
BUILDINGS = 0x6117C
RECORD = 19


def resolve(data: bytes, word: int, bank: int) -> int:
    return ((bank & 0x7F) << 15) | (word & 0x7FFF)


def records(data: bytes, offset: int, limit: int = 64) -> list[dict]:
    units = []
    for index in range(limit):
        raw = data[offset + index * RECORD:offset + (index + 1) * RECORD]
        if raw[0] == 0xFF:
            return units
        if len(raw) != RECORD:
            raise ValueError('unit record truncated')
        units.append({'index': index, 'sourceAddress': f'0x{offset + index * RECORD + 0x800000:06X}',
                      'unitId': raw[0], 'classId': raw[1], 'level': raw[2], 'nameId': raw[3],
                      'position': [raw[4], raw[5]], 'mountedClassId': raw[6], 'portraitId': raw[7],
                      'weaponIds': [v for v in raw[8:12] if v != 0xFF],
                      'itemIds': [v for v in raw[12:14] if v != 0xFF],
                      'money': (raw[14] | raw[15] << 8) if raw[14:16] != b'\xff\xff' else 0,
                      'aiBytes': list(raw[16:19]),
                      'playerLike': raw[16:19] == b'\xff\xff\xff'})
    raise ValueError('unit list has no terminator')


def chapter_units(data: bytes, chapter: int) -> list[dict]:
    pointer = data[UNIT_TABLE + chapter * 2] | data[UNIT_TABLE + chapter * 2 + 1] << 8
    return records(data, resolve(data, pointer, 0x88))


def initial_enemy_units(data: bytes, table_index: int) -> list[dict]:
    """CHAPTERS_REINFORCEMENT_ENEMY_UNITS is indexed by chapter-table index.

    Its disassembly comment calls it "initial units on the map"; the old
    chapter-info byte at +3 (0x1F here) is not a usable index and made every
    selected chapter read the same shared list.
    """
    pointer = data[ENEMY_TABLE + table_index * 2] | data[ENEMY_TABLE + table_index * 2 + 1] << 8
    offset = resolve(data, pointer, 0x89)
    if offset in (0x48000, 0x4FFFF):
        return []
    return records(data, offset)


def buildings_for(data: bytes, chapter_id: int) -> list[dict]:
    out, offset = [], BUILDINGS
    while data[offset] != 0xFF:
        chapter, unit, x, y, restriction, kind = data[offset:offset + 6]
        if chapter == chapter_id:
            out.append({'kind': kind, 'position': [x, y], 'unitRestriction': unit,
                        'restriction': restriction, 'parameter': data[offset + 6] | data[offset + 7] << 8,
                        'sourceAddress': f'0x{offset + 0x800000:06X}'})
        offset += 10
    return out


def build(rom: Path, out: Path) -> dict:
    data = fe3_maps.load_rom(rom)
    draft = fe3_maps.extract(data)
    names = {int(key): value['label'] for key, value in draft['terrainCatalog'].items()}
    chapters = {chapter['tableIndex']: chapter for chapter in draft['chapters']}
    selected = []
    for table_index, book, number in SELECTION:
        chapter_id = data[CHAPTER_IDS + table_index]
        chapter = chapters[chapter_id]
        units = chapter_units(data, chapter_id)
        players = [unit for unit in units if unit['playerLike']]
        enemies = initial_enemy_units(data, table_index)
        enemy_groups = []
        if enemies:
            enemy_groups.append({'id': 'initial', 'kind': 'enemy-unit-table', 'units': enemies})
        throne = any(value == 26 for row in chapter['terrainIds'] for value in row)
        selected.append({
            'id': f'fe3-{book}-ch{number:02d}', 'name': f"纹章之谜 {'第1部' if book == 'book1' else '第2部'} 第{number}章",
            'chapter': {'book': book, 'number': number, 'tableIndex': table_index, 'chapterId': chapter_id,
                        'mapIndex': chapter['mapIndex']},
            'map': {'width': 32, 'height': 32, 'terrainIds': chapter['terrainIds'],
                    'terrainAttributeArray': chapter['terrainSourceArray'], 'mapChunk': chapter['mapChunk']},
            'terrainCatalog': {str(key): {'label': value, 'symbol': f'FE3_{key:02X}'}
                               for key, value in sorted(names.items())},
            'playerUnits': players,
            'enemyGroups': enemy_groups,
            'enemyTemplateCount': sum(len(group['units']) for group in enemy_groups),
            'goal': {'kind': 'seize' if throne else 'boss', 'inferredFrom': 'terrain 26 present' if throne else 'no throne tile'},
            'buildings': buildings_for(data, chapter_id),
            'adaptation': {'status': 'source-template', 'runtimePlayable': False,
                           'requires': ['地形映射', '职业替换', '项目数值与AI适配', '事件执行']},
        })
    document = {
        'format': 'agent-tactics.scenario', 'schemaVersion': 2, 'platform': 'sfc', 'game': 'fe3',
        'pack': 'classic-fc-sfc-v1',
        'source': {'kind': 'rom', 'fileName': rom.name, 'sha1': fe3_maps.PROFILE['romSha1'],
                   'profile': fe3_maps.PROFILE['source'],
                   'addresses': {'chapterTable': '0x8A8000', 'terrainPointerTable': '0x8A81F8',
                                 'terrainMessages': '0x8B8F48E' if False else '0x8B0000+0xF48E',
                                 'mapChunks': '0xA48000'}},
        'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
        'chapters': selected,
        'limitations': ['章名取自章表顺序，未使用汉化/日文文本名称。',
                        '胜利条件由城地形推断，尚未从事件数据读取。',
                        '敌军取自 CHAPTERS_REINFORCEMENT_ENEMY_UNITS（章节初始敌军表）；未执行事件分支。',
                        '地形编号为FE3编号，需要项目侧映射。'],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(__import__('json').dumps(document, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return document


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--out', type=Path,
                        default=HERE.parents[1] / 'content/scenarios/classic-fc-sfc-v1/fe3/scenarios.json')
    args = parser.parse_args()
    document = build(args.rom, args.out)
    print(f"FE3: {len(document['chapters'])} chapters, "
          f"{sum(c['enemyTemplateCount'] for c in document['chapters'])} enemy templates -> {args.out}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
