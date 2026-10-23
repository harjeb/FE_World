import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { hardUnlocks, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { ALL_QUESTS, supportsHardQuest } from '../common/game/quests.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { createRun } from '../common/game/expedition.ts';

const multi = ALL_QUESTS.find(q => q.tier === 'region' && !q.scenarioId && !q.scenarioIds)!;
const single = ALL_QUESTS.find(q => q.kind === 'rout' && !supportsHardQuest(q) && !q.scenarioId)!;
function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'unlock', undefined, 'Unlock tests');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1];
  player.flags.unlockedRegions = Array.from({ length: 12 }, (_, i) => i + 1);
  player.flags.regionExploration = Object.fromEntries(player.flags.unlockedRegions.map(id => [id, 0]));
  player.flags.questsDone = ALL_QUESTS.filter(q => q.id !== multi.id && q.id !== single.id).map(q => q.id);
  player.flags.regionReputation = Object.fromEntries(player.flags.unlockedRegions.map(id => [id, 9999]));
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push: () => {} };
}
function start(ctx: Context, op: number, data: Record<string, unknown> = {}) {
  return dispatch(ctx, op, { unitIds: ['u_erin'], ...data }) as { battleId: string; run?: { id: string } };
}
function win(ctx: Context, id: string) {
  const b = ctx.store.battle(ctx.player.id, id)!;
  const leader = b.state.units.find(u => u.side === 'player')!;
  for (const enemy of b.state.units.filter(u => u.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (b.state.goal.kind === 'seize') leader.pos = [...b.state.goal.throne];
  ctx.store.saveBattle(b);
  dispatch(ctx, OP.UNIT_ACT, { battleId: id, unitId: leader.id, moveTo: leader.pos, action: b.state.goal.kind === 'seize' ? 'seize' : 'wait' });
}
function complete(ctx: Context, first: { battleId: string }) {
  win(ctx, first.battleId);
  for (let i = 0; i < 10 && ctx.store.activeRun(ctx.player.id); i++) win(ctx, start(ctx, OP.CONTINUE_DUNGEON).battleId);
  assert.equal(ctx.store.activeRun(ctx.player.id), null);
}
function snapshot(ctx: Context) {
  return { player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id), inventory: ctx.store.inventory(ctx.player.id), battles: ctx.store.battles(ctx.player.id), runs: ctx.store.runs(ctx.player.id) };
}

test('all hard starts reject without writes; previews block execution and shared handler rechecks', () => {
  const ctx = setup();
  for (const [op, data] of [[OP.SORTIE, { region: 1 }], [OP.START_DUNGEON, { region: 1 }], [OP.START_QUEST, { questId: multi.id }]] as const) {
    const before = snapshot(ctx);
    assert.throws(() => start(ctx, op, { ...data, aiDifficulty: 'hard' }), { code: 'FORBIDDEN' });
    assert.deepEqual(snapshot(ctx), before);
  }
  for (const action of ['sortie', 'dungeon']) {
    const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action, region: 1, aiDifficulty: 'hard' }) as { quoteId: string; blockers: string[] };
    assert.ok(quote.blockers.some(s => s.includes('普通')));
    assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), { code: 'FORBIDDEN' });
    ctx.player.flags.hardUnlocks = { regions: [1], dungeons: [1], quests: [] };
    ctx.store.savePlayer(ctx.player);
    const approved = dispatch(ctx, OP.PREVIEW_ACTION, { action, region: 1, aiDifficulty: 'hard' }) as { quoteId: string };
    ctx.player.flags.hardUnlocks = { regions: [], dungeons: [], quests: [] };
    ctx.store.savePlayer(ctx.player);
    assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: approved.quoteId }), { code: 'FORBIDDEN' });
  }
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [], dungeons: [], quests: [] });
});

test('ordinary wild victory opens only its wild region; hard victories grant nothing', () => {
  const ctx = setup();
  win(ctx, start(ctx, OP.SORTIE, { region: 2 }).battleId);
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [2], dungeons: [], quests: [] });
  const b = createFieldBattle([ctx.store.unit(ctx.player.id, 'u_erin')!], { region: 3, cleared: 0, seed: 'old-hard', aiDifficulty: 'hard' });
  b.playerId = ctx.player.id; ctx.store.saveBattle(b);
  win(ctx, b.id);
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [2], dungeons: [], quests: [] });
});

