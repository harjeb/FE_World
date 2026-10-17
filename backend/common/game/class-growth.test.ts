import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CLASS_IDS, CLASSES, CLASS_PATHS } from '../data/classes.ts';
import { CLASS_GROWTH, SOURCE_GROWTH_BUFFS } from '../data/class-growth.ts';
import { FW_CLASS_REFERENCE } from '../data/class-reference.ts';
import { STAT_KEYS, stats } from '../data/types.ts';
import { growthRates as battleGrowthRates } from '../engine/growth.ts';
import { seedRng } from '../engine/rng.ts';
import { switchClass } from './mastery.ts';
import { createUnit, gainExperience, growthRates, normalizeUnit, toBattleUnit } from './model.ts';

test('every canonical class has a valid profile while source growth remains independently recorded', () => {
  assert.ok(CATALOG_CLASS_IDS.every(id => Object.hasOwn(CLASS_GROWTH, id)));
  for (const id of CATALOG_CLASS_IDS) {
    const values = STAT_KEYS.map(key => CLASSES[id].growth[key]);
    assert.deepEqual(values, CLASS_GROWTH[id].values, id);
    assert.ok(values.every(value => Number.isFinite(value) && value % 5 === 0 && value >= -15 && value <= 30), id);
    if (CLASSES[id].stage === 0) assert.ok(values.every(value => value === 0));
  }
  for (const ref of FW_CLASS_REFERENCE.filter(ref => CATALOG_CLASS_IDS.includes(ref.id))) {
    assert.deepEqual(CLASSES[ref.id].referenceGrowth, ref.growth, ref.id);
    assert.equal(CLASSES[ref.id].referenceGrowth!.length, 9);
  }
});

test('source tuning only buffs named weak classes and leaves every other source value intact', () => {
  assert.ok(FW_CLASS_REFERENCE.some(ref => !SOURCE_GROWTH_BUFFS[ref.id]), 'tuning must remain scoped to named classes');
  for (const ref of FW_CLASS_REFERENCE.filter(ref => CATALOG_CLASS_IDS.includes(ref.id))) {
    const source = [ref.growth[0], ref.growth[1], ref.growth[2], ref.growth[4], ref.growth[3], ref.growth[7], ref.growth[5], ref.growth[6], ref.growth[8]];
    const buffs = SOURCE_GROWTH_BUFFS[ref.id] ?? {};
    for (const [i, key] of STAT_KEYS.entries()) {
      assert.equal(CLASSES[ref.id].growth[key] - source[i], buffs[key] ?? 0, `${ref.id}.${key}`);
      if (buffs[key] !== undefined) assert.ok(buffs[key]! > 0, `${ref.id}.${key} must be a buff`);
    }
  }
  assert.equal(CLASSES.druid.growth.mag, 30, 'a healthy specialist must retain its source peak');
  assert.equal(CLASSES.knight.growth.def, 25);
  assert.equal(CLASSES.dreadnought.growth.def, 30);
  assert.equal(CLASSES.calamity.growth.spd, 25);
});

test('early physical classes gain useful strength without losing their speed or specialist differences', () => {
  for (const id of ['swordsman', 'archer', 'pegasus'] as const) {
    assert.ok(CLASSES[id].growth.str > 0, `${id}: a primary physical role needs strength growth`);
    assert.ok(CLASSES[id].growth.str <= 5, `${id}: keep the initial strength buff conservative`);
    assert.ok(CLASSES[id].growth.str < CLASSES.fighter.growth.str, `${id}: the strength specialist keeps its edge`);
  }
  for (const id of ['hunter', 'ornius_rider', 'rogue', 'armored_ornius'] as const) {
    assert.ok(CLASSES[id].growth.str > 0, `${id}: early physical training should contribute strength`);
  }
  assert.ok(CLASSES.swordsman.growth.spd > CLASSES.fighter.growth.spd);
  assert.ok(CLASSES.swordsman.growth.skl > CLASSES.fighter.growth.skl);
  const unit = createUnit('erin', 1, 'early-strength', 0, true, { classId: 'swordsman', growthType: 'normal' });
  assert.equal(growthRates(unit).str, 45, '40 personal growth plus 5 class growth gives 45 effective strength growth');
  assert.deepEqual(battleGrowthRates(toBattleUnit(unit, 'player', unit.id, [0, 0])), growthRates(unit));
});

