import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CLASS_IDS, CLASSES, CLASS_REQUIRED_RANK, classProficiencyReason, classEntryReason } from './classes.ts';
import { RANKS } from './types.ts';
import type { WeaponType } from './types.ts';
import { createUnit, promote } from '../game/model.ts';
import { switchClass } from '../game/mastery.ts';
import { promotionsFor } from './promotions.ts';

test('each stage requires its threshold in any one permitted weapon, including aliases', () => {
  for (const id of CATALOG_CLASS_IDS) {
    const type = Object.keys(CLASSES[id].weapons)[0] as WeaponType;
    const rank = CLASS_REQUIRED_RANK[CLASSES[id].stage];
    assert.ok(classProficiencyReason({ ranks: {} }, id), id);
    assert.equal(classProficiencyReason({ ranks: { [type]: rank } }, id), null, id);
    const previous = RANKS[RANKS.indexOf(rank) - 1];
    if (previous) assert.ok(classProficiencyReason({ ranks: { [type]: previous } }, id), id);
  }
  assert.equal(classProficiencyReason({ ranks: { lance: 'B' } }, 'sword_hero'), null);
  assert.ok(classProficiencyReason({ ranks: { axe: 'SSS' } }, 'ninja'));
});

test('current and home E-rank entry is exempt, not acquisition; other owned classes and direct promotion are gated', () => {
  const unit = createUnit('erin', 1, 'gate', 0, false, { classId: 'swordsman' });
  unit.ranks = { sword: 'E' };
  assert.equal(classEntryReason(unit, 'swordsman'), null);
  assert.ok(classProficiencyReason(unit, 'swordsman'));
  unit.classId = 'gladiator';
  switchClass(unit, 'swordsman');
  unit.classQualifications = ['shido'];
  assert.throws(() => switchClass(unit, 'shido'), /熟练度/);
  assert.throws(() => promote(unit, promotionsFor('swordsman').find(p => p.to === 'shido')!), /熟练度/);
  assert.deepEqual(unit.classQualifications, ['shido']);
});
