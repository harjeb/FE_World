import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { createCrossTimeBattle } from '../game/cross-time-battle.ts';
import { createUnit } from '../game/model.ts';
import { createEnemy } from '../game/enemies.ts';
import { activateCrossTimeGroups, createCrossTimeGroups, scheduleCrossTimeGroups } from './cross-time-groups.ts';
import { nextEnemyAction } from './ai.ts';
import { step } from './step.ts';
import type { BattleEvent } from './types.ts';

function board() {
  const state = createPinepassBattle('groups');
  state.map = { width: 20, height: 20, tiles: Array.from({ length: 20 }, () => Array(20).fill('plain')) };
  state.crossTimeGroups = createCrossTimeGroups(['A', 'B', 'C', 'D'].map(group => ({ id: group, group })));
  const player = createEnemy('player', { classId: 'swordsman', level: 1, pos: [0, 19] });
  player.side = 'player';
  state.units = [player, ...['A', 'B', 'C', 'D'].map((id, i) => createEnemy(`cross-time:${id}`, { classId: 'swordsman', level: 1, pos: [10 + i, 0] }))];
  state.goal = { kind: 'rout' }; state.phase = 'player'; state.turn = 1;
  return state;
}

test('battle builder persists all seventeen fixed members in four ordered groups', () => {
  const battle = createCrossTimeBattle([createUnit('roland', 20, 'leader')], { region: 1, day: 1, seed: 'groups-builder' });
  assert.deepEqual(battle.state.crossTimeGroups!.map(group => [group.id, group.unitIds.length]), [['A', 4], ['B', 5], ['C', 4], ['D', 4]]);
  assert.deepEqual(battle.initial.crossTimeGroups, battle.state.crossTimeGroups);
  assert.ok(battle.state.crossTimeGroups!.flatMap(group => group.unitIds).every(id => battle.state.units.some(unit => unit.id === id)));
});

test('A ignores early assaults and activates only at enemy turn two; persisted notifications do not repeat', () => {
  const state = board(), events: BattleEvent[] = [];
  scheduleCrossTimeGroups(state, events, ['cross-time:A']);
  activateCrossTimeGroups(state, events);
  assert.equal(events.length, 0);
  state.turn = 2; activateCrossTimeGroups(state, events); activateCrossTimeGroups(state, events);
  assert.equal(events.length, 1); assert.equal(state.crossTimeGroups![0].active, true);
});

test('landing crosses three lines atomically; enemy phase schedules next turn without inserting actors', () => {
  const state = board(), events: BattleEvent[] = [];
  state.phase = 'enemy'; state.units[0].pos = [0, 4];
  scheduleCrossTimeGroups(state, events);
  assert.equal(events.length, 3);
  assert.ok(state.crossTimeGroups!.every(group => group.activateTurn === 2 && !group.active));
  activateCrossTimeGroups(state, events); assert.equal(events.length, 3);
});

test('dead predecessor chain schedules successors without reviving dead groups; result stops triggers', () => {
  const state = board(), events: BattleEvent[] = [];
  state.units[1].alive = false; state.units[2].alive = false; state.units[3].alive = false;
  scheduleCrossTimeGroups(state, events);
  assert.deepEqual(events.map(event => 'id' in event && event.id), ['B', 'C', 'D']);
  activateCrossTimeGroups(state, events);
  assert.ok(state.units.slice(1, 4).every(unit => !unit.alive));
  const ended = board(); ended.result = { winner: 'player', reason: 'done' };
  scheduleCrossTimeGroups(ended, [], ['cross-time:D']);
  assert.equal(ended.crossTimeGroups![3].activateTurn, undefined);
});

test('normal and hard AI exclude every dormant actor, including healers', () => {
  for (const aiDifficulty of ['normal', 'hard'] as const) {
    const state = board(); state.phase = 'enemy'; state.aiDifficulty = aiDifficulty;
    state.units[1].behavior = 'healer'; state.units[2].hp = 1;
    assert.equal(nextEnemyAction(state, state.units.slice(1)), null);
  }
});

test('phase transitions keep A dormant on turn one and activate on turn two without healing or reviving it', () => {
  const state = board(); state.units[1].hp = 1;
  const first = step(state, { type: 'endPhase' });
  assert.equal(first.state.turn, 2);
  assert.equal(first.state.crossTimeGroups![0].active, false);
  assert.ok(!first.events.some(event => event.t === 'wait' && event.unit === 'cross-time:A'));
  const second = step(first.state, { type: 'endPhase' });
  assert.equal(second.state.crossTimeGroups![0].active, true);
  assert.equal(second.state.units[1].hp, 1);
  assert.equal(second.events.filter(event => event.t === 'cross_time_group' && event.id === 'A').length, 1);
});

test('completed landing schedules all crossed groups before the enemy phase', () => {
  const state = board(); state.units[0].pos = [0, 5];
  const result = step(state, { type: 'act', unit: 'player', to: [0, 4], act: 'wait' });
  assert.equal(result.events.filter(event => event.t === 'cross_time_group').length, 3);
  assert.ok(result.state.crossTimeGroups!.slice(1).every(group => group.activateTurn === 1 && !group.active));
});

test('teleported player landing triggers the boundary after staff resolution', () => {
  const state = board(), caster = state.units[0];
  caster.classId = 'cleric'; caster.pos = [0, 14]; caster.weapons = ['warp_staff']; caster.ranks.staff = 'S';
  caster.bookInstances = [{ id: 'warp_staff', charges: 5, maxCharges: 5 }];
  const ally = structuredClone(caster); ally.id = 'ally'; ally.pos = [0, 15]; state.units.push(ally);
  const result = step(state, { type: 'act', unit: caster.id, to: caster.pos, act: 'staff', weapon: 'warp_staff', target: ally.id, dest: [0, 12] });
  assert.deepEqual(result.state.units.find(unit => unit.id === 'ally')!.pos, [0, 12]);
  assert.equal(result.state.crossTimeGroups![1].activateTurn, 1);
  assert.equal(result.state.crossTimeGroups![2].activateTurn, undefined);
  assert.ok(result.events.findIndex(event => event.t === 'cross_time_group') > result.events.findIndex(event => event.t === 'move'));
});

test('completed missed player attack schedules target group, while a dormant defender counters', () => {
  const state = board(), player = state.units[0], target = state.units[2];
  player.pos = [0, 19]; target.pos = [1, 19];
  player.stats.skl = -1000; player.stats.hp = player.hp = 999;
  target.stats.hp = target.hp = 999;
  target.stats.spd = target.stats.lck = 999;
  const result = step(state, { type: 'act', unit: player.id, to: player.pos, act: 'attack', target: target.id, weapon: player.weapons[0] });
  const combat = result.events.find(event => event.t === 'combat');
  assert.ok(combat?.t === 'combat' && combat.strikes.some(strike => strike.by === player.id && !strike.hit));
  assert.ok(combat?.t === 'combat' && combat.strikes.some(strike => strike.by === target.id));
  assert.equal(result.state.crossTimeGroups![1].activateTurn, 1);
  assert.equal(state.crossTimeGroups![1].activateTurn, undefined);
});
