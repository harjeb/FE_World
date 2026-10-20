import assert from 'node:assert/strict';
import test from 'node:test';
import { createFieldBattle, createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { createEnemy, type EnemySpec } from './enemies.ts';
import { addEnemyReserves } from './enemy-formation.ts';
import { runScenarioEvents } from '../engine/scenario.ts';
import type { BattleEvent, Point } from '../engine/types.ts';
import { canEnter } from '../maps/map.ts';
import { travelCosts } from '../engine/movement.ts';
import { CLASSES } from '../data/classes.ts';

const party = Array.from({ length: 6 }, (_, i) => createUnit('erin', 1, `player-${i}`));

test('hard reserves enlarge random and classic formations without changing deployment or creating extra bosses', () => {
  for (const create of [
    (aiDifficulty: 'normal' | 'hard') => createFieldBattle(party.slice(0, 4), { region: 5, cleared: 0, day: 2000, seed: 'formation', aiDifficulty }),
    (aiDifficulty: 'normal' | 'hard') => createClassicBattle(party, { mapId: 'fe1-ch16', seed: 'formation', aiDifficulty }),
  ]) {
    const normal = create('normal').state, hard = create('hard').state;
    const originals = normal.units.filter(u => u.side === 'enemy');
    const reserves = hard.units.filter(u => u.id.startsWith('reserve-'));
    assert.equal(hard.units.filter(u => u.side === 'enemy').length, originals.length + Math.ceil(originals.length / 2));
    assert.equal(reserves.length, normal.encounter ? 0 : Math.ceil(originals.length / 2), 'planned random armies already include hard slots; classic maps add reserves');
    assert.equal(new Set(hard.units.map(u => u.id)).size, hard.units.length);
    assert.equal(new Set(hard.units.map(u => u.pos.join(','))).size, hard.units.length);
    assert.deepEqual(hard.units.filter(u => u.side === 'player'), normal.units.filter(u => u.side === 'player'));
    assert.equal(hard.units.filter(u => u.side === 'enemy' && u.boss).length, originals.filter(u => u.boss).length);
    for (const reserve of reserves) {
      const movement = CLASSES[reserve.classId].moveType;
      assert.ok(canEnter(hard.map.tiles[reserve.pos[1]][reserve.pos[0]], movement));
      assert.ok(originals.some(u => u.classId === reserve.classId && travelCosts(hard, u, [u.pos]).has(reserve.pos[1] * hard.map.width + reserve.pos[0])));
      assert.ok(!hard.units.some(u => u.side === 'player' && Math.abs(u.pos[0] - reserve.pos[0]) + Math.abs(u.pos[1] - reserve.pos[1]) <= 1));
    }
  }
});

test('crowded reserves skip walls, objects, objectives and unused deployment cells instead of overlapping or crossing walls', () => {
  const state = createFieldBattle(party.slice(0, 1), { region: 1, cleared: 0, seed: 'space' }).state;
  state.aiDifficulty = 'hard';
  state.map = { width: 10, height: 5, tiles: Array.from({ length: 5 }, () => Array(10).fill('wall')) };
  const player = state.units.find(u => u.side === 'player')!;
  player.pos = [1, 2];
  const specs: EnemySpec[] = [1, 2, 3].map(y => ({ classId: 'knight', level: 1, pos: [7, y] }));
  state.units = [player, ...specs.map((spec, i) => createEnemy(`e${i}`, spec))];
  const floor: Point[] = [[1, 2], [2, 2], [7, 1], [7, 2], [7, 3], [6, 1], [6, 2], [6, 3], [8, 2]];
  for (const [x, y] of floor) state.map.tiles[y][x] = 'floor';
  state.goal = { kind: 'seize', throne: [8, 2] };
  state.objects = [{ id: 'chest', kind: 'chest', pos: [6, 1], state: 'closed' }];
  const before = structuredClone(state.map);
  const reserves = addEnemyReserves(state, specs, [[6, 3]]);
  assert.equal(reserves.length, 1, 'only one legal slot; do not fill the requested second slot elsewhere');
  assert.deepEqual(reserves[0].pos, [6, 2]);
  assert.deepEqual(state.map, before);
  assert.deepEqual(addEnemyReserves(state, specs, [[6, 3]]), [], 'full formation safely adds nobody');
  state.aiDifficulty = 'normal';
  assert.deepEqual(addEnemyReserves(state, specs), []);
});

test('each scripted hard reinforcement wave adds seeded reserves and records them once for replay', () => {
  const state = createFieldBattle(party.slice(0, 1), { region: 1, cleared: 0, seed: 'waves', aiDifficulty: 'hard' }).state;
  state.map = { width: 12, height: 8, tiles: Array.from({ length: 8 }, () => Array(12).fill('plain')) };
  state.units = state.units.filter(u => u.side === 'player');
  state.units[0].pos = [0, 0];
  state.goal = { kind: 'rout' };
  state.scenario = { id: 'waves', adapterVersion: 'test', sourceSha256: null, baseLevel: 10, fired: [], flags: [], mapChanges: [], events: [
    { id: 'wave', trigger: { kind: 'turn', turn: 1 }, actions: [{ kind: 'spawn', units: [
      { classId: 'fighter', levelOffset: 0, pos: [8, 3] }, { classId: 'cleric', levelOffset: 0, pos: [8, 5] },
    ] }] },
  ] };
  const replay = structuredClone(state), rng = structuredClone(state.rng);
  const events: BattleEvent[] = [];
  runScenarioEvents(state, events);
  assert.equal(state.units.filter(u => u.side === 'enemy').length, 3);
  assert.equal(events.filter(e => e.t === 'spawn').length, 3);
  for (const event of events) if (event.t === 'spawn') {
    assert.deepEqual(event.spawned, state.units.find(u => u.id === event.unit));
    assert.ok(event.spawned!.level >= 12 && event.spawned!.level <= 15);
  }
  assert.deepEqual(state.rng, rng, 'reinforcements do not consume combat rolls');
  const replayEvents: BattleEvent[] = [];
  runScenarioEvents(replay, replayEvents);
  assert.deepEqual(replay, state);
  assert.deepEqual(replayEvents, events);
  const before = structuredClone(state);
  runScenarioEvents(state, []);
  assert.deepEqual(state, before, 'a fired event cannot add another wave');
});
