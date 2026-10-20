import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { createUnit, toBattleUnit } from '../game/model.ts';
import { SKILLS, type SkillId } from '../data/skills.ts';
import { combatProgress, forecast, resolveStrike, strikeDamage, strikeRates } from './combat.ts';
import { artStats, addArtBuff, expireArtPhase } from './art-effects.ts';
import { prepareTraitExchange, traitOpening } from './personal-traits.ts';
import { roll100, seedRng } from './rng.ts';
import { runCombat } from './resolve.ts';
import { weaponRange } from './units.ts';
import { spellRange } from './spells.ts';
import { skillMods } from './skills.ts';
import { step } from './step.ts';
import { actionOptions, reachCells } from './ranges.ts';
import { moveRange } from './movement.ts';
import { cellKey } from './units.ts';
import { moveUnit } from './terrain.ts';
import type { BattleEvent } from './types.ts';

function setup(skill?: SkillId) {
  const state = createPinepassBattle('traits');
  state.kind = 'arena'; state.scenario = undefined; state.objects = [];
  state.map = { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array(10).fill('plain')) };
  const a = toBattleUnit(createUnit('owen', 20, 'a', 0), 'player', 'a', [3, 3]);
  const d = toBattleUnit(createUnit('owen', 20, 'd', 0), 'enemy', 'd', [4, 3]);
  for (const u of [a, d]) {
    u.classId = 'shido'; u.stats = { hp: 100, str: 20, mag: 20, skl: 15, spd: 10, lck: 10, def: 10, res: 10, cha: 5 };
    u.hp = 100; u.con = 100; u.weapons = ['iron_sword']; u.ranks = { sword: 'SSS' }; u.skills = []; u.classSkills = []; u.skill = undefined; u.shields = 0;
  }
  a.skill = skill; state.units = [a, d];
  return { state, a, d };
}
function ally(f: ReturnType<typeof setup>, pos: [number, number] = [3, 4]) {
  const u = structuredClone(f.a); u.id = `ally${f.state.units.length}`; u.skill = undefined; u.pos = pos; f.state.units.push(u); return u;
}

test('all sixteen exact names are registered', () => {
  for (const name of ['一身是胆','西凉铁骑','长坂断桥','斩将夺旗','八阵之策','王佐之才','明哲毒计','奇谋险策','连环之计','大局布势','赤壁火策','霆威','智勇护盾','堕天之傲','冥府裁断','天下无双'])
    assert.equal(Object.values(SKILLS).filter(s => s.name === name).length, 1);
});

test('first attempt bonuses expire on miss and multiply before crit; Zhao ward is final and expires on miss', () => {
  const { state, a, d } = setup('capture_banner');
  const f = forecast(state, a.id, a.pos, 'brave_sword', d.id);
  const p = combatProgress(f), spec = f.order[0];
  assert.equal(strikeDamage(f, 'attacker', true, p), (f.attacker.rawDamage + 4) * 3);
  resolveStrike(f, spec, p, false, false);
  assert.equal(strikeDamage(f, 'attacker', false, p), f.attacker.rawDamage);
  const g = setup('dragon_guard'); ally(g).hp = 50;
  const z = forecast(g.state, g.d.id, g.d.pos, 'brave_sword', g.a.id), q = combatProgress(z);
  assert.equal(strikeDamage(z, 'attacker', true, q), z.attacker.rawDamage * 3 - 2);
  resolveStrike(z, z.order[0], q, false, false);
  assert.equal(strikeDamage(z, 'attacker', false, q), z.attacker.rawDamage);
});

test('conditional opening positions, HP thresholds and initiating roles', () => {
  const f = setup('changban'), { a, d, state } = f;
  const open = (initiating = true, cast = false, weapon = 'fire') => traitOpening(state, a, d, a.pos, initiating, weapon, cast);
  assert.equal(open(false).def, 4); ally(f); assert.equal(open(false).def, 4); ally(f, [2, 3]); assert.equal(open(false).def, 0);
  a.skill = 'wise_shield'; assert.equal(open(false).res, 3); assert.equal(open().def, 0);
  a.skill = 'prudent_poison'; d.hp = 50; assert.equal(open().counterHit, -15); d.hp = 51; assert.equal(open().firstDamage, 0);
  a.skill = 'grand_strategy'; assert.equal(open().hit, 0); ally(f, [4, 4]); assert.equal(open().hit, 15);
  a.skill = 'fallen_pride'; assert.equal(open().hit, 0); state.units = [a, d]; assert.equal(open().firstDamage, 3);
  a.skill = 'red_cliffs'; assert.equal(open(true, false, 'flame_lance').firstDamage, 0);
  for (const id of ['fire', 'elfire', 'flame_lance', 'meteor', 'fw_spell_7', 'fw_spell_61']) assert.equal(open(true, true, id).firstDamage, 3);
  assert.equal(open(true, true, 'thunder').firstDamage, 0); assert.equal(open(false, true).firstDamage, 0);
});

