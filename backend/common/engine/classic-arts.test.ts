import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { ART_MECHANICS } from '../data/art-mechanics.ts';
import { CATALOG_CLASS_IDS, CLASSES } from '../data/classes.ts';
import { EQUIPMENT_ART_LINKS } from '../data/expanded-weapons.ts';
import { WEAPON_ARTS, WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import { actionOptions, artForecast, step, unitById } from './index.ts';
import { combatProgress, resolveStrike, strikeRates, strikeDamage } from './combat.ts';
import { artBonus, expireArtPhase } from './art-effects.ts';
import { seedRng } from './rng.ts';
import { createCrossTimeGroups } from './cross-time-groups.ts';
import type { ArtAction } from './arts.ts';
import type { BattleEvent } from './types.ts';

function setup(id: string, chosen?: WeaponId) {
  const art = WEAPON_ART_BY_ID.get(id)!;
  const link = EQUIPMENT_ART_LINKS.find(l => l.artId === id);
  const defaults: Record<string, WeaponId> = { sword: 'iron_sword', lance: 'javelin', axe: 'hand_axe', bow: 'iron_bow', dagger: 'dagger', beast: 'beast_claw', dragon: 'dragonstone', fist: 'silver_gauntlet' };
  const weapon = chosen ?? (link?.projectWeaponId as WeaponId | undefined) ?? defaults[art.weapon];
  assert.ok(WEAPONS[weapon], `${id}: fixture weapon ${weapon}`);
  const state = createPinepassBattle('classic-engine');
  state.kind = 'arena'; state.goal = { kind: 'rout' }; state.objects = []; state.scenario = undefined;
  state.map = { width: 20, height: 12, tiles: Array.from({ length: 12 }, () => Array(20).fill('plain')) };
  const me = structuredClone(state.units[0]), foe = structuredClone(state.units[0]);
  for (const u of [me, foe]) {
    u.stats = { hp: 10000, str: 40, mag: 40, skl: 200, spd: 10, lck: 150, def: 20, res: 10, cha: 0 };
    u.hp = 10000; u.con = 100; u.skill = undefined; u.skills = []; u.classSkills = []; u.items = [];
    u.acted = false; u.alive = true; u.shields = 0; u.tags = []; u.immunities = []; delete u.artEffects;
  }
  me.id = 'me'; me.side = 'player'; me.pos = [3, 4];
  me.classId = CATALOG_CLASS_IDS.find(c => CLASSES[c].weapons[WEAPONS[weapon].type])!;
  // 多熟练度武器（巨剑、长柄刀等）另列的副类熟练度也须达标。
  me.ranks = { [WEAPONS[weapon].type]: 'SSS', ...Object.fromEntries((WEAPONS[weapon].requires ?? []).map(req => [req.type, 'SSS'])) }; me.weapons = [weapon];
  me.weaponInstances = [{ id: weapon, durability: 200, maxDurability: 200, refinement: link?.minimumRefinement ?? 0 }];
  me.arts = link ? [] : [id];
  foe.id = 'foe'; foe.side = 'enemy'; foe.pos = [3 + art.range[0], 4]; foe.classId = 'swordsman';
  foe.weapons = ['iron_sword']; foe.ranks = { sword: 'SSS' }; foe.weaponInstances = [{ id: 'iron_sword', durability: 200, maxDurability: 200 }];
  state.units = [me, foe];
  const action: ArtAction = { type: 'act', unit: me.id, to: [...me.pos], act: 'art', weapon, art: id, target: foe.id };
  return { state, me, foe, art, weapon, action, preview: () => artForecast(state, me, me.pos, weapon, art, foe) };
}
const combats = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { t: 'combat' }> => e.t === 'combat');

