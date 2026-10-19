import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { createEnemy } from '../game/enemies.ts';
import { stats } from '../data/types.ts';
import type { ClassId } from '../data/classes.ts';
import { decide, nextEnemyAction } from './ai.ts';
import { threatMap } from './ranges.ts';
import { cellKey, distance, living } from './units.ts';
import { step } from './step.ts';
import type { BattleState, Point, UnitState } from './types.ts';

function fighter(id: string, side: UnitState['side'], pos: Point, classId: ClassId = 'archer'): UnitState {
  const unit = createEnemy(id, { classId, level: 1, pos, behavior: 'aggressive' });
  unit.side = side;
  unit.stats = stats(40, 4, 4, 50, 5, 100, 0, 0);
  unit.hp = 40; unit.con = 20;
  if (side === 'player') unit.weapons = [];
  return unit;
}

function board(units: UnitState[]): BattleState {
  const state = createPinepassBattle('hard-ai');
  state.map = { width: 12, height: 8, tiles: Array.from({ length: 8 }, () => Array(12).fill('plain')) };
  state.units = units; state.goal = { kind: 'rout' }; state.phase = 'enemy'; state.aiDifficulty = 'hard';
  return state;
}

function focusBoard() {
  const a = fighter('a', 'enemy', [2, 2]), b = fighter('b', 'enemy', [4, 2]);
  a.artEffects = { statuses: ['root'] }; b.artEffects = { statuses: ['root'] };
  const tank = fighter('tank', 'player', [3, 1]), victim = fighter('victim', 'player', [3, 3]);
  tank.hp = tank.stats.hp = 100; victim.hp = victim.stats.hp = 18;
  return board([a, b, tank, victim]);
}

test('normal and hard AI both coordinate two nonlethal attacks', () => {
  const state = focusBoard();
  assert.equal((decide({ ...state, aiDifficulty: 'normal' }, state.units[0]) as { target: string }).target, 'victim');
  assert.equal((decide(state, state.units[0]) as { target: string }).target, 'victim');
  state.phase = 'player';
  const normal = step({ ...state, aiDifficulty: 'normal' }, { type: 'endPhase' });
  const hard = step(state, { type: 'endPhase' });
  assert.equal(normal.state.units.find(u => u.id === 'victim')!.alive, false);
  assert.equal(hard.state.units.find(u => u.id === 'victim')!.alive, false);
  assert.equal(hard.state.units.find(u => u.id === 'tank')!.hp, 100);
  assert.equal(hard.events.filter(e => e.t === 'combat').length, 2);
});

test('normal focus fire includes three allies when two hits are insufficient', () => {
  const state = focusBoard(); state.aiDifficulty = 'normal';
  const third = fighter('third', 'enemy', [3, 5]); third.artEffects = { statuses: ['root'] };
  state.units.push(third);
  const victim = state.units.find(unit => unit.id === 'victim')!; victim.hp = victim.stats.hp = 28;
  assert.equal((nextEnemyAction(state, living(state, 'enemy')) as { target: string }).target, victim.id);
  const result = step({ ...state, phase: 'player' }, { type: 'endPhase' });
  assert.equal(result.state.units.find(unit => unit.id === victim.id)!.alive, false);
  assert.equal(result.state.units.find(unit => unit.id === 'tank')!.hp, 100);
});

test('both difficulties change actor order to finish a target without wasting another attack', () => {
  const state = focusBoard();
  state.units = state.units.filter(u => u.id !== 'tank');
  state.units[0].stats.str = 0;
  state.units[1].stats.str = 20;
  state.units[2].hp = state.units[2].stats.hp = 12;
  const normal = { ...state, aiDifficulty: 'normal' as const, phase: 'player' as const };
  const hard = { ...state, phase: 'player' as const };
  assert.equal(step(normal, { type: 'endPhase' }).events.find(e => e.t === 'combat')?.attacker, 'b');
  const result = step(hard, { type: 'endPhase' });
  assert.equal(result.events.find(e => e.t === 'combat')?.attacker, 'b');
  assert.equal(result.events.filter(e => e.t === 'combat').length, 1);
});

