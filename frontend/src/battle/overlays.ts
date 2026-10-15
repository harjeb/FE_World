// Map overlays derived from the current state and mode: blue = can move, red = can attack,
// green = can heal, plus the planned route and the ghost at the planned destination.
import { WEAPONS } from '@common/data/weapons.ts';
import {
  cellKey, moveRange, pathTo, reachCells, targetsFrom, threatMap, unitById, weaponRange,
} from '@common/engine/index.ts';
import type { BattleState, Point, UnitState } from '@common/engine/index.ts';
import type { Mode } from './selection.ts';

export interface Overlays {
  move: Set<number>;
  attack: Set<number>;
  heal: Set<number>;
  path: Point[] | null;
  ghost: { unit: UnitState; at: Point } | null;
  targets: Set<string>;
}

const EMPTY: Overlays = { move: new Set(), attack: new Set(), heal: new Set(), path: null, ghost: null, targets: new Set() };

function cellsAround(state: BattleState, at: Point, [min, max]: [number, number]): Set<number> {
  const cells = new Set<number>();
  for (let dy = -max; dy <= max; dy++) {
    for (let dx = -max; dx <= max; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      const x = at[0] + dx, y = at[1] + dy;
      if (d >= min && d <= max && x >= 0 && y >= 0 && x < state.map.width && y < state.map.height) cells.add(cellKey(state, [x, y]));
    }
  }
  return cells;
}

// Full reach of a unit: where it can go and what it can hit from there.
function reach(state: BattleState, unit: UnitState): Overlays {
  const range = moveRange(state, unit);
  const move = new Set(range.cost.keys());
  const attack = new Set([...reachCells(state, unit, range, 'attack')].filter(k => !move.has(k)));
  const heal = new Set([...reachCells(state, unit, range, 'heal')].filter(k => !move.has(k) && !attack.has(k)));
  return { ...EMPTY, move, attack, heal };
}

export function overlaysFor(state: BattleState, mode: Mode, hover: Point | null): Overlays {
  switch (mode.kind) {
    case 'inspect':
      return reach(state, unitById(state, mode.unit));
    case 'move': {
      const unit = unitById(state, mode.unit);
      const base = reach(state, unit);
      const range = moveRange(state, unit);
      if (!hover || !range.stops.has(cellKey(state, hover))) return base;
      const path = pathTo(state, range, hover);
      return { ...base, path: path.length > 1 ? path : null, ghost: { unit, at: hover } };
    }
    case 'action':
    case 'attack':
    case 'heal':
    case 'item': {
      const unit = unitById(state, mode.unit);
      const path = pathTo(state, moveRange(state, unit), mode.to);
      const result: Overlays = { ...EMPTY, path: path.length > 1 ? path : null, ghost: { unit, at: mode.to } };
      if (mode.kind === 'attack' || mode.kind === 'heal') {
        const cells = cellsAround(state, mode.to, weaponRange(unit, mode.weapon));
        result[mode.kind] = cells;
        const kind = WEAPONS[mode.weapon].type === 'staff' ? 'heal' : 'attack';
        result.targets = new Set(targetsFrom(state, unit, mode.to, mode.weapon, kind).map(u => u.id));
      }
      return result;
    }
    default:
      return EMPTY;
  }
}

export function threatCells(state: BattleState): Set<number> {
  return new Set(threatMap(state, 'enemy').keys());
}
