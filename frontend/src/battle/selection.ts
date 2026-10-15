// What the player is in the middle of doing, and how a map click moves that along.
// Pure functions over the engine state, so the flow (选单位 → 预览落点 → 行动与目标 → 预测 → 确认) is testable.
import type { WeaponId } from '@common/data/weapons.ts';
import {
  actionOptions, cellKey, moveRange, unitAt, unitById,
} from '@common/engine/index.ts';
import type { BattleState, Point, UnitState } from '@common/engine/index.ts';

export type Mode =
  | { kind: 'idle' }
  | { kind: 'inspect'; unit: string }
  | { kind: 'move'; unit: string }
  | { kind: 'action'; unit: string; to: Point }
  | { kind: 'attack'; unit: string; to: Point; weapon: WeaponId; target: string | null }
  | { kind: 'heal'; unit: string; to: Point; weapon: WeaponId; target: string | null }
  | { kind: 'item'; unit: string; to: Point }
  | { kind: 'busy' };

export const IDLE: Mode = { kind: 'idle' };

export function canCommand(state: BattleState, unit: UnitState | undefined): boolean {
  return !!unit && unit.alive && unit.side === 'player' && !unit.acted && state.phase === 'player' && !state.result;
}

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

// Pick where to stand to strike or heal `target`: the hovered cell if it works, otherwise the
// cheapest reachable cell, preferring weapons in list order.
function standFor(state: BattleState, unit: UnitState, target: UnitState, kind: 'attack' | 'heal', prefer: Point | null) {
  const range = moveRange(state, unit);
  const candidates = [...range.stops].sort((a, b) => (range.cost.get(a)! - range.cost.get(b)!) || a - b);
  if (prefer && range.stops.has(cellKey(state, prefer))) candidates.unshift(cellKey(state, prefer));
  for (const key of candidates) {
    const to: Point = [key % state.map.width, Math.floor(key / state.map.width)];
    const options = actionOptions(state, unit, to)[kind];
    const option = options.find(o => o.targets.some(t => t.id === target.id));
    if (option) return { to, weapon: option.weapon };
  }
  return null;
}

export function clickCell(state: BattleState, mode: Mode, point: Point, hover: Point | null): Mode {
  if (mode.kind === 'busy' || state.result) return mode;
  const other = unitAt(state, point);
  switch (mode.kind) {
    case 'idle':
    case 'inspect':
      if (other && canCommand(state, other)) return { kind: 'move', unit: other.id };
      if (other) return mode.kind === 'inspect' && mode.unit === other.id ? IDLE : { kind: 'inspect', unit: other.id };
      return IDLE;
    case 'move': {
      const unit = unitById(state, mode.unit);
      if (moveRange(state, unit).stops.has(cellKey(state, point))) return { kind: 'action', unit: unit.id, to: point };
      if (other && other.id !== unit.id) {
        const kind = other.side !== unit.side ? 'attack' : 'heal';
        const stand = standFor(state, unit, other, kind, hover);
        if (stand) return { kind, unit: unit.id, to: stand.to, weapon: stand.weapon, target: other.id };
        if (canCommand(state, other)) return { kind: 'move', unit: other.id };
        return { kind: 'inspect', unit: other.id };
      }
      return IDLE;
    }
    case 'action':
    case 'attack':
    case 'heal':
    case 'item': {
      const unit = unitById(state, mode.unit);
      if (other && other.id !== unit.id) {
        const options = actionOptions(state, unit, mode.to);
        const kind = other.side !== unit.side ? 'attack' : 'heal';
        const usable = options[kind].filter(o => o.targets.some(t => t.id === other.id));
        if (usable.length > 0) {
          const keep = (mode.kind === 'attack' || mode.kind === 'heal') && usable.find(o => o.weapon === mode.weapon);
          return { kind, unit: unit.id, to: mode.to, weapon: (keep || usable[0]).weapon, target: other.id };
        }
      }
      if (same(point, mode.to)) return { kind: 'action', unit: unit.id, to: mode.to };
      if (moveRange(state, unit).stops.has(cellKey(state, point))) return { kind: 'action', unit: unit.id, to: point };
      return { kind: 'move', unit: unit.id };
    }
  }
}

export function back(mode: Mode): Mode {
  switch (mode.kind) {
    case 'attack':
    case 'heal':
      return mode.target ? { ...mode, target: null } : { kind: 'action', unit: mode.unit, to: mode.to };
    case 'item':
      return { kind: 'action', unit: mode.unit, to: mode.to };
    case 'action':
      return { kind: 'move', unit: mode.unit };
    case 'busy':
      return mode;
    default:
      return IDLE;
  }
}

// The five steps shown above the action panel (docs/08).
export function stepIndex(mode: Mode): number {
  switch (mode.kind) {
    case 'move': return 1;
    case 'action': return 2;
    case 'attack': case 'heal': return mode.target ? 3 : 2;
    case 'item': return 3;
    default: return 0;
  }
}
