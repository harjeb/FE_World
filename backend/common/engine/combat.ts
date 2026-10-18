import { WEAPONS, triangle } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import { skillMods } from './skills.ts';
import type { Fighter } from './skills.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { artVictims, validateArt, walkedCells } from './arts.ts';
import { classOf, distance, equipped, inRange, living, samePoint, unitById } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Formulas from docs/03-combat.md「战斗公式」. All divisions round down.
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export interface TerrainBonus { name: string; avoid: number; def: number; applies: boolean }

export interface SideForecast {
  unit: string;
  weapon: WeaponId | null;
  hp: number;
  maxHp: number;
  attackSpeed: number;
  attack: number;
  damage: number;
  hit: number;
  crit: number;
  followUpCrit: number;
  strikes: number;
  canAttack: boolean;
  doubles: boolean;
  triangle: -1 | 0 | 1;
  effective: boolean;
  terrain: TerrainBonus;
  barrier: number;
  protected: boolean;
}

export interface StrikeSpec { side: 'attacker' | 'defender'; followUp: boolean }

export interface Forecast {
  attacker: SideForecast;
  defender: SideForecast;
  order: StrikeSpec[];
  // Probabilities use the real hit roll (two-number average), not the displayed hit.
  defenderDies: number;
  attackerDies: number;
  expectedDealt: number;
  expectedTaken: number;
  art?: CombatArt;
}

export interface CombatArt {
  id: string; might: number; hit: number; crit: number;
  single?: boolean; noCrit?: boolean; noCounter?: boolean; scale?: number;
  pierce?: number; terrainAvoid?: number; firstCounterReduction?: number; reductionOnHit?: boolean;
  sealFollowUp?: boolean;
}

export interface CombatProgress { attackerHit: boolean; counterReduced: boolean; barrierA: number; barrierD: number }
export function combatProgress(f: Forecast): CombatProgress {
  return { attackerHit: false, counterReduced: false, barrierA: f.attacker.barrier, barrierD: f.defender.barrier };
}
export function strikeDamage(f: Forecast, side: StrikeSpec['side'], critical: boolean, progress: CombatProgress): number {
  const me = f[side];
  let damage = me.damage * (critical ? 3 : 1);
  if (side === 'attacker') damage = Math.floor(damage * (f.art?.scale ?? 1));
  if (side === 'defender' && !progress.counterReduced && (!f.art?.reductionOnHit || progress.attackerHit)) {
    damage = Math.floor(damage * (100 - (f.art?.firstCounterReduction ?? 0)) / 100);
  }
  return Math.max(0, damage - (side === 'attacker' ? progress.barrierD : progress.barrierA));
}
export function recordStrikeHit(f: Forecast, side: StrikeSpec['side'], progress: CombatProgress): void {
  if (side === 'attacker') { progress.attackerHit = true; progress.barrierD = 0; }
  else {
    progress.barrierA = 0;
    if (!f.art?.reductionOnHit || progress.attackerHit) progress.counterReduced = true;
  }
}

export function forecastOnHit(f: Forecast): (StrikeSpec & { damage: number; criticalDamage: number })[] {
  const result: (StrikeSpec & { damage: number; criticalDamage: number })[] = [];
  const progress = combatProgress(f);
  let aHp = f.attacker.hp, dHp = f.defender.hp;
  for (const spec of f.order) {
    if (spec.side === 'defender' && spec.followUp && f.art?.sealFollowUp && progress.attackerHit) continue;
    const damage = strikeDamage(f, spec.side, false, progress), criticalDamage = strikeDamage(f, spec.side, true, progress);
    result.push({ ...spec, damage, criticalDamage });
    recordStrikeHit(f, spec.side, progress);
    if (spec.side === 'attacker') dHp -= damage; else aHp -= damage;
    if (aHp <= 0 || dHp <= 0) break;
  }
  return result;
}

