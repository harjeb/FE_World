// Terrain art at 16 px per tile: a port of the terrain half of design/pixel-art/gen_art.py, so maps
// without a PNG of their own (generated, quest, dungeon and classic maps) get the same pixel art.
// draw.test.ts renders every MAPS entry of gen_art.py and requires the committed PNGs pixel for
// pixel, so a change to one file needs the same change in the other. The painters draw from a port
// of Python's random generator (PyRandom), which is what makes that comparison possible.
import { nextU32, seedRng } from '../engine/rng.ts';
import { TERRAINS } from './map.ts';
import type { Terrain } from './map.ts';

export const TILE = 16;
type Rgba = readonly [number, number, number, number];

const C = (hex: string): Rgba => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const clamp = (v: number) => Math.max(0, Math.min(255, Math.trunc(v)));
const mix = (c: Rgba, k: number): Rgba => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), c[3]];

const GR = ['#7EA058', '#98B76A', '#668A48', '#567A3E'].map(C);
const FO = ['#2F5634', '#3F7042', '#5A8E4E', '#78A85E'].map(C);
const TRUNK = C('#5A3C26');
const RK = ['#C6BDAA', '#A39886', '#7E7466', '#5E564C'].map(C);
const WA = ['#3E6C94', '#4F80AA', '#78A6C8', '#BFD8E6'].map(C);
const SH = ['#6E9EB4', '#8EB8C8', '#C9B98E'].map(C);
const RD = ['#C6A97A', '#AE9064', '#D9C196', '#957A52'].map(C);
const WL = ['#B6B3AA', '#94918A', '#6E6C66', '#D2D0C8'].map(C);
const FL = ['#C2B8A2', '#A89E88', '#D4CBB6'].map(C);
const ROOF = ['#A0503E', '#7C3A2E', '#BC6A50'].map(C);
const WALLH = ['#E4D6B6', '#C4B492'].map(C);
const FLOWER = C('#EFE6C2');
const SNOW = C('#E2DCCC');
const DOOR = C('#3A2C22');
const GOLD = C('#D4AA52');
const OL = C('#2B2421');

const WATERY = 'wsb';
// Up, down, left, right: the order gen_art.py walks a tile's sides in, which fixes the random draws.
const SIDES = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
// Pixel k along the side (dx, dy) of a tile, d pixels in from the edge.
const edge = (dx: number, dy: number, k: number, d: number): [number, number] =>
  dy === -1 ? [k, d] : dy === 1 ? [k, 15 - d] : dx === -1 ? [d, k] : [15 - d, k];

// ---------------------------------------------------------------- Python's random.Random
// MT19937 seeded the way CPython seeds it from an integer (init_by_array over the integer's 32-bit
// words), with random() and randrange() drawing exactly as CPython 3.11 does. Seeds stay below 2^53.
class PyRandom {
  private readonly mt = new Uint32Array(624);
  private index = 624;

