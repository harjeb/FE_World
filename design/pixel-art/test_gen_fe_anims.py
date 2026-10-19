"""Small converter regressions; never writes to the real asset directory."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

spec = importlib.util.spec_from_file_location('gen_fe_anims', Path(__file__).with_name('gen_fe_anims.py'))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


class ConverterTests(unittest.TestCase):
    def test_parser_and_contact_clip(self):
        modes = gen.parse_script('''# comment
/// - Mode 1
2 p- first.png # idle
C04
C1A
3 p- hit.png
C01
1 p- return.png
~~~
''')
        clip, contact = gen.clip(modes[1], {'first.png': 0, 'hit.png': 1, 'return.png': 2})
        self.assertTrue(contact)
        self.assertEqual(clip['frames'], [0, 1, 2])
        self.assertEqual(clip['durationsMs'], [33, 370, 17])
        self.assertEqual((clip['release'], clip['hit'], clip['recover']), (0, 1, 2))

    def test_real_punch_contact_and_hp_hold(self):
        for filename, command in (('F03.txt', '0A'), ('F07.txt', '09'), ('F08.txt', '09')):
            with self.subTest(script=filename):
                text = (gen.HERE/'fe-repo-candidates'/'fist'/filename).read_text()
                mode = gen.parse_script(text)[3]
                order = {name: i for i, (name, _) in enumerate(mode['steps'])}
                result, contact = gen.clip(mode, order)
                marks = mode['marks']
                self.assertLess(marks['04'], marks[command])
                self.assertTrue(contact)
                self.assertEqual(result['hit'], marks[command])
                self.assertEqual(result['release'], marks['04']-1)
                hold = max(marks['01']-1, marks[command])
                self.assertEqual(result['recover'], hold+1)
                expected = [round(ticks*gen.TICK_MS) for _, ticks in mode['steps']]
                expected[hold] += gen.HP_WAIT_MS
                self.assertEqual(result['durationsMs'], expected)

    def test_real_strong_guy_ranged_unchanged(self):
        text = (gen.HERE/'fe-repo-candidates'/'fist'/'F03.txt').read_text()
        modes = gen.parse_script(text)
        for number, timing in ((5, (6, 7, 8)), (6, (33, 34, 35))):
            with self.subTest(mode=number):
                mode = modes[number]
                order = {name: i for i, (name, _) in enumerate(mode['steps'])}
                result, contact = gen.clip(mode, order)
                self.assertFalse(contact)
                self.assertEqual((result['release'], result['hit'], result['recover']), timing)
                expected = [round(ticks*gen.TICK_MS) for _, ticks in mode['steps']]
                expected[timing[1]] += gen.HP_WAIT_MS
                self.assertEqual(result['durationsMs'], expected)

    def test_plan_requires_attacks_and_credits_the_mapped_pack(self):
        source = dict(id='S02', title='Borrowed pack', creditsVerbatim='Original full credits',
                      upstreamUrl='https://example.test/pack')
        entry = dict(classId='fixture', weapons=['fist', 'staff'], sourceId='S01',
                     attribution='Wrong primary author', weaponMap={'fist': 'S02:Melee', 'staff': None})
        data = dict(sources=[source], classes=[entry],
                    gifs=[dict(key='S02:Melee', url=gen.RAW+'pack/Melee.gif')])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            mapping = root/'map.json'
            with patch.object(gen, 'CLASS_MAP', mapping):
                for extra, expected in (({}, 'Original full credits'),
                                        ({'fullCredits': 'Expanded full credits'}, 'Expanded full credits'),
                                        ({'attribution': 'Mapped author'}, 'Mapped author')):
                    source.update(extra)
                    mapping.write_text(json.dumps(data))
                    _, _, actions, uses = gen.plan()
                    self.assertEqual(list(actions), ['S02:Melee'])
                    self.assertEqual(uses, [dict(classId='fixture', weapon='fist', key='S02:Melee',
                                                attribution=expected)])
                converted = dict(file='fixture.png', mask='fixture-mask.png', contact=True,
                                 frames=1, frameSize=[1, 1], team=[], filled=0)
                with patch.object(gen, 'prefetch'), patch.object(gen, 'convert', return_value=converted):
                    gen.build(root, root/'imports.ts')
                credit = json.loads((root/'anims.json').read_text())['credits'][0]
                self.assertEqual(credit['attribution'], 'Mapped author')
                self.assertEqual(credit['creditsVerbatim'], 'Expanded full credits')
                self.assertIn('Expanded full credits', (root/'CREDITS.md').read_text())
                for weapon_map in ({'fist': None}, {}):
                    entry['weaponMap'] = weapon_map
                    mapping.write_text(json.dumps(data))
                    with self.assertRaisesRegex(ValueError, 'fixture: missing attack mapping for fist'):
                        gen.plan()

    def test_project_animation_must_match_and_have_both_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            mapping, studies = root/'map.json', root/'animations.json'
            sheet = dict(id='bird-axe', classId='bird', weapon='axe', file='axe.png', mask='mask.png')
            studies.write_text(json.dumps(dict(sprites=[sheet])))
            mapping.write_text(json.dumps(dict(sources=[], gifs=[], classes=[
                dict(classId='bird', weapons=['axe'], weaponMap={'axe': 'P01:bird-axe'})])))
            with patch.object(gen, 'CLASS_MAP', mapping), patch.object(gen, 'STUDIES', studies):
                for name in ['file', 'mask']:
                    with self.assertRaisesRegex(ValueError, f'missing project {name}'):
                        gen.plan()
                    (root/sheet[name]).write_bytes(b'asset')
                self.assertEqual(gen.plan()[2:], ({}, []))
                sheet['weapon'] = 'sword'
                studies.write_text(json.dumps(dict(sprites=[sheet])))
                with self.assertRaisesRegex(ValueError, 'mismatched project animation'):
                    gen.plan()

    def test_contact_marker_priority_and_fallback(self):
        steps = [('frame.png', 1)]*5
        for marks, hit in (({'04': 1}, 1), ({'04': 1, '09': 2}, 2),
                           ({'04': 1, '0A': 2}, 2), ({'04': 1, '0C': 3}, 3), ({'04': 1, '08': 3, '09': 2}, 3),
                           ({'04': 1, '1A': 4, '08': 3}, 4), ({'04': 1, '0A': 5}, 1)):
            with self.subTest(marks=marks):
                result, contact = gen.clip(dict(steps=steps, marks=marks), {'frame.png': 0})
                self.assertTrue(contact)
                self.assertEqual(result['hit'], hit)

    def test_short_shot_and_empty_clip(self):
        clip, contact = gen.clip({'steps': [('one.png', 1)], 'marks': {'05': 1, '01': 1}}, {'one.png': 0})
        self.assertFalse(contact)
        self.assertEqual((clip['release'], clip['hit'], clip['recover']), (0, 0, 1))
        with self.assertRaises(ValueError):
            gen.clip({'steps': [], 'marks': {}}, {})

    def test_source_paths(self):
        for path in ('../x', '/x', 'x/../y', 'x\\y', 'x//y'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                gen.source_path(path)
        self.assertEqual(gen.source_path('Battle Animations/Pack/frame.png'), 'Battle Animations/Pack/frame.png')

    def test_nonzero_background_preserves_black_outline(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            palette = [0]*48
            palette[27:30] = [0, 120, 240]  # saturated background must never become TEAM
            image = Image.new('P', gen.SCREEN, 9)
            image.putpalette(palette)
            for x in range(170, 180):
                for y in range(100, 120):
                    image.putpixel((x, y), 0)
            image.save(root/'frame.png')
            (root/'Bow.txt').write_text('/// - Mode 1\n1 p- frame.png\n/// - Mode 9\n1 p- frame.png\n')
            action = dict(folder='pack', stem='Bow', key='S20:Bow', pack='S20', name='archer')
            with patch.object(gen, 'fetch', side_effect=lambda path: root/path.split('/')[-1]):
                result = gen.convert(action, root)
            self.assertEqual(result['frameSize'], [12, 22])
            self.assertEqual(result['stand'], 55)
            self.assertNotIn(9, result['team'])
            with Image.open(root/'archer.png') as atlas:
                self.assertEqual(sum(pixel[3] > 0 for pixel in atlas.getdata()), 200)
                self.assertEqual(atlas.getpixel((1, 1)), (0, 0, 0, 255))
                self.assertEqual(atlas.getpixel((0, 0))[3], 0)
            with Image.open(root/'archer-mask.png') as mask:
                self.assertIsNone(mask.getbbox())

    def test_transparency_metadata_takes_priority(self):
        image = Image.new('P', gen.SCREEN, 2)
        image.info['transparency'] = 9
        self.assertEqual(gen.background_index({'frame': image}), 9)

    def test_gif_only_palette_keeps_original_indices(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            palette = [0]*48
            palette[27:30] = [0, 120, 240]
            image = Image.new('P', gen.SCREEN, 9)
            image.putpalette(palette)
            image.putpixel((100, 100), 0)
            image.save(root/'Bow.gif', optimize=False)
            modes = {1: {'steps': [('missing.png', 1)], 'marks': {}}}
            action = dict(folder='pack', stem='Bow', key='S20:Bow')
            with patch.object(gen, 'prefetch', return_value={'pack/missing.png': None}), \
                    patch.object(gen, 'fetch', return_value=root/'Bow.gif'):
                frames, colours, filled, background = gen.load_frames(action, modes, ['missing.png'])
            self.assertEqual((background, filled), (9, 1))
            self.assertEqual(colours[9], (0, 120, 240))
            self.assertEqual(frames['missing.png'].getpixel((100, 100)), 0)
            self.assertEqual(frames['missing.png'].getpixel((0, 0)), 9)

    def test_missing_frame_cache_is_offline_and_does_not_hide_server_errors(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(gen, 'CACHE', Path(temp)):
            missing = gen.urllib.error.HTTPError('https://example.test/frame.png', 404, 'missing', {}, None)
            with patch.object(gen.urllib.request, 'urlopen', side_effect=missing) as request:
                self.assertIsNone(gen.try_fetch('pack/frame.png'))
                self.assertIsNone(gen.try_fetch('pack/frame.png'))
                self.assertEqual(request.call_count, 1)
                target = Path(temp)/'pack/frame.png'
                target.write_bytes(b'restored')
                self.assertEqual(gen.try_fetch('pack/frame.png'), target)
                self.assertEqual(request.call_count, 1)
            unavailable = gen.urllib.error.HTTPError('https://example.test/other.png', 503, 'unavailable', {}, None)
            with patch.object(gen.urllib.request, 'urlopen', side_effect=unavailable) as request:
                for _ in range(2):
                    with self.assertRaises(gen.urllib.error.HTTPError):
                        gen.try_fetch('pack/other.png')
                self.assertEqual(request.call_count, 2)
                self.assertFalse((Path(temp)/'pack/other.png.missing').exists())

    def test_publish_and_failed_conversion(self):
        for fail in (True, False):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                out, imports = root/'assets', root/'imports.ts'
                out.mkdir()
                for name in ('atlas.png', 'README.md', 'unrelated.png'):
                    (out/name).write_text('original')
                imports.write_text('original imports')

                def build(stage, staged_imports):
                    (stage/'atlas.png').write_text('new atlas')
                    if fail:
                        raise RuntimeError('conversion failed')
                    staged_imports.write_text('new imports')

                with patch.object(gen, 'OUT', out), patch.object(gen, 'IMPORTS', imports), patch.object(gen, 'build', build):
                    if fail:
                        with self.assertRaisesRegex(RuntimeError, 'conversion failed'):
                            gen.main()
                    else:
                        gen.main()
                self.assertEqual((out/'atlas.png').read_text(), 'original' if fail else 'new atlas')
                self.assertEqual(imports.read_text(), 'original imports' if fail else 'new imports')
                for name in ('README.md', 'unrelated.png'):
                    self.assertEqual((out/name).read_text(), 'original')
                self.assertEqual(sorted(p.name for p in root.iterdir()), ['assets', 'imports.ts'])


if __name__ == '__main__':
    unittest.main()