export function attackSpeed(unit: UnitState, weapon: WeaponId | null): number {
  const weight = weapon ? WEAPONS[weapon].weight : 0;
  return unit.stats.spd - Math.max(0, weight - unit.con);
}

export function terrainBonus(state: BattleState, unit: UnitState, [x, y]: Point): TerrainBonus {
  const t = TERRAINS[state.map.tiles[y][x]];
  // Flying units do not benefit from terrain avoid or defense.
  const applies = classOf(unit).moveType !== 'flying';
  return { name: t.name, avoid: applies ? t.avoid : 0, def: applies ? t.def : 0, applies };
}

// Weapon-only numbers for the unit card: 攻击 / 命中 / 必杀 / 攻速 / 回避.
export function unitCombatStats(state: BattleState, unit: UnitState, weaponId: WeaponId | null, pos: Point = unit.pos) {
  const w = weaponId ? WEAPONS[weaponId] : null;
  const mods = skillMods(state, { unit, pos, weapon: w, moved: unit.movedTurn === state.turn });
  const as = attackSpeed(unit, weaponId);
  return {
    attack: w ? ((w.type === 'tome' || w.type === 'dragon') ? unit.stats.mag : unit.stats.str) + w.might + mods.attack : 0,
    hit: w ? w.hit + unit.stats.skl * 2 + Math.floor(unit.stats.lck / 2) + mods.hit : 0,
    crit: w ? w.crit + Math.floor(unit.stats.skl / 2) + mods.crit : 0,
    attackSpeed: as + mods.attackSpeed,
    avoid: as * 2 + unit.stats.lck + terrainBonus(state, unit, pos).avoid + mods.avoid,
  };
}

function sideVs(state: BattleState, me: Fighter, meWeapon: WeaponId | null, foe: Fighter, foeWeapon: WeaponId | null, art?: CombatArt): SideForecast {
  const w = me.weapon, fw = foe.weapon;
  const tri = w && fw ? triangle(w.type, fw.type) : 0;
  const effective = !!w?.effective?.includes(classOf(foe.unit).moveType)
    || (classOf(foe.unit).armored && !!w?.effective?.includes('armored'))
    || !!w?.effectiveRoutes?.some(route => route === classOf(foe.unit).route);
  const mods = skillMods(state, me), foeMods = skillMods(state, foe);
  const magic = w?.type === 'tome' || w?.type === 'dragon';
  const attack = w ? (magic ? me.unit.stats.mag : me.unit.stats.str) + (w.might + tri) * (effective ? 3 : 1) + mods.attack + (art?.might ?? 0) : 0;
  const foeTerrain = terrainBonus(state, foe.unit, foe.pos);
  const protection = Math.max(0, (magic ? foe.unit.stats.res + foeMods.res : foe.unit.stats.def + foeMods.def) - (art?.pierce ?? 0)) + foeTerrain.def;
  const hitRaw = w ? w.hit + me.unit.stats.skl * 2 + Math.floor(me.unit.stats.lck / 2) + tri * 15 + mods.hit + (art?.hit ?? 0)
    + (foe.unit.artEffects?.scent?.includes(me.unit.side) && art?.id !== 'fe_art_king_fang' ? 10 : 0) : 0;
  const foeAvoid = attackSpeed(foe.unit, foeWeapon) * 2 + foe.unit.stats.lck + Math.max(0, foeTerrain.avoid - (art?.terrainAvoid ?? 0)) + foeMods.avoid;
  const critRaw = w ? w.crit + Math.floor(me.unit.stats.skl / 2) + mods.crit + (art?.crit ?? 0) : 0;
  return {
    unit: me.unit.id,
    weapon: meWeapon,
    hp: me.unit.hp,
    maxHp: me.unit.stats.hp,
    attackSpeed: attackSpeed(me.unit, meWeapon) + mods.attackSpeed,
    attack,
    damage: w ? Math.max(0, attack + mods.damage - protection) : 0,
    hit: w ? clamp(hitRaw - foeAvoid) : 0,
    crit: w && !art?.noCrit ? clamp(critRaw - foe.unit.stats.lck) : 0,
    followUpCrit: w && !art?.noCrit ? clamp(critRaw + mods.followUpCrit - foe.unit.stats.lck) : 0,
    strikes: 0,
    canAttack: false,
    doubles: false,
    triangle: tri,
    effective,
    terrain: terrainBonus(state, me.unit, me.pos),
    barrier: me.unit.artEffects?.barrier?.amount ?? 0,
    protected: (me.unit.shields ?? 0) > 0,
  };
}