test('Zeus suppression depends exclusively on first attempt hit', () => {
  const { state, a, d } = setup('thunder_majesty');
  const f = forecast(state, a.id, a.pos, 'thunder', d.id, undefined, true);
  for (const hit of [false, true]) {
    const p = combatProgress(f); resolveStrike(f, f.order[0], p, hit, false);
    assert.equal(strikeRates(f, { side: 'defender', followUp: false }, p).hit, Math.max(0, f.defender.hit - (hit ? 10 : 0)));
    if (!hit) { resolveStrike(f, { side: 'attacker', followUp: false }, p, true, false); assert.equal(p.thunderHit, false); }
  }
  d.stats.skl = 100;
  const capped = forecast(state, a.id, a.pos, 'thunder', d.id, undefined, true), q = combatProgress(capped);
  resolveStrike(capped, capped.order[0], q, true, false);
  assert.equal(strikeRates(capped, { side: 'defender', followUp: false }, q).hit, 100, 'suppression applies before the hit cap');
});

test('joint bursts use 33% independent exact branches, affect sequence/avoid and never mutate query state or RNG', () => {
  const { state, a, d } = setup('xiliang'); d.skill = 'risky_scheme';
  const before = JSON.stringify(state), f = forecast(state, a.id, a.pos, 'iron_sword', d.id);
  assert.equal(JSON.stringify(state), before); assert.equal(f.branches!.length, 4);
  assert.ok(Math.abs(f.branches!.reduce((n, b) => n + b.probability, 0) - 1) < 1e-12);
  for (const b of f.branches!) {
    assert.equal(b.forecast.attacker.doubles, b.rolls[a.id]);
    assert.equal(b.forecast.defender.skl, b.rolls[d.id] ? 25 : 15);
  }
  assert.equal(f.expectedTaken, f.branches!.reduce((n, b) => n + b.probability * b.forecast.expectedTaken, 0));
  const scope = prepareTraitExchange(state, [a, d], { a: true, d: true });
  assert.equal(artStats(a).spd, 20);
  const fixed = forecast(state, a.id, a.pos, 'iron_sword', d.id, { id: 'test', might: 0, hit: 0, crit: 0, noCrit: true }, false, true);
  assert.equal(fixed.branches, undefined); assert.equal(fixed.attacker.crit, 0);
  scope.cleanup(); assert.equal(artStats(a).spd, 10); assert.equal(JSON.stringify(state), before);
});

test('Lu Bu raises both attack stats without permanent mutation and actual burst rolls are recorded once', () => {
  const { state, a, d } = setup('peerless'); const scope = prepareTraitExchange(state, [a, d], { a: true });
  assert.equal(artStats(a).str, 30); assert.equal(artStats(a).mag, 30);
  const events: BattleEvent[] = []; runCombat(state, a, d, 'brave_sword', events);
  const combat = events.find(e => e.t === 'combat'); assert.ok(combat?.t === 'combat'); assert.deepEqual(combat.forecast?.traitRolls, { a: true });
  assert.equal(artStats(a).str, 30); scope.cleanup(); assert.equal(a.stats.str, 20); assert.equal(artStats(a).str, 20);
});

test('formation aura is max-only, excludes self, stops immediately on movement', () => {
  const f = setup(), u = ally(f); u.skill = 'eight_formations';
  const v = ally(f, [2, 3]); v.skill = 'veteran';
  const mods = () => skillMods(f.state, { unit: f.a, pos: f.a.pos, weapon: null, moved: false });
  assert.equal(mods().hit, 10); v.alive = false; assert.equal(mods().hit, 10);
  moveUnit(f.state, u, [u.pos, [2, 3]], []); assert.equal(mods().hit, 0);
});

test('formation movement stays disabled across the other side phase until its owner starts again', () => {
  for (const side of ['player', 'enemy'] as const) {
    const f = setup(), u = ally(f); u.skill = 'eight_formations'; u.side = f.a.side = side;
    f.state.phase = side;
    const mods = () => skillMods(f.state, { unit: f.a, pos: f.a.pos, weapon: null, moved: false });
    assert.equal(mods().hit, 10);
    const events: BattleEvent[] = []; moveUnit(f.state, u, [u.pos, [2, 3]], events);
    assert.ok(events.some(e => e.t === 'artState' && e.effects?.formationMoved));
    expireArtPhase(f.state, side, 'end', []);
    f.state.phase = side === 'player' ? 'enemy' : 'player'; f.state.turn += 1;
    expireArtPhase(f.state, f.state.phase, 'start', []);
    assert.equal(mods().hit, 0);
    expireArtPhase(f.state, side, 'start', []); assert.equal(mods().hit, 10);
  }
});

test('royal aid expands only direct healing maximum range', () => {
  const { a } = setup('royal_aid'); assert.deepEqual(weaponRange(a, 'heal'), [1, 2]); assert.deepEqual(weaponRange(a, 'recover'), [1, 2]);
  assert.deepEqual(weaponRange(a, 'physic'), [1, 11]); assert.deepEqual(weaponRange(a, 'fortify'), [1, 3]);
  assert.deepEqual(spellRange(a, { id: 'fw_spell_25', range: [1, 10] }), [1, 11]);
  for (const id of ['fw_spell_50', 'fw_spell_49', 'fw_spell_58', 'fw_spell_40']) assert.deepEqual(spellRange(a, { id, range: [1, 5] }), [1, 5]);
});

