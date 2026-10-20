import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { WEAPON_ARTS, WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import type { WeaponId } from '../data/weapons.ts';
import { actionOptions, artForecast, forecast, forecastOnHit, moveRange, step, unitById } from './index.ts';
import { beginArtAction, endArtAction } from './arts.ts';
import type { ArtAction } from './arts.ts';
import type { BattleEvent, BattleState, UnitState } from './types.ts';

function setup(artId: string, weapon: WeaponId = 'iron_sword') {
  const state = createPinepassBattle('original-art');
  state.kind = 'arena'; state.goal = { kind: 'rout' }; state.objects = []; state.scenario = undefined;
  state.map = { width: 10, height: 10, tiles: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'plain' as const)) };
  const template = structuredClone(state.units[0]);
  const make = (id: string, side: 'player' | 'enemy', x: number, y: number): UnitState => ({
    ...structuredClone(template), id, side, classId: 'swordsman', name: id, pos: [x, y], weapons: ['iron_sword'], skill: undefined, skills: [], classSkills: [],
    stats: { hp: 300, str: 30, mag: 30, skl: 150, spd: 10, lck: 100, def: 20, res: 10, cha: 10 }, hp: 300, con: 30,
    ranks: { sword: 'SSS', beast: 'SSS', dragon: 'SSS' }, items: [], acted: false, alive: true,
    weaponInstances: [{ id: 'iron_sword', durability: 40, maxDurability: 40 }],
  });
  const me = make('me', 'player', 2, 2), foe = make('foe', 'enemy', 3, 2), ally = make('ally', 'player', 2, 3);
  me.weapons = [weapon]; me.weaponInstances = [{ id: weapon, durability: 40, maxDurability: 40 }]; me.arts = [artId];
  if (weapon === 'beast_claw') me.classId = 'beast_fighter';
  if (weapon === 'dragonstone') me.classId = 'dragonkin';
  state.units = [me, foe, ally];
  const action: ArtAction = { type: 'act', unit: me.id, to: [...me.pos], act: 'art', target: foe.id, weapon, art: artId };
  return { state, me, foe, ally, action, art: WEAPON_ART_BY_ID.get(artId)! };
}
const combats = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { t: 'combat' }> => e.t === 'combat');

test('all fifteen originals are playable with compatible weapon ranks and use exactly one attacker strike', () => {
  const originals = WEAPON_ARTS.filter(art => art.original);
  assert.equal(originals.length, 15);
  for (const art of originals) {
    const weapon = art.weapon === 'beast' ? 'beast_claw' : art.weapon === 'dragon' ? 'dragonstone' : 'brave_sword';
    const { state, me, foe, action } = setup(art.id, weapon);
    if (art.id === 'fe_art_focused_breath') foe.pos = [4, 2];
    if (art.id === 'fe_art_king_fang') foe.artEffects = { scent: ['player'] };
    const predicted = artForecast(state, me, me.pos, weapon, art, foe);
    assert.equal(predicted.attacker.strikes, 1, art.id);
    const result = step(state, action);
    const combat = combats(result.events)[0];
    assert.equal(combat.strikes.filter(strike => strike.by === me.id).length, 1, art.id);
    assert.equal(combat.strikes[0].damage, predicted.attacker.damage, art.id);
    assert.equal(unitById(result.state, me.id).weaponInstances![0].durability, 40 - art.cost, art.id);
  }
});

test('original target queries and validation agree on weapon intersection, ranks, walls and stationary conditions', () => {
  const { state, me, foe, action, art } = setup('fe_art_focused_breath', 'dragonstone');
  assert.equal(actionOptions(state, me, me.pos).arts[0].targets.length, 0);
  assert.throws(() => step(state, action), /射程/);
  foe.pos = [4, 2];
  assert.ok(actionOptions(state, me, me.pos).arts[0].targets.includes(foe));
  state.map.tiles[2][3] = 'wall';
  assert.equal(actionOptions(state, me, me.pos).arts[0].targets.length, 0);
  state.map.tiles[2][3] = 'plain';
  me.artEffects = { displaced: true };
  assert.throws(() => artForecast(state, me, me.pos, 'dragonstone', art, foe), /条件/);
  delete me.artEffects;
  me.ranks.dragon = 'E';
  assert.equal(actionOptions(state, me, me.pos).arts.length, 0);
  assert.throws(() => step(state, action), /熟练度/);
});

