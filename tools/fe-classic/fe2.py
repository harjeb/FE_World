"""FE2 (Gaiden) map reader, decoded directly from the ROM.

FE2 stores maps as: height-1, width-1, 0x00, 0x00, then a byte stream.
0xFE toggles between literal runs and repeat runs; in a repeat run the next
byte is a count and the byte after it the tile value. 0xFF terminates the map.
Tile ids index the chapter's graphics; the ROM also keeps a separate terrain
lookup that this reader does not yet decode, so tiles are exported verbatim.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROM_SHA1 = '2153ae9a7b1c63e8d4d83a807f1c8c1f482f7293'


def load_rom(path: Path) -> bytes:
    data = path.read_bytes()
    if hashlib.sha1(data).hexdigest() != ROM_SHA1:
        raise ValueError('This profile expects the Japanese FE2 ROM')
    if data[:4] != b'NES\x1a':
        raise ValueError('Not an iNES file')
    return data


def decode_map(data: bytes, offset: int) -> tuple[int, int, list[int]]:
    height, width = data[offset] + 1, data[offset + 1] + 1
    cursor, tiles, repeat = offset + 4, [], False
    while cursor < len(data) and data[cursor] != 0xFF:
        value = data[cursor]
        cursor += 1
        if value == 0xFE:
            repeat = not repeat
            continue
        if repeat:
            if cursor >= len(data):
                raise ValueError('Truncated repeat')
            tiles.extend([data[cursor]] * value)
            cursor += 1
        else:
            tiles.append(value)
        if len(tiles) > width * height:
            raise ValueError('Map expands past its dimensions')
    if len(tiles) != width * height:
        raise ValueError('Map ended before its dimensions were filled')
    return width, height, tiles


def scan_maps(data: bytes, minimum_area: int = 200) -> list[dict]:
    maps, seen = [], set()
    for offset in range(4, len(data) - 4):
        width, height = data[offset + 1] + 1, data[offset] + 1
        if not (12 <= width <= 40 and 10 <= height <= 40) or data[offset + 2] or data[offset + 3]:
            continue
        if width * height < minimum_area:
            continue
        try:
            got_width, got_height, tiles = decode_map(data, offset)
        except ValueError:
            continue
        if (got_width, got_height) != (width, height):
            continue
        key = bytes(tiles)
        if key in seen:
            continue
        seen.add(key)
        maps.append({'romAddress': f'0x{offset:06X}', 'width': width, 'height': height, 'tileIds': tiles})
    return maps


def build(rom: Path, count: int = 10) -> dict:
    data = load_rom(rom)
    maps = scan_maps(data)
    # Late-game maps sit highest in ROM. Prefer large maps with room for a
    # normal deployment and keep the last ten by address.
    candidates = [m for m in maps if m['width'] * m['height'] >= 300]
    chosen = sorted(candidates, key=lambda m: int(m['romAddress'], 16))[-count:]
    chapters = []
    for index, entry in enumerate(chosen, 1):
        width, height = entry['width'], entry['height']
        rows = [entry['tileIds'][y * width:(y + 1) * width] for y in range(height)]
        chapters.append({
            'id': f"fe2-map-{index:02d}", 'name': f"外传 地图 {entry['romAddress']}",
            'map': {'width': width, 'height': height, 'tileIds': rows},
            'source': {'romAddress': entry['romAddress'], 'format': 'gaiden-map-stream'},
            'enemyGroups': [], 'goal': {'kind': 'boss', 'inferredFrom': 'not yet read from events'},
            'adaptation': {'status': 'map-only', 'runtimePlayable': False,
                           'requires': ['图块到地形的映射', '敌军表', '项目数值与AI适配']},
        })
    return {'format': 'agent-tactics.scenario', 'schemaVersion': 2, 'platform': 'nes', 'game': 'fe2',
            'pack': 'classic-fc-sfc-v1',
            'source': {'kind': 'rom', 'fileName': rom.name, 'sha1': ROM_SHA1,
                       'format': 'https://github.com/minirop/fe2-tiled'},
            'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
            'chapters': chapters,
            'limitations': ['地图为ROM图块编号，尚未映射为项目地形。',
                            '地图按ROM地址选择，未与章节编号绑定；敌军与胜利条件尚未解析。']}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--out', type=Path, default=HERE.parents[1] / 'content/scenarios/classic-fc-sfc-v1/fe2/scenarios.json')
    args = parser.parse_args()
    document = build(args.rom)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"FE2: {len(document['chapters'])} maps -> {args.out}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
