"""FE1 map/enemy reader tests (need the local Japanese ROM)."""
import hashlib
from pathlib import Path
import unittest

import fe1

ROOT = fe1.HERE.parents[1]


def find_rom() -> Path | None:
    for path in (ROOT / 'fe_fc sfc gb nds').rglob('*.nes'):
        if hashlib.sha1(path.read_bytes()).hexdigest() == fe1.ROM_SHA1:
            return path
    return None


class Fe1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = find_rom()
        if not cls.path:
            raise unittest.SkipTest('FE1 Japanese ROM is not present locally')
        cls.data = fe1.load_rom(cls.path)

    def test_all_twenty_five_maps_have_sane_dimensions_and_terrain(self):
        for chapter in range(1, 26):
            entry = fe1.read_map(self.data, chapter)
            self.assertTrue(8 <= entry['width'] <= 32 and 8 <= entry['height'] <= 32)
            self.assertEqual(len(entry['cells']), entry['width'] * entry['height'])
            self.assertLessEqual(max(max(row) for row in entry['terrainIds']), 31)

    def test_map_pointer_chain_is_contiguous(self):
        for chapter in list(range(1, 13)) + list(range(14, 25)):
            header = fe1.map_header_offset(self.data, chapter)
            height, width = self.data[header] + 1, self.data[header + 1] + 1
            following = fe1.map_header_offset(self.data, chapter + 1)
            self.assertEqual(header + 4 + width * height, following)

    def test_enemy_records_are_inside_each_map(self):
        for chapter in range(14, 26):
            entry = fe1.read_map(self.data, chapter)
            for unit in fe1.read_enemies(self.data, chapter):
                x, y = unit['position']
                self.assertTrue(0 <= x < entry['width'] and 0 <= y < entry['height'])
                self.assertGreater(unit['level'], 0)

    def test_build_selects_late_chapters_with_enemies(self):
        document = fe1.build(self.path)
        self.assertEqual([entry['chapter']['number'] for entry in document['chapters']], list(range(16, 26)))
        self.assertEqual(sum(entry['enemyTemplateCount'] for entry in document['chapters']), 199)
        self.assertTrue(all(entry['map']['width'] in (16, 32) for entry in document['chapters']))


if __name__ == '__main__':
    unittest.main()
