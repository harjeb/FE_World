#!/usr/bin/env python3
"""Decode FE3 (Monshou no Nazo) chapter terrain from the local Japanese ROM.

Verified against minirop/fe3: chapter table at $8A:8000, per-map terrain
attribute arrays via the 3-byte pointer table at $8A:81F8, and the 33 map
chunks stored as compressed 32x32 16-bit metatile grids from $A4:8000.

This produces a draft asset (terrain + chapter mapping only). Units, events,
chapter names and the final scenario format need further work.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

from fe3 import decompress, DecompressError

HERE = Path(__file__).resolve().parent
PROFILE = {
    'romSha1': 'c0a9e7284a60418932af831683b87c4d2d9e20ea',
    'bodyOffset': 512,
    'chapterTable': 0x50000, 'chapterCount': 63, 'chapterStride': 8,
    'terrainPointerTable': 0x501F8, 'terrainEntries': 36, 'terrainTableStride': 1024,
    'mapChunks': 0x120000, 'mapCount': 33, 'mapWidth': 32, 'mapHeight': 32,
    'terrainMessages': 0x5F48E, 'terrainMessageCount': 26,
    'source': {'repository': 'https://github.com/minirop/fe3', 'romSha1': '3ee8cbe6638da64f1d91df9b81b1478498a5999f',
               'note': 'Addresses and formats follow the disassembly; this ROM edition was verified cell by cell.'},
}


def load_rom(path: Path) -> bytes:
    raw = path.read_bytes()
    digest = hashlib.sha1(raw).hexdigest()
    if digest != PROFILE['romSha1']:
        raise ValueError(f'Expected FE3 Japanese ROM {PROFILE["romSha1"]}, got {digest}')
    return raw[PROFILE['bodyOffset']:]


def terrain_names(data: bytes) -> tuple[dict[int, str], dict[int, str]]:
    by_address = json.loads((HERE / 'fe3_terrain_names.json').read_text(encoding='utf-8'))
    labels, ids = {}, {}
    for terrain_id in range(PROFILE['terrainMessageCount']):
        word = data[PROFILE['terrainMessages'] + terrain_id * 2] | (
            data[PROFILE['terrainMessages'] + terrain_id * 2 + 1] << 8)
        label = by_address.get(str(0x8B0000 | word), '')
        name = label.split('\n')[0]
        if name:
            labels[terrain_id] = name
            ids[terrain_id] = f'0x8B{word:04X}'
    return labels, ids


def resolve(data: bytes, offset: int) -> int:
    low, high, bank = data[offset], data[offset + 1], data[offset + 2]
    address = (bank << 16) | (high << 8) | low
    return ((bank & 0x7F) << 15) | (address & 0x7FFF)


def map_chunks(data: bytes) -> list[dict]:
    chunks, cursor = [], PROFILE['mapChunks']
    for index in range(PROFILE['mapCount']):
        decoded, consumed = decompress(data, cursor)
        if len(decoded) < PROFILE['mapWidth'] * PROFILE['mapHeight'] * 2:
            raise ValueError(f'map chunk {index} is too small: {len(decoded)}')
        cells = struct.unpack('<1024H', decoded[:2048])
        chunks.append({'index': index, 'fileOffset': f'0x{cursor:06X}', 'compressedBytes': consumed,
                       'decompressedBytes': len(decoded), 'cells': cells})
        cursor += consumed
    return chunks


def extract(data: bytes) -> dict:
    names, messageAddresses = terrain_names(data)
    chunks = map_chunks(data)
    chapters = []
    for index in range(PROFILE['chapterCount']):
        entry = PROFILE['chapterTable'] + index * PROFILE['chapterStride']
        tileset, map_index = data[entry], data[entry + 1]
        if map_index >= len(chunks):
            continue
        array_at = resolve(data, PROFILE['terrainPointerTable'] + map_index * 3)
        attributes = data[array_at:array_at + PROFILE['terrainTableStride']]
        cells = chunks[map_index]['cells']
        terrain = [[attributes[cells[y * 32 + x] & 0x3FF] & 0x1F for x in range(32)] for y in range(32)]
        chapters.append({'tableIndex': index, 'tilesetId': tileset, 'mapIndex': map_index,
                         'terrainIds': terrain, 'terrainSourceArray': f'0x{array_at:06X}',
                         'mapChunk': chunks[map_index]['fileOffset']})
    counts: dict[int, int] = {}
    for chapter in chapters:
        for row in chapter['terrainIds']:
            for value in row:
                counts[value] = counts.get(value, 0) + 1
    catalog = {str(value): {'label': names.get(value, f'地形{value}'), 'symbol': f'FE3_{value:02X}',
                            'messageAddress': messageAddresses.get(value)}
               for value in sorted(counts)}
    return {'format': 'agent-tactics.fe3-draft', 'schemaVersion': 0,
            'source': {'kind': 'rom', 'game': 'fe3', 'platform': 'sfc', 'sha1': PROFILE['romSha1'],
                       'profile': PROFILE['source']},
            'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
            'map': {'width': 32, 'height': 32, 'cellEncoding': 'u16 metatile index; terrain = attributeArray[cell & 0x3FF] & 0x1F'},
            'terrainCatalog': catalog, 'terrainCounts': {str(k): v for k, v in sorted(counts.items())},
            'chapters': chapters,
            'limitations': ['地形与章节映射已核对；单位、增援、事件、章名和最终格式尚未提取。',
                            '地图为32x32原图块索引，不含原作图形素材。',
                            '本文件不是可玩关卡，也未通过项目场景格式校验。']}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--out', type=Path, default=HERE.parents[1] / 'design/classic-maps/recon-fc-sfc/fe3-draft.json')
    args = parser.parse_args()
    document = extract(load_rom(args.rom))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f"FE3 draft: {len(document['chapters'])} chapters, {len(document['terrainCatalog'])} terrain types -> {args.out}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