test('both difficulties choose an attack landing outside other enemies reach and value cover', () => {
  const archer = fighter('archer', 'enemy', [3, 3]);
  const target = fighter('target', 'player', [5, 3]);
  target.hp = 8;
  const threat = fighter('threat', 'player', [5, 0], 'swordsman');
  threat.weapons = ['iron_sword']; threat.artEffects = { statuses: ['root'] };
  threat.hp = threat.stats.hp = 999; threat.stats.def = 999;
  const state = board([archer, target, threat]);
  state.map.tiles[2][4] = 'forest';
  const normal = decide({ ...state, aiDifficulty: 'normal' }, archer), hard = decide(state, archer);
  const danger = threatMap(state, 'player');
  assert.equal(danger.get(cellKey(state, normal.to)) ?? 0, 0);
  assert.equal(danger.get(cellKey(state, hard.to)) ?? 0, 0);
  assert.equal(hard.act, 'attack');
  assert.deepEqual(hard.to, [4, 2]);
  assert.doesNotThrow(() => step(state, hard));
});

test('hard search vacates an attack square before moving the rear fighter through a narrow passage', () => {
  const blocker = fighter('blocker', 'enemy', [5, 2], 'swordsman'); blocker.weapons = [];
  const attacker = fighter('attacker', 'enemy', [3, 2], 'swordsman'); attacker.stats.str = 20;
  const victim = fighter('victim', 'player', [6, 2], 'swordsman'); victim.hp = victim.stats.hp = 18;
  const state = board([blocker, attacker, victim]);
  state.map.tiles.forEach(row => row.fill('wall'));
  for (let x = 1; x <= 6; x++) state.map.tiles[2][x] = 'plain';
  state.map.tiles[1][5] = 'plain';
  const ordinary = nextEnemyAction({ ...state, aiDifficulty: 'normal' }, living(state, 'enemy'))!;
  assert.equal(ordinary.unit, blocker.id);
  assert.deepEqual(ordinary.to, blocker.pos);
  const budget = { remaining: 72 };
  const planned = nextEnemyAction(state, living(state, 'enemy'), budget)!;
  assert.equal(budget.remaining, 0);
  assert.deepEqual(nextEnemyAction(state, living(state, 'enemy'), budget), ordinary, 'exhausted search still uses coordinated normal tactics');
  assert.equal(planned.unit, blocker.id, 'clear the square before spending the rear fighter action');
  assert.notDeepEqual(planned.to, blocker.pos);
  const afterMove = step(state, planned).state;
  const follow = nextEnemyAction(afterMove, living(afterMove, 'enemy'))!;
  assert.equal(follow.unit, attacker.id);
  assert.equal(follow.act, 'attack');
  assert.deepEqual(follow.to, [5, 2]);
  state.phase = 'player';
  assert.equal(step({ ...state, aiDifficulty: 'normal' }, { type: 'endPhase' }).state.units.find(u => u.id === victim.id)!.alive, true);
  assert.equal(step(state, { type: 'endPhase' }).state.units.find(u => u.id === victim.id)!.alive, false);
  const winter = structuredClone(state);
  winter.map.season = 4; winter.map.tiles[2][5] = 'ice'; winter.units[0].classId = 'knight';
  const frozen = structuredClone(winter);
  const winterResult = step(winter, { type: 'endPhase' });
  assert.equal(winterResult.state.map.tiles[2][5], 'water');
  assert.equal(winterResult.state.units.find(u => u.id === victim.id)!.alive, true, 'vacating armor breaks the only attack square, so that continuation is impossible');
  assert.deepEqual(winter, frozen, 'speculative ice changes must not escape the simulated state');
});

test('distant formations use normal advance until combat or healing coordination becomes possible', () => {
  const state = board([fighter('a', 'enemy', [0, 0]), fighter('b', 'enemy', [0, 2]), fighter('foe', 'player', [11, 7])]);
  assert.deepEqual(nextEnemyAction(state, living(state, 'enemy')),
    nextEnemyAction({ ...state, aiDifficulty: 'normal' }, living(state, 'enemy')));
});

test('hard planning is deterministic, ignores future rolls and does not mutate input', () => {
  const state = focusBoard(), before = structuredClone(state);
  const action = nextEnemyAction(state, living(state, 'enemy'));
  assert.deepEqual(state, before);
  const otherRolls = { ...structuredClone(state), rng: [1, 2, 3, 4] as BattleState['rng'] };
  assert.deepEqual(nextEnemyAction(otherRolls, living(otherRolls, 'enemy')), action);
  assert.deepEqual(step({ ...state, phase: 'player' }, { type: 'endPhase' }), step({ ...structuredClone(state), phase: 'player' }, { type: 'endPhase' }));
});

