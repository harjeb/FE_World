import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { CATALOG_CLASS_IDS, CLASSES, CLASS_PATHS, canonicalClassId } from '../common/data/classes.ts';
import type { ClassId } from '../common/data/classes.ts';
import { createUnit, normalizeUnit } from '../common/game/model.ts';
import { switchClass } from '../common/game/mastery.ts';
import { reincarnate } from '../common/game/legacy.ts';
import { OP } from '../common/protocol/ops.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { createEnemy } from '../common/game/enemies.ts';

function setup(classId: ClassId) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'species-classes', undefined, '测试军团');
  player.day = 840;
  player.gold = 100_000;
  const unit = createUnit('erin', 1, 'special-recruit', player.day, false, { classId });
  store.addUnit(player.id, unit);
  const ctx: Context = { store, accountId, player, agentModel: null, push: () => {} };
  return { store, player, unit, ctx };
}

test('removed professions leave the active catalog and promotion paths, while warrior merges into hero', () => {
  assert.equal(CATALOG_CLASS_IDS.length, 77);
  const removed = ['warrior', 'master_ninja', 'mechanist', 'war_cleric', 'elephant_rider'];
  for (const id of removed) {
    assert.ok(!new Set<string>(CATALOG_CLASS_IDS).has(id), id);
    assert.ok(!new Set<string>(Object.values(CLASS_PATHS).flat(2)).has(id), id);
  }
  assert.equal(canonicalClassId('warrior'), 'hero');
  assert.equal(CLASSES.warrior.name, '勇者');
  const { ctx, player, unit, store } = setup('swordsman');
  unit.classQualifications = ['master_ninja', 'mechanist', 'war_cleric', 'elephant_rider'];
  store.saveUnit(unit, player.id);
  for (const classId of removed.slice(1)) {
    assert.throws(() => dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId }), /已移除/);
    assert.throws(() => dispatch(ctx, OP.SWITCH_CLASS, { unitId: unit.id, classId }), /已移除/);
    assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { unitIds: [unit.id], region: 1, durationDays: 1, classId }), /已移除/);
  }
  assert.equal(player.gold, 100_000);
  assert.equal(store.unit(player.id, unit.id)!.classId, 'swordsman');
});

test('new encounters exclude retired professions while old enemy records remain readable', () => {
  const unit = createUnit('erin', 10, 'encounter-check', 0);
  const active = new Set<string>(CATALOG_CLASS_IDS);
  for (let seed = 0; seed < 32; seed++) {
    const battle = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'pruned-' + seed }).state;
    for (const foe of battle.units.filter(foe => foe.side === 'enemy')) assert.ok(active.has(foe.classId), foe.classId);
  }
  const old = createEnemy('old-ninja', { classId: 'master_ninja', level: 15, pos: [0, 0] });
  assert.equal(old.classId, 'master_ninja');
  assert.ok(Object.values(old.stats).every(Number.isFinite));
});

for (const species of ['beast', 'dragon'] as const) test(`${species} recruits advance one step and cannot use old qualifications to escape their chain`, () => {
  const chain = CLASS_PATHS[species][0];
  const { ctx, unit, player, store } = setup(chain[0]);
  const market = dispatch(ctx, OP.GET_CLASS_MARKET, { unitId: unit.id }) as { classes: { id: string; eligibilityReason: string | null }[] };
  assert.equal(market.classes.find(row => row.id === chain[1])!.eligibilityReason, null);
  assert.ok(market.classes.find(row => row.id === chain[2])!.eligibilityReason);
  assert.throws(() => dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId: chain[2] }), /下一阶/);
  assert.equal(player.gold, 100_000);
  dispatch(ctx, OP.BUY_CLASS_QUALIFICATION, { unitId: unit.id, classId: chain[1] });
  dispatch(ctx, OP.PROMOTE, { unitId: unit.id, promotion: chain[1] });
  const promoted = store.unit(player.id, unit.id)!;
  promoted.classQualifications.push(chain[0], chain[3], 'swordsman', CLASS_PATHS[species === 'beast' ? 'dragon' : 'beast'][0][1]);
  store.saveUnit(promoted, player.id);
  for (const classId of [chain[0], chain[3], 'swordsman', CLASS_PATHS[species === 'beast' ? 'dragon' : 'beast'][0][1]]) {
    assert.throws(() => dispatch(ctx, OP.SWITCH_CLASS, { unitId: unit.id, classId }), /下一阶|种族/);
    assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { unitIds: [unit.id], region: 1, durationDays: 1, classId }), /下一阶|种族/);
  }
  assert.throws(() => switchClass(promoted, chain[0]), /下一阶/);
  dispatch(ctx, OP.START_DISPATCH, { unitIds: [unit.id], region: 1, durationDays: 1, classId: chain[1] });
  assert.ok(store.unit(player.id, unit.id)!.lockedDispatchId);
});

for (const species of ['beast', 'dragon'] as const) test(`${species} reincarnation returns to its own first class, preserving species`, () => {
  const chain = CLASS_PATHS[species][0];
  const { ctx, unit, player, store } = setup(chain[4]);
  unit.level = 99;
  const before = structuredClone(unit);
  assert.throws(() => reincarnate(unit, {}, 'gladiator', 120, player.day), /本族初始/);
  assert.deepEqual(unit, before, 'an invalid reincarnation cannot partially mutate the recruit');
  store.saveUnit(unit, player.id);
  store.addInventory(player.id, 'reincarnation_core', 0, 1);
  dispatch(ctx, OP.REINCARNATE_UNIT, { unitId: unit.id, allocation: { str: 10, spd: 10, cha: 10 } });
  const reborn = store.unit(player.id, unit.id)!;
  assert.equal(reborn.classId, chain[0]);
  assert.equal(reborn.species, species);
  assert.equal(reborn.level, 1);
  assert.equal(reborn.age, 16);
});

for (const species of ['beast', 'dragon'] as const) test(`${species} can complete its entire chain and retains its species in old records`, () => {
  const chain = CLASS_PATHS[species][0];
  const unit = createUnit('erin', 1, 'chain-' + species, 0, false, { classId: chain[0] });
  Reflect.deleteProperty(unit, 'species');
  normalizeUnit(unit);
  assert.equal(unit.species, species);
  for (const target of chain.slice(1)) switchClass(unit, target);
  assert.equal(unit.classId, chain[4]);
  assert.throws(() => switchClass(unit, chain[3]), /下一阶/);
  assert.throws(() => switchClass(unit, 'gladiator'), /种族/);
  switchClass(unit, chain[4]);
  unit.isProtagonist = true;
  assert.throws(() => switchClass(unit, chain[4]), /主角/);
});