for (const art of WEAPON_ARTS.filter(a => !a.original)) test(`classic executable/replay: ${art.id}`, () => {
  const { state, me, foe, weapon, action, preview } = setup(art.id);
  const before = JSON.stringify(state);
  assert.ok(actionOptions(state, me, me.pos).arts.some(o => o.art === art.id && o.weapon === weapon && o.usable && o.targets.includes(foe)));
  const f = preview();
  assert.equal(JSON.stringify(state), before, 'query/forecast must not mutate or consume RNG');
  for (const side of [f.attacker, f.defender]) for (const p of [side.hit, side.crit]) assert.ok(p >= 0 && p <= 100);
  for (const p of [f.attackerDies, f.defenderDies]) assert.ok(p >= 0 && p <= 1);
  const result = step(state, action);
  assert.ok(combats(result.events).length > 0);
  const durability = unitById(result.state, me.id).weaponInstances![0].durability;
  assert.ok(durability === 200 - art.cost || !!ART_MECHANICS[art.id].refund && durability === 200, `${art.id}: ${durability}`);
  assert.equal(JSON.stringify(step(JSON.parse(before), JSON.parse(JSON.stringify(action)))), JSON.stringify(result));
  assert.equal(JSON.stringify(state), before);
});

test('fixed English sequences suppress both brave and speed; supplement single suppresses brave', () => {
  for (const art of WEAPON_ARTS.filter(a => !a.original && (/^fixed_[2345]_hits$/.test(a.sequence) || a.sequence === 'single') && a.id !== 'fw_art_350')) {
    const brave = Object.entries(WEAPONS).find(([, w]) => w.type === art.weapon && w.brave);
    const x = setup(art.id, art.unlock.kind === 'equipment_grant' || ART_MECHANICS[art.id].rangeWeaponRequired ? undefined : brave?.[0] as WeaponId | undefined); x.me.stats.spd = 80;
    const expected = art.sequence === 'single' ? 1 : Number(art.sequence[6]);
    assert.equal(x.preview().attacker.strikes, expected, art.id);
    assert.equal(combats(step(x.state, x.action).events).flatMap(e => e.strikes).filter(s => s.by === x.me.id).length, expected, art.id);
  }
});

test('350 conditional fixed count and 358 forced chance clamp, including negative magic', () => {
  for (const bow of [false, true]) {
    const x = setup('fw_art_350'); x.foe.weapons = [bow ? 'iron_bow' : 'iron_sword']; x.foe.weaponInstances![0].id = x.foe.weapons[0]; x.foe.ranks.bow = 'SSS'; x.foe.classId = bow ? 'archer' : 'swordsman';
    assert.equal(x.preview().attacker.strikes, bow ? 2 : 1);
  }
  for (const mag of [-100, 0, 200, 1000]) {
    const x = setup('fw_art_358'); x.me.stats.mag = mag; x.me.stats.spd = 0;
    const expected = mag >= 200 ? 2 : 1;
    assert.equal(combats(step(x.state, x.action).events)[0].strikes.filter(s => s.by === 'me').length, expected);
  }
});

test('magic families use resistance, physical families defense; terrain bypass removes both bonuses', () => {
  for (const id of ['fw_art_348', 'fw_art_345', 'fw_art_357', 'fw_art_343']) {
    const x = setup(id), before = x.preview().attacker.damage;
    x.foe.stats.def += 8;
    assert.equal(x.preview().attacker.damage, before - (ART_MECHANICS[id].magic ? 0 : 8), id);
    x.foe.stats.def -= 8; x.foe.stats.res += 8;
    assert.equal(x.preview().attacker.damage, before - (ART_MECHANICS[id].magic ? 8 : 0), id);
  }
  for (const id of ['fw_art_35', 'fw_art_107', 'fw_art_303', 'fw_art_325']) {
    const x = setup(id); x.me.stats.skl = 20; const plain = x.preview();
    x.state.map.tiles[x.foe.pos[1]][x.foe.pos[0]] = 'forest';
    assert.equal(x.preview().attacker.damage, plain.attacker.damage); assert.equal(x.preview().attacker.hit, plain.attacker.hit);
  }
});

