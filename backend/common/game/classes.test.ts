import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, CLASS_PATHS } from '../data/classes.ts';
import { PROMOTIONS, promotionsFor } from '../data/promotions.ts';
import { createUnit, gainExperience, promote, addWeaponExp, RANK_EXP, toBattleUnit } from './model.ts';
import { seedRng } from '../engine/rng.ts';
import { effectiveLevel } from '../engine/units.ts';
import { createFieldBattle } from './battles.ts';
import { forecast } from '../engine/combat.ts';
import { gainExp, growthRates } from '../engine/growth.ts';

test('suggested paths can branch or stop before divine tier, preserving level and stats', () => {
  for (const paths of Object.values(CLASS_PATHS)) for (const path of paths) {
    const u = createUnit('erin', 99, 'test', 0, true, { classId: path[0] });
    const before = structuredClone(u.stats);
    u.exp = 42;
    for (let i = 1; i < path.length; i++) {
      const p = promotionsFor(u.classId).find(p => p.to === path[i])!;
      assert.ok(p, `${path[i - 1]} -> ${path[i]}`);
      assert.ok(CLASSES[p.to].stage > CLASSES[p.from].stage);
      const oldRates = growthRates(toBattleUnit(u, 'player', u.id, [0, 0]))!;
      u.ranks = { sword: 'S', axe: 'S', lance: 'S', bow: 'S', fist: 'S', tome: 'S', staff: 'S', beast: 'S', dragon: 'S' };
      promote(u, p);
      const newRates = growthRates(toBattleUnit(u, 'player', u.id, [0, 0]))!;
      assert.equal(newRates.str - oldRates.str, CLASSES[p.to].growth.str - CLASSES[p.from].growth.str);
      assert.equal(u.level, 99);
      assert.equal(u.exp, 42);
      assert.deepEqual(u.stats, before);
    }
    assert.equal(effectiveLevel(toBattleUnit(u, 'player', u.id, [0, 0])), 99);
  }
  assert.equal(new Set(PROMOTIONS.map(p => `${p.from}:${p.to}`)).size, PROMOTIONS.length);
});

test('progression stops at 99, uses universal caps and weapon ranks belong to the character', () => {
  const u = createUnit('erin', 98, 'test', 0);
  u.stats.str = 120;
  gainExperience(u, 2000, seedRng('99'));
  assert.equal(u.level, 99);
  assert.equal(u.exp, 0);
  assert.ok(u.stats.hp <= 150);
  assert.ok(u.stats.str >= 120);
  u.classId = 'gladiator';
  u.ranks.sword = 'E';
  assert.equal(addWeaponExp(u, 'sword', RANK_EXP.S), 'S');
  const p = promotionsFor(u.classId)[0];
  promote(u, p);
  assert.equal(addWeaponExp(u, 'sword', 1), null);
  assert.equal(u.ranks.sword, 'S');
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

test('every class carries a level-1 base and con derived from its route', () => {
  for (const [id, cls] of Object.entries(CLASSES)) {
    assert.ok(cls.base && cls.con > 0, `${id} has a base and con`);
    for (const value of Object.values(cls.base)) assert.ok(Number.isInteger(value) && value >= 0, `${id} base is a non-negative integer`);
  }
  // 同路线、成长更高的职业基础值不低于成长更低的：剑客的技成长高于平民。
  assert.ok(CLASSES.swordsman.base.skl > CLASSES.commoner.base.skl);
  assert.ok(CLASSES.knight.base.def > CLASSES.swordsman.base.def, '重甲路线基础防御更高');
});

test('a unit created in a promoted class scales from that class base, not the character base', () => {
  const lv1 = createUnit('erin', 1, 'y', 0, true, { classId: 'swordmaster' });
  const lv20 = createUnit('erin', 20, 'x', 0, true, { classId: 'swordmaster' });
  assert.equal(lv1.con, CLASSES.swordmaster.con, '体格取职业');
  for (const key of Object.keys(lv1.stats) as (keyof typeof lv1.stats)[]) {
    assert.equal(lv1.stats[key], CLASSES.swordmaster.base[key], `${key} 1 级等于上级职业基础值`);
    assert.ok(lv20.stats[key] >= lv1.stats[key], `${key} 等级越高不低于 1 级`);
  }
});
