import { classOf } from './units.ts';
import { hasTrait } from './personal-traits.ts';
import type { BattleEvent, BattleState, Point, UnitState } from './types.ts';

export function breakIce(state: BattleState, unit: UnitState, path: Point[], events: BattleEvent[]): void {
  const cls = classOf(unit);
  if (!cls.armored || cls.moveType === 'flying') return;
  for (const [x, y] of path) {
    if (state.map.tiles[y][x] !== 'ice') continue;
    state.map.tiles[y][x] = 'water';
    events.push({ t: 'terrain', unit: unit.id, at: [x, y], terrain: 'water' });
  }
}

// Walking, forced movement and teleport landings share the same ice rule.
export function moveUnit(state: BattleState, unit: UnitState, path: Point[], events: BattleEvent[]): void {
  unit.pos = [...path[path.length - 1]];
  events.push({ t: 'move', unit: unit.id, path });
  if (hasTrait(unit, 'eight_formations') && path.some(p => p[0] !== unit.pos[0] || p[1] !== unit.pos[1])) {
    unit.artEffects = { ...unit.artEffects, formationMoved: true };
    events.push({ t: 'artState', unit: unit.id, effects: structuredClone(unit.artEffects) });
  }
  breakIce(state, unit, path, events);
}
