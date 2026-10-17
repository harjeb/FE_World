import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnit, growthRates } from './model.ts';
import { classMasteryOf, gainMastery, masteryNodesFor, setEquippedSkills, SKILL_SLOTS, switchClass, unlockedNodes } from './mastery.ts';

test('mastery unlocks class nodes by threshold, not by total level', () => {
  const unit = createUnit('erin', 70, 'm1', 0, false, { classId: 'gladiator', age: 20 });
  assert.equal(classMasteryOf(unit), 0);
  assert.deepEqual(unlockedNodes(unit), []);
  // 70 total levels do not unlock the class; mastery does.
  gainMastery(unit, 14);
  assert.deepEqual(unlockedNodes(unit), []);
  const unlocked = gainMastery(unit, 1);
  assert.equal(unlocked.length, 1);
  assert.equal(classMasteryOf(unit), 15);
  assert.ok(unit.learnedSkills.includes('opening'));
  assert.ok(unit.equippedSkills.includes('opening'));
  // Reaching the second node learns the second skill.
  gainMastery(unit, 30);
  assert.ok(unit.learnedSkills.includes('keen'));
  assert.equal(unlockedNodes(unit).length, 2);
  // Re-crossing the same threshold never unlocks twice.
  gainMastery(unit, 5);
  assert.equal(unlockedNodes(unit).length, 2);
  assert.equal(unit.learnedSkills.filter(s => s === 'opening').length, 1);
});

test('mastery nodes differ by class and are cleared by reincarnation', () => {
  const a = masteryNodesFor('gladiator');
  const b = masteryNodesFor('sword_hero');
  assert.notDeepEqual(a.map(n => n.threshold), b.map(n => n.threshold));
  assert.ok(b[0].threshold > a[0].threshold, 'higher stages unlock later');
});

test('learned skills are freely equipped across classes, shared across five slots', () => {
  const unit = createUnit('erin', 20, 'm2', 0, false, { classId: 'gladiator', age: 20 });
  gainMastery(unit, 100);
  const learned = [...unit.learnedSkills];
  assert.ok(learned.length >= 2);
  assert.equal(setEquippedSkills(unit, learned.slice(0, 1)), null);
  assert.deepEqual(unit.equippedSkills, learned.slice(0, 1));
  assert.match(setEquippedSkills(unit, ['opening', 'surge', 'grit', 'keen', 'nimble', 'focus']) ?? '', /最多/);
  assert.match(setEquippedSkills(unit, ['charge']) ?? '', /尚未学会/);
  assert.equal(SKILL_SLOTS, 5);
});

test('switching class keeps mastery and learned skills but recomputes the class growth', () => {
  const unit = createUnit('erin', 20, 'm3', 0, false, { classId: 'gladiator', age: 20 });
  gainMastery(unit, 20);
  const before = growthRates(unit);
  switchClass(unit, 'swordsman');
  assert.equal(unit.classId, 'swordsman');
  assert.equal(classMasteryOf(unit, 'gladiator'), 20, 'old class mastery is kept');
  assert.ok(unit.learnedSkills.includes('opening'));
  assert.notDeepEqual(growthRates(unit), before, 'changing class must recompute the full growth vector even when strength matches');
});
