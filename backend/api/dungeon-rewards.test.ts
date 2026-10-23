import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { dungeonFirstClearReward, syncPlayer } from './services.ts';
import { enemyLevel, regionById } from '../common/game/calendar.ts';
import { createRun, dungeonFirstClearLoot } from '../common/game/expedition.ts';
import { GAME_ITEMS, isBoundWeapon } from '../common/game/items.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { RANKS } from '../common/data/types.ts';
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
function previewLoot(ctx: Context, region = 2, difficulty: 'normal' | 'hard' = 'normal') {
  return dungeonFirstClearLoot(region, difficulty, enemyLevel(ctx.player.day, regionById(region).offset));
}
function counts(ctx: Context, loot: NonNullable<RunRecord['firstClearLoot']>) {
  const inventory = ctx.store.inventory(ctx.player.id);
  return loot.map(({ item }) => inventory.filter(row => row.item === item).reduce((n, row) => n + row.count, 0));
}
function start(ctx: Context, questId?: string, aiDifficulty = 'normal') {
  const result = dispatch(ctx, questId ? OP.START_QUEST : OP.START_DUNGEON,
    { ...(questId ? { questId } : { region: 2 }), unitIds: ['u_erin'], aiDifficulty }) as { battleId: string; run: { id: string } };
  return { ...result, run: ctx.store.run(ctx.player.id, result.run.id)! };
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

test('a saved pre-update run pays its frozen first-clear bundle after reload', t => {
  const ctx = setup(t);
  const first = start(ctx);
  const oldLoot: NonNullable<RunRecord['firstClearLoot']> = [
    { item: 'steel_sword', count: 1 }, { item: 'vulnerary', count: 2 }, { item: 'full_meal', count: 1 },
  ];
  first.run.firstClearLoot = oldLoot;
  ctx.store.saveRun(first.run);
  const before = counts(ctx, oldLoot);
  const newLoot = previewLoot(ctx);
  const beforeNew = counts(ctx, newLoot);
  const reloaded = { ...ctx, store: new Store(ctx.store.db), player: ctx.store.getPlayer(ctx.player.id)! };
  const run = complete(reloaded, { ...first, run: reloaded.store.run(ctx.player.id, first.run.id)! });
  assert.deepEqual(run.firstClearLoot, oldLoot);
  assert.deepEqual(counts(reloaded, oldLoot), before.map((count, i) => count + oldLoot[i].count));
  assert.deepEqual(counts(reloaded, newLoot).slice(0, 3), beforeNew.slice(0, 3), 'new gear, growth items and elixirs are not added to an old frozen bundle');
});

test('all regional bundles contain usable equipment and items; preview reads never grant them', t => {
  const ctx = setup(t);
  const before = ctx.store.inventory(ctx.player.id);
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: { id: number; dungeonFirstClearRewards: Record<'normal' | 'hard', ReturnType<typeof dungeonFirstClearReward>> }[] };
  for (const row of today.sortieRegions) {
    const loot = previewLoot(ctx, row.id);
    assert.deepEqual(row.dungeonFirstClearRewards.normal, { items: loot, available: true });
    assert.deepEqual(row.dungeonFirstClearRewards.hard, { items: previewLoot(ctx, row.id, 'hard'), available: true });
    assert.equal(GAME_ITEMS[loot[0].item].kind, 'weapon');
    assert.equal(isBoundWeapon(loot[0].item), false, 'existing unique quest/tower gear must stay exclusive');
    assert.equal(loot.filter(drop => GAME_ITEMS[drop.item].kind === 'stat').length, 1);
    assert.ok(RANKS.indexOf(WEAPONS[GAME_ITEMS[loot[0].item].weapon!].rank) >= RANKS.indexOf('C'));
    assert.equal(loot.some(drop => drop.item === 'vulnerary'), false);
    assert.equal(loot.find(drop => drop.item === 'elixir')?.count, 2);
    assert.equal(loot.find(drop => drop.item === 'full_meal')?.count, 2);
    assert.equal(loot.find(drop => drop.item === 'seal_promote')?.count, 1);
    for (const drop of loot) assert.ok(GAME_ITEMS[drop.item] && drop.count > 0);
  }
  for (let region = 1; region <= 12; region++) {
    const normal = dungeonFirstClearLoot(region);
    const hard = dungeonFirstClearLoot(region, 'hard');
    assert.notEqual(hard[0].item, normal[0].item);
    assert.equal(GAME_ITEMS[hard[0].item].kind, 'weapon');
    assert.equal(isBoundWeapon(hard[0].item), false);
    assert.ok(RANKS.indexOf(WEAPONS[GAME_ITEMS[hard[0].item].weapon!].rank) >= RANKS.indexOf('A'));
    assert.equal(hard[1].item, normal[1].item);
    assert.equal(GAME_ITEMS[hard[1].item].kind, 'stat');
    for (const level of [1, 9, 20, 35, 75, 99]) {
      assert.deepEqual(dungeonFirstClearLoot(region, 'normal', level), normal, 'early levels cannot downgrade the prize');
      assert.deepEqual(dungeonFirstClearLoot(region, 'hard', level), hard);
    }
    for (const drop of hard) assert.ok(GAME_ITEMS[drop.item] && drop.count > 0);
    assert.ok(hard.slice(1).every((drop, i) => drop.item === normal[i + 1].item && drop.count > normal[i + 1].count));
  }
  const quests = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; firstClearRewards: Record<'normal' | 'hard', unknown> | null }[] }[] };
  const rows = quests.regions.flatMap(r => r.quests);
  assert.equal(rows.find(q => q.id === 'gw1')!.firstClearRewards, null, 'single-map quests keep their existing reward flow');
  for (const id of questIds) {
    assert.deepEqual(rows.find(q => q.id === id)!.firstClearRewards?.normal, { items: previewLoot(ctx), available: true });
    assert.deepEqual(rows.find(q => q.id === id)!.firstClearRewards?.hard, { items: previewLoot(ctx, 2, 'hard'), available: true });
  }
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before);
});

