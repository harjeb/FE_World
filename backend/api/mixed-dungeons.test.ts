import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { ALL_QUESTS } from '../common/game/quests.ts';
import { createRun, dungeonFirstClearLoot } from '../common/game/expedition.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import type { DungeonStage } from '../common/game/dungeon-plans.ts';
import { seasonalMap } from '../common/maps/map.ts';
import { dateOf, enemyLevel, regionById } from '../common/game/calendar.ts';

const TEAM = ['u_victor', 'u_erin'];
type Started = { battleId: string; run: { id: string } };
function setup(t: TestContext): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { accountId, player } = loginOrRegister(store, 'mixed');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1, 2];
  player.flags.questsDone = ALL_QUESTS.filter(q => !q.archived && !q.dungeonOnly && q.id !== 'gw6').map(q => q.id);
  player.flags.regionReputation = { 2: 9999, 3: 9999, 5: 9999 };
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push() {} };
}
function reload(ctx: Context) {
  ctx.store = new Store(ctx.store.db);
  ctx.player = ctx.store.getPlayer(ctx.player.id)!;
}
function win(ctx: Context, id: string) {
  const b = ctx.store.battle(ctx.player.id, id)!;
  for (const e of b.state.units.filter(u => u.side === 'enemy')) { e.alive = false; e.hp = 0; }
  const unit = b.state.units.find(u => u.side === 'player')!;
  // Preserve the map/scenario; isolate settlement from combat balance and objective difficulty.
  b.state.goal = { kind: 'rout' };
  unit.acted = false;
  unit.hp = Math.min(unit.hp, 7);
  unit.items = [{ id: 'vulnerary', uses: 1 }];
  ctx.store.saveBattle(b);
  const command = { battleId: id, unitId: unit.id, moveTo: unit.pos, action: 'wait', commandId: `win-${id}` };
  const result = dispatch(ctx, OP.UNIT_ACT, command);
  assert.equal(ctx.store.battle(ctx.player.id, id)!.state.result?.winner, 'player');
  const inventory = ctx.store.inventory(ctx.player.id);
  const paidDay = ctx.player.day;
  assert.deepEqual(dispatch(ctx, OP.UNIT_ACT, command), JSON.parse(JSON.stringify(result)));
  assert.equal(ctx.player.day, paidDay);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
}
function finish(ctx: Context, first: Started, scenarios: (string | undefined)[], days: number | number[]) {
  let battleId = first.battleId;
  const costs = typeof days === 'number' ? scenarios.map(() => days) : days;
  const initialDay = ctx.player.day;
  const frozen = ctx.store.run(ctx.player.id, first.run.id)!;
  assert.deepEqual(frozen.unitIds, TEAM);
  for (let i = 0; i < scenarios.length; i++) {
    const b = ctx.store.battle(ctx.player.id, battleId)!;
    assert.equal(b.stageIndex, i);
    assert.equal(b.runId, first.run.id);
    if (Array.isArray(days)) assert.equal(b.costDays, costs[i]);
    assert.equal(b.state.scenario?.id, scenarios[i]);
    assert.deepEqual(b.state.units.filter(u => u.side === 'player').map(u => u.id), TEAM);
    if (scenarios[i]) {
      const map = classicMap(scenarios[i]!);
      assert.equal(b.state.map.width, map.width);
      assert.equal(b.state.map.height, map.height);
      assert.deepEqual(b.state.map.tiles, seasonalMap(map.terrain, dateOf(ctx.player.day - (b.costDays ?? costs[i])).season).tiles);
    }
    for (const id of TEAM) assert.equal(ctx.store.unit(ctx.player.id, id)!.lockedRunId, first.run.id);
    win(ctx, battleId);
    reload(ctx);
    const run = ctx.store.run(ctx.player.id, first.run.id)!;
    assert.deepEqual(run.firstClearLoot, frozen.firstClearLoot);
    assert.deepEqual(run.stages, frozen.stages);
    assert.deepEqual(run.stageDayCosts, frozen.stageDayCosts);
    if (Array.isArray(days)) assert.deepEqual(run.stageDayCosts, days);
    assert.deepEqual(run.stageNames, frozen.stageNames);
    if (i < scenarios.length - 1) {
      assert.equal(run.state, 'between_maps');
      const view = dispatch(ctx, OP.GET_RUN, {}) as { run: { nextStageName: string | null } };
      assert.equal(view.run.nextStageName, frozen.stageNames?.[i + 1] ?? null);
      const next = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as Started;
      battleId = next.battleId;
      const units = ctx.store.battle(ctx.player.id, battleId)!.state.units.filter(u => u.side === 'player');
      for (const unit of units) {
        const heal = run.questId ? ALL_QUESTS.find(q => q.id === run.questId)?.betweenMapHeal ?? 0 : 0;
        const maxHp = ctx.store.unit(ctx.player.id, unit.id)!.stats.hp;
        assert.equal(unit.hp, Math.min(maxHp, run.carry[unit.id].hp + Math.floor(maxHp * heal / 100)));
        assert.deepEqual(unit.items, run.carry[unit.id].items);
        assert.deepEqual(unit.weapons, run.carry[unit.id].weapons);
        assert.deepEqual(unit.weaponInstances, run.carry[unit.id].weaponInstances);
      }
      assert.equal(ctx.player.day, initialDay + costs.slice(1, i + 2).reduce((sum, cost) => sum + cost, 0));
    } else assert.equal(run.state, 'completed');
  }
  for (const id of TEAM) assert.equal(ctx.store.unit(ctx.player.id, id)!.lockedRunId ?? null, null);
}
function questRows(ctx: Context) {
  return (dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; costDays: number; dungeonOnly: boolean; hardUnlocked: boolean; firstClearRewards: { normal: { items: unknown; available: boolean }; hard: { items: unknown; available: boolean } } | null }[] }[] }).regions.flatMap(r => r.quests);
}

