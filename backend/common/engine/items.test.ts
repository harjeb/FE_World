import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { EngineError, step, unitById } from './index.ts';
import { actionOptions } from './ranges.ts';
import type { BattleEvent } from './index.ts';

const hero = () => {
  const state = createPinepassBattle('items');
  const unit = state.units.find(u => u.side === 'player')!;
  return { state, unit };
};
const use = (state: ReturnType<typeof hero>['state'], unitId: string, index: number) => {
  const unit = unitById(state, unitId);
  return step(state, { type: 'act', unit: unitId, to: unit.pos, act: 'item', item: index });
};

test('an elixir restores all HP in one use and is spent', () => {
  const { state, unit } = hero();
  unit.items = [{ id: 'elixir', uses: 1 }];
  unit.hp = 1;
  const result = use(state, unit.id, 0);
  const after = unitById(result.state, unit.id);
  const heal = (result.events as BattleEvent[]).find(e => e.t === 'heal') as Extract<BattleEvent, { t: 'heal' }>;
  assert.equal(after.hp, after.stats.hp, 'back to full HP');
  assert.equal(heal.amount, after.stats.hp - 1);
  assert.equal(heal.item, 'elixir');
  assert.equal(after.items.length, 0, 'a one-use item is gone');
});

test('an elixir cannot be used at full HP, but an antidote needs poison rather than damage', () => {
  const { state, unit } = hero();
  unit.items = [{ id: 'elixir', uses: 1 }, { id: 'antidote', uses: 2 }];
  assert.throws(() => use(state, unit.id, 0), (e: unknown) => e instanceof EngineError && e.code === 'NOTHING_TO_HEAL');
  unit.hp = 3;
  assert.throws(() => use(state, unit.id, 1), (e: unknown) => e instanceof EngineError && e.code === 'NOTHING_TO_HEAL', 'hurt but not poisoned: nothing to cure');
});

test('an antidote cures poison without healing, keeps other ailments, and its uses run down', () => {
  const { state, unit } = hero();
  unit.items = [{ id: 'antidote', uses: 2 }];
  unit.hp = 5;
  unit.artEffects = { statuses: ['poison', 'root'] };
  const result = use(state, unit.id, 0);
  const after = unitById(result.state, unit.id);
  assert.equal(after.hp, 5, 'no HP restored');
  assert.deepEqual(after.artEffects?.statuses, ['root'], 'only poison is removed');
  const events = result.events as BattleEvent[];
  assert.ok(events.some(e => e.t === 'artState' && e.unit === unit.id), 'the new ailment list is broadcast');
  assert.equal((events.find(e => e.t === 'heal') as Extract<BattleEvent, { t: 'heal' }>).item, 'antidote');
  assert.deepEqual(after.items, [{ id: 'antidote', uses: 1 }]);
});

test('the item menu lists an antidote only while poisoned and a potion only while hurt', () => {
  const { state, unit } = hero();
  unit.items = [{ id: 'vulnerary', uses: 3 }, { id: 'antidote', uses: 2 }];
  const items = () => actionOptions(state, unit, unit.pos).items;
  assert.deepEqual(items(), [], 'full HP and healthy: nothing to use');
  unit.hp -= 4;
  assert.deepEqual(items(), [0], 'hurt: the potion only');
  unit.artEffects = { statuses: ['poison'] };
  assert.deepEqual(items(), [0, 1], 'hurt and poisoned: both');
  unit.hp = unit.stats.hp;
  assert.deepEqual(items(), [1], 'poisoned at full HP: the antidote only');
});
