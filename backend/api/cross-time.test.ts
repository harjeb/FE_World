import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { applyBattleOutcome } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { CROSS_TIME_QUEST_ID, CROSS_TIME_SHARD, CROSS_TIME_ROSTER } from '../common/game/cross-time.ts';

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'cross-time', undefined, '时空军团');
  seedFullRoster(store, player);
  player.day = 1000;
  player.flags.setupCompleted = true;
  player.flags.unlockedRegions = [2, 3];
  store.savePlayer(player);
  return { store, accountId, player, agentModel: null, push: () => {} };
}
function start(ctx: Context, extra = {}) {
  return dispatch(ctx, OP.START_QUEST, { questId: CROSS_TIME_QUEST_ID, region: 2, unitIds: ['u_erin'], ...extra }) as { battleId: string };
}
function finish(ctx: Context, battleId: string, won = true, bossDead = true) {
  const battle = ctx.store.battle(ctx.player.id, battleId)!;
  battle.state.result = { winner: won ? 'player' : 'enemy', reason: 'test' };
  for (const unit of battle.state.units) if (unit.side === 'enemy' && unit.boss) { unit.alive = !bossDead; unit.hp = bossDead ? 0 : unit.hp; }
  ctx.store.saveBattle(battle);
  return { battle, rewards: applyBattleOutcome(ctx.store, ctx.player, battle) };
}

test('cross-time acceptance is global, validates before payment, fixed levels and retried starts cost eight days once', () => {
  const ctx = setup();
  ctx.player.day = 999;
  assert.throws(() => start(ctx));
  assert.equal(ctx.player.flags.crossTime, undefined);
  ctx.player.day = 1000;
  ctx.store.savePlayer(ctx.player);
  assert.throws(() => start(ctx, { region: 12 }));
  assert.throws(() => start(ctx, { unitIds: ['u_erin', 'u_erin'] }));
  assert.throws(() => start(ctx, { aiDifficulty: 'hard' }));
  const a = start(ctx, { commandId: 'start' });
  assert.deepEqual(start(ctx, { commandId: 'start' }), JSON.parse(JSON.stringify(a)));
  assert.equal(ctx.player.day, 1008);
  assert.equal(ctx.player.flags.crossTime?.acceptedRegion, 2);
  const battle = ctx.store.battle(ctx.player.id, a.battleId)!;
  assert.equal(battle.state.units.filter(u => u.side === 'enemy').length, 17);
  assert.ok(battle.state.units.filter(u => u.side === 'enemy').every(u => u.level === 48));
  finish(ctx, a.battleId, false);
  assert.throws(() => start(ctx, { region: 3 }));
  start(ctx);
  assert.equal(ctx.player.day, 1016);
});

test('first/repeat normal and hard rewards are isolated from region rewards and settlement is idempotent', () => {
  const ctx = setup();
  const beforeGold = ctx.player.gold;
  const beforeFlags = structuredClone(ctx.player.flags);
  const first = finish(ctx, start(ctx).battleId);
  assert.equal(first.rewards.gold, 2500);
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 3);
  assert.equal(ctx.player.gold, beforeGold + 2500);
  assert.deepEqual(ctx.player.flags.clearedRegions, beforeFlags.clearedRegions);
  assert.deepEqual(ctx.player.flags.regionExploration, beforeFlags.regionExploration);
  assert.deepEqual(ctx.player.flags.regionReputation, beforeFlags.regionReputation);
  assert.deepEqual(applyBattleOutcome(ctx.store, ctx.player, ctx.store.battle(ctx.player.id, first.battle.id)!), first.rewards);
  assert.equal(ctx.player.gold, beforeGold + 2500);
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: CROSS_TIME_QUEST_ID }));
  assert.equal(finish(ctx, start(ctx).battleId).rewards.gold, 800);
  const hard = start(ctx, { aiDifficulty: 'hard' });
  assert.ok(ctx.store.battle(ctx.player.id, hard.battleId)!.state.units.filter(u => u.side === 'enemy').every(u => u.level === 52));
  assert.equal(finish(ctx, hard.battleId).rewards.gold, 3500);
  assert.equal(finish(ctx, start(ctx, { aiDifficulty: 'hard' }).battleId).rewards.gold, 1500);
});

test('failure or player victory with live boss gives no rewards or unlock', () => {
  for (const [won, dead] of [[false, true], [true, false]]) {
    const ctx = setup();
    const { rewards } = finish(ctx, start(ctx).battleId, won, dead);
    assert.equal(rewards.gold, 0);
    assert.deepEqual(rewards.items, []);
    assert.equal(ctx.player.flags.crossTime?.clearedNormal, undefined);
  }
});

