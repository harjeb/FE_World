import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnit, effectiveCaps, growthRates, levelUp } from './model.ts';
import {
  applyInheritanceFloor, canClaim, canReincarnate, claimLegacy, createLegacy, distributeBackfill,
  eligibleForLegacy, numericFloor, previewInheritance, reincarnate, sourceGrowthVector, totalStats,
} from './legacy.ts';
import type { LegacyRecord } from './legacy.ts';
import { stats, STAT_KEYS } from '../data/types.ts';
import { seedRng } from '../engine/rng.ts';

function legacyFor(unit: ReturnType<typeof createUnit>, overrides: Partial<LegacyRecord> = {}): LegacyRecord {
  return { ...createLegacy(unit, 'death', 'legacy-1', 'p1'), ...overrides };
}

test('numeric floors match the documented 80/200/15 example', () => {
  assert.equal(numericFloor(1, 80, 200, 15), 80);
  assert.equal(numericFloor(5, 80, 200, 15), 115);
  assert.equal(numericFloor(10, 80, 200, 15), 158);
  assert.equal(numericFloor(14, 80, 200, 15), 192);
  assert.equal(numericFloor(15, 80, 200, 15), 200);
  assert.equal(numericFloor(15, 80, 180, 15), 180);
  assert.equal(numericFloor(5, 80, 180, 15), 109);
  // Ld = 1 jumps straight to the target.
  assert.equal(numericFloor(1, 80, 200, 1), 200);
});

test('backfill spends every point, honours weights and never exceeds caps', () => {
  const weights = { hp: 2, str: 1 };
  const caps = stats(10, 3, 99, 99, 99, 99, 99, 99);
  const base = stats(0, 0, 0, 0, 0, 0, 0, 0);
  const gains = distributeBackfill(10, weights, base, caps);
  assert.equal(Object.values(gains).reduce((a, b) => a + (b ?? 0), 0), 10);
  // Weighted 2:1, so hp takes about two thirds and str caps at 3.
  assert.equal(gains.hp, 7);
  assert.equal(gains.str, 3);
  const gains2 = distributeBackfill(5, { str: 1 }, base, caps);
  assert.equal(gains2.str, 3);
  assert.equal(Object.values(gains2).reduce((a, b) => a + (b ?? 0), 0), 3);
});

test('a claimed growth legacy replaces the personal vector and locks the lineage', () => {
  const source = createUnit('erin', 20, 'src', 0, false, { growthType: 'growth', age: 20 });
  const recipient = createUnit('owen', 1, 'dst', 0, false, { growthType: 'normal', age: 18 });
  const legacy = legacyFor(source);
  const before = growthRates(recipient).str;
  claimLegacy(legacy, recipient, 'growth');
  assert.equal(recipient.lineageDepth, 1);
  assert.equal(recipient.receivedLegacyId, legacy.id);
  assert.equal(legacy.state, 'claimed');
  assert.equal(legacy.mode, 'growth');
  // 成长遗产替换个人基础向量（绝对向量），不含职业成长。
  assert.deepEqual(recipient.inheritedGrowth, legacy.sourceGrowth);
  assert.notEqual(growthRates(recipient).str, before);
  assert.equal(canClaim(legacy, recipient), '这份遗产已经被兑现');
});

test('reincarnation keeps the inherited growth and only adds the 30-point allocation', () => {
  const source = createUnit('erin', 20, 'src2', 0, false, { growthType: 'growth', age: 20 });
  const recipient = createUnit('owen', 1, 'dst2', 0, false, { classId: 'gladiator', age: 18 });
  claimLegacy(legacyFor(source), recipient, 'growth');
  const inherited = { ...recipient.inheritedGrowth };
  recipient.level = 99;
  reincarnate(recipient, { str: 10 }, 'gladiator', 120, 0);
  assert.deepEqual(recipient.inheritedGrowth, inherited, '轮回保留继承后的个人基础成长');
  assert.deepEqual(recipient.growthAllocation, { str: 10 });
});

test('a numeric legacy tops the recipient up to the per-level floor', () => {
  const source = createUnit('erin', 15, 'src', 0, true);
  source.stats = stats(90, 30, 5, 30, 30, 20, 20, 10); // total 235
  const recipient = createUnit('owen', 1, 'dst', 0, true);
  const legacy = legacyFor(source);
  const preview = previewInheritance(legacy, recipient);
  assert.equal(preview.sourceTotal, totalStats(source.stats));
  assert.equal(preview.clippedTarget, Math.min(preview.sourceTotal, totalStats(effectiveCaps(recipient))));
  claimLegacy(legacy, recipient, 'numeric', { hp: 1, str: 1, spd: 1 });
  // At level 1 there is no bonus; raising the level tops the total up to F(level).
  recipient.level = 8;
  const gained = applyInheritanceFloor(recipient);
  const floor = numericFloor(8, preview.initialTotal, preview.clippedTarget, preview.sourceLevel);
  assert.equal(totalStats(recipient.stats), Math.max(totalStats(recipient.stats), floor));
  assert.ok(totalStats(recipient.stats) >= floor);
  assert.ok(Object.values(gained).some(v => v > 0));
  // Idempotent: a second call adds nothing.
  assert.deepEqual(applyInheritanceFloor(recipient), {});
});

