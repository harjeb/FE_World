import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { RANKS } from '../common/data/types.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import type { WeaponId } from '../common/data/weapons.ts';
import { purchasableRank } from '../common/game/quest-shop.ts';
import type { BattleState } from '../common/engine/types.ts';
import { interactObject } from '../common/engine/scenario.ts';

function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'hidden-content');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1];
  player.flags.regionReputation = { 3: 250 };
  store.savePlayer(player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push() {} };
}

test('the old map is a warehouse-only key item that cannot be sold', t => {
  const ctx = setup(t);
  ctx.store.addInventory(ctx.player.id, 'old_map', 0, 1);
  assert.throws(() => dispatch(ctx, OP.SELL, { item: 'old_map', count: 1 }), /任务物品不能出售/);
  assert.throws(() => dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'old_map', action: 'toUnit' }), /不能带进战斗/);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'old_map'), 1);
});

test('the FE7 dungeon freezes secret loot from the purchasable rank and keeps it out of the public state', t => {
  const ctx = setup(t);
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'clx-fe7', unitIds: ['u_erin'] }) as { battleId: string; state?: BattleState };
  const record = ctx.store.battle(ctx.player.id, started.battleId)!;
  const base = purchasableRank(ctx.player.flags.unlockedRegions!, ctx.player.flags.regionReputation!);
  const expected = RANKS[RANKS.indexOf(base) + 1];
  const secrets = record.state.objects!.filter(object => object.id.startsWith('secret-chest-'));
  assert.equal(secrets.length, 3);
  for (const chest of secrets) assert.equal(WEAPONS[chest.loot!.item as WeaponId].rank, expected);

  const view = dispatch(ctx, OP.GET_BATTLE, { battleId: started.battleId, full: true }) as { state: BattleState };
  assert.ok(view.state.objects!.some(object => object.id === 'secret-trigger'), 'the trigger chest is visible');
  assert.ok(!view.state.objects!.some(object => object.state === 'hidden'), 'hidden chests are not sent');
  assert.ok(!view.state.scenario?.events.some(event => event.id === 'secret-room-open'), 'nor is the event that reveals them');
  assert.ok(!view.state.scenario?.mapChanges.some(change => change.id === 'secret-room'));
});

function win(ctx: Context, battleId: string, before?: (state: BattleState) => void) {
  const record = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = record.state.units.find(unit => unit.side === 'player')!;
  before?.(record.state);
  for (const enemy of record.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (record.state.goal.kind === 'seize') leader.pos = [...record.state.goal.throne];
  ctx.store.saveBattle(record);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: leader.id, moveTo: leader.pos, action: record.state.goal.kind === 'seize' ? 'seize' : 'wait' });
}

test('the old map is claimed once, only when the FE6 route is fully cleared', t => {
  const ctx = setup(t);
  const start = () => dispatch(ctx, OP.START_QUEST, { questId: 'clx-fe6', unitIds: ['u_erin'] }) as { battleId: string; run: { id: string } };
  const first = start();
  win(ctx, first.battleId, state => {
    const leader = state.units.find(unit => unit.side === 'player')!;
    leader.pos = [...state.objects!.find(object => object.id === 'chest-object-4')!.pos];
    interactObject(state, leader, 'chest-object-4', []);
  });
  assert.deepEqual(ctx.store.run(ctx.player.id, first.run.id)!.pendingClaims, ['fe6-ch22-main:chest-object-4']);
  assert.deepEqual(ctx.player.flags.secretsClaimed ?? [], [], 'mid-run claims are not banked yet');
  assert.equal(ctx.store.countInventory(ctx.player.id, 'old_map'), 0);
  for (let i = 0; i < 4 && ctx.store.activeRun(ctx.player.id); i++) {
    win(ctx, (dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string }).battleId);
  }
  assert.equal(ctx.store.run(ctx.player.id, first.run.id)!.state, 'completed');
  assert.equal(ctx.store.countInventory(ctx.player.id, 'old_map'), 1);
  assert.deepEqual(ctx.player.flags.secretsClaimed, ['fe6-ch22-main:chest-object-4']);

  const again = start();
  const replay = ctx.store.battle(ctx.player.id, again.battleId)!;
  assert.ok(!replay.state.objects!.some(object => object.id === 'chest-object-4'), 'a replay cannot farm the hidden chest');
});
