import type { WeaponId } from '../data/weapons.ts';
import { ITEMS, WEAPONS } from '../data/weapons.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { artAllies, artWeapon, availableArts } from './arts.ts';
import { artObjects, artPostMoves, artSupportOptions } from './art-options.ts';
import type { ArtSupport } from './art-options.ts';
import { moveRange } from './movement.ts';
import type { MoveRange } from './movement.ts';
import { attackWeapons, cellKey, distance, hasCurableStatus, inBounds, inRange, isAsleep, isBerserk, isSilenced, keyPoint, living, staffWeapons, weaponRange } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';
import { interactionOptions } from './scenario.ts';
import { artTargets, spellBlock, spellDestination, spellTargets, staffDestination, staffEffect, staffTargets } from './support.ts';
import type { DestinationRule, StaffEffect } from './support.ts';

// Foes a weapon can hit from a cell, or injured allies a healing staff can reach (status and
// transport staves only appear under actionOptions.staff).
export function targetsFrom(state: BattleState, unit: UnitState, from: Point, weaponId: WeaponId, kind: 'attack' | 'heal', anySide = false): UnitState[] {
  if (kind === 'heal' && !WEAPONS[weaponId].heal) return [];
  const pool = kind === 'attack'
    ? living(state).filter(u => anySide ? u.id !== unit.id : u.side !== unit.side)
    : living(state, unit.side).filter(u => u.id !== unit.id && !u.petrified && !u.immunities?.includes('healing')
      && (u.hp < u.stats.hp || (WEAPONS[weaponId].cure && hasCurableStatus(u))));
  return pool.filter(u => inRange(unit, weaponId, from, u.pos));
}

export interface ActionOptions {
  attack: { weapon: WeaponId; targets: UnitState[] }[];
  heal: { weapon: WeaponId; targets: UnitState[] }[];
  items: number[];
  seize: boolean;
  escape: boolean;
  interactions: { object: string; kind: 'door' | 'chest' | 'village' | 'wall' | 'switch' | 'ballista'; label: string }[];
  dance: string[];
  // 战技：已学（或装备授予）的战技 × 可用的同类武器；cost 是耐久消耗，durability 为该武器当前耐久。
  arts: { art: string; weapon: WeaponId; cost: number; durability: number | null; usable: boolean; targets: UnitState[]; allies: string[]; secondaries: Record<string, string[]>; objects: string[]; postMoves: Point[]; supportOptions: ArtSupport[] }[];
  // 法术书：有剩余次数、未被沉默；dest 不为 null 时需要（或可以）指定落点。
  casts: { spell: string; role: string; charges: number; maxCharges: number; targets: UnitState[]; dest: DestinationRule | null }[];
  staff: { weapon: WeaponId; effect: StaffEffect; targets: UnitState[]; dest: DestinationRule | null }[];
}

// Everything the unit could do after moving to `to`; only applicable actions are listed (docs/08).
export function actionOptions(state: BattleState, unit: UnitState, to: Point): ActionOptions {
  if (isBerserk(unit)) return { attack: [], heal: [], items: [], seize: false, escape: false, interactions: [], dance: [], arts: [], casts: [], staff: [] };
  const attack = attackWeapons(unit)
    .map(weapon => ({ weapon, targets: targetsFrom(state, unit, to, weapon, 'attack') }))
    .filter(o => o.targets.length > 0);
  const heal = staffWeapons(unit)
    .map(weapon => ({ weapon, targets: targetsFrom(state, unit, to, weapon, 'heal') }))
    .filter(o => o.targets.length > 0);
  // 不朽盾不进入道具菜单，只在致死时自动触发（docs/00 §7.2）。
  const items = unit.hp < unit.stats.hp
    ? unit.items.map((_, i) => i).filter(i => !(ITEMS[unit.items[i].id] as { shield?: boolean }).shield)
    : [];
  const dance = (unit.classId === 'dancer' || unit.classId === 'apsara')
    ? living(state, unit.side)
      .filter(target => target.id !== unit.id && target.acted && !target.petrified && !target.npc && distance(to, target.pos) === 1)
      .map(target => target.id)
    : [];
  const arts = availableArts(unit).flatMap(art => {
    const entry = WEAPON_ART_BY_ID.get(art as never);
    if (!entry) return [];
    return attackWeapons(unit).filter(weapon => artWeapon(unit, weapon, entry)).map(weapon => {
      const targets = artTargets(state, unit, to, entry, weapon);
      const durability = unit.weaponInstances?.find(row => row.id === weapon)?.durability ?? null;
      const secondaries = ['fe_art_split_breath', 'axe_sweep'].includes(entry.id) ? Object.fromEntries(targets.map(target => [target.id,
        targets.filter(other => other.id !== target.id && (entry.id === 'axe_sweep' || distance(other.pos, target.pos) === 1)).map(other => other.id)])) : {};
      return { art, weapon, cost: entry.cost, durability, usable: durability !== null && durability >= entry.cost, targets,
        allies: artAllies(state, unit, to, entry), secondaries, objects: artObjects(state, to, entry),
        postMoves: artPostMoves(state, unit, to, entry), supportOptions: artSupportOptions(state, unit, to, entry) };
    });
  });
  const staffActions = staffWeapons(unit).map(weapon => ({ weapon, effect: staffEffect(weapon), targets: staffTargets(state, unit, to, weapon), dest: staffDestination(weapon) }));
  // 只列现职业权限、熟练度与教材都满足的书（不满足的原因在整备页逐本显示）。
  const casts = isSilenced(unit) ? [] : (unit.spellbooks ?? []).filter(book => book.charges > 0)
    .filter(book => { const def = SPELLBOOK_BY_ID.get(book.id); return !!def && spellBlock(unit, def) === null; }).map(book => ({
    spell: book.id, role: SPELLBOOK_BY_ID.get(book.id)?.role ?? 'attack', charges: book.charges, maxCharges: book.maxCharges,
    targets: spellTargets(state, unit, to, book.id), dest: spellDestination(book.id),
  }));
  return { attack, heal, items, seize: canSeize(state, unit, to), escape: canEscape(state, unit, to), interactions: interactionOptions(state, unit, to), dance, arts, casts, staff: staffActions };
}

