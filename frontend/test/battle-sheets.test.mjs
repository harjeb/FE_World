import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { battleSheetSpec, recolorBattleSheet, BATTLE_SHEETS } = await import('../src/battle/battle-sheets.ts');
const { BASE_COLORS, FACTION_COLORS } = await import('@common/sprites/battle.ts');
const { CHARACTER_COLORS } = await import('@common/sprites/character-colors.ts');
const { CLASS_ALIASES, CATALOG_CLASS_IDS, CLASSES, canonicalClassId, RETIRED_CLASS_IDS } = await import('@common/data/classes.ts');
const { default: classMap } = await import('../../design/pixel-art/fe-repo-candidates/class-map.json', { with: { type: 'json' } });
const { default: studies } = await import('../../design/pixel-art/battle-sheets/animations.json', { with: { type: 'json' } });
const weapons = [null, ...new Set(Object.values(CLASSES).flatMap(cls => Object.keys(cls.weapons)))];
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const glyphs = ['a', 'A', 'l', 's', 'S', 'h', 'H'];
const defaults = { ...BASE_COLORS, ...FACTION_COLORS.player };
const pixels = () => new Uint8ClampedArray(glyphs.flatMap(glyph => [...rgb(defaults[glyph]), 255]));
const mask = new Uint8ClampedArray(glyphs.flatMap((_, i) => [i + 1, i + 1, i + 1, 255]));

test('every usable attack weapon has its mapped conversion or dedicated project sheet', () => {
  assert.equal(CATALOG_CLASS_IDS.length, 77);
  for (const id of CATALOG_CLASS_IDS) {
    const mapping = classMap.classes.find(entry => entry.classId === id);
    assert.ok(mapping, `${id} has a source mapping`);
    assert.ok(BATTLE_SHEETS.some(sheet => sheet.classId === id && sheet.reacts), `${id} has a converted animation`);
    for (const weapon of weapons) {
      const spec = battleSheetSpec(id, weapon);
      const source = weapon !== 'staff' && mapping.weaponMap[weapon];
      if (weapon !== 'staff' && CLASSES[id].weapons[weapon]) {
        assert.ok(source, `${id}/${weapon} must have an attack mapping`);
        assert.ok(spec, `${id}/${weapon} must have an animation`);
        if (source.startsWith('P01:')) {
          assert.equal(spec.reacts, false);
          assert.equal(spec.id, source.slice(4), `${id}/${weapon} uses its dedicated project animation`);
        } else {
          assert.ok(spec.reacts, `${id}/${weapon} selects a conversion`);
          assert.equal(spec.source, source, `${id}/${weapon} uses its mapped source`);
        }
      } else {
        const study = studies.sprites.find(sheet => sheet.classId === id && sheet.weapon === weapon);
        assert.equal(spec?.id ?? null, study?.id ?? null, `${id}/${weapon} uses its study or procedural fallback`);
      }
      if (spec) {
        assert.equal(spec.classId, id);
        assert.equal(spec.weapon, weapon, `${id} never borrows another weapon`);
      }
    }
  }
});

test('aliases select their canonical class and retired classes retain procedural fallback', () => {
  for (const alias of Object.keys(CLASS_ALIASES)) {
    for (const weapon of weapons) {
      for (const distance of [1, 2]) {
        assert.deepEqual(battleSheetSpec(alias, weapon, distance), battleSheetSpec(canonicalClassId(alias), weapon, distance), `${alias}/${weapon} at ${distance}`);
      }
    }
  }
  for (const id of RETIRED_CLASS_IDS) {
    assert.ok(!CATALOG_CLASS_IDS.includes(id));
    for (const weapon of weapons) assert.equal(battleSheetSpec(id, weapon), null, `${id}/${weapon}`);
  }
});

test('contact attacks at distance prefer their ranged clip or a legitimate fallback', () => {
  for (const sheet of BATTLE_SHEETS.filter(sheet => sheet.contact)) {
    if (battleSheetSpec(sheet.classId, sheet.weapon)?.id !== sheet.id) continue;
    for (const distance of [2, 3]) {
      const far = battleSheetSpec(sheet.classId, sheet.weapon, distance);
      if (sheet.ranged) {
        assert.equal(far?.id, sheet.id);
        assert.deepEqual(far.attack, sheet.ranged);
        assert.deepEqual(far.critical, sheet.rangedCritical);
      } else {
        const study = studies.sprites.find(candidate => candidate.classId === sheet.classId && candidate.weapon === sheet.weapon);
        assert.equal(far?.id ?? null, study?.id ?? null, `${sheet.id} at ${distance}`);
      }
      if (far) {
        assert.equal(far.classId, sheet.classId);
        assert.equal(far.weapon, sheet.weapon);
      }
    }
  }
});

test('default palette is identical; enemy cloth changes only faction roles', () => {
  const original = pixels();
  const data = pixels();
  recolorBattleSheet(data, mask, { side: 'player' });
  assert.deepEqual(data, original);
  recolorBattleSheet(data, mask, { side: 'enemy' });
  assert.deepEqual([...data.slice(0, 12)], ['a', 'A', 'l'].flatMap(glyph => [...rgb(FACTION_COLORS.enemy[glyph]), 255]));
  assert.deepEqual(data.slice(12), original.slice(12));
});