  constructor(seed: number) {
    const key = seed < 2 ** 32 ? [seed] : [seed % 2 ** 32, Math.floor(seed / 2 ** 32)];
    const mt = this.mt;
    mt[0] = 19650218;
    for (let i = 1; i < 624; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
    let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k > 0; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j;
      i++;
      j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k > 0; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  private next(): number {
    const mt = this.mt;
    if (this.index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = mt[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.next() >>> 5, b = this.next() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  // _randbelow_with_getrandbits: k = n.bit_length() bits at a time, retried until below n.
  randrange(start: number, stop: number): number {
    const n = stop - start, shift = Math.clz32(n);
    let r = this.next() >>> shift;
    while (r >= n) r = this.next() >>> shift;
    return start + r;
  }
}

// ---------------------------------------------------------------- tiles
class Pixels {
  readonly data: Uint8ClampedArray;
  private readonly width: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  get(x: number, y: number): Rgba {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  set(x: number, y: number, c: Rgba): void {
    this.data.set(c, (y * this.width + x) * 4);
  }
}

// The tile being painted: pixels in tile coordinates, the glyphs around it and its own random
// stream, seeded like gen_art.py's Ctx. Each tile draws from its own stream, so changing one tile
// (a destroyed wall) repaints only that tile and the edges of its neighbours.
class Tile {
  readonly rng: PyRandom;
  private readonly px: Pixels;
  private readonly rows: readonly string[];
  private readonly x: number;
  private readonly y: number;
  constructor(px: Pixels, rows: readonly string[], x: number, y: number, seed: number) {
    this.px = px;
    this.rows = rows;
    this.x = x;
    this.y = y;
    this.rng = new PyRandom(seed * 1000003 + x * 7919 + y * 104729);
  }
  // The glyph dx, dy tiles away; undefined off the map.
  nb(dx: number, dy: number): string | undefined {
    return this.rows[this.y + dy]?.[this.x + dx];
  }
  get(i: number, j: number): Rgba {
    return this.px.get(this.x * TILE + i, this.y * TILE + j);
  }
  set(i: number, j: number, c: Rgba): void {
    this.px.set(this.x * TILE + i, this.y * TILE + j, c);
  }
  fill(c: Rgba): void {
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) this.set(i, j, c);
  }
}

// ---------------------------------------------------------------- painters, one per glyph
function grass(t: Tile, flowers = true): void {
  const r = t.rng;
  t.fill(GR[0]);
  for (let n = 0; n < 14; n++) {
    const i = r.randrange(0, 16), j = r.randrange(0, 16);
    t.set(i, j, r.random() < 0.7 ? GR[2] : GR[1]);
  }
  // tufts
  for (let n = 0; n < 5; n++) {
    const i = r.randrange(1, 15), j = r.randrange(1, 14);
    t.set(i, j, GR[1]);
    t.set(i, j + 1, GR[2]);
    t.set(i - 1, j + 1, GR[3]);
    if (r.random() < 0.5) t.set(i + 1, j + 1, GR[2]);
  }
  if (flowers && r.random() < 0.18) {
    const i = r.randrange(2, 14), j = r.randrange(2, 14);
    t.set(i, j, FLOWER);
  }
}

// A round crown lit from the upper right, over its trunk and shadow.
function tree(t: Tile, cx: number, cy: number, rad: number): void {
  const r = t.rng;
  const inside = (x: number, y: number) => x >= 0 && x < TILE && y >= 0 && y < TILE;
  const whole = Math.trunc(rad);
  for (let j = -1; j < 3; j++) {
    for (let i = -whole; i <= whole; i++) {
      const x = cx + i, y = cy + whole + j;
      if (inside(x, y) && Math.abs(i) <= rad - j) t.set(x, y, mix(t.get(x, y), 0.78));
    }
  }
  for (let j = whole - 1; j < whole + 3; j++) {
    for (const i of [0, 1]) {
      const x = cx - 1 + i, y = cy + j;
      if (inside(x, y)) t.set(x, y, i === 0 ? TRUNK : mix(TRUNK, 1.25));
    }
  }
  const R = Math.ceil(rad);
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j * 1.05);
      if (d > rad) continue;
      const x = cx + i, y = cy + j;
      if (!inside(x, y)) continue;
      const lx = (i - j) / Math.max(rad, 1);
      let c = d > rad - 0.9 ? FO[0] : lx > 0.55 ? FO[3] : lx > 0.1 ? FO[2] : lx < -0.45 ? FO[0] : FO[1];
      if (c === FO[2] && r.random() < 0.18) c = FO[3];
      t.set(x, y, c);
    }
  }
}

const GROVES: (readonly [number, number, number])[][] = [
  [[5, 5, 4.6], [11, 6, 4.4], [8, 11, 4.6]], [[10, 5, 4.6], [4, 8, 4.6], [11, 11, 4.4]],
  [[8, 6, 5.6], [3, 11, 3.6], [13, 11, 3.6]], [[4, 5, 4.2], [11, 4, 4.2], [7, 10, 4.8]],
];
function forest(t: Tile): void {
  grass(t, false);
  for (const [cx, cy, rad] of GROVES[t.rng.randrange(0, GROVES.length)]) tree(t, cx, cy, rad);
}

function mountain(t: Tile): void {
  grass(t, false);
  const r = t.rng;
  const peaks: [number, number, number][] = r.random() < 0.6 ? [[8, 1, 14]] : [[5, 3, 10], [11, 1, 13]];
  for (const [apx, apy, baseW] of peaks) {
    for (let j = apy; j < 16; j++) {
      const half = (j - apy) * (baseW / 2) / (15 - apy) + 0.5;
      const ridge = apx + (j - apy) * 0.18;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(i - apx) > half) continue;
        let c = i < ridge - 0.5 ? ((i + j) % 5 ? RK[2] : RK[3]) : i > ridge + half * 0.45 ? RK[0] : RK[1];
        if (Math.abs(i - apx) > half - 1) c = RK[3];
        if (j <= apy + 2 && i >= ridge - 0.5) c = SNOW;
        t.set(i, j, c);
      }
    }
    // cracks on the shaded face
    for (let j = apy + 4; j < 16; j += 4) {
      for (let i = 0; i < 16; i++) {
        if (Math.abs(i - apx) <= (j - apy) * (baseW / 2) / (15 - apy) - 1 && i < apx + (j - apy) * 0.18 - 1 && r.random() < 0.6) {
          t.set(i, j, RK[3]);
        }
      }
    }
  }
}

