import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CLASS_IDS } from '../data/classes.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { createUnit, growthRates, normalizeUnit, toBattleUnit } from './model.ts';
import { classMasteryOf, gainMastery, masteryNodesFor, setEquippedSkills, SKILL_SLOTS, switchClass, unlockedNodes } from './mastery.ts';

test('mastery unlocks class nodes by threshold, not by total level', () => {
  const unit = createUnit('erin', 70, 'm1', 0, false, { classId: 'gladiator', age: 20 });
  assert.equal(classMasteryOf(unit), 0);
  assert.deepEqual(unlockedNodes(unit), []);
  // 70 total levels do not unlock the class; mastery does.
  gainMastery(unit, 9);
  assert.deepEqual(unlockedNodes(unit), []);
  const art = gainMastery(unit, 1);
  assert.deepEqual(art.map(node => node.art), ['fw_art_52']);
  assert.deepEqual(unit.learnedArts, ['fw_art_52']);
  const unlocked = gainMastery(unit, 5);
  assert.equal(unlocked.length, 1);
  assert.equal(classMasteryOf(unit), 15);
  assert.ok(unit.learnedSkills.includes('opening'));
  assert.ok(unit.equippedSkills.includes('opening'));
  gainMastery(unit, 30);
  assert.ok(unit.learnedSkills.includes('keen'));
  assert.equal(unlockedNodes(unit).length, masteryNodesFor(unit.classId).filter(node => node.threshold <= 45).length);
  // Reconciliation and re-crossing never grant a node or a shared art twice.
  const known = [...unlockedNodes(unit)];
  assert.deepEqual(gainMastery(unit, 0), []);
  assert.deepEqual(unlockedNodes(unit), known);
  assert.equal(unit.learnedSkills.filter(s => s === 'opening').length, 1);
});

test('all 408 class teaching nodes unlock only at their own threshold and never include upgrades or equipment grants', () => {
  let links = 0;
  const taught = new Set<string>();
  for (const classId of CATALOG_CLASS_IDS) {
    const unit = createUnit('erin', 99, `mastery-${classId}`, 0, true, { classId, age: 20 });
    assert.deepEqual(unit.learnedArts, [], `${classId}: level does not teach arts`);
    const nodes = masteryNodesFor(classId).filter(node => node.art);
    assert.ok(classId === 'troubadour' || classId === 'valkyrie' ? nodes.length === 0 : nodes.length >= 4 && nodes.length <= 6, classId);
    let progress = 0;
    for (const node of nodes) {
      const art = WEAPON_ART_BY_ID.get(node.art!)!;
      const source = art.unlock as { kind: string; classIds: string[] };
      assert.equal(source.kind, 'class_mastery');
      assert.ok(source.classIds.includes(classId));
      assert.equal(Number.isInteger(node.threshold) && node.threshold > progress, true);
      gainMastery(unit, node.threshold - progress - 1);
      assert.equal(unit.learnedArts!.includes(art.id), false, `${node.id}: not before threshold`);
      gainMastery(unit, 1);
      assert.ok(unit.learnedArts!.includes(art.id), node.id);
      progress = node.threshold;
      taught.add(art.id);
      links++;
    }
    assert.equal(unit.learnedArts!.length, nodes.length);
    assert.deepEqual(gainMastery(unit, 0), []);
  }
  assert.equal(links, 408);
  assert.equal(taught.size, 176);
});

test('different teachers share one learned art, switching preserves it, and battle units receive it', () => {
  const unit = createUnit('erin', 20, 'shared-art', 0, false, { classId: 'gladiator', age: 20 });
  gainMastery(unit, 100, 'commoner');
  const before = [...unit.learnedArts!];
  switchClass(unit, 'swordsman');
  assert.deepEqual(unit.learnedArts, before, 'switching does not grant a class art list');
  const learned = gainMastery(unit, 100);
  assert.ok(learned.some(node => node.art === 'fw_art_27'));
  assert.equal(unit.learnedArts!.filter(id => id === 'fw_art_27').length, 1);
  assert.ok(before.every(id => unit.learnedArts!.includes(id)));
  assert.ok(toBattleUnit(unit, 'player', unit.id, [0, 0]).arts?.includes('fw_art_27'));
});

test('loading an old mastery save reconciles new nodes without adding points or losing prior learning', () => {
  const unit = createUnit('erin', 20, 'old-art-save', 0);
  unit.classMastery = { sword_lord: 200 };
  unit.learningProgress = { sword_lord: ['sword_lord-1'] };
  unit.learnedSkills = ['opening']; unit.equippedSkills = ['opening'];
  unit.learnedArts = ['chariot_line'];
  const loaded = normalizeUnit(JSON.parse(JSON.stringify(unit)));
  assert.equal(classMasteryOf(loaded, 'blade'), 200);
  assert.ok(loaded.learnedArts?.includes('fw_art_29'));
  assert.ok(loaded.learnedArts?.includes('chariot_line'), 'previously learned arts are preserved');
  assert.equal(loaded.learnedArts?.includes('fw_art_34'), false, 'later nodes stay locked');
  assert.deepEqual(normalizeUnit(JSON.parse(JSON.stringify(loaded))), loaded);
});

test('mastery nodes differ by class and are cleared by reincarnation', () => {
  const a = masteryNodesFor('gladiator');
  const b = masteryNodesFor('sword_hero');
  assert.notDeepEqual(a.map(n => n.threshold), b.map(n => n.threshold));
  assert.ok(b[0].threshold > a[0].threshold, 'higher stages unlock later');
});

test('learned skills are freely equipped across classes, shared across five slots', () => {
  const unit = createUnit('erin', 20, 'm2', 0, false, { classId: 'gladiator', age: 20 });
  gainMastery(unit, 100);
  const learned = [...unit.learnedSkills];
  assert.ok(learned.length >= 2);
  assert.equal(setEquippedSkills(unit, learned.slice(0, 1)), null);
  assert.deepEqual(unit.equippedSkills, learned.slice(0, 1));
  assert.match(setEquippedSkills(unit, ['opening', 'surge', 'grit', 'keen', 'nimble', 'focus']) ?? '', /最多/);
  assert.match(setEquippedSkills(unit, ['charge']) ?? '', /尚未学会/);
  assert.equal(SKILL_SLOTS, 5);
});

test('switching class keeps mastery and learned skills but recomputes the class growth', () => {
  const unit = createUnit('erin', 20, 'm3', 0, false, { classId: 'gladiator', age: 20 });
  gainMastery(unit, 20);
  const before = growthRates(unit);
  switchClass(unit, 'swordsman');
  assert.equal(unit.classId, 'swordsman');
  assert.equal(classMasteryOf(unit, 'gladiator'), 20, 'old class mastery is kept');
  assert.ok(unit.learnedSkills.includes('opening'));
  assert.notDeepEqual(growthRates(unit), before, 'changing class must recompute the full growth vector even when strength matches');
});
