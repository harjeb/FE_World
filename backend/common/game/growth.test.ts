import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGE_BANDS, GROWTH_BONUS, GROWTH_TYPE_NAMES, RECRUIT_AGE_RANGE, ageBandIndex, ageBandOf, applyGrowthBonus, growthBonus, recruitAgeCandidates, rollGrowthType, rollRecruitAge } from '../data/growth-types.ts';
import { ageAt, createUnit, growthRates, rollProtagonistBase } from './model.ts';
import { stats, STAT_KEYS } from '../data/types.ts';
import { seedRng } from '../engine/rng.ts';

test('age bands are left-closed right-open with gaps outside them', () => {
  assert.equal(ageBandIndex(11), -1);
  assert.equal(ageBandIndex(12), 0);
  assert.equal(ageBandIndex(29), 0);
  assert.equal(ageBandIndex(30), 1);
  assert.equal(ageBandIndex(47), 1);
  assert.equal(ageBandIndex(48), 2);
  assert.equal(ageBandIndex(65), 2);
  assert.equal(ageBandIndex(66), -1);
  assert.equal(ageBandOf(20)?.id, '12-30');
  assert.equal(ageBandOf(70), null);
  assert.equal(AGE_BANDS.length, 3);
});

test('each growth type has the documented all-stat offset per band', () => {
  assert.deepEqual(GROWTH_BONUS.early, [5, 0, -5]);
  assert.deepEqual(GROWTH_BONUS.normal, [0, 0, 0]);
  assert.deepEqual(GROWTH_BONUS.late, [-5, 0, 5]);
  assert.deepEqual(GROWTH_BONUS.growth, [5, 5, 5]);
  assert.equal(growthBonus('early', 20), 5);
  assert.equal(growthBonus('early', 40), 0);
  assert.equal(growthBonus('early', 50), -5);
  assert.equal(growthBonus('late', 20), -5);
  assert.equal(growthBonus('late', 50), 5);
  assert.equal(growthBonus('growth', 50), 5);
  assert.equal(growthBonus('normal', 50), 0);
});

test('成长型 adds five percentage points to every stat at all ages', () => {
  const rates = stats(70, 40, 5, 50, 55, 45, 25, 25);
  for (const age of [0, 11, 12, 29, 30, 47, 48, 65, 66, 70, 100]) {
    assert.equal(growthBonus('growth', age), 5);
    const adjusted = applyGrowthBonus(rates, 'growth', age);
    for (const key of Object.keys(rates) as (keyof typeof rates)[]) {
      assert.equal(adjusted[key], rates[key] + 5);
    }
  }
  for (const age of [0, 11, 66, 70, 100]) {
    for (const type of ['early', 'normal', 'late'] as const) {
      assert.equal(growthBonus(type, age), 0);
    }
  }
});

test('applyGrowthBonus clamps at zero', () => {
  const rates = stats(0, 3, 0, 0, 0, 0, 0, 0);
  const out = applyGrowthBonus(rates, 'late', 20);
  assert.equal(out.str, 0);
});

test('rollGrowthType makes 成长型 a 5% pull and is deterministic', () => {
  assert.equal(rollGrowthType(0), 'growth');
  assert.equal(rollGrowthType(4), 'growth');
  assert.equal(rollGrowthType(5), 'early');
  assert.equal(rollGrowthType(29), 'early');
  assert.equal(rollGrowthType(30), 'normal');
  assert.equal(rollGrowthType(74), 'normal');
  assert.equal(rollGrowthType(75), 'late');
  assert.equal(rollGrowthType(99), 'late');
  // 5% of the 0–99 range is 成长型.
  const growth = Array.from({ length: 100 }, (_, i) => rollGrowthType(i)).filter(t => t === 'growth').length;
  assert.equal(growth, 5);
});