function water(t: Tile, shallow = false): void {
  const r = t.rng;
  t.fill(shallow ? SH[0] : WA[1]);
  for (let n = 0; n < 10; n++) {
    const i = r.randrange(0, 16), j = r.randrange(0, 16);
    t.set(i, j, shallow ? SH[1] : WA[0]);
  }
  // ripples
  for (let n = 0; n < 3; n++) {
    const i = r.randrange(0, 13), j = r.randrange(1, 15);
    for (let k = 0; k < 3; k++) t.set(i + k, j, shallow ? SH[1] : WA[2]);
    t.set(i + 1, j + 1, shallow ? SH[0] : WA[0]);
  }
  if (shallow) {
    for (let n = 0; n < 8; n++) {
      const i = r.randrange(0, 16), j = r.randrange(0, 16);
      t.set(i, j, SH[2]);
    }
  }
  // foam along the shore
  for (const [dx, dy] of SIDES) {
    const n = t.nb(dx, dy);
    if (n === undefined || WATERY.includes(n)) continue;
    for (let k = 0; k < 16; k++) {
      if (r.random() < 0.15) continue;
      const [x, y] = edge(dx, dy, k, 0);
      t.set(x, y, WA[3]);
      if (r.random() < 0.5) t.set(x - dx, y - dy, WA[2]);
    }
  }
}

function road(t: Tile): void {
  const r = t.rng;
  t.fill(RD[0]);
  for (let n = 0; n < 14; n++) {
    const i = r.randrange(0, 16), j = r.randrange(0, 16);
    t.set(i, j, r.random() < 0.6 ? RD[1] : RD[2]);
  }
  // worn verges where the road meets anything but more road
  for (const [dx, dy] of SIDES) {
    const n = t.nb(dx, dy);
    if (n === undefined || 'rbF'.includes(n)) continue;
    for (let k = 0; k < 16; k++) {
      const depth = 1 + (r.random() < 0.35 ? 1 : 0);
      for (let d = 0; d < depth; d++) {
        const [x, y] = edge(dx, dy, k, d);
        t.set(x, y, d === 0 && depth === 2 ? GR[0] : RD[3]);
      }
    }
  }
}

// Drawn for travel west-east. A bridge with water beyond it to the west and east (looking past the
// rest of the bridge) but not to the north and south carries a north-south path and is drawn
// transposed: gen_art.py's maps only cross rivers west-east, generated maps cross them both ways.
function bridge(t: Tile): void {
  const r = t.rng;
  const wet = (dx: number, dy: number) => {
    let k = 1;
    while (t.nb(dx * k, dy * k) === 'b') k++;
    const n = t.nb(dx * k, dy * k);
    return n === 'w' || n === 's';
  };
  const vertical = wet(-1, 0) && wet(1, 0) && !(wet(0, -1) && wet(0, 1));
  const put = (i: number, j: number, c: Rgba) => vertical ? t.set(j, i, c) : t.set(i, j, c);
  t.fill(WL[0]);
  for (let j = 3; j < 13; j++) {
    for (let i = 0; i < 16; i++) {
      const off = Math.floor((j - 3) / 3) % 2 ? 2 : 0;
      if ((j - 3) % 3 === 2 || (i + off) % 5 === 4) put(i, j, WL[1]);
      else if (r.random() < 0.07) put(i, j, WL[3]);
    }
  }
  // parapets
  for (let i = 0; i < 16; i++) {
    put(i, 0, WL[3]);
    put(i, 1, i % 6 ? WL[3] : WL[0]);
    put(i, 2, WL[2]);
    put(i, 13, WL[3]);
    put(i, 14, i % 6 ? WL[3] : WL[0]);
    put(i, 15, WL[2]);
  }
  for (const j of [0, 1, 2, 13, 14, 15]) put(0, j, WL[1]);
}

