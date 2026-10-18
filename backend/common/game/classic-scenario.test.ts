import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSIC_MAPS, classicMap } from './classic-catalog.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { validateClassicScenario } from './classic-validation.ts';
import { createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { step } from '../engine/step.ts';
import { moveRange } from '../engine/movement.ts';
import { attackWeapons, canWield, cellKey } from '../engine/units.ts';
import { runHeal } from '../engine/resolve.ts';
import { decide } from '../engine/ai.ts';
import { createEnemy } from './enemies.ts';
import { WEAPONS } from '../data/weapons.ts';
import { runScenarioEvents, scenarioLoot } from '../engine/scenario.ts';
import type { BattleState, Point } from '../engine/types.ts';

const party = () => (['erin', 'victor', 'gustav', 'lina', 'owen', 'noah'] as const)
  .map((character, index) => createUnit(character, 20, `u${index}`, 0));

function classic(id: string, day = 240) {
  return createClassicBattle(party(), { mapId: id, seed: `scenario-${id}`, day });
}

function freeAdjacent(state: BattleState, at: Point): Point | null {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Point[]) {
    const p: Point = [at[0] + dx, at[1] + dy];
    if (p[0] < 0 || p[1] < 0 || p[0] >= state.map.width || p[1] >= state.map.height) continue;
    if (state.map.tiles[p[1]][p[0]] === 'wall' || state.map.tiles[p[1]][p[0]] === 'water') continue;
    if (state.units.some(unit => unit.alive && unit.pos[0] === p[0] && unit.pos[1] === p[1])) continue;
    return p;
  }
  return null;
}

test('all 60 classic maps pass scenario validation including object placement', () => {
  for (const map of CLASSIC_MAPS) {
    assert.deepEqual(validateClassicScenario(map.id), [], map.id);
    const adaptation = classicAdaptation(map.id);
    assert.equal(adaptation.mapId, map.id);
    assert.equal(adaptation.deployment.max, Math.min(8, map.playerSpawns.length));
    if (map.source.pack === 'gba-classics-v1') assert.match(adaptation.sourceSha256 ?? '', /^[0-9a-f]{64}$/);
  }
});

test('classic enemy levels follow the dungeon curve instead of source levels', () => {
  const early = classic('fe6-ch13-main', 0).state.units.filter(unit => unit.side === 'enemy');
  assert.ok(early.every(unit => unit.level <= 5), 'day 0 uses the level-1 curve');
  const day240 = classic('fe6-ch13-main', 240).state.units.filter(unit => unit.side === 'enemy');
  const boss = day240.find(unit => unit.boss)!;
  assert.equal(boss.level, 12); // base 10 + boss 2
  assert.ok(day240.every(unit => unit.level >= 8 && unit.level <= 14));
  const stage2 = createClassicBattle(party(), {
    mapId: 'fe6-ch13-main', seed: 'stage-2', day: 240, stageIndex: 2,
    quest: { id: 'dungeon', region: 2, stageCount: 3 } as never,
  }).state.units.filter(unit => unit.side === 'enemy');
  assert.ok(stage2.every(unit => unit.level >= 12 && unit.level <= 18), 'stage 2 adds +4 levels');
});

test('classic enemies have a mapped class, equipment and boss AI', () => {
  for (const map of CLASSIC_MAPS) {
    const state = classic(map.id).state;
    for (const enemy of state.units.filter(unit => unit.side === 'enemy')) {
      assert.ok(enemy.weapons.length > 0, `${map.id}: ${enemy.classId} 没有武器`);
      assert.ok(enemy.weapons.every(weapon => WEAPONS[weapon] && canWield(enemy, weapon)), `${map.id}: ${enemy.classId} 装备不可用`);
    }
    const boss = state.units.find(unit => unit.side === 'enemy' && unit.boss);
    assert.equal(boss?.behavior, 'hold', `${map.id}: 主将应固守`);
  }
});

