import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClassicBattle } from './battles.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { CLASSIC_MAPS } from './classic-catalog.ts';
import { validateClassicScenario } from './classic-validation.ts';
import { createEnemy } from './enemies.ts';
import { createUnit } from './model.ts';
import { decide, nextEnemyAction } from '../engine/ai.ts';
import { activateThieves, conditionMet, thiefAwake } from '../engine/conditions.ts';
import { runScenarioEvents } from '../engine/scenario.ts';
import { step } from '../engine/step.ts';
import type { BattleEvent, BattleState, ScenarioTrigger } from '../engine/types.ts';

const classic = (mapId: string, aiDifficulty: 'normal' | 'hard' = 'normal') => createClassicBattle([
  createUnit('erin', 20, 'hero'),
], { mapId, seed: 'thief-conditions', day: 240, aiDifficulty }).state;

function board(trigger?: ScenarioTrigger, aiDifficulty: 'normal' | 'hard' = 'normal'): BattleState {
  const state = classic('fe1-ch20');
  state.aiDifficulty = aiDifficulty;
  state.map = { width: 16, height: 6, tiles: Array.from({ length: 6 }, () => Array(16).fill('plain')) };
  const thief = createEnemy('thief', { classId: 'thief', level: 5, pos: [2, 2], behavior: 'thief', thiefTrigger: trigger });
  const player = createEnemy('hero', { classId: 'swordsman', level: 1, pos: [14, 4] });
  player.side = 'player';
  state.units = [player, thief]; state.goal = { kind: 'rout' }; state.phase = 'player';
  state.objects = [{ id: 'treasure', kind: 'chest', pos: [8, 2], state: 'closed', loot: { item: 'silver_sword', count: 1 } }];
  state.scenario = { id: 'gates', adapterVersion: 'test', sourceSha256: null, baseLevel: 5, events: [], mapChanges: [], flags: [], fired: [] };
  return state;
}

const thiefOf = (state: BattleState) => state.units.find(unit => unit.id === 'thief')!;
const alerts = (events: BattleEvent[]) => events.filter(event => event.t === 'scenario' && event.event.startsWith('thief-alert:'));

test('all 60 maps have explicit thief audits; an assassin mapping alone does not create a looter', () => {
  for (const map of CLASSIC_MAPS) {
    const adaptation = classicAdaptation(map.id);
    assert.ok(adaptation.thiefAudit.length > 0, map.id);
    assert.ok(Array.isArray(adaptation.thieves), map.id);
    assert.deepEqual(validateClassicScenario(map.id), [], map.id);
    const state = classic(map.id);
    for (const enemy of state.units.filter(unit => unit.behavior === 'thief')) {
      assert.ok(enemy.thiefTrigger, `${map.id}: ${enemy.id}`);
      assert.equal(enemy.thiefTurn, undefined, 'new battles never acquire the old default turn');
    }
  }
  for (const id of ['fe7-ch23-eliwood-lloyd', 'fe7-ch25-eliwood-kenneth', 'fe7-ch30-eliwood']) {
    assert.ok(!classic(id).units.some(unit => unit.behavior === 'thief'), id);
  }
  const xane = classic('fe1-ch16').units.find(unit => unit.id === 'e1')!;
  assert.notEqual(xane.behavior, 'thief', 'FE1 freelancer is not a thief');
  assert.equal(classic('fe8-ch14-eirika').units.find(unit => unit.id === 'e37')?.behavior, 'thief');
});

test('source thief waves use real chapter turns and inherit gates after level downgrades and hard reserves', () => {
  for (const [id, turn, beforeCount, count] of [
    ['fe6-ch16-main', 10, 0, 2], ['fe6-ch20-ilia', 10, 0, 3], ['fe6-ch22-main', 15, 0, 2],
    ['fe7-ch19-eliwood', 2, 1, 2], ['fe7-ch19-eliwood', 3, 2, 3],
    ['fe7-ch25-eliwood-kenneth', 4, 0, 1], ['fe7-ch25-eliwood-kenneth', 5, 1, 2], ['fe8-ch14-ephraim', 2, 0, 1],
  ] as const) {
    for (const difficulty of ['normal', 'hard'] as const) {
      const state = classic(id, difficulty);
      const events: BattleEvent[] = [];
      state.turn = turn - 1;
      runScenarioEvents(state, events);
      const waiting = state.units.filter(unit => unit.behavior === 'thief').length;
      assert.ok(waiting >= beforeCount, `${id}: preceding waves are present`);
      if (difficulty === 'normal') assert.equal(waiting, beforeCount, `${id}: no premature wave`);
      state.turn = turn;
      runScenarioEvents(state, events);
      activateThieves(state, events);
      const thieves = state.units.filter(unit => unit.behavior === 'thief');
      assert.ok(thieves.length >= count, `${id}: all source thieves arrive`);
      if (difficulty === 'normal') assert.equal(thieves.length, count, id);
      for (const thief of thieves) {
        assert.ok(thief.thiefTrigger?.kind === 'turn' && thief.thiefTrigger.turn <= turn);
        assert.equal(thief.thiefActive, true);
      }
      assert.equal(alerts(events).length, thieves.length, 'each arriving thief warns once');
      const before = state.units.length;
      runScenarioEvents(state, events);
      activateThieves(state, events);
      assert.equal(state.units.length, before);
      assert.equal(alerts(events).length, thieves.length);
    }
  }
});

