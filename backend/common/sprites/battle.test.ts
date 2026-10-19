import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG_CLASS_IDS, CLASSES } from '../data/classes.ts';
import { WEAPON_TYPE_NAMES } from '../data/types.ts';
import type { WeaponType } from '../data/types.ts';
import { BATTLE_SIZE, CLASS_LOOKS, drawBattleSprite } from './battle.ts';
import type { ClassLook } from './battle.ts';
import { CHARACTER_COLORS } from './character-colors.ts';

const looks = Object.entries(CLASS_LOOKS) as [keyof typeof CLASS_LOOKS, ClassLook][];

test('every live class has its own battle sprite and nothing else does', () => {
  for (const [id] of looks) assert.ok(CATALOG_CLASS_IDS.includes(id), `${id} is not a live class`);
  for (const id of CATALOG_CLASS_IDS) assert.ok(CLASS_LOOKS[id], `${CLASSES[id].name} (${id}) has no battle sprite`);
});

test('every look renders with every weapon, keeps its hand on the canvas and differs from the others', () => {
  const seen = new Map<string, string>();
  for (const [id, look] of looks) {
    assert.ok(look.hand.every(v => v >= 0 && v < BATTLE_SIZE), `${id} hand`);
    for (const weapon of [null, ...Object.keys(WEAPON_TYPE_NAMES)] as (WeaponType | null)[]) {
      for (const side of ['player', 'enemy'] as const) {
        const px = drawBattleSprite(id, { side }, weapon);
        assert.ok(px && px.length === BATTLE_SIZE * BATTLE_SIZE * 4, `${id} ${weapon} ${side}`);
      }
    }
    const bare = Buffer.from(drawBattleSprite(id, { side: 'player' }, null)!).toString('base64');
    assert.ok(!seen.has(bare), `${CLASSES[id].name} looks the same as ${seen.get(bare)}`);
    seen.set(bare, CLASSES[id].name);
  }
});

test('named character colours match the portrait source', () => {
  const art = readFileSync(new URL('../../../design/pixel-art/gen_art.py', import.meta.url), 'utf8');
  for (const [key, colors] of Object.entries(CHARACTER_COLORS)) {
    const at = art.indexOf(`key='${key}'`);
    assert.ok(at >= 0, key);
    const entry = art.slice(at, art.indexOf('dict(', at + 1) > 0 ? art.indexOf('dict(', at + 1) : undefined);
    assert.ok(entry.includes(`skin=('${colors.skin[0]}', '${colors.skin[1]}')`), `${key} skin`);
    assert.ok(entry.includes(`'${colors.hair[0]}'`) && entry.includes(`'${colors.hair[1]}'`), `${key} hair`);
  }
});

test('allies and enemies of every class are told apart by their faction colours', () => {
  for (const [id] of looks) {
    const ally = drawBattleSprite(id, { side: 'player' }, null)!, enemy = drawBattleSprite(id, { side: 'enemy' }, null)!;
    let differ = 0;
    for (let i = 0; i < ally.length; i += 4) if (ally[i] !== enemy[i] || ally[i + 1] !== enemy[i + 1] || ally[i + 2] !== enemy[i + 2]) differ++;
    assert.ok(differ >= 16, `${CLASSES[id].name}: only ${differ} pixels change with the side`);
  }
});
