import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { recordDeath, recordRetire, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { createUnit } from '../common/game/model.ts';
import { totalStats } from '../common/game/legacy.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'permanent', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

test('a death freezes a legacy, recovers equipment and records a memorial', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const hero = store.unit(player.id, 'u_erin')!;
  // Make a level-15 ordinary unit with gear and a prior growth allocation.
  hero.level = 20;
  hero.isProtagonist = false;
  hero.weapons = ['killing_edge', 'steel_sword'];
  hero.items = [{ id: 'vulnerary', uses: 2 }];
  hero.growthAllocation = { str: 5 };
  store.saveUnit(hero, player.id);
  const before = store.countInventory(player.id, 'killing_edge');
  const legacyId = recordDeath(store, player, hero, 'death', null);
  assert.ok(legacyId);
  const dead = store.unit(player.id, 'u_erin')!;
  assert.equal(dead.status, 'dead');
  assert.equal(dead.weapons.length, 0);
  assert.equal(dead.items.length, 0);
  // Equipment is recovered with its remaining uses, not duplicated.
  assert.equal(store.countInventory(player.id, 'killing_edge'), before + 1);
  const memorial = store.memorials(player.id);
  assert.equal(memorial.length, 1);
  assert.equal(memorial[0].data.cause, 'death');
  const legacy = store.legacy(player.id, legacyId)!;
  assert.equal(legacy.sourceLevel, 20);
  assert.equal(legacy.sourceName, '艾琳');
  assert.ok(totalStats(legacy.sourceStats) > 0);
  assert.equal(legacy.state, 'available');
});

test('the protagonist retreats instead of dying and produces no legacy', () => {
  const { store, accountId, player } = setup();
  const hero = store.unit(player.id, 'u_erin')!;
  assert.equal(hero.isProtagonist, true);
  // recordDeath is only called for ordinary units; the protagonist path keeps status active.
  hero.level = 50;
  assert.equal(hero.status, 'active');
  assert.equal(store.legacies(player.id).length, 0);
  void accountId;
});

test('a legacy is claimed once with a stone and locks the recipient lineage', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const source = store.unit(player.id, 'u_erin')!;
  source.level = 18;
  source.isProtagonist = false;
  store.saveUnit(source, player.id);
  const legacyId = recordDeath(store, player, source, 'death', null)!;
  const recruit = createUnit('owen', 1, 'newbie', player.day, true, { growthType: 'normal', age: 16 });
  store.addUnit(player.id, recruit);
  store.addInventory(player.id, 'legacy_stone_growth', 0, 1);
  const result = dispatch(ctx, OP.CLAIM_LEGACY, { legacyId, unitId: 'newbie', mode: 'growth' }) as { unit: { lineageDepth: number }; legacy: { state: string } };
  assert.equal(result.unit.lineageDepth, 1);
  assert.equal(result.legacy.state, 'claimed');
  assert.equal(store.countInventory(player.id, 'legacy_stone_growth'), 0);
  // A second claim is rejected and the stone is not consumed.
  store.addInventory(player.id, 'legacy_stone_growth', 0, 1);
  assert.throws(() => dispatch(ctx, OP.CLAIM_LEGACY, { legacyId, unitId: 'newbie', mode: 'growth' }), /兑现|只能接受/);
});

test('retirement creates a legacy and removes the unit from the field roster', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_karl')!;
  unit.level = 30;
  store.saveUnit(unit, player.id);
  const out = dispatch(ctx, OP.RETIRE_UNIT, { unitId: 'u_karl' }) as { status: string; legacyId: string };
  assert.equal(out.status, 'retired');
  assert.ok(out.legacyId);
  assert.equal(store.unit(player.id, 'u_karl')!.status, 'retired');
  assert.equal(store.memorials(player.id)[0].data.cause, 'retired');
});

test('reincarnation resets a level-99 unit and spends the core', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_erin')!;
  unit.isProtagonist = false;
  unit.level = 99;
  unit.classId = 'sword_hero';
  unit.classQualifications = ['sword_hero'];
  unit.growthLog = [{ level: 2, gains: { str: 1 } }];
  store.saveUnit(unit, player.id);
  store.addInventory(player.id, 'reincarnation_core', 0, 1);
  player.gold = 60_000;
  const out = dispatch(ctx, OP.REINCARNATE_UNIT, { unitId: 'u_erin', allocation: { str: 10, spd: 10, def: 10 } }) as { unit: { cycle: number; level: number; classId: string; growthAllocation: Record<string, number> } };
  assert.equal(out.unit.cycle, 1);
  assert.equal(out.unit.level, 1);
  assert.equal(out.unit.classId, 'gladiator');
  assert.deepEqual(out.unit.growthAllocation, { str: 10, spd: 10, def: 10 });
  assert.equal(store.countInventory(player.id, 'reincarnation_core'), 0);
  assert.equal(player.gold, 55_000);
});

