import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CROSS_TIME_ROSTER, createCrossTimeRecruit, crossTimeSlots } from './cross-time.ts';
import { CROSS_TIME_DATA } from './cross-time-data.ts';
import { GAME_ITEMS } from './items.ts';
import { CLASSES } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { toBattleUnit } from './model.ts';
import { reincarnate, reincarnationBase } from './legacy.ts';

const levels = JSON.parse(readFileSync(new URL('../../../design/cross-time/levels.json', import.meta.url), 'utf8'));

test('all 17 runtime identities preserve the approved recruit and enemy tables', () => {
  assert.equal(CROSS_TIME_DATA.length, 17);
  assert.equal(new Set(CROSS_TIME_DATA.map(row => row.id)).size, 17);
  for (const row of CROSS_TIME_DATA) {
    const expected = levels.units.find((unit: { name: string }) => unit.name === row.name);
    for (const key of ['base', 'personalGrowth', 'level20', 'normal48', 'hard52', 'con'] as const) assert.deepEqual(row[key], expected[key]);
    assert.equal(Object.values(row.base).reduce((a, b) => a + b, 0), 70);
    const recruit = createCrossTimeRecruit(row.id, `test-${row.id}`, 1000);
    assert.deepEqual(recruit.stats, row.level20);
    assert.equal(recruit.personalSkill, CROSS_TIME_ROSTER.find(identity => identity.id === row.id)!.personalSkill);
    recruit.level = 99;
    const preview = reincarnationBase(recruit.character, 'commoner', recruit.crossTimeIdentity);
    assert.deepEqual(preview, row.base);
    assert.deepEqual(reincarnate(recruit, {}, 'commoner', 500, 1000).baseStats, preview);
    assert.equal(crossTimeSlots([recruit]), 0);
    for (const id of row.weapons) assert.ok(CLASSES[row.classId].weapons[WEAPONS[id].type]);
    for (const book of row.books) {
      assert.ok(SPELLBOOK_BY_ID.has(book.id));
      assert.ok(book.charges > 0);
    }
  }
  assert.deepEqual(CROSS_TIME_DATA.filter(row => row.boss).map(row => row.id), ['lu-bu']);
});

test('Apollo recruitment is deterministic, ordinary geared, and has no enemy bonuses', () => {
  const unit = createCrossTimeRecruit('apollo', 'recruit-1', 1000, 'fixed');
  assert.deepEqual(unit, createCrossTimeRecruit('apollo', 'recruit-1', 1000, 'fixed'));
  const row = CROSS_TIME_ROSTER.find(row => row.id === 'apollo')!;
  assert.deepEqual(unit.stats, row.level20);
  assert.deepEqual(unit.personalGrowth, row.personalGrowth);
  assert.equal(unit.level, 20);
  assert.equal(unit.con, 8);
  assert.equal(unit.growthType, 'growth');
  assert.ok(unit.age >= 20 && unit.age <= 30);
  assert.equal(unit.personalSkill, 'lightshot');
  assert.equal(toBattleUnit(unit, 'player', unit.id, [0, 0]).skill, 'lightshot');
  assert.equal(unit.crossTimeIdentity, 'apollo');
  assert.equal(unit.classQualifications.length, 0);
  assert.ok(!unit.weapons.includes('silver_bow'));
  assert.equal(crossTimeSlots([unit]), 1);
  assert.equal(crossTimeSlots([{ ...unit, cycle: 1 }]), 0);
  assert.equal(crossTimeSlots([{ ...unit, status: 'dead' }]), 0);
  assert.equal(crossTimeSlots([{ ...unit, status: 'retired' }]), 0);
});

test('shards are bound warehouse key items and invalid recruits fail closed', () => {
  assert.equal(GAME_ITEMS.cross_time_shard.kind, 'key');
  assert.equal(GAME_ITEMS.cross_time_shard.bound, true);
  assert.equal(GAME_ITEMS.cross_time_shard.price, 0);
  assert.throws(() => createCrossTimeRecruit('missing', 'bad', 1000));
});
