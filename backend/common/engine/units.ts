import { CLASSES } from '../data/classes.ts';
import type { ClassDef } from '../data/classes.ts';
import { rankAtLeast } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { Weapon, WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import type { Terrain } from '../maps/map.ts';
import { EngineError } from './types.ts';
import type { BattleState, Point, UnitState } from './types.ts';

export function cellKey(state: BattleState, [x, y]: Point): number {
  return y * state.map.width + x;
}

export function keyPoint(state: BattleState, key: number): Point {
  return [key % state.map.width, Math.floor(key / state.map.width)];
}

export function inBounds(state: BattleState, [x, y]: Point): boolean {
  return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
}

export function distance(a: Point, b: Point): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

export function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function terrainAt(state: BattleState, [x, y]: Point): Terrain {
  return state.map.tiles[y][x];
}

export function terrainInfo(state: BattleState, point: Point) {
  return TERRAINS[terrainAt(state, point)];
}

export function unitById(state: BattleState, id: string): UnitState {
  const unit = state.units.find(u => u.id === id);
  if (!unit) throw new EngineError('UNKNOWN_UNIT', `没有单位 ${id}`);
  return unit;
}

export function unitAt(state: BattleState, point: Point): UnitState | undefined {
  return state.units.find(u => u.alive && samePoint(u.pos, point));
}

export function classOf(unit: UnitState): ClassDef {
  return CLASSES[unit.classId];
}

export function living(state: BattleState, side?: UnitState['side']): UnitState[] {
  return state.units.filter(u => u.alive && (side === undefined || u.side === side));
}

// Effective level for experience: promoted classes count 20 extra levels (docs/02).
export function effectiveLevel(unit: UnitState): number {
  return unit.level + (classOf(unit).tier === 'promoted' ? 20 : 0);
}

export function canWield(unit: UnitState, id: WeaponId): boolean {
  const w: Weapon = WEAPONS[id];
  return classOf(unit).weapons[w.type] !== undefined && rankAtLeast(unit.ranks[w.type], w.rank);
}

export function attackWeapons(unit: UnitState): WeaponId[] {
  return unit.weapons.filter(id => WEAPONS[id].type !== 'staff' && canWield(unit, id));
}

export function staffWeapons(unit: UnitState): WeaponId[] {
  return unit.weapons.filter(id => WEAPONS[id].type === 'staff' && canWield(unit, id));
}

// The equipped weapon decides counterattacks; it is the first usable attack weapon in the list.
export function equipped(unit: UnitState): WeaponId | null {
  return attackWeapons(unit)[0] ?? null;
}

export function weaponRange(unit: UnitState, id: WeaponId): [number, number] {
  const w: Weapon = WEAPONS[id];
  if (w.magRange) return [1, Math.max(1, Math.floor(unit.stats.mag / 2))];
  return [w.range[0], w.range[1]];
}

export function inRange(unit: UnitState, id: WeaponId, from: Point, to: Point): boolean {
  const [min, max] = weaponRange(unit, id);
  const d = distance(from, to);
  return d >= min && d <= max;
}
