import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { OP } from '../common/protocol/ops.ts';
import { CHALLENGE_FLOORS } from '../common/game/challenges.ts';
import { EQUIPMENT_ART_LINKS } from '../common/data/expanded-weapons.ts';

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'equipment-rewards', undefined, '挑战军团');
  return { store, accountId, player, agentModel: null, push: () => {} };
}
function claim(ctx: Context, floorId = 'tower-1', commandId?: string) {
  return dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId, ...(commandId ? { commandId } : {}) }) as {
    gold: number; items: [string, number][]; equipment: string[];
  };
}

test('tower placements cover the 36 equipment grant sources exactly once in frozen order', () => {
  const weapons = [...new Set(EQUIPMENT_ART_LINKS.map(link => link.projectWeaponId))];
  assert.equal(weapons.length, 36);
  const placed = CHALLENGE_FLOORS.flatMap(f => f.equipment);
  assert.equal(placed.length, 36);
  assert.equal(new Set(placed).size, 36);
  CHALLENGE_FLOORS.forEach((floor, i) => assert.deepEqual(floor.equipment, weapons.filter((_, index) => index % 3 === i)));
});

test('first clear pays normal and equipment once; receipts and repeats do not duplicate gear', () => {
  const ctx = setup();
  ctx.player.flags.towerCleared = ['tower-1'];
  const before = ctx.store.inventory(ctx.player.id);
  const view = dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: { equipment: string[]; claimedEquipment: boolean }[] };
  assert.deepEqual(view.floors[0].equipment, CHALLENGE_FLOORS[0].equipment);
  assert.equal(view.floors[0].claimedEquipment, false);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), before);
  const first = claim(ctx, 'tower-1', 'gear-first');
  assert.equal(first.gold, CHALLENGE_FLOORS[0].first.gold);
  assert.deepEqual(first.items, CHALLENGE_FLOORS[0].first.items);
  assert.deepEqual(first.equipment, CHALLENGE_FLOORS[0].equipment);
  const inventory = ctx.store.inventory(ctx.player.id);
  assert.deepEqual(claim(ctx, 'tower-1', 'gear-first'), first);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
  const repeat = claim(ctx);
  assert.equal(repeat.gold, CHALLENGE_FLOORS[0].repeat.gold);
  assert.deepEqual(repeat.equipment, []);
  assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
  assert.throws(() => claim(ctx), /已经领取/);
});

test('legacy normal claims permit equipment-only recovery exactly once', () => {
  const ctx = setup();
  ctx.player.flags.towerCleared = ['tower-1'];
  ctx.player.flags.challengeRewardsClaimed = ['tower-1:first', 'tower-1:repeat'];
  const gold = ctx.player.gold;
  const result = claim(ctx);
  assert.equal(result.gold, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.equipment, CHALLENGE_FLOORS[0].equipment);
  assert.equal(ctx.player.gold, gold);
  assert.ok(ctx.player.flags.challengeRewardsClaimed.includes('tower-1:equipment-v1'));
  assert.throws(() => claim(ctx), /已经领取/);
});

test('equipment claims require a clear and final-floor story unlock', () => {
  const ctx = setup();
  assert.throws(() => claim(ctx), /尚未通关/);
  ctx.player.flags.towerCleared = ['tower-3'];
  assert.throws(() => claim(ctx, 'tower-3'), /第八章/);
  ctx.player.flags.storyCompleted = [8];
  assert.deepEqual(claim(ctx, 'tower-3').equipment, CHALLENGE_FLOORS[2].equipment);
});
