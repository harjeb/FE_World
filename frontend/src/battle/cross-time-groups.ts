import { artVictims } from '@common/engine/arts.ts';
import { WEAPON_ART_BY_ID } from '@common/data/weapon-arts.ts';
import type { BattleState, Point } from '@common/engine/types.ts';
import type { Mode } from './selection.ts';

export function groupViews(state: BattleState): GroupView[] {
  return (state.crossTimeGroups ?? []).map(group => ({ id: group.id, name: group.name, members: group.unitIds,
    status: group.active ? 'active' : group.activateTurn !== undefined ? 'scheduled' : 'dormant',
    boundaryY: group.thresholdY, activationTurn: group.activateTurn }));
}

export function planningGroupWarnings(state: BattleState, mode: Mode, hover: Point | null): string[] {
  const destinations: Point[] = 'to' in mode ? [mode.to] : mode.kind === 'move' && hover ? [hover] : [];
  if ('dest' in mode && mode.dest && (mode.kind !== 'cast' || mode.spell !== 'fw_spell_9')) destinations.push(mode.dest);
  if (mode.kind === 'art') {
    if (mode.postTo) destinations.push(mode.postTo);
    if (mode.support?.dest && mode.support.spell !== 'fw_spell_9') destinations.push(mode.support.dest);
    if (mode.art === 'fe_art_cover_exchange' && mode.ally) {
      const ally = state.units.find(unit => unit.id === mode.ally);
      if (ally) destinations.push(ally.pos);
    }
  }
  const attacked = ('target' in mode ? [mode.target, ...(mode.kind === 'art' ? [mode.secondary] : [])] : [])
    .filter((id): id is string => !!id && state.units.some(unit => unit.id === id && unit.side === 'enemy'));
  if (mode.kind === 'art' && mode.art && mode.weapon && mode.target) {
    const art = WEAPON_ART_BY_ID.get(mode.art);
    const unit = state.units.find(unit => unit.id === mode.unit);
    const target = state.units.find(unit => unit.id === mode.target);
    if (art && unit && target) attacked.push(...artVictims(state, unit, mode.to, mode.weapon, art, target, mode.secondary).filter(unit => unit.side === 'enemy').map(unit => unit.id));
  }
  return activationWarnings(groupViews(state), state.turn, state.phase, destinations, attacked);
}

export interface GroupView {
  id: string;
  name: string;
  members: string[];
  status: 'dormant' | 'scheduled' | 'active';
  boundaryY?: number;
  activationTurn?: number;
}

export const groupStatus = (group: GroupView): string => group.status === 'active' ? '已激活'
  : group.activationTurn !== undefined ? `警戒 · 第 ${group.activationTurn} 回合敌方阶段行动` : '待命';

// Planned destinations include teleport/displacement landings. All warnings are
// advisory; the authoritative engine records activation after the action resolves.
export function activationWarnings(groups: readonly GroupView[], turn: number, phase: 'player' | 'enemy', destinations: readonly (readonly [number, number])[], attacked: readonly string[] = []): string[] {
  return groups.flatMap(group => {
    if (group.status === 'active') return [];
    const crossing = group.boundaryY !== undefined && destinations.some(pos => pos[1] <= group.boundaryY!);
    const assault = group.members.some(id => attacked.includes(id));
    if (!crossing && !assault) return [];
    const next = group.activationTurn ?? (phase === 'player' ? turn : turn + 1);
    return [`${group.id} ${group.name}：${crossing ? '计划落点越过警戒线' : '攻击待命组（未命中也触发）'}；第 ${next} 回合敌方阶段行动${group.id === 'A' ? '，固定计时不提前' : ''}。`];
  });
}
