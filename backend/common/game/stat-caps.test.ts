import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_CAPS } from '../data/classes.ts';
import { STAT_KEYS, stats } from '../data/types.ts';
import { createUnit, gainExperience, normalizeUnit, useDrug } from './model.ts';
import { createFieldBattle } from './battles.ts';
import { gainExp } from '../engine/growth.ts';
import { seedRng } from '../engine/rng.ts';
import { applyInheritanceFloor, totalStats } from './legacy.ts';
import { createEnemy } from './enemies.ts';

test('battle and permanent growth cross 99 for all eight stats, retain HP150 and stop at level99', () => {
  const unit = createUnit('erin', 97, 'caps', 0, false, { classId: 'commoner', growthType: 'normal' });
  unit.stats = stats(150,99,99,99,99,99,99,99,99);
  unit.hp = 150;
  unit.inheritedGrowth = stats(100,100,100,100,100,100,100,100,100);
  const { state } = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'caps' });
  const battleUnit = state.units[0];
  for (let i = 0; i < 3; i++) gainExp(state, battleUnit, 100, []);
  gainExperience(unit, 300, seedRng('caps'));
  for (const grown of [unit, battleUnit]) {
    assert.equal(grown.level, 99);
    assert.equal(grown.exp, 0);
    assert.equal(grown.stats.hp, 150);
    for (const key of STAT_KEYS.filter(key => key !== 'hp')) assert.equal(grown.stats[key], 101, key);
  }
});

test('drugs cross 99 while per-stat, total-use and HP limits remain', () => {
  const unit = createUnit('erin', 1, 'drugs');
  unit.stats.skl = 99;
  for (let i = 0; i < 5; i++) assert.equal(useDrug(unit, 'secret_book').amount, 2);
  assert.equal(unit.stats.skl, 109);
  assert.throws(() => useDrug(unit, 'secret_book'), /单项/);
  for (const item of ['speedwing', 'goddess_icon', 'dracoshield'] as const) for (let i = 0; i < 5; i++) useDrug(unit, item);
  assert.throws(() => useDrug(unit, 'talisman'), /合计/);
  unit.drugCounts = {};
  unit.stats.hp = unit.hp = 149;
  assert.equal(useDrug(unit, 'energy_drop').amount, 1);
  assert.equal(unit.hp, 150);
  assert.throws(() => useDrug(unit, 'energy_drop'), /属性已达上限/);
});

test('creation keeps non-HP values above99 and caps HP for units and enemies', () => {
  const unit = createUnit('erin', 99, 'creation', 0, true, { classId: 'commoner', base: stats(149,120,120,120,120,120,120,120,120), personalGrowth: stats(200,200,200,200,200,200,200,200,200) });
  assert.equal(unit.stats.hp, 150);
  for (const key of STAT_KEYS.filter(key => key !== 'hp')) assert.ok(unit.stats[key] > 120);
  const enemy = createEnemy('high', { classId: 'fighter', level: 1000, pos: [0,0], aiDifficulty: 'hard' });
  assert.equal(enemy.stats.hp, 150);
  assert.ok(enemy.stats.str > 99);
});

test('old numeric contracts refresh after JSON load without changing earned stats; direct battle contracts use current rules', () => {
  const unit = createUnit('erin', 15, 'legacy');
  unit.stats.str = 123;
  unit.inheritance = { legacyId: 'old', targetLevel: 15, initialTotal: 80, sourceTotal: 1800, clippedTarget: 942,
    caps: stats(150,99,99,99,99,99,99,99,99), weights: { hp: 1 }, cycle: 0 };
  const direct = JSON.parse(JSON.stringify(unit));
  const loaded = JSON.parse(JSON.stringify(unit));
  const before = structuredClone(loaded.stats);
  normalizeUnit(loaded);
  assert.deepEqual(loaded.stats, before);
  assert.equal(loaded.inheritance.clippedTarget, 1800);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.inheritance.caps)), CHARACTER_CAPS);
  for (const recipient of [direct, loaded]) {
    applyInheritanceFloor(recipient);
    assert.equal(totalStats(recipient.stats), 1800);
    assert.equal(recipient.stats.hp, 150);
    assert.ok(recipient.stats.str >= 123);
    assert.deepEqual(recipient.inheritance.caps, CHARACTER_CAPS);
    assert.deepEqual(applyInheritanceFloor(recipient), {});
  }
});