test('failed runs preserve combat growth, equipment consumption and permanent death', () => {
  const ctx = setup();
  const { battleId } = start(ctx, { unitIds: ['u_victor'] });
  const battle = ctx.store.battle(ctx.player.id, battleId)!;
  const unit = battle.state.units.find(u => u.id === 'u_victor')!;
  unit.level += 1;
  unit.exp = 17;
  unit.stats.str += 1;
  unit.alive = false;
  unit.hp = 0;
  unit.items = [];
  if (unit.weaponInstances?.[0]) unit.weaponInstances[0].durability = 1;
  ctx.store.saveBattle(battle);
  const result = finish(ctx, battleId, false);
  const saved = ctx.store.unit(ctx.player.id, 'u_victor')!;
  assert.equal(saved.status, 'dead');
  assert.equal(saved.level, unit.level);
  assert.equal(saved.exp, 17);
  assert.equal(saved.stats.str, unit.stats.str);
  assert.deepEqual(result.rewards.deaths, ['u_victor']);
  assert.equal(result.rewards.gold, 0);
});

test('quest listing is global, fixed and normal completion alone unlocks exchange', () => {
  const ctx = setup();
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as any;
  assert.equal(view.crossTime.acceptedRegion, null);
  assert.deepEqual(view.crossTime.availableRegions, [2, 3]);
  assert.deepEqual(view.crossTime.enemyLevels, { normal: 48, hard: 52 });
  assert.equal(view.crossTime.enemyPreview.hard.length, 17);
  assert.equal(view.regions.flatMap((r: any) => r.quests).filter((q: any) => q.id === CROSS_TIME_QUEST_ID).length, 0);
  const started = start(ctx);
  assert.throws(() => dispatch(ctx, OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: CROSS_TIME_ROSTER[0].id, commandId: 'busy' }));
  assert.deepEqual((dispatch(ctx, OP.GET_QUESTS, {}) as any).crossTime.availableRegions, [2]);
  finish(ctx, started.battleId);
  assert.equal((dispatch(ctx, OP.GET_CROSS_TIME_RECRUITS, {}) as any).unlocked, true);
  start(ctx);
  assert.equal((dispatch(ctx, OP.GET_CROSS_TIME_RECRUITS, {}) as any).busy, true);
  assert.throws(() => dispatch(ctx, OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: CROSS_TIME_ROSTER[0].id, commandId: 'unlocked-busy' }));
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 3);
  const other = loginOrRegister(ctx.store, 'other-cross-account', undefined, '其他军团');
  const otherCtx = { ...ctx, accountId: other.accountId, player: other.player };
  assert.equal((dispatch(otherCtx, OP.GET_CROSS_TIME_RECRUITS, {}) as any).unlocked, false);
});

test('opened chests bank only with a valid boss victory; no enemy equipment drops', () => {
  for (const won of [false, true]) {
    const ctx = setup();
    const { battleId } = start(ctx);
    const battle = ctx.store.battle(ctx.player.id, battleId)!;
    battle.state.loot = [{ id: 'object:left-chest', item: 'silver_axe', count: 1 }];
    ctx.store.saveBattle(battle);
    const before = ctx.store.countInventory(ctx.player.id, 'silver_axe');
    const result = finish(ctx, battleId, won);
    assert.equal(ctx.store.countInventory(ctx.player.id, 'silver_axe'), before + (won ? 1 : 0));
    assert.equal(result.rewards.items.filter(row => row.item === 'silver_axe').length, won ? 1 : 0);
  }
});

test('exchange checks unlock, identity, shards and permanent ledger; command retries never debit twice', () => {
  const ctx = setup();
  const identityId = CROSS_TIME_ROSTER[0].id;
  const exchange = (commandId: string, id = identityId) => dispatch(ctx, OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: id, commandId }) as { unitId: string };
  ctx.store.addInventory(ctx.player.id, CROSS_TIME_SHARD, 0, 9);
  assert.throws(() => exchange('locked'));
  ctx.player.flags.crossTime = { clearedNormal: true };
  ctx.store.savePlayer(ctx.player);
  assert.throws(() => exchange('unknown', '__proto__'));
  const result = exchange('one');
  assert.deepEqual(exchange('one'), JSON.parse(JSON.stringify(result)));
  assert.throws(() => exchange('one', CROSS_TIME_ROSTER[1].id), /commandId/);
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 6);
  assert.throws(() => exchange('duplicate'));
  const unit = ctx.store.unit(ctx.player.id, result.unitId)!;
  unit.status = 'dead';
  ctx.store.saveUnit(unit, ctx.player.id);
  assert.throws(() => exchange('after-death'));
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 6);
});