test('capacity clipping keeps the target at the sum of the recipient caps', () => {
  const source = createUnit('erin', 20, 'src', 0, true);
  const recipient = createUnit('owen', 1, 'dst', 0, true);
  const legacy = legacyFor(source);
  // A source whose permanent total exceeds the recipient's capacity (e.g. a future higher-cap race).
  for (const key of STAT_KEYS) legacy.sourceStats[key] = 999;
  const preview = previewInheritance(legacy, recipient);
  assert.equal(preview.capacity, totalStats(effectiveCaps(recipient)));
  assert.equal(preview.clippedTarget, preview.capacity);
  assert.ok(preview.lost > 0);
});

test('only eligible sources produce legacies and B cannot transmit', () => {
  const low = createUnit('erin', 14, 'low', 0, true);
  assert.equal(eligibleForLegacy(low), false);
  const ready = createUnit('erin', 15, 'ready', 0, true);
  assert.equal(eligibleForLegacy(ready), true);
  const protagonist = createUnit('erin', 15, 'hero', 0, true, {});
  protagonist.isProtagonist = true;
  assert.equal(eligibleForLegacy(protagonist), false);
  const inherited = createUnit('erin', 15, 'b', 0, true);
  inherited.lineageDepth = 1;
  assert.equal(eligibleForLegacy(inherited), false);
});

test('reincarnation resets growth, skills, qualifications and age, once only', () => {
  const unit = createUnit('erin', 99, 'r1', 0, false, { classId: 'sword_hero', age: 40 });
  unit.classQualifications = ['sword_hero', 'swordmaster'];
  unit.learningProgress = { sword_hero: ['node-a'] };
  unit.weapons = ['killing_edge'];
  unit.ranks = { sword: 'A' };
  unit.drugCounts = { hp: 3 };
  unit.growthLog = [{ level: 2, gains: { str: 1 } }];
  unit.growthAllocation = { str: 4 };
  unit.lineageDepth = 1;
  const { baseStats } = reincarnate(unit, { str: 10, spd: 10, def: 10 }, 'gladiator', 120, 500);
  assert.equal(unit.cycle, 1);
  assert.equal(unit.level, 1);
  assert.deepEqual(unit.stats, baseStats);
  assert.equal(unit.classId, 'gladiator');
  assert.deepEqual(unit.classQualifications, []);
  assert.deepEqual(unit.learningProgress, {});
  assert.deepEqual(unit.growthLog, []);
  assert.deepEqual(unit.drugCounts, {});
  assert.equal(unit.weapons.length, 0);
  assert.deepEqual(unit.growthAllocation, { str: 10, spd: 10, def: 10 });
  assert.equal(unit.ageBaseDays, 16 * 120);
  assert.equal(unit.ageEpochDay, 500);
  assert.equal(unit.lineageDepth, 1, '血缘锁保留');
  assert.equal(canReincarnate(unit), '每个角色一生只能轮回一次');
});

test('reincarnation rejects overspend and low level', () => {
  const low = createUnit('erin', 50, 'r2', 0, true);
  assert.equal(canReincarnate(low), '必须达到 99 级才能轮回');
  const high = createUnit('erin', 99, 'r3', 0, true);
  assert.throws(() => reincarnate(high, { str: 20, spd: 20 }, 'gladiator', 120, 0), /最多 30/);
  assert.throws(() => reincarnate(high, { str: 11 }, 'gladiator', 120, 0), /单项/);
});

test('reincarnated level-ups include the 30-point allocation', () => {
  const plain = createUnit('erin', 99, 'plain', 0, false, { classId: 'gladiator', age: 16 });
  const cycled = createUnit('erin', 99, 'cycled', 0, false, { classId: 'gladiator', age: 16 });
  reincarnate(cycled, { str: 10 }, 'gladiator', 120, 0);
  assert.equal(growthRates(cycled).str, growthRates(plain).str + 10);
  const a = createUnit('erin', 1, 'a', 0, false, { classId: 'gladiator', age: 16 });
  const b = createUnit('erin', 1, 'b', 0, false, { classId: 'gladiator', age: 16 });
  b.growthAllocation = { str: 10 };
  levelUp(a, seedRng('x')); levelUp(b, seedRng('x'));
  assert.ok((b.growthLog[0].gains.str ?? 0) >= (a.growthLog[0].gains.str ?? 0));
});
