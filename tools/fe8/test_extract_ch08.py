"""Format regression checks and independent chapter facts; no ROM is required."""
import copy
import json
from pathlib import Path
import struct
import tempfile
import unittest

from extract_ch08 import (FormatError, HERE, LOCK, Sources, extract, number,
                          parse_mar, parse_units, terrain_rows, validate_document)
from rom import decompress_lz77, pointer_offset, read_at, unit_records


class FormatTests(unittest.TestCase):
    def test_mar_build_shifts_twice_before_terrain_lookup(self):
        # Ch8 throne: editor word 0x4E00 -> engine word 0x09C0 -> tile 0x270.
        self.assertEqual(parse_mar(bytes.fromhex('00 4e'), 1, 1), [[0x270]])
        with self.assertRaises(FormatError):
            parse_mar(b'\x00', 1, 1)
        with self.assertRaises(FormatError):
            parse_mar(b'\x01\x00', 1, 1)
        config = bytearray(0x2400)
        config[0x2000 + 0x270] = 0x1F
        self.assertEqual(terrain_rows([[0x270]], config), [[0x1F]])
        with self.assertRaises(FormatError):
            terrain_rows([[1024]], config)

    def test_lz77_literals_copy_and_overlapping_backreference(self):
        self.assertEqual(decompress_lz77(bytes.fromhex('10 03 00 00 00 41 42 43'), 0), b'ABC')
        self.assertEqual(decompress_lz77(bytes.fromhex('10 09 00 00 10 41 42 43 30 02'), 0), b'ABCABCABC')
        self.assertEqual(decompress_lz77(bytes.fromhex('10 09 00 00 40 41 50 00'), 0), b'AAAAAAAAA')

    def test_lz77_rejects_truncation_invalid_copy_and_excessive_size(self):
        for data in [bytes.fromhex('10 03 00 00 00 41'),
                     bytes.fromhex('10 03 00 00 80 00 00'),
                     bytes.fromhex('11 03 00 00 00 41 42 43'),
                     bytes.fromhex('10 ff ff ff')]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                decompress_lz77(data, 0)

    def test_rom_pointer_and_read_bounds(self):
        data = b'\0' * 128
        self.assertEqual(pointer_offset(data, 0x08000040), 64)
        for pointer in [0, 0x02000000, 0x08000080]:
            with self.subTest(pointer=pointer), self.assertRaises(ValueError):
                pointer_offset(data, pointer)
        for offset, length in [(-1, 2), (127, 2), (0, -1)]:
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                read_at(data, offset, length)

    def test_numeric_source_reader_never_executes_expressions(self):
        self.assertEqual(number('CLASS_GENERAL', {'CLASS_GENERAL': 11}), 11)
        self.assertEqual(number('-1', {}), -1)
        with self.assertRaises(FormatError):
            number("__import__('os').getcwd()", {})

    def test_c_defaults_and_reda_destination(self):
        text = '''
        CONST_DATA struct REDA Route[] = { { .x=3, .y=21, .b=0xFFFF } };
        CONST_DATA struct UnitDefinition UnitDef_088B1234[] = {
            { .charIndex=CHARACTER_EPHRAIM, .classIndex=CLASS_EPHRAIM_LORD,
              .xPosition=0, .yPosition=21, .redaCount=1, .redas=Route,
              .items={ ITEM_LANCE_REGINLEIF } }, { 0 }
        };
        '''
        group = parse_units(text, 'UnitDef_088B1234', {
            'CHARACTER_EPHRAIM': 15, 'CLASS_EPHRAIM_LORD': 1, 'ITEM_LANCE_REGINLEIF': 20})
        unit = group['units'][0]
        self.assertEqual(unit['entryPosition'], [0, 21])
        self.assertEqual(unit['finalPosition'], [3, 21])
        self.assertFalse(unit['autolevel'])
        self.assertEqual(unit['level'], 0)
        self.assertEqual(unit['faction'], 'player')
        self.assertEqual(group['romAddress'], '0x088B1234')

    @staticmethod
    def binary_unit_fixture():
        data = bytearray(128)
        data[0:4] = bytes([0x66, 9, 0, (7 << 3) | (2 << 1) | 1])
        data[4:6] = struct.pack('<H', 4 | (5 << 6) | 0x2000)
        data[7] = 1
        data[8:12] = struct.pack('<I', 0x08000040)
        data[12:16] = bytes([20, 105, 0, 0])
        data[64:72] = struct.pack('<IHH', 3 | (21 << 6), 0xFFFF, 0)
        return data

    def test_binary_unit_bitfields_and_reda_path(self):
        record, = unit_records(self.binary_unit_fixture(), 0)
        self.assertEqual(record, {'characterId': 0x66, 'classId': 9, 'level': 7, 'factionId': 2,
                                 'autolevel': True, 'entryPosition': [4, 5], 'finalPosition': [3, 21],
                                 'dropFlag': True, 'itemIds': [20, 105]})
        data = self.binary_unit_fixture()
        data[66] |= 1  # flags bit 4 lives outside the first 16-bit word.
        with self.assertRaisesRegex(ValueError, 'special REDA'):
            unit_records(data, 0)

    def test_cached_source_checksum_is_enforced(self):
        with tempfile.TemporaryDirectory() as name:
            sources = Sources(Path(name), offline=True)
            source_path = 'graphics/map/layout/Ch8Map.mar'
            target = sources.root / source_path
            target.parent.mkdir(parents=True)
            target.write_bytes(b'\0' * LOCK['files'][source_path]['bytes'])
            with self.assertRaisesRegex(FormatError, 'checksum mismatch'):
                sources.get(source_path)


class ChapterFactsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sources = Sources(HERE / '.cache', offline=True)
        if not all((sources.root / path).exists() for path in LOCK['files']):
            raise unittest.SkipTest('Run extract_ch08.py once to populate the pinned source cache')
        cls.document = extract(sources)

    def test_complete_terrain_grid_and_event_objects_agree(self):
        d = self.document
        validate_document(d)
        self.assertEqual((d['width'], d['height']), (24, 24))
        self.assertEqual(sum(d['terrainCounts'].values()), 576)
        self.assertEqual(d['terrainCounts']['TERRAIN_FLOOR_REGULAR'], 248)
        for x, y, expected in [(10, 2, 0x1F), (19, 4, 0x21), (20, 7, 0x1E),
                               (4, 12, 0x3C), (7, 11, 0x2D), (20, 17, 0x17)]:
            self.assertEqual(d['terrainIds'][y][x], expected, (x, y))
        self.assertEqual(len(d['objects']), 6)
        chest = next(obj for obj in d['objects'] if obj['position'] == [19, 4])
        self.assertEqual(chest['item']['symbol'], 'ITEM_BOOSTER_HP')

    def test_unit_roles_boss_and_corrected_player_identity(self):
        groups = self.document['unitGroups']
        self.assertEqual(len(groups['initialEnemyTemplates']['units']), 27)
        boss = next(u for u in groups['initialEnemyTemplates']['units'] if u['character'] == 'CHARACTER_TIRADO')
        self.assertEqual((boss['class'], boss['level'], boss['finalPosition']), ('CLASS_GENERAL', 1, [10, 2]))
        players = {u['character']: u for u in groups['turn2PlayerReinforcements']['units']}
        self.assertEqual(players['CHARACTER_EPHRAIM']['finalPosition'], [3, 21])
        self.assertEqual(players['CHARACTER_KYLE']['finalPosition'], [2, 22])
        thief = next(u for u in groups['areaEnemyReinforcements']['units'] if u['class'] == 'CLASS_THIEF')
        self.assertEqual(thief['finalPosition'], [10, 13])

    def test_map_changes_keep_zero_masks_and_chest_state(self):
        changes = {c['id']: c for c in self.document['mapChanges']}
        self.assertEqual(len(changes), 7)
        self.assertEqual(changes[1]['terrainIds'], [[0x1A, None], [0x1A, None], [0x17, 0x17]])
        self.assertEqual(changes[3]['terrainIds'], [[0x20]])
        self.assertEqual(changes[5]['terrainIds'], [[0x3C] * 4] * 3)
        self.assertTrue(all(c['zeroMeansUnchanged'] for c in changes.values()))

    def test_trigger_bounds_and_terrain_rules(self):
        d = self.document
        self.assertEqual(d['eventInterpretation']['area']['boundsInclusive'], {'min': [5, 0], 'max': [15, 10]})
        self.assertTrue(d['eventInterpretation']['defeatIfLordDies'])
        self.assertEqual(d['terrainCatalog']['29']['normalMovementCosts'],
                         {'foot': 2, 'armored': 2, 'mounted': 3, 'flying': 1})
        self.assertEqual(d['terrainCatalog']['31']['commonBattleBonuses'],
                         {'avoid': 30, 'defense': 3, 'resistance': 5})

    def test_validation_rejects_coordinate_corruption(self):
        d = copy.deepcopy(self.document)
        d['objects'][0]['position'] = [-1, 7]
        with self.assertRaisesRegex(FormatError, 'outside map'):
            validate_document(d)

    def test_committed_export_matches_pinned_source(self):
        target = HERE.parents[1] / 'design/classic-maps/extracted/fe8-ch08/chapter.json'
        self.assertEqual(json.loads(target.read_text(encoding='utf-8')), self.document)


if __name__ == '__main__':
    unittest.main()
