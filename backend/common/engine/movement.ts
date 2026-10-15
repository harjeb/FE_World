import { MOVEMENT, TERRAINS } from '../maps/map.ts';
import { cellKey, classOf, inBounds, keyPoint, living } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

export interface MoveRange {
  origin: number;
  // Movement cost of every cell within budget, including cells held by allies (passable, not stoppable).
  cost: Map<number, number>;
  prev: Map<number, number>;
  // Cells the unit may end its move on.
  stops: Set<number>;
}

const STEPS: Point[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function enterCost(state: BattleState, unit: UnitState, [x, y]: Point): number | null {
  return TERRAINS[state.map.tiles[y][x]].costs[MOVEMENT[classOf(unit).moveType].index];
}

// Dijkstra over terrain costs. Enemy units block; allies can be passed through but not stopped on.
// Ties resolve by cell order so the same state always yields the same paths.
export function moveRange(state: BattleState, unit: UnitState, budget = classOf(unit).move): MoveRange {
  const origin = cellKey(state, unit.pos);
  const others = living(state).filter(u => u.id !== unit.id);
  const blocked = new Set(others.filter(u => u.side !== unit.side).map(u => cellKey(state, u.pos)));
  const occupied = new Set(others.map(u => cellKey(state, u.pos)));
  const cost = new Map<number, number>([[origin, 0]]);
  const prev = new Map<number, number>();
  const open = [origin];
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = cost.get(open[i])!, b = cost.get(open[best])!;
      if (a < b || (a === b && open[i] < open[best])) best = i;
    }
    const current = open.splice(best, 1)[0];
    const [cx, cy] = keyPoint(state, current);
    for (const [dx, dy] of STEPS) {
      const next: Point = [cx + dx, cy + dy];
      if (!inBounds(state, next)) continue;
      const key = cellKey(state, next);
      if (blocked.has(key)) continue;
      const step = enterCost(state, unit, next);
      if (step === null) continue;
      const total = cost.get(current)! + step;
      if (total > budget) continue;
      const known = cost.get(key);
      if (known === undefined || total < known) {
        if (known === undefined) open.push(key);
        cost.set(key, total);
        prev.set(key, current);
      }
    }
  }
  const stops = new Set([...cost.keys()].filter(key => !occupied.has(key)));
  return { origin, cost, prev, stops };
}

export function pathTo(state: BattleState, range: MoveRange, target: Point): Point[] {
  const path: Point[] = [];
  let key: number | undefined = cellKey(state, target);
  while (key !== undefined) {
    path.unshift(keyPoint(state, key));
    key = key === range.origin ? undefined : range.prev.get(key);
  }
  return path;
}

// Cost for the unit to walk from each cell to the nearest source cell, ignoring other units.
// The rule AI uses it to advance toward targets it cannot reach this phase.
export function travelCosts(state: BattleState, unit: UnitState, sources: Point[]): Map<number, number> {
  const dist = new Map<number, number>();
  const open: number[] = [];
  for (const source of sources) {
    const key = cellKey(state, source);
    if (!dist.has(key)) {
      dist.set(key, 0);
      open.push(key);
    }
  }
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = dist.get(open[i])!, b = dist.get(open[best])!;
      if (a < b || (a === b && open[i] < open[best])) best = i;
    }
    const current = open.splice(best, 1)[0];
    const point = keyPoint(state, current);
    const step = enterCost(state, unit, point);
    if (step === null && dist.get(current)! > 0) continue;
    for (const [dx, dy] of STEPS) {
      const next: Point = [point[0] + dx, point[1] + dy];
      if (!inBounds(state, next) || enterCost(state, unit, next) === null) continue;
      const key = cellKey(state, next);
      const total = dist.get(current)! + (step ?? 1);
      const known = dist.get(key);
      if (known === undefined || total < known) {
        if (known === undefined) open.push(key);
        dist.set(key, total);
      }
    }
  }
  return dist;
}
