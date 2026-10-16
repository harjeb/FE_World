import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, CLASS_PATHS } from '../data/classes.ts';
import { PROMOTIONS, promotionsFor } from '../data/promotions.ts';
import { createUnit, gainExperience, promote, addWeaponExp, toBattleUnit } from './model.ts';
import { seedRng } from '../engine/rng.ts';
import { effectiveLevel } from '../engine/units.ts';
import { createFieldBattle } from './battles.ts';
import { forecast } from '../engine/combat.ts';
import { gainExp, growthRates } from '../engine/growth.ts';

test('every route and branch is reachable through five adjacent stages, preserving level and stats', () => {
  for (const paths of Object.values(CLASS_PATHS)) for (const path of paths) {
    const u = createUnit('erin', 99, 'test', 0, true, { classId: path[0] });
    const before = structuredClone(u.stats);
    u.exp = 42;
    for (let i = 1; i < path.length; i++) {
      const p = promotionsFor(u.classId).find(p => p.to === path[i])!;
      assert.ok(p, `${path[i - 1]} -> ${path[i]}`);
      assert.equal(CLASSES[p.to].stage, i + 1);
      const oldRates = growthRates(toBattleUnit(u, 'player', u.id, [0, 0]))!;
      promote(u, p);
      const newRates = growthRates(toBattleUnit(u, 'player', u.id, [0, 0]))!;
      assert.equal(newRates.str - oldRates.str, CLASSES[p.to].growth.str - CLASSES[p.from].growth.str);
      assert.equal(u.level, 99);
      assert.equal(u.exp, 42);
      assert.deepEqual(u.stats, before);
    }
    assert.equal(promotionsFor(u.classId).length, 0);
    assert.equal(effectiveLevel(toBattleUnit(u, 'player', u.id, [0, 0])), 99);
  }
  assert.equal(new Set(PROMOTIONS.map(p => `${p.from}:${p.to}`)).size, PROMOTIONS.length);
});

test('progression stops at 99, uses universal caps and weapon training respects class limits', () => {
  const u = createUnit('erin', 98, 'test', 0);
  gainExperience(u, 2000, seedRng('99'));
  assert.equal(u.level, 99);
  assert.equal(u.exp, 0);
  assert.ok(u.stats.hp <= 150);
  assert.ok(u.stats.str <= 99);
  u.classId = 'gladiator';
  u.ranks.sword = 'E';
  assert.equal(addWeaponExp(u, 'sword', 1000), 'D');
  const p = promotionsFor(u.classId)[0];
  promote(u, p);
  assert.equal(addWeaponExp(u, 'sword', 1), 'C');
});

test('the simplest class can grow from level 1 to 99 without any promotion', () => {
  const u = createUnit('erin', 1, 'test', 0, true, { classId: 'gladiator' });
  gainExperience(u, 9800, seedRng('unpromoted-99'));
  assert.equal(u.level, 99);
  assert.equal(u.classId, 'gladiator');
  assert.equal(u.growthLog.length, 98);
  assert.equal(u.exp, 0);
});

test('battle experience crosses level 20 in the initial class and stops only at 99', () => {
  const u = createUnit('erin', 20, 'test', 0, true, { classId: 'gladiator' });
  const state = createFieldBattle([u], { region: 1, cleared: 0, seed: 'level-20' }).state;
  const unit = state.units[0];
  gainExp(state, unit, 100, []);
  assert.equal(unit.level, 21);
  assert.equal(unit.classId, 'gladiator');
  unit.level = 98;
  gainExp(state, unit, 100, []);
  assert.equal(unit.level, 99);
  assert.equal(unit.exp, 0);
  gainExp(state, unit, 100, []);
  assert.equal(unit.level, 99);
  assert.equal(unit.exp, 0);
});

test('dragon weapons use magic and resistance; race effectiveness excludes dragon riders', () => {
  const u = createUnit('erin', 30, 'test', 0, true, { classId: 'dragonkin' });
  const state = createFieldBattle([u], { region: 1, cleared: 0, seed: 'dragon-test' }).state;
  const me = state.units[0], foe = state.units[1];
  foe.classId = 'dragonkin';
  foe.weapons = ['dragonstone'];
  foe.ranks = { dragon: 'E' };
  me.pos = [1, 1]; foe.pos = [2, 1];
  me.stats.mag = 30; me.stats.str = 1;
  foe.stats.res = 2; foe.stats.def = 80;
  const magic = forecast(state, me.id, me.pos, 'dragonstone', foe.id);
  assert.ok(magic.attacker.damage >= 30);
  me.classId = 'swordsman'; me.weapons = ['dragonslayer']; me.ranks.sword = 'D';
  assert.equal(forecast(state, me.id, me.pos, 'dragonslayer', foe.id).attacker.effective, true);
  foe.classId = 'dragon_knight';
  assert.equal(forecast(state, me.id, me.pos, 'dragonslayer', foe.id).attacker.effective, false);
});