test('royal aid healing range agrees between options, map overlay and actual staff/spell actions', () => {
  const f = setup('royal_aid'), { state, a } = f;
  state.goal = { kind: 'rout' };
  a.classId = 'bishop'; a.ranks = { staff: 'SSS', tome: 'SSS' }; a.weapons = ['heal'];
  a.bookInstances = [{ id: 'heal', charges: 5, maxCharges: 5 }];
  a.spellbooks = [{ id: 'fw_spell_12', charges: 5, maxCharges: 5 }];
  const target = ally(f, [3, 5]); target.hp = 1;
  const options = actionOptions(state, a, a.pos);
  assert.ok(options.heal.some(o => o.targets.includes(target)));
  assert.ok(options.casts.some(o => o.spell === 'fw_spell_12' && o.targets.includes(target)));
  assert.ok(reachCells(state, a, moveRange(state, a, 0), 'heal').has(cellKey(state, target.pos)));
  for (const action of [{ act: 'heal', weapon: 'heal' }, { act: 'cast', spell: 'fw_spell_12' }] as const) {
    const result = step(state, { type: 'act', unit: a.id, to: a.pos, target: target.id, ...action });
    assert.ok(result.state.units.find(u => u.id === target.id)!.hp > 1);
    const plain = structuredClone(state); plain.units.find(u => u.id === a.id)!.skill = undefined;
    assert.throws(() => step(plain, { type: 'act', unit: a.id, to: a.pos, target: target.id, ...action }), /射程/);
  }
});

test('Pang Tong slow waits until exchange end, takes strongest penalty, expires at source phase and obeys immunity', () => {
  const { state, a, d } = setup('linked_scheme'); a.stats.skl = 100;
  const f = forecast(state, a.id, a.pos, 'iron_sword', d.id); assert.equal(f.defender.attackSpeed, 10);
  runCombat(state, a, d, 'iron_sword', []); assert.equal(artStats(d).spd, 7);
  addArtBuff(state, d, 'swarm', 'spd', -3, 'phase', []); assert.equal(artStats(d).spd, 7);
  expireArtPhase(state, 'enemy', 'start', []); assert.equal(artStats(d).spd, 7);
  expireArtPhase(state, 'enemy', 'end', []); assert.equal(artStats(d).spd, 7);
  expireArtPhase(state, 'player', 'start', []); assert.equal(artStats(d).spd, 10);
  d.immunities = ['debuff']; runCombat(state, a, d, 'iron_sword', []); assert.equal(artStats(d).spd, 10);
});

test('burst threshold matches roll < 33 and scopes preserve one shared roll across area victims', () => {
  const { state, a, d } = setup('xiliang');
  for (let seed = 1; seed <= 200; seed++) {
    state.rng = seedRng(`burst-${seed}`);
    const expectedRng = structuredClone(state.rng), expected = roll100(expectedRng) < 33;
    const scope = prepareTraitExchange(state, [a, d]);
    assert.equal(scope.rolls.a, expected); assert.deepEqual(state.rng, expectedRng);
    const saved = structuredClone(state.rng), nested = prepareTraitExchange(state, [a, d]);
    assert.deepEqual(nested.rolls, scope.rolls); assert.deepEqual(state.rng, saved);
    nested.cleanup(); assert.equal(artStats(a).spd, expected ? 20 : 10); scope.cleanup();
  }
});

test('area scope defers Hades healing until all victims finish and freezes opening HP', () => {
  const { state, a, d } = setup('underworld'); a.hp = 50; a.stats.skl = 100; d.hp = 1;
  const scope = prepareTraitExchange(state, [a, d]);
  runCombat(state, a, d, 'iron_sword', []); assert.equal(a.hp, 50);
  a.hp = 0; a.alive = false; scope.cleanup(); assert.equal(a.hp, 0);
  const g = setup('capture_banner'), frozen = prepareTraitExchange(g.state, [g.a, g.d]);
  g.d.hp = 1;
  assert.equal(traitOpening(g.state, g.a, g.d, g.a.pos, true, 'iron_sword', false).firstDamage, 4);
  frozen.cleanup(); assert.equal(traitOpening(g.state, g.a, g.d, g.a.pos, true, 'iron_sword', false).firstDamage, 0);
});

test('Hades heals only surviving direct kills once per own phase and respects healing immunity', () => {
  const { state, a, d } = setup('underworld'); a.hp = 50; a.stats.skl = 100; d.hp = 1;
  assert.equal(forecast(state, a.id, a.pos, 'iron_sword', d.id).expectedTaken, -6);
  runCombat(state, a, d, 'iron_sword', []); assert.equal(a.hp, 56);
  d.hp = 1; d.alive = true; runCombat(state, a, d, 'iron_sword', []); assert.equal(a.hp, 56);
  expireArtPhase(state, 'player', 'start', []); d.hp = 1; d.alive = true;
  a.immunities = ['healing']; runCombat(state, a, d, 'iron_sword', []); assert.equal(a.hp, 56);
});
