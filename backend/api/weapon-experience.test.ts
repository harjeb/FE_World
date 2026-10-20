import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { applyBattleOutcome } from './services.ts';
import { createFieldBattle, type BattleRecord } from '../common/game/battles.ts';
import { addWeaponExp, createUnit, normalizeUnit, RANK_EXP, rankFromExp, toBattleUnit } from '../common/game/model.ts';
import { battleWeaponExperience } from '../common/game/weapon-experience.ts';
import { runCombat } from '../common/engine/resolve.ts';
import { step } from '../common/engine/step.ts';
import type { Action, UnitState } from '../common/engine/types.ts';
import { RANKS } from '../common/data/types.ts';
import { SPELLBOOK_BY_ID } from '../common/data/spellbooks.ts';

function setup(t: { after: (fn: () => void) => void }) {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player } = loginOrRegister(store, 'weapon-experience');
  const sword = createUnit('erin', 1, 'xp-sword', 0, false, { classId: 'mercenary' });
  sword.ranks = { sword: 'E' }; sword.weaponExp = { sword: 49 };
  const mage = createUnit('owen', 1, 'xp-mage', 0, false, { classId: 'sage' });
  mage.ranks = { staff: 'A', tome: 'A' }; mage.weaponExp = { staff: RANK_EXP.A, tome: RANK_EXP.A };
  store.addUnit(player.id, sword); store.addUnit(player.id, mage);
  const record = createFieldBattle([sword, mage], { region: 1, cleared: 0, seed: 'weapon-experience' });
  const fighter = toBattleUnit(sword, 'player', sword.id, [2, 2]);
  const caster = toBattleUnit(mage, 'player', mage.id, [2, 3]);
  const foe = toBattleUnit(sword, 'enemy', 'foe', [3, 2]);
  for (const unit of [fighter, caster, foe]) {
    unit.stats = { hp: 100, str: 0, mag: 0, skl: 0, spd: 1, lck: 200, def: 99, res: 99, cha: 0 };
    unit.hp = 100; unit.skill = undefined; unit.skills = []; unit.classSkills = [];
    unit.weapons = ['iron_sword']; unit.weaponInstances = [{ id: 'iron_sword', durability: 40, maxDurability: 40 }];
    unit.bookInstances = []; unit.spellbooks = [];
  }
  fighter.stats.spd = 30;
  record.state.units = [fighter, caster, foe];
  record.state.map = { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('plain')) };
  record.state.goal = { kind: 'rout' }; record.state.objects = []; record.state.scenario = undefined;
  record.initial = structuredClone(record.state);
  const perform = (action: Action) => {
    const result = step(record.state, action);
    record.state = result.state; record.events.push(...result.events); record.actions.push(action);
    return result.events;
  };
  const settle = () => {
    record.state.result = { winner: 'enemy', reason: '撤退' };
    return applyBattleOutcome(store, player, record);
  };
  return { store, player, record, fighter, caster, foe, perform, settle };
}

function exchanges(record: BattleRecord, count = 3) {
  const [me, , foe] = record.state.units;
  for (let i = 0; i < count; i++) {
    const strikes = i === 2 ? runCombat(record.state, foe, me, 'iron_sword', record.events)
      : runCombat(record.state, me, foe, 'iron_sword', record.events);
    assert.ok(strikes.filter(strike => strike.by === me.id).length >= 2, 'the fighter actually follows up');
  }
}

test('ranks require rising incremental costs, including 60 points from D to C', () => {
  const totals = [0, 50, 110, 180, 260, 350, 450, 560];
  RANKS.forEach((rank, i) => {
    assert.equal(rankFromExp(totals[i]), rank);
    if (i) assert.equal(rankFromExp(totals[i] - 1), RANKS[i - 1]);
  });
  const unit = createUnit('erin', 1, 'new-curve', 0);
  unit.ranks.sword = 'D'; unit.weaponExp.sword = 50;
  assert.equal(addWeaponExp(unit, 'sword', 59), null);
  assert.equal(addWeaponExp(unit, 'sword', 1), 'C');
});

test('old saves retain ranks, points within each rank and stats; reloading never migrates twice', t => {
  const { store, player } = setup(t);
  const unit = createUnit('erin', 1, 'legacy-curve', 0);
  delete unit.weaponExpVersion;
  unit.ranks = { sword: 'C', bow: 'A', fist: 'D' };
  unit.weaponExp = { sword: 83, bow: 199, fist: 30 };
  const stats = structuredClone(unit.stats);
  normalizeUnit(unit);
  assert.deepEqual(unit.ranks, { sword: 'C', bow: 'A', fist: 'D' });
  assert.deepEqual(unit.weaponExp, { sword: 123, bow: 279, fist: 50 });
  assert.deepEqual(unit.stats, stats);
  const once = structuredClone(unit);
  normalizeUnit(unit);
  assert.deepEqual(unit, once);
  store.addUnit(player.id, unit);
  assert.deepEqual(store.unit(player.id, unit.id), once);
});