test('invalid commands are atomic and a missed attack still pays once', () => {
  const { state, me, action, art } = setup('fe_art_ankle_cut');
  me.weaponInstances![0].durability = art.cost - 1;
  const before = JSON.stringify(state);
  assert.throws(() => step(state, action), /耐久不足/);
  assert.equal(JSON.stringify(state), before);
  me.weaponInstances![0].durability = 40; me.stats.skl = -100;
  const result = step(state, action);
  assert.equal(combats(result.events)[0].strikes[0].hit, false);
  assert.equal(unitById(result.state, me.id).weaponInstances![0].durability, 40 - art.cost);
  assert.equal(unitById(result.state, 'foe').artEffects?.movementPenalty, undefined);
  assert.throws(() => step(result.state, action), /已经行动/);
});

test('ankle cut reduces movement until the actual next action ends and respects immunity', () => {
  const { state, foe, action } = setup('fe_art_ankle_cut');
  const result = step(state, action), target = unitById(result.state, foe.id);
  assert.equal(target.artEffects?.movementPenalty, 2);
  const limited = moveRange(result.state, target).cost.size;
  endArtAction(result.state, target, []);
  assert.ok(moveRange(result.state, target).cost.size > limited);
  foe.immunities = ['movement_debuff'];
  assert.equal(unitById(step(state, action).state, foe.id).artEffects?.movementPenalty, undefined);
});

test('terrain avoidance pierce applies before hit clamping and never removes non-terrain avoidance', () => {
  const { state, me, foe, art } = setup('fe_art_gap_stab');
  me.stats.skl = 50; me.stats.lck = 0; foe.stats.lck = 0; state.map.tiles[2][3] = 'forest';
  const normal = forecast(state, me.id, me.pos, 'iron_sword', foe.id);
  const special = artForecast(state, me, me.pos, 'iron_sword', art, foe);
  assert.equal(special.attacker.hit, Math.min(100, normal.attacker.hit + 20));
  state.map.tiles[2][3] = 'plain';
  const plain = artForecast(state, me, me.pos, 'iron_sword', art, foe);
  assert.equal(plain.attacker.hit, 100);
});

test('guard probe reduces only the first successful counter; pulse sever preserves brave counters', () => {
  for (const artId of ['fe_art_guard_probe', 'fe_art_braced_maul', 'fe_art_pulse_sever']) {
    const { state, me, foe, art, action } = setup(artId, artId === 'fe_art_braced_maul' ? 'beast_claw' : 'iron_sword');
    foe.weapons = ['brave_sword']; foe.stats.spd = 30;
    const f = artForecast(state, me, me.pos, action.weapon, art, foe);
    const counters = combats(step(state, action).events)[0].strikes.filter(strike => strike.by === foe.id);
    assert.deepEqual(forecastOnHit(f).filter(strike => strike.side === 'defender').map(s => s.damage), counters.map(s => s.damage));
    if (artId === 'fe_art_pulse_sever') assert.equal(counters.length, 2);
    else {
      assert.equal(counters.length, 4);
      assert.equal(counters[0].damage, Math.floor(f.defender.damage * (artId === 'fe_art_guard_probe' ? 70 : 80) / 100));
      assert.equal(counters[1].damage, f.defender.damage);
    }
  }
});

test('flanking pierce uses opposite ally, caps physical defense and obeys immunity', () => {
  const { state, me, foe, ally, art } = setup('fe_art_pack_flank', 'beast_claw');
  foe.stats.def = 40; me.stats.str = 50;
  const base = artForecast(state, me, me.pos, 'beast_claw', art, foe).attacker.damage;
  ally.pos = [4, 2];
  assert.equal(artForecast(state, me, me.pos, 'beast_claw', art, foe).attacker.damage, base + 8);
  foe.immunities = ['defense_pierce'];
  assert.equal(artForecast(state, me, me.pos, 'beast_claw', art, foe).attacker.damage, base);
});

test('scent helps subsequent faction attacks; king fang consumes before accuracy even on a miss', () => {
  const { state, me, foe, action } = setup('fe_art_scent_mark', 'beast_claw');
  const result = step(state, action), target = unitById(result.state, foe.id);
  assert.deepEqual(target.artEffects?.scent, ['player']);
  const hunter = unitById(result.state, me.id); hunter.acted = false; hunter.stats.skl = 30;
  const marked = forecast(result.state, me.id, me.pos, 'beast_claw', foe.id).attacker.hit;
  delete target.artEffects;
  const unmarked = forecast(result.state, me.id, me.pos, 'beast_claw', foe.id).attacker.hit;
  assert.equal(marked - unmarked, 10);
  hunter.arts = ['fe_art_king_fang']; hunter.stats.skl = -100;
  target.artEffects = { scent: ['player', 'enemy'] };
  const strike = { ...action, art: 'fe_art_king_fang' };
  const missed = step(result.state, strike);
  assert.equal(combats(missed.events)[0].strikes[0].hit, false);
  assert.deepEqual(unitById(missed.state, foe.id).artEffects?.scent, ['enemy']);
  endArtAction(missed.state, unitById(missed.state, foe.id), []);
  assert.equal(unitById(missed.state, foe.id).artEffects?.scent, undefined);
});