test('createUnit honours a recruitment growth type and age', () => {
  const unit = createUnit('erin', 10, 'u1', 0, false, { growthType: 'growth', age: 20 });
  assert.equal(unit.growthType, 'growth');
  assert.equal(unit.age, 20);
  assert.equal(unit.baseAge, 20);
  const normal = createUnit('erin', 10, 'u2', 0, false, { growthType: 'normal', age: 20 });
  // 成长型 adds +5 to every growth rate in band 12–30.
  assert.equal(growthRates(unit).str, growthRates(normal).str + 5);
  assert.equal(growthRates(unit).hp, growthRates(normal).hp + 5);
});

test('a late bloomer gets stronger growth as they age into the last band', () => {
  const young = createUnit('karl', 10, 'u3', 0, false, { growthType: 'late', age: 20 });
  const old = createUnit('karl', 10, 'u4', 0, false, { growthType: 'late', age: 50 });
  assert.equal(growthRates(old).str, growthRates(young).str + 10);
  assert.equal(GROWTH_TYPE_NAMES.late, '晚成型');
});

test('ageAt advances one year per calendar year and recruitment allows 12 and up', () => {
  const unit = createUnit('erin', 10, 'u5', 100, false, { age: 18 });
  assert.equal(ageAt(unit, 100, 500), 18);
  assert.equal(ageAt(unit, 599, 500), 18);
  assert.equal(ageAt(unit, 600, 500), 19);
  assert.deepEqual(RECRUIT_AGE_RANGE, [12, 45]);
});

test('recruitment prefers an age that crosses a curve transition inside the mainline', () => {
  const candidates = recruitAgeCandidates('early', 8);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(age => age >= 12 && age + 8 >= 30));
  // A normal curve has no transition to manufacture.
  assert.deepEqual(recruitAgeCandidates('normal', 8), []);
  const age = rollRecruitAge('late', 8, 3);
  assert.ok(age >= 12 && age <= 45);
  const fallback = rollRecruitAge('normal', 0, 0);
  assert.equal(fallback, 12);
});

test('natural lifespan follows the species and the protagonist never ages', () => {
  const human = createUnit('erin', 1, 'h', 0, false, { classId: 'gladiator' });
  const beast = createUnit('erin', 1, 'b', 0, false, { classId: 'beast_fighter' });
  const dragon = createUnit('erin', 1, 'd', 0, false, { classId: 'dragonkin' });
  assert.equal(human.species, 'human');
  assert.equal(beast.species, 'beast');
  assert.equal(dragon.species, 'dragon');
  assert.ok(human.lifespanYears >= 80 && human.lifespanYears <= 100);
  assert.ok(beast.lifespanYears >= 45 && beast.lifespanYears <= 65);
  assert.ok(dragon.lifespanYears >= 180 && dragon.lifespanYears <= 320);
  const hero = createUnit('erin', 30, 'hero', 0, false, { age: 20 });
  hero.isProtagonist = true;
  assert.equal(ageAt(hero, 10_000, 500), 20, 'the protagonist does not age with the calendar');
});

test('protagonist base rolls above the class minimum, weighted by personal growth', () => {
  const min = stats(18, 5, 0, 8, 9, 5, 4, 2, 5);
  const growth = stats(60, 40, 40, 45, 45, 40, 30, 30, 20);
  const base = rollProtagonistBase(min, growth, seedRng('hero'));
  for (const key of STAT_KEYS) {
    assert.ok(base[key] >= min[key], `${key} never drops below the class minimum`);
    assert.ok(base[key] <= min[key] + Math.floor(growth[key] / 20 * 1.5), `${key} stays within the max bonus`);
  }
  assert.ok(base.hp > min.hp, 'a high-growth stat always rolls a bonus');
  assert.deepEqual(base, rollProtagonistBase(min, growth, seedRng('hero')), 'the same seed reproduces the roll');
  const zero = rollProtagonistBase(min, stats(0, 0, 0, 0, 0, 0, 0, 0, 0), seedRng('zero'));
  assert.deepEqual(zero, min, 'zero personal growth leaves the class minimum');
});