test('source ballista and status staves fire as project hazards', () => {
  const ballista = classic('fe6-ch13-main').state;
  ballista.turn = 2;
  ballista.phase = 'player';
  const shot = ballista.scenario!.events.find(event => event.id.startsWith('ballista-'))!;
  const shotAction = shot.actions.find(action => action.kind === 'damage');
  assert.ok(shotAction && shotAction.kind === 'damage');
  const victim = ballista.units.find(unit => unit.side === 'player')!;
  victim.pos = [...shotAction.from!];
  const hp = victim.hp;
  const shotEvents: import('../engine/types.ts').BattleEvent[] = [];
  runScenarioEvents(ballista, shotEvents);
  assert.ok(victim.hp < hp, 'ballista damages a player in range');
  assert.ok(shotEvents.some(event => event.t === 'hazard' && event.source === 'ballista' && event.unit === victim.id));

  const status = classic('fe8-ch13-ephraim').state;
  status.turn = 3;
  status.phase = 'player';
  const statusEvent = status.scenario!.events.find(event => event.id.startsWith('status-'))!;
  const statusAction = statusEvent.actions.find(action => action.kind === 'status');
  assert.ok(statusAction && statusAction.kind === 'status');
  const target = status.units.find(unit => unit.side === 'player')!;
  target.pos = [...statusAction.from!];
  const statusEvents: import('../engine/types.ts').BattleEvent[] = [];
  runScenarioEvents(status, statusEvents);
  if (statusAction.status === 'petrified') assert.equal(target.petrified, true, 'stone staff disables one player phase');
  else if (statusAction.status === 'sleep') assert.equal(target.statuses?.sleep, true, 'sleep staff disables until hit or cured');
  else assert.ok((target.statuses?.[statusAction.status] ?? 0) > 0, `${statusAction.status} staff applies its status`);
  assert.ok(statusEvents.some(event => event.t === 'status' && event.unit === target.id && event.active));
});

test('sleep blocks action and wakes on damage; restore cures statuses', () => {
  const state = classic('fe6-ch13-main').state;
  const player = state.units.find(unit => unit.side === 'player')!;
  player.statuses = { sleep: true };
  assert.throws(() => step(state, { type: 'act', unit: player.id, to: player.pos, act: 'wait' }), /睡眠中/);

  const victim = player;
  victim.statuses = { sleep: true };
  const healer = state.units.filter(unit => unit.side === 'player')[1];
  healer.weapons = ['restore'];
  const healEvents: import('../engine/types.ts').BattleEvent[] = [];
  runHeal(state, healer, victim, 'restore', healEvents);
  assert.equal(victim.statuses, undefined);
  assert.ok(healEvents.some(event => event.t === 'status' && event.unit === victim.id && !event.active));

  const hazard = classic('fe6-ch13-main').state;
  hazard.turn = 2;
  hazard.phase = 'player';
  const ballista = hazard.scenario!.events.find(event => event.id.startsWith('ballista-'))!;
  const damage = ballista.actions.find(action => action.kind === 'damage');
  assert.ok(damage && damage.kind === 'damage');
  const sleeper = hazard.units.find(unit => unit.side === 'player')!;
  sleeper.statuses = { sleep: true };
  sleeper.pos = [...damage.from!];
  runScenarioEvents(hazard, []);
  assert.equal(sleeper.statuses?.sleep, undefined, 'damage wakes a sleeping unit');
});

test('silence blocks spells and staves, berserk turns a unit against allies', () => {
  const state = classic('fe6-ch13-main').state;
  const mage = createEnemy('mage-test', { classId: 'mage', level: 20, pos: [0, 0] });
  mage.weapons = ['fire'];
  mage.ranks.tome = 'S';
  mage.statuses = { silence: 2 };
  assert.deepEqual(attackWeapons(mage), [], 'silenced mage cannot use a tome');
  const fighter = createEnemy('fighter-test', { classId: 'fighter', level: 20, pos: [0, 0] });
  fighter.weapons = ['iron_sword'];
  fighter.ranks.sword = 'S';
  fighter.statuses = { silence: 2 };
  assert.ok(attackWeapons(fighter).includes('iron_sword'), 'silence does not block physical weapons');

  const armed = state.units.filter(unit => unit.side === 'player' && attackWeapons(unit).length > 0);
  const berserk = armed[0];
  const ally = state.units.find(unit => unit.side === 'player' && unit.id !== berserk.id)!;
  for (const unit of state.units) if (unit.id !== berserk.id && unit.id !== ally.id) unit.pos = [state.map.width - 1, state.map.height - 1];
  let pair: Point[] | null = null;
  for (let y = 0; y < state.map.height && !pair; y++) for (let x = 0; x + 1 < state.map.width && !pair; x++) {
    if (!['wall', 'water'].includes(state.map.tiles[y][x]) && !['wall', 'water'].includes(state.map.tiles[y][x + 1])) pair = [[x, y], [x + 1, y]];
  }
  assert.ok(pair, 'map has an adjacent passable pair');
  [berserk.pos, ally.pos] = pair!;
  berserk.statuses = { berserk: 2 };
  const action = decide(state, berserk);
  assert.equal(action.act, 'attack');
  if (action.act === 'attack') assert.equal(state.units.find(unit => unit.id === action.target)?.side, 'player');
  assert.throws(() => step(state, { type: 'act', unit: berserk.id, to: berserk.pos, act: 'wait' }), /混乱中/);
});

