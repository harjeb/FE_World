import { LAYOUTS } from './layouts.ts';
import type { EncounterLayout } from './layouts.ts';
import { THEMES } from './themes.ts';
import type { Theme } from './themes.ts';

// Names, glyphs, movement costs and combat bonuses follow docs/03-combat.md; null means impassable.
// heal is the percentage of max HP restored at the start of the occupant's phase.
// Glyphs match the pixel-art painters in design/pixel-art/gen_art.py, colors come from its palette.
export const TERRAINS = {
  plain: { name: '平地', glyph: '.', color: '#7ea058', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  snow: { name: '雪地', glyph: 'n', color: '#e4edf1', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  ice: { name: '冰面', glyph: 'i', color: '#a7dce8', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  road: { name: '道路', glyph: 'r', color: '#c6a97a', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  bridge: { name: '桥', glyph: 'b', color: '#b6b3aa', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  floor: { name: '石地板', glyph: 'p', color: '#c2b8a2', costs: [1, 1, 1, 1], avoid: 0, def: 0, heal: 0 },
  village: { name: '村庄', glyph: 'v', color: '#a0503e', costs: [1, 1, 1, 1], avoid: 10, def: 0, heal: 0 },
  forest: { name: '森林', glyph: 'f', color: '#3f7042', costs: [2, 2, 3, 1], avoid: 20, def: 1, heal: 0 },
  mountain: { name: '山地', glyph: 'm', color: '#a39886', costs: [3, null, null, 1], avoid: 30, def: 2, heal: 0 },
  fort: { name: '堡垒', glyph: 'F', color: '#94918a', costs: [2, 2, 2, 1], avoid: 20, def: 2, heal: 20 },
  shallows: { name: '浅滩', glyph: 's', color: '#6e9eb4', costs: [3, null, 4, 1], avoid: -10, def: 0, heal: 0 },
  water: { name: '水域', glyph: 'w', color: '#4f80aa', costs: [null, null, null, 1], avoid: 0, def: 0, heal: 0 },
  wall: { name: '墙壁', glyph: '#', color: '#6e6c66', costs: [null, null, null, null], avoid: 0, def: 0, heal: 0 },
  throne: { name: '王座', glyph: 'T', color: '#d4aa52', costs: [1, 1, 1, 1], avoid: 30, def: 3, heal: 20 },
} as const;

export const MOVEMENT = {
  foot: { index: 0, minimumMove: 5 },
  armored: { index: 1, minimumMove: 4 },
  mounted: { index: 2, minimumMove: 7 },
  flying: { index: 3, minimumMove: 7 },
} as const;
export type Terrain = keyof typeof TERRAINS;
export type Movement = keyof typeof MOVEMENT;
export type Point = [number, number];

export function seasonalTerrain(tile: Terrain, season: number): Terrain {
  if (season !== 4) return tile;
  return tile === 'plain' ? 'snow' : tile === 'water' || tile === 'shallows' ? 'ice' : tile;
}

// Freeze the season into each new battle; never repaint a saved board or refreeze broken ice.
export function seasonalMap(tiles: Terrain[][], season: number) {
  return { width: tiles[0].length, height: tiles.length, season,
    tiles: tiles.map(row => row.map(tile => seasonalTerrain(tile, season))) };
}
export interface BattleMap {
  generatorVersion: 3 | 4;
  layout?: EncounterLayout;
  playerGroups?: number[];
  seed: string;
  theme: Theme;
  width: number;
  height: number;
  tiles: Terrain[][];
  spawns: { player: Point[]; enemy: Point[] };
  objective: { kind: 'seize'; position: Point };
}

const BY_GLYPH = new Map(Object.entries(TERRAINS).map(([key, terrain]) => [terrain.glyph as string, key as Terrain]));

// Hand-made maps are written as glyph rows, the same notation as the pixel-art maps.
export function tilesFromGlyphs(rows: string[]): Terrain[][] {
  return rows.map((row, y) => [...row].map((glyph, x) => {
    const tile = BY_GLYPH.get(glyph);
    if (!tile || row.length !== rows[0].length) throw new Error(`地图第 ${y} 行第 ${x} 列无效：${glyph}`);
    return tile;
  }));
}

export function neighbors([x, y]: Point, width: number, height: number): Point[] {
  return ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as Point[])
    .filter(([a, b]) => a >= 0 && b >= 0 && a < width && b < height);
}

export function canEnter(terrain: Terrain, movement: Movement): boolean {
  const rule = MOVEMENT[movement];
  const cost = TERRAINS[terrain].costs[rule.index];
  return cost !== null && cost <= rule.minimumMove;
}

export function reachable(tiles: Terrain[][], start: Point, movement: Movement): Set<number> {
  const width = tiles[0].length;
  const seen = new Set<number>();
  if (!canEnter(tiles[start[1]][start[0]], movement)) return seen;
  const queue: Point[] = [start];
  seen.add(start[1] * width + start[0]);
  for (let i = 0; i < queue.length; i++) {
    for (const [x, y] of neighbors(queue[i], width, tiles.length)) {
      const key = y * width + x;
      if (!seen.has(key) && canEnter(tiles[y][x], movement)) {
        seen.add(key);
        queue.push([x, y]);
      }
    }
  }
  return seen;
}

export function assertDimension(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 10 || Number(value) > 64) {
    throw new Error(`${name} 必须是 10–64 的整数`);
  }
}

function assertPoint(value: unknown, width: number, height: number): asserts value is Point {
  if (!Array.isArray(value) || value.length !== 2
    || !value.every(Number.isInteger)
    || value[0] < 0 || value[0] >= width || value[1] < 0 || value[1] >= height) {
    throw new Error('坐标必须为地图范围内的 [x, y] 整数');
  }
}

export function assertMap(value: unknown): asserts value is BattleMap {
  if (!value || typeof value !== 'object') throw new Error('地图必须为对象');
  const map = value as BattleMap;
  assertDimension(map.width, 'width');
  assertDimension(map.height, 'height');
  if (![3, 4].includes(map.generatorVersion) || typeof map.seed !== 'string'
    || map.seed.length === 0 || map.seed.length > 200) throw new Error('地图版本或种子无效');
  if (typeof map.theme !== 'string' || !Object.hasOwn(THEMES, map.theme)) throw new Error('未知地图主题');
  if (!Array.isArray(map.tiles) || map.tiles.length !== map.height
    || !map.tiles.every(row => Array.isArray(row) && row.length === map.width
      && row.every(tile => typeof tile === 'string' && Object.hasOwn(TERRAINS, tile)))) {
    throw new Error('地图行列尺寸或地形名称无效');
  }
  if (!map.spawns || typeof map.spawns !== 'object') throw new Error('缺少出生点');
  const occupied = new Set<number>();
  for (const side of ['player', 'enemy'] as const) {
    const points = map.spawns[side];
    if (!Array.isArray(points) || points.length < 1 || points.length > (side === 'player' ? 8 : 16)) {
      throw new Error('玩家必须有 1–8 个出生点，敌方必须有 1–16 个出生点');
    }
    for (const point of points) {
      assertPoint(point, map.width, map.height);
      const key = point[1] * map.width + point[0];
      if (occupied.has(key)) throw new Error('出生点不能重叠');
      occupied.add(key);
    }
  }
  if (map.layout !== undefined && (typeof map.layout !== 'string' || !Object.hasOwn(LAYOUTS, map.layout))) throw new Error('未知地图布局');
  if (map.playerGroups !== undefined && (!Array.isArray(map.playerGroups)
    || map.playerGroups.length !== map.spawns.player.length
    || !map.playerGroups.every(group => Number.isInteger(group) && group >= 0 && group < 8))) throw new Error('玩家分组无效');
  if (map.objective?.kind !== 'seize') throw new Error('当前仅支持 seize 王座目标');
  assertPoint(map.objective.position, map.width, map.height);
  const [x, y] = map.objective.position;
  if (occupied.has(y * map.width + x)) throw new Error('目标不能与出生点重叠');
  if (map.tiles[y][x] !== 'throne') throw new Error('目标格必须为王座');
}

export interface Validation {
  valid: boolean;
  errors: string[];
  reachableCells: Partial<Record<Movement, number>>;
}

export function validateMap(value: unknown): Validation {
  const errors: string[] = [];
  const reachableCells: Validation['reachableCells'] = {};
  try {
    assertMap(value);
  } catch (error) {
    return { valid: false, errors: [(error as Error).message], reachableCells };
  }
  const map = value;
  const targets = [...map.spawns.player, ...map.spawns.enemy, map.objective.position];
  const spawnKeys = new Set(targets.slice(0, -1).map(([x, y]) => y * map.width + x));
  for (const movement of Object.keys(MOVEMENT) as Movement[]) {
    const seen = reachable(map.tiles, map.spawns.player[0], movement);
    reachableCells[movement] = seen.size;
    let total = 0;
    for (const row of map.tiles) for (const tile of row) if (canEnter(tile, movement)) total++;
    if (seen.size !== total) errors.push(`${movement}: 有 ${total - seen.size} 个可行走格与主区域断开`);
    for (const [x, y] of targets) {
      if (!seen.has(y * map.width + x)) errors.push(`${movement}: 出生点或目标 [${x},${y}] 不可达`);
    }
    for (const point of [...map.spawns.player, ...map.spawns.enemy]) {
      const hasExit = neighbors(point, map.width, map.height).some(([x, y]) =>
        canEnter(map.tiles[y][x], movement) && !spawnKeys.has(y * map.width + x));
      if (!hasExit) errors.push(`${movement}: 出生点 [${point}] 没有未占用的可移动邻格`);
    }
  }
  return { valid: errors.length === 0, errors, reachableCells };
}
