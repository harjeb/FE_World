import type { WeaponId } from '../data/weapons.ts';
import { ITEMS } from '../data/weapons.ts';
import { moveRange } from './movement.ts';
import type { MoveRange } from './movement.ts';
import { attackWeapons, cellKey, distance, inBounds, inRange, keyPoint, living, staffWeapons, weaponRange } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Foes a weapon can hit from a cell, or injured allies a staff can reach.
export function targetsFrom(state: BattleState, unit: UnitState, from: Point, weaponId: WeaponId, kind: 'attack' | 'heal'): UnitState[] {
  const pool = kind === 'attack'
    ? living(state).filter(u => u.side !== unit.side)
    : living(state, unit.side).filter(u => u.id !== unit.id && u.hp < u.stats.hp);
  return pool.filter(u => inRange(unit, weaponId, from, u.pos));
}

export interface ActionOptions {
  attack: { weapon: WeaponId; targets: UnitState[] }[];
  heal: { weapon: WeaponId; targets: UnitState[] }[];
  items: number[];
  seize: boolean;
  escape: boolean;
}

// Everything the unit could do after moving to `to`; only applicable actions are listed (docs/08).
export function actionOptions(state: BattleState, unit: UnitState, to: Point): ActionOptions {
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
  return { attack, heal, items, seize: canSeize(state, unit, to), escape: canEscape(state, unit, to) };
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
  const weapons = kind === 'attack' ? attackWeapons(unit) : staffWeapons(unit);
  const cells = new Set<number>();
  for (const stop of range.stops) {
    for (const weapon of weapons) cellsWithin(state, keyPoint(state, stop), weaponRange(unit, weapon), cells);
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