test('running rend counts walked cells rather than movement cost or displacement', () => {
  const { state, me, foe, art } = setup('fe_art_running_rend', 'beast_claw');
  foe.pos = [6, 2];
  const far = artForecast(state, me, [5, 2], 'beast_claw', art, foe);
  me.pos = [4, 2];
  const near = artForecast(state, me, [5, 2], 'beast_claw', art, foe);
  assert.equal(far.attacker.damage - near.attacker.damage, 5);
});

test('preselected ally swaps preserve actions and barriers expire on the caster action boundary', () => {
  const { state, me, ally, action } = setup('fe_art_cover_exchange');
  ally.acted = true;
  const result = step(state, { ...action, ally: ally.id });
  assert.deepEqual(unitById(result.state, me.id).pos, ally.pos);
  assert.deepEqual(unitById(result.state, ally.id).pos, me.pos);
  assert.equal(unitById(result.state, ally.id).acted, true);
  assert.throws(() => step(state, { ...action, ally: 'foe' }), /友军/);
  const shield = setup('fe_art_scale_rebuff', 'dragonstone');
  const protectedState = step(shield.state, { ...shield.action, ally: shield.ally.id }).state;
  assert.deepEqual(unitById(protectedState, shield.ally.id).artEffects?.barrier, { amount: 3, by: shield.me.id });
  beginArtAction(protectedState, unitById(protectedState, shield.me.id), []);
  assert.equal(unitById(protectedState, shield.ally.id).artEffects?.barrier, undefined);
});

test('barriers subtract after critical and consume once; embers are nonlethal and action-bound', () => {
  const { state, me, foe, action } = setup('fe_art_ember_trail', 'dragonstone');
  foe.artEffects = { barrier: { amount: 3, by: 'ally' } }; me.stats.skl = 500; foe.stats.lck = 0;
  const f = artForecast(state, me, me.pos, 'dragonstone', WEAPON_ART_BY_ID.get(action.art)!, foe);
  const result = step(state, action), strike = combats(result.events)[0].strikes[0];
  assert.equal(strike.crit, true);
  assert.equal(strike.damage, f.attacker.damage * 3 - 3);
  assert.equal(strike.damage, forecastOnHit(f)[0].criticalDamage);
  const target = unitById(result.state, foe.id); target.hp = 2;
  const events: BattleEvent[] = [];
  endArtAction(result.state, target, events);
  assert.equal(target.hp, 1); assert.equal(result.state.embers?.length, 0);
  assert.equal(events.filter(e => e.t === 'hazard').length, 1);
  assert.ok(!events.some(e => e.t === 'exp'));
});

test('split and line breaths validate all targets, suppress extra counters/crit and stop on petrification', () => {
  for (const id of ['fe_art_split_breath', 'fe_art_ancient_breath']) {
    const { state, me, foe, ally, action, art } = setup(id, 'dragonstone');
    ally.side = 'enemy'; ally.pos = [4, 2]; ally.weapons = ['levin_sword'];
    const selected = id === 'fe_art_split_breath' ? { ...action, secondary: ally.id } : action;
    const preview = artForecast(state, me, me.pos, 'dragonstone', art, foe, selected.secondary);
    assert.equal(preview.targets.length, 2);
    const result = step(state, selected), exchanges = combats(result.events);
    assert.equal(exchanges.length, 2); assert.equal(exchanges[1].strikes.length, 1);
    assert.ok(exchanges.flatMap(e => e.strikes).filter(s => s.by === me.id).every(s => !s.crit));
    assert.equal(exchanges[1].strikes[0].damage, Math.floor(preview.targets[1].forecast.attacker.damage * (id === 'fe_art_split_breath' ? 0.5 : 1)));
    foe.hp = 1; foe.shields = 1; foe.artEffects = { scent: ['player'], barrier: { amount: 1, by: 'ally' } };
    const stopped = step(state, selected);
    assert.equal(combats(stopped.events).length, 1);
    assert.equal(unitById(stopped.state, foe.id).petrified, true);
    assert.equal(unitById(stopped.state, foe.id).artEffects, undefined);
    assert.equal(unitById(stopped.state, ally.id).hp, ally.hp);
    assert.equal(JSON.stringify(step(JSON.parse(JSON.stringify(state)), selected)), JSON.stringify(stopped));
    ally.side = 'player';
    if (id === 'fe_art_ancient_breath') assert.throws(() => step(state, action), /条件/);
  }
});
