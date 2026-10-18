"""FE2 map reader tests (require the local Japanese ROM)."""
import hashlib
from pathlib import Path
import unittest

import fe2

ROOT = fe2.HERE.parents[1]


def find_rom() -> Path | None:
    for path in (ROOT / 'fe_fc sfc gb nds').rglob('*.nes'):
        if hashlib.sha1(path.read_bytes()).hexdigest() == fe2.ROM_SHA1:
            return path
    return None


class Fe2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = find_rom()
        if not cls.path:
            raise unittest.SkipTest('FE2 Japanese ROM is not present locally')
        cls.data = fe2.load_rom(cls.path)

    def test_decoder_rejects_bad_header_and_short_stream(self):
        with self.assertRaises(ValueError):
            fe2.decode_map(bytes([3, 3, 1, 1]) + bytes(32), 0)
        with self.assertRaises(ValueError):
            fe2.decode_map(bytes([3, 3, 0, 0, 0xFF]), 0)

    def test_decoder_handles_repeat_and_literal_runs(self):
        # 4x2 map: 0xFE switches to repeats; two repeats of 2, then literals.
        stream = bytes([1, 3, 0, 0, 0xFE, 3, 7, 3, 8, 0xFE, 9, 9, 0xFF])
        self.assertEqual(fe2.decode_map(stream, 0), (4, 2, [7, 7, 7, 8, 8, 8, 9, 9]))

    def test_scan_finds_map_streams_with_exact_fill(self):
        maps = fe2.scan_maps(self.data)
        self.assertGreaterEqual(len(maps), 20)
        for entry in maps[:10]:
            self.assertEqual(len(entry['tileIds']), entry['width'] * entry['height'])

    def test_build_selects_ten_distinct_maps(self):
        document = fe2.build(self.path)
        chapters = document['chapters']
        self.assertEqual(len(chapters), 10)
        self.assertGreaterEqual(len({chapter['map']['width'] * chapter['map']['height'] for chapter in chapters}), 2)
        for chapter in chapters:
            self.assertTrue(0 <= max(max(row) for row in chapter['map']['tileIds']) <= 255)


if __name__ == '__main__':
    unittest.main()
