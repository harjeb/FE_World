import { rankAtLeast } from '../data/types.ts';
import { ART_MECHANICS } from '../data/art-mechanics.ts';
import { WEAPON_ART_BY_ID } from '../data/weapon-arts.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { TERRAINS } from '../maps/map.ts';
import { enterCost, moveRange, pathTo } from './movement.ts';
import { objectBlocks } from './scenario.ts';
import { moveUnit } from './terrain.ts';
import { artObjects, objectArtDamage, validateArtExtras } from './art-options.ts';
import { attackWeapons, distance, inBounds, inRange, living, samePoint, unitById } from './units.ts';
import { EngineError } from './types.ts';
import type { ActAction, BattleEvent, BattleState, Point, UnitState } from './types.ts';

export type ArtAction = Extract<ActAction, { act: 'art' }>;

type ArtUser = Pick<UnitState, 'classId' | 'ranks' | 'weapons' | 'weaponInstances' | 'statuses' | 'artEffects' | 'bookInstances'>;

export function artWeapon(unit: ArtUser, weapon: WeaponId, art: WeaponArt): boolean {
  // 达格扎的棍棒等专属武器只允许发动列出的战技。
  if (!attackWeapons(unit).includes(weapon) || (WEAPONS[weapon].exclusiveArts && !WEAPONS[weapon].exclusiveArts!.includes(art.id))
    || !art.weaponCompatibility.includes(WEAPONS[weapon].type)
    || (art.rank && !rankAtLeast(unit.ranks[WEAPONS[weapon].type], art.rank))) return false;
  if (art.unlock.kind !== 'equipment_grant') return true;
  const instance = unit.weaponInstances?.find(row => row.id === weapon);
  return !!instance && instance.durability >= art.cost
    && !!WEAPONS[weapon].grants?.arts?.some(link => link.art === art.id
      && (instance.refinement ?? 0) >= link.minimumRefinement);
}

export function equipmentArtIds(unit: ArtUser): string[] {
  return [...new Set(unit.weapons.flatMap(weapon => (WEAPONS[weapon].grants?.arts ?? [])
    .filter(link => artWeapon(unit, weapon, WEAPON_ART_BY_ID.get(link.art)!)).map(link => link.art)))];
}

export function availableArts(unit: UnitState): string[] {
  return [...new Set([...(unit.arts ?? []).filter(id => WEAPON_ART_BY_ID.get(id)?.unlock.kind !== 'equipment_grant'), ...equipmentArtIds(unit)])];
}

