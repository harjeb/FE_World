import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { handleRunOutcome, applyBattleOutcome, settleDispatches } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { MATERIALS, materialTier } from '../common/game/materials.ts';
import { createRun, dungeonFirstClearLoot, stageLoot } from '../common/game/expedition.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { createDispatch, dispatchMaterials } from '../common/game/dispatch.ts';
import { recipeById } from '../common/game/production.ts';

function setup(t: { after(fn: () => void): void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'materials');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1, 2, 3];
  store.savePlayer(player);
  return { store, player, accountId, push() {}, agentModel: null };
}

test('field loot is frozen, banked only on victory, and not increased by taking more turns', t => {
  const ctx = setup(t);
  const result = dispatch(ctx, OP.SORTIE, { region: 3, unitIds: ['u_erin'] }) as { battleId: string };
  const record = ctx.store.battle(ctx.player.id, result.battleId)!;
  const loot = record.materialLoot!;
  assert.equal(loot.reduce((n, row) => n + row.count, 0), 4);
  assert.ok(loot.every(row => MATERIALS[row.item as keyof typeof MATERIALS].regions.includes(3)));
  const before = loot.map(row => ctx.store.countInventory(ctx.player.id, row.item));
  const leader = record.state.units.find(unit => unit.side === 'player')!;
  for (const enemy of record.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  record.state.turn = 18;
  ctx.store.saveBattle(record);
  const action = { battleId: record.id, unitId: leader.id, moveTo: leader.pos, action: 'wait', commandId: 'material-win' };
  dispatch(ctx, OP.UNIT_ACT, action);
  assert.deepEqual(loot.map(row => ctx.store.countInventory(ctx.player.id, row.item)), before.map((n, i) => n + loot[i].count));
  const inventory = ctx.store.inventory(ctx.player.id);
  dispatch(ctx, OP.UNIT_ACT, action);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
});

test('new runs freeze local material bundles; legacy run and battle settlements retain former rewards', t => {
  const ctx = setup(t);
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  const run = createRun('new', ctx.player.id, 3, [unit.id], 1, 0);
  assert.equal(run.materialLoot!.length, 3);
  assert.ok(run.materialLoot!.flat().every(row => row.item === 'seed' || MATERIALS[row.item as keyof typeof MATERIALS].tier <= materialTier(run.level)));
  const record = createFieldBattle([unit], { region: 3, level: 1, cleared: 0, runId: run.id, stageIndex: 0, seed: 'run-materials' });
  record.state.result = { winner: 'player', reason: 'test' };
  const before = ctx.store.inventory(ctx.player.id);
  ctx.store.saveRun(run);
  handleRunOutcome(ctx.store, ctx.player, record);
  assert.deepEqual(ctx.store.run(ctx.player.id, run.id)!.pendingLoot, run.materialLoot![0]);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before, 'intermission does not bank materials');
  const legacy = createRun('old', ctx.player.id, 3, [unit.id], 1, 0);
  delete legacy.materialLoot; delete legacy.firstClearLoot;
  legacy.stageIndex = 2;
  ctx.store.saveRun(legacy);
  record.runId = legacy.id;
  handleRunOutcome(ctx.store, ctx.player, record);
  assert.deepEqual(ctx.store.run(ctx.player.id, legacy.id)!.pendingLoot, [...stageLoot(3, 2), ...dungeonFirstClearLoot(3)]);
  const oldBattle = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'old-field' });
  delete oldBattle.materialLoot;
  oldBattle.state.result = { winner: 'player', reason: 'test' };
  oldBattle.state.turn = 8;
  const herbs = ctx.store.countInventory(ctx.player.id, 'herb');
  applyBattleOutcome(ctx.store, ctx.player, oldBattle);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'herb'), herbs + 4);
});

test('dispatch freezes departure loot and legacy dispatches keep old material rewards', t => {
  const ctx = setup(t);
  const current = createDispatch('new-dispatch', ctx.player.id, 3, [], 10, 'swordsman', 'sword', 0);
  ctx.store.saveDispatch(current);
  const old = createDispatch('old-dispatch', ctx.player.id, 1, [], 10, 'swordsman', 'sword', 0);
  delete old.materialLoot; delete old.weaponLoot;
  ctx.store.saveDispatch(old);
  ctx.player.day = 4000;
  settleDispatches(ctx.store, ctx.player);
  const records = ctx.store.dispatches(ctx.player.id);
  assert.deepEqual(records.find(row => row.id === current.id)!.result!.materials, current.materialLoot);
  assert.deepEqual(records.find(row => row.id === old.id)!.result!.materials, dispatchMaterials(1, 10));
  const inventory = ctx.store.inventory(ctx.player.id);
  settleDispatches(ctx.store, ctx.player);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
});

test('planting a selected species checks every input, cannot bypass its day cost, and retries once', t => {
  const ctx = setup(t);
  const before = ctx.store.inventory(ctx.player.id);
  const day = ctx.player.day;
  assert.throws(() => dispatch(ctx, OP.PLANT, { recipeId: 'plant_ginseng' }), /缺少/);
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'plant_herb' }), /PLANT/);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before);
  assert.equal(ctx.player.day, day);
  ctx.store.addInventory(ctx.player.id, 'ginseng', 0, 1);
  const data = { recipeId: 'plant_ginseng', commandId: 'plant-selected' };
  dispatch(ctx, OP.PLANT, data);
  dispatch(ctx, OP.PLANT, data);
  assert.equal(ctx.player.day, day + 1);
  const order = ctx.store.productionOrders(ctx.player.id)[0];
  assert.deepEqual(order.output, recipeById('plant_ginseng')!.output);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'ginseng'), 0);
  ctx.player.flags.regionReputation = { 9: 100 };
  ctx.store.savePlayer(ctx.player);
  ctx.store.addInventory(ctx.player.id, 'ore', 0, 100);
  ctx.store.addInventory(ctx.player.id, 'hard_wood', 0, 100);
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'forge_silver_sword' }), /银矿/);
});
