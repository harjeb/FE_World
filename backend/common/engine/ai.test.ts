import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { MY_ROSTER } from '../arena/demo.ts';
import { canHeal } from '../arena/rules.ts';
import { CATALOG_CLASS_IDS } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';
import { createClassicBattle } from '../game/battles.ts';
import { createEnemy } from '../game/enemies.ts';
import { createUnit } from '../game/model.ts';
import { decide } from './ai.ts';
import { moveRange } from './movement.ts';
import { interactionOptions } from './scenario.ts';
import { actionOptions, reachCells, threatMap } from './ranges.ts';
import { step } from './step.ts';
import { cellKey, distance, staffWeapons, unitById } from './units.ts';

function board() {
  const state = createPinepassBattle('healer-ai');
  state.map = { width: 14, height: 7, tiles: Array.from({ length: 7 }, () => Array(14).fill('plain')) };
  const healer = createEnemy('healer', { classId: 'cleric', level: 1, pos: [1, 3] });
  const ally = createEnemy('ally', { classId: 'swordsman', level: 1, pos: [8, 3] });
  const foe = createEnemy('foe', { classId: 'swordsman', level: 1, pos: [13, 6] });
  foe.side = 'player'; foe.boss = true;
  state.units = [healer, ally, foe];
  state.goal = { kind: 'rout' }; state.phase = 'enemy';
  return { state, healer, ally, foe };
}

test('a healthy healer follows the front line instead of waiting with the rearguard', () => {
  const { state, healer, ally } = board();
  state.units.push(createEnemy('rear', { classId: 'knight', level: 1, pos: [2, 3] }));
  const before = structuredClone(state), action = decide(state, healer);
  assert.equal(action.act, 'wait');
  assert.ok(distance(action.to, ally.pos) < distance(healer.pos, ally.pos));
  assert.equal(distance(action.to, ally.pos), 2, 'stays behind the front line');
  assert.ok(moveRange(state, healer).stops.has(cellKey(state, action.to)));
  assert.deepEqual(state, before, 'planning does not consume RNG or mutate the board');
  assert.deepEqual(decide(structuredClone(state), structuredClone(healer)), action);
  const moved = step(state, action).state;
  assert.deepEqual(unitById(moved, healer.id).pos, action.to);
});

test('a healer already supporting its formation does not shuffle between equal cells', () => {
  const { state, healer, ally } = board();
  ally.pos = [3, 3];
  assert.deepEqual(decide(state, healer).to, healer.pos);
});

test('an out-of-range casualty makes a healer approach, then heal on its next action', () => {
  const { state, healer, ally } = board();
  ally.hp = 1;
  const first = decide(state, healer);
  assert.equal(first.act, 'wait');
  assert.ok(distance(first.to, ally.pos) < distance(healer.pos, ally.pos));
  const moved = step(state, first).state;
  const current = unitById(moved, healer.id); current.acted = false;
  const second = decide(moved, current);
  assert.equal(second.act, 'heal');
  assert.ok('target' in second && second.target === ally.id);
  assert.ok(unitById(step(moved, second).state, ally.id).hp > 1);
});

test('healing prioritizes HP percentage, then picks an unthreatened landing when possible', () => {
  const { state, healer, ally, foe } = board();
  healer.pos = [7, 3]; ally.pos = [4, 3]; ally.hp = 10; ally.stats.hp = 100;
  const other = createEnemy('other', { classId: 'swordsman', level: 1, pos: [7, 4] });
  other.hp = 5; other.stats.hp = 20; state.units.push(other);
  foe.pos = [6, 3]; foe.artEffects = { statuses: ['root'] };
  const action = decide(state, healer);
  assert.equal(action.act, 'heal');
  assert.ok('target' in action && action.target === ally.id, '10/100 is more urgent than 5/20');
  assert.equal(threatMap(state, 'player').get(cellKey(state, action.to)) ?? 0, 0);
  assert.ok(unitById(step(state, action).state, ally.id).hp > 10);
});

