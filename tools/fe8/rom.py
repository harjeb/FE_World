"""Bounded GBA readers used to compare a canonical local FE8U ROM to source data."""
import hashlib
from pathlib import Path
import struct

GBA_BASE = 0x08000000


def read_canonical_rom(path: Path, expected_sha1: str) -> bytes:
    data = path.read_bytes()
    if len(data) < 0xC0 or data[0xAC:0xB0] != b'BE8E':
        raise ValueError('Expected FE8 US (game code BE8E); Japanese, translated and modified ROMs require another profile')
    actual = hashlib.sha1(data).hexdigest()
    if actual != expected_sha1:
        raise ValueError(f'ROM SHA-1 mismatch: expected {expected_sha1}, got {actual}')
    return data


def read_at(data: bytes, offset: int, length: int) -> bytes:
    if offset < 0 or length < 0 or offset + length > len(data):
        raise ValueError(f'Read outside ROM at 0x{offset:X}, length {length}')
    return data[offset:offset + length]


def read32(data: bytes, offset: int) -> int:
    return struct.unpack('<I', read_at(data, offset, 4))[0]


def pointer_offset(data: bytes, pointer: int) -> int:
    if not GBA_BASE <= pointer < GBA_BASE + min(len(data), 0x2000000):
        raise ValueError(f'Invalid ROM pointer 0x{pointer:08X}')
    return pointer - GBA_BASE


def decompress_lz77(data: bytes, offset: int, maximum: int = 1024 * 1024) -> bytes:
    header = read_at(data, offset, 4)
    if header[0] != 0x10:
        raise ValueError(f'Expected GBA LZ77 header at 0x{offset:X}')
    size = int.from_bytes(header[1:], 'little')
    if size == 0 or size > maximum:
        raise ValueError('Invalid or excessive LZ77 output size')
    output = bytearray()
    cursor = offset + 4
    while len(output) < size:
        flags = read_at(data, cursor, 1)[0]
        cursor += 1
        for bit in range(7, -1, -1):
            if len(output) == size:
                break
            if flags & (1 << bit):
                first, second = read_at(data, cursor, 2)
                cursor += 2
                count = (first >> 4) + 3
                distance = ((first & 15) << 8 | second) + 1
                if distance > len(output):
                    raise ValueError('LZ77 back-reference before output start')
                for _ in range(min(count, size - len(output))):
                    output.append(output[-distance])
            else:
                output.extend(read_at(data, cursor, 1))
                cursor += 1
    return bytes(output)


def unit_records(data: bytes, offset: int, maximum: int = 64) -> list[dict]:
    result = []
    for index in range(maximum + 1):
        # The terminator is identified by charIndex; do not read past it.
        if read_at(data, offset, 1)[0] == 0:
            return result
        if index == maximum:
            break
        raw = read_at(data, offset, 20)
        packed_position = int.from_bytes(raw[4:6], 'little')
        path_count = raw[7]
        path = []
        if path_count:
            path_offset = pointer_offset(data, int.from_bytes(raw[8:12], 'little'))
            for step in range(path_count):
                entry = read_at(data, path_offset + step * 8, 8)
                # muctrl.h: x:6, y:6, flags:6, then u8 a, u16 b, u16 delayFrames.
                packed = int.from_bytes(entry[:3], 'little')
                if (packed >> 12) & 63:
                    raise ValueError('This profile does not interpret special REDA flags')
                path.append([packed & 63, (packed >> 6) & 63])
        result.append({'characterId': raw[0], 'classId': raw[1],
                       'level': raw[3] >> 3, 'factionId': (raw[3] >> 1) & 3,
                       'autolevel': bool(raw[3] & 1),
                       'entryPosition': [packed_position & 63, (packed_position >> 6) & 63],
                       'finalPosition': path[-1] if path else [packed_position & 63, (packed_position >> 6) & 63],
                       'dropFlag': bool(packed_position & 0x2000),
                       'itemIds': [value for value in raw[12:16] if value]})
        offset += 20
    raise ValueError('Unit list has no terminator within limit')


def verify_rom_data(data: bytes, document: dict, source_config: bytes) -> dict:
    # FEBuilderGBA ROMFE8U.cs identifies the pointer locations. Dereference
    # them rather than hard-coding the chapter table and asset data addresses.
    chapter_table = pointer_offset(data, read32(data, 0xB5F98))
    asset_table = pointer_offset(data, read32(data, 0x34680))
    chapter = read_at(data, chapter_table + document['chapterTableIndex'] * 0x94, 0x94)
    expected_map = document['chapterSettings']['map']
    field_names = ['obj1Id', 'obj2Id', 'paletteId', 'tileConfigId', 'mainLayerId',
                   'objAnimId', 'paletteAnimId', 'changeLayerId']
    if list(chapter[4:12]) != [expected_map[key] for key in field_names]:
        raise ValueError('ROM chapter settings differ from pinned source')
    def asset(index):
        return pointer_offset(data, read32(data, asset_table + index * 4))
    layout = decompress_lz77(data, asset(chapter[8]))
    width, height = document['width'], document['height']
    if len(layout) != 2 + width * height * 2 or list(layout[:2]) != [width, height]:
        raise ValueError('ROM map dimensions differ from source')
    words = struct.unpack(f'<{width * height}H', layout[2:])
    if any(word & 3 for word in words) or [word >> 2 for word in words] != [
            value for row in document['metatileIndices'] for value in row]:
        raise ValueError('ROM metatiles differ from source')
    config = decompress_lz77(data, asset(chapter[7]))
    if config != source_config:
        raise ValueError('ROM tileset configuration differs from source')
    for name, group in document['unitGroups'].items():
        records = unit_records(data, pointer_offset(data, int(group['romAddress'], 16)))
        if len(records) != len(group['units']):
            raise ValueError(f'ROM unit count differs: {name}')
        for record, unit in zip(records, group['units']):
            expected = {key: unit[key] for key in ['characterId', 'classId', 'level', 'autolevel',
                        'entryPosition', 'finalPosition', 'dropFlag']}
            expected['itemIds'] = [item['id'] for item in unit['items']]
            expected['factionId'] = {'player': 0, 'ally': 1, 'enemy': 2}[unit['faction']]
            if record != expected:
                raise ValueError(f"ROM unit differs: {name}[{unit['index']}]")
    return {'mapCellsCompared': width * height, 'tilesetBytesCompared': len(config),
            'unitTemplatesCompared': sum(len(group['units']) for group in document['unitGroups'].values()),
            'eventBytecodeCompared': False}
