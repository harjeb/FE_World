import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARACTER_IDS, CHARACTERS, LEGACY_FIXED_GROWTH, PROTAGONIST_TENDENCIES } from '../data/characters.ts';
import { CLASSES } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import { createUnit, growthRates, normalizeUnit } from './model.ts';

test('all twelve fixed companions have 250–270 personal growth and keep their specialties', () => {
  assert.equal(CHARACTER_IDS.length, 12);
  for (const id of CHARACTER_IDS) {
    const growth = CHARACTERS[id].growth;
    const total = STAT_KEYS.reduce((sum, key) => sum + growth[key], 0);
    assert.ok(total >= 250 && total <= 270, `${id}: ${total}`);
    assert.ok(STAT_KEYS.every(key => growth[key] >= 0 && growth[key] % 5 === 0), id);
    assert.deepEqual(createUnit(id, 1, `u_${id}`, 0).personalGrowth, growth);
  }
  assert.equal(CHARACTERS.sera.growth.mag, 50);
  assert.ok(CHARACTERS.sera.growth.mag > CHARACTERS.sera.growth.str);
  assert.ok(CHARACTERS.lina.growth.spd > CHARACTERS.lina.growth.def);
  assert.ok(CHARACTERS.gustav.growth.def > CHARACTERS.gustav.growth.spd);
});

test('loading fixed legacy templates changes future growth once and preserves the rest of the unit', () => {
  for (const id of CHARACTER_IDS) {
    const unit = normalizeUnit(createUnit(id, 41, `u_${id}`, 500));
    unit.personalGrowth = { ...LEGACY_FIXED_GROWTH[id] };
    unit.growthAllocation = { str: 10 };
    unit.growthLog = [{ level: 41, gains: { hp: 1, mag: 1 } }];
    const expected = structuredClone(unit);
    expected.personalGrowth = { ...CHARACTERS[id].growth };
    normalizeUnit(unit);
    assert.deepEqual(unit, expected, id);
    assert.deepEqual(normalizeUnit(unit), expected, `${id}: idempotent`);
  }
});

test('random portraits, protagonist, cross-time identities and custom growth are preserved', () => {
  const random = createUnit('sera', 20, 'u_random_1_example', 0, false, { personalGrowth: LEGACY_FIXED_GROWTH.sera });
  const hero = createUnit('erin', 1, 'u_erin', 0, false, { personalGrowth: LEGACY_FIXED_GROWTH.erin });
  hero.isProtagonist = true;
  const crossTime = createUnit('sera', 20, 'u_sera', 0, false, { personalGrowth: LEGACY_FIXED_GROWTH.sera });
  crossTime.crossTimeIdentity = 'cross-time-test';
  const custom = createUnit('sera', 1, 'u_sera', 0, false, { personalGrowth: { ...LEGACY_FIXED_GROWTH.sera, mag: 45 } });
  const protagonist = createUnit('erin', 1, 'u_protagonist', 0, false, { personalGrowth: PROTAGONIST_TENDENCIES.magic.growth });
  protagonist.isProtagonist = true;
  for (const unit of [random, hero, crossTime, custom, protagonist]) {
    const growth = { ...unit.personalGrowth! };
    normalizeUnit(unit);
    assert.deepEqual(unit.personalGrowth, growth, unit.id);
  }
});

test('Sera uses the new personal magic growth plus current class and age, without stacking twice', () => {
  const unit = createUnit('sera', 41, 'u_sera', 0, false);
  unit.personalGrowth = { ...LEGACY_FIXED_GROWTH.sera };
  normalizeUnit(unit);
  assert.equal(growthRates(unit).mag, 50 + CLASSES[unit.classId].growth.mag);
  unit.age = 52;
  assert.equal(growthRates(unit).mag, 55 + CLASSES[unit.classId].growth.mag);
});

test('missing personal growth uses the new template while inherited growth and allocation stay intact', () => {
  const unit = createUnit('sera', 41, 'u_sera', 0);
  delete unit.personalGrowth;
  normalizeUnit(unit);
  assert.deepEqual(unit.personalGrowth, CHARACTERS.sera.growth);
  unit.personalGrowth = { ...LEGACY_FIXED_GROWTH.sera };
  unit.inheritedGrowth = { ...LEGACY_FIXED_GROWTH.mira };
  unit.growthAllocation = { mag: 10 };
  const before = growthRates(unit);
  normalizeUnit(unit);
  assert.deepEqual(unit.personalGrowth, CHARACTERS.sera.growth);
  assert.deepEqual(unit.inheritedGrowth, LEGACY_FIXED_GROWTH.mira);
  assert.deepEqual(unit.growthAllocation, { mag: 10 });
  assert.deepEqual(growthRates(unit), before);
});
