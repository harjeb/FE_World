"""Fire Emblem 3 (Monshou no Nazo) asset decompressor.

Command format follows the disassembly in minirop/fe3 (src/bank000.asm,
DECOMPRESS_ASSET) and docs/compression.md.
"""
from __future__ import annotations


class DecompressError(ValueError):
    pass


def decompress(data: bytes, offset: int, maximum: int = 1 << 20) -> tuple[bytes, int]:
    """Decode one asset. Returns (bytes, consumed), stopping at the 0xFF terminator."""
    out = bytearray()
    cursor = offset
    while True:
        if cursor >= len(data):
            raise DecompressError('stream ended without terminator')
        command = data[cursor]
        cursor += 1
        if command == 0xFF:
            return bytes(out), cursor - offset
        code = command & 0xE0
        if code == 0xE0:
            code = (command << 3) & 0xE0
            if cursor >= len(data):
                raise DecompressError('truncated extended count')
            count = (((command & 0x03) << 8) | data[cursor]) + 1
            cursor += 1
        else:
            count = (command & 0x1F) + 1
        if code == 0x00:
            if cursor + count > len(data):
                raise DecompressError('truncated literal run')
            out += data[cursor:cursor + count]
            cursor += count
        elif code == 0x20:
            if cursor >= len(data):
                raise DecompressError('truncated fill run')
            out += bytes((data[cursor],)) * count
            cursor += 1
        elif code == 0x40:
            if cursor + 2 > len(data):
                raise DecompressError('truncated alternating run')
            first, second = data[cursor], data[cursor + 1]
            cursor += 2
            for index in range(count):
                out.append(first if index % 2 == 0 else second)
        elif code == 0x60:
            if cursor >= len(data):
                raise DecompressError('truncated increment run')
            base = data[cursor]
            cursor += 1
            for step in range(count):
                out.append((base + step) & 0xFF)
        elif code in (0x80, 0xA0):
            if cursor + 2 > len(data):
                raise DecompressError('truncated back-reference')
            start = data[cursor] | (data[cursor + 1] << 8)
            cursor += 2
            if start >= len(out):
                raise DecompressError('back-reference before output start')
            for step in range(count):
                value = out[start + step]
                out.append(value ^ 0xFF if code == 0xA0 else value)
        elif code == 0xC0:
            if cursor >= len(data):
                raise DecompressError('truncated short back-reference')
            distance = data[cursor]
            cursor += 1
            if distance == 0 or distance > len(out):
                raise DecompressError('invalid short back-reference')
            for _ in range(count):
                out.append(out[len(out) - distance])
        else:
            raise DecompressError(f'unknown command {code:#04x}')
        if len(out) > maximum:
            raise DecompressError('output exceeds limit')
