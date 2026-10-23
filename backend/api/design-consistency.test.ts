import { test } from 'node:test';
import assert from 'node:assert/strict';
import { results } from '../../tools/audit/design-consistency.mjs';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { applyBattleOutcome, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { createUnit } from '../common/game/model.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { claimLegacy, createLegacy } from '../common/game/legacy.ts';

for (const result of results) test(`design ${result.id}: ${result.description}`, () => {
  assert.equal(result.error, undefined);
  assert.deepEqual(result.actual, result.expected);
});

function withContext(run: (ctx: Context) => void): void {
  const store = new Store(openDb(':memory:'));
  try {
    const { player, accountId } = loginOrRegister(store, 'regression', undefined, 'Regression');
    player.registered = false;
    player.flags.legacyUnlocked = true;
    player.day = 499;
    // 世界地图开荒后，地区相关读写需要显式解锁夹具；全解锁不授予任何讨伐记录。
    player.flags.unlockedRegions = Array.from({ length: 12 }, (_, i) => i + 1);
    run({ store, player, accountId, agentModel: null, push: () => {} });
  } finally { store.db.close(); }
}

test('annual snapshots survive live roster changes, block side effects and allow a final withdrawal', () => withContext(ctx => {
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  const level = unit.level;
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: [unit.id] });
  unit.level += 10;
  ctx.store.saveUnit(unit, ctx.player.id);
  for (const op of [OP.REST, OP.SWEEP, OP.ASSIGN_BEXP, OP.START_QUEST, OP.CLAIM_REWARD, OP.REINCARNATE_UNIT]) {
    assert.throws(() => dispatch(ctx, op, {}), /大竞技场/);
  }
  const started = dispatch(ctx, OP.START_MAIN_STAGE, {}) as { battleId: string };
  const battle = ctx.store.battle(ctx.player.id, started.battleId)!;
  assert.equal(battle.initial.units[0].level, level);
  dispatch(ctx, OP.WITHDRAW_ANNUAL, { commandId: 'withdraw-once' });
  const day = ctx.player.day;
  dispatch(ctx, OP.WITHDRAW_ANNUAL, { commandId: 'withdraw-once' });
  assert.equal(ctx.player.day, day);
  assert.equal(ctx.store.activeBattle(ctx.player.id), null);
  assert.equal(ctx.store.activeAnnualEntry(ctx.player.id), null);
  assert.throws(() => dispatch(ctx, OP.REGISTER_ANNUAL, {}), /已经报名/);
  dispatch(ctx, OP.REST, { days: 1 });
  assert.equal(ctx.player.day, day + 1);
}));

test('a dead ordinary unit only returns remaining gear, while simulations preserve all real supplies', () => withContext(ctx => {
  const unit = createUnit('karl', 15, 'ordinary', ctx.player.day, true);
  unit.items = [{ id: 'vulnerary', uses: 1 }, { id: 'immortal_shield', uses: 1 }];
  ctx.store.addUnit(ctx.player.id, unit);
  const record = createFieldBattle([unit], { region: 1, cleared: 0, day: 0, seed: 'consumption-regression' });
  record.playerId = ctx.player.id;
  record.state.units[0].items = [];
  record.state.units[0].shieldsUsed = 1;
  record.state.units[0].alive = false;
  record.state.units[0].hp = 0;
  record.state.result = { winner: 'enemy', reason: 'Defeat' };
  const before = ctx.store.countInventory(ctx.player.id, 'vulnerary');
  applyBattleOutcome(ctx.store, ctx.player, record);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'vulnerary'), before);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'immortal_shield'), 0);
  const hero = ctx.store.unit(ctx.player.id, 'u_erin')!;
  const simulation = createFieldBattle([hero], { region: 1, cleared: 0, day: 0, seed: 'simulation-regression' });
  simulation.playerId = ctx.player.id;
  simulation.mode = 'sparring';
  simulation.kind = 'arena';
  simulation.state.kind = 'arena';
  simulation.state.units[0].items = [];
  simulation.state.result = { winner: 'enemy', reason: 'Surrender' };
  applyBattleOutcome(ctx.store, ctx.player, simulation);
  assert.deepEqual(ctx.store.unit(ctx.player.id, hero.id)!.items, hero.items);
}));