test('preview and GET_TODAY freeze the mixed plan across reload, payment and day changes', t => {
  const ctx = setup(t);
  const day = ctx.player.day;
  const preview = () => dispatch(ctx, OP.PREVIEW_ACTION, { action: 'dungeon', region: 2, unitIds: TEAM }) as { dungeonStages: DungeonStage[]; costDays: number; toDay: number };
  assert.equal(preview().costDays, 3);
  assert.equal(preview().toDay, day + 3);
  const plan = preview().dungeonStages;
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.slice(0, 2).map(s => s.scenarioId), [undefined, undefined]);
  assert.ok(plan[2].scenarioId);
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: { id: number; dungeonStages: DungeonStage[] }[] };
  assert.deepEqual(today.sortieRegions.find(r => r.id === 2)!.dungeonStages, plan);
  reload(ctx);
  assert.deepEqual(preview().dungeonStages, plan);
  assert.equal(ctx.player.day, day);
  const first = dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: TEAM }) as Started;
  assert.equal(ctx.player.day, day + 3);
  const run = ctx.store.run(ctx.player.id, first.run.id)!;
  assert.deepEqual(run.stages, plan);
  assert.deepEqual(run.stageNames, plan.map(s => s.name));
  finish(ctx, first, plan.map(s => s.scenarioId), [3, 3, 2]);
  assert.equal(ctx.player.day, day + 8);
  const hard = dispatch(ctx, OP.START_DUNGEON, { region: 2, unitIds: TEAM, aiDifficulty: 'hard' }) as Started;
  const hardPlan = ctx.store.run(ctx.player.id, hard.run.id)!.stages!;
  finish(ctx, hard, hardPlan.map(s => s.scenarioId), [3, 3, 2]);
  assert.equal(ctx.player.day, day + 16);
});