test('every named skin/hair palette applies while preserving alpha and colliding materials', () => {
  for (const named of Object.values(CHARACTER_COLORS)) {
    const data = new Uint8ClampedArray([...pixels(), ...rgb(BASE_COLORS.H), 255, 12, 34, 56, 0]);
    const roles = new Uint8ClampedArray([...mask, 0, 0, 0, 255, 0, 0, 0, 255]);
    data[15] = 128;
    const original = data.slice();
    recolorBattleSheet(data, roles, { side: 'player', ...named });
    const wanted = [...named.skin, ...named.hair];
    wanted.forEach((hex, i) => assert.deepEqual([...data.slice((i + 3) * 4, (i + 3) * 4 + 3)], rgb(hex)));
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], original[i]);
    assert.deepEqual(data.slice(28), original.slice(28), 'horse/leather matching dark hair and transparent pixels are untouched');
  }
});

test('every sheet is bundled with its mask and plays only for its own class and weapon', async () => {
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const assets = await readFile(new URL('../src/assets.ts', import.meta.url), 'utf8');
  const generated = await readFile(new URL('../src/battle/fe-anim-files.ts', import.meta.url), 'utf8');
  const weapons = [null, 'sword', 'lance', 'axe', 'bow', 'tome', 'staff', 'fist', 'beast', 'dragon'];
  assert.equal(new Set(BATTLE_SHEETS.map(sheet => sheet.id)).size, BATTLE_SHEETS.length, 'sheet ids are unique');
  for (const sheet of BATTLE_SHEETS) {
    if (sheet.reacts) {
      for (const file of [sheet.file, sheet.mask]) {
        assert.ok(existsSync(new URL(`../../design/pixel-art/fe-anims/${file}`, import.meta.url)), file);
        assert.ok(generated.includes(`fe-anims/${file}'`) && generated.includes(`'${file}': file`), `${file} is bundled`);
      }
    } else {
      for (const file of [sheet.file, sheet.mask]) assert.ok(assets.includes(`battle-sheets/${file}'`), `${file} is imported`);
      assert.ok(assets.includes(`'${sheet.id}': [`), `${sheet.id} has image sources`);
    }
    assert.equal(typeof sheet.projectile, 'boolean');
    for (const weapon of weapons) {
      const first = BATTLE_SHEETS.find(other => other.classId === sheet.classId && other.weapon === weapon);
      assert.equal(battleSheetSpec(sheet.classId, weapon)?.id ?? null, first?.id ?? null);
    }
  }
  // Bows, tomes, daggers and dragonstones carry their own shot; melee sheets close the distance instead.
  assert.deepEqual([...new Set(BATTLE_SHEETS.filter(sheet => sheet.projectile).map(sheet => sheet.weapon))].sort(), ['bow', 'dragon', 'sword', 'tome']);
});

test('converted animations index real atlas frames, land their hit inside the clip and are credited', async () => {
  const { readFileSync } = await import('node:fs');
  const size = file => { const png = readFileSync(new URL(`../../design/pixel-art/fe-anims/${file}`, import.meta.url)); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
  const { default: manifest } = await import('../../design/pixel-art/fe-anims/anims.json', { with: { type: 'json' } });
  const credited = new Set(manifest.credits.map(credit => credit.pack));
  const converted = BATTLE_SHEETS.filter(sheet => sheet.reacts);
  assert.ok(converted.length > 0, 'converted animations are available');
  for (const sheet of converted) {
    const [w, h] = sheet.frameSize, rows = Math.ceil(sheet.frames / sheet.columns);
    assert.deepEqual(size(sheet.file), [sheet.columns * w, rows * h], `${sheet.id} atlas`);
    assert.deepEqual(size(sheet.mask), [sheet.columns * w, rows * h], `${sheet.id} mask`);
    assert.ok(sheet.origin[0] >= 0 && sheet.origin[0] <= w && sheet.origin[1] > 0 && sheet.origin[1] <= h, `${sheet.id} origin`);
    for (const run of [sheet.idle, sheet.attack, sheet.critical, sheet.ranged, sheet.rangedCritical, sheet.dodge].filter(Boolean)) {
      assert.equal(run.frames.length, run.durationsMs.length);
      assert.ok(run.frames.every(frame => Number.isInteger(frame) && frame >= 0 && frame < sheet.frames), `${sheet.id} frames`);
      assert.ok(run.durationsMs.every(ms => ms > 0), `${sheet.id} durations`);
    }
    for (const clip of [sheet.attack, sheet.critical, sheet.ranged, sheet.rangedCritical].filter(Boolean)) {
      assert.ok(clip.windup <= clip.release && clip.release <= clip.hit && clip.hit < clip.recover && clip.recover <= clip.frames.length, `${sheet.id} beats`);
    }
    assert.ok(sheet.inPlace && !sheet.projectile && typeof sheet.contact === 'boolean');
    assert.ok(credited.has(sheet.source.split(':')[0]), `${sheet.id} credited`);
  }
  for (const credit of manifest.credits) assert.match(credit.attribution, /\S/);
});
