import { CLASSES } from '../data/classes.ts';
import { objectBlocks } from '../engine/scenario.ts';
import type { BattleState, Point, UnitState } from '../engine/types.ts';
import { neighbors, canEnter } from '../maps/map.ts';
import { createEnemy, HARD_ENEMY_RULES } from './enemies.ts';
import { enemyIdentityName } from './enemy-identities.ts';
import type { EnemySpec } from './enemies.ts';

// Keep reserves in the original formation's connected area, never across walls or in player deployment.
function reserveSpot(state: BattleState, spec: EnemySpec, reserved: Set<number>): Point | null {
  const { width, height, tiles } = state.map;
  const key = ([x, y]: Point) => y * width + x;
  const occupied = new Map(state.units.filter(u => u.alive).map(u => [key(u.pos), u.side]));
  const moveType = CLASSES[spec.classId].moveType;
  const queue: Point[] = [spec.pos];
  const seen = new Set([key(spec.pos)]);
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    if (!occupied.has(key(point)) && !reserved.has(key(point)) && canEnter(tiles[point[1]][point[0]], moveType)
      && !objectBlocks(state, point) && !state.units.some(u => u.alive && u.side === 'player'
        && Math.abs(u.pos[0] - point[0]) + Math.abs(u.pos[1] - point[1]) <= 1)) return point;
    for (const next of neighbors(point, width, height)) {
      if (seen.has(key(next)) || Math.abs(next[0] - spec.pos[0]) + Math.abs(next[1] - spec.pos[1]) > 6
        || !canEnter(tiles[next[1]][next[0]], moveType) || objectBlocks(state, next) || occupied.get(key(next)) === 'player') continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return null;
}

export function addEnemyReserves(state: BattleState, specs: EnemySpec[], deployment: Point[] = []): UnitState[] {
  if (state.aiDifficulty !== 'hard' || specs.length === 0) return [];
  const goal = state.goal;
  const objectives = goal.kind === 'seize' ? [goal.throne] : 'exits' in goal ? goal.exits : [];
  const reserved = new Set([...deployment, ...objectives, ...(state.boxes ?? []), ...(state.objects ?? []).map(o => o.pos)]
    .map(([x, y]) => y * state.map.width + x));
  const ordinary = specs.filter(spec => !spec.boss);
  const pool = ordinary.length ? ordinary : specs;
  const added: UnitState[] = [];
  const count = Math.ceil(specs.length * HARD_ENEMY_RULES.extraRatio);
  for (let i = 0; i < count; i++) {
    for (let offset = 0; offset < pool.length; offset++) {
      const spec = pool[(i + offset) % pool.length];
      const pos = reserveSpot(state, spec, reserved);
      if (!pos) continue;
      let id = `reserve-${state.units.length}`;
      while (state.units.some(unit => unit.id === id)) id += '-x';
      const unit = createEnemy(id, { ...spec, seed: `${state.id}:reserves`, aiDifficulty: 'hard', pos, boss: false, name: undefined });
      if (state.enemyIdentity) unit.name = enemyIdentityName(state.enemyIdentity, unit);
      state.units.push(unit);
      added.push(unit);
      break;
    }
  }
  return added;
}
