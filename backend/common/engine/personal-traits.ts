import type { SkillId } from '../data/skills.ts';
import type { BattleState, Point, UnitState } from './types.ts';
import { roll100 } from './rng.ts';

export function hasTrait(unit: UnitState, id: SkillId): boolean {
  return unit.skill === id || !!unit.skills?.includes(id);
}
export const BURST_TRAITS = ['xiliang', 'risky_scheme', 'peerless'] as const;
export type TraitRolls = Record<string, boolean>;
const bursts = new WeakMap<UnitState, boolean>();
const openingHP = new WeakMap<UnitState, number>();
const pending = new WeakMap<BattleState, (() => void)[]>();
export function traitOpeningHP(unit: UnitState) { return openingHP.get(unit) ?? unit.hp; }
export function afterTraitExchange(state: BattleState, effect: () => void) {
  const queue = pending.get(state);
  if (queue) queue.push(effect); else effect();
}
export function burstTrait(unit: UnitState) { return BURST_TRAITS.find(id => hasTrait(unit, id)); }
export function traitBurstActive(unit: UnitState): boolean { return bursts.get(unit) === true; }
export function traitBurstPrepared(unit: UnitState): boolean { return bursts.has(unit); }
/** Scope includes art option calculation and all victims of one area action. Always call cleanup. */
export function prepareTraitExchange(state: BattleState, units: UnitState[], fixed?: TraitRolls) {
  const previous = units.map(unit => bursts.get(unit));
  const outer = !pending.has(state);
  const captured = state.units.filter(unit => !openingHP.has(unit));
  for (const unit of captured) openingHP.set(unit, unit.hp);
  if (outer) pending.set(state, []);
  const rolls: TraitRolls = {};
  units.forEach(unit => {
    if (!burstTrait(unit)) return;
    const active = fixed?.[unit.id] ?? bursts.get(unit) ?? roll100(state.rng) < 33;
    bursts.set(unit, active); rolls[unit.id] = active;
  });
  return { rolls, cleanup() { units.forEach((unit, i) => {
    if (previous[i] === undefined) bursts.delete(unit); else bursts.set(unit, previous[i]!);
  }); if (outer) {
    const queue = pending.get(state)!; pending.delete(state);
    for (const effect of queue) effect();
  }
  for (const unit of captured) openingHP.delete(unit);
  } };
}
export function traitBranches(units: UnitState[]): { probability: number; rolls: TraitRolls }[] {
  let branches = [{ probability: 1, rolls: {} as TraitRolls }];
  for (const unit of units) if (burstTrait(unit)) {
    if (bursts.has(unit)) branches = branches.map(b => ({ ...b, rolls: { ...b.rolls, [unit.id]: bursts.get(unit)! } }));
    else branches = branches.flatMap(b => [false, true].map(active => ({ probability: b.probability * (active ? .33 : .67), rolls: { ...b.rolls, [unit.id]: active } })));
  }
  return branches;
}
const dist = (a: Point, b: Point) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
export interface TraitOpening { hit: number; avoid: number; def: number; res: number; firstDamage: number; firstWard: number; counterHit: number; thunder: boolean }
export function traitOpening(state: BattleState, unit: UnitState, foe: UnitState, pos: Point, initiating: boolean, weapon: string, cast: boolean): TraitOpening {
  const allies = state.units.filter(u => u.id !== unit.id && u.side === unit.side && u.alive && u.hp > 0);
  const nearby = allies.filter(u => dist(u.pos, pos) <= 2), adjacent = allies.filter(u => dist(u.pos, pos) === 1);
  const m: TraitOpening = { hit: 0, avoid: 0, def: 0, res: 0, firstDamage: 0, firstWard: 0, counterHit: 0, thunder: false };
  if (hasTrait(unit, 'dragon_guard') && adjacent.some(u => traitOpeningHP(u) * 2 <= u.stats.hp)) { m.avoid += 10; m.firstWard = 2; }
  if (!initiating) {
    if (hasTrait(unit, 'changban') && nearby.length <= 1) { m.def += 4; m.avoid += 10; }
    if (hasTrait(unit, 'wise_shield') && adjacent.length) { m.def += 3; m.res += 3; }
    return m;
  }
  if (hasTrait(unit, 'capture_banner') && traitOpeningHP(foe) === foe.stats.hp) m.firstDamage += 4;
  if (hasTrait(unit, 'prudent_poison') && traitOpeningHP(foe) * 2 <= foe.stats.hp) { m.firstDamage += 3; m.counterHit -= 15; }
  if (hasTrait(unit, 'grand_strategy') && allies.some(u => dist(u.pos, foe.pos) === 1)) { m.hit += 15; m.firstDamage += 2; }
  if (hasTrait(unit, 'fallen_pride') && !nearby.length) { m.hit += 10; m.firstDamage += 3; }
  if (cast && hasTrait(unit, 'red_cliffs') && ['fire', 'elfire', 'flame_lance', 'meteor', 'fw_spell_7', 'fw_spell_61'].includes(weapon)) { m.hit += 10; m.firstDamage += 3; }
  if (cast && hasTrait(unit, 'thunder_majesty') && ['thunder', 'bolting', 'fw_spell_34'].includes(weapon)) { m.firstDamage += 4; m.thunder = true; }
  return m;
}
export function directHealingRangeBonus(unit: UnitState, id: string): number {
  return hasTrait(unit, 'royal_aid') && ['heal', 'recover', 'physic', 'fw_spell_12', 'fw_spell_24', 'fw_spell_26', 'fw_spell_25'].includes(id) ? 1 : 0;
}
