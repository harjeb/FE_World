import type { ArtMechanics } from '../data/art-mechanics.ts';
import type { Stats } from '../data/types.ts';
import { MOVEMENT, TERRAINS } from '../maps/map.ts';
import { objectBlocks } from './scenario.ts';
import { moveUnit } from './terrain.ts';
import { classOf, distance, inBounds, unitAt } from './units.ts';
import type { ArtAilment, ArtBuff, ArtStat, BattleEvent, BattleState, Point, Side, UnitState } from './types.ts';

function emit(unit: UnitState, events: BattleEvent[]): void {
  events.push({ t: 'artState', unit: unit.id, effects: structuredClone(unit.artEffects) });
}

/** Map gains add to the strongest temporary boost and strongest temporary penalty. */
export function artBonus(unit: UnitState, stat: ArtStat): number {
  const buffs = (unit.artEffects?.buffs ?? []).filter(b => b.stat === stat);
  const temporary = buffs.filter(b => b.duration !== 'map');
  return buffs.filter(b => b.duration === 'map').reduce((n, b) => n + b.amount, 0)
    + Math.max(0, ...temporary.map(b => b.amount)) + Math.min(0, ...temporary.map(b => b.amount));
}

export function artStats(unit: UnitState): Stats {
  const stats = { ...unit.stats };
  for (const stat of ['str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'] as const) {
    stats[stat] = Math.max(0, stats[stat] + artBonus(unit, stat));
  }
  return stats;
}

export function addArtBuff(state: BattleState, unit: UnitState, source: string, stat: ArtStat, amount: number,
  duration: ArtBuff['duration'], events: BattleEvent[], cap?: number): void {
  if (!amount || (amount < 0 && (unit.immunities?.includes('debuff')
    || (stat === 'move' && unit.immunities?.includes('movement_debuff'))
    || (stat === 'protection' && unit.immunities?.includes('defense_pierce'))))) return;
  const buffs = unit.artEffects?.buffs ?? [];
  // Map records share their stat cap, including base/upgraded versions of an art.
  const matches = (b: ArtBuff) => b.stat === stat && b.duration === duration
    && (duration === 'map' || b.source === source) && Math.sign(b.amount) === Math.sign(amount);
  const old = buffs.filter(matches);
  const next = duration === 'map' ? old.reduce((n, b) => n + b.amount, amount)
    : amount > 0 ? Math.max(amount, ...old.map(b => b.amount)) : Math.min(amount, ...old.map(b => b.amount));
  const bounded = cap === undefined ? next : Math.sign(next) * Math.min(Math.abs(next), Math.abs(cap));
  unit.artEffects = { ...unit.artEffects, buffs: [...buffs.filter(b => !matches(b)), { source, stat, amount: bounded, duration, turn: state.turn }] };
  emit(unit, events);
}

export function inflictArtStatus(unit: UnitState, status: ArtAilment, events: BattleEvent[]): void {
  if (unit.immunities?.includes(status) || (status === 'root' && unit.immunities?.includes('movement_debuff'))
    || unit.artEffects?.statuses?.includes(status)) return;
  unit.artEffects = { ...unit.artEffects, statuses: [...(unit.artEffects?.statuses ?? []), status] };
  emit(unit, events);
}

export function artHeal(unit: UnitState, amount: number, by: string | null, events: BattleEvent[]): number {
  if (!unit.alive || unit.petrified || unit.hp <= 0 || unit.immunities?.includes('healing')) return 0;
  const actual = Math.max(0, Math.min(Math.floor(amount), unit.stats.hp - unit.hp));
  if (actual > 0) {
    unit.hp += actual;
    events.push({ t: 'heal', by, target: unit.id, amount: actual, hpAfter: unit.hp, source: 'art' });
  }
  return actual;
}

export function expireArtPhase(state: BattleState, side: Side, where: 'start' | 'end', events: BattleEvent[]): void {
  for (const unit of state.units.filter(u => u.side === side)) {
    const effects = unit.artEffects;
    if (!effects) continue;
    if (where === 'end' && unit.alive && !unit.petrified && unit.hp > 0
      && effects.statuses?.includes('poison') && !unit.immunities?.includes('poison')) {
      const amount = Math.min(unit.hp - 1, Math.max(1, Math.floor(unit.stats.hp * .05)));
      if (amount > 0) {
        unit.hp -= amount;
        events.push({ t: 'hazard', unit: unit.id, source: 'status', kind: 'damage', amount, hpAfter: unit.hp });
      }
    }
    const buffs = effects.buffs?.filter(b => b.duration !== (where === 'start' ? 'next_phase' : 'phase'));
    const changed = buffs?.length !== effects.buffs?.length || (where === 'end' && !!effects.statuses?.length);
    if (changed) {
      unit.artEffects = { ...effects, buffs, ...(where === 'end' ? { statuses: [] } : {}) };
      emit(unit, events);
    }
  }
}

/** Pass a shallow snapshot taken before combat. New/replaced records survive this exchange. */
export function consumeArtExchange(unit: UnitState, old: ArtBuff[], events: BattleEvent[]): void {
  const buffs = unit.artEffects?.buffs;
  if (!buffs) return;
  const remaining = buffs.filter(b => b.duration !== 'exchange' || !old.includes(b));
  if (remaining.length !== buffs.length) {
    unit.artEffects = { ...unit.artEffects, buffs: remaining };
    emit(unit, events);
  }
}

export function afterClassicArt(state: BattleState, unit: UnitState, target: UnitState, source: string,
  mechanics: ArtMechanics, hit: boolean, killed: boolean, events: BattleEvent[]): void {
  if (unit.alive && !unit.petrified && unit.hp > 0) {
    for (const buff of mechanics.postBuff ?? []) {
      if (buff.trigger === 'after' || killed) addArtBuff(state, unit, source, buff.stat, buff.amount, buff.duration, events, buff.cap);
    }
    const heal = mechanics.postHeal;
    if (heal && (heal.trigger === 'after' || killed)) artHeal(unit, Math.max(1, Math.floor(unit.stats.hp * heal.percent)), unit.id, events);
  }
  if (mechanics.afterDebuff && target.alive && !target.petrified && target.hp > 0) {
    const debuff = mechanics.afterDebuff;
    addArtBuff(state, target, source, debuff.stat, -Math.abs(debuff.amount), debuff.duration, events);
  }
  if (!mechanics.push || !hit || !unit.alive || unit.petrified || unit.hp <= 0
    || !target.alive || target.petrified || target.hp <= 0 || distance(unit.pos, target.pos) !== 1) return;
  const to: Point = [target.pos[0] * 2 - unit.pos[0], target.pos[1] * 2 - unit.pos[1]];
  if (!inBounds(state, to) || unitAt(state, to) || objectBlocks(state, to)
    || TERRAINS[state.map.tiles[to[1]][to[0]]].costs[MOVEMENT[classOf(target).moveType].index] === null) return;
  moveUnit(state, target, [[...target.pos], to], events);
  target.artEffects = { ...target.artEffects, displaced: true };
  emit(target, events);
}