for (const questId of [undefined, ...questIds]) {
  test(`${questId ?? 'random region dungeon'} grants each difficulty bundle once across reload and command replay`, t => {
    const ctx = setup(t);
    const first = start(ctx, questId);
    const loot = first.run.firstClearLoot!;
    assert.deepEqual(loot, dungeonFirstClearLoot(2, 'normal', first.run.level));
    const before = counts(ctx, loot);
    const run = complete(ctx, first);
    assert.deepEqual(run.firstClearLoot, loot);
    assert.deepEqual(counts(ctx, loot), before.map((n, i) => n + loot[i].count));
    for (const drop of loot) assert.deepEqual(run.pendingLoot.filter(row => row.item === drop.item), [drop]);
    const elixirIndex = loot.findIndex(drop => drop.item === 'elixir');
    assert.equal(ctx.store.inventory(ctx.player.id).find(row => row.item === 'elixir' && row.uses === 1)!.count, before[elixirIndex] + loot[elixirIndex].count);
    assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, questId).available, false);
    const reloaded = { ...ctx, store: new Store(ctx.store.db), player: ctx.store.getPlayer(ctx.player.id)! };
    const exploration = { ...reloaded.player.flags.regionExploration };
    assert.equal(dungeonFirstClearReward(reloaded.store, reloaded.player, 2, questId, 'hard').available, true);
    const hardFirst = start(reloaded, questId, 'hard');
    const hardLoot = hardFirst.run.firstClearLoot!;
    assert.deepEqual(hardLoot, dungeonFirstClearLoot(2, 'hard', hardFirst.run.level));
    const hardBefore = counts(reloaded, hardLoot);
    const hardRun = complete(reloaded, hardFirst);
    assert.deepEqual(hardRun.firstClearLoot, hardLoot);
    assert.deepEqual(counts(reloaded, hardLoot), hardBefore.map((n, i) => n + hardLoot[i].count));
    for (const drop of hardLoot) assert.deepEqual(hardRun.pendingLoot.filter(row => row.item === drop.item), [drop]);
    assert.equal(dungeonFirstClearReward(reloaded.store, reloaded.player, 2, questId, 'hard').available, false);
    const paidNormal = counts(reloaded, loot);
    const paidHard = counts(reloaded, hardLoot);
    for (const difficulty of ['normal', 'hard']) complete(reloaded, start(reloaded, questId, difficulty));
    assert.deepEqual(counts(reloaded, loot), paidNormal);
    assert.deepEqual(counts(reloaded, hardLoot), paidHard);
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
  const loot = previewLoot(ctx, 2, difficulty);
  const before = counts(ctx, loot);
  const first = start(ctx, undefined, difficulty);
  win(ctx, first.battleId);
  assert.deepEqual(counts(ctx, loot), before);
  assert.ok(ctx.store.activeRun(ctx.player.id)!.pendingLoot.every(drop => !first.run.firstClearLoot!.some(first => first.item === drop.item)));
  dispatch(ctx, OP.WITHDRAW_RUN, {});
  assert.deepEqual(counts(ctx, loot), before);
  start(ctx, undefined, difficulty);
  dispatch(ctx, OP.RETREAT, {});
  assert.deepEqual(counts(ctx, loot), before);
  assert.equal(dungeonFirstClearReward(ctx.store, ctx.player, 2, undefined, difficulty).available, true);
  const final = start(ctx, undefined, difficulty);
  const finalLoot = final.run.firstClearLoot!;
  const finalBefore = counts(ctx, finalLoot);
  complete(ctx, final);
  assert.deepEqual(counts(ctx, finalLoot), finalBefore.map((n, i) => n + finalLoot[i].count));
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
    const first = start(ctx, questId, 'hard');
    const loot = first.run.firstClearLoot!;
    const hardBefore = counts(ctx, loot);
    complete(ctx, first);
    assert.deepEqual(counts(ctx, loot), hardBefore.map((n, i) => n + loot[i].count));
    assert.deepEqual(ctx.player.flags.regionExploration, exploration);
  }
  const loot = previewLoot(ctx);
  const before = counts(ctx, loot);
  complete(ctx, start(ctx));
  complete(ctx, start(ctx, 'gw6'));
  assert.deepEqual(counts(ctx, loot), before, 'historical first clears are not reset by an update');
  const first = start(ctx, 'clx-fe1');
  const finalLoot = first.run.firstClearLoot!;
  const finalBefore = counts(ctx, finalLoot);
  complete(ctx, first);
  assert.deepEqual(counts(ctx, finalLoot), finalBefore.map((n, i) => n + finalLoot[i].count));
});