test('a healer does not walk into a threat merely to stand one tile closer', () => {
  const { state, healer, ally, foe } = board();
  healer.pos = [1, 3]; ally.pos = [7, 3]; foe.pos = [6, 3];
  foe.artEffects = { statuses: ['root'] };
  const action = decide(state, healer);
  assert.notDeepEqual(action.to, healer.pos, 'still follows');
  assert.equal(threatMap(state, 'player').get(cellKey(state, action.to)) ?? 0, 0);
});

test('petrified and healing-immune allies are not offered as healing targets or allowed to abort the enemy phase', () => {
  for (const blocked of ['petrified', 'immune']) {
    const { state, healer, ally } = board();
    ally.pos = [2, 3]; ally.hp = 1;
    if (blocked === 'petrified') ally.petrified = true; else ally.immunities = ['healing'];
    const valid = createEnemy('valid', { classId: 'swordsman', level: 1, pos: [2, 4] });
    valid.hp = 5; state.units.push(valid);
    assert.ok(actionOptions(state, healer, healer.pos).heal.every(option => option.targets.every(target => target.id !== ally.id)));
    state.phase = 'player';
    const result = step(state, { type: 'endPhase' });
    assert.ok(result.events.some(event => event.t === 'heal' && event.by === healer.id && event.target === valid.id));
    assert.equal(unitById(result.state, ally.id).hp, 1);
  }
});

test('spellbook-only healers cast with normal eligibility and charge consumption', () => {
  const { state, healer, ally } = board();
  healer.weapons = []; healer.ranks.staff = 'S';
  healer.spellbooks = [{ id: 'fw_spell_24', charges: 3, maxCharges: 3 }];
  ally.pos = [3, 3]; ally.hp = 1;
  const action = decide(state, healer);
  assert.equal(action.act, 'cast');
  assert.ok('spell' in action && action.spell === 'fw_spell_24');
  const result = step(state, action);
  assert.ok(unitById(result.state, ally.id).hp > 1);
  assert.equal(unitById(result.state, healer.id).spellbooks![0].charges, 2);
  assert.ok(reachCells(state, healer, moveRange(state, healer), 'heal').has(cellKey(state, ally.pos)));
  healer.spellbooks[0].charges = 0;
  assert.notEqual(decide(state, healer).act, 'cast');
  healer.spellbooks[0].charges = 3; healer.statuses = { silence: 1 };
  assert.notEqual(decide(state, healer).act, 'cast');
  assert.equal(reachCells(state, healer, moveRange(state, healer), 'heal').size, 0);
  delete healer.statuses; healer.ranks.staff = undefined;
  assert.notEqual(decide(state, healer).act, 'cast');
});

test('danger estimates include legal attack spellbooks and exclude exhausted ones', () => {
  const { state, foe } = board();
  foe.classId = 'mage'; foe.weapons = []; foe.ranks.tome = 'S';
  foe.spellbooks = [{ id: 'fire', charges: 1, maxCharges: 20 }];
  assert.ok(threatMap(state, 'player').size > 0);
  foe.statuses = { sleep: true };
  assert.equal(threatMap(state, 'player').size, 0);
  delete foe.statuses;
  foe.spellbooks[0].charges = 0;
  assert.equal(threatMap(state, 'player').size, 0);
});

test('hold and sleep still wait, and berserk healers never heal their allies', () => {
  const { state, healer, ally } = board(); ally.hp = 1; ally.pos = [2, 3];
  healer.behavior = 'hold';
  assert.deepEqual(decide(state, healer), { type: 'act', unit: healer.id, to: healer.pos, act: 'wait' });
  healer.behavior = 'healer'; healer.statuses = { sleep: true };
  assert.deepEqual(decide(state, healer).to, healer.pos);
  healer.statuses = { berserk: 2 };
  assert.notEqual(decide(state, healer).act, 'heal');
});

