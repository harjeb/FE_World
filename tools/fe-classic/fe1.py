"""FE1 (Shadow Dragon and the Blade of Light) map and enemy reader.

Map data is reached through two pointer tables (chapters 1-13 at 0x8010 and
14-25 at 0x24010, the latter in a bank mapped at file 0x1C000). Each pointer
points 16 bytes before a four-byte header: height-1, width-1, and two bytes of
map flags. Cell values index the game's cell-to-terrain tables.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROM_SHA1 = '1173e4cb2e37908c64161acb1c54d7b35828348e'
TABLE_1_13 = 0x8010
TABLE_14_25 = 0x24010
BANK_BASE_14_25 = 0x1C000
CELL2TERRAIN_BLUE = 0x3E838
HEADER_OFFSET = 16
ENEMY_OFFSETS = {1: (0x20AE5, 14), 2: (0x20B80, 17), 3: (0x20C3C, 14), 4: (0x20CE2, 20), 5: (0x20DBF, 18),
                 6: (0x20E86, 20), 7: (0x20F63, 20), 8: (0x21014, 21), 9: (0x210E6, 19), 10: (0x211AD, 20),
                 11: (0x2128A, 19), 12: (0x2135C, 19), 13: (0x2142E, 20), 14: (0x2150B, 18), 15: (0x215D2, 19),
                 16: (0x216A4, 20), 17: (0x21781, 19), 18: (0x21853, 20), 19: (0x21930, 20), 20: (0x21A0D, 20),
                 21: (0x21AEA, 20), 22: (0x21BC7, 20), 23: (0x21CA4, 20), 24: (0x21D81, 20), 25: (0x21E5E, 20)}

TERRAIN_LABELS = {0: '道路(推测)', 11: '平原(推测)', 12: '城内地板(推测)', 13: '城墙(推测)'}


def load_rom(path: Path) -> bytes:
    data = path.read_bytes()
    if hashlib.sha1(data).hexdigest() != ROM_SHA1:
        raise ValueError('This profile expects the Japanese FE1 ROM')
    if len(data) < 0x28000:
        raise ValueError('ROM is too small for the FE1 profile')
    return data


def map_header_offset(data: bytes, chapter: int) -> int:
    if not 1 <= chapter <= 25:
        raise ValueError('Chapter must be between 1 and 25')
    if chapter <= 13:
        pointer = data[TABLE_1_13 + (chapter - 1) * 2] | data[TABLE_1_13 + (chapter - 1) * 2 + 1] << 8
    else:
        pointer = data[TABLE_14_25 + (chapter - 14) * 2] | data[TABLE_14_25 + (chapter - 14) * 2 + 1] << 8
        pointer += BANK_BASE_14_25
    return pointer + HEADER_OFFSET


def read_map(data: bytes, chapter: int) -> dict:
    header = map_header_offset(data, chapter)
    height, width = data[header] + 1, data[header + 1] + 1
    if not (8 <= width <= 32 and 8 <= height <= 32):
        raise ValueError(f'Implausible map size for chapter {chapter}: {width}x{height}')
    cells = list(data[header + 4:header + 4 + width * height])
    if len(cells) != width * height or max(cells) > 207:
        raise ValueError(f'Map cells out of range for chapter {chapter}')
    terrain = [data[CELL2TERRAIN_BLUE + cell] for cell in cells]
    return {'headerOffset': header, 'width': width, 'height': height,
            'flagBytes': list(data[header + 2:header + 4]), 'cells': cells,
            'terrainIds': [terrain[y * width:(y + 1) * width] for y in range(height)]}


def read_enemies(data: bytes, chapter: int) -> list[dict]:
    offset, count = ENEMY_OFFSETS[chapter]
    units = []
    for index in range(count):
        raw = data[offset + index * 11:offset + index * 11 + 11]
        units.append({'index': index, 'characterId': raw[0], 'classId': raw[1], 'level': raw[2],
                      'itemIds': [value for value in (raw[3], raw[4]) if value],
                      'position': [raw[6], raw[5]], 'ai': raw[7], 'unknown': raw[8],
                      'guardPosition': [raw[10], raw[9]]})
    return units


def build(rom: Path, chapters: list[int] | None = None) -> dict:
    data = load_rom(rom)
    chapters = chapters or list(range(16, 26))
    entries = []
    for chapter in chapters:
        map_data = read_map(data, chapter)
        enemies = read_enemies(data, chapter)
        for unit in enemies:
            x, y = unit['position']
            if not (0 <= x < map_data['width'] and 0 <= y < map_data['height']):
                raise ValueError(f'Enemy outside map in chapter {chapter}')
        terrain = map_data['terrainIds']
        ids = {value for row in terrain for value in row}
        entries.append({
            'id': f'fe1-ch{chapter:02d}', 'name': f'暗黑龙与光之剑 第{chapter}章',
            'chapter': {'number': chapter},
            'map': {'width': map_data['width'], 'height': map_data['height'],
                    'cells': map_data['cells'], 'terrainIds': terrain,
                    'source': {'headerAddress': f'0x{map_data["headerOffset"]:06X}',
                               'flagBytes': map_data['flagBytes']}},
            'terrainCatalog': {str(value): {'label': TERRAIN_LABELS.get(value, f'地形{value}'), 'symbol': f'FE1_{value:02X}'}
                               for value in sorted(ids)},
            'enemyGroups': [{'id': 'initial', 'kind': 'chapter-unit-table', 'units': enemies}],
            'enemyTemplateCount': len(enemies),
            'goal': {'kind': 'unknown', 'inferredFrom': '尚未从事件读取，地形编号含义未完全确认'},
            'adaptation': {'status': 'source-template', 'runtimePlayable': False,
                           'requires': ['地形映射', '职业替换', '项目数值与AI适配', '事件执行']},
        })
    return {'format': 'agent-tactics.scenario', 'schemaVersion': 2, 'platform': 'nes', 'game': 'fe1',
            'pack': 'classic-fc-sfc-v1',
            'source': {'kind': 'rom', 'fileName': rom.name, 'sha1': ROM_SHA1,
                       'mapPointers': '0x8010 (ch1-13), 0x24010 (ch14-25)',
                       'enemyTables': 'per-chapter unit tables documented by FE1 Nightmare modules'},
            'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
            'chapters': entries,
            'limitations': ['地形为FE1编号经Cell2TerrainBlue查表所得，名称是初步标注。',
                            '敌军字段含AI与guard坐标，但未解释AI行为。',
                            '胜利条件由玉座地形推断，未读取事件。']}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--chapters', type=int, nargs='*')
    parser.add_argument('--out', type=Path, default=HERE.parents[1] / 'content/scenarios/classic-fc-sfc-v1/fe1/scenarios.json')
    args = parser.parse_args()
    document = build(args.rom, args.chapters)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"FE1: {len(document['chapters'])} chapters, "
          f"{sum(c['enemyTemplateCount'] for c in document['chapters'])} enemy templates -> {args.out}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
