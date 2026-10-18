import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyLevel } from './calendar.ts';
import { createFieldBattle, createFestivalBattle } from './battles.ts';
import { createUnit } from './model.ts';

test('enemy dates grow faster early and slower later, with a bounded regional offset', () => {
  for (const [day, expected] of [[0, 1], [100, 4], [250, 10], [499, 19], [500, 20], [1000, 35], [1500, 47], [2000, 57], [2500, 66], [3000, 74], [3500, 81], [4000, 87]]) {
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
  assert.equal(make(12).state.units.find(u => u.side === 'enemy')!.level, 5);
  assert.equal(before.state.units.find(u => u.side === 'enemy')!.level, 5);
});

test('dungeon stages use the locked entry level even across calendar bands', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFieldBattle([unit], { region: 1, day: 360, cleared: 12, seed: 'locked', level: enemyLevel(239), stageIndex: 2 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 14);
});

test('annual opponents use the fixed edition date plus round difficulty', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFestivalBattle([unit], 9, 'annual-date', { day: 240 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 14);
});
