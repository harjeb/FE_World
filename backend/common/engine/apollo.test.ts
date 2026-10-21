import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import { createUnit, toBattleUnit } from '../game/model.ts';
import { artCombatOptions, artForecast, forecast, unitCombatStats } from './combat.ts';
import { runCombat, runHeal } from './resolve.ts';
import { combatStats } from './skills.ts';
import { step } from './step.ts';
import { inRange, unitById } from './units.ts';

function setup(weapon: WeaponId = 'brave_bow') {
  const state = createPinepassBattle('apollo');
  state.kind = 'arena'; state.scenario = undefined; state.objects = []; state.goal = { kind: 'rout' };
  state.map = { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array(10).fill('plain')) };
  const me = toBattleUnit(createUnit('owen', 20, 'apollo', 0, true, { personalSkill: 'lightshot' }), 'player', 'apollo', [3, 3]);
  const foe = toBattleUnit(createUnit('owen', 20, 'foe', 0), 'enemy', 'foe', [5, 3]);
  for (const u of [me, foe]) {
    u.classId = 'sniper'; u.stats = { hp: 150, str: 10, mag: 10, skl: 53, spd: 15, lck: 25, def: 15, res: 15, cha: 5 };
    u.hp = 150; u.con = 100; u.weapons = ['iron_bow']; u.ranks = { bow: 'SSS' };
    u.skills = []; u.classSkills = []; u.items = []; u.shields = 0;
  }
  foe.skill = undefined;
  me.stats.spd = 20; me.weapons = [weapon]; me.weaponInstances = [{ id: weapon, durability: 40, maxDurability: 40 }];
  state.units = [me, foe];
  return { state, me, foe, weapon };
}

test('Apollo doubles effective skill after buffs only at full HP with the actual bow, without mutation or range changes', () => {
  const { state, me, foe } = setup();
  me.artEffects = { buffs: [{ source: 'test', stat: 'skl', amount: 6, duration: 'exchange', turn: 1 }] };
  const before = JSON.stringify(state);
  const stats = unitCombatStats(state, me, 'silver_bow');
  assert.equal(stats.skl, 118);
  assert.equal(stats.hit, WEAPONS.silver_bow.hit + 118 * 2 + 12 + 10);
  assert.equal(stats.crit, WEAPONS.silver_bow.crit + 59 + 5);
  assert.equal(forecast(state, me.id, me.pos, 'silver_bow', foe.id).attacker.crit, 39);
  assert.equal(combatStats(me, WEAPONS.iron_sword).skl, 59);
  assert.equal(combatStats(me, null).skl, 59);
  assert.equal(inRange(me, 'silver_bow', me.pos, [4, 3]), false);
  assert.equal(inRange(me, 'silver_bow', me.pos, [6, 3]), false);
  assert.equal(JSON.stringify(state), before);
  me.skills = ['lightshot'];
  assert.equal(combatStats(me, WEAPONS.silver_bow).skl, 118, 'duplicate sources do not quadruple');
  me.hp--;
  assert.equal(combatStats(me, WEAPONS.silver_bow).skl, 59);
  runHeal(state, foe, me, 'recover', []);
  assert.equal(combatStats(me, WEAPONS.silver_bow).skl, 118);
});

test('opening full HP is frozen for brave attacks, damaged follow-ups and enemy counters', () => {
  for (const counter of [false, true]) {
    const { state, me, foe, weapon } = setup();
    const baseline = structuredClone(state), plain = unitById(baseline, me.id);
    plain.skill = undefined; plain.stats.skl *= 2;
    const [attacker, defender, used] = counter ? [foe, me, 'iron_bow' as const] : [me, foe, weapon];
    const f = forecast(state, attacker.id, attacker.pos, used, defender.id);
    assert.deepEqual(f, forecast(baseline, attacker.id, attacker.pos, used, defender.id));
    assert.equal((counter ? f.defender : f.attacker).strikes, 4);
    const strikes = runCombat(state, attacker, defender, used, []);
    assert.deepEqual(strikes, runCombat(baseline, unitById(baseline, attacker.id), unitById(baseline, defender.id), used, []));
    assert.equal(strikes.filter(s => s.by === me.id).length, 4);
    assert.ok(me.hp < me.stats.hp, 'Apollo actually took damage before later shots');
    assert.equal(me.stats.skl, 53);
    assert.equal(unitCombatStats(state, me, weapon).skl, 53, 'next exchange loses the bonus');
  }
});

test('skill-based art odds and refunds use doubled skill; probabilities and no-crit still apply', () => {
  const { state, me, foe, weapon } = setup('iron_bow');
  const procArt = WEAPON_ART_BY_ID.get('fw_art_125')!;
  assert.equal(artCombatOptions(state, me, me.pos, weapon, procArt, foe).procChance, 53);
  me.stats.skl = 250;
  assert.equal(artCombatOptions(state, me, me.pos, weapon, procArt, foe).procChance, 100);
  const f = forecast(state, me.id, me.pos, weapon, foe.id, { id: 'test', might: 0, hit: 0, crit: 0, noCrit: true });
  assert.equal(f.attacker.hit, 100); assert.equal(f.attacker.crit, 0); assert.equal(f.attacker.followUpCrit, 0);
  assert.equal(f.attacker.skl, 500);
  const art = WEAPON_ART_BY_ID.get('fw_art_151')!;
  me.stats.skl = 100; me.arts = [art.id]; foe.pos = [4, 3];
  const before = JSON.stringify(state);
  const preview = artForecast(state, me, me.pos, weapon, art, foe);
  const action = { type: 'act' as const, unit: me.id, to: me.pos, act: 'art' as const, weapon, art: art.id, target: foe.id };
  const result = step(state, action);
  assert.equal(unitById(result.state, me.id).weaponInstances![0].durability, 40, '100% refund from 200 effective skill / 2');
  const event = result.events.find(e => e.t === 'combat');
  assert.ok(event?.t === 'combat'); assert.deepEqual(event.forecast, preview.targets[0].forecast);
  assert.equal(JSON.stringify(step(JSON.parse(before), action)), JSON.stringify(result), 'replay is deterministic');
  assert.equal(JSON.stringify(state), before);
});
