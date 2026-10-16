import assert from 'node:assert/strict';
import test from 'node:test';
import { MY_DEFENSE, MY_ROSTER, SPARRING } from './demo.ts';
import { addUnit, behaviorArea, defenseNotes, moveUnit, removeUnit, setBehavior, shiftPriority, switchMap, trialAttack } from './defense.ts';
import { ARENA_MAPS } from './maps.ts';
import { validateDefense } from './rules.ts';

const roster = (c: string) => MY_ROSTER.find(u => u.character === c)!;

test('switching maps re-places units, trims bans and asks for the new list size', () => {
  const plains = switchMap(MY_DEFENSE, 'plains');
  const zone = ARENA_MAPS.plains.defenderZone.map(p => p.join());
  assert.equal(plains.slots.length, 6);
  assert.ok(plains.slots.every(s => zone.includes(s.pos.join())));
  assert.ok(validateDefense(plains).some(e => e.includes('8 人')));
  const full = addUnit(addUnit(plains, roster('lina')), roster('karl'));
  assert.deepEqual(validateDefense(full), []);
  const woods = switchMap(full, 'woods');
  assert.equal(woods.slots.length, 6);
  assert.equal(woods.bans.length, 1);
  assert.deepEqual(validateDefense(woods), []);
});

test('editing keeps the defense consistent', () => {
  const noah = MY_DEFENSE.slots.find(s => s.unit.character === 'noah')!;
  const removed = removeUnit(MY_DEFENSE, 'noah');
  const added = addUnit(removed, roster('noah'));
  assert.equal(added.slots.at(-1)!.behavior, 'healer', 'staff users default to 治疗优先');
  assert.equal(addUnit(MY_DEFENSE, roster('karl')), MY_DEFENSE, 'a full list does not grow');
  const swapped = moveUnit(MY_DEFENSE, 'victor', noah.pos);
  assert.deepEqual(swapped.slots.find(s => s.unit.character === 'noah')!.pos, MY_DEFENSE.slots[0].pos);
  assert.equal(moveUnit(MY_DEFENSE, 'victor', [0, 0]), MY_DEFENSE, 'outside the zone is ignored');
  const lowered = shiftPriority(MY_DEFENSE, 'victor', 1);
  assert.deepEqual(lowered.slots.slice(0, 2).map(s => s.unit.character), ['gustav', 'victor']);
  assert.equal(shiftPriority(MY_DEFENSE, 'victor', -1), MY_DEFENSE);
  const leaderless = removeUnit(removeUnit(MY_DEFENSE, 'victor'), 'gustav');
  assert.deepEqual(leaderless.commanders, ['owen'], 'the top-priority unit takes command when no commander is left');
  assert.ok(validateDefense(setBehavior(MY_DEFENSE, 'erin', 'healer')).some(e => e.includes('不会用杖')));
});

test('notes warn about a benched commander', () => {
  assert.deepEqual(defenseNotes(MY_DEFENSE), []);
  let benched = MY_DEFENSE;
  for (let i = 0; i < 5; i++) benched = shiftPriority(benched, 'victor', 1);
  assert.ok(defenseNotes(benched)[0].includes('第 6 位'));
});

test('behavior areas follow the AI rules', () => {
  const area = (c: 'victor' | 'gustav' | 'owen' | 'noah' | 'erin') => behaviorArea(MY_DEFENSE, c)!;
  assert.equal(area('victor').kind, 'counter');
  assert.ok(area('victor').cells.every(([x, y]) => Math.abs(x - 14) + Math.abs(y - 4) <= 2));
  assert.equal(area('owen').kind, 'trigger');
  assert.ok(area('owen').cells.length > area('victor').cells.length);
  assert.equal(area('gustav').kind, 'guard');
  assert.ok(area('gustav').cells.every(([x, y]) => Math.abs(x - 14) + Math.abs(y - 4) <= 3));
  assert.equal(area('noah').kind, 'heal');
  assert.equal(area('erin').kind, 'chase');
});

test('sparring trials are deterministic and can go either way', () => {
  const runs = SPARRING.flatMap(a => [0, 1, 2, 3].map(i => trialAttack(MY_DEFENSE, a, `trial-${i}`)));
  assert.deepEqual(trialAttack(MY_DEFENSE, SPARRING[0], 'trial-0'), runs[0]);
  assert.ok(runs.every(r => r.bans.length === 1));
  const held = runs.filter(r => r.held).length;
  assert.ok(held > 0 && held < runs.length, `held ${held} / ${runs.length}`);
});