test('targeted buffs improve weak roles without replacing their original specialties and costs', () => {
  assert.ok(CLASSES.cataphract.growth.def > CLASSES.paladin.growth.def);
  assert.ok(CLASSES.cataphract.growth.spd < CLASSES.paladin.growth.spd);
  assert.ok(CLASSES.cataphract.move < CLASSES.paladin.move);
  assert.ok(CLASSES.great_knight.growth.def > CLASSES.cataphract.growth.def);
  assert.ok(CLASSES.great_knight.growth.res < 0);
  assert.ok(CLASSES.battlemaster.growth.skl >= 5, 'a strong attacker should not also lose growth in hit-related skill');
  assert.ok(CLASSES.battlemaster.growth.str > CLASSES.swordmaster.growth.str);
  assert.ok(CLASSES.battlemaster.growth.spd < CLASSES.swordmaster.growth.spd);
  assert.ok(CLASSES.pegasus.growth.str > 0 && CLASSES.pegasus.growth.spd >= 10);
});

test('slow armor and fragile casters receive specialist peaks rather than clipped benefits', () => {
  assert.ok(CLASSES.knight.growth.def > CLASSES.cavalier.growth.def);
  assert.ok(CLASSES.knight.growth.spd < CLASSES.cavalier.growth.spd);
  assert.ok(CLASSES.fortress.growth.def > CLASSES.great_knight.growth.def);
  assert.ok(CLASSES.fortress.move < CLASSES.great_knight.move);
  assert.ok(CLASSES.fortress.growth.def >= 25);
  assert.ok(CLASSES.battlemaster.growth.str >= 20);
  assert.ok(CLASSES.battlemaster.growth.str > CLASSES.swordmaster.growth.str);
  assert.ok(CLASSES.battlemaster.growth.spd < CLASSES.swordmaster.growth.spd);
  assert.ok(CLASSES.wiseman.growth.mag >= 25);
  assert.ok(CLASSES.wiseman.growth.res > CLASSES.druid.growth.res);
  assert.ok(CLASSES.wiseman.growth.skl < CLASSES.druid.growth.skl);
  assert.ok(CLASSES.wiseman.growth.def < 0);
});

test('every suggested promotion has a growth advantage in at least one usable stat', () => {
  for (const paths of Object.values(CLASS_PATHS)) for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const from = CLASSES[path[i - 1]], to = CLASSES[path[i]];
      const usable = STAT_KEYS.filter(key => key !== 'mag' || 'tome' in to.weapons || 'staff' in to.weapons || 'dragon' in to.weapons);
      assert.ok(usable.some(key => to.growth[key] > from.growth[key]), `${path[i - 1]} -> ${path[i]}`);
    }
  }
  assert.ok(CLASSES.dragon_commander.growth.str > CLASSES.dragon_knight.growth.str);
  assert.ok(CLASSES.dragon_commander.growth.def > CLASSES.dragon_knight.growth.def);
});

test('switching and normalizing keep earned stats; battle and training use only the current profile', () => {
  const unit = createUnit('erin', 20, 'growth-switch', 0, true, { classId: 'knight', growthType: 'normal' });
  unit.inheritedGrowth = stats(65,40,40,45,45,35,30,30);
  unit.growthAllocation = { str: 5 };
  const before = structuredClone(unit.stats);
  for (const id of ['fortress', 'wiseman', 'gladiator', 'dragon_commander'] as const) {
    switchClass(unit, id);
    normalizeUnit(unit);
    assert.deepEqual(unit.stats, before);
    const rates = growthRates(unit);
    assert.equal(rates.str, 45 + CLASSES[id].growth.str);
    assert.equal(rates.def, 30 + CLASSES[id].growth.def);
    assert.deepEqual(battleGrowthRates(toBattleUnit(unit, 'player', unit.id, [0, 0])), rates);
  }
  gainExperience(unit, 100, seedRng('growth-switch'));
  assert.equal(unit.level, 21);
  assert.equal(unit.growthLog.length, 1);
  assert.ok(STAT_KEYS.every(key => unit.stats[key] >= before[key] && unit.stats[key] <= CLASSES[unit.classId].caps[key]));
});
