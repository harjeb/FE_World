import { CLASSES } from '../data/classes.ts';
import type { ClassDef } from '../data/classes.ts';
import { rankAtLeast } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { Weapon, WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import type { Terrain } from '../maps/map.ts';
import { EngineError } from './types.ts';
import type { BattleEvent, BattleState, Point, UnitState } from './types.ts';

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

// Total level is preserved across all five class stages.
export function effectiveLevel(unit: UnitState): number {
  return unit.level;
}

type WeaponUser = Pick<UnitState, 'classId' | 'ranks' | 'weapons' | 'statuses' | 'artEffects' | 'bookInstances'>;

export function canWield(unit: WeaponUser, id: WeaponId): boolean {
  const w: Weapon = WEAPONS[id];
  return CLASSES[unit.classId].weapons[w.type] !== undefined && rankAtLeast(unit.ranks[w.type], w.rank);
}

export function isAsleep(unit: Pick<UnitState, 'statuses'>): boolean {
  return !!unit.statuses?.sleep;
}

export function isSilenced(unit: Pick<UnitState, 'statuses' | 'artEffects'>): boolean {
  return (unit.statuses?.silence ?? 0) > 0 || !!unit.artEffects?.statuses?.includes('silence');
}

export function isBerserk(unit: UnitState): boolean {
  return (unit.statuses?.berserk ?? 0) > 0;
}

// 沉默只封法术/杖；物理武器、兽爪、龙石与对应战技仍可用。
export function canUseWeapon(unit: WeaponUser, id: WeaponId): boolean {
  if (isAsleep(unit)) return false;
  if (isSilenced(unit) && (WEAPONS[id].type === 'tome' || WEAPONS[id].type === 'staff')) return false;
  return canWield(unit, id);
}

export function hasCurableStatus(unit: UnitState): boolean {
  return !!unit.statuses?.sleep || (unit.statuses?.silence ?? 0) > 0 || (unit.statuses?.berserk ?? 0) > 0 || !!unit.artEffects?.statuses?.length || !!unit.artEffects?.buffs?.some(b => b.amount < 0);
}

export function cureStatuses(unit: UnitState, events: BattleEvent[] = []): ('sleep' | 'silence' | 'berserk')[] {
  const cured: ('sleep' | 'silence' | 'berserk')[] = [];
  if (unit.statuses?.sleep) cured.push('sleep');
  if ((unit.statuses?.silence ?? 0) > 0) cured.push('silence');
  if ((unit.statuses?.berserk ?? 0) > 0) cured.push('berserk');
  if (unit.statuses) {
    delete unit.statuses.sleep;
    delete unit.statuses.silence;
    delete unit.statuses.berserk;
    if (Object.keys(unit.statuses).length === 0) delete unit.statuses;
  }
  if (unit.artEffects?.statuses?.length || unit.artEffects?.buffs?.some(b => b.amount < 0)) {
    unit.artEffects = { ...unit.artEffects, statuses: [], buffs: unit.artEffects.buffs?.filter(b => b.amount >= 0) };
    events.push({ t: 'artState', unit: unit.id, effects: structuredClone(unit.artEffects) });
  }
  return cured;
}

export function tickStatuses(unit: UnitState): ('silence' | 'berserk')[] {
  const expired: ('silence' | 'berserk')[] = [];
  if (!unit.statuses) return expired;
  if (unit.statuses.silence !== undefined) {
    unit.statuses.silence -= 1;
    if (unit.statuses.silence <= 0) { delete unit.statuses.silence; expired.push('silence'); }
  }
  if (unit.statuses.berserk !== undefined) {
    unit.statuses.berserk -= 1;
    if (unit.statuses.berserk <= 0) { delete unit.statuses.berserk; expired.push('berserk'); }
  }
  if (unit.statuses.regen !== undefined) {
    unit.statuses.regen -= 1;
    if (unit.statuses.regen <= 0) delete unit.statuses.regen;
  }
  if (Object.keys(unit.statuses).length === 0) delete unit.statuses;
  return expired;
}

function hasCharge(unit: Pick<UnitState, 'bookInstances'>, id: WeaponId): boolean {
  if (!unit.bookInstances) return true;
  const row = unit.bookInstances.find(entry => entry.id === id);
  return !row || row.charges > 0;
}

export function attackWeapons(unit: WeaponUser): WeaponId[] {
  return unit.weapons.filter(id => WEAPONS[id].type !== 'staff' && canUseWeapon(unit, id) && hasCharge(unit, id));
}

export function staffWeapons(unit: UnitState): WeaponId[] {
  return unit.weapons.filter(id => WEAPONS[id].type === 'staff' && canUseWeapon(unit, id) && hasCharge(unit, id));
}

export function equipWeapon(unit: UnitState, id: WeaponId): void {
  const index = unit.weapons.indexOf(id);
  if (index >= 0) unit.weapons.splice(index, 1);
  unit.weapons.unshift(id);
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