// Probability that a strike with this displayed hit lands: two 0–99 rolls averaged below the hit.
const TRUE_HIT = Array.from({ length: 101 }, (_, h) => {
  let pairs = 0;
  for (let s = 0; s < 2 * h && s <= 198; s++) pairs += s <= 99 ? s + 1 : 199 - s;
  return pairs / 10000;
});
export function trueHit(displayed: number): number {
  return TRUE_HIT[clamp(displayed)];
}

export function strikeOrder(attacker: SideForecast, defender: SideForecast, braveA: boolean, braveD: boolean): StrikeSpec[] {
  const order: StrikeSpec[] = [];
  const push = (side: StrikeSpec['side'], times: number, followUp: boolean) => {
    for (let i = 0; i < times; i++) order.push({ side, followUp });
  };
  push('attacker', braveA ? 2 : 1, false);
  if (defender.canAttack) push('defender', braveD ? 2 : 1, false);
  if (attacker.doubles) push('attacker', braveA ? 2 : 1, true);
  else if (defender.canAttack && defender.doubles) push('defender', braveD ? 2 : 1, true);
  return order;
}

export function forecast(state: BattleState, attackerId: string, from: Point, weaponId: WeaponId, defenderId: string, art?: CombatArt): Forecast {
  const attackerUnit = unitById(state, attackerId), defenderUnit = unitById(state, defenderId);
  const counter = equipped(defenderUnit);
  const a: Fighter = {
    unit: attackerUnit, pos: from, weapon: WEAPONS[weaponId],
    moved: !samePoint(from, attackerUnit.pos) || attackerUnit.movedTurn === state.turn,
  };
  const d: Fighter = {
    unit: defenderUnit, pos: defenderUnit.pos, weapon: counter ? WEAPONS[counter] : null,
    moved: defenderUnit.movedTurn === state.turn,
  };
  const attacker = sideVs(state, a, weaponId, d, counter, art);
  const defender = sideVs(state, d, counter, a, weaponId);
  attacker.canAttack = true;
  defender.canAttack = !art?.noCounter && !defenderUnit.petrified && counter !== null && inRange(defenderUnit, counter, defenderUnit.pos, from);
  // Follow-up needs an attack-speed lead of 4 (docs/03).
  attacker.doubles = !art?.single && attacker.attackSpeed - defender.attackSpeed >= 4;
  defender.doubles = defender.canAttack && defender.attackSpeed - attacker.attackSpeed >= 4;
  const order = strikeOrder(attacker, defender, !art?.single && !!a.weapon?.brave, !!d.weapon?.brave);
  attacker.strikes = order.filter(s => s.side === 'attacker').length;
  defender.strikes = order.filter(s => s.side === 'defender').length;
  const f: Forecast = { attacker, defender, order, ...(art ? { art } : {}), defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
  return { ...f, ...outcomes(f) };
}

export function artCombatOptions(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, index = 0, walked = walkedCells(state, unit, to)): CombatArt {
  const result: CombatArt = { id: art.id, might: art.might, hit: art.hit, crit: art.crit };
  if (!art.original) return result;
  result.single = true;
  result.noCrit = ['fe_art_split_breath', 'fe_art_ancient_breath'].includes(art.id);
  result.noCounter = index > 0;
  result.scale = art.id === 'fe_art_split_breath' && index > 0 ? 0.5 : 1;
  if (art.id === 'fe_art_gap_stab') result.terrainAvoid = 15;
  if (art.id === 'fe_art_guard_probe') { result.firstCounterReduction = 30; result.reductionOnHit = true; }
  if (art.id === 'fe_art_braced_maul') result.firstCounterReduction = 20;
  if (art.id === 'fe_art_pulse_sever') result.sealFollowUp = !target.immunities?.includes('follow_up_lock');
  if (art.id === 'fe_art_running_rend' && walked >= 3) result.might += 5;
  if (!target.immunities?.includes('defense_pierce')) {
    if (art.id === 'fe_art_king_fang') result.pierce = Math.min(12, Math.floor(target.stats.def * 35 / 100));
    if (art.id === 'fe_art_pack_flank' && distance(to, target.pos) === 1) {
      const opposite: Point = [2 * target.pos[0] - to[0], 2 * target.pos[1] - to[1]];
      if (living(state, unit.side).some(ally => ally.id !== unit.id && !ally.petrified && samePoint(ally.pos, opposite))) result.pierce = Math.min(8, Math.floor(target.stats.def * 25 / 100));
    }
  }
  void weapon;
  return result;
}

export function artForecast(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, secondary?: string, ally?: string): Forecast & { targets: { target: string; forecast: Forecast }[] } {
  validateArt(state, unit, { type: 'act', unit: unit.id, to, act: 'art', target: target.id, weapon, art: art.id, secondary, ally }, art);
  const targets = artVictims(state, unit, to, weapon, art, target, secondary).map((victim, index) => ({
    target: victim.id,
    forecast: forecast(state, unit.id, to, weapon, victim.id, artCombatOptions(state, unit, to, weapon, art, victim, index)),
  }));
  return { ...targets[0].forecast, targets };
}

interface Tally { defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number }

// Exact outcome probabilities: each strike misses, hits or crits; combat stops when a side falls.
function outcomes(f: Forecast): Tally {
  const { order, attacker, defender } = f;
  const visit = (i: number, aHp: number, dHp: number, progress: CombatProgress): Tally => {
    if (i === order.length || aHp === 0 || dHp === 0) {
      return {
        defenderDies: dHp === 0 ? 1 : 0,
        attackerDies: aHp === 0 ? 1 : 0,
        expectedDealt: defender.hp - dHp,
        expectedTaken: attacker.hp - aHp,
      };
    }
    const spec = order[i];
    if (spec.side === 'defender' && spec.followUp && f.art?.sealFollowUp && progress.attackerHit) return visit(i + 1, aHp, dHp, progress);
    const me = spec.side === 'attacker' ? attacker : defender;
    const hit = trueHit(me.hit), crit = (spec.followUp ? me.followUpCrit : me.crit) / 100;
    const after = (critical: boolean) => {
      const damage = strikeDamage(f, spec.side, critical, progress), next = { ...progress };
      recordStrikeHit(f, spec.side, next);
      if (spec.side === 'attacker') {
        const shield = defender.protected && damage >= dHp;
        return visit(shield ? order.length : i + 1, aHp, shield ? 1 : Math.max(0, dHp - damage), next);
      }
      const shield = attacker.protected && damage >= aHp;
      return visit(shield ? order.length : i + 1, shield ? 1 : Math.max(0, aHp - damage), dHp, next);
    };
    const total: Tally = { defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
    const add = (q: number, branch: () => Tally) => {
      if (q === 0) return;
      const t = branch();
      total.defenderDies += q * t.defenderDies;
      total.attackerDies += q * t.attackerDies;
      total.expectedDealt += q * t.expectedDealt;
      total.expectedTaken += q * t.expectedTaken;
    };
    add(1 - hit, () => visit(i + 1, aHp, dHp, progress));
    add(hit * (1 - crit), () => after(false));
    add(hit * crit, () => after(true));
    return total;
  };
  return visit(0, attacker.hp, defender.hp, combatProgress(f));
}
