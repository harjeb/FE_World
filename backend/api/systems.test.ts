import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { recordDeath, recordRating, settleMonthlyRatings, flushRecoveryBag, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { periodIdFor } from '../common/game/ratings.ts';
import { classMasteryOf } from '../common/game/mastery.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'systems', undefined, '测试军团');
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

test('a dispatch runs in parallel on the personal calendar and settles once', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const start = dispatch(ctx, OP.START_DISPATCH, { region: 1, unitIds: ['u_karl', 'u_ig'], durationDays: 5, classId: 'fighter', weaponType: 'axe' }) as
    { dispatch: { id: string; returnDay: number } };
  assert.equal(start.dispatch.returnDay, player.day + 5);
  assert.equal(player.day, 209, 'starting a dispatch does not advance the calendar by itself');
  assert.equal(store.unit(player.id, 'u_karl')!.lockedDispatchId, start.dispatch.id);
  // A dispatched unit cannot join a battle.
  assert.throws(() => dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_karl'] }), /远征或派遣/);
  // But free units can still do other things in parallel.
  const other = dispatch(ctx, OP.START_DISPATCH, { region: 2, unitIds: ['u_owen'], durationDays: 3, classId: 'archer', weaponType: 'bow' }) as { dispatch: { id: string } };
  assert.ok(other.dispatch.id);
  const masteryBefore = classMasteryOf(store.unit(player.id, 'u_karl')!, 'fighter');
  const expBefore = store.unit(player.id, 'u_karl')!.exp + store.unit(player.id, 'u_karl')!.level * 100;
  // Advance the personal calendar: both dispatches settle on their own return day.
  player.day += 3;
  dispatch(ctx, OP.GET_DISPATCHES, {});
  assert.equal(store.unit(player.id, 'u_owen')!.lockedDispatchId ?? null, null, 'the 3-day dispatch returned');
  assert.equal(store.unit(player.id, 'u_karl')!.lockedDispatchId, start.dispatch.id, 'the 5-day dispatch is still away');
  player.day += 2;
  const view = dispatch(ctx, OP.GET_DISPATCHES, {}) as { running: unknown[]; history: { id: string; result: { unitRewards: unknown[] } | null }[] };
  assert.equal(view.running.length, 0);
  assert.equal(store.unit(player.id, 'u_karl')!.lockedDispatchId ?? null, null);
  assert.ok(classMasteryOf(store.unit(player.id, 'u_karl')!, 'fighter') > masteryBefore, 'training grants class mastery');
  const karl = store.unit(player.id, 'u_karl')!;
  assert.ok(karl.exp + karl.level * 100 > expBefore, 'training grants character experience');
  const settled = view.history.find(h => h.id === start.dispatch.id)!;
  assert.equal(settled.result!.unitRewards.length, 2);
});

test('dispatches reject busy units, invalid days and locked annual rosters', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { region: 1, unitIds: ['u_karl'], durationDays: 0 }), /天数/);
  assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { region: 1, unitIds: [], durationDays: 3 }), /至少/);
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_karl', 'u_ig'] });
  assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { region: 1, unitIds: ['u_karl'], durationDays: 3 }), /大竞技场名单/);
});

test('the real-month rating resets on the worker boundary without touching the personal calendar', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const now = Date.now();
  recordRating(store, player.id, 3, 1, 'arena', now);
  const currentId = periodIdFor(now);
  const current = (dispatch(ctx, OP.GET_RATINGS, {}) as { current: { wins: number; losses: number; rating: number; rank: number | null } }).current;
  assert.equal(current.wins, 3);
  assert.equal(current.losses, 1);
  assert.ok(current.rating > 0);
  assert.equal(current.rank, 1);
  const day = player.day;
  // Move to the next real month and run the worker settlement.
  const nextMonth = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 15);
  const result = settleMonthlyRatings(store, nextMonth);
  assert.ok(result.archived.includes(currentId));
  assert.equal(player.day, day, 'real-month reset never advances the personal day');
  const reward = store.monthlyReward(currentId, player.id);
  assert.ok(reward);
  assert.equal(reward.finalRank, 1);
  assert.equal(reward.claimedAt, null);
  // New month starts from zero.
  assert.equal(store.rating(result.active, player.id), null);
  const claimed = dispatch(ctx, OP.CLAIM_RATING_REWARD, { periodId: currentId }) as { gold: number };
  assert.ok(claimed.gold > 0);
  assert.throws(() => dispatch(ctx, OP.CLAIM_RATING_REWARD, { periodId: currentId }), /领取过/);
});