test('fixed hit differs from guaranteed opening/all, and miss bonuses accumulate per miss', () => {
  for (const [id, hit] of [['fw_art_171', 10], ['fw_art_262', 10], ['fw_art_359', 50]] as const) {
    const x = setup(id); assert.equal(x.preview().attacker.hit, hit); x.me.stats.skl = -100; assert.equal(x.preview().attacker.hit, hit);
  }
  for (const id of ['fw_art_202', 'fw_art_322', 'fw_art_184']) {
    const x = setup(id); x.me.stats.skl = -10; const f = x.preview(), p = combatProgress(f), s = { side: 'attacker' as const, followUp: false };
    const initial = strikeRates(f, s, p).hit; resolveStrike(f, s, p, false, false);
    const second = strikeRates(f, { ...s, followUp: true }, p).hit;
    if (id === 'fw_art_322') assert.equal(second, 100);
    else if (id === 'fw_art_202') { assert.equal(initial, 100); assert.ok(second < 100); }
    else { assert.equal(second, Math.min(100, initial + 10)); resolveStrike(f, s, p, false, false); assert.equal(strikeRates(f, s, p).hit, Math.min(100, initial + 20)); }
  }
});

test('minimum damage precedes nether protection; nonlethal permits HP1 kill but never bypasses immortal shield', () => {
  for (const [id, min] of [['fw_art_176', 10], ['fw_art_203', 10], ['fw_art_351', 20]] as const) {
    const x = setup(id); x.foe.stats.def = 9999; const plain = x.preview(); assert.equal(strikeDamage(plain, 'attacker', false, combatProgress(plain)), min);
    x.foe.tags = ['nether_protection']; const f = x.preview(); assert.equal(strikeDamage(f, 'attacker', false, combatProgress(f)), min / 2);
  }
  for (const id of ['fw_art_206', 'fw_art_331', 'fw_art_195', 'fw_art_301']) for (const hp of [1, 2]) {
    const x = setup(id); x.foe.hp = hp;
    assert.equal(unitById(step(x.state, x.action).state, 'foe').hp, hp === 2 ? 1 : 0, id);
    x.foe.shields = 1;
    assert.equal(unitById(step(x.state, x.action).state, 'foe').hp, 1, id);
  }
});

test('miss counter seal, refund payment validation, and after-debuff applies to foe even on miss', () => {
  const miss = setup('fw_art_191'); miss.me.stats.skl = -1000;
  assert.ok(combats(step(miss.state, miss.action).events)[0].strikes.every(s => s.by === 'me'));
  const refund = setup('fw_art_112'); refund.me.stats.skl = 1000;
  assert.equal(unitById(step(refund.state, refund.action).state, 'me').weaponInstances![0].durability, 200);
  refund.me.weaponInstances![0].durability = 0; const before = JSON.stringify(refund.state);
  assert.throws(() => step(refund.state, refund.action)); assert.equal(JSON.stringify(refund.state), before);
  const debuff = setup('fw_art_108'); debuff.me.stats.skl = -1000;
  const r = step(debuff.state, debuff.action);
  assert.equal(artBonus(unitById(r.state, 'foe'), 'avoid'), -20); assert.equal(artBonus(unitById(r.state, 'me'), 'avoid'), 0);
});

test('guaranteed on-hit statuses are live effects with phase expiry and immunity', () => {
  for (const [id, statuses] of [['fw_art_33', ['poison']], ['fw_art_106', ['silence', 'root']], ['fw_art_349', ['silence']]] as const) {
    const x = setup(id), r = step(x.state, x.action), foe = unitById(r.state, 'foe');
    for (const status of statuses) assert.ok(foe.artEffects?.statuses?.includes(status));
    expireArtPhase(r.state, 'enemy', 'end', []);
    for (const status of statuses.filter(s => s !== 'poison')) assert.ok(!foe.artEffects?.statuses?.includes(status));
    x.foe.immunities = [...statuses];
    const immune = unitById(step(x.state, x.action).state, 'foe');
    for (const status of statuses) assert.ok(!immune.artEffects?.statuses?.includes(status));
  }
});