test('turn-one looters and unconfigured engine thieves act immediately; explicit legacy timings still wait', () => {
  const initial = classic('fe8-ch14-eirika');
  const rennac = initial.units.find(unit => unit.id === 'e37')!;
  assert.deepEqual(rennac.thiefTrigger, { kind: 'turn', turn: 1 });
  assert.equal(thiefAwake(initial, rennac), true);
  for (const difficulty of ['normal', 'hard'] as const) {
    const state = board(undefined, difficulty), thief = thiefOf(state);
    assert.ok(decide(state, thief).to[0] > thief.pos[0]);
    thief.thiefTurn = 7;
    assert.deepEqual(decide(state, thief).to, thief.pos);
    state.turn = 7;
    assert.ok(decide(state, thief).to[0] > thief.pos[0]);
  }
});

test('FE3 source waypoints must be reached before looting; the adapted water coordinate is walkable', () => {
  let state = classic('fe3-book1-ch13');
  const rules = classicAdaptation('fe3-book1-ch13').thieves;
  assert.deepEqual(rules.map(rule => rule.approach), [[11, 3], [23, 12], [14, 11], [7, 4]]);
  const id = 'e21', thief = state.units.find(unit => unit.id === id)!;
  const player = state.units.find(unit => unit.side === 'player')!;
  player.pos = [7, 4];
  assert.equal(thiefAwake(state, thief), false, 'another unit on the waypoint cannot activate this thief');
  player.pos = [25, 30];
  state.units = state.units.filter(unit => unit.id === id || unit.side === 'player' || unit.boss);
  const notices: BattleEvent[] = [];
  for (let i = 0; i < 12 && !state.units.find(unit => unit.id === id)!.thiefActive; i++) {
    state.phase = 'enemy';
    const actor = state.units.find(unit => unit.id === id)!; actor.acted = false;
    const result = step(state, decide(state, actor));
    notices.push(...result.events); state = result.state;
  }
  const active = state.units.find(unit => unit.id === id)!;
  assert.equal(active.thiefActive, true, 'actual movement reaches the source waypoint');
  assert.equal(alerts(notices).length, 1);
  assert.deepEqual(active.pos, [7, 4]);
  active.pos = [4, 3];
  const restored: BattleState = JSON.parse(JSON.stringify(state));
  assert.equal(thiefAwake(restored, restored.units.find(unit => unit.id === id)!), true, 'activation survives leaving the waypoint and save/load');
  const repeated: BattleEvent[] = []; activateThieves(restored, repeated);
  assert.equal(alerts(repeated).length, 0);
});

test('player-area activation happens after movement, is inclusive, warns once and replays deterministically', () => {
  const initial = board({ kind: 'area', side: 'player', min: [12, 3], max: [13, 4] });
  initial.turn = 99;
  assert.equal(thiefAwake(initial, thiefOf(initial)), false, 'waiting any number of turns cannot replace an area trigger');
  const action = { type: 'act', unit: 'hero', to: [13, 4] as [number, number], act: 'wait' } as const;
  const result = step(initial, action);
  assert.equal(thiefOf(result.state).thiefActive, true);
  assert.equal(alerts(result.events).length, 1);
  assert.deepEqual(step(initial, action), result, 'initial + actions reproduces activation and warning');
  const restored: BattleState = JSON.parse(JSON.stringify(result.state));
  restored.units[0].acted = false;
  const left = step(restored, { ...action, to: [14, 4] });
  assert.equal(thiefOf(left.state).thiefActive, true);
  assert.equal(alerts(left.events).length, 0);
});

