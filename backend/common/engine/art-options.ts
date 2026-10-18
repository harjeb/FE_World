import { ART_MECHANICS } from '../data/art-mechanics.ts';
import { CLASSES } from '../data/classes.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { artStats } from './art-effects.ts';
import { moveRange } from './movement.ts';
import { destinationCells, isHostileSpell, spellDestination, spellTargets, staffDestination, staffEffect, staffTargets } from './support.ts';
import { distance, keyPoint, samePoint, staffWeapons } from './units.ts';
import { EngineError } from './types.ts';
import type { ActAction, BattleState, Point, UnitState } from './types.ts';

export type ArtSupport = NonNullable<Extract<ActAction, { act: 'art' }>['support']>;
export function artObjects(state: BattleState, to: Point, art: WeaponArt): string[] {
  return ART_MECHANICS[art.id]?.destructive ? (state.objects ?? []).filter(object => object.kind === 'wall'
    && object.state === 'intact' && distance(to, object.pos) === 1).map(object => object.id) : [];
}
export function artPostMoves(state: BattleState, unit: UnitState, to: Point, art: WeaponArt): Point[] {
  const budget = ART_MECHANICS[art.id]?.postMove;
  if (!budget) return [];
  const range = moveRange(state, { ...unit, pos: to }, budget);
  return [...range.stops].filter(key => key !== range.origin).map(key => keyPoint(state, key));
}
export function artSupportOptions(state: BattleState, unit: UnitState, to: Point, art: WeaponArt): ArtSupport[] {
  if (!ART_MECHANICS[art.id]?.support) return [];
  const actor = { ...unit, pos: to }, projected = { ...state, units: state.units.map(u => u.id === unit.id ? actor : u) };
  const options: ArtSupport[] = [];
  for (const weapon of staffWeapons(actor)) {
    if (['sleep', 'silence'].includes(staffEffect(weapon)) || (actor.bookInstances?.find(row => row.id === weapon)?.charges ?? 0) <= 0) continue;
    const rule = staffDestination(weapon), cells = rule ? destinationCells(projected, actor, to, rule) : [undefined];
    for (const target of staffTargets(projected, actor, to, weapon).filter(u => !u.petrified)) for (const dest of cells) {
      options.push({ target: target.id, weapon, ...(dest ? { dest } : {}) });
    }
  }
  for (const row of actor.spellbooks ?? []) {
    const book = SPELLBOOK_BY_ID.get(row.id);
    if (!book || isHostileSpell(book) || CLASSES[unit.classId].weapons.staff === undefined) continue;
    const rule = spellDestination(row.id), cells = rule ? destinationCells(projected, actor, to, rule) : [undefined];
    for (const target of spellTargets(projected, actor, to, row.id).filter(u => !u.petrified)) for (const dest of cells) {
      options.push({ target: target.id, spell: row.id, ...(dest ? { dest } : {}) });
    }
  }
  return options;
}
export function sameArtSupport(a: ArtSupport, b: ArtSupport): boolean {
  return a.target === b.target && a.spell === b.spell && a.weapon === b.weapon
    && ((!a.dest && !b.dest) || !!a.dest && !!b.dest && samePoint(a.dest, b.dest));
}
export function validateArtExtras(state: BattleState, unit: UnitState, action: Extract<ActAction, { act: 'art' }>, art: WeaponArt): void {
  if (action.postTo && !artPostMoves(state, unit, action.to, art).some(p => samePoint(p, action.postTo!))) throw new EngineError('UNREACHABLE', '战后移动落点不合法');
  if (action.support && !artSupportOptions(state, unit, action.to, art).some(option => sameArtSupport(option, action.support!))) throw new EngineError('BAD_REQUEST', '辅助追加的目标、媒介、次数或落点不合法');
}
export function objectArtDamage(unit: UnitState, weapon: WeaponId, art: WeaponArt): number {
  return Math.max(1, artStats(unit).str + WEAPONS[weapon].might + art.might - 10);
}
