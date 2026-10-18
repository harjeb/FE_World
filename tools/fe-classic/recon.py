#!/usr/bin/env python3
"""Reconnaissance for FC/SFC Fire Emblem map layouts.

This tool does not claim to extract maps. It tests concrete storage
hypotheses against a local ROM and reports which hypotheses survive, so a
later extractor is built on evidence instead of guesses.

It is read-only: the ROM is opened once and never written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np


# (width, height) pairs that Fire Emblem maps plausibly use on FC/SFC.
DIMENSIONS = [(16, 16), (24, 24), (32, 32), (32, 24), (24, 32), (40, 32), (32, 40), (48, 48), (64, 64)]
ELEMENTS = (1, 2)


def platform_of(raw: bytes) -> dict:
    if raw[:4] == b'NES\x1a':
        return {'platform': 'fc', 'bytes': len(raw), 'headerBytes': 16, 'prgBanks': raw[4],
                'chrBanks': raw[5], 'mapper': (raw[6] >> 4) | (raw[7] & 0xF0)}
    header = 512 if len(raw) % 0x8000 == 512 else 0
    body = raw[header:]
    title = body[0x7FC0:0x7FC0 + 21].decode('ascii', errors='replace').strip('\x00 ')
    if not title.strip():
        title = body[0xFFC0:0xFFC0 + 21].decode('ascii', errors='replace').strip('\x00 ')
    return {'platform': 'sfc', 'bytes': len(raw), 'headerBytes': header, 'headerTitle': title}


def body_of(raw: bytes, info: dict) -> bytes:
    return raw[info['headerBytes']:]


def coherence(grid: np.ndarray) -> float:
    """Mean fraction of horizontal and vertical neighbours that share a value."""
    return float(((grid[:, 1:] == grid[:, :-1]).mean() + (grid[1:] == grid[:-1]).mean()) / 2)


def mean_run(grid: np.ndarray) -> float:
    """Average run length of equal values; maps have long runs, code/data do not."""
    horizontal = (grid[:, 1:] != grid[:, :-1]).sum(axis=1) + 1
    vertical = (grid[1:] != grid[:-1]).sum(axis=0) + 1
    return float(grid.size / (horizontal.sum() + vertical.sum()))


def score_grid(grid: np.ndarray, max_unique: int) -> dict | None:
    values = np.unique(grid)
    if not 4 <= len(values) <= max_unique:
        return None
    if int(grid.max()) > 0x3F:
        return None
    zero_fraction = float((grid == 0).mean())
    if zero_fraction > 0.85:
        return None
    run, agree = mean_run(grid), coherence(grid)
    if run < 3.0 or agree < 0.55:
        return None
    return {'uniqueValues': int(len(values)), 'maxValue': int(grid.max()),
            'zeroFraction': round(zero_fraction, 3), 'meanRun': round(run, 2), 'coherence': round(agree, 3)}


def grids_at(raw: np.ndarray, offset: int, width: int, height: int) -> list[tuple[str, np.ndarray, int]]:
    cells = width * height
    out: list[tuple[str, np.ndarray, int]] = []
    if offset + cells <= len(raw):
        out.append(('u8', raw[offset:offset + cells].reshape(height, width), 1))
        result = np.empty(cells, dtype=np.uint8)
        result[0::2], result[1::2] = raw[offset:offset + cells // 2] >> 4, raw[offset:offset + cells // 2] & 0x0F
        out.append(('nibble-high-first', result.reshape(height, width), 1))
        out.append(('nibble-low-first', np.stack([result[0::2], result[1::2]], axis=1).reshape(height, width), 1))
    if offset + cells * 2 <= len(raw):
        out.append(('u16le-mask10', raw[offset:offset + cells * 2].view('<u2').reshape(height, width) & 0x3FF, 2))
    return out


def scan_plain(raw: np.ndarray, step: int, limit: int) -> list[dict]:
    hits = []
    for width, height in DIMENSIONS:
        cells = width * height
        for offset in range(0, max(0, len(raw) - cells), step):
            for encoding, grid, element in grids_at(raw, offset, width, height):
                scored = score_grid(grid, max_unique=96 if element == 1 else 512)
                if scored:
                    hits.append({'offset': f'0x{offset:06X}', 'encoding': encoding,
                                 'width': width, 'height': height, **scored})
    hits.sort(key=lambda hit: (hit['meanRun'], hit['coherence']), reverse=True)
    return hits[:limit]


def scan_rle(raw: np.ndarray, limit: int, step: int = 0x200) -> list[dict]:
    """Test byte-pair run-length layouts, the simplest scheme a mapper would use."""
    pairs = raw[:len(raw) - (len(raw) % 2)].reshape(-1, 2)
    first, second = pairs[:, 0], pairs[:, 1]
    hits = []
    for scheme, values, counts in (('value-count', first, second), ('count-value', second, first)):
        for start in range(0, max(0, len(pairs) - 256), step // 2):
            window_counts = counts[start:start + 256]
            if float((window_counts <= 16).mean()) < 0.6:
                continue
            if len(np.unique(values[start:start + 256])) > 32:
                continue
            for width, height in DIMENSIONS:
                need = width * height
                out = np.empty(need, dtype=np.uint8)
                written, cursor = 0, start
                while written < need and cursor < len(pairs):
                    value, count = int(values[cursor]), int(counts[cursor])
                    take = min(max(count, 1), need - written)
                    out[written:written + take] = value
                    written += take
                    cursor += 1
                if written != need:
                    continue
                scored = score_grid(out.reshape(height, width), max_unique=64)
                if scored:
                    hits.append({'offset': f'0x{start * 2:06X}', 'encoding': f'rle-{scheme}',
                                 'width': width, 'height': height, **scored})
    hits.sort(key=lambda hit: (hit['meanRun'], hit['coherence']), reverse=True)
    return hits[:limit]


def preview(raw: np.ndarray, hit: dict, rows: int = 12) -> list[str]:
    offset, width, height = int(hit['offset'], 16), hit['width'], hit['height']
    cell_bytes = 2 if hit['encoding'].startswith('u16') else 1
    grid = raw[offset:offset + width * height * cell_bytes]
    grid = grid.view('<u2').reshape(height, width) & 0x3FF if cell_bytes == 2 else grid.reshape(height, width)
    values, counts = np.unique(grid, return_counts=True)
    rank = {int(value): ' .:-=+*#%@'[min(9, position)]
            for position, value in enumerate(values[np.argsort(-counts)])}
    return [''.join(rank[int(value)] for value in row) for row in grid[:rows]]


def recon(path: Path, step: int, limit: int) -> dict:
    raw_bytes = path.read_bytes()
    info = platform_of(raw_bytes)
    body = body_of(raw_bytes, info)
    raw = np.frombuffer(body, dtype=np.uint8)
    plain = scan_plain(raw, step, limit)
    rle = scan_rle(raw, limit)
    report = {'file': path.name, 'sha1': hashlib.sha1(raw_bytes).hexdigest(),
              'sha256': hashlib.sha256(raw_bytes).hexdigest(), **info, 'bodyBytes': len(body),
              'tested': {'dimensions': DIMENSIONS, 'elements': list(ELEMENTS), 'alignmentStep': step,
                         'encodings': ['u8', 'nibble-high-first', 'nibble-low-first', 'u16le-mask10',
                                       'rle-value-count', 'rle-count-value']},
              'plainCandidates': plain, 'rleCandidates': rle}
    for hit in plain[:3]:
        hit['preview'] = preview(raw, hit)
    report['conclusion'] = ('no hypothesis survived; layout is likely compressed, split by a chapter table, '
                            'or stored as graphics tiles'
                            if not plain and not rle
                            else 'candidates exist but need visual confirmation against a published map')
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('roms', nargs='+', type=Path)
    parser.add_argument('--step', type=int, default=0x400, help='alignment step for plain-array scans')
    parser.add_argument('--limit', type=int, default=12)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    reports = []
    for path in args.roms:
        report = recon(path, args.step, args.limit)
        reports.append(report)
        print(f"{path.name}: {len(report['plainCandidates'])} plain, "
              f"{len(report['rleCandidates'])} RLE candidates - {report['conclusion'][:60]}")
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Saved reconnaissance report to {args.out}')
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
