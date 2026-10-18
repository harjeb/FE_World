import { WEAPONS, triangle } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { ART_MECHANICS } from '../data/art-mechanics.ts';
import type { ArtMechanics } from '../data/art-mechanics.ts';
import { TERRAINS } from '../maps/map.ts';
import { skillMods } from './skills.ts';
import type { Fighter } from './skills.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { artVictims, validateArt, walkedCells } from './arts.ts';
import { artBonus, artStats } from './art-effects.ts';
import { classOf, distance, equipped, inRange, living, samePoint, unitById } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Formulas from docs/03-combat.md. Art percentages are applied before protection and crit.
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export interface TerrainBonus { name: string; avoid: number; def: number; applies: boolean }
export interface SideForecast {
  unit: string; weapon: WeaponId | null; hp: number; maxHp: number;
  attackSpeed: number; attack: number; damage: number; rawDamage: number; hit: number; crit: number; followUpCrit: number;
  strikes: number; canAttack: boolean; doubles: boolean; triangle: -1 | 0 | 1; effective: boolean;
  terrain: TerrainBonus; barrier: number; protected: boolean; netherProtected: boolean; silenceable: boolean;
}
export interface StrikeSpec { side: 'attacker' | 'defender'; followUp: boolean; chance?: number }
export interface Forecast {
  attacker: SideForecast; defender: SideForecast; order: StrikeSpec[];
  defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number;
  art?: CombatArt;
  assumption?: 'independent_opening_state';
}
export interface CombatArt extends ArtMechanics {
  id: string; might: number; hit: number; crit: number; sequence?: string; hits?: number;
  single?: boolean; noCrit?: boolean; scale?: number; pierce?: number; terrainAvoid?: number;
  firstCounterReduction?: number; reductionOnHit?: boolean; sealOnHit?: boolean;
  procChance?: number; forceProbability?: number; allowFoeFollowUp?: boolean; onHitStatLoss?: number;
}
export interface CombatProgress {
  aHp: number; dHp: number; attackerHit: boolean; counterReduced: boolean; barrierA: number; barrierD: number;
  counterBlocked: boolean; defenderNoFollow: boolean; misses: number; attacks: number; stopped: boolean;
  defenseLoss: number; speedLoss: number; netherDisabled: boolean; forced: -1 | 0 | 1;
}
export function combatProgress(f: Forecast): CombatProgress {
  return { aHp: f.attacker.hp, dHp: f.defender.hp, attackerHit: false, counterReduced: false,
    barrierA: f.attacker.barrier, barrierD: f.defender.barrier, counterBlocked: false,
    defenderNoFollow: !!f.art?.sealFollowUp && !f.art.sealOnHit, misses: 0, attacks: 0, stopped: false,
    defenseLoss: 0, speedLoss: 0, netherDisabled: false, forced: -1 };
}
export function skipStrike(f: Forecast, spec: StrikeSpec, p: CombatProgress): boolean {
  return p.stopped || p.aHp <= 0 || p.dHp <= 0 || (spec.side === 'defender' && (p.counterBlocked
    || (spec.followUp && (p.defenderNoFollow || f.defender.attackSpeed - p.speedLoss - f.attacker.attackSpeed < 4))));
}
export function strikeRates(f: Forecast, spec: StrikeSpec, p: CombatProgress) {
  const me = f[spec.side], art = spec.side === 'attacker' ? f.art : undefined;
  const guaranteed = art?.sureHit === 'all' || (art?.sureHit === 'first' && p.attacks === 0);
  return {
    hit: guaranteed ? 100 : clamp(me.hit + (art?.hitAfterMiss ?? 0) * p.misses),
    crit: spec.followUp ? me.followUpCrit : me.crit,
    proc: art?.proc && (!spec.followUp || art.proc.followUp) && (art.proc.when !== 'foe_full' || p.dHp === f.defender.maxHp) ? art.procChance ?? 0 : 0,
  };
}
export function strikeDamage(f: Forecast, side: StrikeSpec['side'], critical: boolean, p: CombatProgress, followUp = false, proc = false): number {
  const me = f[side], art = f.art;
  let raw = me.rawDamage;
  if (side === 'attacker') raw += (followUp ? art?.followUpAttack ?? 0 : 0) + (proc ? art?.proc?.attack ?? 0 : 0) + p.defenseLoss;
  let damage = Math.floor(Math.max(side === 'attacker' ? art?.minimumDamage ?? 0 : 0, raw) * (side === 'attacker' ? art?.scale ?? 1 : art?.incomingScale ?? 1));
  if ((side === 'attacker' ? f.defender.netherProtected && !p.netherDisabled : f.attacker.netherProtected)) damage = Math.floor(damage / 2);
  damage *= critical ? 3 : 1;
  if (side === 'defender' && !p.counterReduced && (!art?.reductionOnHit || p.attackerHit)) damage = Math.floor(damage * (100 - (art?.firstCounterReduction ?? 0)) / 100);
  damage = Math.max(0, damage - (side === 'attacker' ? p.barrierD : p.barrierA));
  if (side === 'attacker' && art?.nonlethal && p.dHp >= 2) damage = Math.min(damage, p.dHp - 1);
  return damage;
}
export interface StrikeResolution { damage: number; hpAfter: number; heal: number; shield: boolean; afflicted: boolean }
// Runtime rolls and exact forecast branches both use this state transition.
export function resolveStrike(f: Forecast, spec: StrikeSpec, p: CombatProgress, hit: boolean, critical: boolean, proc = false, block = false, afflict = false): StrikeResolution {
  const isA = spec.side === 'attacker', art = f.art;
  if (spec.chance !== undefined) p.forced = 1;
  const damage = hit ? strikeDamage(f, spec.side, critical, p, spec.followUp, proc) : 0;
  const before = isA ? p.dHp : p.aHp;
  let after = Math.max(0, before - damage), shield = false, heal = 0;
  if (hit) {
    if (after === 0 && (isA ? f.defender.protected : f.attacker.protected)) { after = 1; shield = true; p.stopped = true; }
    if (isA) { p.attackerHit = true; p.barrierD = 0; }
    else { p.barrierA = 0; if (!art?.reductionOnHit || p.attackerHit) p.counterReduced = true; }
  }
  if (isA) {
    p.dHp = after; p.attacks++;
    if (!hit) { p.misses++; if (art?.counterBlockOnMiss) p.counterBlocked = true; }
    if (hit && art?.drain && p.aHp > 0) { heal = Math.min(f.attacker.maxHp - p.aHp, Math.floor((before - after) * art.drain)); p.aHp += heal; }
    if (hit && block) p.counterBlocked = true;
    if (hit && art?.sealFollowUp && art.sealOnHit) p.defenderNoFollow = true;
    if (hit && afflict && after > 0 && !shield) {
      if (!art?.allowFoeFollowUp && art?.onHit?.statuses?.some(s => s === 'poison' || s === 'confusion')) p.defenderNoFollow = true;
      if (art?.onHit?.statuses?.includes('silence') && f.defender.silenceable) p.counterBlocked = true;
      const debuff = art?.onHit?.debuff;
      if (debuff?.stat === 'def') p.defenseLoss = Math.max(p.defenseLoss, art?.onHitStatLoss ?? 0);
      if (debuff?.stat === 'spd') p.speedLoss = Math.max(p.speedLoss, art?.onHitStatLoss ?? 0);
      if (art?.onHit?.stripProtection) p.netherDisabled = true;
    }
  } else p.aHp = after;
  return { damage, hpAfter: after, heal, shield, afflicted: hit && afflict && after > 0 && !shield };
}
export function forecastOnHit(f: Forecast): (StrikeSpec & { damage: number; criticalDamage: number; maxDamage: number; criticalMaxDamage: number })[] {
  const result: (StrikeSpec & { damage: number; criticalDamage: number; maxDamage: number; criticalMaxDamage: number })[] = [];
  const p = combatProgress(f);
  for (const spec of f.order) {
    if (skipStrike(f, spec, p)) continue;
    const canProc = strikeRates(f, spec, p).proc > 0;
    result.push({ ...spec, damage: strikeDamage(f, spec.side, false, p, spec.followUp), criticalDamage: strikeDamage(f, spec.side, true, p, spec.followUp),
      maxDamage: strikeDamage(f, spec.side, false, p, spec.followUp, canProc), criticalMaxDamage: strikeDamage(f, spec.side, true, p, spec.followUp, canProc) });
    resolveStrike(f, spec, p, true, false, false, (f.art?.counterBlockOnHit ?? 0) >= 100, !!f.art?.onHit && (f.art.onHit.chance ?? 100) >= 100);
  }
  return result;
}
export function attackSpeed(unit: UnitState, weapon: WeaponId | null): number {
  return artStats(unit).spd - Math.max(0, (weapon ? WEAPONS[weapon].weight : 0) - unit.con);
}
export function terrainBonus(state: BattleState, unit: UnitState, [x, y]: Point): TerrainBonus {
  const t = TERRAINS[state.map.tiles[y][x]], applies = classOf(unit).moveType !== 'flying';
  return { name: t.name, avoid: applies ? t.avoid : 0, def: applies ? t.def : 0, applies };
}
export function unitCombatStats(state: BattleState, unit: UnitState, weaponId: WeaponId | null, pos: Point = unit.pos) {
  const w = weaponId ? WEAPONS[weaponId] : null, s = artStats(unit);
  const mods = skillMods(state, { unit, pos, weapon: w, moved: unit.movedTurn === state.turn });
  const as = attackSpeed(unit, weaponId);
  return {
    attack: w ? ((w.type === 'tome' || w.type === 'dragon') ? s.mag : s.str) + w.might + mods.attack + artBonus(unit, 'attack') : 0,
    hit: w ? w.hit + s.skl * 2 + Math.floor(s.lck / 2) + mods.hit + artBonus(unit, 'hit') : 0,
    crit: w ? w.crit + Math.floor(s.skl / 2) + mods.crit + artBonus(unit, 'crit') : 0,
    attackSpeed: as + mods.attackSpeed + artBonus(unit, 'as'),
    avoid: as * 2 + s.lck + terrainBonus(state, unit, pos).avoid + mods.avoid + artBonus(unit, 'avoid'),
  };
}
function matches(unit: UnitState, kind: NonNullable<ArtMechanics['effective']>[number]): boolean {
  const c = classOf(unit);
  return kind === 'flying' || kind === 'mounted' ? c.moveType === kind : kind === 'armored' ? c.armored
    : kind === 'beast' || kind === 'dragon' ? c.route === kind : !!unit.tags?.includes('demon');
}
function sideVs(state: BattleState, me: Fighter, meWeapon: WeaponId | null, foe: Fighter, foeWeapon: WeaponId | null, art?: CombatArt, incoming?: CombatArt): SideForecast {
  const w = me.weapon, fw = foe.weapon, s = artStats(me.unit), fs = artStats(foe.unit);
  const tri = w && fw ? triangle(w.type, fw.type) : 0;
  const effective = !!w?.effective?.includes(classOf(foe.unit).moveType) || (classOf(foe.unit).armored && !!w?.effective?.includes('armored'))
    || !!w?.effectiveRoutes?.some(route => route === classOf(foe.unit).route) || !!art?.effective?.some(kind => matches(foe.unit, kind));
  const mods = skillMods(state, me), fm = skillMods(state, foe), am = art?.mods, im = incoming?.foeMods;
  const magic = art?.magic || w?.type === 'tome' || w?.type === 'dragon';
  const attack = w ? (magic ? s.mag : s.str) + (w.might + tri) * (effective ? 3 : 1) + mods.attack + artBonus(me.unit, 'attack') + (art?.might ?? 0) + (am?.attack ?? 0) + (im?.attack ?? 0) : 0;
  const ft = terrainBonus(state, foe.unit, foe.pos), foeAm = incoming?.mods, foeIm = art?.foeMods;
  const protection = Math.max(0, (magic ? fs.res + fm.res + (foeAm?.res ?? 0) + (foeIm?.res ?? 0) : fs.def + fm.def + (foeAm?.def ?? 0) + (foeIm?.def ?? 0)) - (art?.pierce ?? 0)) + (art?.ignoreTerrain ? 0 : ft.def);
  const hitRaw = w ? w.hit + s.skl * 2 + Math.floor(s.lck / 2) + tri * 15 + mods.hit + artBonus(me.unit, 'hit') + (art?.hit ?? 0) + (am?.hit ?? 0) + (im?.hit ?? 0)
    + (foe.unit.artEffects?.scent?.includes(me.unit.side) && art?.id !== 'fe_art_king_fang' ? 10 : 0) : 0;
  const avoid = attackSpeed(foe.unit, foeWeapon) * 2 + fs.lck + (art?.ignoreTerrain ? 0 : Math.max(0, ft.avoid - (art?.terrainAvoid ?? 0))) + fm.avoid + artBonus(foe.unit, 'avoid') + (foeAm?.avoid ?? 0) + (foeIm?.avoid ?? 0);
  const critRaw = w ? w.crit + Math.floor(s.skl / 2) + mods.crit + artBonus(me.unit, 'crit') + (art?.crit ?? 0) + (am?.crit ?? 0) + (im?.crit ?? 0) : 0;
  const dodge = fs.lck + artBonus(foe.unit, 'dodge') + (foeAm?.dodge ?? 0) + (foeIm?.dodge ?? 0);
  const rawDamage = w ? attack + mods.damage - protection : 0;
  return { unit: me.unit.id, weapon: meWeapon, hp: me.unit.hp, maxHp: me.unit.stats.hp,
    attackSpeed: attackSpeed(me.unit, meWeapon) + mods.attackSpeed + artBonus(me.unit, 'as') + (am?.as ?? 0) + (im?.as ?? 0),
    attack, rawDamage, damage: Math.max(0, rawDamage), hit: w ? art?.fixedHit ?? clamp(hitRaw - avoid) : 0,
    crit: w && !art?.noCrit ? clamp(critRaw - dodge) : 0,
    followUpCrit: w && !art?.noCrit ? clamp(critRaw + mods.followUpCrit + (art?.followUpCrit ?? 0) - dodge) : 0,
    strikes: 0, canAttack: false, doubles: false, triangle: tri, effective, terrain: terrainBonus(state, me.unit, me.pos),
    barrier: me.unit.artEffects?.barrier?.amount ?? 0, protected: (me.unit.shields ?? 0) > 0,
    netherProtected: !!me.unit.tags?.includes('nether_protection') && artBonus(me.unit, 'protection') >= 0,
    silenceable: w?.type === 'tome' || w?.type === 'staff' };
}
const TRUE_HIT = Array.from({ length: 101 }, (_, h) => {
  let pairs = 0; for (let s = 0; s < 2 * h && s <= 198; s++) pairs += s <= 99 ? s + 1 : 199 - s;
  return pairs / 10000;
});
export function trueHit(displayed: number): number { return TRUE_HIT[clamp(Math.floor(displayed))]; }
export function strikeOrder(a: SideForecast, d: SideForecast, braveA: boolean, braveD: boolean, art?: CombatArt): StrikeSpec[] {
  const opening: StrikeSpec[] = [], counter: StrikeSpec[] = [], follow: StrikeSpec[] = [], dFollow: StrikeSpec[] = [];
  const push = (into: StrikeSpec[], side: StrikeSpec['side'], n: number, followUp: boolean, chance?: number) => {
    for (let i = 0; i < n; i++) into.push({ side, followUp, ...(chance === undefined ? {} : { chance }) });
  };
  const fixed = art?.hits ?? (art?.sequence?.startsWith('fixed_') ? Number(art.sequence.split('_')[1]) : undefined);
  push(opening, 'attacker', fixed ?? (braveA ? 2 : 1), false);
  if (d.canAttack) push(counter, 'defender', braveD ? 2 : 1, false);
  if (a.doubles && fixed === undefined) push(follow, 'attacker', braveA ? 2 : 1, true);
  else if (art?.forceProbability && fixed === undefined) push(follow, 'attacker', braveA ? 2 : 1, true, art.forceProbability);
  if (d.canAttack && d.doubles) push(dFollow, 'defender', braveD ? 2 : 1, true);
  if (art?.sequence === 'counter_first') return [...counter, ...opening, ...follow, ...dFollow];
  if (art?.sequence === 'follow_up_before_counter') return [...opening, ...follow, ...counter, ...dFollow];
  return [...opening, ...counter, ...follow, ...dFollow];
}
export function forecast(state: BattleState, attackerId: string, from: Point, weaponId: WeaponId, defenderId: string, art?: CombatArt): Forecast {
  const au = unitById(state, attackerId), du = unitById(state, defenderId), counter = equipped(du);
  const a: Fighter = { unit: au, pos: from, weapon: WEAPONS[weaponId], moved: !samePoint(from, au.pos) || au.movedTurn === state.turn };
  const d: Fighter = { unit: du, pos: du.pos, weapon: counter ? WEAPONS[counter] : null, moved: du.movedTurn === state.turn };
  const attacker = sideVs(state, a, weaponId, d, counter, art), defender = sideVs(state, d, counter, a, weaponId, undefined, art);
  attacker.canAttack = true;
  defender.canAttack = !art?.noCounter && !du.petrified && counter !== null && inRange(du, counter, du.pos, from);
  const blocked = (u: UnitState) => !u.immunities?.includes('follow_up_lock') && u.artEffects?.statuses?.some(s => s === 'poison' || s === 'confusion');
  const single = art?.single || art?.sequence === 'single' || art?.sequence === 'no_speed_follow_up' || art?.hits !== undefined || art?.sequence?.startsWith('fixed_');
  attacker.doubles = !single && !blocked(au) && (attacker.attackSpeed - defender.attackSpeed >= 4 || art?.sequence === 'forced_follow_up');
  defender.doubles = defender.canAttack && !blocked(du) && !(art?.sealFollowUp && !art.sealOnHit) && defender.attackSpeed - attacker.attackSpeed >= 4;
  if (art?.sequence === 'steal_foe_follow_up' && defender.doubles && !blocked(au)) { attacker.doubles = true; defender.doubles = false; }
  if (blocked(au) && art?.forceProbability) art = { ...art, forceProbability: 0 };
  if (art?.foeHitZeroThreshold !== undefined && defender.hit <= art.foeHitZeroThreshold) defender.hit = 0;
  const order = strikeOrder(attacker, defender, !single && !!a.weapon?.brave, !!d.weapon?.brave, art);
  attacker.strikes = order.filter(s => s.side === 'attacker').length; defender.strikes = order.filter(s => s.side === 'defender').length;
  const f: Forecast = { attacker, defender, order, ...(art ? { art } : {}), defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
  return { ...f, ...outcomes(f) };
}
export function artCombatOptions(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, index = 0, walked = walkedCells(state, unit, to)): CombatArt {
  const m = ART_MECHANICS[art.id] ?? {}, result: CombatArt = { ...m, id: art.id, might: art.might, hit: art.hit, crit: art.crit, sequence: art.sequence };
  if (!art.original) {
    const s = artStats(unit), fw = equipped(target), ft = fw ? WEAPONS[fw] : undefined;
    const c = classOf(target), t = terrainBonus(state, unit, to);
    const checks = { foe_half: target.hp * 2 <= target.stats.hp, foe_poison: target.artEffects?.statuses?.includes('poison'), foe_full: target.hp === target.stats.hp,
      self_full: unit.hp === unit.stats.hp, terrain: t.avoid > 0 || t.def > 0,
      foe_as_lead: unitCombatStats(state, target, fw).attackSpeed - unitCombatStats(state, unit, weapon, to).attackSpeed >= 4, foe_magic: ft?.type === 'tome' || ft?.type === 'dragon',
      foe_sword: ft?.type === 'sword', foe_lance: ft?.type === 'lance', foe_bow: ft?.type === 'bow', foe_mounted: c.moveType === 'mounted',
      foe_armored: c.armored, foe_flying: c.moveType === 'flying', foe_large: target.tags?.includes('large') || target.classId === 'dreadnought' || c.route === 'dragon' && c.stage >= 3 };
    if (art.id === 'fw_art_350') result.hits = 1;
    for (const condition of m.conditions ?? []) if (checks[condition.when]) {
      if (condition.mods) {
        result.mods = { ...result.mods };
        for (const [key, value] of Object.entries(condition.mods)) result.mods[key as keyof NonNullable<ArtMechanics['mods']>] = (result.mods[key as keyof NonNullable<ArtMechanics['mods']>] ?? 0) + value;
      }
      if (condition.incomingScale !== undefined) result.incomingScale = condition.incomingScale;
      if (condition.hits !== undefined) result.hits = condition.hits;
      if (condition.scale !== undefined) result.scale = condition.scale;
    }
    result.hit -= (m.rangePenalty ?? 0) * Math.max(0, distance(to, target.pos) - art.range[0]);
    result.might += (m.adjacentAttack ?? 0) * living(state, unit.side).filter(ally => ally.id !== unit.id && !ally.petrified && distance(to, ally.pos) === 1).length;
    if (m.proc) result.procChance = clamp(Math.floor((m.proc.stat ? s[m.proc.stat] / (m.proc.divisor ?? 1) : m.proc.chance ?? 0) + (m.proc.plus ?? 0)));
    if (m.forceChance) result.forceProbability = clamp(Math.floor(s[m.forceChance.stat] / m.forceChance.divisor));
    if (m.drainPoisonOnly && !checks.foe_poison || unit.immunities?.includes('healing')) result.drain = 0;
    if (m.onHit) {
      result.onHit = { ...m.onHit, statuses: m.onHit.statuses?.filter(status => !target.immunities?.includes(status)) };
      if (target.immunities?.includes('debuff')) delete result.onHit.debuff;
      if (target.immunities?.includes('movement_debuff')) delete result.onHit.movePenalty;
      if (target.immunities?.includes('defense_pierce')) delete result.onHit.stripProtection;
      const debuff = result.onHit.debuff;
      if (debuff && (debuff.stat === 'def' || debuff.stat === 'spd')) {
        const prior = Math.min(0, ...(target.artEffects?.buffs ?? []).filter(b => b.stat === debuff.stat && b.duration !== 'map').map(b => b.amount));
        result.onHitStatLoss = Math.min(artStats(target)[debuff.stat], Math.max(0, -debuff.amount + prior));
      }
      result.allowFoeFollowUp = target.immunities?.includes('follow_up_lock');
    }
    if (m.area || art.id === 'axe_sweep') { result.single = true; result.noCrit = true; result.noCounter = index > 0; }
    if (target.immunities?.includes('follow_up_lock')) result.sealFollowUp = false;
    return result;
  }
  result.single = true; result.noCrit = ['fe_art_split_breath', 'fe_art_ancient_breath'].includes(art.id); result.noCounter = index > 0;
  result.scale = art.id === 'fe_art_split_breath' && index > 0 ? .5 : 1;
  if (art.id === 'fe_art_gap_stab') result.terrainAvoid = 15;
  if (art.id === 'fe_art_guard_probe') { result.firstCounterReduction = 30; result.reductionOnHit = true; }
  if (art.id === 'fe_art_braced_maul') result.firstCounterReduction = 20;
  if (art.id === 'fe_art_pulse_sever') { result.sealFollowUp = !target.immunities?.includes('follow_up_lock'); result.sealOnHit = true; }
  if (art.id === 'fe_art_running_rend' && walked >= 3) result.might += 5;
  if (!target.immunities?.includes('defense_pierce')) {
    if (art.id === 'fe_art_king_fang') result.pierce = Math.min(12, Math.floor(artStats(target).def * 35 / 100));
    if (art.id === 'fe_art_pack_flank' && distance(to, target.pos) === 1) {
      const opposite: Point = [2 * target.pos[0] - to[0], 2 * target.pos[1] - to[1]];
      if (living(state, unit.side).some(ally => ally.id !== unit.id && !ally.petrified && samePoint(ally.pos, opposite))) result.pierce = Math.min(8, Math.floor(artStats(target).def * 25 / 100));
    }
  }
  return result;
}
export function artForecast(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, secondary?: string, ally?: string): Forecast & { targets: { target: string; forecast: Forecast }[] } {
  validateArt(state, unit, { type: 'act', unit: unit.id, to, act: 'art', target: target.id, weapon, art: art.id, secondary, ally }, art);
  // shortcut: later targets use opening state, extend to joint branches when exact combined AoE odds are required.
  const targets = artVictims(state, unit, to, weapon, art, target, secondary).map((victim, index) => ({ target: victim.id,
    forecast: { ...forecast(state, unit.id, to, weapon, victim.id, artCombatOptions(state, unit, to, weapon, art, victim, index)),
      ...(index > 0 ? { assumption: 'independent_opening_state' as const } : {}) } }));
  return { ...targets[0].forecast, targets };
}
interface Tally { defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number }
function outcomes(f: Forecast): Tally {
  const memo = new Map<string, Tally>();
  const visit = (i: number, p: CombatProgress): Tally => {
    if (i === f.order.length || p.aHp <= 0 || p.dHp <= 0 || p.stopped) return { defenderDies: p.dHp <= 0 ? 1 : 0, attackerDies: p.aHp <= 0 ? 1 : 0, expectedDealt: f.defender.hp - p.dHp, expectedTaken: f.attacker.hp - p.aHp };
    const key = `${i}:${Object.values(p).join(',')}`, cached = memo.get(key); if (cached) return cached;
    const spec = f.order[i];
    if (skipStrike(f, spec, p)) return visit(i + 1, p);
    const total: Tally = { defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
    const add = (q: number, next: CombatProgress) => {
      if (q <= 0) return; const t = visit(i + 1, next);
      for (const field of Object.keys(total) as (keyof Tally)[]) total[field] += q * t[field];
    };
    const chance = spec.chance === undefined ? 1 : p.forced < 0 ? spec.chance / 100 : p.forced;
    const rates = strikeRates(f, spec, p), hit = trueHit(rates.hit), crit = rates.crit / 100;
    add(1 - chance, spec.chance === undefined ? p : { ...p, forced: 0 });
    const branch = (q: number, hit: boolean, critical = false, proc = false, block = false, afflict = false) => {
      if (q <= 0) return; const next = { ...p }; resolveStrike(f, spec, next, hit, critical, proc, block, afflict); add(q, next);
    };
    branch(chance * (1 - hit), false);
    const block = spec.side === 'attacker' ? (f.art?.counterBlockOnHit ?? 0) / 100 : 0;
    const afflict = spec.side === 'attacker' && f.art?.onHit ? (f.art.onHit.chance ?? 100) / 100 : 0;
    for (const [critical, cq] of [[false, 1 - crit], [true, crit]] as const)
      for (const [proc, pq] of [[false, 1 - rates.proc / 100], [true, rates.proc / 100]] as const)
        for (const [blocked, bq] of [[false, 1 - block], [true, block]] as const)
          for (const [afflicted, aq] of [[false, 1 - afflict], [true, afflict]] as const)
            branch(chance * hit * cq * pq * bq * aq, true, critical, proc, blocked, afflicted);
    memo.set(key, total); return total;
  };
  return visit(0, combatProgress(f));
}
