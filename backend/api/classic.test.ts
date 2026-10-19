import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { applyBattleOutcome, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { decide } from '../common/engine/index.ts';
import { stats } from '../common/data/types.ts';
import type { Player } from './store.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { ALL_QUESTS } from '../common/game/quests.ts';
import { createClassicBattle } from '../common/game/battles.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'classic', undefined, '经典军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
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

function playOut(ctx: Context, battleId: string): string {
  for (let guard = 0; guard < 4000; guard++) {
    const battle = ctx.store.battle(ctx.player.id, battleId);
    if (!battle || battle.state.result) return battle?.state.result?.winner ?? 'none';
    const unit = battle.state.units.find(u => u.side === 'player' && u.alive && !u.acted);
    if (!unit) { dispatch(ctx, OP.END_PHASE, { battleId }); continue; }
    const action = decide(battle.state, unit);
    if (!action) {
      dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: unit.id, moveTo: unit.pos, action: { act: 'wait' } });
      continue;
    }
    dispatch(ctx, OP.UNIT_ACT, {
      battleId, unitId: unit.id, moveTo: action.to, action: action.act,
      targetId: 'target' in action ? action.target : undefined,
      weapon: 'weapon' in action ? action.weapon : undefined,
      item: 'item' in action ? action.item : undefined,
    });
  }
  throw new Error('battle did not finish');
}

const TEAM = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];

test('classic quests expose the per-map deployment limit and reject over-deployment', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; maxUnits: number }[] }[] };
  const entry = view.regions.find(region => region.region === 2)!.quests.find(quest => quest.id === 'cl-fe1-ch16')!;
  assert.equal(entry.maxUnits, 8, 'GET_QUESTS exposes the adaptation deployment limit');
  const nine = store.units(player.id).filter(unit => unit.status === 'active').slice(0, 9).map(unit => unit.id);
  assert.equal(nine.length, 9);
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'cl-fe1-ch16', unitIds: nine }), /最多出战 8 人/);
});

test('a classic single-map quest uses the source map, pays its days and resolves its reward', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  const source = classicMap('fe1-ch16');
  const startDay = player.day;
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cl-fe1-ch16', unitIds: TEAM }) as { battleId: string; goalText: string };
  assert.equal(player.day, startDay + 2, '经典单图任务按标准任务收 2 日');
  const battle = store.battle(player.id, started.battleId)!;
  assert.equal(battle.state.map.width, source.width);
  assert.equal(battle.state.map.height, source.height);
  assert.deepEqual(battle.state.map.tiles, source.terrain);
  assert.equal(battle.state.units.filter(unit => unit.side === 'enemy').length, source.enemies.length);
  assert.equal(playOut(ctx, started.battleId), 'player');
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; done: boolean; claimed: boolean }[] }[] };
  const entry = view.regions.find(region => region.region === 2)!.quests.find(quest => quest.id === 'cl-fe1-ch16')!;
  assert.equal(entry.done, true);
  assert.equal(player.flags.regionExploration?.[2], 5, '经典单图任务按五点结算');
  assert.equal(entry.claimed, false);
  const claimed = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'cl-fe1-ch16' }) as { gold: number };
  assert.equal(claimed.gold, 900);
});

test('a GBA classic quest exposes its scenario metadata', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; classic: { game: string; stageCount: number } | null; costDays: number }[] }[] };
  const quest = view.regions.find(region => region.region === 2)!.quests.find(entry => entry.id === 'cl-fe6-ch13-main')!;
  assert.equal(quest.classic?.game, 'fe6');
  assert.equal(quest.classic?.stageCount, 1);
  assert.equal(quest.costDays, 2);
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cl-fe6-ch13-main', unitIds: TEAM }) as { battleId: string };
  const battle = store.battle(player.id, started.battleId)!;
  assert.equal(battle.state.map.width, classicMap('fe6-ch13-main').width);
  dispatch(ctx, OP.RETREAT, { battleId: started.battleId });
  assert.equal(player.flags.regionExploration?.[2] ?? 0, 0, '失败的任务不加探索');
});

test('a classic dungeon runs its scenario sequence with carry-over and completes all stages', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  // 解锁第一组副本所需前置任务。
  player.flags.questsDone = ['cl-fe1-ch18'];
  store.savePlayer(player);
  const day = player.day;
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cld-fe1-1', unitIds: TEAM }) as { battleId: string; run: { id: string; stageCount: number; stageName: string } };
  assert.equal(started.run.stageCount, 3);
  assert.equal(started.run.stageName, classicMap('fe1-ch16').name);
  assert.equal(player.day, day + 2, '副本首图支付 2 日');
  assert.equal(playOut(ctx, started.battleId), 'player');
  let run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number; stageCount: number; survivingIds: string[] } }).run;
  assert.equal(run.state, 'between_maps');
  assert.equal(run.stageIndex, 1);
  assert.equal(run.stageCount, 3);
  assert.ok(run.survivingIds.length > 0);
  for (let stage = 1; stage < 3; stage++) {
    const continued = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
    const battle = store.battle(player.id, continued.battleId)!;
    assert.equal(battle.state.map.width, classicMap(['fe1-ch16', 'fe1-ch17', 'fe1-ch18'][stage]).width);
    assert.equal(playOut(ctx, continued.battleId), 'player');
  }
  run = (dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; stageIndex: number } }).run;
  assert.equal(run.state, 'completed');
  assert.equal(player.flags.regionExploration?.[2], 20, '经典多图副本首次整本完成加二十');
  assert.equal(player.day, day + 6, '三图共 6 日');
  for (const id of TEAM) assert.equal(store.unit(player.id, id)!.lockedRunId ?? null, null);
});

