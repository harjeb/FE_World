import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { weaponRankBonus } from '../data/weapon-proficiency.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import type { Rank, WeaponType } from '../data/types.ts';
import { forecast, unitCombatStats } from './combat.ts';
import { spellForecast } from './magic.ts';
import { healAmount, runAreaHeal, runCombat, runHeal } from './resolve.ts';
import { withSpellWeapon } from './support.ts';
import { seedRng } from './rng.ts';
import type { BattleEvent } from './types.ts';

function field(weapon: WeaponId = 'iron_sword') {
  const state = createPinepassBattle('rank-bonuses');
  state.kind = 'arena'; state.objects = []; state.scenario = undefined; state.goal = { kind: 'rout' };
  state.map = { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('plain')) };
  const me = structuredClone(state.units[0]), foe = structuredClone(me);
  for (const unit of [me, foe]) {
    unit.stats = { hp: 150, str: 20, mag: 20, skl: 10, spd: 20, lck: 0, def: 10, res: 10, cha: 0 };
    unit.hp = 150; unit.con = 100; unit.classId = 'commoner'; unit.skill = undefined;
    unit.skills = []; unit.classSkills = []; unit.ranks = {}; unit.weapons = []; unit.items = [];
    unit.bookInstances = []; unit.weaponInstances = []; unit.spellbooks = [];
    unit.shields = 0; unit.tags = []; unit.immunities = []; unit.acted = false; unit.alive = true;
    delete unit.artEffects; delete unit.statuses;
  }
  me.id = 'me'; me.side = 'player'; me.pos = [2, 2]; me.weapons = [weapon];
  me.weaponInstances = [{ id: weapon, durability: 40, maxDurability: 40 }];
  me.bookInstances = [{ id: weapon, charges: 20, maxCharges: 20 }];
  foe.id = 'foe'; foe.side = 'enemy'; foe.pos = [2 + WEAPONS[weapon].range[0], 2];
  state.units = [me, foe];
  return { state, me, foe };
}
const ranks: Rank[] = ['C', 'B', 'A', 'S'];
const expected: Record<Exclude<WeaponType, 'staff'>, [number, number, number][]> = {
  sword: [[1, 0, 0], [2, 0, 0], [3, 0, 0], [3, 5, 5]],
  lance: [[1, 0, 0], [1, 5, 0], [2, 5, 0], [2, 10, 5]],
  axe: [[0, 5, 0], [0, 10, 0], [1, 10, 0], [1, 15, 5]],
  bow: [[1, 0, 0], [1, 5, 0], [2, 5, 0], [2, 10, 5]],
  tome: [[1, 0, 0], [1, 5, 0], [2, 5, 0], [2, 10, 5]],
  fist: [[0, 5, 0], [0, 10, 0], [1, 10, 0], [1, 15, 5]],
  beast: [[1, 0, 0], [1, 5, 0], [2, 5, 0], [2, 10, 5]],
  dragon: [[1, 0, 0], [1, 5, 0], [2, 5, 0], [2, 10, 5]],
};
const weapons: WeaponId[] = ['iron_sword', 'iron_lance', 'iron_axe', 'iron_bow', 'fire', 'gauntlet', 'beast_claw', 'dragonstone'];
for (const weapon of weapons) {
  test(`${WEAPONS[weapon].type} C–S bonuses agree across unit stats, forecast and actual strikes`, () => {
    const { state, me, foe } = field(weapon);
    const type = WEAPONS[weapon].type as Exclude<WeaponType, 'staff'>;
    const baseline = unitCombatStats(state, me, weapon), preview = forecast(state, me.id, me.pos, weapon, foe.id);
    ranks.forEach((rank, i) => {
      me.ranks[type] = rank;
      const [attack, hit, crit] = expected[type][i];
      const stats = unitCombatStats(state, me, weapon), f = forecast(state, me.id, me.pos, weapon, foe.id);
      assert.deepEqual([stats.attack - baseline.attack, stats.hit - baseline.hit, stats.crit - baseline.crit], [attack, hit, crit]);
      assert.equal(f.attacker.damage, preview.attacker.damage + attack);
      assert.equal(f.attacker.hit, Math.min(100, preview.attacker.hit + hit));
      assert.equal(f.attacker.crit, preview.attacker.crit + crit);
      const trial = structuredClone(state), [attacker, defender] = trial.units;
      trial.rng = seedRng('rank-hit-1');
      const strikes = runCombat(trial, attacker, defender, weapon, []);
      assert.ok(strikes.some(strike => strike.hit));
      for (const strike of strikes.filter(strike => strike.by === me.id && strike.hit))
        assert.equal(strike.damage, f.attacker.damage * (strike.crit ? 3 : 1));
    });
  });
}