test('a class can be switched for free once the qualification is owned', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  player.gold = 200_000;
  dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_erin', classId: 'swordsman' });
  const switched = dispatch(ctx, OP.SWITCH_CLASS, { unitId: 'u_erin', classId: 'swordsman' }) as { classId: string };
  assert.equal(switched.classId, 'swordsman');
  // Switching back to the character's own class is free too.
  dispatch(ctx, OP.SWITCH_CLASS, { unitId: 'u_erin', classId: 'swordsman' });
  // An unowned cross-route class is refused.
  assert.throws(() => dispatch(ctx, OP.SWITCH_CLASS, { unitId: 'u_erin', classId: 'cavalier' }), /资格/);
});

test('class qualification purchases are limited per real month, switching back is free', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  player.gold = 1_000_000;
  for (const classId of ['swordsman', 'cavalier', 'archer']) {
    dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_erin', classId });
  }
  assert.throws(() => dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_erin', classId: 'mage' }), /上限/);
  // Switching back to an owned class is free and does not consume the monthly quota.
  dispatch(ctx, OP.SWITCH_CLASS, { unitId: 'u_erin', classId: 'cavalier' });
  const market = dispatch(ctx, OP.GET_CLASS_MARKET, { unitId: 'u_erin' }) as { monthUsed: number; monthLimit: number };
  assert.equal(market.monthUsed, 3);
  assert.equal(market.monthLimit, 3);
});

test('equipping more than five learned skills is refused', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_erin')!;
  unit.learnedSkills = ['opening', 'keen', 'nimble', 'hawkeye', 'focus', 'charge'];
  store.saveUnit(unit, player.id);
  assert.throws(() => dispatch(ctx, OP.EQUIP_SKILLS, { unitId: 'u_erin', skills: ['opening', 'keen', 'nimble', 'hawkeye', 'focus', 'charge'] }), /最多/);
  const ok = dispatch(ctx, OP.EQUIP_SKILLS, { unitId: 'u_erin', skills: ['opening', 'keen'] }) as { equippedSkills: string[] };
  assert.deepEqual(ok.equippedSkills, ['opening', 'keen']);
});

test('equipment from a death during an activity waits in the recovery bag until it ends', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_karl')!;
  unit.level = 20;
  unit.weapons = ['steel_axe'];
  unit.items = [{ id: 'vulnerary', uses: 2 }];
  store.saveUnit(unit, player.id);
  const axes = store.countInventory(player.id, 'steel_axe');
  // Deferred recovery (a death inside a dungeon run): the gear is not in the warehouse yet.
  recordDeath(store, player, unit, 'death', 'battle-x', true);
  assert.equal(store.countInventory(player.id, 'steel_axe'), axes, 'not available mid-activity');
  assert.equal((player.flags.recoveryBag ?? []).length, 2);
  flushRecoveryBag(store, player);
  assert.equal(store.countInventory(player.id, 'steel_axe'), axes + 1);
  assert.equal((player.flags.recoveryBag ?? []).length, 0);
  // An immediate (single-battle) death goes straight to the warehouse.
  const other = store.unit(player.id, 'u_ig')!;
  other.weapons = ['steel_axe'];
  store.saveUnit(other, player.id);
  const before = store.countInventory(player.id, 'steel_axe');
  recordDeath(store, player, other, 'death', 'battle-y', false);
  assert.equal(store.countInventory(player.id, 'steel_axe'), before + 1);
});
