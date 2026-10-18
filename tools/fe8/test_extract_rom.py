"""Binary-format cases plus an optional, read-only test of the supplied FE8J ROM."""
import hashlib
import json
from pathlib import Path
import struct
import unittest

from extract_rom import HERE, RomChapterReader, compare_reference, validate


class BinaryRomTests(unittest.TestCase):
    @staticmethod
    def reader(data):
        reader = object.__new__(RomChapterReader)
        reader.data = data
        reader.unit_cache = {}
        return reader

    def test_forward_branch_label_after_early_return_is_preserved(self):
        # BEQ label7; ENDA; LABEL7; ENDA. The first return is only one path.
        data = b'\0' * 16 + struct.pack('<4H', 0x0C40, 7, 0, 1)
        data += struct.pack('<2H', 0x0120, 0)
        data += struct.pack('<2H', 0x0820, 7) + struct.pack('<2H', 0x0120, 0)
        script = self.reader(data).script(0x08000010)
        self.assertEqual([c['opcode'] for c in script['commands']], [12, 1, 8, 1])
        self.assertTrue(script['terminated'])

    def test_script_rejects_invalid_instruction_length(self):
        with self.assertRaisesRegex(ValueError, 'instruction length'):
            self.reader(bytes(32)).script(0x08000010)

    def test_event_list_chest_decodes_item_instead_of_script_pointer(self):
        data = bytes(16) + struct.pack('<4I', 7, 4, 0x00140301, 0)
        event, = self.reader(data).event_list(0x08000010)
        self.assertEqual(event['type'], 'CHEST')
        self.assertEqual(event['position'], [1, 3])
        self.assertEqual(event['item']['id'], 4)
        self.assertNotIn('scriptPointer', event)

    def test_event_list_rejects_unknown_command(self):
        data = bytes(16) + struct.pack('<I', 17)
        with self.assertRaisesRegex(ValueError, 'Unknown event-list'):
            self.reader(data).event_list(0x08000010)

    def test_map_change_zero_word_means_preserve_cell(self):
        data = bytearray(96)
        data[16:28] = struct.pack('<5B3xI', 1, 4, 6, 2, 1, 0x08000040)
        data[28] = 255
        data[64:68] = struct.pack('<2H', 0x09C0, 0)
        config = bytearray(0x2400)
        config[0x2000 + 0x270] = 31
        change, = self.reader(data).map_changes(0x08000010, config)
        self.assertEqual(change['terrainIds'], [[31, None]])
        self.assertEqual(change['metatileIndices'], [[0x270, None]])

    def test_relative_reda_destination_is_left_unresolved(self):
        data = bytearray(128)
        data[0:4] = bytes([15, 1, 0, 7 << 3])
        data[4:6] = struct.pack('<H', 21 << 6)
        data[7] = 1
        data[8:12] = struct.pack('<I', 0x08000040)
        data[64:72] = struct.pack('<IHH', 3 | (21 << 6), 1, 0)
        unit, = self.reader(data).units(0x08000000)['units']
        self.assertEqual(unit['entryPosition'], [0, 21])
        self.assertIsNone(unit['finalPosition'])
        self.assertEqual(unit['redaPath'][0]['b'], 1)


class SuppliedRomTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        candidates = list((HERE.parents[1] / '火焰纹章系列').glob('*圣魔*.gba'))
        if not candidates:
            raise unittest.SkipTest('Supplied FE8J ROM is not present locally')
        cls.path = candidates[0]
        cls.before = hashlib.sha1(cls.path.read_bytes()).hexdigest()
        if cls.before != '56f3d3938ec0f61d3864c95c142b03c98225fe72':
            raise unittest.SkipTest('A different ROM was supplied; the edition-specific fixture does not apply')
        cls.document = RomChapterReader(cls.path).chapter(9)
        cls.reference = json.loads((HERE.parents[1] / 'design/classic-maps/extracted/fe8-ch08/chapter.json').read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, 'before'):
            assert hashlib.sha1(cls.path.read_bytes()).hexdigest() == cls.before, 'ROM changed during extraction'

    def test_terrain_and_objects_are_read_from_real_rom(self):
        d = self.document
        self.assertEqual(d['source']['gameCode'], 'BE8J')
        self.assertEqual(d['source']['inputKind'], 'local-rom')
        self.assertEqual(d['provenance']['layout'], '0x081A5E38')
        self.assertEqual(d['provenance']['tilesetConfig'], '0x081987C8')
        self.assertEqual(d['terrainIds'], self.reference['terrainIds'])
        self.assertEqual(d['metatileIndices'], self.reference['metatileIndices'])
        self.assertEqual((d['terrainIds'][2][10], len(d['objects']), len(d['mapChanges'])), (31, 6, 7))

    def test_actual_rom_levels_override_american_source_values(self):
        units = self.document['unitGroups']['turn2PlayerReinforcements']['units']
        self.assertEqual([u['level'] for u in units], [7, 9, 8])
        self.assertEqual([u['finalPosition'] for u in units], [[3, 21], [5, 22], [2, 22]])
        self.assertEqual([u['level'] for u in self.reference['unitGroups']['turn2PlayerReinforcements']['units']], [4, 6, 5])
        cavaliers = self.document['unitGroups']['turn5EnemyReinforcements']['units']
        self.assertEqual([i['id'] for i in cavaliers[1]['items']], [22])

    def test_nested_conditional_load_is_kept_separate(self):
        groups = self.document['otherUnitGroups']
        self.assertEqual([len(g['units']) for g in groups], [3, 3, 5])
        self.assertEqual(sum(len(g['units']) for g in self.document['unitGroups'].values()), 45)
        conditional = next(g for g in groups if g['romAddress'] == '0x0890BD4C')
        self.assertEqual(len(conditional['units']), 5)

    def test_event_graph_and_trigger_area(self):
        d = self.document
        result = validate(d)
        self.assertEqual((result['decodedScripts'], result['decodedInstructions']), (22, 245))
        self.assertEqual(d['eventInterpretation']['area']['boundsInclusive'], {'min': [5, 0], 'max': [15, 10]})
        self.assertEqual([e['startTurn'] for e in d['eventLists']['turn']], [2, 1, 5])
        self.assertFalse(result['emulatorValidated'])

    def test_crosscheck_reports_real_edition_differences(self):
        comparison = compare_reference(self.document, self.reference)
        self.assertTrue(comparison['terrainGridEqual'])
        self.assertTrue(comparison['terrainRulesEqual'])
        self.assertTrue(comparison['mapChangesEqual'])
        self.assertEqual(len(comparison['unitDifferences']), 4)
        self.assertEqual(comparison['unitDifferences'][0]['differences']['level'], {'rom': 7, 'reference': 4})


if __name__ == '__main__':
    unittest.main()
