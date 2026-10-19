import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { ALL_QUESTS } from '../common/game/quests.ts';
import { createClassicBattle } from '../common/game/battles.ts';
import { createRun } from '../common/game/expedition.ts';
import { dateOf } from '../common/game/calendar.ts';
import { seasonalMap } from '../common/maps/map.ts';

function setup(t: TestContext): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { accountId, player } = loginOrRegister(store, 'classic', undefined, '经典军团');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1, 2];
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push() {} };
}
function rows(ctx: Context) {
  return (dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; archived: boolean; available: boolean; inProgress: boolean; maxUnits: number; classic: { adapted?: boolean; game: string }; costDays: number }[] }[] }).regions.flatMap(r => r.quests);
}
// A pre-upgrade save: production constructors, no mutation of the quest registry.
function legacy(ctx: Context, questId: string) {
  const quest = ALL_QUESTS.find(q => q.id === questId)!;
  assert.equal(quest.archived, true);
  const units = [ctx.store.unit(ctx.player.id, 'u_erin')!];
  const ids = quest.scenarioIds;
  const run = ids ? createRun(`legacy-${questId}`, ctx.player.id, quest.region, units.map(u => u.id), 10, 2,
    { questId, stageDays: 2, scenarioIds: ids, stageNames: ids.map(id => classicMap(id).name) }) : undefined;
  const record = createClassicBattle(units, { mapId: ids?.[0] ?? quest.scenarioId!, seed: questId, quest,
    day: ctx.player.day, runId: run?.id, stageIndex: run ? 0 : undefined });
  record.playerId = ctx.player.id;
  if (run) {
    run.battleId = record.id;
    ctx.store.saveRun(run);
    for (const unit of units) { unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); }
  }
  ctx.store.saveBattle(record);
  return record;
}
function win(ctx: Context, battleId: string) {
  const b = ctx.store.battle(ctx.player.id, battleId)!;
  const unit = b.state.units.find(u => u.side === 'player')!;
  for (const enemy of b.state.units.filter(u => u.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  b.state.goal = { kind: 'rout' };
  unit.acted = false;
  ctx.store.saveBattle(b);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: unit.id, moveTo: unit.pos, action: 'wait' });
  assert.equal(ctx.store.battle(ctx.player.id, battleId)!.state.result?.winner, 'player');
}

test('retained classic dungeons expose the strictest map deployment limit', t => {
  const ctx = setup(t);
  const quest = ALL_QUESTS.find(q => q.id === 'clx-fe1')!;
  const max = Math.min(...quest.scenarioIds!.map(id => classicAdaptation(id).deployment.max));
  assert.equal(rows(ctx).find(q => q.id === quest.id)!.maxUnits, max);
  const ids = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').slice(0, max + 1).map(u => u.id);
  assert.equal(ids.length, max + 1);
  const day = ctx.player.day;
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: quest.id, unitIds: ids }), new RegExp(`最多出战 ${max} 人`));
  assert.equal(ctx.player.day, day);
  assert.equal(ctx.store.activeRun(ctx.player.id), null);
});

for (const [questId, mapId] of [['cl-fe1-ch16', 'fe1-ch16'], ['cl-fe6-ch13-main', 'fe6-ch13-main'], ['cl-fe2-map-01', 'fe2-map-01']]) {
  test(`${questId}: saved archived single map retains terrain, scenario, garrison and reward`, t => {
    const ctx = setup(t);
    const b = legacy(ctx, questId);
    const source = classicMap(mapId);
    assert.equal(b.state.scenario!.id, mapId);
    assert.equal(b.state.map.width, source.width);
    assert.equal(b.state.map.height, source.height);
    assert.deepEqual(b.state.map.tiles, seasonalMap(source.terrain, dateOf(ctx.player.day).season).tiles);
    assert.equal(b.state.units.filter(u => u.side === 'enemy').length, source.enemies.length);
    const row = rows(ctx).find(q => q.id === questId)!;
    assert.equal(row.inProgress, true);
    assert.equal(row.available, false);
    assert.equal(row.costDays, 2);
    if (mapId.startsWith('fe2')) assert.equal(row.classic.adapted, true);
    win(ctx, b.id);
    assert.equal(ctx.player.flags.regionExploration?.[ALL_QUESTS.find(q => q.id === questId)!.region], 5);
    assert.ok(rows(ctx).some(q => q.id === questId));
    const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId }) as { gold: number };
    assert.equal(reward.gold, ALL_QUESTS.find(q => q.id === questId)!.reward.gold ?? 0);
    assert.ok(!rows(ctx).some(q => q.id === questId));
  });
}

