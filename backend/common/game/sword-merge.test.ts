import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnit, normalizeUnit, addWeaponExp } from './model.ts';
import { CLASSES, classEntryReason } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';
import { WEAPON_TYPE_NAMES } from '../data/types.ts';
import { WEAPON_ARTS } from '../data/weapon-arts.ts';
import { MY_DEFENSE } from '../arena/demo.ts';
import { defenseBoard } from '../arena/rules.ts';
import { canWield } from '../engine/units.ts';
import { createDispatch, dispatchSummary } from './dispatch.ts';

test('dagger items and arts are swords, not a separate active category', () => {
  assert.ok(!Object.keys(WEAPON_TYPE_NAMES).includes('dagger'));
  for (const cls of Object.values(CLASSES)) assert.ok(!Object.keys(cls.weapons).includes('dagger'));
  for (const id of ['dagger', 'poison_dagger', 'silver_dagger'] as const) assert.equal(WEAPONS[id].type, 'sword');
  for (const art of WEAPON_ARTS) {
    assert.notEqual(art.weapon as string, 'dagger');
    assert.ok(!art.weaponCompatibility?.includes('dagger' as never));
  }
  const ninja = createUnit('erin', 1, 'ninja-sword', 0, false, { classId: 'ninja' });
  const applicant = createUnit('erin', 1, 'ninja-applicant', 0);
  applicant.ranks.sword = 'D';
  assert.ok(classEntryReason(applicant, 'ninja', applicant.homeClassId));
  applicant.ranks.sword = 'C';
  assert.equal(classEntryReason(applicant, 'ninja', applicant.homeClassId), null);
  ninja.ranks.sword = 'C';
  addWeaponExp(ninja, 'sword', 10);
  assert.equal(ninja.weaponExp.sword, 80);
  assert.deepEqual(Object.keys(CLASSES.ninja.weapons), ['sword']);
});

test('old arena snapshots gain live sword permission without rewriting frozen history', () => {
  const defense = structuredClone(MY_DEFENSE);
  const saved = defense.slots[0].unit;
  saved.classId = 'ninja';
  saved.weapons = ['silver_dagger'];
  saved.ranks = { sword: 'D' };
  Object.assign(saved.ranks, { dagger: 'A' });
  const before = JSON.stringify(defense);
  const live = defenseBoard(defense).units[0];
  assert.equal(live.ranks.sword, 'A');
  assert.ok(!('dagger' in live.ranks));
  assert.equal(canWield(live, 'silver_dagger'), true);
  assert.equal(JSON.stringify(defense), before);
});

test('legacy dispatch views use sword without rewriting completed history', () => {
  const dispatch = createDispatch('old', 'player', 1, ['unit'], 5, 'ninja', 'sword', 0);
  Object.assign(dispatch, { weaponType: 'dagger', result: { day: 5, materials: [], weapons: [], unitRewards: [
    { unitId: 'unit', exp: 5, levelUps: [], mastery: 5, unlocked: [], weaponType: 'dagger', weaponRank: 'C' },
  ] } });
  const before = JSON.stringify(dispatch);
  const view = dispatchSummary(dispatch);
  assert.equal(view.weaponType, 'sword');
  assert.equal((view.result as { unitRewards: { weaponType: string }[] }).unitRewards[0].weaponType, 'sword');
  assert.equal(JSON.stringify(dispatch), before);
});

test('legacy ranks and experience merge by independent maxima, preserving equipment and learned IDs', () => {
  for (const oldStronger of [true, false]) {
    const unit = createUnit('erin', 1, 'legacy-sword', 0);
    Object.assign(unit.ranks, { sword: oldStronger ? 'D' : 'A', dagger: oldStronger ? 'A' : 'D' });
    Object.assign(unit.weaponExp, { sword: oldStronger ? 210 : 20, dagger: oldStronger ? 20 : 210 });
    unit.weapons = ['dagger', 'poison_dagger', 'silver_dagger'];
    unit.learnedArts = ['dagger_disarm'];
    const equipment = JSON.stringify(unit.weapons);
    normalizeUnit(unit);
    assert.equal(unit.ranks.sword, 'A');
    assert.equal(unit.weaponExp.sword, 210);
    assert.ok(!('dagger' in unit.ranks));
    assert.ok(!('dagger' in unit.weaponExp));
    assert.equal(JSON.stringify(unit.weapons), equipment);
    assert.deepEqual(unit.learnedArts, ['dagger_disarm']);
    const once = JSON.stringify(unit);
    normalizeUnit(unit);
    assert.equal(JSON.stringify(unit), once);
  }
});
