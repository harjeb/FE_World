import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@common/') ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
} });
const { canPromote } = await import('../src/model/roster.ts');
const { classEntryReason } = await import('../../backend/common/data/classes.ts');

test('promotion badges require an owned target with any one permitted rank; current/home entry stays exempt', () => {
  const unit = { character: 'erin', classId: 'swordsman', homeClassId: 'swordsman', species: 'human', classQualifications: ['shido'], ranks: { sword: 'E' } };
  assert.equal(canPromote(unit), false);
  unit.ranks.lance = 'B';
  assert.equal(canPromote(unit), true);
  unit.classQualifications = [];
  assert.equal(canPromote(unit), false);
  unit.ranks = { sword: 'E' };
  assert.equal(classEntryReason(unit, 'swordsman'), null);
  unit.classId = 'gladiator';
  assert.equal(classEntryReason(unit, 'swordsman'), null);
  assert.ok(classEntryReason(unit, 'shido'));
});
