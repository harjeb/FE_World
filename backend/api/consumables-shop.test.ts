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
import { GAME_ITEMS, isCentralShopItem, SHOP_STOCK } from '../common/game/items.ts';

function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'consumables-shop');
  seedFullRoster(store, player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push() {} };
}

type Row = { item: string; price: number; basePrice: number; stock: number; kind: string };
const shop = (ctx: Context) => (dispatch(ctx, OP.GET_SHOP, {}) as { items: Row[] }).items;

test('the capital shop sells the elixir and the antidote at their catalogue prices with limited stock', t => {
  const ctx = setup(t);
  assert.deepEqual(SHOP_STOCK.filter(row => row.item === 'elixir' || row.item === 'antidote'), [{ item: 'antidote', stock: 3 }, { item: 'elixir', stock: 2 }]);
  assert.ok(isCentralShopItem('elixir') && isCentralShopItem('antidote'));
  const rows = shop(ctx);
  const elixir = rows.find(r => r.item === 'elixir')!, antidote = rows.find(r => r.item === 'antidote')!;
  assert.deepEqual([elixir.basePrice, elixir.stock, elixir.kind], [GAME_ITEMS.elixir.price, 2, 'consumable']);
  assert.deepEqual([antidote.basePrice, antidote.stock, antidote.kind], [GAME_ITEMS.antidote.price, 3, 'consumable']);

  ctx.player.gold = 100_000;
  ctx.store.savePlayer(ctx.player);
  dispatch(ctx, OP.BUY, { item: 'elixir', count: 2 });
  dispatch(ctx, OP.BUY, { item: 'antidote', count: 3 });
  assert.equal(ctx.store.countInventory(ctx.player.id, 'elixir'), 2);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'antidote'), 3);
  assert.equal(ctx.store.inventory(ctx.player.id).find(r => r.item === 'antidote')!.uses, 2, 'each antidote comes with its two uses');
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'elixir', count: 1 }), /库存不足/, 'only two elixirs a season');
});

test('an existing save gains the new consumables without losing what it already spent', t => {
  const ctx = setup(t);
  // Simulate an old save: the two new rows are missing and a potion has been bought down to 1.
  ctx.store.db.prepare("DELETE FROM shop WHERE player_id = ? AND item IN ('elixir', 'antidote')").run(ctx.player.id);
  ctx.store.setShopStock(ctx.player.id, 'vulnerary', 1);
  assert.ok(!ctx.store.shop(ctx.player.id).some(r => r.item === 'elixir'));
  ctx.store.ensureShopRows(ctx.player.id);
  const rows = ctx.store.shop(ctx.player.id);
  assert.equal(rows.find(r => r.item === 'elixir')!.stock, 2);
  assert.equal(rows.find(r => r.item === 'antidote')!.stock, 3);
  assert.equal(rows.find(r => r.item === 'vulnerary')!.stock, 1, 'spent stock is not refilled');
});

test('advanced capital shop items open by year; basics are there from the start', t => {
  const ctx = setup(t);
  const at = (day: number) => {
    ctx.player.day = day;
    ctx.store.savePlayer(ctx.player);
    const view = dispatch(ctx, OP.GET_SHOP, {}) as { items: Row[]; locked: { item: string; name: string; openDay: number }[] };
    return { open: new Set(view.items.map(r => r.item)), locked: view.locked };
  };
  const stat = ['energy_drop', 'secret_book', 'speedwing', 'goddess_icon', 'dracoshield', 'talisman'];
  const year1 = at(0);
  for (const item of ['vulnerary', 'antidote', 'herb', 'ether_ration', 'seal_promote']) assert.ok(year1.open.has(item), `${item} is sold from the start`);
  for (const item of ['elixir', 'full_meal', 'immortal_shield', ...stat]) assert.ok(!year1.open.has(item), `${item} is not sold in year 1`);
  assert.deepEqual(year1.locked.map(r => r.item).sort(), ['elixir', 'full_meal', 'immortal_shield', ...stat].sort(), 'the locked list names what will open');
  assert.deepEqual(year1.locked.filter(r => r.item === 'immortal_shield').map(r => r.openDay), [1000]);
  assert.equal(year1.locked.find(r => r.item === 'elixir')!.openDay, 500);
  ctx.player.gold = 1_000_000;
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'elixir', count: 1 }), /第 2 年.*才上架/);
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'speedwing', count: 1 }), /才上架/);
  dispatch(ctx, OP.BUY, { item: 'antidote', count: 1 });

  const year2 = at(500);
  for (const item of ['elixir', 'full_meal', ...stat]) assert.ok(year2.open.has(item), `${item} opens in year 2`);
  assert.ok(!year2.open.has('immortal_shield'));
  dispatch(ctx, OP.BUY, { item: 'elixir', count: 1 });
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'immortal_shield', count: 1 }), /第 3 年/);

  const year3 = at(1000);
  assert.ok(year3.open.has('immortal_shield'));
  assert.deepEqual(year3.locked, [], 'nothing is left to open');
  dispatch(ctx, OP.BUY, { item: 'immortal_shield', count: 1 });
});
