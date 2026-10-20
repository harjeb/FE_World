import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CLASS_IDS, CLASSES, canonicalClassId, classUnavailableReason } from '../data/classes.ts';
import { FW_CLASS_REFERENCE } from '../data/class-reference.ts';
import { createUnit, addWeaponExp, toBattleUnit } from './model.ts';
import { canWield } from '../engine/units.ts';
import { switchClass } from './mastery.ts';
import { classMasteryOf, gainMastery, unlockedNodes } from './mastery.ts';
import { forecast } from '../engine/combat.ts';
import { createFieldBattle } from './battles.ts';

test('the sixty-row source is archived while fifty-eight reference classes remain active', () => {
  assert.equal(FW_CLASS_REFERENCE.length, 60);
  const referenceClasses = CATALOG_CLASS_IDS.filter(id => CLASSES[id].source === 'fortunes-weave');
  assert.equal(referenceClasses.length, 58);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(stage => referenceClasses.filter(id => CLASSES[id].stage === stage).length), [2, 5, 12, 15, 16, 8]);
  assert.equal(new Set(referenceClasses.map(id => CLASSES[id].name)).size, 58);
});

test('weapon access follows each class rather than its display route', () => {
  for (const [id, types] of [
    ['gladiator', ['sword', 'axe', 'fist']], ['hunter', ['sword', 'bow']],
    ['knight', ['sword', 'lance', 'axe']], ['bow_knight', ['sword', 'bow']],
    ['guardian', ['lance', 'staff']], ['monk', ['fist', 'staff']],
    ['high_epitaph', ['sword', 'tome']], ['druid', ['sword', 'fist', 'tome']],
  ] as const) {
    assert.deepEqual(Object.keys(CLASSES[id].weapons).sort(), [...types].sort(), id);
  }
  assert.equal(CLASSES.divine_ornius.moveType, 'mounted', 'flying affinity does not grant flight');
  assert.equal(CLASSES.great_knight.armored, true, 'mounted armor keeps both traits');
  for (const classId of CATALOG_CLASS_IDS) {
    const unit = createUnit('erin', 1, 'starting-kit-' + classId, 0, false, { classId });
    assert.ok(unit.weapons.length <= 5, classId);
    assert.equal(new Set(unit.weapons).size, unit.weapons.length, classId);
  }
});

test('a class weapon list does not grant proficiency or impose a beginner-only rank ceiling', () => {
  const unit = createUnit('erin', 1, 'catalog-ranks', 0, false, { classId: 'gladiator' });
  unit.ranks.sword = 'E';
  assert.equal(canWield(toBattleUnit(unit, 'player', unit.id, [0, 0]), 'silver_sword'), false);
  assert.equal(addWeaponExp(unit, 'sword', 1000), 'S');
  assert.equal(canWield(toBattleUnit(unit, 'player', unit.id, [0, 0]), 'silver_sword'), true);
  const before = structuredClone(unit.weaponExp);
  assert.equal(addWeaponExp(unit, 'bow', 1000), null);
  assert.deepEqual(unit.weaponExp, before, 'an unsupported weapon cannot bank training experience');
  switchClass(unit, 'hunter');
  assert.equal(unit.ranks.sword, 'S');
  assert.equal(unit.ranks.bow, 'E');
  assert.equal(canWield(toBattleUnit(unit, 'player', unit.id, [0, 0]), 'silver_sword'), true);
  addWeaponExp(unit, 'bow', 70);
  switchClass(unit, 'archer');
  assert.equal(canWield(toBattleUnit(unit, 'player', unit.id, [0, 0]), 'silver_sword'), false);
});

test('prior-game additions and species classes are distinct from the reference catalog', () => {
  assert.equal(CLASSES.hero.source, 'legacy');
  assert.deepEqual(Object.keys(CLASSES.hero.weapons).sort(), ['axe', 'sword']);
  assert.deepEqual(Object.keys(CLASSES.assassin.weapons).sort(), ['bow', 'sword']);
  assert.deepEqual(Object.keys(CLASSES.ninja.weapons), ['sword']);
  assert.equal(CATALOG_CLASS_IDS.filter(id => CLASSES[id].source === 'legacy').length, 9);
  assert.equal(CLASSES.beast_fighter.source, 'species');
  assert.equal(CLASSES.dragonkin.source, 'species');
});

test('old invented class IDs resolve without creating duplicate market professions', () => {
  const previousIds = ["gladiator","swordsman","sword_hero","swordmaster","sword_lord","axe_fighter","fighter","warrior","berserker","war_lord","lancer","knight","general","fortress","iron_lord","squire","cavalier","paladin","great_knight","rider_lord","ranger_commander","wing_recruit","pegasus","falcon","sky_commander","wing_lord","wing_soldier","dragon_knight","dragon_commander","hunter","archer","sniper","marksman","bow_lord","bow_knight","adept","mage","sage","archsage","magic_lord","warlock","druid","mage_knight","acolyte","cleric","bishop","saint","holy_lord","valkyrie","scout","thief","ranger","assassin","shadow_lord","fist_recruit","brawler","monk","fist_master","fist_lord","beast_cub","beast_fighter","beast_hero","beast_guard","beast_lord","awakened","dragonkin","ancient_guard","dragon_sage","dragon_lord"];
  for (const id of previousIds) assert.ok(Object.hasOwn(CLASSES, id), id);
  assert.equal(canonicalClassId('sword_lord'), 'blade');
  assert.equal(CLASSES.sword_lord.name, CLASSES.blade.name);
  assert.equal(CATALOG_CLASS_IDS.some(id => (id as string) === 'sword_lord'), false);
});

test('former special class mechanics are now ordinary configurable classes', () => {
  assert.equal(classUnavailableReason('charioteer'), null);
  assert.equal(classUnavailableReason('bow_knight'), null);
});

test('old class mastery and unlocked nodes remain usable through the compatibility alias', () => {
  const unit = createUnit('erin', 20, 'old-mastery', 0);
  unit.classMastery = { sword_lord: 200 };
  unit.learningProgress = { sword_lord: ['sword_lord-1'] };
  assert.equal(classMasteryOf(unit, 'blade'), 200);
  assert.deepEqual(unlockedNodes(unit, 'blade'), ['blade-1']);
  const unlocked = gainMastery(unit, 1, 'blade');
  assert.ok(unlocked.length > 0 && unlocked.every(node => node.art));
  assert.ok(unit.learnedArts?.includes('fw_art_29'));
  assert.deepEqual(gainMastery(unit, 0, 'sword_lord'), []);
  assert.equal(classMasteryOf(unit, 'sword_lord'), 201);
});

test('mounted heavy classes retain armor effectiveness as well as cavalry weakness', () => {
  const unit = createUnit('erin', 20, 'armor-traits', 0, true);
  const state = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'armor-traits' }).state;
  const me = state.units[0], foe = state.units[1];
  me.classId = 'swordsman'; me.weapons = ['armorslayer', 'horseslayer']; me.ranks.sword = 'S';
  me.pos = [1, 1]; foe.pos = [2, 1]; foe.classId = 'great_knight';
  assert.equal(forecast(state, me.id, me.pos, 'armorslayer', foe.id).attacker.effective, true);
  assert.equal(forecast(state, me.id, me.pos, 'horseslayer', foe.id).attacker.effective, true);
});