// A supercover ray cannot pass through walls or cut diagonally between blocking cells.
export function artSight(state: BattleState, from: Point, to: Point): boolean {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const nx = Math.abs(dx), ny = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
  let x = from[0], y = from[1], ix = 0, iy = 0;
  const blocked = (p: Point) => !inBounds(state, p) || state.map.tiles[p[1]][p[0]] === 'wall' || objectBlocks(state, p);
  while (ix < nx || iy < ny) {
    const cross = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (cross === 0) {
      if (blocked([x + sx, y]) || blocked([x, y + sy])) return false;
      x += sx; y += sy; ix++; iy++;
    } else if (cross < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (blocked([x, y])) return false;
  }
  return true;
}

export function artAllies(state: BattleState, unit: UnitState, to: Point, art: WeaponArt): string[] {
  if (!['fe_art_cover_exchange', 'fe_art_scale_rebuff'].includes(art.id)) return [];
  return living(state, unit.side).filter(ally => ally.id !== unit.id && !ally.petrified && !ally.npc
    && !ally.statuses?.sleep && distance(to, ally.pos) === 1
    && (art.id !== 'fe_art_cover_exchange' || (enterCost(state, unit, ally.pos) !== null
      && enterCost(state, ally, to) !== null && !objectBlocks(state, ally.pos) && !objectBlocks(state, to))))
    .map(ally => ally.id);
}

export function legalArtTarget(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState): boolean {
  const d = distance(to, target.pos);
  if (!target.alive || target.petrified || target.side === unit.side || d < art.range[0] || d > art.range[1]) return false;
  if (art.id === 'chariot_line' && to[0] !== target.pos[0] && to[1] !== target.pos[1]) return false;
  if (!art.original) {
    const range = WEAPONS[weapon].range;
    return artSight(state, to, target.pos) && (!ART_MECHANICS[art.id]?.rangeWeaponRequired || range[0] <= 1 && range[1] >= 2);
  }
  if (!artWeapon(unit, weapon, art) || !inRange(unit, weapon, to, target.pos) || !artSight(state, to, target.pos)) return false;
  if (['fe_art_braced_maul', 'fe_art_focused_breath'].includes(art.id)
    && (!samePoint(to, unit.pos) || unit.artEffects?.displaced)) return false;
  if (art.id === 'fe_art_king_fang' && !target.artEffects?.scent?.includes(unit.side)) return false;
  if (art.id === 'fe_art_ancient_breath') {
    if (to[0] !== target.pos[0] && to[1] !== target.pos[1]) return false;
    const dx = Math.sign(target.pos[0] - to[0]), dy = Math.sign(target.pos[1] - to[1]);
    for (let i = 1; i <= 2; i++) {
      const p: Point = [to[0] + dx * i, to[1] + dy * i];
      if (!inBounds(state, p) || !artSight(state, to, p)) break;
      if (living(state, unit.side).some(ally => ally.id !== unit.id && samePoint(ally.pos, p))) return false;
    }
  }
  return true;
}

export function artVictims(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, target: UnitState, secondary?: string): UnitState[] {
  if (art.id === 'fe_art_ancient_breath' || art.id === 'chariot_line') {
    const dx = Math.sign(target.pos[0] - to[0]), dy = Math.sign(target.pos[1] - to[1]);
    if (dx && dy) return [target];
    const victims: UnitState[] = [];
    for (let i = 1; i <= art.range[1]; i++) {
      const p: Point = [to[0] + dx * i, to[1] + dy * i];
      if (!inBounds(state, p) || !artSight(state, to, p)) break;
      const hit = living(state).find(foe => samePoint(foe.pos, p));
      if (hit?.side === unit.side) break;
      if (hit && !hit.petrified && legalArtTarget(state, unit, to, weapon, art, hit)) victims.push(hit);
    }
    return victims;
  }
  if (ART_MECHANICS[art.id]?.area === 'square') {
    return [target, ...living(state).filter(foe => foe.id !== target.id && foe.side !== unit.side && !foe.petrified
      && Math.abs(foe.pos[0] - target.pos[0]) <= 1 && Math.abs(foe.pos[1] - target.pos[1]) <= 1
      && artSight(state, to, foe.pos)).sort((a, b) => distance(a.pos, target.pos) - distance(b.pos, target.pos) || a.id.localeCompare(b.id))].slice(0, 9);
  }
  return ['fe_art_split_breath', 'axe_sweep'].includes(art.id) && secondary ? [target, unitById(state, secondary)] : [target];
}

export function validateArt(state: BattleState, unit: UnitState, action: ArtAction, art: WeaponArt): UnitState[] {
  if (!availableArts(unit).includes(art.id)) throw new EngineError('FORBIDDEN', '尚未装备这个战技，或授予装备不满足条件');
  if (!artWeapon(unit, action.weapon, art)) throw new EngineError('WEAPON_RANK_TOO_LOW', '战技武器类型、职业权限或熟练度不满足');
  const instance = unit.weaponInstances?.find(row => row.id === action.weapon);
  if (!instance || instance.durability < art.cost) throw new EngineError('NO_SUCH_ITEM', '武器实例缺失或耐久不足，无法使用战技');
  validateArtExtras(state, unit, action, art);
  if (artObjects(state, action.to, art).includes(action.target)) {
    if (action.ally || action.secondary) throw new EngineError('BAD_REQUEST', '破坏物件不能选择追加目标');
    return [];
  }
  const target = unitById(state, action.target);
  if (!legalArtTarget(state, unit, action.to, action.weapon, art, target)) throw new EngineError('TARGET_OUT_OF_RANGE', '目标不满足战技射程、视线或发动条件');
  if (action.ally && !artAllies(state, unit, action.to, art).includes(action.ally)) throw new EngineError('BAD_REQUEST', '战技友军选择不合法');
  if (action.secondary) {
    const other = unitById(state, action.secondary);
    if (!['fe_art_split_breath', 'axe_sweep'].includes(art.id) || other.id === target.id
      || (art.id === 'fe_art_split_breath' && distance(other.pos, target.pos) !== 1)
      || !legalArtTarget(state, unit, action.to, action.weapon, art, other)) throw new EngineError('TARGET_OUT_OF_RANGE', '战技次目标不合法');
  }
  return artVictims(state, unit, action.to, action.weapon, art, target, action.secondary);
}

export function artObjectForecast(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId, art: WeaponArt, objectId: string) {
  validateArt(state, unit, { type: 'act', unit: unit.id, to, act: 'art', weapon, art: art.id, target: objectId }, art);
  if (!artObjects(state, to, art).includes(objectId)) throw new EngineError('TARGET_OUT_OF_RANGE', '不是可破坏的战技物件');
  const object = state.objects!.find(row => row.id === objectId)!, damage = objectArtDamage(unit, weapon, art), hp = object.hp ?? 1;
  return { object: objectId, hp, damage, hpAfter: Math.max(0, hp - damage), cost: art.cost };
}

export function walkedCells(state: BattleState, unit: UnitState, to: Point): number {
  if (samePoint(unit.pos, to)) return 0;
  return new Set(pathTo(state, moveRange(state, unit), to).slice(1).map(p => p.join(','))).size;
}

export function artState(unit: UnitState, events: BattleEvent[]): void {
  if (unit.artEffects && !Object.keys(unit.artEffects).length) delete unit.artEffects;
  events.push({ t: 'artState', unit: unit.id, effects: structuredClone(unit.artEffects) });
}

export function displace(unit: UnitState, events: BattleEvent[]): void {
  unit.artEffects = { ...unit.artEffects, displaced: true };
  artState(unit, events);
}

export function clearArtEffects(state: BattleState, unit: UnitState, events: BattleEvent[]): void {
  if (unit.artEffects) { delete unit.artEffects; artState(unit, events); }
  for (const ally of state.units) if (ally.artEffects?.barrier?.by === unit.id) {
    delete ally.artEffects.barrier; artState(ally, events);
  }
  if (state.embers?.some(cell => cell.until === unit.id)) {
    state.embers = state.embers.filter(cell => cell.until !== unit.id);
    events.push({ t: 'embers', cells: structuredClone(state.embers) });
  }
}

export function beginArtAction(state: BattleState, unit: UnitState, events: BattleEvent[]): void {
  for (const ally of state.units) if (ally.artEffects?.barrier?.by === unit.id) {
    delete ally.artEffects.barrier; artState(ally, events);
  }
}

export function endArtAction(state: BattleState, unit: UnitState, events: BattleEvent[]): void {
  if (unit.alive && !unit.petrified && state.embers?.some(cell => cell.side !== unit.side && samePoint(cell.pos, unit.pos))) {
    const amount = Math.min(3, Math.max(0, unit.hp - 1));
    unit.hp -= amount;
    events.push({ t: 'hazard', unit: unit.id, source: 'ember', kind: 'damage', amount, hpAfter: unit.hp });
  }
  if (state.embers?.some(cell => cell.until === unit.id)) {
    state.embers = state.embers.filter(cell => cell.until !== unit.id);
    events.push({ t: 'embers', cells: structuredClone(state.embers) });
  }
  if (unit.artEffects) {
    delete unit.artEffects.movementPenalty; delete unit.artEffects.scent; delete unit.artEffects.displaced;
    artState(unit, events);
  }
}

export function afterArt(state: BattleState, unit: UnitState, target: UnitState, action: ArtAction, art: WeaponArt, hit: boolean, events: BattleEvent[]): void {
  if (!hit || !target.alive || target.petrified) return;
  if (art.id === 'fe_art_ankle_cut' && !target.immunities?.includes('movement_debuff')) {
    target.artEffects = { ...target.artEffects, movementPenalty: Math.max(2, target.artEffects?.movementPenalty ?? 0) }; artState(target, events);
  }
  if (art.id === 'fe_art_scent_mark') {
    target.artEffects = { ...target.artEffects, scent: [...new Set([...(target.artEffects?.scent ?? []), unit.side])] }; artState(target, events);
  }
  if (art.id === 'fe_art_ember_trail' && TERRAINS[state.map.tiles[target.pos[1]][target.pos[0]]].costs[0] !== null) {
    state.embers = [...(state.embers ?? []).filter(cell => !samePoint(cell.pos, target.pos)), { pos: [...target.pos], side: unit.side, until: target.id }];
    events.push({ t: 'embers', cells: structuredClone(state.embers) });
  }
  if (action.ally && unit.alive && !unit.petrified && artAllies(state, unit, unit.pos, art).includes(action.ally)) {
    const ally = unitById(state, action.ally);
    if (art.id === 'fe_art_cover_exchange') {
      const from = [...unit.pos] as Point, other = [...ally.pos] as Point;
      moveUnit(state, unit, [from, other], events);
      moveUnit(state, ally, [other, from], events);
      displace(unit, events); displace(ally, events);
    } else if (art.id === 'fe_art_scale_rebuff') {
      if ((ally.artEffects?.barrier?.amount ?? 0) <= 3) ally.artEffects = { ...ally.artEffects, barrier: { amount: 3, by: unit.id } };
      artState(ally, events);
    }
  }
}
