import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { decide } from '../common/engine/index.ts';
import { stats } from '../common/data/types.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'dungeon', undefined, '测试军团');
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

// Plays a specific battle to the end through the real op handlers with the rule AI.
function playOut(ctx: Context, battleId: string): string {
  for (let guard = 0; guard < 2000; guard++) {
    const battle = ctx.store.battle(ctx.player.id, battleId);
    if (!battle || battle.state.result) return battle?.state.result?.winner ?? 'none';
    const unit = battle.state.units.find(u => u.side === 'player' && u.alive && !u.acted);
    if (unit) {
      const action = decide(battle.state, unit);
      dispatch(ctx, OP.UNIT_ACT, {
        battleId: battle.id, unitId: unit.id, moveTo: action.to, action: action.act,
        targetId: 'target' in action ? action.target : undefined,
        weapon: 'weapon' in action ? action.weapon : undefined,
        item: 'item' in action ? action.item : undefined,
      });
    } else {
      dispatch(ctx, OP.END_PHASE, { battleId: battle.id });
    }
  }
  throw new Error('battle did not finish');
}

function empower(store: Store, player: Player, ids: string[]): void {
  for (const id of ids) {
    const unit = store.unit(player.id, id)!;
    unit.level = 99;
    unit.stats = stats(150, 99, 99, 99, 99, 99, 99, 99);
    unit.hp = 150;
    store.saveUnit(unit, player.id);
  }
}

test('a three-map dungeon locks the roster, carries state and clears the region only at the boss', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];
  empower(store, player, ids);
  const day = player.day;
  const started = dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ids }) as { run: { id: string; stageIndex: number; state: string }; battleId: string };
  assert.equal(started.run.stageIndex, 0);
  assert.equal(started.run.state, 'battle');
  assert.equal(player.day, day + 8, 'the first map is paid up front');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId, started.run.id);
  assert.equal(playOut(ctx, started.battleId), 'player');
  let run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number; survivingIds: string[] } }).run;
  assert.equal(run.state, 'between_maps');
  assert.equal(run.stageIndex, 1);
  assert.ok(run.survivingIds.length > 0);
  // 第二张图
  const second = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 16);
  assert.equal(playOut(ctx, second.battleId), 'player');
  run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number } }).run;
  assert.equal(run.stageIndex, 2);
  // 第三张图（首领）：完整通关才写地区首通与掉落。
  const seeds = store.countInventory(player.id, 'seed');
  const third = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 24);
  assert.equal(playOut(ctx, third.battleId), 'player');
  run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number } }).run;
  assert.equal(run.state, 'completed');
  assert.ok(player.flags.clearedRegions.includes(1));
  assert.ok(player.flags.firstClearLevel?.[1] !== undefined);
  assert.ok(store.countInventory(player.id, 'seed') > seeds, 'completion brings the pending loot home');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId ?? null, null, 'locks are released on completion');
});

test('withdrawing forfeits pending loot but keeps deaths and consumption', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];
  empower(store, player, ids);
  const first = dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: ids }) as { battleId: string };
  assert.equal(playOut(ctx, first.battleId), 'player');
  const seeds = store.countInventory(player.id, 'seed');
  const run = (dispatch(ctx, OP.WITHDRAW_RUN, {}) as { run: { state: string } }).run;
  assert.equal(run.state, 'withdrawn');
  assert.equal(store.countInventory(player.id, 'seed'), seeds, 'pending loot is not paid out');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId ?? null, null);
});

test('a cleared region replays at its first-clear level instead of the current formula', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // Pretend region 3 was first cleared at level 20.
  player.flags.clearedRegions = [1, 2, 3];
  player.flags.firstClearLevel = { 3: 20 };
  store.savePlayer(player);
  const sortie = dispatch(ctx, OP.SORTIE, { region: 3, unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  const battle = store.battle(player.id, sortie.battleId)!;
  const enemy = battle.state.units.find(u => u.side === 'enemy')!;
  assert.equal(enemy.level, 20, 'replay keeps the locked level');
});

test('a second dungeon cannot start while one is active', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah']);
  dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: ['u_gustav'] }), /进行中的战斗|进行中的远征/);
});