test('two attacks and an actual counter give 6 WEXP despite follow-ups and zero damage, even on defeat', t => {
  const { store, player, record, settle } = setup(t);
  exchanges(record);
  assert.equal(battleWeaponExperience(record).get('xp-sword')?.get('sword'), 6);
  const rewards = settle();
  const unit = store.unit(player.id, 'xp-sword')!;
  assert.equal(unit.weaponExp.sword, 55);
  assert.equal(unit.ranks.sword, 'D');
  assert.ok(rewards.weaponRanks.some(row => row.unit === unit.id && row.type === 'sword' && row.rank === 'D'));
});

test('a ranged attack against a sword gives no WEXP to the defender who never counters', t => {
  const { record, foe, fighter, store, player, settle } = setup(t);
  foe.classId = 'sage'; foe.ranks = { tome: 'A' }; foe.weapons = ['fire']; foe.pos = [4, 2];
  foe.bookInstances = [{ id: 'fire', charges: 20, maxCharges: 20 }];
  record.initial = structuredClone(record.state);
  runCombat(record.state, foe, fighter, 'fire', record.events);
  assert.ok(record.events.some(event => event.t === 'combat' && !event.strikes.some(strike => strike.by === fighter.id)));
  settle();
  assert.equal(store.unit(player.id, fighter.id)!.weaponExp.sword, 49);
});

for (const mode of ['field', 'festival', 'arena', 'sparring'] as const) {
  test(`${mode} keeps its existing progression eligibility`, t => {
    const { store, player, record, settle } = setup(t);
    record.mode = mode;
    exchanges(record);
    settle();
    assert.equal(store.unit(player.id, 'xp-sword')!.weaponExp.sword, mode === 'field' || mode === 'festival' ? 55 : 49);
  });
}

test('an already-started v52 battle retains its old once-per-map reward', t => {
  const { store, player, record, settle } = setup(t);
  record.catalogVersion = 52;
  exchanges(record);
  settle();
  assert.equal(store.unit(player.id, 'xp-sword')!.weaponExp.sword, 51);
});

for (const staff of ['fortify', 'sleep_staff'] as const) {
  test(`${staff} grants 2 WEXP for one paid use, including area effects or a missed status`, t => {
    const { record, caster, fighter, foe, perform, settle, store, player } = setup(t);
    caster.weapons = [staff]; caster.bookInstances = [{ id: staff, charges: 5, maxCharges: 5 }];
    caster.hp = 50; fighter.hp = 50; foe.stats.res = 200;
    if (staff === 'fortify') {
      const ally = structuredClone(fighter);
      ally.id = 'other-ally'; ally.pos = [1, 3];
      record.state.units.push(ally);
    }
    record.initial = structuredClone(record.state);
    const events = perform({ type: 'act', unit: caster.id, to: caster.pos, act: 'staff', target: staff === 'fortify' ? fighter.id : foe.id, weapon: staff });
    if (staff === 'fortify') assert.ok(events.filter(event => event.t === 'heal').length >= 2);
    else assert.ok(events.some(event => event.t === 'statusRoll' && !event.landed));
    settle();
    assert.equal(store.unit(player.id, caster.id)!.weaponExp.staff, RANK_EXP.A + 2);
  });
}

test('a two-target dragon art grants one paid use instead of one per target', t => {
  const { record, fighter, foe, perform } = setup(t);
  fighter.classId = 'dragonkin'; fighter.ranks = { dragon: 'B' };
  fighter.weapons = ['dragonstone']; fighter.weaponInstances = [{ id: 'dragonstone', durability: 30, maxDurability: 30 }];
  fighter.arts = ['fe_art_split_breath'];
  const other = structuredClone(foe);
  other.id = 'other'; other.pos = [2, 1];
  record.state.units.push(other);
  record.initial = structuredClone(record.state);
  const events = perform({ type: 'act', unit: fighter.id, to: fighter.pos, act: 'art', weapon: 'dragonstone', art: 'fe_art_split_breath', target: foe.id, secondary: other.id });
  assert.equal(events.filter(event => event.t === 'combat').length, 2);
  assert.equal(battleWeaponExperience(record).get(fighter.id)?.get('dragon'), 2);
});

for (const spellId of ['fw_spell_36', 'fw_spell_12', 'fw_spell_40']) {
  test(`${spellId} grants one award to the correct school without double counting combat or healing`, t => {
    const { record, caster, fighter, foe, perform, settle, store, player } = setup(t);
    const spell = SPELLBOOK_BY_ID.get(spellId)!;
    caster.weapons = []; caster.spellbooks = [{ id: spellId, charges: spell.maxCharges, maxCharges: spell.maxCharges }];
    fighter.hp = 50;
    record.initial = structuredClone(record.state);
    const events = perform({ type: 'act', unit: caster.id, to: caster.pos, act: 'cast', target: spell.role === 'heal' ? fighter.id : foe.id, spell: spellId });
    assert.ok(events.some(event => event.t === 'cast'));
    if (spell.role === 'attack') assert.ok(events.some(event => event.t === 'combat' && event.strikes.filter(strike => strike.by === caster.id).length === 2));
    settle();
    const unit = store.unit(player.id, caster.id)!;
    assert.equal(unit.weaponExp[spell.study === 'whiteMagic' ? 'staff' : 'tome'], RANK_EXP.A + 2);
    assert.equal(unit.weaponExp[spell.study === 'whiteMagic' ? 'tome' : 'staff'], RANK_EXP.A);
  });
}