test('invalid inheritance weights preserve the stone and old growth contracts stop without rewriting earned stats', () => withContext(ctx => {
  const source = createUnit('karl', 20, 'source', 0, true);
  const heir = createUnit('owen', 1, 'heir', 0, true);
  const legacy = createLegacy(source, 'retired', 'legacy-regression', ctx.player.id);
  ctx.store.addUnit(ctx.player.id, heir);
  ctx.store.saveLegacy(legacy);
  ctx.store.addInventory(ctx.player.id, 'legacy_stone_numeric', 0, 1);
  assert.throws(() => dispatch(ctx, OP.CLAIM_LEGACY, { legacyId: legacy.id, unitId: heir.id, mode: 'numeric', weights: { str: -1 } }), /weights/);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'legacy_stone_numeric'), 1);
  assert.equal(ctx.store.legacy(ctx.player.id, legacy.id)!.state, 'available');
  claimLegacy(legacy, heir, 'numeric', { str: 1 });
  legacy.mode = 'growth';
  heir.inheritedGrowth = { ...legacy.sourceGrowth };
  ctx.store.saveLegacy(legacy);
  ctx.store.saveUnit(heir, ctx.player.id);
  const loaded = ctx.store.unit(ctx.player.id, heir.id)!;
  assert.equal(loaded.inheritance, undefined);
  assert.equal(loaded.lineageDepth, 1);
  assert.deepEqual(loaded.stats, heir.stats);
}));

test('reincarnated ages stay at the new epoch across reloads and birthdays', () => withContext(ctx => {
  const unit = createUnit('karl', 99, 'reborn', 0, true);
  unit.ageBaseDays = 16 * 500 + 125;
  unit.ageEpochDay = 4000;
  unit.baseAge = 16;
  ctx.store.addUnit(ctx.player.id, unit);
  ctx.player.day = 4000;
  syncPlayer(ctx.store, ctx.player);
  assert.equal(ctx.store.unit(ctx.player.id, unit.id)!.age, 16);
  ctx.player.day = 4500;
  syncPlayer(ctx.store, ctx.player);
  assert.equal(ctx.store.unit(ctx.player.id, unit.id)!.age, 17);
}));

test('quest previews expose current enemy levels, dates and optional rewards; extra boxes pay once', () => withContext(ctx => {
  // gw3 要求 gw2 先完成；任务页只展示可接或已完成项，先给显式完成夹具。
  ctx.player.flags.questsDone = ['gw2'];
  ctx.store.savePlayer(ctx.player);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { quests: { id: string; enemyLevel: number; toDay: number; risk: string; optionalReward: unknown }[] }[] };
  const quest = view.regions.flatMap(region => region.quests).find(quest => quest.id === 'gw3')!;
  assert.equal(quest.enemyLevel, 19);
  assert.equal(quest.toDay, 501);
  assert.equal(quest.risk, 'permadeath');
  assert.deepEqual(quest.optionalReward, { item: 'wood', perExtraBox: 1 });
  ctx.player.flags.questsDone = ['gw3'];
  ctx.player.flags.questBoxes = { gw3: 3 };
  const before = ctx.store.countInventory(ctx.player.id, 'wood');
  dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw3', commandId: 'supply-reward' });
  dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw3', commandId: 'supply-reward' });
  assert.equal(ctx.store.countInventory(ctx.player.id, 'wood'), before + 2);
  assert.equal(ctx.player.flags.regionReputation?.[2], 40);
}));

test('an older active annual entry remains resumable after crossing a year boundary', () => withContext(ctx => {
  ctx.player.day = 499;
  assert.equal((dispatch(ctx, OP.GET_ANNUAL, {}) as { annualIndex: number }).annualIndex, 1);
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_erin'] });
  ctx.player.day = 999;
  assert.equal((dispatch(ctx, OP.GET_ANNUAL, {}) as { annualIndex: number }).annualIndex, 1);
  dispatch(ctx, OP.START_ANNUAL_MATCH, {});
  dispatch(ctx, OP.WITHDRAW_ANNUAL, {});
  ctx.player.day = 999;
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_erin'] });
  assert.equal(ctx.store.activeAnnualEntry(ctx.player.id)!.annualIndex, 2);
}));

test('ordinary copies of the protagonist template may retire or leave, while the real protagonist cannot', () => withContext(ctx => {
  for (const id of ['retire-copy', 'dismiss-copy']) ctx.store.addUnit(ctx.player.id, createUnit('erin', 15, id, 0, true));
  dispatch(ctx, OP.RETIRE_UNIT, { unitId: 'retire-copy' });
  assert.equal(ctx.store.unit(ctx.player.id, 'retire-copy')!.status, 'retired');
  dispatch(ctx, OP.DISMISS, { unitId: 'dismiss-copy' });
  assert.equal(ctx.store.unit(ctx.player.id, 'dismiss-copy'), null);
  assert.throws(() => dispatch(ctx, OP.RETIRE_UNIT, { unitId: 'u_erin' }), /主角/);
  assert.throws(() => dispatch(ctx, OP.DISMISS, { unitId: 'u_erin' }), /主角/);
}));
