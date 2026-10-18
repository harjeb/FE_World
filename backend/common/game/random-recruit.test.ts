import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_GROWTH } from '../data/class-growth.ts';
import { CLASSES, initialClass } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import { seedRng } from '../engine/rng.ts';
import { RECRUIT_GROWTH_CAP, RECRUIT_UNLOCK_DAY, generateRecruit, recruitClass, recruitLevel, regionRoutes, rollPersonalGrowth } from './random-recruit.ts';

test('recruit generation is deterministic per seed', () => {
  assert.deepEqual(generateRecruit('abc'), generateRecruit('abc'));
  assert.notDeepEqual(generateRecruit('abc'), generateRecruit('abd'));
});

test('every rolled growth stays a whole number inside [0, cap]', () => {
  for (let i = 0; i < 500; i++) {
    const r = generateRecruit(`seed-${i}`);
    for (const key of STAT_KEYS) {
      const value = r.growth[key];
      assert.ok(Number.isInteger(value) && value >= 0 && value <= RECRUIT_GROWTH_CAP, `${key}=${value}`);
      assert.equal(value % 5, 0, `${key}=${value} must be a multiple of 5`);
    }
    assert.equal(r.role, CLASS_GROWTH[r.classId].role);
  }
});

test('the class role decides the baseline, so physical classes never roll pure-mage growth', () => {
  // 勇士类（striker）的力量期望必须明显高于魔力，反过来 arcanist 相反。
  const avg = (role: Parameters<typeof rollPersonalGrowth>[0], key: (typeof STAT_KEYS)[number]) => {
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += rollPersonalGrowth(role, seedRng(`r-${role}-${i}`)).growth[key];
    return sum / 400;
  };
  assert.ok(avg('striker', 'str') > avg('striker', 'mag') + 15);
  assert.ok(avg('arcanist', 'mag') > avg('arcanist', 'str') + 15);
  assert.ok(avg('guardian', 'def') > avg('guardian', 'spd') + 10);
});

test('rare specializations can lift an off-role stat into the top band', () => {
  // 重甲法师：guardian 的魔力本职是弱项，特化后能摸到 45+。四千里必须出现若干次。
  let armoredMages = 0;
  let doubleSpec = 0;
  for (let i = 0; i < 4000; i++) {
    const r = generateRecruit(`spec-${i}`);
    if (r.specialization === 'double') doubleSpec++;
    if (r.role === 'guardian' && r.growth.mag >= 45) armoredMages++;
  }
  assert.ok(armoredMages > 0, 'expected at least one 重甲法师-style guardian');
  assert.ok(doubleSpec > 0, 'expected rare double specializations');
});

test('race weights keep humans dominant while beast and dragon still appear', () => {
  const count = { human: 0, beast: 0, dragon: 0 };
  const n = 5000;
  for (let i = 0; i < n; i++) count[generateRecruit(`race-${i}`).species]++;
  assert.ok(count.human / n > 0.78 && count.human / n < 0.92, JSON.stringify(count));
  assert.ok(count.beast > 0 && count.dragon > 0, JSON.stringify(count));
});

test('a region only recruits the routes it allows', () => {
  for (let regionId = 1; regionId <= 12; regionId++) {
    const allowed = regionRoutes(regionId);
    // 初级职业是共享的（gladiator 同属剑／斧／格斗），所以只能比对"允许路线的初级职业"。
    const initials = allowed.map(r => initialClass(r));
    for (let i = 0; i < 300; i++) {
      const r = generateRecruit(`region-${regionId}-${i}`, allowed);
      assert.ok(initials.includes(r.classId), `region ${regionId} gave ${r.classId}`);
    }
  }
});

test('beast and dragon only show up in their home regions, and do show up there', () => {
  const speciesIn = (regionId: number) => {
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) seen.add(generateRecruit(`home-${regionId}-${i}`, regionRoutes(regionId)).species);
    return seen;
  };
  assert.ok(speciesIn(7).has('beast'), 'the beast ridge (region 7) should produce beast recruits');
  assert.ok(speciesIn(10).has('dragon'), 'the dragon vale (region 10) should produce dragon recruits');
  assert.ok(!speciesIn(1).has('beast') && !speciesIn(1).has('dragon'), 'region 1 should stay human-only');
});

test('recruit level ramps to 30 by the end of year two and then holds', () => {
  assert.equal(recruitLevel(0), 1);
  assert.equal(recruitLevel(500), 15);
  assert.equal(recruitLevel(999), 30);
  assert.equal(recruitLevel(1000), 30);
  assert.equal(recruitLevel(5000), 30);
  assert.equal(RECRUIT_UNLOCK_DAY, 500);
});

test('recruit class follows level, allowing promoted classes', () => {
  // 剑术第一条链：gladiator → swordsman → shido → swordmaster → blade
  assert.equal(recruitClass('sword', 1), 'gladiator');
  assert.equal(recruitClass('sword', 9), 'gladiator');
  assert.equal(recruitClass('sword', 10), 'swordsman');
  assert.equal(recruitClass('sword', 20), 'shido');
  assert.equal(recruitClass('sword', 30), 'swordmaster');
  assert.equal(recruitClass('sword', 99), 'blade');
  // 短链封顶到末阶，不越界。
  assert.equal(recruitClass('axe', 99), 'everlord');
  assert.ok(CLASSES[recruitClass('sword', 30)].tier === 'promoted');
});
