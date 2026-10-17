import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../data/characters.ts';
import { CATALOG_CLASS_IDS, CLASSES, CHARACTER_CAPS } from '../data/classes.ts';
import { FW_CLASS_REFERENCE } from '../data/class-reference.ts';
import { STAT_KEYS, STAT_NAMES, stats } from '../data/types.ts';
import { gainExp, rollLevelUp } from '../engine/growth.ts';
import { seedRng } from '../engine/rng.ts';
import { forecast } from '../engine/combat.ts';
import { createFieldBattle } from './battles.ts';
import { catalog } from './catalog.ts';
import { createUnit, gainExperience, growthRates, normalizeUnit } from './model.ts';
import { applyInheritanceFloor, claimLegacy, createLegacy, reincarnate, totalStats } from './legacy.ts';

test('charm is an independent ninth stat with the original per-class rates and its own cap', () => {
  assert.equal(STAT_KEYS.length, 9);
  assert.equal(STAT_NAMES.cha, '魅力');
  assert.equal(catalog().stats.cha, '魅力');
  assert.equal(CHARACTER_CAPS.cha, 99);
  assert.equal(totalStats(CHARACTER_CAPS), 942);
  for (const id of CATALOG_CLASS_IDS) assert.ok(Number.isFinite(CLASSES[id].growth.cha), id);
  for (const ref of FW_CLASS_REFERENCE.filter(ref => CATALOG_CLASS_IDS.includes(ref.id))) assert.equal(CLASSES[ref.id].growth.cha, ref.growth[8], ref.id);
  assert.equal(CLASSES.swordsman.growth.str, 5, 'the conservative physical growth buff stays unchanged');
});

test('training and battle level-ups both grow charm independently and stop at its cap', () => {
  const unit = createUnit('erin', 20, 'charm-growth', 0, false, { classId: 'commoner', growthType: 'normal' });
  unit.inheritedGrowth = stats(0,0,0,0,0,0,0,0,100);
  unit.stats.cha = 98;
  const luck = unit.stats.lck;
  const state = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'charm-growth' }).state;
  gainExp(state, state.units[0], 100, []);
  assert.equal(state.units[0].stats.cha, 99);
  assert.equal(state.units[0].stats.lck, luck);
  gainExperience(unit, 200, seedRng('charm-training'));
  assert.equal(unit.stats.cha, 99);
  assert.equal(unit.stats.lck, luck);
  assert.equal(unit.growthLog[0].gains.cha, 1);
  assert.equal(unit.growthLog[1].gains.cha, undefined);
});

test('charm participates in permanent totals, growth inheritance and reincarnation allocation', () => {
  const source = createUnit('erin', 15, 'charm-source', 0, true);
  source.inheritedGrowth = stats(40,30,20,20,20,20,20,20,35);
  source.stats.cha = 20;
  const legacy = createLegacy(source, 'retired', 'charm-legacy', 'player');
  assert.equal(legacy.sourceGrowth.cha, 35);
  assert.equal(legacy.sourceStats.cha, 20);
  const recipient = createUnit('owen', 1, 'charm-recipient', 0, true);
  claimLegacy(legacy, recipient, 'growth');
  assert.equal(recipient.inheritedGrowth!.cha, 35);
  recipient.level = 99;
  reincarnate(recipient, { cha: 10 }, 'hunter', 120, 500);
  assert.equal(recipient.stats.cha, CHARACTERS.owen.base.cha);
  assert.equal(growthRates(recipient).cha, 45);
});

test('old unit data gains a zero charm field without changing earned stats or frozen inheritance values', () => {
  const unit = createUnit('erin', 20, 'old-charm', 0, true);
  const old = JSON.parse(JSON.stringify(unit));
  delete old.stats.cha;
  old.inheritedGrowth = { ...CHARACTERS.erin.growth };
  delete old.inheritedGrowth.cha;
  old.inheritance = { legacyId: 'old', targetLevel: 15, initialTotal: 80, sourceTotal: 200, clippedTarget: 200,
    caps: { ...CHARACTER_CAPS }, weights: { str: 1 }, cycle: 0 };
  delete old.inheritance.caps.cha;
  const before = structuredClone(old.stats);
  normalizeUnit(old);
  const { cha, ...retained } = old.stats;
  assert.equal(cha, 0);
  assert.deepEqual(retained, before);
  assert.equal(old.level, 20);
  assert.equal(old.inheritedGrowth.cha, 0);
  assert.equal(old.inheritance.caps.cha, 0);
  assert.equal(old.inheritance.clippedTarget, 200);
  assert.equal(old.inheritance.initialTotal, 80);
});

test('numeric inheritance can backfill charm within its own cap', () => {
  const source = createUnit('erin', 15, 'numeric-charm-source', 0, false);
  source.stats = stats(0,0,0,0,0,0,0,0,80);
  const legacy = createLegacy(source, 'retired', 'numeric-charm', 'player');
  const recipient = createUnit('owen', 1, 'numeric-charm-target', 0, false);
  recipient.stats = stats(0,0,0,0,0,0,0,0,0);
  claimLegacy(legacy, recipient, 'numeric', { cha: 1 });
  recipient.level = 15;
  assert.deepEqual(applyInheritanceFloor(recipient), { cha: 80 });
  assert.equal(recipient.stats.cha, 80);
  assert.equal(totalStats(recipient.stats), 80);
});

test('old battle states without charm retain their original growth RNG behavior', () => {
  const unit = createUnit('erin', 20, 'old-battle', 0, false, { classId: 'commoner', growthType: 'normal' });
  const state = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'old-charm-battle' }).state;
  const old = JSON.parse(JSON.stringify(state.units[0]));
  old.stats = { ...CHARACTER_CAPS };
  delete old.stats.cha;
  old.inheritedGrowth = stats(0,0,0,0,0,0,0,0,50);
  const before = structuredClone(state.growthRng);
  assert.deepEqual(rollLevelUp(state, old), { gains: {}, rerolls: 0 });
  assert.deepEqual(state.growthRng, before);
});

test('charm does not replace luck or change ordinary weapon attack forecasts', () => {
  const unit = createUnit('erin', 20, 'charm-combat', 0, true);
  const state = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'charm-combat' }).state;
  const me = state.units[0], foe = state.units[1];
  me.pos = [1, 1]; foe.pos = [2, 1]; me.stats.cha = 0; foe.stats.cha = 0;
  const before = forecast(state, me.id, me.pos, 'steel_sword', foe.id);
  me.stats.cha = 99; foe.stats.cha = 99;
  assert.deepEqual(forecast(state, me.id, me.pos, 'steel_sword', foe.id), before);
});