test('archived catalog preserves every pending reward but hides claimed and unstarted entries', t => {
  const ctx = setup(t);
  const archived = ALL_QUESTS.filter(q => q.archived);
  assert.equal(archived.length, 78);
  assert.ok(rows(ctx).every(q => !q.archived));
  ctx.player.flags.questsDone = archived.map(q => q.id);
  ctx.store.savePlayer(ctx.player);
  assert.deepEqual(rows(ctx).filter(q => q.archived).map(q => q.id).sort(), archived.map(q => q.id).sort());
  ctx.player.flags.questRewardsClaimed = archived.map(q => q.id);
  ctx.store.savePlayer(ctx.player);
  assert.ok(rows(ctx).every(q => !q.archived));
});

for (const questId of ['cld-fe1-1', 'cld-fe7-3']) test(`${questId}: saved legacy sequence continues exact scenario IDs and settles`, t => {
  const ctx = setup(t);
  let b = legacy(ctx, questId);
  const runId = b.runId!;
  const ids = [...ALL_QUESTS.find(q => q.id === questId)!.scenarioIds!];
  const day = ctx.player.day;
  for (let i = 0; i < ids.length; i++) {
    assert.equal(b.state.scenario!.id, ids[i]);
    assert.equal(b.stageIndex, i);
    assert.equal(ctx.store.unit(ctx.player.id, 'u_erin')!.lockedRunId, runId);
    win(ctx, b.id);
    if (i < ids.length - 1) {
      const next = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
      b = ctx.store.battle(ctx.player.id, next.battleId)!;
    }
  }
  assert.equal(ctx.player.day, day + (ids.length - 1) * 2);
  assert.equal(ctx.store.run(ctx.player.id, runId)!.state, 'completed');
  assert.equal(ctx.store.run(ctx.player.id, runId)!.stages, undefined);
  assert.equal(ctx.store.unit(ctx.player.id, 'u_erin')!.lockedRunId ?? null, null);
  assert.equal(ctx.player.flags.regionExploration?.[b.region!], 20);
});

test('saved classic chest interaction exposes objects and settles duplicate loot only once', t => {
  const ctx = setup(t);
  const b = legacy(ctx, 'cl-fe8-ch14-ephraim');
  const chest = b.state.objects!.find(o => o.kind === 'chest' && o.state === 'closed')!;
  const unit = b.state.units.find(u => u.side === 'player')!;
  const spot = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][])
    .map(([dx, dy]) => [chest.pos[0] + dx, chest.pos[1] + dy] as [number, number])
    .find(([x, y]) => x >= 0 && y >= 0 && x < b.state.map.width && y < b.state.map.height
      && !['wall', 'water'].includes(b.state.map.tiles[y][x]) && !b.state.units.some(u => u.alive && u.pos[0] === x && u.pos[1] === y))!;
  unit.pos = spot;
  ctx.store.saveBattle(b);
  const result = dispatch(ctx, OP.UNIT_ACT, { battleId: b.id, unitId: unit.id, moveTo: spot, action: 'interact', targetId: chest.id }) as { events: { t: string }[] };
  assert.ok(result.events.some(e => e.t === 'treasure'));
  const view = dispatch(ctx, OP.GET_BATTLE, { battleId: b.id, full: true }) as { state: { objects: { id: string; state: string }[] } };
  assert.equal(view.state.objects.find(o => o.id === chest.id)!.state, 'opened');
  const after = ctx.store.battle(ctx.player.id, b.id)!;
  assert.equal(after.state.loot!.length, 1);
  after.state.loot = [{ id: 'object:chest-1', item: 'vulnerary', count: 2 }, { id: 'object:chest-1', item: 'vulnerary', count: 2 }];
  ctx.store.saveBattle(after);
  const before = ctx.store.countInventory(ctx.player.id, 'vulnerary');
  win(ctx, b.id);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'vulnerary'), before + 2);
  const inventory = ctx.store.inventory(ctx.player.id);
  dispatch(ctx, OP.GET_BATTLE, { battleId: b.id, full: true });
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
});