test('an adapted FE2 map quest starts with its generated garrison and is marked adapted', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; classic: { game: string; adapted?: boolean } | null }[] }[] };
  const entry = view.regions.find(region => region.region === 3)!.quests.find(quest => quest.id === 'cl-fe2-map-01')!;
  assert.equal(entry.classic?.game, 'fe2');
  assert.equal(entry.classic?.adapted, true);
  const source = classicMap('fe2-map-01');
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cl-fe2-map-01', unitIds: TEAM }) as { battleId: string };
  const battle = store.battle(player.id, started.battleId)!;
  assert.equal(battle.state.map.width, source.width);
  assert.equal(battle.state.units.filter(unit => unit.side === 'enemy').length, source.enemies.length);
  assert.ok(battle.state.units.some(unit => unit.side === 'enemy' && unit.boss));
  dispatch(ctx, OP.RETREAT, { battleId: started.battleId });
});

test('GET_QUESTS exposes all 78 classic entries with per-game dungeon metadata', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // 任务页只展示可接或已完成的项目；用“全部标记完成”的显式夹具让 78 个经典条目全部可见。
  player.flags.questsDone = ALL_QUESTS.filter(quest => quest.classic).map(quest => quest.id);
  store.savePlayer(player);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; classic: { game: string; stageCount: number } | null }[] }[] };
  const classic = view.regions.flatMap(region => region.quests).filter(quest => quest.classic);
  assert.equal(classic.length, 78, '60 单图 + 18 副本');
  for (const game of ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']) {
    const entries = classic.filter(quest => quest.classic!.game === game);
    assert.equal(entries.length, 13, `${game}: 10 单图 + 3 副本`);
    assert.equal(entries.filter(quest => quest.classic!.stageCount === 1).length, 10, `${game}: 单图数`);
    assert.equal(entries.filter(quest => quest.classic!.stageCount > 1).length, 3, `${game}: 副本数`);
  }
});

test('a four-map classic dungeon starts with four stages and the correct first map', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  player.flags.questsDone = ['cl-fe7-chfinal-1-eliwood'];
  store.savePlayer(player);
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cld-fe7-3', unitIds: TEAM }) as {
    battleId: string; run: { stageCount: number; stageName: string; stageDays: number } };
  assert.equal(started.run.stageCount, 4);
  assert.equal(started.run.stageDays, 2);
  assert.equal(started.run.stageName, classicMap('fe7-ch23-eliwood-linus').name);
  const battle = store.battle(player.id, started.battleId)!;
  assert.equal(battle.state.map.width, classicMap('fe7-ch23-eliwood-linus').width);
  assert.equal(battle.state.units.filter(unit => unit.side === 'enemy').length, classicMap('fe7-ch23-eliwood-linus').enemies.length);
  dispatch(ctx, OP.RETREAT, { battleId: started.battleId });
});

test('a classic chest can be opened through UNIT_ACT and exposes its loot ledger', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, TEAM);
  player.flags.questsDone = ['cl-fe8-ch13-ephraim', 'cl-fe8-ch14-eirika'];
  store.savePlayer(player);
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'cl-fe8-ch14-ephraim', unitIds: TEAM }) as { battleId: string };
  const battle = store.battle(player.id, started.battleId)!;
  const chest = battle.state.objects!.find(object => object.kind === 'chest' && object.state === 'closed')!;
  const unit = battle.state.units.find(entry => entry.side === 'player')!;
  const spot = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][])
    .map(([dx, dy]) => [chest.pos[0] + dx, chest.pos[1] + dy] as [number, number])
    .find(([x, y]) => x >= 0 && y >= 0 && x < battle.state.map.width && y < battle.state.map.height
      && !['wall', 'water'].includes(battle.state.map.tiles[y][x])
      && !battle.state.units.some(entry => entry.alive && entry.pos[0] === x && entry.pos[1] === y))!;
  unit.pos = spot;
  unit.acted = false;
  store.saveBattle(battle);
  const result = dispatch(ctx, OP.UNIT_ACT, {
    battleId: started.battleId, unitId: unit.id, moveTo: spot, action: 'interact', targetId: chest.id,
  }) as { events: { t: string }[] };
  assert.ok(result.events.some(event => event.t === 'treasure'));
  const after = store.battle(player.id, started.battleId)!;
  assert.equal(after.state.objects!.find(object => object.id === chest.id)!.state, 'opened');
  assert.equal(after.state.loot!.length, 1);
  const full = dispatch(ctx, OP.GET_BATTLE, { battleId: started.battleId, full: true }) as { state: { objects: { id: string; state: string }[] } };
  assert.equal(full.state.objects.find(object => object.id === chest.id)!.state, 'opened');
  dispatch(ctx, OP.RETREAT, { battleId: started.battleId });
});

test('classic chest loot is settled once on victory and duplicate ledger ids are ignored', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const record = createClassicBattle([store.unit(player.id, 'u_erin')!], { mapId: 'fe8-ch14-ephraim', seed: 'loot-settle', day: player.day });
  record.playerId = player.id;
  record.state.result = { winner: 'player', reason: 'test victory' };
  record.state.loot = [
    { id: 'object:chest-1', item: 'vulnerary', count: 2 },
    { id: 'object:chest-1', item: 'vulnerary', count: 2 },
  ];
  const before = store.countInventory(player.id, 'vulnerary');
  const rewards = applyBattleOutcome(store, ctx.player, record);
  assert.equal(store.countInventory(player.id, 'vulnerary'), before + 2);
  assert.deepEqual(rewards.items.filter(item => item.item === 'vulnerary'), [{ item: 'vulnerary', count: 2 }]);
});
