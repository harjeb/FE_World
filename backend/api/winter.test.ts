import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context, type battleView } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { CLASSES } from '../common/data/classes.ts';
import type { BattleState, BattleEvent, Point } from '../common/engine/types.ts';

type View = ReturnType<typeof battleView>;
type Reachable = { move: number; stops: { pos: Point; path: Point[]; cost: number }[] };

function setup(t: { after: (fn: () => void) => void }, day: number): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'winter');
  seedFullRoster(store, player);
  player.day = day;
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push: () => {} };
}

function start(ctx: Context, op: typeof OP.SORTIE | typeof OP.START_DUNGEON) {
  const { battleId } = dispatch(ctx, op, { region: 1, unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  return ctx.store.battle(ctx.player.id, battleId)!;
}

for (const day of [374, 375]) {
  test(`sortie departing day ${day} freezes its departure season before charging days`, t => {
    const ctx = setup(t, day);
    const battle = start(ctx, OP.SORTIE);
    assert.ok(ctx.player.day >= 375);
    assert.equal(ctx.player.day, day + battle.costDays!);
    assert.equal(battle.state.map.season, day === 374 ? 3 : 4);
    const tiles = battle.state.map.tiles.flat();
    assert.ok(tiles.includes(day === 374 ? 'plain' : 'snow'));
    assert.equal(tiles.includes(day === 374 ? 'snow' : 'plain'), false);
    if (day === 375) {
      assert.equal(tiles.includes('water'), false);
      assert.equal(tiles.includes('shallows'), false);
    }
    dispatch(ctx, OP.GET_STATE, {});
    const view = dispatch(ctx, OP.GET_BATTLE, { battleId: battle.id, full: true }) as View & { state: BattleState };
    assert.equal(view.map.season, day === 374 ? 3 : 4);
    assert.deepEqual(view.state.map, battle.state.map);
  });
}

for (const day of [366, 374, 375]) test(`dungeon departing day ${day} charges each stage before returning its departure-season map`, t => {
  const ctx = setup(t, day);
  const first = start(ctx, OP.START_DUNGEON);
  assert.equal(ctx.player.day, day + 3);
  assert.equal(first.state.map.season, day < 375 ? 3 : 4);
  // Settle the first map through UNIT_ACT without relying on random combat outcomes.
  const leader = first.state.units.find(unit => unit.id === 'u_erin')!;
  for (const enemy of first.state.units.filter(unit => unit.side === 'enemy')) {
    enemy.alive = false;
    enemy.hp = 0;
  }
  if (first.state.goal.kind === 'seize') leader.pos = [...first.state.goal.throne];
  ctx.store.saveBattle(first);
  dispatch(ctx, OP.UNIT_ACT, { battleId: first.id, unitId: leader.id, moveTo: leader.pos,
    action: first.state.goal.kind === 'seize' ? 'seize' : 'wait' });
  assert.equal(ctx.store.activeRun(ctx.player.id)!.state, 'between_maps');
  const next = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(ctx.player.day, day + 6);
  assert.equal(ctx.store.getPlayer(ctx.player.id)!.day, day + 6);
  const second = ctx.store.battle(ctx.player.id, next.battleId)!;
  const season = day + 3 < 375 ? 3 : 4;
  assert.equal(second.state.map.season, season);
  assert.ok(second.state.map.tiles.flat().includes(season === 4 ? 'snow' : 'plain'));
  assert.equal(ctx.store.battle(ctx.player.id, first.id)!.state.map.season, day < 375 ? 3 : 4);
});

function winterBoard(ctx: Context) {
  const battle = start(ctx, OP.SORTIE);
  battle.state.map = { width: 12, height: 3, season: 4,
    tiles: Array.from({ length: 3 }, () => Array(12).fill('snow')) };
  battle.state.map.tiles[0].fill('ice');
  battle.state.goal = { kind: 'rout' };
  battle.state.objects = [];
  const units = battle.state.units;
  const armor = units.find(unit => unit.id === 'u_erin')!;
  const reserve = units.find(unit => unit.id === 'u_victor')!;
  const enemy = units.find(unit => unit.side === 'enemy')!;
  armor.classId = 'general';
  armor.pos = [0, 0];
  reserve.pos = [0, 2];
  enemy.pos = [11, 2];
  battle.state.units = [armor, reserve, enemy];
  battle.initial = structuredClone(battle.state);
  ctx.store.saveBattle(battle);
  return { battle, armor };
}

test('compact/detail battle views and reachable expose snow/ice movement, including flying exemption', t => {
  const ctx = setup(t, 375);
  const { battle, armor } = winterBoard(ctx);
  for (const classId of ['general', 'pegasus'] as const) {
    for (const terrain of ['snow', 'ice'] as const) {
      armor.classId = classId;
      battle.state.map.tiles[0][0] = terrain;
      ctx.store.saveBattle(battle);
      const cls = CLASSES[classId];
      const move = cls.move + (cls.moveType === 'flying' ? 0 : terrain === 'snow' ? -1 : 1);
      for (const detail of [false, true]) {
        const view = dispatch(ctx, OP.GET_BATTLE, { battleId: battle.id, detail }) as View;
        assert.equal(view.map.season, 4);
        const unit = view.units.find(unit => unit.id === armor.id)!;
        assert.deepEqual({ move: unit.move, terrain: unit.terrain, moveType: unit.moveType, armored: unit.armored },
          { move, terrain, moveType: cls.moveType, armored: cls.armored });
      }
      const reachable = dispatch(ctx, OP.GET_REACHABLE, { battleId: battle.id, unitId: armor.id }) as Reachable;
      assert.equal(reachable.move, move);
      assert.ok(reachable.stops.some(stop => stop.pos[0] === move && stop.pos[1] === 0));
      assert.equal(reachable.stops.some(stop => stop.pos[0] === move + 1 && stop.pos[1] === 0), false);
    }
  }
});

test('reachable path matches armored movement; broken ice survives reload, sync and duplicate command', t => {
  const ctx = setup(t, 375);
  const { battle, armor } = winterBoard(ctx);
  const reachable = dispatch(ctx, OP.GET_REACHABLE, { battleId: battle.id, unitId: armor.id }) as Reachable;
  assert.equal(reachable.move, CLASSES.general.move + 1);
  const stop = reachable.stops.find(stop => stop.pos[0] === reachable.move && stop.pos[1] === 0)!;
  assert.ok(stop);
  assert.deepEqual(stop.path, Array.from({ length: reachable.move + 1 }, (_, x) => [x, 0]));
  const command = { battleId: battle.id, unitId: armor.id, moveTo: stop.pos, action: 'wait', commandId: 'cross-ice' };
  const result = dispatch(ctx, OP.UNIT_ACT, command) as { events: BattleEvent[]; state: BattleState };
  assert.deepEqual(result.events.find(event => event.t === 'move'), { t: 'move', unit: armor.id, path: stop.path });
  assert.deepEqual(result.events.filter(event => event.t === 'terrain'),
    stop.path.map(at => ({ t: 'terrain', unit: armor.id, at, terrain: 'water' })));
  const saved = ctx.store.battle(ctx.player.id, battle.id)!;
  assert.deepEqual(saved.state.units.find(unit => unit.id === armor.id)!.pos, stop.pos);
  for (const [x, y] of stop.path) assert.equal(saved.state.map.tiles[y][x], 'water');
  assert.equal(saved.state.map.tiles[0][reachable.move + 1], 'ice');
  assert.equal(saved.initial.map.tiles[0][0], 'ice');

  const reloaded = { ...ctx, store: new Store(ctx.store.db), player: ctx.store.getPlayer(ctx.player.id)! };
  dispatch(reloaded, OP.GET_STATE, {});
  syncPlayer(reloaded.store, reloaded.player);
  const full = dispatch(reloaded, OP.GET_BATTLE, { battleId: battle.id, full: true }) as View & { state: BattleState };
  assert.equal(full.map.season, 4);
  assert.deepEqual(full.state.map, saved.state.map);
  assert.deepEqual(dispatch(reloaded, OP.UNIT_ACT, command), result);
  const replayed = reloaded.store.battle(ctx.player.id, battle.id)!;
  assert.deepEqual(replayed.state, saved.state);
  assert.deepEqual(replayed.events, saved.events);
  assert.deepEqual(replayed.actions, saved.actions);
});
