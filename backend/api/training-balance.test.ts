import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { classMasteryOf, gainMastery, MASTERY_PER_BATTLE, MASTERY_PER_WIN, MASTERY_PER_TRAIN_DAY } from '../common/game/mastery.ts';
import { createUnit } from '../common/game/model.ts';
import { SHOP_STOCK } from '../common/game/items.ts';

function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { accountId, player } = loginOrRegister(store, 'training-balance');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push() {} };
}

test('training preview and execution grant exactly 3 weapon XP for 3 days, once per command', t => {
  const ctx = setup(t);
  const before = ctx.store.unit(ctx.player.id, 'u_erin')!;
  const day = ctx.player.day, gold = ctx.player.gold;
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { actions: { key: string; costDays: number; costGold: number; weaponExp: number }[] };
  assert.deepEqual(today.actions.filter(a => a.key === 'train').map(a => [a.costDays, a.costGold, a.weaponExp]), [[3, 200, 3]]);
  const payload = { unitId: before.id, weaponType: 'sword', commandId: 'training-once' };
  const result = dispatch(ctx, OP.TRAIN, payload) as { weaponExpGained: number; expBefore: number; expAfter: number };
  assert.equal(result.weaponExpGained, 3);
  assert.equal(result.expAfter - result.expBefore, 3);
  assert.equal(ctx.player.day, day + 3);
  assert.equal(ctx.player.gold, gold - 200);
  const after = ctx.store.unit(ctx.player.id, before.id)!;
  assert.deepEqual([after.level, after.exp, after.stats, after.classMastery], [before.level, before.exp, before.stats, before.classMastery]);
  dispatch(ctx, OP.TRAIN, payload);
  assert.equal(ctx.store.unit(ctx.player.id, before.id)!.weaponExp.sword, result.expAfter);
  assert.equal(ctx.player.day, day + 3);
});

test('mastery gains halve exactly, including fractional training, while lower classes grant none', () => {
  assert.deepEqual([MASTERY_PER_BATTLE, MASTERY_PER_WIN, MASTERY_PER_TRAIN_DAY], [4, 2, 1.5]);
  for (const classId of ['commoner', 'noble', 'gladiator', 'hunter', 'lancer', 'adept', 'beast_cub', 'awakened'] as const) {
    const unit = createUnit('erin', 1, classId, 0, true, { classId });
    unit.learnedSkills = ['keen']; unit.learnedArts = ['ground_cut'];
    gainMastery(unit, 1000);
    assert.equal(classMasteryOf(unit), 0, classId);
    assert.deepEqual(unit.learnedSkills, ['keen']);
    assert.deepEqual(unit.learnedArts, ['ground_cut']);
  }
});

test('shop cap applies to old unsold stock without refilling sold goods or touching owned items', t => {
  const ctx = setup(t);
  assert.ok(SHOP_STOCK.every(row => row.stock >= 1 && row.stock <= 3));
  ctx.store.setShopStock(ctx.player.id, 'vulnerary', 8);
  ctx.store.setShopStock(ctx.player.id, 'antidote', 0);
  const owned = ctx.store.countInventory(ctx.player.id, 'vulnerary');
  ctx.store.ensureShopRows(ctx.player.id);
  const stock = ctx.store.shop(ctx.player.id);
  assert.equal(stock.find(row => row.item === 'vulnerary')!.stock, 3);
  assert.equal(stock.find(row => row.item === 'antidote')!.stock, 0);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'vulnerary'), owned);
});