test('E/D grant no bonus, SS/SSS retain S, unrelated weapon ranks never stack', () => {
  for (const type of [...Object.keys(expected), 'staff'] as WeaponType[]) {
    for (const rank of ['E', 'D'] as const) assert.deepEqual(weaponRankBonus(type, rank), { attack: 0, hit: 0, crit: 0, heal: 0 });
    for (const rank of ['SS', 'SSS'] as const) assert.deepEqual(weaponRankBonus(type, rank), weaponRankBonus(type, 'S'));
  }
  const { state, me } = field();
  const baseline = unitCombatStats(state, me, 'iron_sword');
  me.ranks = { sword: 'D', axe: 'SSS', tome: 'SSS', staff: 'SSS' };
  assert.deepEqual(unitCombatStats(state, me, 'iron_sword'), baseline);
  assert.equal(unitCombatStats(state, me, null).attack, 0);
});

test('counterattacks receive the defender’s own weapon bonus', () => {
  const { state, me, foe } = field();
  foe.weapons = ['iron_sword']; foe.ranks = { sword: 'E' };
  const baseline = forecast(state, me.id, me.pos, 'iron_sword', foe.id);
  foe.ranks.sword = 'S';
  const f = forecast(state, me.id, me.pos, 'iron_sword', foe.id);
  assert.equal(f.defender.canAttack, true);
  assert.equal(f.defender.damage - baseline.defender.damage, 3);
  assert.equal(f.defender.hit - baseline.defender.hit, 5);
  assert.equal(f.defender.crit - baseline.defender.crit, 5);
});

test('rank attack is added once after effectiveness, and arts retain fixed-hit/no-crit rules', () => {
  const { state, me, foe } = field('rapier');
  foe.classId = 'cavalier';
  const base = forecast(state, me.id, me.pos, 'rapier', foe.id);
  me.ranks.sword = 'S';
  const improved = forecast(state, me.id, me.pos, 'rapier', foe.id);
  assert.equal(improved.attacker.effective, true);
  assert.equal(improved.attacker.attack - base.attacker.attack, 3);
  const art = forecast(state, me.id, me.pos, 'rapier', foe.id, { id: 'rank-test', might: 5, hit: 0, crit: 0, fixedHit: 60, noCrit: true });
  assert.equal(art.attacker.attack, improved.attacker.attack + 5);
  assert.equal(art.attacker.hit, 60); assert.equal(art.attacker.crit, 0); assert.equal(art.attacker.followUpCrit, 0);
});

test('staff C/B/A/S adds 1/2/3/5 healing and respects full-heal, HP caps and healing immunity', () => {
  const { state, me, foe } = field('heal');
  foe.hp = 1;
  ranks.forEach((rank, i) => {
    me.ranks.staff = rank;
    const expected = 30 + [1, 2, 3, 5][i];
    assert.equal(healAmount(me, foe, 'heal'), expected);
    const trial = structuredClone(state), [healer, target] = trial.units;
    runHeal(trial, healer, target, 'heal', []);
    assert.equal(target.hp, 1 + expected);
  });
  foe.hp = 149;
  assert.equal(healAmount(me, foe, 'heal'), 1);
  foe.hp = 1;
  assert.equal(healAmount(me, foe, 'recover'), 149);
  foe.immunities = ['healing']; assert.equal(healAmount(me, foe, 'heal'), 0);
  foe.immunities = []; foe.petrified = true; assert.equal(healAmount(me, foe, 'heal'), 0);
});

test('area staff and white healing spells use the same rank bonus', () => {
  const { state, me, foe } = field('fortify');
  foe.side = 'player'; foe.hp = 1;
  const ally = structuredClone(foe); ally.id = 'ally'; ally.pos = [2, 3]; state.units.push(ally);
  me.ranks.staff = 'S';
  const events: BattleEvent[] = [];
  runAreaHeal(state, me, 'fortify', events);
  assert.equal(events.filter(event => event.t === 'heal').length, 2);
  assert.equal(foe.hp, 31); assert.equal(ally.hp, 31);
  foe.hp = 1;
  const book = SPELLBOOK_BY_ID.get('fw_spell_12')!;
  assert.equal(withSpellWeapon(book, () => healAmount(me, foe, book.id as WeaponId)), 20 + book.healingBase! + 5);
});

test('offensive white magic uses staff proficiency and does not inherit a tome rank bonus', () => {
  const { state, me, foe } = field('fire');
  me.weapons = [];
  me.spellbooks = [{ id: 'light', charges: 20, maxCharges: 20 }];
  const baseline = spellForecast(state, me.id, me.pos, 'light', foe.id);
  me.ranks.tome = 'S';
  assert.deepEqual(spellForecast(state, me.id, me.pos, 'light', foe.id), baseline);
  assert.equal(unitCombatStats(state, me, 'fire').attack, 20 + WEAPONS.fire.might + 2);
});
