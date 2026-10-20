import { T, WORLD_H, WORLD_W, siteTile, worldMap } from './world-tiles.ts';
import type { WorldMap } from './world-tiles.ts';

// 世界地图的像素画（街机大地图风格）：每格 4×4 像素，整张图 960×640；地区地标是 16×16 像素的小图，
// 压在站点中央。纯函数，输出 RGBA 缓冲区，前端只负责放大显示和叠加状态（迷雾、旗帜、选中框）。
export const WORLD_TILE_PX = 4;
export const WORLD_ART_W = WORLD_W * WORLD_TILE_PX;
export const WORLD_ART_H = WORLD_H * WORLD_TILE_PX;
export const LANDMARK_PX = 16;

type Rgb = readonly [number, number, number];
const hex = (value: string): Rgb => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 144665, 2246822519) ^ Math.imul(salt + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 每种地形：调色（b 底、d 暗、l 亮、g 草底）和若干 4×4 图案，按格坐标哈希挑一个，细节像素不重复。
interface TileArt { colors: Record<string, Rgb>; patterns: { weight: number; rows: string[] }[] }
const PLAIN = ['bbbb', 'bbbb', 'bbbb', 'bbbb'];
const ART: Record<number, TileArt> = {
  [T.deep]: { colors: { b: hex('#1b3a6b'), d: hex('#152f58'), l: hex('#2c5594') }, patterns: [
    { weight: 6, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bllb', 'bbbb', 'bbbb'] }, { weight: 2, rows: ['bbbb', 'bbbb', 'blbb', 'bbbb'] }, { weight: 1, rows: ['bbbb', 'bddb', 'bbbb', 'bbbb'] }] },
  [T.shallow]: { colors: { b: hex('#2f6ab0'), d: hex('#285a98'), l: hex('#6aa7de') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bllb', 'bbbb', 'bbbb'] }, { weight: 2, rows: ['bbbb', 'bbbb', 'bbll', 'bbbb'] }, { weight: 1, rows: ['bbbb', 'bddb', 'bbbb', 'bbbb'] }] },
  [T.sand]: { colors: { b: hex('#d9c27a'), d: hex('#b9a05a'), l: hex('#ecd998') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bdbb', 'bbbb', 'bbbl'] }, { weight: 2, rows: ['lbbb', 'bbbb', 'bbdb', 'bbbb'] }] },
  [T.grass]: { colors: { b: hex('#4c9a3a'), d: hex('#3d7f30'), l: hex('#62b34a') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bdbb', 'bbbb', 'bbbb'] }, { weight: 2, rows: ['bbbb', 'bbbb', 'bblb', 'bbbb'] }, { weight: 1, rows: ['bbbb', 'bdbd', 'bbbb', 'lbbb'] }] },
  [T.forest]: { colors: { g: hex('#3d7f30'), b: hex('#2f6f2a'), d: hex('#1e4f1f'), l: hex('#4c9a3a'), t: hex('#5a3d22') }, patterns: [
    { weight: 3, rows: ['gddg', 'dldd', 'dddd', 'gtdg'] }, { weight: 2, rows: ['dgdg', 'dddd', 'bddb', 'gtgg'] }, { weight: 2, rows: ['gddg', 'ddld', 'bddd', 'gtgg'] }] },
  [T.hills]: { colors: { g: hex('#6f9a3e'), b: hex('#8da64a'), d: hex('#6e7f36'), l: hex('#aab868') }, patterns: [
    { weight: 3, rows: ['gggg', 'glbg', 'lbbd', 'bbdd'] }, { weight: 2, rows: ['gggg', 'gggg', 'lbbg', 'bbdd'] }, { weight: 1, rows: ['gggg', 'ggbg', 'gbbd', 'bbdd'] }] },
  [T.mountain]: { colors: { g: hex('#6e7482'), s: hex('#f0f4f8'), m: hex('#8a909c'), d: hex('#565b66'), b: hex('#6e7482') }, patterns: [
    { weight: 3, rows: ['gssg', 'gmsm', 'mmdm', 'dddd'] }, { weight: 2, rows: ['ggmg', 'gmmd', 'mmdd', 'dddd'] }, { weight: 1, rows: ['gsgg', 'msmg', 'mmdm', 'dddd'] }] },
  [T.snow]: { colors: { b: hex('#e8f0f8'), d: hex('#c4d4e6'), l: hex('#ffffff') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bdbb', 'bbbb', 'bbbl'] }, { weight: 2, rows: ['lbbb', 'bbbb', 'bbdb', 'bbbb'] }] },
  [T.desert]: { colors: { b: hex('#e0b860'), d: hex('#c99a42'), l: hex('#f0d080') }, patterns: [
    { weight: 4, rows: PLAIN }, { weight: 3, rows: ['bbbb', 'dddb', 'bbbb', 'bbbb'] }, { weight: 2, rows: ['bbbb', 'bbbb', 'lbbb', 'bddd'] }] },
  [T.ash]: { colors: { b: hex('#3a3030'), d: hex('#231c1c'), l: hex('#d4502a'), g: hex('#4a3e3e') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bgbb', 'bbbb', 'bbbg'] }, { weight: 1, rows: ['bbbb', 'bblb', 'bbdb', 'bbbb'] }, { weight: 1, rows: ['dbbb', 'bddb', 'bbbb', 'bbbb'] }] },
  [T.grave]: { colors: { b: hex('#54506a'), d: hex('#3c3850'), l: hex('#8a86a0') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'blbb', 'lllb', 'blbb'] }, { weight: 2, rows: ['bbbb', 'bbdb', 'bbbb', 'dbbb'] }] },
  [T.ruin]: { colors: { b: hex('#8a8478'), d: hex('#6c675c'), l: hex('#a39d90') }, patterns: [
    { weight: 4, rows: ['dddd', 'bbdb', 'dddd', 'dbbb'] }, { weight: 3, rows: ['bbbb', 'dddd', 'bbbl', 'dddd'] }, { weight: 1, rows: PLAIN }] },
  [T.road]: { colors: { b: hex('#a97c50'), d: hex('#8a6238'), l: hex('#c39a6b') }, patterns: [
    { weight: 5, rows: PLAIN }, { weight: 2, rows: ['bbbb', 'bdbb', 'bbbb', 'bbbl'] }, { weight: 2, rows: ['lbbb', 'bbbb', 'bbdb', 'bbbb'] }] },
  [T.bridge]: { colors: { b: hex('#9b6b3a'), d: hex('#6b4526'), l: hex('#c08a50') }, patterns: [
    { weight: 1, rows: ['dlld', 'bbbb', 'dlld', 'bbbb'] }] },
  [T.plaza]: { colors: { b: hex('#b8b0a0'), d: hex('#9a9284'), l: hex('#d4cdbd') }, patterns: [
    { weight: 3, rows: ['bbdb', 'bbbb', 'dbbb', 'bbbd'] }, { weight: 2, rows: ['bbbb', 'bdbb', 'bbbb', 'bbbl'] }] },
};

function pick(art: TileArt, x: number, y: number): string[] {
  const total = art.patterns.reduce((sum, p) => sum + p.weight, 0);
  let roll = hash(x, y, 7) * total;
  for (const pattern of art.patterns) { roll -= pattern.weight; if (roll < 0) return pattern.rows; }
  return art.patterns[0].rows;
}

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

function put(img: Pixels, x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
}

// 地标小图：16×16 的色块，用 rect/px 组合，坐标从左上角起算。
class Sprite {
  readonly cells = new Map<number, Rgb>();
  rect(x: number, y: number, w: number, h: number, c: Rgb): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < LANDMARK_PX && j < LANDMARK_PX) this.cells.set(j * LANDMARK_PX + i, c);
    return this;
  }
  px(x: number, y: number, c: Rgb): this { return this.rect(x, y, 1, 1, c); }
  // 等腰三角形（山、屋顶、金字塔）：顶点 (cx, top)，每行宽度加 2。
  tri(cx: number, top: number, rows: number, c: Rgb): this {
    for (let r = 0; r < rows; r++) this.rect(cx - r, top + r, 2 * r + 1, 1, c);
    return this;
  }
  // 外轮廓：给所有色块外侧一圈深色描边（不覆盖已有色块）。
  outline(c: Rgb): this {
    const base = [...this.cells.keys()];
    for (const k of base) {
      const x = k % LANDMARK_PX, y = Math.floor(k / LANDMARK_PX);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= LANDMARK_PX || ny >= LANDMARK_PX) continue;
        const nk = ny * LANDMARK_PX + nx;
        if (!this.cells.has(nk)) this.cells.set(nk, c);
      }
    }
    return this;
  }
}

const C = {
  ink: hex('#1a1420'), white: hex('#f6f2e8'), wall: hex('#d8d0c0'), wallD: hex('#a8a090'), red: hex('#c0392b'), redD: hex('#8e2a20'),
  blue: hex('#2f5da8'), blueD: hex('#1f3d78'), gold: hex('#e8c040'), green: hex('#4c9a3a'), greenD: hex('#2f6f2a'), trunk: hex('#6b4a2a'),
  stone: hex('#8a8f9a'), stoneD: hex('#5a5f6a'), sand: hex('#e0b860'), sandD: hex('#b08a3a'), lava: hex('#e8602a'), purple: hex('#7a5aa8'),
  purpleD: hex('#4a3478'), water: hex('#5fa8e0'), snow: hex('#f0f4f8'), door: hex('#3a2a1a'), plank: hex('#9b6b3a'), eye: hex('#ff4040'), dirt: hex('#a97c50'),
};

const LANDMARKS: Record<number, (s: Sprite) => Sprite> = {
  // 王都：三座塔楼的城堡，金色旗帜。
  0: s => s.rect(2, 8, 12, 6, C.wall).rect(2, 8, 12, 1, C.wallD).rect(1, 5, 4, 9, C.wall).rect(11, 5, 4, 9, C.wall).rect(6, 3, 4, 11, C.wall)
    .tri(2, 2, 3, C.blue).tri(12, 2, 3, C.blue).tri(7, 0, 3, C.blue).rect(7, 9, 2, 5, C.door).rect(3, 7, 1, 2, C.door).rect(12, 7, 1, 2, C.door)
    .px(7, 0, C.gold).px(2, 2, C.gold).px(12, 2, C.gold).outline(C.ink),
  // 1 奥伦平原：农舍、风车与麦垛。
  1: s => s.rect(2, 8, 7, 6, C.wall).tri(5, 3, 5, C.red).rect(4, 11, 2, 3, C.door).rect(7, 9, 1, 2, C.blueD)
    .rect(11, 5, 1, 9, C.trunk).rect(9, 7, 5, 1, C.wallD).rect(11, 3, 1, 5, C.wallD).rect(10, 11, 4, 3, C.sand).rect(10, 11, 4, 1, C.sandD).outline(C.ink),
  // 2 希尔瓦林地：巨树与树屋平台。
  2: s => s.rect(7, 9, 2, 5, C.trunk).rect(2, 2, 12, 7, C.green).rect(4, 1, 8, 2, C.green).rect(2, 6, 12, 2, C.greenD).rect(4, 9, 8, 1, C.plank)
    .rect(6, 6, 4, 3, C.plank).rect(7, 7, 2, 2, C.door).px(4, 3, C.gold).px(11, 4, C.gold).rect(1, 12, 3, 2, C.greenD).rect(12, 12, 3, 2, C.greenD).outline(C.ink),
  // 3 托尔加丘陵：矿洞口、支架与矿车。
  3: s => s.tri(8, 2, 8, C.stone).rect(0, 10, 16, 4, C.stone).rect(5, 8, 6, 6, C.stoneD).rect(6, 9, 4, 5, C.door).rect(5, 8, 1, 6, C.trunk).rect(10, 8, 1, 6, C.trunk).rect(5, 8, 6, 1, C.trunk)
    .rect(12, 12, 3, 2, C.red).px(12, 14, C.ink).px(14, 14, C.ink).outline(C.ink),
  // 4 瓦恩要塞：灰色方堡，垛口与红旗。
  4: s => s.rect(2, 6, 12, 8, C.stone).rect(2, 6, 12, 1, C.stoneD).rect(1, 4, 3, 10, C.stone).rect(12, 4, 3, 10, C.stone).rect(1, 3, 1, 1, C.stoneD).rect(3, 3, 1, 1, C.stoneD).rect(12, 3, 1, 1, C.stoneD).rect(14, 3, 1, 1, C.stoneD)
    .rect(6, 9, 4, 5, C.door).rect(7, 1, 1, 5, C.trunk).rect(8, 1, 3, 2, C.red).rect(2, 8, 1, 2, C.door).rect(13, 8, 1, 2, C.door).outline(C.ink),
  // 5 莱斯米尔湖镇：水中的码头与房屋。
  5: s => s.rect(0, 9, 16, 7, C.water).rect(1, 10, 14, 1, hex('#8cc4ee')).rect(2, 5, 5, 5, C.wall).tri(4, 2, 4, C.blue).rect(9, 6, 5, 4, C.wall).tri(11, 3, 4, C.red)
    .rect(1, 10, 14, 1, C.plank).rect(3, 8, 1, 2, C.door).rect(11, 8, 1, 2, C.door).rect(6, 11, 4, 1, C.plank).outline(C.ink),
  // 6 泽拉斯古都：断柱与紫色穹顶。
  6: s => s.rect(1, 12, 14, 2, C.wallD).rect(2, 6, 2, 6, C.wall).rect(6, 5, 2, 7, C.wall).rect(11, 7, 2, 5, C.wall).rect(2, 5, 2, 1, C.wallD).rect(6, 4, 2, 1, C.wallD)
    .rect(5, 9, 6, 3, C.purple).rect(6, 7, 4, 2, C.purple).rect(7, 6, 2, 1, C.purpleD).px(8, 5, C.gold).rect(11, 6, 2, 1, C.wallD).outline(C.ink),
  // 7 巴尔格山岭：兽骨洞窟。
  7: s => s.tri(8, 1, 9, C.stone).tri(4, 6, 4, C.stoneD).tri(8, 1, 3, C.snow).rect(0, 10, 16, 4, C.stone).rect(5, 8, 6, 6, C.door).rect(6, 7, 4, 1, C.door)
    .px(6, 9, C.white).px(9, 9, C.white).px(6, 9, C.eye).px(9, 9, C.eye).rect(7, 11, 2, 1, C.white).outline(C.ink),
  // 8 斯凯恩风崖：崖顶高塔与风旗。
  8: s => s.rect(0, 11, 16, 3, C.stoneD).rect(2, 9, 12, 3, C.stone).rect(6, 3, 4, 8, C.wall).rect(5, 2, 6, 2, C.wallD).tri(8, -1, 3, C.blue).rect(7, 6, 2, 3, C.door)
    .rect(10, 1, 4, 1, C.red).px(13, 2, C.red).rect(1, 9, 2, 3, C.stoneD).outline(C.ink),
  // 9 萨鲁恩荒原：沙下王城的金字塔与棕榈。
  9: s => s.tri(7, 2, 8, C.sand).rect(0, 10, 15, 4, C.sand).rect(7, 2, 1, 8, C.sandD).rect(5, 9, 5, 1, C.sandD).rect(6, 10, 2, 4, C.door)
    .rect(12, 7, 1, 6, C.trunk).rect(10, 6, 5, 1, C.greenD).rect(11, 5, 3, 1, C.green).px(10, 7, C.green).px(14, 7, C.green).outline(C.ink),
  // 10 德拉克莫龙谷：黑岩龙巢，熔岩与双角。
  10: s => s.rect(1, 9, 14, 5, C.stoneD).tri(8, 3, 7, C.stoneD).px(4, 5, C.stoneD).px(3, 4, C.stoneD).px(12, 5, C.stoneD).px(13, 4, C.stoneD).rect(3, 3, 1, 3, C.white).rect(12, 3, 1, 3, C.white)
    .rect(6, 8, 4, 6, C.door).rect(7, 10, 2, 4, C.lava).px(7, 7, C.eye).px(9, 7, C.eye).rect(2, 12, 2, 2, C.lava).rect(12, 12, 2, 2, C.lava).outline(C.ink),
  // 11 莫尔达王陵：拱门墓室与墓碑。
  11: s => s.rect(2, 6, 12, 8, C.stoneD).rect(1, 5, 14, 2, C.stone).rect(4, 9, 8, 5, C.door).rect(5, 8, 6, 1, C.door).rect(6, 7, 4, 1, C.door).rect(4, 4, 8, 1, C.stone).px(8, 3, C.purple).px(8, 2, C.purple)
    .rect(0, 11, 2, 3, C.stone).rect(14, 11, 2, 3, C.stone).px(0, 10, C.stone).px(1, 10, C.stone).px(7, 11, C.eye).px(9, 11, C.eye).outline(C.ink),
  // 12 赛勒斯汀之门：白色神殿与门廊。
  12: s => s.rect(1, 12, 14, 2, C.wallD).rect(2, 6, 2, 6, C.white).rect(6, 6, 2, 6, C.white).rect(8, 6, 2, 6, C.white).rect(12, 6, 2, 6, C.white).rect(1, 4, 14, 2, C.white).tri(8, 0, 4, C.white).rect(7, 9, 2, 3, C.gold)
    .rect(1, 6, 1, 6, C.snow).px(8, 2, C.gold).outline(C.ink),
};

export function paintWorld(map: WorldMap = worldMap()): Pixels {
  const img: Pixels = { width: WORLD_ART_W, height: WORLD_ART_H, data: new Uint8ClampedArray(WORLD_ART_W * WORLD_ART_H * 4) };
  const S = WORLD_TILE_PX;
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const terrain = map.tiles[ty * map.w + tx];
      const art = ART[terrain];
      const rows = pick(art, tx, ty);
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) put(img, tx * S + px, ty * S + py, art.colors[rows[py][px]]);
    }
  }
  for (const site of map.sites) {
    const sprite = LANDMARKS[site.id](new Sprite());
    const [cx, cy] = siteTile(site.id);
    const ox = cx * S + S / 2 - LANDMARK_PX / 2, oy = cy * S + S / 2 - LANDMARK_PX / 2;
    for (const [k, c] of sprite.cells) put(img, ox + (k % LANDMARK_PX), oy + Math.floor(k / LANDMARK_PX), c);
  }
  return img;
}

// 站点中心在整图像素坐标中的位置（前端叠加状态用）。
export function siteCenterPx(id: number): [number, number] {
  const [cx, cy] = siteTile(id);
  return [cx * WORLD_TILE_PX + WORLD_TILE_PX / 2, cy * WORLD_TILE_PX + WORLD_TILE_PX / 2];
}