test('random dungeon partial and failed runs do not unlock; full normal completion does', () => {
  const ctx = setup();
  win(ctx, start(ctx, OP.START_DUNGEON, { region: 1 }).battleId);
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player).dungeons, []);
  start(ctx, OP.CONTINUE_DUNGEON);
  dispatch(ctx, OP.RETREAT, {});
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player).dungeons, []);
  complete(ctx, start(ctx, OP.START_DUNGEON, { region: 1 }));
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [], dungeons: [1], quests: [] });
});

test('quest dungeon opens only its ID and replays preserve first exploration and fixed rewards', () => {
  const ctx = setup();
  complete(ctx, start(ctx, OP.START_QUEST, { questId: multi.id }));
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [], dungeons: [], quests: [multi.id] });
  dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: multi.id });
  const exploration = structuredClone(ctx.player.flags.regionExploration);
  const claimed = [...ctx.player.flags.questRewardsClaimed!];
  for (const aiDifficulty of ['normal', 'hard']) {
    complete(ctx, start(ctx, OP.START_QUEST, { questId: multi.id, aiDifficulty }));
    assert.deepEqual(ctx.player.flags.regionExploration, exploration);
    assert.deepEqual(ctx.player.flags.questRewardsClaimed, claimed);
    assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: multi.id }), { code: 'FORBIDDEN' });
  }
});

test('single task rejects hard before and after victory and retains one-shot flow', () => {
  const ctx = setup();
  assert.throws(() => start(ctx, OP.START_QUEST, { questId: single.id, aiDifficulty: 'hard' }), { code: 'FORBIDDEN' });
  win(ctx, start(ctx, OP.START_QUEST, { questId: single.id }).battleId);
  assert.ok(ctx.player.flags.questsDone!.includes(single.id));
  for (const aiDifficulty of ['normal', 'hard']) assert.throws(() => start(ctx, OP.START_QUEST, { questId: single.id, aiDifficulty }), { code: 'FORBIDDEN' });
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [], dungeons: [], quests: [] });
});

test('legacy backfill uses projected actual normal victories and completed runs once', () => {
  const ctx = setup();
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  for (const [region, difficulty, questId] of [[2, undefined, undefined], [3, 'hard', undefined], [4, undefined, single.id]] as const) {
    const b = createFieldBattle([unit], { region, cleared: 0, seed: `history-${region}` });
    b.playerId = ctx.player.id; b.state.result = { winner: 'player', reason: 'rout' }; b.state.aiDifficulty = difficulty; b.questId = questId;
    ctx.store.saveBattle(b);
  }
  for (const [id, region, state, difficulty, questId] of [['normal', 5, 'completed', undefined, undefined], ['hard', 6, 'completed', 'hard', undefined], ['partial', 7, 'between_maps', undefined, undefined], ['failed', 8, 'failed', undefined, undefined], ['quest', multi.region, 'completed', undefined, multi.id], ['single', single.region, 'completed', undefined, single.id]] as const) {
    const run = createRun(id, ctx.player.id, region, [], 1, 0, { questId });
    run.state = state; run.aiDifficulty = difficulty; ctx.store.saveRun(run);
  }
  delete ctx.player.flags.hardUnlocks;
  ctx.store.savePlayer(ctx.player);
  const expected = { regions: [2], dungeons: [5], quests: [multi.id] };
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), expected);
  ctx.store.hardUnlockEvidence = () => { throw new Error('backfill repeated'); };
  assert.deepEqual(hardUnlocks(ctx.store, ctx.store.getPlayer(ctx.player.id)!), expected);
  const empty = setup(); delete empty.player.flags.hardUnlocks;
  assert.deepEqual(hardUnlocks(empty.store, empty.player), { regions: [], dungeons: [], quests: [] });
});

test('old hard run may continue with frozen difficulty without opening any keys', () => {
  const ctx = setup();
  const run = createRun('old-hard', ctx.player.id, 1, ['u_erin'], 1, 0, { aiDifficulty: 'hard' });
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  run.state = 'between_maps'; run.stageIndex = 2;
  run.carry = { [unit.id]: { hp: unit.stats.hp, items: unit.items, weapons: unit.weapons } };
  unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); ctx.store.saveRun(run);
  const next = start(ctx, OP.CONTINUE_DUNGEON, { aiDifficulty: 'normal' });
  assert.equal(ctx.store.battle(ctx.player.id, next.battleId)!.state.aiDifficulty, 'hard');
  win(ctx, next.battleId);
  assert.deepEqual(hardUnlocks(ctx.store, ctx.player), { regions: [], dungeons: [], quests: [] });
});