test('area checks exclude defeated units and NPCs; object/flag conditions combine without bypassing a turn gate', () => {
  const state = board();
  const area: ScenarioTrigger = { kind: 'area', side: 'player', min: [14, 4], max: [14, 4] };
  state.units[0].npc = true; assert.equal(conditionMet(state, area), false);
  state.units[0].npc = false; state.units[0].alive = false; assert.equal(conditionMet(state, area), false);
  state.units[0].alive = true;
  const trigger: ScenarioTrigger = { kind: 'all', conditions: [{ kind: 'turn', turn: 7 }, { kind: 'any', conditions: [
    { kind: 'object', object: 'treasure', state: 'opened' }, { kind: 'flag', flag: 'entered-hall' },
  ] }] };
  thiefOf(state).thiefTrigger = trigger;
  state.scenario!.flags.push('entered-hall');
  assert.equal(thiefAwake(state, thiefOf(state)), false);
  state.turn = 7; assert.equal(thiefAwake(state, thiefOf(state)), true);
  state.scenario!.flags = []; assert.equal(thiefAwake(state, thiefOf(state)), false);
  state.objects![0].state = 'opened'; assert.equal(thiefAwake(state, thiefOf(state)), true);
});

test('a position-triggered reinforcement spawns and activates once immediately after a player move', () => {
  const initial = board(); initial.units = initial.units.filter(unit => unit.id !== 'thief');
  initial.units.push(createEnemy('guard', { classId: 'fighter', level: 5, pos: [0, 0], behavior: 'hold' }));
  initial.scenario!.events = [{ id: 'enter-treasure-hall', trigger: { kind: 'area', side: 'player', min: [12, 3], max: [13, 4] }, actions: [{
    kind: 'spawn', units: [{ classId: 'thief', levelOffset: 0, pos: [2, 2], behavior: 'thief', thiefTrigger: { kind: 'flag', flag: 'hall-open' } }],
  }, { kind: 'flag', flag: 'hall-open' }] }];
  const action = { type: 'act', unit: 'hero', to: [13, 4] as [number, number], act: 'wait' } as const;
  const result = step(initial, action);
  const looter = result.state.units.find(unit => unit.behavior === 'thief')!;
  assert.ok(looter?.thiefActive);
  assert.equal(alerts(result.events).length, 1);
  assert.deepEqual(step(initial, action), result);
  runScenarioEvents(result.state, []);
  assert.equal(result.state.units.filter(unit => unit.behavior === 'thief').length, 1);
});

test('thieves open a blocking door to real treasure and skip empty and protected quest chests', () => {
  for (const difficulty of ['normal', 'hard'] as const) {
    let state = board({ kind: 'turn', turn: 1 }, difficulty);
    state.map.tiles = Array.from({ length: 6 }, (_, y) => Array.from({ length: 16 }, (_, x) => y === 2 && x > 0 && x < 15 ? 'floor' : 'wall'));
    state.units[0].pos = [14, 2];
    state.objects!.push({ id: 'door', kind: 'door', pos: [5, 2], state: 'closed' },
      { id: 'quest', kind: 'chest', pos: [3, 2], state: 'closed', once: true, loot: { item: 'old_map', count: 1 } },
      { id: 'empty', kind: 'chest', pos: [4, 2], state: 'closed' });
    state.phase = 'enemy';
    const first = nextEnemyAction(state, [thiefOf(state)]);
    assert.equal(first?.act, 'interact');
    assert.ok(first?.act === 'interact' && first.target === 'door');
    state = step(state, first!).state;
    for (let i = 0; i < 4 && !thiefOf(state).carrying; i++) {
      thiefOf(state).acted = false;
      state = step(state, decide(state, thiefOf(state))).state;
    }
    assert.equal(thiefOf(state).carrying?.item, 'silver_sword');
    assert.equal(state.objects!.find(object => object.id === 'quest')?.state, 'closed');
    assert.equal(state.objects!.find(object => object.id === 'empty')?.state, 'closed');
    assert.equal(state.objects!.find(object => object.id === 'door')?.state, 'open');
  }
});

test('scenario validation rejects missing gates, duplicate thief indices and invalid trigger rectangles', () => {
  const adaptation = classicAdaptation('fe8-ch14-eirika');
  const saved = structuredClone(adaptation.thieves);
  try {
    adaptation.thieves.push({ ...saved[0], trigger: { kind: 'area', side: 'self', min: [30, 30], max: [0, 0] } });
    const codes = validateClassicScenario(adaptation.mapId).map(problem => problem.code);
    assert.ok(codes.includes('THIEF_UNIT'));
    assert.ok(codes.includes('TRIGGER_AREA'));
  } finally { adaptation.thieves = saved; }
});
