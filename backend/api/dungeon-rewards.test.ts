import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { dungeonFirstClearReward, syncPlayer } from './services.ts';
import { createRun, dungeonFirstClearLoot } from '../common/game/expedition.ts';
import { GAME_ITEMS, isBoundWeapon } from '../common/game/items.ts';
import { ALL_QUESTS } from '../common/game/quests.ts';
import { OP } from '../common/protocol/ops.ts';
import type { RunRecord } from '../common/game/expedition.ts';

const questIds = ['gw6', 'clx-fe1'];
function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'first-rewards');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1, 2];
  player.flags.unlockedRegions = Array.from({ length: 12 }, (_, i) => i + 1);
  player.flags.questsDone = ALL_QUESTS.filter(q => !questIds.includes(q.id)).map(q => q.id);
  player.flags.regionReputation = { 2: 9999 };
  store.savePlayer(player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push() {} };
}
function counts(ctx: Context, difficulty: 'normal' | 'hard' = 'normal') {
  const inventory = ctx.store.inventory(ctx.player.id);
  return dungeonFirstClearLoot(2, difficulty).map(({ item }) => inventory.filter(row => row.item === item).reduce((n, row) => n + row.count, 0));
}
function start(ctx: Context, questId?: string, aiDifficulty = 'normal') {
  return dispatch(ctx, questId ? OP.START_QUEST : OP.START_DUNGEON,
    { ...(questId ? { questId } : { region: 2 }), unitIds: ['u_erin'], aiDifficulty }) as { battleId: string; run: RunRecord };
}
function win(ctx: Context, battleId: string) {
  const b = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = b.state.units.find(u => u.side === 'player')!;
  for (const enemy of b.state.units.filter(u => u.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (b.state.goal.kind === 'seize') leader.pos = [...b.state.goal.throne];
  ctx.store.saveBattle(b);
  const command = { battleId, unitId: leader.id, moveTo: leader.pos,
    action: b.state.goal.kind === 'seize' ? 'seize' : 'wait', commandId: `win-${battleId}` };
  const result = dispatch(ctx, OP.UNIT_ACT, command);
  const inventory = ctx.store.inventory(ctx.player.id);
  assert.deepEqual(dispatch(ctx, OP.UNIT_ACT, command), JSON.parse(JSON.stringify(result)));
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory, 'retrying the settlement cannot pay twice');
}
function complete(ctx: Context, first: { battleId: string; run: RunRecord }) {
  win(ctx, first.battleId);
  for (let i = 0; i < 6 && ctx.store.activeRun(ctx.player.id); i++) {
    const next = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
    win(ctx, next.battleId);
  }
  const run = ctx.store.run(ctx.player.id, first.run.id)!;
  assert.equal(run.state, 'completed');
  return run;
}

test('all regional bundles contain usable equipment and items; preview reads never grant them', t => {
  const ctx = setup(t);
  const before = ctx.store.inventory(ctx.player.id);
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: { id: number; dungeonFirstClearRewards: Record<'normal' | 'hard', ReturnType<typeof dungeonFirstClearReward>> }[] };
  for (const row of today.sortieRegions) {
    const loot = dungeonFirstClearLoot(row.id);
    assert.deepEqual(row.dungeonFirstClearRewards.normal, { items: loot, available: true });
    assert.deepEqual(row.dungeonFirstClearRewards.hard, { items: dungeonFirstClearLoot(row.id, 'hard'), available: true });
    assert.equal(GAME_ITEMS[loot[0].item].kind, 'weapon');
    assert.equal(isBoundWeapon(loot[0].item), false, 'existing unique quest/tower gear must stay exclusive');
    assert.equal(loot.filter(drop => GAME_ITEMS[drop.item].kind !== 'weapon').length, 2);
    for (const drop of loot) assert.ok(GAME_ITEMS[drop.item] && drop.count > 0);
  }
  for (let region = 1; region <= 12; region++) {
    const normal = dungeonFirstClearLoot(region);
    const hard = dungeonFirstClearLoot(region, 'hard');
    assert.notEqual(hard[0].item, normal[0].item);
    assert.equal(GAME_ITEMS[hard[0].item].kind, 'weapon');
    assert.equal(isBoundWeapon(hard[0].item), false);
    for (const drop of hard) assert.ok(GAME_ITEMS[drop.item] && drop.count > 0);
    assert.ok(hard[1].count > normal[1].count && hard[2].count > normal[2].count);
  }
  const quests = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; firstClearRewards: Record<'normal' | 'hard', unknown> | null }[] }[] };
  const rows = quests.regions.flatMap(r => r.quests);
  assert.equal(rows.find(q => q.id === 'gw1')!.firstClearRewards, null, 'single-map quests keep their existing reward flow');
  for (const id of questIds) {
    assert.deepEqual(rows.find(q => q.id === id)!.firstClearRewards?.normal, { items: dungeonFirstClearLoot(2), available: true });
    assert.deepEqual(rows.find(q => q.id === id)!.firstClearRewards?.hard, { items: dungeonFirstClearLoot(2, 'hard'), available: true });
  }
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before);
});

