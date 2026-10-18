import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { WEAPON_ARTS, WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { artCombatOptions, forecast, unitCombatStats } from './combat.ts';
import { runCombat } from './resolve.ts';
import { seedRng } from './rng.ts';
import { actionOptions } from './ranges.ts';
import { canWield } from './units.ts';
import type { BattleEvent, BattleState, UnitState } from './types.ts';

// Two units on an open plain; every stat is explicit so each weapon effect shows up as an exact number.
function duel(mine: WeaponId, theirs: WeaponId | null, seed = 'equipment-effects') {
  const state: BattleState = createPinepassBattle(seed);
  state.kind = 'arena'; state.goal = { kind: 'rout' }; state.objects = []; state.scenario = undefined;
  state.map = { width: 10, height: 6, tiles: Array.from({ length: 6 }, () => Array(10).fill('plain')) };
  const me = structuredClone(state.units[0]), foe = structuredClone(state.units[0]);
  for (const [unit, weapon] of [[me, mine], [foe, theirs]] as const) {
    unit.stats = { hp: 60, str: 20, mag: 20, skl: 20, spd: 10, lck: 40, def: 10, res: 10, cha: 0 };
    unit.hp = 60; unit.con = 100; unit.skill = undefined; unit.skills = []; unit.classSkills = []; unit.items = [];
    unit.acted = false; unit.alive = true; unit.shields = 0; unit.tags = []; unit.immunities = []; delete unit.artEffects; delete unit.statuses;
    unit.classId = 'commoner'; unit.ranks = { sword: 'SSS', lance: 'SSS', axe: 'SSS', bow: 'SSS', fist: 'SSS', tome: 'SSS', staff: 'SSS', dagger: 'SSS' };
    unit.weapons = weapon ? [weapon] : [];
    unit.weaponInstances = weapon ? [{ id: weapon, durability: 40, maxDurability: 40 }] : [];
    unit.bookInstances = []; unit.spellbooks = [];
  }
  me.id = 'me'; me.side = 'player'; me.pos = [3, 3];
  foe.id = 'foe'; foe.side = 'enemy'; foe.pos = [4, 3];
  state.units = [me, foe];
  return { state, me, foe };
}
// Puts the target at the far end of the weapon's reach from (3, 3).
const range = (unit: UnitState, weapon: WeaponId) => { unit.pos = [3 + WEAPONS[weapon].range[1], 3]; };

test('magic weapons, the levin sword and magic bows strike with 魔 against 魔防', () => {
  for (const weapon of ['levin_sword', 'magic_bow', 'fw_weapon_95', 'fw_weapon_103'] as WeaponId[]) {
    const { state, me, foe } = duel(weapon, null);
    range(foe, weapon);
    me.stats.str = 0; me.stats.mag = 30; foe.stats.def = 50; foe.stats.res = 0;
    const f = forecast(state, me.id, me.pos, weapon, foe.id);
    assert.equal(f.attacker.damage, 30 + WEAPONS[weapon].might * (f.attacker.effective ? 3 : 1), weapon);
    assert.equal(unitCombatStats(state, me, weapon).attack, 30 + WEAPONS[weapon].might, weapon);
  }
  // 物理普攻武器授予的魔法战技另算：锤矛普通攻击仍按力量对防御。
  const { state, me, foe } = duel('fw_weapon_66', null);
  me.stats.str = 0; me.stats.mag = 30; foe.stats.def = 0; foe.stats.res = 50;
  assert.equal(forecast(state, me.id, me.pos, 'fw_weapon_66', foe.id).attacker.damage, WEAPONS.fw_weapon_66.might);
});

test('configured effectiveness reaches every new bow, the brave bow and the anti-mount and beast weapons', () => {
  const { state, me, foe } = duel('fw_weapon_72', null);
  foe.pos = [5, 3];
  const bows = (Object.keys(WEAPONS) as WeaponId[]).filter(id => WEAPONS[id].type === 'bow');
  assert.ok(bows.length >= 18);
  foe.classId = 'pegasus';
  for (const bow of bows) {
    me.weapons = [bow];
    assert.equal(forecast(state, me.id, [3, 3], bow, foe.id).attacker.effective, true, bow);
  }
  foe.classId = 'cavalier';
  for (const weapon of ['fw_weapon_32', 'fw_weapon_80', 'poleaxe', 'rapier'] as WeaponId[]) {
    me.weapons = [weapon]; me.pos = [5 - WEAPONS[weapon].range[1], 3];
    assert.equal(forecast(state, me.id, me.pos, weapon, foe.id).attacker.effective, true, weapon);
  }
  foe.classId = 'beast_fighter';
  me.weapons = ['fw_weapon_79']; me.pos = [3, 3];
  assert.equal(forecast(state, me.id, me.pos, 'fw_weapon_79', foe.id).attacker.effective, true);
  foe.classId = 'swordsman';
  assert.equal(forecast(state, me.id, me.pos, 'fw_weapon_79', foe.id).attacker.effective, false);
});

test('the lancereaver reverses this exchange’s triangle, and two reavers cancel out', () => {
  const lance = duel('lancereaver', 'iron_lance');
  const f = forecast(lance.state, 'me', lance.me.pos, 'lancereaver', 'foe');
  assert.equal(f.attacker.triangle, 1); assert.equal(f.defender.triangle, -1);
  const axe = duel('lancereaver', 'iron_axe');
  assert.equal(forecast(axe.state, 'me', axe.me.pos, 'lancereaver', 'foe').attacker.triangle, -1);
  const plain = duel('iron_sword', 'iron_lance');
  assert.equal(forecast(plain.state, 'me', plain.me.pos, 'iron_sword', 'foe').attacker.triangle, -1);
  const both = duel('lancereaver', 'lancereaver');
  both.foe.weapons = ['lancereaver'];
  assert.equal(forecast(both.state, 'me', both.me.pos, 'lancereaver', 'foe').attacker.triangle, 0);
});

test('the devil sword previews (31 − luck)% backlash, self-KO odds and resolves onto its wielder', () => {
  const { state, me, foe } = duel('devil_sword', null);
  me.stats.lck = 0; me.stats.skl = 200; me.hp = 1;
  const f = forecast(state, me.id, me.pos, 'devil_sword', foe.id);
  assert.equal(f.attacker.backlash, 31);
  assert.equal(f.attacker.hit, 100);
  assert.ok(Math.abs(f.attackerDies - 0.31) < 1e-9, String(f.attackerDies));
  me.stats.lck = 40;
  assert.equal(forecast(state, me.id, me.pos, 'devil_sword', foe.id).attacker.backlash, 0);
  me.stats.lck = 0; me.hp = 60; me.shields = 1;
  let seen = false;
  for (let seed = 0; seed < 60 && !seen; seed++) {
    const trial = structuredClone(state); trial.rng = seedRng(`backlash-${seed}`);
    const wielder = trial.units[0], target = trial.units[1];
    wielder.hp = 5; target.hp = 60;
    const events: BattleEvent[] = [];
    const strikes = runCombat(trial, wielder, target, 'devil_sword', events);
    const rebound = strikes.find(s => s.backlash);
    if (!rebound) continue;
    seen = true;
    assert.equal(target.hp, 60, 'the target takes nothing from a rebound strike');
    assert.equal(rebound.byHpAfter, 1); assert.equal(wielder.petrified, true);
    assert.ok(events.some(e => e.t === 'shield' && e.unit === wielder.id));
  }
  assert.ok(seen, 'a 31% rebound should occur within 60 seeded exchanges');
});

test('poison weapons poison on a landed normal hit, lock the victim’s follow-up and respect immunity', () => {
  for (const weapon of ['fw_weapon_18', 'poison_dagger', 'fw_weapon_85'] as WeaponId[]) {
    const { state, me, foe } = duel(weapon, 'iron_sword');
    range(foe, weapon);
    me.stats.skl = 200; foe.stats.spd = 40;
    const f = forecast(state, me.id, me.pos, weapon, foe.id);
    assert.deepEqual(f.attacker.afflicts, ['poison']); assert.equal(f.attacker.locks, true);
    const events: BattleEvent[] = [];
    const strikes = runCombat(state, me, foe, weapon, events);
    assert.ok(foe.artEffects?.statuses?.includes('poison'), weapon);
    assert.ok(strikes.filter(s => s.by === foe.id).length <= 1, 'a poisoned foe cannot follow up');
  }
  const immune = duel('fw_weapon_18', null);
  immune.foe.immunities = ['poison']; immune.me.stats.skl = 200;
  runCombat(immune.state, immune.me, immune.foe, 'fw_weapon_18', []);
  assert.ok(!immune.foe.artEffects?.statuses?.includes('poison'));
  // 反击也按武器附毒。
  const counter = duel('iron_sword', 'fw_weapon_18');
  counter.foe.stats.skl = 200; counter.me.stats.skl = 0; counter.me.stats.lck = 0;
  runCombat(counter.state, counter.me, counter.foe, 'iron_sword', []);
  assert.ok(counter.me.artEffects?.statuses?.includes('poison'));
});

test('avoid, magic-resistance and defending bonuses apply only in their stated situations', () => {
  const { state, me } = duel('fw_weapon_15', null);
  assert.equal(unitCombatStats(state, me, 'fw_weapon_15').avoid - unitCombatStats(state, me, 'fw_weapon_2').avoid, 10);
  assert.equal(unitCombatStats(state, me, 'fw_weapon_93').avoid - unitCombatStats(state, me, 'fw_weapon_90').avoid, 10);
  const res = duel('levin_sword', 'fw_weapon_99'), plainRes = duel('levin_sword', 'fw_weapon_93');
  assert.equal(forecast(plainRes.state, 'me', plainRes.me.pos, 'levin_sword', 'foe').attacker.damage
    - forecast(res.state, 'me', res.me.pos, 'levin_sword', 'foe').attacker.damage, 3);
  // 护盾斧：被攻击时防＋3，主动出手时对方的反击不受影响。
  const guarded = duel('iron_lance', 'fw_weapon_61'), unguarded = duel('iron_lance', 'fw_weapon_60');
  assert.equal(forecast(unguarded.state, 'me', unguarded.me.pos, 'iron_lance', 'foe').attacker.damage
    - forecast(guarded.state, 'me', guarded.me.pos, 'iron_lance', 'foe').attacker.damage, 3);
  const shieldAxe = duel('fw_weapon_61', 'iron_lance');
  const asAttacker = forecast(shieldAxe.state, 'me', shieldAxe.me.pos, 'fw_weapon_61', 'foe');
  const axe = duel('fw_weapon_60', 'iron_lance');
  assert.equal(asAttacker.defender.damage, forecast(axe.state, 'me', axe.me.pos, 'fw_weapon_60', 'foe').defender.damage);
  // 反击手甲：敌方发起交战时攻击＋5。
  const fist = duel('iron_sword', 'fw_weapon_94'), plainFist = duel('iron_sword', 'fw_weapon_93');
  assert.equal(forecast(fist.state, 'me', fist.me.pos, 'iron_sword', 'foe').defender.attack
    - forecast(plainFist.state, 'me', plainFist.me.pos, 'iron_sword', 'foe').defender.attack, 5 + WEAPONS.fw_weapon_94.might - WEAPONS.fw_weapon_93.might);
});

test('the purifying sword ignores explicit nether protection but not immortal shields', () => {
  const plain = duel('fw_weapon_2', null), pure = duel('fw_weapon_8', null);
  for (const x of [plain, pure]) { x.foe.tags = ['nether_protection']; x.foe.stats.def = 0; }
  assert.equal(forecast(plain.state, 'me', plain.me.pos, 'fw_weapon_2', 'foe').defender.netherProtected, true);
  assert.equal(forecast(pure.state, 'me', pure.me.pos, 'fw_weapon_8', 'foe').defender.netherProtected, false);
  pure.foe.shields = 1;
  assert.equal(forecast(pure.state, 'me', pure.me.pos, 'fw_weapon_8', 'foe').defender.protected, true);
});

test('multi-proficiency weapons need every listed rank; the secondary type needs no class permission', () => {
  const { me } = duel('fw_weapon_10', null);
  me.classId = 'swordsman'; me.ranks = { sword: 'D' };
  assert.equal(canWield(me, 'fw_weapon_10'), false);
  me.ranks.axe = 'D';
  assert.equal(canWield(me, 'fw_weapon_10'), true);
  me.ranks.sword = 'E';
  assert.equal(canWield(me, 'fw_weapon_10'), false);
  for (const id of ['fw_weapon_10', 'fw_weapon_16', 'fw_weapon_40', 'fw_weapon_41', 'fw_weapon_100', 'fw_weapon_157'] as WeaponId[]) {
    assert.equal(WEAPONS[id].requires?.length, 1, id);
  }
});

test('the Dagda club only lends its own art, and the Sol lance heals 100% with Sol', () => {
  const { state, me, foe } = duel('fw_weapon_224', null);
  const other = WEAPON_ARTS.find(art => art.weapon === 'axe' && art.unlock.kind !== 'equipment_grant' && art.range[0] === 1)!;
  me.arts = [other.id];
  const usable = actionOptions(state, me, me.pos).arts.filter(option => option.weapon === 'fw_weapon_224').map(option => option.art);
  assert.ok(usable.includes('fw_art_221')); assert.ok(!usable.includes(other.id));
  me.weapons = ['iron_axe']; me.weaponInstances = [{ id: 'iron_axe', durability: 40, maxDurability: 40 }];
  assert.ok(actionOptions(state, me, me.pos).arts.some(option => option.art === other.id));
  const sol = WEAPON_ART_BY_ID.get('fw_art_134')!;
  assert.equal(artCombatOptions(state, me, me.pos, 'fw_weapon_228', sol, foe).drain, 1);
  assert.equal(artCombatOptions(state, me, me.pos, 'iron_lance', sol, foe).drain, 0.5);
});
