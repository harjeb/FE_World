import { POSITIONS, WORLD_EDGES } from '../game/region-map.ts';

// 十二地区世界地图的格子数据（像素图用）：240×160 格，确定性生成，只依赖固定种子。
// 地形由噪声决定，再按各地区的主题改写地貌；王都在正中，十二个地区的位置沿用设计图（POSITIONS），
// 道路按 WORLD_EDGES 连接，跨水处自动架桥。前端按这份格子数据画像素图，战斗地图不使用它。
export const WORLD_W = 240;
export const WORLD_H = 160;
export const WORLD_SEED = 'agent-tactics-world-v1';

export const T = {
  deep: 0, shallow: 1, sand: 2, grass: 3, forest: 4, hills: 5, mountain: 6, snow: 7,
  desert: 8, ash: 9, grave: 10, ruin: 11, road: 12, bridge: 13, plaza: 14,
} as const;
export type WorldTerrain = typeof T[keyof typeof T];

export interface WorldSite { id: number; x: number; y: number }
export interface WorldMap { w: number; h: number; tiles: Uint8Array; sites: WorldSite[]; roads: { from: number; to: number; path: [number, number][] }[] }

// 各地区主题：影响站点周围的地貌（docs/00 §8.1.1 表）。
export const REGION_BIOME: Record<number, WorldTerrain> = {
  1: T.grass, 2: T.forest, 3: T.hills, 4: T.hills, 5: T.shallow, 6: T.ruin,
  7: T.mountain, 8: T.mountain, 9: T.desert, 10: T.ash, 11: T.grave, 12: T.snow,
};

function hash(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return (h >>> 0) / 4294967296;
}
const seedNumber = (() => { let n = 0; for (const c of WORLD_SEED) n = (Math.imul(n, 31) + c.charCodeAt(0)) | 0; return n; })();

function smooth(t: number): number { return t * t * (3 - 2 * t); }

function valueNoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash(seedNumber, salt, x0, y0), b = hash(seedNumber, salt, x0 + 1, y0);
  const c = hash(seedNumber, salt, x0, y0 + 1), d = hash(seedNumber, salt, x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function fbm(x: number, y: number, salt: number): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += valueNoise(x * freq, y * freq, salt + octave) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function siteTile(id: number): [number, number] {
  if (id === 0) return [WORLD_W / 2, WORLD_H / 2];
  const [px, py] = POSITIONS[id];
  return [Math.round(px * (WORLD_W - 1) / 100), Math.round(py * (WORLD_H - 1) / 100)];
}

export const isWater = (t: number): boolean => t === T.deep || t === T.shallow;
export const isLand = (t: number): boolean => !isWater(t);

// 站点周围的地貌半径（格）和保证为陆地的半径。
const BIOME_RADIUS = 20;
const LAND_RADIUS = 11;

export function generateWorld(): WorldMap {
  const w = WORLD_W, h = WORLD_H;
  const tiles = new Uint8Array(w * h);
  const sites: WorldSite[] = [0, ...Array.from({ length: 12 }, (_, i) => i + 1)].map(id => { const [x, y] = siteTile(id); return { id, x, y }; });
  const nearest = (x: number, y: number) => {
    let best = sites[0], bestD = Infinity;
    for (const s of sites) {
      const d = Math.hypot(s.x - x, (s.y - y) * 1.2);
      if (d < bestD) { best = s; bestD = d; }
    }
    return { site: best, dist: bestD };
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 大陆轮廓：椭圆距离加噪声，边缘是海。
      const dx = (x - w / 2) / (w * 0.5), dy = (y - h / 2) / (h * 0.5);
      const edge = 1 - Math.pow(Math.hypot(dx, dy), 2.4);
      const elevation = fbm(x / 22, y / 22, 1) * 0.75 + edge * 0.55 - 0.18;
      const moisture = fbm(x / 28, y / 28, 9);
      const { site, dist } = nearest(x, y);
      let land = elevation;
      if (dist < LAND_RADIUS) land = Math.max(land, 0.5);
      let terrain: WorldTerrain;
      if (land < 0.28) terrain = T.deep;
      else if (land < 0.38) terrain = T.shallow;
      else if (land < 0.42) terrain = T.sand;
      else if (land > 0.78) terrain = moisture > 0.55 ? T.snow : T.mountain;
      else if (land > 0.66) terrain = T.hills;
      else terrain = moisture > 0.58 ? T.forest : T.grass;

      // 地区主题：站点附近改写地貌，噪声让边界不规则。
      if (site.id > 0 && dist < BIOME_RADIUS) {
        const biome = REGION_BIOME[site.id];
        const reach = 1 - dist / BIOME_RADIUS + (fbm(x / 6, y / 6, 21) - 0.5) * 0.9;
        if (reach > 0.28 && dist >= LAND_RADIUS * 0.55 - (biome === T.shallow ? 0 : 99)) {
          if (biome === T.shallow) terrain = dist > 5 && dist < 11 + fbm(x / 5, y / 5, 33) * 4 ? T.shallow : T.grass;
          else if (biome === T.mountain || biome === T.snow) terrain = reach > 0.55 ? biome : T.hills;
          else terrain = reach > 0.4 || biome === T.grass ? biome : (biome === T.forest ? T.grass : T.sand);
        }
        // 大湖的中心留给水，站点本身仍在岸上。
        if (biome === T.shallow && dist < 4.5) terrain = T.grass;
      }
      if (dist < 3.2 && site.id >= 0) terrain = T.plaza;
      tiles[y * w + x] = terrain;
    }
  }

  // 道路：沿连线蜿蜒前进，路面为土路，跨水架桥，翻山保留山口。
  const roads: WorldMap['roads'] = [];
  for (const [a, b] of WORLD_EDGES) {
    const [ax, ay] = siteTile(a), [bx, by] = siteTile(b);
    const length = Math.hypot(bx - ax, by - ay);
    const path: [number, number][] = [];
    const steps = Math.ceil(length * 1.5);
    const salt = a * 31 + b;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bend = Math.sin(t * Math.PI) * (fbm(t * 6, salt, 41) - 0.5) * Math.min(18, length * 0.4);
      const nx = -(by - ay) / length, ny = (bx - ax) / length;
      const x = Math.round(ax + (bx - ax) * t + nx * bend), y = Math.round(ay + (by - ay) * t + ny * bend);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (path.length === 0 || path[path.length - 1][0] !== x || path[path.length - 1][1] !== y) path.push([x, y]);
    }
    // 逐格补齐，保证四邻接连通：先横后竖，相邻采样点之间不留空洞。
    const full: [number, number][] = [];
    const push = (x: number, y: number) => {
      const last = full[full.length - 1];
      if (!last || last[0] !== x || last[1] !== y) full.push([x, y]);
    };
    for (const [x, y] of path) {
      const last = full[full.length - 1];
      if (!last) { push(x, y); continue; }
      let cx = last[0], cy = last[1];
      while (cx !== x) { cx += Math.sign(x - cx); push(cx, cy); }
      while (cy !== y) { cy += Math.sign(y - cy); push(cx, cy); }
    }
    for (const [x, y] of full) {
      const i = y * w + x;
      const t = tiles[i];
      if (t === T.plaza) continue;
      tiles[i] = isWater(t) ? T.bridge : T.road;
    }
    roads.push({ from: a, to: b, path: full });
  }
  return { w, h, tiles, sites, roads };
}

// 地形是否可通行（道路可达性检查用）：深水不可通行，桥可以。
export const walkable = (t: number): boolean => t !== T.deep && t !== T.shallow;

let cached: WorldMap | null = null;
export function worldMap(): WorldMap {
  cached ??= generateWorld();
  return cached;
}