test('every generic enemy template with a usable healing staff defaults to healer, while explicit behavior is preserved', () => {
  let healers = 0;
  for (const classId of CATALOG_CLASS_IDS) {
    const unit = createEnemy('generic', { classId, level: 1, pos: [0, 0] });
    if (staffWeapons(unit).some(id => WEAPONS[id].heal)) {
      healers++;
      assert.equal(unit.behavior, 'healer', classId);
      assert.equal(createEnemy('guard', { classId, level: 1, pos: [0, 0], behavior: 'guard' }).behavior, 'guard');
    }
  }
  assert.ok(healers > 4, 'covers newer catalog classes as well as legacy healers');
});

test('classic automatic guards do not override healers, while authored bosses hold', () => {
  const battle = createClassicBattle([createUnit('erin', 1, 'hero')], { mapId: 'fe1-ch20', seed: 'healers', day: 0 });
  const unit = unitById(battle.state, 'e12');
  assert.equal(unit.classId, 'adept');
  assert.equal(unit.behavior, 'healer');
  assert.ok(battle.state.units.filter(u => u.side === 'enemy' && u.boss).every(u => u.behavior === 'hold'));
});

test('arena healer eligibility recognizes healing books, not utility staves or exhausted resources', () => {
  const unit = structuredClone(MY_ROSTER.find(u => u.character === 'noah')!);
  unit.weapons = []; unit.ranks.staff = 'S'; unit.spellbooks = [{ id: 'fw_spell_24', charges: 1, maxCharges: 3 }];
  assert.equal(canHeal(unit), true);
  unit.spellbooks[0].charges = 0;
  assert.equal(canHeal(unit), false);
  unit.weapons = ['warp_staff'];
  assert.equal(canHeal(unit), false);
  unit.weapons = ['heal']; unit.bookInstances = [{ id: 'heal', charges: 0, maxCharges: 10 }];
  assert.equal(canHeal(unit), false);
});

test('attack scoring still favors a high-probability kill over an ordinary nonlethal hit', () => {
  const { state, ally, foe } = board();
  state.units = [ally, foe]; ally.pos = [5, 3]; foe.pos = [6, 3]; foe.hp = 1;
  const healthy = structuredClone(foe); healthy.id = 'healthy'; healthy.pos = [5, 4]; healthy.hp = healthy.stats.hp; state.units.push(healthy);
  const action = decide(state, ally);
  assert.equal(action.act, 'attack');
  assert.ok('target' in action && action.target === foe.id);
});

test('a 固守 unit attacks in place but never leaves its tile', () => {
  const state = createPinepassBattle('hold-ai');
  state.map = { width: 12, height: 6, tiles: Array.from({ length: 6 }, () => Array(12).fill('plain')) };
  const guard = createEnemy('guard', { classId: 'general', level: 20, pos: [5, 3], behavior: 'hold' });
  const foe = createEnemy('foe', { classId: 'swordsman', level: 1, pos: [6, 3] });
  foe.side = 'player';
  state.units = [guard, foe]; state.goal = { kind: 'rout' }; state.phase = 'enemy';
  const action = decide(state, guard);
  assert.equal(action.act, 'attack', 'a guard-type boss strikes a foe already in reach');
  assert.deepEqual(action.to, guard.pos, 'and stays on its own tile');
  foe.pos = [11, 5];
  assert.deepEqual(decide(state, guard), { type: 'act', unit: guard.id, to: guard.pos, act: 'wait' });
});