test('regional multi-map quest gets a classic finale in eight total days; ordinary quests retain rewards', t => {
  const ctx = setup(t);
  const day = ctx.player.day;
  assert.equal(questRows(ctx).find(q => q.id === 'gw1')!.firstClearRewards, null);
  const first = dispatch(ctx, OP.START_QUEST, { questId: 'gw6', unitIds: TEAM }) as Started;
  const plan = ctx.store.run(ctx.player.id, first.run.id)!.stages!;
  assert.deepEqual(plan.slice(0, 2).map(s => s.scenarioId), [undefined, undefined]);
  assert.ok(plan[2].scenarioId);
  assert.equal(ctx.player.day, day + 3);
  finish(ctx, first, plan.map(s => s.scenarioId), [3, 3, 2]);
  assert.equal(ctx.player.day, day + 8);
  assert.ok(ctx.player.flags.questsDone!.includes('gw6'));
  assert.equal(questRows(ctx).find(q => q.id === 'gw6')!.hardUnlocked, true);
  const hard = dispatch(ctx, OP.START_QUEST, { questId: 'gw6', unitIds: TEAM, aiDifficulty: 'hard' }) as Started;
  const hardPlan = ctx.store.run(ctx.player.id, hard.run.id)!.stages!;
  finish(ctx, hard, hardPlan.map(s => s.scenarioId), [3, 3, 2]);
  assert.equal(ctx.player.day, day + 16);
});

const CHAINS = [
  ['clx-fe1', 2, ['fe1-ch23', 'fe1-ch24', 'fe1-ch25']],
  ['clx-fe2', 3, ['fe2-map-08', 'fe2-map-09', 'fe2-map-10']],
  ['clx-fe3', 5, ['fe3-book1-ch18', 'fe3-book1-ch19', 'fe3-book1-ch20']],
  ['clx-fe6', 2, ['fe6-ch22-main', 'fe6-ch23-main', 'fe6-ch24-main']],
  ['clx-fe7', 3, ['fe7-ch27-eliwood', 'fe7-ch30-eliwood', 'fe7-chfinal-1-eliwood']],
  ['clx-fe8', 5, ['fe8-ch17-eirika', 'fe8-ch20-eirika', 'fe8-chfinal-1-eirika']],
] as const;
for (const [questId, region, scenarios] of CHAINS) test(`${questId}: three ordered maps, locks, payment and independent normal/hard rewards`, t => {
  const ctx = setup(t);
  const q = ALL_QUESTS.find(q => q.id === questId)!;
  assert.equal(q.region, region);
  assert.equal(q.stageDays, undefined);
  assert.equal(q.costDays, 8);
  assert.equal(q.dungeonOnly, true);
  const row = questRows(ctx).find(q => q.id === questId)!;
  assert.equal(row.hardUnlocked, false);
  const level = enemyLevel(ctx.player.day, regionById(region).offset);
  assert.deepEqual(row.firstClearRewards, { normal: { items: dungeonFirstClearLoot(region, 'normal', level), available: true }, hard: { items: dungeonFirstClearLoot(region, 'hard', level), available: true } });
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId, unitIds: TEAM, aiDifficulty: 'hard' }), /普通难度/);
  const day = ctx.player.day;
  const first = dispatch(ctx, OP.START_QUEST, { questId, unitIds: TEAM }) as Started;
  assert.equal(ctx.player.day, day + 3);
  assert.deepEqual(ctx.store.run(ctx.player.id, first.run.id)!.scenarioIds, scenarios);
  finish(ctx, first, [...scenarios], [3, 3, 2]);
  assert.equal(ctx.player.day, day + 8);
  const after = questRows(ctx).find(q => q.id === questId)!;
  assert.equal(after.hardUnlocked, true);
  assert.equal(after.firstClearRewards!.normal.available, false);
  assert.equal(after.firstClearRewards!.hard.available, true);
  const hardDay = ctx.player.day;
  const hard = dispatch(ctx, OP.START_QUEST, { questId, unitIds: TEAM, aiDifficulty: 'hard' }) as Started;
  finish(ctx, hard, [...scenarios], [3, 3, 2]);
  assert.equal(ctx.player.day, hardDay + 8);
  assert.equal(questRows(ctx).find(q => q.id === questId)!.firstClearRewards!.hard.available, false);
});