test('closed doors block movement; interacting opens them', () => {
  const state = classic('fe8-ch14-ephraim').state;
  const door = state.objects?.find(object => object.kind === 'door' && object.state === 'closed');
  assert.ok(door, 'map has a closed door');
  const spot = freeAdjacent(state, door!.pos);
  assert.ok(spot, 'door has an adjacent free tile');
  const unit = state.units.find(entry => entry.side === 'player')!;
  unit.pos = spot!;
  const blockedKey = cellKey(state, door!.pos);
  assert.ok(!moveRange(state, unit).stops.has(blockedKey), 'closed door is not a stop');
  const result = step(state, { type: 'act', unit: unit.id, to: spot!, act: 'interact', target: door!.id });
  assert.equal(result.state.objects!.find(object => object.id === door!.id)!.state, 'open');
  assert.ok(moveRange(result.state, unit).stops.has(blockedKey), 'open door is walkable');
});

test('chest interaction writes stable loot once and cannot be repeated', () => {
  const state = classic('fe8-ch14-ephraim').state;
  const chest = state.objects?.find(object => object.kind === 'chest' && object.state === 'closed');
  assert.ok(chest?.loot, 'map has a chest with redesigned loot');
  const spot = freeAdjacent(state, chest!.pos);
  assert.ok(spot);
  const unit = state.units.find(entry => entry.side === 'player')!;
  unit.pos = spot!;
  const result = step(state, { type: 'act', unit: unit.id, to: spot!, act: 'interact', target: chest!.id });
  assert.equal(result.state.objects!.find(object => object.id === chest!.id)!.state, 'opened');
  assert.deepEqual(scenarioLoot(result.state), [{ id: `object:${chest!.id}`, item: chest!.loot!.item, count: chest!.loot!.count }]);
  const retry = result.state.units.find(entry => entry.id === unit.id)!;
  retry.acted = false;
  assert.throws(() => step(result.state, { type: 'act', unit: unit.id, to: spot!, act: 'interact', target: chest!.id }), /已经使用/);
});

test('declarative turn events spawn reinforcements once at the first actionable phase', () => {
  const state = classic('fe6-ch13-main').state;
  const spawnEvent = state.scenario?.events.find(event => event.trigger.kind === 'turn' && event.actions.some(action => action.kind === 'spawn'));
  assert.ok(spawnEvent, 'map has a reinforcement event');
  state.turn = spawnEvent!.trigger.kind === 'turn' ? spawnEvent!.trigger.turn : 1;
  state.phase = 'player';
  const before = state.units.length;
  const events: Parameters<typeof runScenarioEvents>[1] = [];
  runScenarioEvents(state, events);
  assert.equal(state.units.length, before + 1, 'one wave unit spawned');
  assert.ok(state.scenario!.fired.includes(spawnEvent!.id));
  runScenarioEvents(state, []);
  assert.equal(state.units.length, before + 1, 'event does not repeat');
});

test('switch events apply a declarative map change', () => {
  const state = classic('fe6-ch13-main').state;
  const switchObject = state.objects?.find(object => object.kind === 'switch');
  assert.ok(switchObject, 'map has a switch');
  const change = state.scenario?.mapChanges.find(entry => entry.id === switchObject!.change);
  assert.ok(change, 'switch points at a map change');
  const before = structuredClone(state.map.tiles);
  const spot = freeAdjacent(state, switchObject!.pos);
  assert.ok(spot);
  const unit = state.units.find(entry => entry.side === 'player')!;
  unit.pos = spot!;
  state.turn = 3;
  const result = step(state, { type: 'act', unit: unit.id, to: spot!, act: 'interact', target: switchObject!.id });
  assert.equal(result.state.objects!.find(object => object.id === switchObject!.id)!.state, 'triggered');
  assert.notDeepEqual(result.state.map.tiles, before);
});

test('replaying the same opening actions produces the same board', () => {
  const battle = classic('fe6-ch13-main');
  const a = step(structuredClone(battle.initial), { type: 'endPhase' });
  const b = step(structuredClone(battle.initial), { type: 'endPhase' });
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.events, b.events);
});

test('scenario loot de-duplicates by stable id', () => {
  const state = classic('fe8-ch14-ephraim').state;
  state.loot = [
    { id: 'object:chest-1', item: 'fire', count: 1 },
    { id: 'object:chest-1', item: 'fire', count: 1 },
    { id: 'object:chest-2', item: 'vulnerary', count: 2 },
  ];
  assert.equal(scenarioLoot(state).length, 2);
});