// 撤离: any player unit (or the escort NPC) standing on an exit tile may leave the map (docs/20 §2).
export function canFinishGather(state: BattleState): boolean {
  return state.goal.kind === 'gather' && state.units.filter(unit => unit.side === 'player' && unit.escaped)
    .reduce((sum, unit) => sum + (unit.carried ?? 0), 0) >= state.goal.need;
}

export function canEscape(state: BattleState, unit: UnitState, at: Point): boolean {
  const goal = state.goal;
  if (unit.side !== 'player') return false;
  if (goal.kind !== 'escape' && goal.kind !== 'gather' && goal.kind !== 'escort') return false;
  return goal.exits.some(e => e[0] === at[0] && e[1] === at[1]);
}

// 压制: only the player's commander, standing on the goal's throne (docs/03).
export function canSeize(state: BattleState, unit: UnitState, at: Point): boolean {
  const goal = state.goal;
  return goal.kind === 'seize' && unit.side === 'player' && !!unit.boss && at[0] === goal.throne[0] && at[1] === goal.throne[1];
}

function cellsWithin(state: BattleState, from: Point, [min, max]: [number, number], into: Set<number>): void {
  for (let dy = -max; dy <= max; dy++) {
    for (let dx = -max; dx <= max; dx++) {
      const point: Point = [from[0] + dx, from[1] + dy];
      const d = distance(from, point);
      if (d >= min && d <= max && inBounds(state, point)) into.add(cellKey(state, point));
    }
  }
}

// Cells the unit could strike (or heal) this phase from any cell it can stop on.
export function reachCells(state: BattleState, unit: UnitState, range: MoveRange, kind: 'attack' | 'heal'): Set<number> {
  const weapons = kind === 'attack' ? attackWeapons(unit) : staffWeapons(unit).filter(id => WEAPONS[id].heal);
  const ranges = weapons.map(weapon => weaponRange(unit, weapon));
  if (!isAsleep(unit) && !isSilenced(unit)) for (const row of unit.spellbooks ?? []) {
    const book = SPELLBOOK_BY_ID.get(row.id);
    if (book && row.charges > 0 && book.role === kind && !spellBlock(unit, book)) ranges.push(book.range);
  }
  const cells = new Set<number>();
  for (const stop of range.stops) {
    for (const reach of ranges) cellsWithin(state, keyPoint(state, stop), reach, cells);
  }
  return cells;
}

// For each cell, how many units of `side` could attack it during their next phase.
// AI behavior is hidden information in the arena, so every unit counts with its full reach.
export function threatMap(state: BattleState, side: UnitState['side']): Map<number, number> {
  const threat = new Map<number, number>();
  for (const unit of living(state, side)) {
    for (const key of reachCells(state, unit, moveRange(state, unit), 'attack')) {
      threat.set(key, (threat.get(key) ?? 0) + 1);
    }
  }
  return threat;
}
