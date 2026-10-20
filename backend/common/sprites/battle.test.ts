import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG_CLASS_IDS, CLASSES } from '../data/classes.ts';
import { WEAPON_TYPE_NAMES } from '../data/types.ts';
import type { WeaponType } from '../data/types.ts';
import { createHash } from 'node:crypto';
import { poseLayers } from './poses.ts';
import type { BattlePose } from './battle.ts';
import { BATTLE_SIZE, BASE_COLORS, FACTION_COLORS, PARTS, WEAPON_COLORS, WEAPON_LAYERS, CLASS_LOOKS, drawBattleSprite } from './battle.ts';
import type { ClassLook } from './battle.ts';
import { CHARACTER_COLORS } from './character-colors.ts';

const poses: BattlePose[] = ['idle', 'windup', 'strike', 'recover', 'hurt', 'dodge'];
const weapons = [null, ...Object.keys(WEAPON_TYPE_NAMES)] as (WeaponType | null)[];

test('default idle pixels match the 77-class, two-faction, active-weapon artwork', () => {
  const hash = createHash('sha256');
  for (const [id] of looks) for (const side of ['player', 'enemy'] as const) for (const weapon of weapons) {
    const legacy = drawBattleSprite(id, { side }, weapon)!;
    assert.deepEqual(legacy, drawBattleSprite(id, { side }, weapon, 'idle', 0));
    hash.update(legacy);
  }
  assert.equal(hash.digest('hex'), 'f1599e9dc8d238aad101339af46b1a28e0789f4df022259740cc80cfd873cadb');
});

const filled = (px: Uint8ClampedArray) => px.filter((_, i) => i % 4 === 3 && px[i] !== 0).length;

test('all classes animate deterministically with every weapon and bare hands without losing their body', () => {
  assert.equal(looks.length, 77);
  for (const [id] of looks) for (const weapon of weapons) {
    const idle = drawBattleSprite(id, { side: 'player' }, weapon)!;
    const count = filled(idle);
    const frames = new Set<string>();
    for (const pose of poses) {
      const frame = pose === 'idle' ? 1 : 0;
      const px = drawBattleSprite(id, { side: 'player' }, weapon, pose, frame)!;
      const label = `${id}/${weapon}/${pose}`;
      assert.equal(px.length, 48 * 48 * 4, label);
      assert.deepEqual(px, drawBattleSprite(id, { side: 'player' }, weapon, pose, frame), label);
      assert.notDeepEqual(px, idle, label);
      assert.ok(filled(px) > count * 0.75 && filled(px) < count * 1.25, label);
      frames.add(Buffer.from(px).toString('base64'));
    }
    assert.equal(frames.size, poses.length, `${id}/${weapon}: distinct phases`);
  }
});

test('idle cycles in two frames and all actions keep the bottom four rows grounded', () => {
  for (const [id] of looks) {
    const idle = drawBattleSprite(id, { side: 'player' }, null)!;
    assert.deepEqual(idle, drawBattleSprite(id, { side: 'player' }, null, 'idle', 2));
    assert.deepEqual(drawBattleSprite(id, { side: 'player' }, null, 'idle', 1), drawBattleSprite(id, { side: 'player' }, null, 'idle', 3));
    for (const pose of poses) {
      const px = drawBattleSprite(id, { side: 'player' }, null, pose, 1)!;
      assert.deepEqual(px.slice(44 * 48 * 4), idle.slice(44 * 48 * 4), `${id}/${pose}: moved feet`);
    }
  }
});

test('articulation keeps complete weapons inside the canvas and fixed mount layers unchanged', () => {
  for (const [id, look] of looks) for (const weapon of weapons) for (const pose of poses) {
    const result = poseLayers(look, PARTS, weapon ? WEAPON_LAYERS[weapon] : undefined, weapon, pose, 1);
    for (let i = 0; i < look.layers.length; i++) if (look.layers[i].fixed) assert.equal(result.layers[i], look.layers[i]);
    if (!result.weapon) continue;
    const held = result.weapon;
    held.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '.') assert.ok(held.x + x >= 1 && held.x + x <= 46 && held.y + y >= 1 && held.y + y <= 46, `${id}/${weapon}/${pose}: clipped weapon`);
    }));
    // A weapon must still touch the articulated character (including custom arms).
    const body = new Set<string>();
    for (const layer of result.layers) {
      const rows = typeof layer.part === 'string' ? PARTS[layer.part as keyof typeof PARTS] : layer.part;
      rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '.') body.add(`${layer.x + (layer.flip ? row.length - 1 - x : x)},${layer.y + y}`);
      }));
    }
    let touches = false;
    held.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = held.x + x + dx, yy = held.y + y + dy;
        if (body.has(`${xx},${yy}`)) touches = true;
      }
    }));
    assert.ok(touches, `${id}/${weapon}/${pose}: disconnected weapon`);
  }
});

test('every pose preserves faction and character palette without interpolated colours', () => {
  const skin: [string, string] = ['#12AB34', '#237845'], hair: [string, string] = ['#BC23DE', '#672389'];
  for (const [id, look] of looks) for (const pose of poses) {
    const outputs = [];
    for (const side of ['player', 'enemy'] as const) {
      const px = drawBattleSprite(id, { side, skin, hair }, look.signature ?? null, pose, 1)!;
      const allowed = new Set(Object.values({ ...BASE_COLORS, g: '#7CC6DA', v: '#C8584E', V: '#8E3A34', ...FACTION_COLORS[side], ...look.palette, s: skin[0], S: skin[1], h: hair[0], H: hair[1] }).map(hex => hex.toLowerCase()));
      allowed.add('#2b2421'); // The outline is independent of class eye/ink colours.
      for (let i = 0; i < px.length; i += 4) if (px[i + 3]) {
        assert.equal(px[i + 3], 255);
        const hex = '#' + [...px.slice(i, i + 3)].map(v => v.toString(16).padStart(2, '0')).join('');
        assert.ok(allowed.has(hex), `${id}/${pose}: ${hex}`);
      }
      outputs.push(px);
    }
    assert.notDeepEqual(outputs[0], outputs[1], `${id}/${pose}: faction lost`);
  }
});

const looks = Object.entries(CLASS_LOOKS) as [keyof typeof CLASS_LOOKS, ClassLook][];

test('every live class has its own battle sprite and nothing else does', () => {
  for (const [id] of looks) assert.ok(CATALOG_CLASS_IDS.includes(id), `${id} is not a live class`);
  for (const id of CATALOG_CLASS_IDS) assert.ok(CLASS_LOOKS[id], `${CLASSES[id].name} (${id}) has no battle sprite`);
});

// The renderer skips letters without a colour, so a typo would silently erase pixels.
test('every letter in every look and weapon has a colour', () => {
  const shared = { ...BASE_COLORS, ...WEAPON_COLORS, ...FACTION_COLORS.player };
  for (const [id, look] of looks) {
    const palette = { ...shared, ...look.palette };
    for (const layer of look.layers) for (const row of typeof layer.part === 'string' ? PARTS[layer.part] : layer.part)
      for (const char of row) assert.ok(char === '.' || palette[char], `${CLASSES[id].name} (${id}) uses '${char}' without a colour`);
  }
  for (const [type, weapon] of Object.entries(WEAPON_LAYERS)) for (const row of weapon.rows)
    for (const char of row) assert.ok(char === '.' || shared[char], `${type} weapon uses '${char}' without a colour`);
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
