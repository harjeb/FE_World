import { WEAPONS, triangle } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import { skillMods } from './skills.ts';
import type { Fighter } from './skills.ts';
import { classOf, equipped, inRange, samePoint, unitById } from './units.ts';
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
    attack: w ? ((w.type === 'tome' || w.type === 'dragon') ? unit.stats.mag : unit.stats.str) + w.might : 0,
    hit: w ? w.hit + unit.stats.skl * 2 + Math.floor(unit.stats.lck / 2) + mods.hit : 0,
    crit: w ? w.crit + Math.floor(unit.stats.skl / 2) + mods.crit : 0,
    attackSpeed: as,
    avoid: as * 2 + unit.stats.lck + terrainBonus(state, unit, pos).avoid + mods.avoid,
  };
}

function sideVs(state: BattleState, me: Fighter, meWeapon: WeaponId | null, foe: Fighter, foeWeapon: WeaponId | null): SideForecast {
  const w = me.weapon, fw = foe.weapon;
  const tri = w && fw ? triangle(w.type, fw.type) : 0;
  const effective = !!w?.effective?.includes(classOf(foe.unit).moveType)
    || (classOf(foe.unit).armored && !!w?.effective?.includes('armored'))
    || !!w?.effectiveRoutes?.some(route => route === classOf(foe.unit).route);
  const mods = skillMods(state, me), foeMods = skillMods(state, foe);
  const magic = w?.type === 'tome' || w?.type === 'dragon';
  const attack = w ? (magic ? me.unit.stats.mag : me.unit.stats.str) + (w.might + tri) * (effective ? 3 : 1) : 0;
  const foeTerrain = terrainBonus(state, foe.unit, foe.pos);
  const protection = (magic ? foe.unit.stats.res : foe.unit.stats.def + foeMods.def) + foeTerrain.def;
  const hitRaw = w ? w.hit + me.unit.stats.skl * 2 + Math.floor(me.unit.stats.lck / 2) + tri * 15 + mods.hit : 0;
  const foeAvoid = attackSpeed(foe.unit, foeWeapon) * 2 + foe.unit.stats.lck + foeTerrain.avoid + foeMods.avoid;
  const critRaw = w ? w.crit + Math.floor(me.unit.stats.skl / 2) + mods.crit : 0;
  return {
    unit: me.unit.id,
    weapon: meWeapon,
    hp: me.unit.hp,
    maxHp: me.unit.stats.hp,
    attackSpeed: attackSpeed(me.unit, meWeapon),
    attack,
    damage: w ? Math.max(0, attack + mods.damage - protection) : 0,
    hit: w ? clamp(hitRaw - foeAvoid) : 0,
    crit: w ? clamp(critRaw - foe.unit.stats.lck) : 0,
    followUpCrit: w ? clamp(critRaw + mods.followUpCrit - foe.unit.stats.lck) : 0,
    strikes: 0,
    canAttack: false,
    doubles: false,
    triangle: tri,
    effective,
    terrain: terrainBonus(state, me.unit, me.pos),
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

export function forecast(state: BattleState, attackerId: string, from: Point, weaponId: WeaponId, defenderId: string): Forecast {
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
  const attacker = sideVs(state, a, weaponId, d, counter);
  const defender = sideVs(state, d, counter, a, weaponId);
  attacker.canAttack = true;
  defender.canAttack = counter !== null && inRange(defenderUnit, counter, defenderUnit.pos, from);
  // Follow-up needs an attack-speed lead of 4 (docs/03).
  attacker.doubles = attacker.attackSpeed - defender.attackSpeed >= 4;
  defender.doubles = defender.canAttack && defender.attackSpeed - attacker.attackSpeed >= 4;
  const order = strikeOrder(attacker, defender, !!a.weapon?.brave, !!d.weapon?.brave);
  attacker.strikes = order.filter(s => s.side === 'attacker').length;
  defender.strikes = order.filter(s => s.side === 'defender').length;
  return { attacker, defender, order, ...outcomes(order, attacker, defender) };
}

interface Tally { defenderDies: number; attackerDies: number; expectedDealt: number; expectedTaken: number }

// Exact outcome probabilities: each strike misses, hits or crits; combat stops when a side falls.
function outcomes(order: StrikeSpec[], attacker: SideForecast, defender: SideForecast): Tally {
  const visit = (i: number, aHp: number, dHp: number): Tally => {
    if (i === order.length || aHp === 0 || dHp === 0) {
      return {
        defenderDies: dHp === 0 ? 1 : 0,
        attackerDies: aHp === 0 ? 1 : 0,
        expectedDealt: defender.hp - dHp,
        expectedTaken: attacker.hp - aHp,
      };
    }
    const spec = order[i];
    const me = spec.side === 'attacker' ? attacker : defender;
    const hit = trueHit(me.hit), crit = (spec.followUp ? me.followUpCrit : me.crit) / 100;
    const after = (dmg: number) => spec.side === 'attacker'
      ? visit(i + 1, aHp, Math.max(0, dHp - dmg))
      : visit(i + 1, Math.max(0, aHp - dmg), dHp);
    const total: Tally = { defenderDies: 0, attackerDies: 0, expectedDealt: 0, expectedTaken: 0 };
    const add = (q: number, branch: () => Tally) => {
      if (q === 0) return;
      const t = branch();
      total.defenderDies += q * t.defenderDies;
      total.attackerDies += q * t.attackerDies;
      total.expectedDealt += q * t.expectedDealt;
      total.expectedTaken += q * t.expectedTaken;
    };
    add(1 - hit, () => visit(i + 1, aHp, dHp));
    add(hit * (1 - crit), () => after(me.damage));
    add(hit * crit, () => after(me.damage * 3));
    return total;
  };
  return visit(0, attacker.hp, defender.hp);
}