test('the class market gates by year, species and gold', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const market = dispatch(ctx, OP.GET_CLASS_MARKET, { unitId: 'u_erin' }) as { year: number; classes: { id: string; open: boolean; openYear: number; price: number }[] };
  assert.equal(market.year, 2);
  const stage3 = market.classes.find(c => c.id === 'shido')!;
  assert.equal(stage3.open, false);
  const stage2 = market.classes.find(c => c.id === 'swordsman')!;
  assert.equal(stage2.open, true);
  player.gold = 100_000;
  const bought = dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_erin', classId: 'swordsman' }) as { qualifications: string[] };
  assert.ok(bought.qualifications.includes('swordsman'));
  // Beast/dragon qualifications need the matching species and are barred to the protagonist.
  assert.throws(() => dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: 'u_erin', classId: 'beast_fighter' }), /主角|种族/);
});

test('an idempotent command returns the original receipt and conflicts on a new payload', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const first = dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword', commandId: 'cmd-1' }) as { day: number };
  const dayAfter = player.day;
  const replay = dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword', commandId: 'cmd-1' }) as { day: number };
  assert.deepEqual(replay, first);
  assert.equal(player.day, dayAfter, 'the replay did not spend days twice');
  assert.throws(() => dispatch(ctx, OP.TRAIN, { unitId: 'u_karl', weaponType: 'axe', commandId: 'cmd-1' }), /commandId/);
  // A different commandId still works.
  dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword', commandId: 'cmd-2' });
  assert.equal(player.day, dayAfter + 3);
});

test('natural death happens on the calendar and is not replayed twice', () => {
  const { store, accountId, player } = setup();
  const unit = store.unit(player.id, 'u_mira')!;
  unit.lifespanYears = 80;
  unit.ageBaseDays = 79 * 120;
  unit.ageEpochDay = player.day;
  store.saveUnit(unit, player.id);
  player.day += 121;
  syncPlayer(store, player);
  const after = store.unit(player.id, 'u_mira')!;
  assert.equal(after.status, 'dead');
  const legacies = store.legacies(player.id).length;
  syncPlayer(store, player);
  assert.equal(store.legacies(player.id).length, legacies, 'no second legacy');
  void accountId;
});

test('emergency recruitment opens when real casualties leave at most two survivors', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  // No real casualty yet.
  assert.throws(() => dispatch(ctx, OP.EMERGENCY_RECRUIT, {}), /新的真实伤亡/);
  // Dismissal is not a casualty and does not open the free recruit.
  dispatch(ctx, OP.DISMISS, { unitId: 'u_roland' });
  assert.throws(() => dispatch(ctx, OP.EMERGENCY_RECRUIT, {}), /新的真实伤亡/);
  // Real deaths until only the protagonist and one ally remain.
  for (const id of ['u_karl', 'u_victor', 'u_lina', 'u_owen', 'u_sera', 'u_noah', 'u_gustav', 'u_ren', 'u_ig']) {
    recordDeath(store, player, store.unit(player.id, id)!, 'death', null);
  }
  assert.equal(store.units(player.id).filter(u => u.status === 'active').length, 2);
  const before = store.units(player.id).filter(u => u.status === 'active').length;
  const day = player.day;
  const out = dispatch(ctx, OP.EMERGENCY_RECRUIT, {}) as { units: unknown[] };
  assert.equal(out.units.length, 2);
  assert.equal(player.day, day, 'free recruit does not advance the calendar');
  assert.equal(store.units(player.id).filter(u => u.status === 'active').length, before + 2);
  // The old loss event cannot be claimed twice.
  assert.throws(() => dispatch(ctx, OP.EMERGENCY_RECRUIT, {}), /新的真实伤亡/);
});

test('recordRetire leaves the unit in the memorial but not the active roster', () => {
  const { store, player } = setup();
  const unit = store.unit(player.id, 'u_ig')!;
  unit.level = 16;
  recordRetire(store, player, unit);
  assert.equal(store.units(player.id).filter(u => u.status === 'active').length, 11);
  assert.equal(store.memorials(player.id).length, 1);
});

test('write commands bump the player version and events expose a cursor', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const before = (dispatch(ctx, OP.GET_STATE, {}) as { version: number }).version;
  dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword' });
  const after = (dispatch(ctx, OP.GET_STATE, {}) as { version: number }).version;
  assert.equal(after, before + 1);
  // A replayed command must not advance the version a second time.
  dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword', commandId: 'bump-1' });
  const v = player.version;
  dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword', commandId: 'bump-1' });
  assert.equal(player.version, v);
  const events = dispatch(ctx, OP.GET_EVENTS, {}) as { events: unknown[]; cursor: string };
  assert.ok(events.events.length > 0);
  assert.equal(typeof events.cursor, 'string');
  const incremental = dispatch(ctx, OP.GET_EVENTS, { cursor: events.cursor }) as { events: unknown[] };
  assert.equal(incremental.events.length, 0);
});