function wall(t: Tile): void {
  const r = t.rng;
  t.fill(WL[0]);
  for (let j = 0; j < 16; j++) {
    const row = Math.floor(j / 4);
    for (let i = 0; i < 16; i++) {
      if (j % 4 === 3) t.set(i, j, WL[1]);
      else if ((i + (row % 2 ? 4 : 0)) % 8 === 7) t.set(i, j, WL[1]);
      else if (r.random() < 0.08) t.set(i, j, WL[3]);
    }
  }
  // battlements where the wall ends to the north, edges where it ends on the other sides
  if (t.nb(0, -1) !== '#') {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 16; i++) t.set(i, j, j < 3 ? WL[3] : WL[2]);
    for (let i = 0; i < 16; i += 4) t.set(i, 0, WL[0]);
  }
  if (t.nb(0, 1) !== '#') for (let i = 0; i < 16; i++) t.set(i, 15, WL[2]);
  const west = t.nb(-1, 0), east = t.nb(1, 0);
  if (west !== '#' && west !== undefined) for (let j = 0; j < 16; j++) t.set(0, j, WL[2]);
  if (east !== '#' && east !== undefined) for (let j = 0; j < 16; j++) t.set(15, j, WL[1]);
}

function floor(t: Tile): void {
  const r = t.rng;
  t.fill(FL[0]);
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const off = Math.floor(j / 8) % 2 ? 4 : 0;
      if (j % 8 === 7 || (i + off) % 8 === 7) t.set(i, j, FL[1]);
      else if (r.random() < 0.06) t.set(i, j, FL[2]);
    }
  }
}

function fort(t: Tile): void {
  const west = t.nb(-1, 0);
  if (west === 'p' || west === '#') floor(t);
  else grass(t, false);
  for (let j = 4; j < 16; j++) for (let i = 2; i < 14; i++) t.set(i, j, j % 4 === 3 || i <= 4 ? WL[1] : WL[0]);
  for (let i = 2; i < 14; i++) {
    t.set(i, 4, WL[3]);
    t.set(i, 5, WL[2]);
  }
  for (let i = 2; i < 14; i += 3) {
    t.set(i, 3, WL[3]);
    t.set(i + 1, 3, WL[3]);
  }
  // gate, flag, window
  for (let j = 10; j < 16; j++) for (let i = 6; i < 10; i++) if (j > 10 || i === 7 || i === 8) t.set(i, j, DOOR);
  for (let j = 0; j < 4; j++) t.set(12, j, TRUNK);
  for (const [i, j] of [[13, 0], [14, 0], [13, 1], [14, 1], [15, 1]]) t.set(i, j, GOLD);
  t.set(7, 7, DOOR);
  t.set(8, 7, DOOR);
}

function village(t: Tile): void {
  grass(t, false);
  for (let j = 9; j < 15; j++) for (let i = 3; i < 13; i++) t.set(i, j, i > 4 ? WALLH[0] : WALLH[1]);
  // roof
  for (let j = 3; j < 10; j++) {
    const w = j - 3;
    for (let i = 6 - w; i < 10 + w; i++) {
      if (i < 1 || i > 14) continue;
      let c = i < 8 - Math.floor(w / 2) || j === 9 ? ROOF[1] : ROOF[0];
      if ((i + j) % 4 === 0 && c === ROOF[0]) c = ROOF[2];
      t.set(i, j, c);
    }
  }
  // door, window, chimney, shadow
  for (let j = 11; j < 15; j++) {
    t.set(7, j, TRUNK);
    t.set(8, j, TRUNK);
  }
  t.set(10, 11, C('#34556B'));
  t.set(11, 11, C('#34556B'));
  t.set(10, 12, C('#34556B'));
  t.set(11, 12, C('#5A7E98'));
  for (let j = 1; j < 5; j++) t.set(11, j, WL[1]);
  for (let i = 1; i < 15; i++) t.set(i, 15, mix(GR[0], 0.8));
}

