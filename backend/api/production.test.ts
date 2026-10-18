import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'production', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

test('planting spends a seed and one day, then matures into herbs', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const view = dispatch(ctx, OP.GET_PRODUCTION, {}) as { facilities: { id: string; slots: number; used: number }[]; recipes: { id: string }[] };
  assert.ok(view.recipes.some(r => r.id === 'plant_herb'));
  assert.equal(view.facilities.find(f => f.id === 'garden')!.slots, 2);
  const seeds = store.countInventory(player.id, 'seed');
  const day = player.day;
  const planted = dispatch(ctx, OP.PLANT, {}) as { order: { id: string; readyDay: number; state: string } };
  assert.equal(player.day, day + 1);
  assert.equal(store.countInventory(player.id, 'seed'), seeds - 1);
  assert.equal(planted.order.state, 'growing');
  // Mature without spending extra days, then collect.
  player.day = planted.order.readyDay;
  const ready = dispatch(ctx, OP.GET_PRODUCTION, {}) as { ready: string[] };
  assert.ok(ready.ready.includes(planted.order.id));
  const herbs = store.countInventory(player.id, 'herb');
  const collectDay = player.day;
  const out = dispatch(ctx, OP.COLLECT_PRODUCTION, { orderId: planted.order.id }) as { count: number };
  assert.equal(out.count, 2);
  assert.equal(store.countInventory(player.id, 'herb'), herbs + 2);
  assert.equal(player.day, collectDay, 'collecting spends no day');
  assert.throws(() => dispatch(ctx, OP.COLLECT_PRODUCTION, { orderId: planted.order.id }), /领取过/);
});

test('garden slots are limited and parallel orders share the same calendar', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  store.addInventory(player.id, 'seed', 0, 5);
  dispatch(ctx, OP.PLANT, {});
  dispatch(ctx, OP.PLANT, {});
  assert.throws(() => dispatch(ctx, OP.PLANT, {}), /工位已满/);
});

test('brewing consumes herbs on start and yields a vulnerary once mature', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  store.addInventory(player.id, 'herb', 0, 3);
  const day = player.day;
  const herbsBefore = store.countInventory(player.id, 'herb');
  const started = dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'brew_vulnerary' }) as { order: { id: string; readyDay: number } };
  assert.equal(player.day, day, 'starting production does not advance the calendar by itself');
  assert.equal(store.countInventory(player.id, 'herb'), herbsBefore - 3);
  assert.equal(started.order.readyDay, day + 3);
  // A second order cannot start while the single apothecary slot is busy.
  store.addInventory(player.id, 'herb', 0, 3);
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'brew_vulnerary' }), /工位已满/);
  player.day = started.order.readyDay;
  const vulneraries = store.countInventory(player.id, 'vulnerary');
  dispatch(ctx, OP.COLLECT_PRODUCTION, { orderId: started.order.id });
  assert.equal(store.countInventory(player.id, 'vulnerary'), vulneraries + 1);
});

test('silver and brave weapons are ordinary smithy recipes', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  store.addInventory(player.id, 'ore', 0, 100);
  store.addInventory(player.id, 'wood', 0, 100);
  player.flags.regionReputation = { 9: 250 };
  store.savePlayer(player);
  const recipes = (dispatch(ctx, OP.GET_PRODUCTION, {}) as { recipes: { id: string; unlocked: boolean }[] }).recipes;
  for (const id of ['forge_silver_sword', 'forge_silver_bow', 'forge_brave_lance', 'forge_brave_bow']) {
    assert.equal(recipes.find(r => r.id === id)?.unlocked, true, id);
  }
  const started = dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'forge_silver_sword' }) as { order: { id: string; readyDay: number } };
  player.day = started.order.readyDay;
  dispatch(ctx, OP.COLLECT_PRODUCTION, { orderId: started.order.id });
  assert.equal(store.countInventory(player.id, 'silver_sword'), 1);
});

test('reputation recipes stay locked until the region reputation is high enough', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  store.addInventory(player.id, 'ore', 0, 20);
  store.addInventory(player.id, 'wood', 0, 20);
  const view = dispatch(ctx, OP.GET_PRODUCTION, {}) as { recipes: { id: string; unlocked: boolean; requires: { region: number; reputation: number } | null }[] };
  const locked = view.recipes.find(r => r.id === 'forge_killer_bow')!;
  assert.equal(locked.unlocked, false);
  assert.equal(locked.requires?.reputation, 100);
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'forge_killer_bow' }), /声望/);
  player.flags.regionReputation = { 2: 100 };
  store.savePlayer(player);
  const unlocked = (dispatch(ctx, OP.GET_PRODUCTION, {}) as { recipes: { id: string; unlocked: boolean }[] }).recipes.find(r => r.id === 'forge_killer_bow')!;
  assert.equal(unlocked.unlocked, true);
  const started = dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'forge_killer_bow' }) as { order: { id: string } };
  assert.ok(started.order.id);
});

test('production rejects missing inputs and repairs damaged weapon durability', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // Drain the seed stock so the next order has no input.
  store.takeInventory(player.id, 'herb', store.countInventory(player.id, 'herb'));
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'brew_vulnerary' }), /缺少/);
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'nope' }), /配方/);
  const unit = store.unit(player.id, 'u_erin')!;
  const row = unit.weaponInstances![0];
  const item = row.id;
  row.durability = 1;
  store.saveUnit(unit, player.id);
  const repaired = dispatch(ctx, OP.REPAIR_ITEM, { unitId: 'u_erin', item }) as { durability: [number, number][] };
  assert.equal(repaired.durability[0][0], repaired.durability[0][1]);
});
