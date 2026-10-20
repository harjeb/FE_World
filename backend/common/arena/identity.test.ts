import assert from 'node:assert/strict';
import test from 'node:test';
import { bindDefense } from '../../api/services.ts';
import { createCrossTimeRecruit } from '../game/cross-time.ts';
import { toSnapshot } from '../game/model.ts';
import { MY_DEFENSE } from './demo.ts';
import { addUnit, moveUnit, removeUnit, setBehavior, shiftPriority, switchMap } from './defense.ts';
import { ARENA_MAPS } from './maps.ts';
import { applyBans, createArenaBattle, defenseBoard, validateAttack, validateDefense } from './rules.ts';
import type { AttackPlan, Defense } from './rules.ts';

const recruits = ['zhao-yun', 'apollo', 'lu-bu'].map((identity, i) => createCrossTimeRecruit(identity, `recruit-${i}`, 1000));
const roster = recruits.map(toSnapshot);
const map = ARENA_MAPS.pass;
function defense(): Defense {
  return { ...structuredClone(MY_DEFENSE), map: 'pass', bans: [], commanders: [roster[1].id!, roster[2].id!],
    slots: [...roster, ...MY_DEFENSE.slots.slice(0, 3).map(s => s.unit)].map((unit, i) => ({ unit, pos: map.defenderZone[i], behavior: 'hold' })) };
}
function plan(): AttackPlan {
  return { picks: [roster[2], roster[0], roster[1]].map((u, i) => ({ character: u.character, unitId: u.id, pos: map.attackerZone[i] })), commander: roster[1].id! };
}

test('binding three same-character recruits preserves exact identity and rejects missing explicit IDs', () => {
  const submitted = { ...defense(), slots: defense().slots.slice(0, 3) };
  const bound = bindDefense(recruits, submitted);
  assert.deepEqual(bound.slots.map(s => [s.unit.id, s.unit.name, s.unit.personalSkill]), roster.map(u => [u.id, u.name, u.personalSkill]));
  submitted.slots[0].unit = { ...roster[0], id: 'missing' };
  assert.throws(() => bindDefense(recruits, submitted));
  assert.deepEqual(bindDefense(recruits, submitted, false).slots.map(s => s.unit.id), roster.slice(1).map(u => u.id));
  submitted.slots[0].unit = { ...roster[0], id: undefined };
  assert.equal(bindDefense([recruits[0]], { ...submitted, slots: submitted.slots.slice(0, 1) }).slots[0].unit.id, recruits[0].id);
});

test('same-portrait defense bans one instance and hands command to exactly one backup', () => {
  const d = defense();
  assert.deepEqual(validateDefense(d), []);
  const reveal = applyBans(d, [roster[1].id!], roster);
  assert.equal(reveal.fielded.some(s => s.unit.id === roster[1].id), false);
  assert.ok(reveal.fielded.some(s => s.unit.id === roster[0].id));
  assert.equal(reveal.commander, roster[2].id);
  const battle = createArenaBattle(d, [roster[1].id!], roster, plan(), 'identity');
  assert.deepEqual(battle.units.filter(u => u.side === 'player').map(u => [u.id, u.skill]), [roster[2], roster[0], roster[1]].map(u => [u.id, u.personalSkill]));
  assert.deepEqual(battle.units.filter(u => u.boss).map(u => u.id), [roster[1].id, `d-${roster[2].id}`]);
  assert.equal(new Set(defenseBoard(d).units.map(u => u.id)).size, d.slots.length);
  d.slots[1].unit = d.slots[0].unit;
  assert.ok(validateDefense(d).some(e => e.includes('重复')));
});

test('attack validation checks resolved IDs, bans, commander aliases and missing explicit IDs', () => {
  const d = defense();
  const reveal = applyBans(d, [roster[1].id!], roster);
  assert.deepEqual(validateAttack(d, reveal, roster, plan()), []);
  const duplicate = plan();
  duplicate.picks[1].unitId = duplicate.picks[0].unitId;
  assert.ok(validateAttack(d, reveal, roster, duplicate).some(e => e.includes('一次')));
  const missing = plan();
  missing.picks[0].unitId = 'missing';
  assert.ok(validateAttack(d, reveal, roster, missing).some(e => e.includes('名册')));
  const barred = applyBans({ ...d, bans: [roster[1].id!] }, [roster[0].id!], roster);
  assert.deepEqual(barred.barred, [roster[1].id]);
  const allowed = plan();
  allowed.picks = allowed.picks.filter(p => p.unitId !== roster[1].id);
  allowed.commander = roster[2].id!;
  assert.deepEqual(validateAttack(d, barred, roster, allowed), []);
  const alias = { ...d, commanders: [roster[0].id!, 'roland'] };
  assert.ok(validateDefense(alias).some(e => e.includes('同一人')));
  assert.ok(validateDefense({ ...d, bans: [roster[0].id!, 'roland'] }).some(e => e.includes('不能重复')));
  assert.throws(() => applyBans({ ...d, map: 'plains' }, [roster[0].id!, 'roland'], roster), /不同单位/);
  const colliding = [{ ...roster[0], id: 'other' }, { ...roster[1], id: 'roland' }];
  assert.deepEqual(applyBans({ ...d, bans: ['roland'] }, [roster[0].id!], colliding).barred, ['roland']);
  const collisionPlan: AttackPlan = { picks: [{ character: 'roland', unitId: 'other', pos: map.attackerZone[0] }], commander: 'other' };
  assert.deepEqual(validateAttack(d, { ...reveal, barred: ['roland'] }, colliding, collisionPlan), []);
});

test('defense editing targets one instance and legacy character picks still resolve', () => {
  let d: Defense = { ...defense(), slots: [], commanders: [] };
  for (const u of roster) d = addUnit(d, u);
  assert.equal(d.slots.length, 3);
  assert.equal(addUnit(d, roster[0]).slots.length, 3);
  assert.equal(removeUnit(d, roster[1].id!).slots.length, 2);
  assert.equal(setBehavior(d, roster[1].id!, 'hold').slots.filter(s => s.behavior === 'hold').length, 1);
  assert.equal(shiftPriority(d, roster[1].id!, -1).slots[0].unit.id, roster[1].id);
  assert.deepEqual(moveUnit(d, roster[1].id!, d.slots[0].pos).slots[1].pos, d.slots[0].pos);
  assert.equal(new Set(switchMap(d, 'woods').slots.map(s => s.pos.join())).size, 3);
  const legacyRoster = [{ ...roster[0], id: undefined }];
  const legacyPlan: AttackPlan = { picks: [{ character: 'roland', pos: map.attackerZone[0] }], commander: 'roland' };
  const legacyDefense = defense();
  const reveal = applyBans(legacyDefense, ['roland'], legacyRoster);
  assert.equal(reveal.fielded.filter(s => s.unit.character === 'roland').length, 2);
  assert.deepEqual(validateAttack(legacyDefense, reveal, legacyRoster, legacyPlan), []);
  assert.equal(createArenaBattle(legacyDefense, ['roland'], legacyRoster, legacyPlan, 'legacy').units[0].id, 'roland');
});