// gen_art.py's THRONE sprite in its BASE palette, outlined like its outline().
const THRONE = [
  '................',
  '.......dy.......',
  '.....dyyyyy.....',
  '.....yttttY.....',
  '.....yttttY.....',
  '.....ytTTtY.....',
  '.....yttttY.....',
  '.....yttttY.....',
  '...dyyyyyyyyY...',
  '...yttttttttY...',
  '...YYYYYYYYYY...',
  '...YY......YY...',
  '................',
  '................',
  '................',
  '................',
];
const THRONE_PALETTE: Record<string, Rgba> = { d: C('#DDB868'), y: C('#D4AA52'), t: C('#A2423A'), T: C('#6A2A24'), Y: C('#8E6C2E') };
const inChair = (x: number, y: number) => (THRONE[y]?.[x] ?? '.') !== '.';
const CHAIR = THRONE.map((row, y) => [...row].map((ch, x) => inChair(x, y) ? THRONE_PALETTE[ch]
  : SIDES.some(([dx, dy]) => inChair(x + dx, y + dy)) ? OL : undefined));

function throne(t: Tile): void {
  floor(t);
  for (let j = 12; j < 16; j++) for (let i = 1; i < 15; i++) t.set(i, j, j === 12 ? FL[2] : FL[1]);
  CHAIR.forEach((row, j) => row.forEach((c, i) => { if (c) t.set(i, j, c); }));
}

// Glyphs follow the terrain table in map.ts.
const PAINTERS: Record<string, (t: Tile) => void> = {
  '.': t => grass(t), f: forest, m: mountain, w: t => water(t), s: t => water(t, true),
  r: road, b: bridge, '#': wall, p: floor, F: fort, v: village, T: throne,
};

// ---------------------------------------------------------------- maps
// RGBA pixels of a map given as glyph rows, TILE px per tile; gen_art.py's render_map().
export function drawMap(rows: readonly string[], seed: number): Uint8ClampedArray {
  const w = rows[0].length, h = rows.length;
  const px = new Pixels(w * TILE, h * TILE);
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`map row ${y} has ${rows[y].length} tiles, not ${w}`);
    for (let x = 0; x < w; x++) {
      const paint = PAINTERS[rows[y][x]];
      if (!paint) throw new Error(`no painter for terrain glyph ${rows[y][x]}`);
      paint(new Tile(px, rows, x, y, seed));
    }
  }
  const shade = (x: number, y: number, k: number) => px.set(x, y, mix(px.get(x, y), k));
  // walls and forts shade the top of the tile south of them
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!'#F'.includes(rows[y - 1][x]) || '#F'.includes(rows[y][x])) continue;
      for (let j = 0; j < 3; j++) for (let i = 0; i < TILE; i++) shade(x * TILE + i, y * TILE + j, 0.8 + j * 0.06);
    }
  }
  // land darkens along the sides where it meets water
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (WATERY.includes(rows[y][x])) continue;
      for (const [dx, dy] of SIDES) {
        const n = rows[y + dy]?.[x + dx];
        if (n !== 'w' && n !== 's') continue;
        for (let k = 0; k < TILE; k++) {
          const [i, j] = edge(dx, dy, k, 0);
          shade(x * TILE + i, y * TILE + j, 0.72);
        }
      }
    }
  }
  return px.data;
}

// A battle map's tiles as the glyph rows drawMap reads.
export const glyphRows = (tiles: readonly (readonly Terrain[])[]): string[] => tiles.map(row => row.map(tile => TERRAINS[tile].glyph).join(''));

// gen_art.py picks each map's seed by hand; other maps take theirs from their name, so a map looks
// the same on every visit and in its replays.
export const mapSeed = (name: string): number => nextU32(seedRng(`map:${name}`));
