import {
  assertDimension, canEnter, reachable, validateMap,
} from './map.ts';
import type { BattleMap, Movement, Point, Terrain } from './map.ts';
import { generateTerrain, THEMES } from './themes.ts';
import type { Theme } from './themes.ts';

export interface GenerateOptions {
  seed: string;
  width?: number;
  height?: number;
  unitsPerSide?: number;
  theme?: Theme;
}

// Local, versioned map RNG; this does not select the battle engine's RNG.
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(options: GenerateOptions): BattleMap {
  const { seed, width = 20, height = 20, unitsPerSide = 6, theme = 'grassland' } = options;
  assertDimension(width, 'width');
  assertDimension(height, 'height');
  if (typeof seed !== 'string' || seed.length < 1 || seed.length > 200) {
    throw new Error('seed 必须是 1–200 字符的字符串');
  }
  if (!Number.isInteger(unitsPerSide) || unitsPerSide < 1 || unitsPerSide > 8) {
    throw new Error('unitsPerSide 必须是 1–8 的整数');
  }
  if (typeof theme !== 'string' || !Object.hasOwn(THEMES, theme)) throw new Error('未知地图主题');
  const random = seededRandom(seed);
  const integer = (limit: number) => Math.floor(random() * limit);
  const tiles = generateTerrain(width, height, theme, random);
  const ground: Terrain = THEMES[theme].ground;
  const paint = (x: number, y: number, tile: Terrain) => {
    if (x >= 0 && y >= 0 && x < width && y < height) tiles[y][x] = tile;
  };
  // Roads and bridges already admit every movement type, so clearing keeps them.
  const clear = (x: number, y: number) => {
    const tile = tiles[y]?.[x];
    if (tile !== 'road' && tile !== 'bridge') paint(x, y, ground);
  };
  // Paths also cross water or shallows on new bridges.
  const open = (x: number, y: number) => {
    const tile = tiles[y]?.[x];
    if (tile === 'water' || tile === 'shallows') paint(x, y, 'bridge');
    else clear(x, y);
  };

  const player: Point[] = [], enemy: Point[] = [];
  for (let i = 0; i < unitsPerSide; i++) {
    const y = Math.floor((i + 1) * (height - 1) / (unitsPerSide + 1));
    player.push([1, y]);
    enemy.push([width - 2, height - 1 - y]);
  }
  const objective: Point = [width - 3, Math.floor(height / 2)];
  for (const [x, y] of [...player, ...enemy, objective]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clear(x + dx, y + dy);
  }

  function carve(from: Point, to: Point, wide = false) {
    let [x, y] = from;
    const horizontalFirst = random() < 0.5;
    const step = () => {
      open(x, y);
      if (wide) open(x, y + 1);
    };
    step();
    for (const horizontal of [horizontalFirst, !horizontalFirst]) {
      while (horizontal ? x !== to[0] : y !== to[1]) {
        if (horizontal) x += Math.sign(to[0] - x);
        else y += Math.sign(to[1] - y);
        step();
      }
    }
  }
  const root = player[0];
  const waypoint: Point = [Math.floor(width / 2), 1 + integer(height - 2)];
  carve(root, waypoint, true);
  carve(waypoint, objective, true);

  // Join islands to the common ground network, so repairs never strand another class.
  for (const movement of ['armored', 'foot', 'mounted', 'flying'] as Movement[]) {
    while (true) {
      const seen = reachable(tiles, root, movement);
      let orphan: Point | undefined;
      for (let y = 0; y < height && !orphan; y++) {
        for (let x = 0; x < width; x++) {
          if (canEnter(tiles[y][x], movement) && !seen.has(y * width + x)) {
            orphan = [x, y];
            break;
          }
        }
      }
      if (!orphan) break;
      const ground = reachable(tiles, root, 'armored');
      let closest = root, distance = Infinity;
      for (const key of ground) {
        const point: Point = [key % width, Math.floor(key / width)];
        const d = Math.abs(point[0] - orphan[0]) + Math.abs(point[1] - orphan[1]);
        if (d < distance) { closest = point; distance = d; }
      }
      carve(closest, orphan);
    }
  }
  tiles[objective[1]][objective[0]] = 'throne';
  const map: BattleMap = {
    generatorVersion: 3, seed, theme, width, height, tiles,
    spawns: { player, enemy }, objective: { kind: 'seize', position: objective },
  };
  const validation = validateMap(map);
  if (!validation.valid) throw new Error(`生成失败：${validation.errors.join('; ')}`);
  return map;
}
