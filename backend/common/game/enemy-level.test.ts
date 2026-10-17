import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyLevel } from './calendar.ts';
import { createFieldBattle, createFestivalBattle } from './battles.ts';
import { createUnit } from './model.ts';

test('enemy dates grow faster early and slower later, with a bounded regional offset', () => {
  for (const [day, expected] of [[0, 1], [30, 5], [60, 10], [90, 15], [119, 19], [120, 20], [240, 35], [360, 47], [480, 57], [600, 66], [720, 74], [840, 81], [960, 87]]) {
    assert.equal(enemyLevel(day), expected);
    assert.equal(enemyLevel(day, 2), expected + 2);
  }
  assert.equal(enemyLevel(99999, 2), 95);
});

test('date, not cleared regions or player level, decides a new field battle', () => {
  const unit = createUnit('erin', 1, 'u', 0);
  const make = (cleared: number) => createFieldBattle([unit], { region: 1, day: 120, cleared, seed: 'date' });
  const before = make(0);
  unit.level = 99;
  assert.equal(make(12).state.units.find(u => u.side === 'enemy')!.level, 20);
  assert.equal(before.state.units.find(u => u.side === 'enemy')!.level, 20);
});

test('dungeon stages use the locked entry level even across calendar bands', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFieldBattle([unit], { region: 1, day: 360, cleared: 12, seed: 'locked', level: enemyLevel(239), stageIndex: 2 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 38);
});

test('annual opponents use the fixed edition date plus round difficulty', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFestivalBattle([unit], 9, 'annual-date', { day: 240 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 39);
});
