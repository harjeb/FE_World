import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { stats } from '../common/data/types.ts';
import { fieldEncounter } from '../common/game/encounters.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'dungeon', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

// 流程验收不以随机地图的 AI 寻路胜负为条件：先清空敌军，再由真实 op 结算胜负。
function forceClear(ctx: Context, battleId: string): string {
  const battle = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = battle.state.units.find(unit => unit.side === 'player' && unit.alive && !unit.npc)!;
  for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
  battle.initial = structuredClone(battle.state);
  ctx.store.saveBattle(battle);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: leader.id, moveTo: leader.pos, action: battle.state.goal.kind === 'seize' ? 'seize' : 'wait' });
  return ctx.store.battle(ctx.player.id, battleId)!.state.result?.winner ?? 'none';
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

test('a three-map dungeon locks the roster, carries state and clears the region only after the finale', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'].slice(0, fieldEncounter(player.id, player.day, 1, 'normal', 'dungeon').maxUnits);
  empower(store, player, ids);
  const day = player.day;
  const started = dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ids }) as { run: { id: string; stageIndex: number; state: string }; battleId: string };
  assert.equal(started.run.stageIndex, 0);
  assert.equal(started.run.state, 'battle');
  assert.equal(player.day, day + 3, 'the first map is paid up front');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId, started.run.id);
  assert.equal(forceClear(ctx, started.battleId), 'player');
  assert.equal(player.flags.regionExploration?.[1] ?? 0, 0, '副本首图不加探索');
  let run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number; survivingIds: string[] } }).run;
  assert.equal(run.state, 'between_maps');
  assert.equal(run.stageIndex, 1);
  assert.ok(run.survivingIds.length > 0);
  // 第二张图
  const second = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 6);
  assert.equal(forceClear(ctx, second.battleId), 'player');
  assert.equal(player.flags.regionExploration?.[1] ?? 0, 0, '副本中间图不加探索');
  run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number } }).run;
  assert.equal(run.stageIndex, 2);
  // 第三张经典压轴：准备一手可胜的棋盘，结算测试不依赖随机经典图的 AI 寻路。
  const seeds = store.countInventory(player.id, 'seed');
  const third = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 8);
  assert.equal(forceClear(ctx, third.battleId), 'player');
  run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number } }).run;
  assert.equal(run.state, 'completed');
  assert.equal(player.flags.regionExploration?.[1], 20, '首次完整通关才加二十');
  assert.ok(player.flags.clearedRegions.includes(1));
  assert.ok(player.flags.firstClearLevel?.[1] !== undefined);
  assert.ok(store.countInventory(player.id, 'seed') > seeds, 'completion brings the pending loot home');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId ?? null, null, 'locks are released on completion');
});

test('withdrawing forfeits pending loot but keeps deaths and consumption', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor'];
  const first = dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: ids }) as { battleId: string };
  // A settled first map with one casualty and one consumed charge; random AI wins are covered above.
  const battle = store.battle(player.id, first.battleId)!;
  const leader = battle.state.units.find(unit => unit.id === ids[0])!;
  const fallen = battle.state.units.find(unit => unit.id === ids[1])!;
  leader.items = [{ id: 'vulnerary', uses: 2 }];
  fallen.alive = false;
  fallen.hp = 0;
  for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
  store.saveBattle(battle);
  dispatch(ctx, OP.UNIT_ACT, { battleId: battle.id, unitId: leader.id, moveTo: leader.pos,
    action: battle.state.goal.kind === 'seize' ? 'seize' : 'wait' });
  const pending = store.activeRun(player.id)!;
  assert.equal(pending.state, 'between_maps');
  assert.ok(pending.pendingLoot.some(drop => drop.item === 'seed' && drop.count > 0));
  const seeds = store.countInventory(player.id, 'seed');
  const run = (dispatch(ctx, OP.WITHDRAW_RUN, {}) as { run: { state: string } }).run;
  assert.equal(run.state, 'withdrawn');
  assert.equal(store.countInventory(player.id, 'seed'), seeds, 'pending loot is not paid out');
  assert.equal(player.flags.regionExploration?.[2] ?? 0, 0, '中途撤离不加探索');
  assert.equal(store.unit(player.id, ids[1])!.status, 'dead', 'withdrawal does not resurrect casualties');
  assert.deepEqual(store.unit(player.id, ids[0])!.items, [{ id: 'vulnerary', uses: 2 }], 'withdrawal does not restore charges');
  for (const id of ids) assert.equal(store.unit(player.id, id)!.lockedRunId ?? null, null);
});

test('dungeon exploration is first-clear only per region, independent of field clears and failed attempts', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  player.flags.clearedRegions = [1];
  player.flags.regionExploration = { 1: 3 };
  store.savePlayer(player);
  const ids = ['u_erin', 'u_victor'];
  dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ids });
  dispatch(ctx, OP.RETREAT, {});
  assert.equal(ctx.player.flags.regionExploration![1], 3, '失败不发探索，也不消耗首通');
  for (const [region, expected] of [[1, 23], [1, 23], [2, 20]]) {
    let started = dispatch(ctx, OP.START_DUNGEON, { region, unitIds: ids }) as { battleId: string };
    const before = ctx.player.flags.regionExploration![region] ?? 0;
    for (let stage = 0; stage < 3; stage++) {
      const battle = store.battle(ctx.player.id, started.battleId)!;
      const leader = battle.state.units.find(unit => unit.side === 'player')!;
      for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
      if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
      battle.initial = structuredClone(battle.state);
      store.saveBattle(battle);
      const command = { battleId: battle.id, unitId: leader.id, moveTo: leader.pos,
        action: battle.state.goal.kind === 'seize' ? 'seize' : 'wait', commandId: `win-${battle.id}` };
      dispatch(ctx, OP.UNIT_ACT, command);
      dispatch(ctx, OP.UNIT_ACT, command);
      assert.equal(store.battle(ctx.player.id, battle.id)!.state.result?.winner, 'player');
      assert.equal(ctx.player.flags.regionExploration![region] ?? 0, stage === 2 ? expected : before,
        '仅首次整本结算二十，重复通关和重复命令不再增加');
      if (stage < 2) started = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
    }
    ctx.player = store.getPlayer(ctx.player.id)!;
    assert.equal(ctx.player.flags.regionExploration![region], expected, '重读后仍认得首通');
  }
});

test('a cleared region uses departure date rather than its historical first-clear level', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // Pretend region 3 was first cleared at level 20.
  player.flags.clearedRegions = [1, 2, 3];
  player.flags.firstClearLevel = { 3: 20 };
  player.day = 240;
  store.savePlayer(player);
  const preview = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: { id: number; level: number }[] };
  const sortie = dispatch(ctx, OP.SORTIE, { region: 3, unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  const battle = store.battle(player.id, sortie.battleId)!;
  const enemy = battle.state.units.find(u => u.side === 'enemy')!;
  assert.equal(enemy.level, 11, 'day 240 base 10 plus region offset 1');
  assert.equal(preview.sortieRegions.find(r => r.id === 3)!.level, enemy.level);
});

test('a second dungeon cannot start while one is active', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah']);
  dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: ['u_gustav'] }), /进行中的战斗|进行中的远征/);
});
