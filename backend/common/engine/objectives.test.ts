import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from './step.ts';
import { stats } from '../data/types.ts';
import { seedRng } from './rng.ts';
import type { BattleState, Goal, Point, UnitState } from './types.ts';

function unit(id: string, side: 'player' | 'enemy', pos: Point, extra: Partial<UnitState> = {}): UnitState {
  const s = stats(30, 10, 0, 8, 8, 5, 6, 4, 5);
  return {
    id, name: id, side, classId: 'swordsman', level: 5, exp: 0, stats: s, con: 6, hp: s.hp,
    pos: [pos[0], pos[1]], weapons: ['iron_sword'], items: [], ranks: { sword: 'D' }, acted: false, alive: true, ...extra,
  };
}

function battle(goal: Goal, units: UnitState[], boxes?: Point[]): BattleState {
  const tiles = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'plain' as const));
  return {
    engineVersion: 1, id: 't', kind: 'field', name: 't', map: { width: 10, height: 10, tiles },
    units, turn: 1, turnLimit: 10, phase: 'player', goal, boxes,
    rng: seedRng('t'), growthRng: seedRng('t'),
  };
}

test('a unit standing on an exit tile can escape and wins the map at need', () => {
  const state = battle({ kind: 'escape', exits: [[1, 2]], need: 1 }, [
    unit('p', 'player', [1, 1]), unit('e', 'enemy', [9, 9]),
  ]);
  const { state: after, events } = step(state, { type: 'act', unit: 'p', to: [1, 2], act: 'escape' });
  assert.equal(after.result?.winner, 'player');
  assert.ok(events.some(e => e.t === 'escape' && e.unit === 'p'));
  assert.equal(after.units.find(u => u.id === 'p')!.escaped, true);
  assert.equal(after.units.find(u => u.id === 'p')!.alive, false);
});

test('a unit picks a box up by standing on it and only wins after escaping with it', () => {
  const state = battle({ kind: 'gather', exits: [[1, 2]], need: 1 }, [
    unit('p', 'player', [1, 1]), unit('e', 'enemy', [9, 9]),
  ], [[1, 2]]);
  const pickup = step(state, { type: 'act', unit: 'p', to: [1, 2], act: 'wait' });
  assert.ok(pickup.events.some(e => e.t === 'loot'));
  assert.equal(pickup.state.units.find(u => u.id === 'p')!.carried, 1);
  assert.equal(pickup.state.boxes?.length, 0);
  assert.equal(pickup.state.result, undefined, 'carrying a box is not a win yet');
  // 过一回合再撤离。
  const afterPhase = step(pickup.state, { type: 'endPhase' });
  const escaped = step(afterPhase.state, { type: 'act', unit: 'p', to: [1, 2], act: 'escape' });
  assert.equal(escaped.state.result?.winner, 'player');
});

test('the escort NPC walks to the exit on its own and wins when it gets there', () => {
  const npc = unit('n', 'player', [1, 1], { npc: true, acted: true, classId: 'cleric', weapons: [] });
  const state = battle({ kind: 'escort', exits: [[1, 2]], npc: 'n' }, [
    unit('p', 'player', [1, 3]), npc, unit('e', 'enemy', [9, 9]),
  ]);
  const { state: after, events } = step(state, { type: 'endPhase' });
  assert.ok(events.some(e => e.t === 'escape' && e.unit === 'n'), 'the NPC escapes during the next player phase');
  assert.equal(after.result?.winner, 'player');
});

test('a dead escort NPC loses the map', () => {
  const npc = unit('n', 'player', [1, 1], { npc: true, acted: true, alive: false });
  const state = battle({ kind: 'escort', exits: [[1, 2]], npc: 'n' }, [
    unit('p', 'player', [1, 3]), npc, unit('e', 'enemy', [9, 9]),
  ]);
  const { state: after } = step(state, { type: 'act', unit: 'p', to: [1, 3], act: 'wait' });
  assert.equal(after.result?.winner, 'enemy');
});