test('drain heals actual HP loss, clamps overkill, respects shield and healing immunity', () => {
  for (const shield of [false, true]) for (const immune of [false, true]) {
    const x = setup('fw_art_62'); x.me.hp = 9000; x.foe.hp = 7; x.foe.shields = shield ? 1 : 0;
    x.me.immunities = immune ? ['healing'] : []; x.foe.stats.str = 0;
    const result = step(x.state, x.action), actor = unitById(result.state, 'me');
    const heals = combats(result.events).flatMap(e => e.strikes).filter(s => s.by === 'me' && s.byHpAfter !== undefined);
    assert.equal(heals.length, immune ? 0 : 1);
    assert.equal(actor.hp, 9000 + (immune ? 0 : 3));
  }
});

test('square area hits nine enemies, including beyond center range, never friendlies, costs once', () => {
  const x = setup('fw_art_22'); x.foe.pos = [5, 4];
  const victims = [];
  for (let y = 3; y <= 5; y++) for (let col = 4; col <= 6; col++) {
    const u = structuredClone(x.foe); u.id = `victim-${col}-${y}`; u.pos = [col, y]; victims.push(u);
  }
  x.foe = victims.find(u => u.pos[0] === 5 && u.pos[1] === 4)!;
  x.action.target = x.foe.id; x.state.units = [x.me, ...victims];
  const f = artForecast(x.state, x.me, x.me.pos, x.weapon, x.art, x.foe);
  assert.equal(f.targets.length, 9);
  assert.equal(f.targets[0].forecast.assumption, undefined);
  assert.ok(f.targets.slice(1).every(t => t.forecast.assumption === 'independent_opening_state'));
  const result = step(x.state, x.action), exchanges = combats(result.events);
  assert.equal(exchanges.length, 9);
  assert.ok(exchanges.every(e => e.strikes.filter(s => s.by === 'me').length === 1));
  assert.ok(exchanges.flatMap(e => e.strikes).filter(s => s.by === 'me').every(s => !s.crit));
  assert.equal(unitById(result.state, 'me').weaponInstances![0].durability, 200 - x.art.cost);
  victims[0].side = 'player';
  const friendly = step(x.state, x.action);
  assert.equal(combats(friendly.events).length, 8);
  assert.equal(unitById(friendly.state, victims[0].id).hp, 10000);
});

test('area action shares the attacker trait roll across victims and stat-based art options', () => {
  for (const [seed, active] of [['area-burst-2', true], ['area-burst-3', false]] as const) {
    const x = setup('fw_art_22'); x.state.rng = seedRng(seed); x.me.skill = 'risky_scheme';
    x.foe.pos = [5, 4];
    const second = structuredClone(x.foe); second.id = 'second'; second.pos = [5, 5]; x.state.units.push(second);
    const before = JSON.stringify(x.state), result = step(x.state, x.action), exchanges = combats(result.events);
    assert.equal(exchanges.length, 2);
    assert.equal(exchanges[0].forecast?.traitRolls?.me, active);
    assert.deepEqual(exchanges[0].forecast?.traitRolls, exchanges[1].forecast?.traitRolls);
    for (const exchange of exchanges) {
      assert.equal(exchange.forecast!.attacker.skl, 200 + (exchange.forecast!.traitRolls!.me ? 10 : 0));
    }
    assert.equal(unitById(result.state, 'me').stats.skl, 200);
    assert.equal(JSON.stringify(step(JSON.parse(before), x.action)), JSON.stringify(result));
    assert.equal(JSON.stringify(x.state), before);
    const proc = setup('fw_art_24'); proc.me.skill = 'risky_scheme'; proc.me.stats.skl = 20; proc.state.rng = seedRng(seed);
    const branch = proc.preview().branches!.find(b => b.rolls.me === active)!.forecast;
    assert.equal(combats(step(proc.state, proc.action).events)[0].forecast!.art!.procChance, branch.art!.procChance);
  }
});

