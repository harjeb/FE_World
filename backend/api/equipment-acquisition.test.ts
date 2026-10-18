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
import { BOUND_WEAPONS, isBoundWeapon } from '../common/game/items.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'equipment', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

test('unique quest and tower weapons are bound and cannot be sold', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  for (const weapon of ['royal_sword', 'divine_lance', 'master_lance', 'fw_weapon_228']) {
    assert.equal(isBoundWeapon(weapon), true, weapon);
  }
  assert.equal(isBoundWeapon('silver_sword'), false, 'silver weapons are ordinary forgeable gear');
  assert.equal(isBoundWeapon('brave_lance'), false, 'brave weapons are ordinary forgeable gear');

  store.addInventory(player.id, 'royal_sword', 0, 1);
  assert.throws(() => dispatch(ctx, OP.SELL, { item: 'royal_sword', count: 1 }), /绑定|不能出售/);
  assert.equal(store.countInventory(player.id, 'royal_sword'), 1, 'the rejected sale keeps the weapon');

  const before = player.gold;
  store.addInventory(player.id, 'silver_sword', 0, 1);
  dispatch(ctx, OP.SELL, { item: 'silver_sword', count: 1 });
  assert.ok(player.gold > before, 'ordinary silver weapons remain sellable');
  assert.equal(store.countInventory(player.id, 'silver_sword'), 0);
});

test('the bound set covers the tower signature A-rank weapons only', () => {
  const towerA = [
    'fw_weapon_88', 'fw_weapon_228', 'fw_weapon_225',
    'fw_weapon_71', 'fw_weapon_155', 'fw_weapon_213', 'fw_weapon_223',
    'fw_weapon_49', 'fw_weapon_48', 'fw_weapon_161', 'fw_weapon_215', 'fw_weapon_224',
  ];
  for (const weapon of towerA) assert.equal(BOUND_WEAPONS.has(weapon as never), true, weapon);
  assert.equal(BOUND_WEAPONS.has('killing_edge' as never), false);
  assert.equal(BOUND_WEAPONS.has('longbow' as never), false);
});
