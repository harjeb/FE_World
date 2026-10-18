"""Regression tests for the FE3 map/enemy extraction (needs the local ROM)."""
import hashlib
import json
import struct
from pathlib import Path
import unittest

import extract_fe3
import fe3_maps
from fe3 import decompress

ROOT = fe3_maps.HERE.parents[1]


def find_rom(suffix: str, sha1: str) -> Path | None:
    for path in (ROOT / 'fe_fc sfc gb nds').rglob('*'):
        if path.suffix.lower() == suffix and hashlib.sha1(path.read_bytes()).hexdigest() == sha1:
            return path
    return None


class Fe3RomTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = find_rom('.smc', fe3_maps.PROFILE['romSha1'])
        if not cls.path:
            raise unittest.SkipTest('FE3 Japanese ROM is not present locally')
        cls.data = fe3_maps.load_rom(cls.path)
        cls.draft = fe3_maps.extract(cls.data)

    def test_decompressor_decodes_all_map_chunks(self):
        cursor = fe3_maps.PROFILE['mapChunks']
        sizes = []
        for _ in range(fe3_maps.PROFILE['mapCount']):
            decoded, consumed = decompress(self.data, cursor)
            sizes.append(len(decoded))
            cursor += consumed
        self.assertEqual(len(sizes), 33)
        self.assertTrue(all(size in (2048, 2049) for size in sizes), sizes)

    def test_terrain_pointer_table_resolves_to_1024_byte_arrays(self):
        for index in range(36):
            offset = fe3_maps.resolve(self.data, fe3_maps.PROFILE['terrainPointerTable'] + index * 3)
            self.assertLess(offset + 1024, len(self.data))
            self.assertGreater(len(set(self.data[offset:offset + 1024])), 1)

    def test_every_chapter_map_is_32_by_32_and_references_known_terrain(self):
        catalog = {int(key) for key in self.draft['terrainCatalog']}
        for chapter in self.draft['chapters']:
            self.assertEqual((len(chapter['terrainIds']), len(chapter['terrainIds'][0])), (32, 32))
            self.assertTrue({value for row in chapter['terrainIds'] for value in row} <= catalog)

    def test_selected_chapters_have_enemies_inside_the_map(self):
        document = extract_fe3.build(self.path, fe3_maps.HERE / '.cache-test-fe3.json')
        try:
            self.assertEqual(len(document['chapters']), 10)
            total = 0
            for chapter in document['chapters']:
                enemies = [unit for group in chapter['enemyGroups'] for unit in group['units']]
                total += len(enemies)
                self.assertGreater(len(enemies), 0, chapter['id'])
                for unit in enemies:
                    self.assertTrue(0 <= unit['position'][0] < 32 and 0 <= unit['position'][1] < 32)
            self.assertGreater(total, 200)
        finally:
            (fe3_maps.HERE / '.cache-test-fe3.json').unlink(missing_ok=True)

    def test_unit_records_terminate_and_keep_raw_values(self):
        units = extract_fe3.chapter_units(self.data, 1)
        self.assertGreater(len(units), 5)
        marth = units[0]
        self.assertEqual((marth['unitId'], marth['classId']), (0, 0))
        self.assertEqual(marth['position'], [7, 25])
        self.assertTrue(marth['playerLike'])


if __name__ == '__main__':
    unittest.main()