test('skipped area victims never trigger their dormant group', () => {
  const x = setup('axe_sweep');
  x.state.map.height = 24; x.state.map.tiles = Array.from({ length: 24 }, () => Array(20).fill('plain'));
  x.me.pos = [3, 19]; x.foe.pos = [4, 19]; x.foe.hp = 1;
  const second = structuredClone(x.foe); second.id = 'second'; second.pos = [3, 20]; second.hp = 10000;
  const guard = structuredClone(second); guard.id = 'guard'; guard.pos = [10, 20];
  x.state.units.push(second, guard);
  x.state.crossTimeGroups = createCrossTimeGroups([{ id: 'foe', group: 'A' }, { id: 'guard', group: 'A' }, { id: 'second', group: 'B' }]);
  for (const group of x.state.crossTimeGroups) group.unitIds = group.unitIds.map(id => id.replace('cross-time:', ''));
  const result = step(x.state, { ...x.action, to: x.me.pos, secondary: second.id });
  assert.deepEqual(combats(result.events).map(e => e.defender), ['foe']);
  assert.equal(unitById(result.state, second.id).hp, 10000);
  assert.equal(result.state.crossTimeGroups!.find(g => g.id === 'B')!.activateTurn, undefined);
});

test('line area grants first-hit trait damage only to the selected primary target', () => {
  const x = setup('chariot_line'); x.me.skill = 'capture_banner'; x.foe.pos = [7, 4];
  const near = structuredClone(x.foe); near.id = 'near'; near.pos = [5, 4]; x.state.units.push(near);
  const preview = x.preview();
  for (const entry of preview.targets) assert.equal(entry.forecast.attacker.firstDamage, entry.target === x.foe.id ? 4 : 0);
  assert.equal(preview.attacker.firstDamage, 4);
  for (const exchange of combats(step(x.state, x.action).events))
    assert.equal(exchange.forecast!.attacker.firstDamage, exchange.defender === x.foe.id ? 4 : 0);
});

test('proc stat clamps to exact zero/full and follow-up-only eligibility is explicit', () => {
  for (const id of ['fw_art_24', 'fw_art_217', 'fw_art_238']) {
    for (const stat of [-100, 200]) {
      const x = setup(id), proc = ART_MECHANICS[id].proc!;
      x.me.stats[proc.stat!] = stat;
      const f = x.preview(), p = combatProgress(f);
      assert.equal(strikeRates(f, { side: 'attacker', followUp: false }, p).proc, stat < 0 ? 0 : 100);
      assert.equal(strikeRates(f, { side: 'attacker', followUp: true }, p).proc, stat < 0 || !proc.followUp ? 0 : 100);
    }
  }
});

test('poison seals follow-ups only after a successful non-immune hit', () => {
  for (const kind of ['miss', 'immune', 'poison'] as const) {
    const x = setup('fw_art_33'); x.me.stats.spd = 0; x.foe.stats.spd = 30;
    if (kind === 'miss') x.me.stats.skl = -10000;
    if (kind === 'immune') x.foe.immunities = ['poison'];
    const f = x.preview();
    assert.equal(f.defender.doubles, true, 'on-hit status must not unconditionally seal');
    const strikes = combats(step(x.state, x.action).events)[0].strikes;
    assert.equal(strikes.filter(s => s.by === 'foe').length, kind === 'poison' ? 1 : 2, kind);
  }
});