for (const questId of [undefined, ...questIds]) {
  test(`${questId ?? 'random region dungeon'} grants each difficulty bundle once across reload and command replay`, t => {
    const ctx = setup(t);
    const before = counts(ctx);
    const run = complete(ctx, start(ctx, questId));
    const loot = dungeonFirstClearLoot(2);
    assert.deepEqual(counts(ctx), before.map((n, i) => n + loot[i].count));
    for (const drop of loot) assert.deepEqual(run.pendingLoot.filter(row => row.item === drop.item), [drop]);
    assert.equal(ctx.store.inventory(ctx.player.id).find(row => row.item === 'vulnerary' && row.uses === 3)!.count, before[1] + 2);
    assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, questId).available, false);
    const reloaded = { ...ctx, store: new Store(ctx.store.db), player: ctx.store.getPlayer(ctx.player.id)! };
    const exploration = { ...reloaded.player.flags.regionExploration };
    assert.equal(dungeonFirstClearReward(reloaded.store, reloaded.player, 2, questId, 'hard').available, true);
    const hardBefore = counts(reloaded, 'hard');
    const hardLoot = dungeonFirstClearLoot(2, 'hard');
    const hardRun = complete(reloaded, start(reloaded, questId, 'hard'));
    assert.deepEqual(counts(reloaded, 'hard'), hardBefore.map((n, i) => n + hardLoot[i].count));
    for (const drop of hardLoot) assert.deepEqual(hardRun.pendingLoot.filter(row => row.item === drop.item), [drop]);
    assert.equal(dungeonFirstClearReward(reloaded.store, reloaded.player, 2, questId, 'hard').available, false);
    const paidNormal = counts(reloaded);
    const paidHard = counts(reloaded, 'hard');
    for (const difficulty of ['normal', 'hard']) complete(reloaded, start(reloaded, questId, difficulty));
    assert.deepEqual(counts(reloaded), paidNormal);
    assert.deepEqual(counts(reloaded, 'hard'), paidHard);
    assert.deepEqual(reloaded.player.flags.regionExploration, exploration, 'hard and repeat clears never duplicate exploration');
    if (questId) {
      const quest = ALL_QUESTS.find(q => q.id === questId)!;
      const claimed = dispatch(reloaded, OP.CLAIM_QUEST_REWARD, { questId }) as { items: [string, number][] };
      assert.deepEqual(claimed.items, quest.reward.items ?? [], 'existing manually claimed quest rewards stay separate');
      const inventory = ctx.store.inventory(ctx.player.id);
      assert.throws(() => dispatch(reloaded, OP.CLAIM_QUEST_REWARD, { questId }));
      assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
    }
  });
}

for (const difficulty of ['normal', 'hard'] as const) test(`${difficulty}: partial victory, withdrawal and defeat do not grant first-clear loot or consume eligibility`, t => {
  const ctx = setup(t);
  ctx.player.flags.hardUnlocks = { regions: [], dungeons: [2], quests: [] };
  ctx.store.savePlayer(ctx.player);
  const before = counts(ctx, difficulty);
  const first = start(ctx, undefined, difficulty);
  win(ctx, first.battleId);
  assert.deepEqual(counts(ctx, difficulty), before);
  assert.ok(ctx.store.activeRun(ctx.player.id)!.pendingLoot.every(drop => !dungeonFirstClearLoot(2, difficulty).some(first => first.item === drop.item)));
  dispatch(ctx, OP.WITHDRAW_RUN, {});
  assert.deepEqual(counts(ctx, difficulty), before);
  start(ctx, undefined, difficulty);
  dispatch(ctx, OP.RETREAT, {});
  assert.deepEqual(counts(ctx, difficulty), before);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, undefined, difficulty).available, true);
  complete(ctx, start(ctx, undefined, difficulty));
  assert.deepEqual(counts(ctx, difficulty), before.map((n, i) => n + dungeonFirstClearLoot(2, difficulty)[i].count));
});

test('first-clear keys are separate per dungeon and legacy completion prevents replay payouts', t => {
  const ctx = setup(t);
  const legacy = createRun('legacy-run', ctx.player.id, 2, ['u_erin'], 1, 1);
  legacy.state = 'completed'; delete legacy.aiDifficulty;
  ctx.store.saveRun(legacy);
  ctx.player.flags.questsDone!.push('gw6');
  ctx.player.flags.hardUnlocks = { regions: [], dungeons: [2], quests: ['gw6'] };
  ctx.store.savePlayer(ctx.player);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2).available, false);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, 'gw6').available, false);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, 'clx-fe1').available, true);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 3).available, true);
  assert.equal(ctx.store.hasCompletedRun(ctx.player.id, 2), true);
  assert.equal(ctx.store.hasCompletedRun(ctx.player.id, 2, undefined, 'normal'), true);
  assert.equal(ctx.store.hasCompletedRun(ctx.player.id, 2, undefined, 'hard'), false);
  for (const questId of [undefined, 'gw6']) {
    assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, questId, 'hard').available, true);
    const exploration = { ...ctx.player.flags.regionExploration };
    const hardBefore = counts(ctx, 'hard');
    complete(ctx, start(ctx, questId, 'hard'));
    assert.deepEqual(counts(ctx, 'hard'), hardBefore.map((n, i) => n + dungeonFirstClearLoot(2, 'hard')[i].count));
    assert.deepEqual(ctx.player.flags.regionExploration, exploration);
  }
  const before = counts(ctx);
  complete(ctx, start(ctx));
  complete(ctx, start(ctx, 'gw6'));
  assert.deepEqual(counts(ctx), before, 'historical first clears are not reset by an update');
  complete(ctx, start(ctx, 'clx-fe1'));
  assert.deepEqual(counts(ctx), before.map((n, i) => n + dungeonFirstClearLoot(2)[i].count));
});