test('old saves and player auto-actions retain normal decisions', () => {
  const state = focusBoard();
  delete state.aiDifficulty;
  assert.deepEqual(decide(state, state.units[0]), decide({ ...state, aiDifficulty: 'normal' }, state.units[0]));
  const player = state.units[0]; player.side = 'player';
  state.units[2].side = state.units[3].side = 'enemy';
  assert.deepEqual(decide(state, player), decide({ ...state, aiDifficulty: 'hard' }, player));
});

test('hard mode respects hold, guard, sleep, petrification and berserk rules', () => {
  const state = focusBoard(), unit = state.units[0];
  unit.behavior = 'hold';
  assert.deepEqual(decide(state, unit), { type: 'act', unit: unit.id, to: unit.pos, act: 'wait' });
  unit.behavior = 'guard'; unit.artEffects = undefined;
  const boss = state.units[1]; boss.boss = true; boss.pos = [0, 2]; boss.behavior = 'hold';
  assert.ok(distance(decide(state, unit).to, boss.pos) <= 3);
  unit.statuses = { sleep: true };
  assert.equal(decide(state, unit).act, 'wait');
  unit.statuses = undefined; unit.petrified = true;
  assert.ok(nextEnemyAction(state, living(state, 'enemy'))?.unit !== unit.id);
  unit.petrified = false; unit.statuses = { berserk: 2 };
  assert.deepEqual(decide(state, unit), decide({ ...state, aiDifficulty: 'normal' }, unit));
});

test('a crowded hard phase completes with each enemy acting at most once', { timeout: 10000 }, () => {
  const state = board(Array.from({ length: 32 }, (_, i) => {
    const unit = fighter(`dense-${i}`, i < 8 ? 'player' : 'enemy', [4 + i % 8, 7 + Math.floor(i / 8)], i % 4 === 0 ? 'archer' : i % 4 === 1 ? 'cleric' : 'swordsman');
    unit.behavior = i % 4 === 1 ? 'healer' : 'aggressive';
    unit.hp = unit.stats.hp = 200;
    return unit;
  }));
  state.map = { width: 20, height: 20, tiles: Array.from({ length: 20 }, () => Array(20).fill('plain')) };
  state.phase = 'player';
  const result = step(state, { type: 'endPhase' });
  assert.equal(result.state.phase, 'player');
  assert.equal(result.state.turn, state.turn + 1);
  assert.ok(living(result.state, 'enemy').every(unit => unit.acted));
  const actors = result.events.flatMap(event => event.t === 'combat' ? [event.attacker]
    : event.t === 'wait' ? [event.unit] : event.t === 'heal' && event.by ? [event.by] : []);
  assert.equal(actors.length, 24);
  assert.equal(new Set(actors).size, 24);
});

test('urgent support heals an endangered ally without exposing it to a lethal counter first', () => {
  const ally = fighter('ally', 'enemy', [2, 2]); ally.hp = 1;
  const healer = fighter('healer', 'enemy', [1, 2], 'cleric'); healer.behavior = 'healer';
  const foe = fighter('foe', 'player', [3, 3]); foe.hp = foe.stats.hp = 100; foe.weapons = ['iron_bow'];
  const state = board([ally, healer, foe]);
  const normal = nextEnemyAction({ ...state, aiDifficulty: 'normal' }, living(state, 'enemy'))!;
  assert.equal(normal.unit, healer.id);
  assert.equal(normal.act, 'heal');
  const action = nextEnemyAction(state, living(state, 'enemy'))!;
  assert.ok(action.act === 'heal' || action.unit === ally.id && action.act === 'wait', 'hard may reposition the ally before healing, but cannot sacrifice it');
  const result = step({ ...state, phase: 'player' }, { type: 'endPhase' });
  assert.ok(result.events.some(event => event.t === 'heal' && event.by === healer.id && event.target === ally.id));
  assert.ok(result.state.units.find(unit => unit.id === ally.id)!.alive);
  assert.ok(result.state.units.find(unit => unit.id === ally.id)!.hp > 1);
});