test('reapplying an equal or weaker speed debuff does not subtract speed a second time', () => {
  for (const prior of [0, -3, -5]) {
    const x = setup('dragon_pressure'); x.me.stats.spd = 10; x.foe.stats.spd = 14 - prior;
    x.foe.classId = CATALOG_CLASS_IDS.find(c => CLASSES[c].weapons.lance)!; x.foe.weapons = ['javelin']; x.foe.ranks = { lance: 'SSS' };
    x.foe.weaponInstances = [{ id: 'javelin', durability: 200, maxDurability: 200 }];
    if (prior) x.foe.artEffects = { buffs: [{ source: 'earlier-pressure', stat: 'spd', amount: prior, duration: 'phase', turn: 1 }] };
    assert.equal(x.preview().defender.doubles, true);
    const result = step(x.state, x.action);
    assert.equal(combats(result.events)[0].strikes.filter(s => s.by === 'foe').length, prior ? 2 : 1);
    assert.equal(artBonus(unitById(result.state, 'foe'), 'spd'), Math.min(prior, -3));
  }
});

test('probabilistic forced follow-up rolls one decision for the entire brave packet', () => {
  const brave = Object.entries(WEAPONS).find(([, w]) => w.type === 'axe' && w.brave)![0] as WeaponId;
  for (const weapon of ['iron_axe', brave] as WeaponId[]) {
    const x = setup('fw_art_358', weapon); x.me.stats.mag = 50; x.me.stats.spd = 0;
    x.foe.weapons = []; x.foe.weaponInstances = [];
    const opening = WEAPONS[weapon].brave ? 2 : 1;
    const damage = x.preview().attacker.rawDamage;
    x.foe.hp = damage * (2 * opening - 1) + 1;
    const f = x.preview();
    assert.equal(f.attacker.hit, 100); assert.equal(f.attacker.crit, 0);
    assert.equal(f.defenderDies, .25, 'two optional brave blows share the same 25% decision');
    assert.equal(f.expectedDealt, .75 * damage * opening + .25 * x.foe.hp);
    x.foe.hp = 10000;
    const lengths = new Set<number>();
    for (let seed = 0; seed < 64; seed++) {
      x.state.rng = seedRng(`packet-${seed}`);
      lengths.add(combats(step(x.state, x.action).events)[0].strikes.filter(s => s.by === 'me').length);
    }
    assert.deepEqual([...lengths].sort((a, b) => a - b), [opening, opening * 2]);
  }
});

test('nether protection stripping applies on-hit, persists through the next exchange, and never bypasses immunity', () => {
  const x = setup('fw_art_204', 'steel_gauntlet'); x.me.stats.spd = 0; x.foe.weapons = []; x.foe.tags = ['nether_protection'];
  const f = x.preview(), base = Math.max(0, f.attacker.rawDamage);
  let result = step(x.state, x.action);
  assert.deepEqual(combats(result.events)[0].strikes.map(s => s.damage), [Math.floor(base / 2), base]);
  assert.equal(artBonus(unitById(result.state, 'foe'), 'protection'), -1);
  unitById(result.state, 'me').acted = false;
  result = step(result.state, { ...x.action, act: 'attack' });
  assert.equal(artBonus(unitById(result.state, 'foe'), 'protection'), 0);
  x.foe.immunities = ['defense_pierce'];
  result = step(x.state, x.action);
  assert.deepEqual(combats(result.events)[0].strikes.map(s => s.damage), [Math.floor(base / 2), Math.floor(base / 2)]);
});

test('art combat events preserve the original forecast for replay presentation', () => {
  const x = setup('fw_art_29'); const f = x.preview();
  const event = combats(step(x.state, x.action).events)[0];
  assert.deepEqual(JSON.parse(JSON.stringify(event.forecast)), JSON.parse(JSON.stringify({ ...f, targets: undefined })));
});

test('missing physical instance rejects atomically, including RNG', () => {
  const x = setup('fw_art_112'); delete x.me.weaponInstances; const before = JSON.stringify(x.state);
  assert.throws(() => step(x.state, x.action)); assert.equal(JSON.stringify(x.state), before);
});