test('警戒半径 keeps enemies from marching until a player unit is inside it', () => {
  const scene = (foeAt: [number, number], vision?: number) => {
    const state = createPinepassBattle('vision-ai');
    state.map = { width: 24, height: 6, tiles: Array.from({ length: 6 }, () => Array(24).fill('plain')) };
    const enemy = createEnemy('enemy', { classId: 'fighter', level: 20, pos: [2, 3] });
    const foe = createEnemy('foe', { classId: 'swordsman', level: 1, pos: foeAt }); foe.side = 'player';
    if (vision === undefined) delete enemy.vision; else enemy.vision = vision;
    state.units = [enemy, foe]; state.goal = { kind: 'rout' }; state.phase = 'enemy';
    return { state, enemy };
  };
  const far = scene([15, 3], 5);
  assert.deepEqual(decide(far.state, far.enemy), { type: 'act', unit: far.enemy.id, to: far.enemy.pos, act: 'wait' });
  const near = scene([7, 3], 5);
  assert.equal(decide(near.state, near.enemy).act, 'attack', 'pursues once the player is inside the radius');
  const blank = scene([15, 3]);
  assert.notDeepEqual(decide(blank.state, blank.enemy).to, blank.enemy.pos, 'no radius keeps the old unrestricted advance');
});

test('field enemies carry a difficulty-scaled vision radius; legacy battles stay unrestricted', () => {
  const make = (aiDifficulty?: 'normal' | 'hard') => createClassicBattle([createUnit('erin', 5, 'hero')], { mapId: 'fe1-ch20', seed: 'vision', day: 0, aiDifficulty });
  assert.ok(make('normal').state.units.filter(u => u.side === 'enemy').every(u => u.vision === 5));
  assert.ok(make('hard').state.units.filter(u => u.side === 'enemy').every(u => u.vision === 7));
});

test('敌军盗贼会去拿附近的宝箱，拿走的东西不进我方带回清单', () => {
  const state = createPinepassBattle('thief-ai');
  state.map = { width: 14, height: 6, tiles: Array.from({ length: 6 }, () => Array(14).fill('plain')) };
  const thief = createEnemy('thief', { classId: 'thief', level: 5, pos: [2, 2], behavior: 'thief' });
  const foe = createEnemy('foe', { classId: 'swordsman', level: 1, pos: [12, 5] }); foe.side = 'player';
  state.units = [thief, foe]; state.goal = { kind: 'rout' }; state.phase = 'enemy';
  state.objects = [{ id: 'chest1', kind: 'chest', pos: [5, 2], state: 'closed', loot: { item: 'silver_sword', count: 1 } }];
  const first = decide(state, thief);
  assert.equal(first.act, 'wait', 'walks toward the chest before looting');
  const moved = unitById(step(state, first).state, thief.id);
  moved.acted = false;
  const afterMove = step(state, first).state;
  const current = unitById(afterMove, thief.id); current.acted = false;
  const loot = decide(afterMove, current);
  const distanceToChest = Math.abs(current.pos[0] - 5) + Math.abs(current.pos[1] - 2);
  if (distanceToChest === 1) {
    assert.equal(loot.act, 'interact');
    const result = step(afterMove, loot);
    assert.equal(result.state.objects![0].state, 'opened');
    assert.deepEqual(result.state.loot ?? [], [], '敌方拿走的东西不会出现在我方战利品里');
    assert.ok(result.state.scenario?.flags.includes('stolen:chest1'));
    const player = result.state.units.find(unit => unit.side === 'player')!;
    player.pos = [5, 3];
    assert.deepEqual(interactionOptions(result.state, player, player.pos), [], '被抢走的宝箱我方也无法再取');
  } else {
    assert.equal(loot.act, 'wait', 'keeps walking while the chest is still two or more tiles away');
  }
  assert.ok(moved.pos[0] > thief.pos[0], 'moves toward the chest, not toward the player');
});

test('没有可抢的东西时盗贼按普通单位作战', () => {
  const state = createPinepassBattle('thief-empty');
  state.map = { width: 12, height: 5, tiles: Array.from({ length: 5 }, () => Array(12).fill('plain')) };
  const thief = createEnemy('thief', { classId: 'thief', level: 20, pos: [2, 2], behavior: 'thief' });
  const foe = createEnemy('foe', { classId: 'swordsman', level: 1, pos: [3, 2] }); foe.side = 'player';
  state.units = [thief, foe]; state.goal = { kind: 'rout' }; state.phase = 'enemy';
  assert.equal(decide(state, thief).act, 'attack');
});
