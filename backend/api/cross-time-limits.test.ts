import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch, type Context } from './handlers.ts';
import { OP } from '../common/protocol/ops.ts';
import { ROSTER_LIMIT, createUnit } from '../common/game/model.ts';
import { CROSS_TIME_ROSTER, CROSS_TIME_SHARD, createCrossTimeRecruit } from '../common/game/cross-time.ts';

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'exchange-limits', undefined, '时空');
  player.day = 1000;
  player.flags.setupCompleted = true;
  player.flags.crossTime = { clearedNormal: true, exchanged: [] };
  store.savePlayer(player);
  store.addInventory(player.id, CROSS_TIME_SHARD, 0, 30);
  return { store, accountId, player, agentModel: null, push: () => {} };
}
function exchange(ctx: Context, index: number) {
  return dispatch(ctx, OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: CROSS_TIME_ROSTER[index].id, commandId: `exchange-${index}` }) as { unitId: string };
}

test('three living original-cycle slots; death, retirement and reincarnation release slots without erasing ledger', () => {
  for (const departure of ['dead', 'retired', 'cycle'] as const) {
    const ctx = setup();
    const first = exchange(ctx, 0);
    exchange(ctx, 1); exchange(ctx, 2);
    const before = ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD);
    assert.throws(() => exchange(ctx, 3));
    assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), before);
    const unit = ctx.store.unit(ctx.player.id, first.unitId)!;
    if (departure === 'cycle') unit.cycle = 1;
    else unit.status = departure;
    ctx.store.saveUnit(unit, ctx.player.id);
    exchange(ctx, 3);
    assert.throws(() => dispatch(ctx, OP.EXCHANGE_CROSS_TIME_RECRUIT, { identityId: CROSS_TIME_ROSTER[0].id, commandId: 'again' }));
    assert.ok(ctx.player.flags.crossTime?.exchanged?.includes(CROSS_TIME_ROSTER[0].id));
  }
});

test('roster capacity and insufficient shards reject without consuming identity', () => {
  const ctx = setup();
  while (ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length < ROSTER_LIMIT) {
    const id = `filler-${ctx.store.units(ctx.player.id).length}`;
    ctx.store.addUnit(ctx.player.id, createUnit('erin', 1, id, ctx.player.day));
  }
  assert.throws(() => exchange(ctx, 0));
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 30);
  assert.deepEqual(ctx.player.flags.crossTime?.exchanged, []);
  const other = setup();
  other.store.takeInventory(other.player.id, CROSS_TIME_SHARD, 28);
  assert.throws(() => exchange(other, 0));
  assert.equal(other.store.countInventory(other.player.id, CROSS_TIME_SHARD), 2);
  assert.deepEqual(other.player.flags.crossTime?.exchanged, []);
});

test('shards stay in warehouse: cannot sell, use or transfer to a unit', () => {
  const ctx = setup();
  const unit = createCrossTimeRecruit(CROSS_TIME_ROSTER[0].id, 'key-test', ctx.player.day);
  ctx.store.addUnit(ctx.player.id, unit);
  for (const [op, data] of [
    [OP.SELL, { item: CROSS_TIME_SHARD, count: 1 }],
    [OP.USE_ITEM, { item: CROSS_TIME_SHARD, unitId: unit.id }],
    [OP.TRANSFER_ITEM, { item: CROSS_TIME_SHARD, unitId: unit.id, action: 'toUnit' }],
  ] as const) assert.throws(() => dispatch(ctx, op, data));
  assert.equal(ctx.store.countInventory(ctx.player.id, CROSS_TIME_SHARD), 30);
});
