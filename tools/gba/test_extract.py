"""Dataset integrity checks against the actual, unmodified local cartridges."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import unittest

from extract import GbaReader, HERE, METADATA
from rom import decompress_lz77

ROOT = HERE.parents[1]
PACK = ROOT / 'content/scenarios/gba-classics-v1'


class SelectionTests(unittest.TestCase):
    def test_thirty_distinct_mid_late_chapters_and_route_labels(self):
        selection = json.loads((HERE / 'selection.json').read_text(encoding='utf-8'))
        self.assertEqual([len(game['chapters']) for game in selection['games']], [10, 10, 10])
        minimum = {'fe6': 13, 'fe7': 19, 'fe8': 11}
        for game in selection['games']:
            self.assertEqual(len({c['index'] for c in game['chapters']}), 10)
            for chapter in game['chapters']:
                if chapter['chapter'].isdigit():
                    self.assertGreaterEqual(int(chapter['chapter']), minimum[game['game']])
                self.assertTrue(chapter['route'])
                self.assertTrue(chapter['expectedInternalName'])


    def test_fe8_display_chapters_match_named_source_layouts(self):
        # FE8 inserted chapter 11 at slots61/62. Its internal E11/E12/etc.
        # names therefore cannot be treated as display chapter numbers.
        from extract_ch08 import Sources
        cache = HERE.parent / 'fe8/.cache'
        try:
            source = Sources(cache, offline=True)
            chapters = source.json('src/data/chapter_settings.json')['chapters']
            assembly = source.text('data/data_8B363C.s')
        except (OSError, ValueError):
            self.skipTest('Pinned public-source reference cache is unavailable')
        layouts = re.findall(r'^\s*\.word\s+(\w+)', assembly, re.M)
        expected = ['Ch11EphraimMap', 'Ch12EirikaMap', 'Ch13EphraimMap', 'Ch14EirikaMap',
                    'Ch14EphraimMap', 'Ch15Map', 'Ch16Map', 'Ch17Map', 'Ch20Map', 'FinalChapterMap1']
        selection = json.loads((HERE / 'selection.json').read_text(encoding='utf-8'))['games'][2]['chapters']
        for entry, layout in zip(selection, expected):
            self.assertEqual(layouts[chapters[entry['index']]['map']['mainLayerId']], layout, entry['name'])


class ActualRomDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        paths = list((ROOT / '火焰纹章系列').glob('*.gba'))
        if not paths:
            raise unittest.SkipTest('Actual ROMs are local inputs and are not committed')
        cls.roms = {}
        cls.paths = {}
        cls.before = {}
        for path in paths:
            data = path.read_bytes()
            code = data[0xAC:0xB0].decode('ascii')
            cls.roms[code] = data
            cls.paths[code] = path
            cls.before[code] = hashlib.sha1(data).hexdigest()
        manifest = json.loads((PACK / 'manifest.json').read_text(encoding='utf-8'))
        cls.documents = [json.loads((PACK / entry['file']).read_text(encoding='utf-8')) for entry in manifest['scenarios']]
        if not {'AFEJ', 'AE7J', 'BE8J'}.issubset(cls.roms):
            raise unittest.SkipTest('Three supplied GBA games are required for this fixture')

    @classmethod
    def tearDownClass(cls):
        for code, path in getattr(cls, 'paths', {}).items():
            assert hashlib.sha1(path.read_bytes()).hexdigest() == cls.before[code], 'An input ROM changed'

    def test_all_thirty_layouts_and_terrain_cells_match_actual_rom_payloads(self):
        count = Counter()
        layouts = set()
        for d in self.documents:
            data = self.roms[d['source']['gameCode']]
            self.assertEqual(hashlib.sha1(data).hexdigest(), d['source']['sha1'])
            layout = decompress_lz77(data, int(d['provenance']['layoutAddress'], 16) - 0x08000000)
            config = decompress_lz77(data, int(d['provenance']['configAddress'], 16) - 0x08000000)
            w, h = layout[:2]
            self.assertEqual((w, h), (d['map']['width'], d['map']['height']))
            self.assertEqual(hashlib.sha256(layout).hexdigest(), d['provenance']['layoutSha256'])
            for i, (word,) in enumerate(struct.iter_unpack('<H', layout[2:])):
                x, y = i % w, i // w
                self.assertEqual(d['map']['metatileIndices'][y][x], word // 4)
                self.assertEqual(d['map']['terrainIds'][y][x], config[0x2000 + word // 4])
            layouts.add(layout)
            count[d['source']['game']] += 1
        self.assertEqual(count, {'fe6': 10, 'fe7': 10, 'fe8': 10})
        self.assertEqual(len(layouts), 30)

    def test_enemy_records_preserve_raw_levels_inventory_ai_and_coordinates(self):
        checked = 0
        for d in self.documents:
            data = self.roms[d['source']['gameCode']]
            stride = 20 if d['source']['game'] == 'fe8' else 16
            for group in d['unitGroups']:
                for unit in group['units']:
                    if unit['faction'] != 'enemy':
                        continue
                    at = int(unit['sourceAddress'], 16) - 0x08000000
                    raw = data[at:at + stride]
                    self.assertEqual(unit['sourceRecordHex'], raw.hex())
                    self.assertEqual(unit['level'], raw[3] >> 3)
                    self.assertEqual((raw[3] >> 1) & 3, 2)
                    self.assertEqual(unit['characterId'], raw[0])
                    self.assertEqual(unit['classId'], raw[1])
                    self.assertEqual(unit['itemIds'], [v for v in raw[12:16] if v] if stride == 20 else [v for v in raw[8:12] if v])
                    self.assertEqual(unit['aiBytes'], list(raw[16:20] if stride == 20 else raw[12:16]))
                    if stride == 16:
                        self.assertEqual(unit['entryPosition'], list(raw[4:6]))
                        self.assertEqual(unit['position'], list(raw[6:8]))
                    checked += 1
        self.assertEqual(checked, 2697)

    def test_fe6_and_fe7_initial_enemies_are_attached_to_real_chapter_tables(self):
        for d in self.documents:
            game = d['source']['game']
            if game == 'fe8':
                continue
            slot = 4 if game == 'fe6' else 6
            pointer = d['provenance']['eventPointerWords'][slot]
            group = next(g for g in d['unitGroups'] if g['sourceAddress'] == pointer)
            self.assertTrue(any(r['kind'] == 'enemy-table' and r['slot'] == slot for r in group['references']))
            enemies = sum(u['faction'] == 'enemy' for u in group['units'])
            self.assertEqual(enemies, d['coverage']['primaryEnemyTemplateCount'])
            self.assertGreater(enemies, 0)

    def test_class_and_character_records_keep_their_correct_index_bias(self):
        for d in self.documents:
            for catalog in [d['classCatalog'], d['characterCatalog']]:
                for key, record in catalog.items():
                    self.assertEqual(bytes.fromhex(record['sourceRecordHex'])[4], int(key), d['id'])
        for code in ['AFEJ', 'AE7J', 'BE8J']:
            reader = GbaReader(self.paths[code])
            self.assertEqual(reader.character_index_bias, 0 if code == 'AFEJ' else -1)

    def test_selected_goals_and_deployments_exclude_special_trials(self):
        from extract import review_selection
        selection = json.loads((HERE / 'selection.json').read_text(encoding='utf-8'))
        by_id = {d['id']: d for d in self.documents}
        for game in selection['games']:
            for chosen in game['chapters']:
                key = f"{game['game']}-ch{chosen['chapter']}-{chosen['route']}"
                review_selection(by_id[key], chosen, selection['policy'])
        # These are actual ROM tables: Roland has only3/5 deployment entries;
        # the final FE8 demon arena has only2. Neither is a regular full battle.
        for code, chosen in [('AE7J', {'index': 40, 'chapter': '28', 'route': 'test', 'name': 'Roland',
                                     'goal': 'seize', 'expectedInternalName': '18)28'}),
                             ('BE8J', {'index': 22, 'chapter': 'final', 'route': 'test', 'name': 'Demon',
                                      'goal': 'boss', 'expectedInternalName': 'E20B'})]:
            document = GbaReader(self.paths[code]).chapter(chosen)
            with self.assertRaises(ValueError):
                review_selection(document, chosen, selection['policy'])

    def test_batch_export_is_deterministic_without_modifying_input_roms(self):
        with tempfile.TemporaryDirectory(prefix='gba-pack-regression-') as tmp:
            subprocess.run(['python', str(HERE / 'extract.py'), '--out', tmp], cwd=ROOT, check=True,
                           capture_output=True, timeout=45)
            emitted = {p.relative_to(tmp).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in Path(tmp).rglob('*') if p.is_file()}
            saved = {p.relative_to(PACK).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in PACK.rglob('*') if p.is_file()}
            self.assertEqual(emitted, saved)
            self.assertEqual(len(emitted), 64)


if __name__ == '__main__':
    unittest.main()