test('ordinary regional single-map quests keep their cost, completion and manual reward flow', t => {
  const ctx = setup(t);
  const questId = 'gw1';
  ctx.player.flags.questsDone = ctx.player.flags.questsDone!.filter(id => id !== questId);
  ctx.store.savePlayer(ctx.player);
  const row = questRows(ctx).find(q => q.id === questId)!;
  assert.equal(row.dungeonOnly, false);
  assert.equal(row.firstClearRewards, null);
  const day = ctx.player.day;
  const started = dispatch(ctx, OP.START_QUEST, { questId, unitIds: TEAM }) as { battleId: string };
  assert.equal(ctx.player.day, day + row.costDays);
  assert.equal(ctx.store.activeRun(ctx.player.id), null);
  assert.equal(ctx.store.battle(ctx.player.id, started.battleId)!.state.scenario, undefined);
  win(ctx, started.battleId);
  assert.ok(ctx.player.flags.questsDone!.includes(questId));
  const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId }) as { gold: number };
  assert.equal(reward.gold, ALL_QUESTS.find(q => q.id === questId)!.reward.gold);
});

test('classic dungeons reject locked regions before charging days or locking units', t => {
  const ctx = setup(t);
  ctx.player.flags.clearedRegions = [];
  ctx.player.flags.unlockedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  const day = ctx.player.day;
  for (const [questId] of CHAINS) {
    assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId, unitIds: TEAM }), /尚未解锁|讨伐/);
    assert.equal(ctx.player.day, day);
    assert.equal(ctx.store.activeRun(ctx.player.id), null);
    for (const id of TEAM) assert.equal(ctx.store.unit(ctx.player.id, id)!.lockedRunId ?? null, null);
  }
});

test('legacy random run without stages keeps all three generated maps', t => {
  const ctx = setup(t);
  const run = createRun('legacy-random', ctx.player.id, 2, TEAM, 10, 2);
  delete run.stageDayCosts;
  const units = TEAM.map(id => ctx.store.unit(ctx.player.id, id)!);
  for (const u of units) { u.lockedRunId = run.id; ctx.store.saveUnit(u, ctx.player.id); }
  const b = createFieldBattle(units, { region: 2, cleared: 2, day: ctx.player.day, seed: 'legacy', level: 10, stageIndex: 0, runId: run.id });
  b.playerId = ctx.player.id;
  run.battleId = b.id;
  ctx.store.saveBattle(b);
  ctx.store.saveRun(run);
  finish(ctx, { battleId: b.id, run }, [undefined, undefined, undefined], 8);
  assert.equal(ctx.store.run(ctx.player.id, run.id)!.stages, undefined);
});

test('all archived starts reject without writes and old pending rewards remain claimable exactly once', t => {
  const ctx = setup(t);
  for (const quest of ALL_QUESTS.filter(q => q.archived)) {
    const before = ctx.store.db.prepare('SELECT total_changes() AS n').get();
    assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: quest.id, unitIds: TEAM }), /已编入副本/);
    assert.deepEqual(ctx.store.db.prepare('SELECT total_changes() AS n').get(), before, quest.id);
  }
  const questId = 'cl-fe1-ch16';
  ctx.player.flags.questsDone!.push(questId);
  ctx.store.savePlayer(ctx.player);
  reload(ctx);
  assert.ok(questRows(ctx).some(q => q.id === questId));
  const gold = ctx.player.gold;
  dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId });
  assert.equal(ctx.player.gold, gold + 900);
  reload(ctx);
  assert.ok(!questRows(ctx).some(q => q.id === questId));
  const before = ctx.store.inventory(ctx.player.id);
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId }), /已经领取/);
  assert.equal(ctx.player.gold, gold + 900);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before);
});
