// 32x32 portraits assembled from parts: a port of the portrait half of design/pixel-art/gen_art.py,
// so the game can draw faces that have no hand-made PNG (random recruits, generic enemies).
// portraits.test.ts renders every PORTRAITS entry of gen_art.py and requires the committed PNGs
// pixel for pixel, so a change to one file needs the same change in the other.

export type Rgba = readonly [number, number, number, number];
export const SIZE = 32;

export const FACE_IDS = ['oval', 'sharp', 'round', 'standard', 'square', 'long', 'broad'] as const;
export const HAIR_STYLE_IDS = ['ponytail', 'spiky', 'slick', 'bob', 'long', 'neat', 'bald', 'wild', 'braid', 'swept', 'helm', 'hood'] as const;
export const OUTFIT_IDS = ['tunic', 'vest', 'armor', 'light', 'cloak', 'robe', 'priest', 'plate', 'scarf', 'fur'] as const;
export const ACCESSORY_IDS = ['headband', 'bandana', 'circlet', 'mustache', 'glasses', 'beard', 'scar', 'scar_near', 'scarf', 'hood', 'helm'] as const;
export type FaceId = (typeof FACE_IDS)[number];
export type HairStyle = (typeof HAIR_STYLE_IDS)[number];
export type Outfit = (typeof OUTFIT_IDS)[number];
export type Accessory = (typeof ACCESSORY_IDS)[number];
export type EyeStyle = 'big' | 'narrow' | 'calm';
export type BrowStyle = 'soft' | 'stern' | 'heavy';
export type Mouth = 'neutral' | 'smile' | 'grim' | 'grin' | 'smirk';

// Same keys as the gen_art.py PORTRAITS dicts. Colors are '#RRGGBB'.
export interface PortraitSpec {
  skin: [string, string]; // base, shade
  hair: [string, string, string]; // base, light, dark
  eye: [string, string]; // iris, dark
  style: HairStyle;
  outfit: Outfit;
  colors: [string, string, string, string]; // cloth base, shade, light, trim
  face?: FaceId; // default: oval when fem, otherwise standard
  eyes?: EyeStyle;
  brows?: BrowStyle;
  mouth?: Mouth;
  acc?: Accessory; // drawn first, then extra in order
  extra?: Accessory[];
  band?: [string, string]; // headband / bandana
  stole?: string; // priest
  brow?: string; // default: darkest hair color
  lid?: string;
  fem?: boolean; // big eyes get lashes
  blush?: boolean;
}

const C = (hex: string): Rgba => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const clamp = (v: number) => Math.max(0, Math.min(255, Math.trunc(v)));
const mix = (c: Rgba, k: number): Rgba => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), c[3]];
const same = (a: Rgba | undefined, b: Rgba) => !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

const OL = C('#2B2421');
const SCLERA = C('#FAF6EC');
const MOUTH = C('#9A4C44');

// Pixel sets are keyed y * 64 + x; every coordinate the parts use lies inside the 32x32 frame.
type Cells = Set<number>;
type Span = readonly [number, number];
const key = (x: number, y: number) => y * 64 + x;
const xy = (k: number): [number, number] => [k % 64, Math.floor(k / 64)];

function spans(rows: Record<number, Span>): Cells {
  const s: Cells = new Set();
  for (const [y, [l, r]] of Object.entries(rows)) for (let x = l; x <= r; x++) s.add(key(x, Number(y)));
  return s;
}
function rect(x0: number, x1: number, y0: number, y1: number): Cells {
  const s: Cells = new Set();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.add(key(x, y));
  return s;
}
function union(...sets: Cells[]): Cells {
  const s: Cells = new Set();
  for (const set of sets) for (const k of set) s.add(k);
  return s;
}
const where = (s: Cells, keep: (x: number, y: number) => boolean): Cells => new Set([...s].filter(k => keep(...xy(k))));

class Pixels {
  readonly px: (Rgba | undefined)[] = new Array(SIZE * SIZE);
  get(x: number, y: number): Rgba | undefined {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE ? this.px[y * SIZE + x] : undefined;
  }
  set(x: number, y: number, c: Rgba): void {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) this.px[y * SIZE + x] = c;
  }
}

// ---------------------------------------------------------------- heads
// (left, right) column spans per row, three-quarter view facing right. All faces share the cranium,
// so every hair style and headband fits every face; they differ from the cheeks down.
interface Face { head: Map<number, Span>; cells: Cells; neck: Span }

const CRANIUM: Record<number, Span> = {
  5: [13, 18], 6: [12, 19], 7: [10, 21], 8: [9, 22], 9: [8, 23], 10: [8, 23], 11: [8, 23], 12: [8, 23], 13: [8, 23], 14: [8, 23],
};
function face(lower: Record<number, Span>, neck: Span = [13, 18]): Face {
  const rows = { ...CRANIUM, ...lower };
  return { head: new Map(Object.entries(rows).map(([y, s]) => [Number(y), s])), cells: spans(rows), neck };
}

const FACES: Record<FaceId, Face> = {
  // female: small chin, slim neck
  oval: face({ 15: [8, 23], 16: [8, 22], 17: [9, 22], 18: [10, 22], 19: [11, 21], 20: [13, 21], 21: [15, 20], 22: [17, 19] }, [14, 18]),
  sharp: face({ 15: [8, 23], 16: [8, 22], 17: [9, 22], 18: [10, 22], 19: [11, 21], 20: [12, 21], 21: [14, 20], 22: [16, 19], 23: [17, 18] }, [14, 18]),
  round: face({ 15: [8, 23], 16: [8, 23], 17: [9, 23], 18: [10, 22], 19: [11, 22], 20: [12, 21], 21: [14, 20] }, [14, 18]),
  // male: broader jaw
  standard: face({ 15: [8, 23], 16: [8, 23], 17: [9, 23], 18: [10, 23], 19: [11, 22], 20: [12, 22], 21: [14, 21], 22: [16, 20] }),
  square: face({ 15: [8, 23], 16: [8, 23], 17: [8, 23], 18: [9, 23], 19: [9, 23], 20: [10, 23], 21: [12, 22], 22: [14, 22] }),
  long: face({ 15: [8, 23], 16: [8, 22], 17: [9, 22], 18: [9, 22], 19: [10, 22], 20: [11, 22], 21: [12, 21], 22: [14, 21], 23: [16, 20] }),
  broad: face({ 15: [8, 23], 16: [8, 23], 17: [8, 24], 18: [8, 24], 19: [8, 24], 20: [9, 23], 21: [10, 23], 22: [12, 22], 23: [14, 21] }, [12, 19]),
};

export const faceOf = (sp: PortraitSpec): FaceId => sp.face ?? (sp.fem ? 'oval' : 'standard');

// Hair and headbands only touch the shared cranium, so they draw against the standard head.
const HEADSET = FACES.standard.cells;
const SHOULDER: Record<number, Span> = { 24: [11, 20], 25: [8, 23], 26: [6, 25], 27: [4, 27], 28: [3, 28], 29: [2, 29], 30: [1, 30], 31: [1, 30] };
const SHOULDERSET = spans(SHOULDER);

const vneck = (x: number, y: number, depth: number) => y < 24 + depth && Math.abs(x - 15.5) <= (24 + depth - y) * 0.9;

// ---------------------------------------------------------------- hair: [front, back]
const crown = () => union(where(HEADSET, (_, y) => y <= 9), rect(14, 17, 4, 4));
function bangs(bottom: Record<number, number>): Cells {
  const s: Cells = new Set();
  for (const [x, yb] of Object.entries(bottom)) for (let y = 10; y <= yb; y++) s.add(key(Number(x), y));
  return s;
}
function zigzagTop(apexes: [number, number][], x0: number, x1: number, ybot: number): Cells {
  const s: Cells = new Set();
  for (let x = x0; x <= x1; x++) {
    const top = Math.min(...apexes.map(([ax, ay]) => ay + Math.abs(x - ax)));
    for (let y = top; y <= ybot; y++) s.add(key(x, y));
  }
  return s;
}

type Hair = [Cells, Cells];
const NONE: Cells = new Set();
const neat = (): Hair => [union(crown(), bangs({ 9: 12, 10: 11, 11: 11, 12: 11, 13: 11, 14: 10, 15: 10, 16: 10, 17: 10, 18: 10 }),
  rect(7, 10, 10, 13), new Set([key(22, 10), key(23, 10), key(23, 11)])), NONE];

const HAIR_STYLES: Record<HairStyle, () => Hair> = {
  ponytail: () => [
    union(crown(), bangs({ 9: 12, 10: 12, 11: 11, 12: 11, 13: 10, 14: 11, 15: 12, 16: 11, 17: 10, 18: 11, 19: 10, 20: 11, 21: 12, 22: 12, 23: 13 }), rect(7, 10, 10, 12)),
    spans({ 7: [6, 9], 8: [5, 9], 9: [4, 8], 10: [3, 8], 11: [3, 7], 12: [2, 7], 13: [2, 6], 14: [2, 6], 15: [2, 6], 16: [2, 6], 17: [3, 6], 18: [3, 6], 19: [3, 5], 20: [4, 5], 21: [4, 5], 22: [4, 4] }),
  ],
  spiky: () => {
    const mask = union(HEADSET, rect(7, 24, 1, 9));
    const top = where(zigzagTop([[9, 6], [11, 3], [14, 2], [17, 3], [20, 2], [23, 5]], 8, 23, 9), (x, y) => mask.has(key(x, y)));
    return [union(top, bangs({ 9: 12, 10: 11, 11: 12, 12: 11, 13: 12, 14: 11, 15: 10, 16: 12, 17: 11, 18: 10, 19: 11, 20: 12, 21: 11, 22: 12, 23: 12 }), rect(7, 9, 10, 12)), NONE];
  },
  slick: () => [union(where(HEADSET, (_, y) => y <= 8), rect(14, 17, 4, 4), where(HEADSET, (x, y) => x <= 10 && y <= 15), rect(8, 12, 9, 9), rect(19, 23, 9, 9)), NONE],
  bob: () => [
    union(crown(), bangs({ 9: 12, 10: 12, 11: 11, 12: 11, 13: 10, 14: 11, 15: 11, 16: 10, 17: 11, 18: 11, 19: 10, 20: 11, 21: 12, 22: 13, 23: 14 }),
      rect(7, 10, 10, 19), rect(22, 23, 10, 17), rect(8, 10, 20, 20)),
    rect(7, 9, 17, 21),
  ],
  long: () => [
    union(crown(), bangs({ 9: 12, 10: 12, 11: 11, 12: 11, 13: 11, 14: 10, 15: 9, 16: 10, 17: 11, 18: 11, 19: 11, 20: 12, 21: 12, 22: 13, 23: 14 }),
      rect(6, 10, 10, 22), rect(22, 24, 10, 20)),
    union(rect(4, 10, 18, 30), rect(21, 27, 19, 30)),
  ],
  neat,
  bald: () => [where(HEADSET, (x, y) => x <= 10 && y >= 9 && y <= 13), NONE],
  wild: () => {
    const front = union(zigzagTop([[8, 5], [10, 2], [13, 3], [16, 1], [19, 3], [22, 2], [24, 6]], 7, 24, 9),
      bangs({ 9: 13, 10: 12, 11: 11, 12: 12, 13: 11, 14: 10, 15: 12, 16: 11, 17: 10, 18: 11, 19: 12, 20: 10, 21: 11, 22: 13, 23: 13 }), rect(7, 10, 10, 13));
    const reach = [3, 2, 2, 1, 2, 3, 2, 1, 2, 3, 3, 2, 3, 4, 4, 5, 6, 7];
    const back: Cells = new Set();
    for (let y = 5; y <= 22; y++) for (let x = reach[y - 5]; x <= 9; x++) back.add(key(x, y));
    return [front, back];
  },
  braid: () => {
    const braid: Cells = new Set();
    for (let y = 14; y <= 30; y++) {
      const [x0, w] = y < 18 ? [22, 2] : [21, 3];
      for (let x = x0; x < x0 + w; x++) braid.add(key(x, y));
    }
    return [union(crown(), bangs({ 9: 12, 10: 11, 11: 12, 12: 11, 13: 10, 14: 11, 15: 11, 16: 10, 17: 11, 18: 12, 19: 11, 20: 10, 21: 11, 22: 12, 23: 13 }), rect(7, 10, 10, 13), braid), NONE];
  },
  swept: () => [union(crown(), bangs({ 9: 13, 10: 13, 11: 13, 12: 13, 13: 12, 14: 12, 15: 11, 16: 11, 17: 10, 18: 10, 19: 10, 20: 11, 21: 11, 22: 12, 23: 12 }), rect(7, 10, 10, 14)), NONE],
  helm: () => [NONE, NONE],
  hood: neat,
};

// ---------------------------------------------------------------- outfits
type Cloth = [Rgba, Rgba, Rgba, Rgba];
const cloth = (sp: PortraitSpec) => sp.colors.map(C) as Cloth;

function shadeCloth(x: number, y: number, base: Rgba, shade: Rgba, light: Rgba): Rgba {
  const [l, r] = SHOULDER[y];
  if (x <= l + 1 || x < 8) return shade;
  if (x >= r - 1 && y >= 27) return mix(base, 0.92);
  if (x >= 18 && x <= 20 && y >= 26) return light;
  return base;
}
function eachShoulder(paint: (x: number, y: number) => void): void {
  for (const k of SHOULDERSET) paint(...xy(k));
}

const OUTFITS: Record<Outfit, (p: Pixels, sp: PortraitSpec, f: Face) => void> = {
  tunic: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    eachShoulder((x, y) => {
      if (vneck(x, y, 3)) {
        if (y >= 25) p.set(x, y, x > 15 ? C('#ECE4D4') : C('#CFC4B0'));
        return;
      }
      p.set(x, y, shadeCloth(x, y, base, shade, light));
    });
    p.set(15, 27, trim);
    p.set(16, 27, trim);
    for (let i = 0; i < 14; i++) {
      const x = 5 + i, y = 31 - Math.floor((i * 6) / 13);
      if (SHOULDERSET.has(key(x, y)) && !vneck(x, y, 3)) p.set(x, y, C('#6E4A2E'));
    }
    for (let x = 8; x < 24; x++) {
      const c = p.get(x, 25);
      if (c && !vneck(x, 25, 3)) p.set(x, 25, mix(c, 0.8));
    }
  },
  vest: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    const skin = C(sp.skin[0]), skinS = C(sp.skin[1]);
    eachShoulder((x, y) => {
      const [l, r] = SHOULDER[y];
      if (x <= l + 3 || x >= r - 3) p.set(x, y, x <= l + 1 ? skinS : skin);
      else if (vneck(x, y, 4)) p.set(x, y, x > 14 ? skin : skinS);
      else p.set(x, y, shadeCloth(x, y, base, shade, light));
    });
    for (let y = 26; y < 32; y++) {
      p.set(13, y, y % 2 ? trim : shade);
      p.set(18, y, y % 2 === 0 ? trim : shade);
    }
  },
  armor: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    const steel = C('#A6AEB2'), steelL = C('#DCE2E4'), steelD = C('#626A70');
    eachShoulder((x, y) => {
      const [l] = SHOULDER[y];
      if (vneck(x, y, 2)) return;
      if (x <= 9 || x >= 22) {
        let c = steel;
        if (y === 25 || y === 26 || x === l || x === l + 1) c = x <= 9 ? steelD : steel;
        if ((y === 26 && x >= 4 && x <= 9) || (y === 26 && x >= 22 && x <= 27)) c = steelL;
        p.set(x, y, c);
      } else {
        p.set(x, y, y < 27 ? steel : x >= 14 && x <= 17 ? light : base);
      }
    });
    for (let x = 10; x < 22; x++) p.set(x, 27, trim);
    for (let y = 28; y < 32; y++) for (const x of [1, 2, 29, 30]) if (SHOULDERSET.has(key(x, y))) p.set(x, y, shade);
  },
  light: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    eachShoulder((x, y) => {
      if (vneck(x, y, 2)) {
        if (y >= 24) p.set(x, y, C('#E8E2D6'));
        return;
      }
      let c = shadeCloth(x, y, base, shade, light);
      if (x >= 10 && x <= 21 && y >= 27) c = x >= 13 && x <= 18 ? light : C('#7FA2B8');
      p.set(x, y, c);
    });
    for (let x = 10; x < 22; x++) if (SHOULDERSET.has(key(x, 26))) p.set(x, 26, trim);
  },
  cloak: (p, sp, f) => {
    const [base, shade, light, trim] = cloth(sp);
    eachShoulder((x, y) => p.set(x, y, shadeCloth(x, y, base, shade, light)));
    for (let y = 22; y < 26; y++) for (let x = 10; x < 22; x++) if (!f.cells.has(key(x, y))) p.set(x, y, x > 13 ? base : shade);
    for (let i = 0; i < 16; i++) {
      const x = 22 - i, y = 24 + Math.floor((i * 7) / 15);
      if (SHOULDERSET.has(key(x, y))) p.set(x, y, C('#6E4A2E'));
    }
    p.set(15, 25, trim);
    p.set(16, 25, trim);
  },
  robe: (p, sp, f) => {
    const [base, shade, light, trim] = cloth(sp);
    eachShoulder((x, y) => p.set(x, y, shadeCloth(x, y, base, shade, light)));
    for (let y = 23; y < 27; y++) {
      for (let x = 11; x < 21; x++) {
        if (!f.cells.has(key(x, y)) && Math.abs(x - 15.5) <= 5 - (y - 23) * 0.4) {
          p.set(x, y, Math.abs(x - 15.5) >= 4 - (y - 23) * 0.4 ? trim : base);
        }
      }
    }
    for (let y = 26; y < 32; y++) {
      p.set(15, y, trim);
      p.set(16, y, y % 3 ? trim : light);
    }
  },
  priest: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    const stole = C(sp.stole ?? '#34556B');
    eachShoulder((x, y) => {
      if (!vneck(x, y, 2)) p.set(x, y, shadeCloth(x, y, base, shade, light));
    });
    for (let y = 24; y < 32; y++) {
      for (const x of [11, 12, 19, 20]) {
        if (SHOULDERSET.has(key(x, y)) && !vneck(x, y, 2)) p.set(x, y, x === 12 || x === 19 ? stole : mix(stole, 0.75));
      }
    }
    p.set(12, 28, trim);
    p.set(19, 28, trim);
  },
  plate: (p, sp, f) => {
    const [base, shade, light, trim] = cloth(sp);
    const studs = new Set([key(6, 28), key(25, 28), key(9, 30), key(22, 30)]);
    eachShoulder((x, y) => {
      const [l] = SHOULDER[y];
      let c = base;
      if (x <= l + 2) c = shade;
      else if (y === 26 || (y === 27 && x >= 6 && x <= 25)) c = x > 15 ? light : base;
      if (studs.has(key(x, y))) c = trim;
      p.set(x, y, c);
    });
    for (let y = 22; y < 25; y++) for (let x = 12; x < 20; x++) if (!f.cells.has(key(x, y))) p.set(x, y, x < 15 ? shade : base);
  },
  scarf: (p, sp) => {
    const [base, shade, light, trim] = cloth(sp);
    eachShoulder((x, y) => p.set(x, y, shadeCloth(x, y, base, shade, light)));
    for (let x = 9; x < 23; x++) {
      p.set(x, 24, trim);
      p.set(x, 25, mix(trim, 0.8));
    }
  },
  fur: (p, sp) => {
    const [base, shade, light] = cloth(sp);
    const fur = C('#B08A60'), furD = C('#7C5C3C');
    eachShoulder((x, y) => p.set(x, y, shadeCloth(x, y, base, shade, light)));
    for (let y = 24; y < 28; y++) {
      const [l, r] = SHOULDER[y];
      for (let x = l; x <= r; x++) p.set(x, y, (x + y) % 3 === 0 ? furD : fur);
    }
  },
};

// ---------------------------------------------------------------- accessories
const ACCESSORIES: Record<Accessory, (p: Pixels, sp: PortraitSpec, f: Face) => void> = {
  headband: (p, sp) => {
    const band = C(sp.band![0]), bandD = C(sp.band![1]);
    for (let x = 8; x < 24; x++) if (HEADSET.has(key(x, 9))) p.set(x, 9, x > 11 ? band : bandD);
    for (const [x, y] of [[7, 9], [6, 9], [6, 10], [5, 10], [5, 11], [4, 11], [6, 11]]) p.set(x, y, bandD);
  },
  bandana: (p, sp) => {
    const band = C(sp.band![0]), bandD = C(sp.band![1]);
    for (const y of [8, 9]) {
      for (let x = 8; x < 24; x++) if (HEADSET.has(key(x, y))) p.set(x, y, x > 11 && y === 8 ? band : x <= 11 ? bandD : band);
    }
    for (const [x, y] of [[7, 9], [6, 9], [6, 10], [5, 10], [5, 11], [4, 12], [6, 11], [7, 10]]) p.set(x, y, bandD);
    for (let x = 14; x < 22; x += 3) p.set(x, 9, mix(band, 0.82));
  },
  circlet: p => {
    const gold = C('#D4AA52'), goldD = C('#8E6C2E');
    for (let x = 9; x < 24; x++) if (HEADSET.has(key(x, 9))) p.set(x, 9, x > 12 ? gold : goldD);
    p.set(16, 9, C('#5FA8D0'));
    p.set(16, 8, gold);
  },
  mustache: (p, sp) => {
    const hair = C(sp.hair[0]), hairD = C(sp.hair[2]), skinS = C(sp.skin[1]);
    for (let x = 16; x < 22; x++) p.set(x, 18, x > 17 ? hair : hairD);
    p.set(16, 19, hairD);
    p.set(21, 19, hair);
    for (let x = 14; x <= 17; x++) p.set(x, 10, skinS);
    p.set(11, 17, skinS);
  },
  glasses: p => {
    const fr = C('#7A5D2A');
    for (const [x, y] of [[12, 12], [13, 12], [14, 12], [11, 13], [11, 14], [11, 15], [15, 13], [15, 14], [15, 15], [12, 16], [13, 16], [14, 16],
      [18, 12], [19, 12], [17, 13], [17, 14], [17, 15], [20, 13], [20, 14], [20, 15], [18, 16], [19, 16], [16, 14]]) p.set(x, y, fr);
    p.set(14, 13, C('#FFFFFF'));
  },
  beard: (p, sp, f) => {
    const [hair, hairL, hairD] = sp.hair.map(C);
    for (const k of f.cells) {
      const [x, y] = xy(k);
      if (y >= 18 && x >= 11) p.set(x, y, x >= 15 ? hair : hairD);
    }
    for (let y = 23; y < 25; y++) for (let x = 13; x < 21; x++) p.set(x, y, x >= 15 ? hair : hairD);
    for (let x = 16; x < 22; x++) p.set(x, 18, hairD);
    p.set(17, 20, MOUTH);
    p.set(18, 20, MOUTH);
    p.set(19, 22, hairL);
    p.set(20, 21, hairL);
  },
  scar: p => {
    for (const [x, y] of [[20, 10], [21, 11], [21, 12], [22, 13]]) p.set(x, y, C('#B0645A'));
  },
  scar_near: p => {
    for (const [x, y] of [[11, 16], [12, 17], [13, 18]]) p.set(x, y, C('#B0645A'));
  },
  scarf: (p, _sp, f) => {
    const sc = C('#2E3A4E'), scD = C('#1E2636'), scL = C('#46567A');
    for (const k of f.cells) {
      const [x, y] = xy(k);
      if (y >= 18) p.set(x, y, x >= 14 ? sc : scD);
    }
    for (let y = 21; y < 26; y++) for (let x = 10; x < 23; x++) p.set(x, y, x >= 14 ? sc : scD);
    for (let x = 12; x < 23; x += 3) p.set(x, 19, scL);
    for (const [x, y] of [[9, 23], [8, 24], [8, 25], [7, 26], [7, 27], [6, 28]]) p.set(x, y, scD);
  },
  hood: (p, sp, f) => {
    const [base, shade, light] = cloth(sp);
    for (let y = 3; y < 24; y++) {
      const r = f.head.get(y);
      const [l, rr] = r ? [r[0] - 2, r[1] + 1] : y < 5 ? [13 - (5 - y), 18 + (5 - y) - 1] : [11, 21];
      for (let x = l; x <= rr; x++) {
        if (f.cells.has(key(x, y)) && y >= 10 && x >= 10) continue;
        if (y >= 22 && x >= 12 && x <= 20) continue;
        let c = base;
        if (x <= l + 2 || y >= 19) c = shade;
        if (y <= 6 && x >= 15) c = light;
        p.set(x, y, c);
      }
    }
    for (const k of f.cells) {
      const [x, y] = xy(k);
      if (y === 10 && x >= 10) p.set(x, y, C(sp.hair[2]));
      if (y === 11 && [11, 12, 15, 16, 19, 20].includes(x)) p.set(x, y, C(sp.hair[0]));
    }
    for (let y = 10; y < 22; y++) p.set(Math.max(f.head.get(y)![0], 10) - 1, y, light);
  },
  helm: (p, _sp, f) => {
    const st = C('#8E979C'), stL = C('#C9D0D3'), stD = C('#565E64');
    for (const k of f.cells) {
      const [x, y] = xy(k);
      if (y <= 11 || (x <= 11 && y <= 18)) {
        let c = st;
        if (x <= 10) c = stD;
        if ((y === 6 || y === 7) && x >= 14) c = stL;
        p.set(x, y, c);
      }
    }
    for (let y = 3; y < 6; y++) for (let x = 14; x < 18; x++) p.set(x, y, y < 5 ? C('#A84940') : C('#74302A'));
    for (let x = 8; x < 24; x++) if (f.cells.has(key(x, 11))) p.set(x, 11, stD);
    for (let y = 11; y < 16; y++) p.set(16, y, stD);
  },
};

// ---------------------------------------------------------------- assembly
// Returns 32x32 RGBA, row-major; unpainted pixels are fully transparent.
export function drawPortrait(sp: PortraitSpec): Uint8ClampedArray {
  const skin = C(sp.skin[0]), skinS = C(sp.skin[1]);
  const [hair, hairL, hairD] = sp.hair.map(C);
  const eyeC = C(sp.eye[0]), eyeD = C(sp.eye[1]);
  const [front, back] = HAIR_STYLES[sp.style]();
  const f = FACES[faceOf(sp)];
  const [n0, n1] = f.neck;
  const p = new Pixels();
  for (const k of back) p.set(...xy(k), hair);
  for (let y = 20; y < 26; y++) for (let x = n0; x <= n1; x++) p.set(x, y, y <= 22 || x === n0 ? skinS : skin);
  OUTFITS[sp.outfit](p, sp, f);
  for (const k of f.cells) {
    const [x, y] = xy(k);
    const [l, r] = f.head.get(y)!;
    let c = skin;
    if (x <= l + 1 && y >= 9) c = skinS;
    if (y >= 20 && x <= Math.min(l + 2, Math.floor((l + r) / 2))) c = skinS;
    p.set(x, y, c);
  }
  // the chin's shadow on the neck
  for (let y = 20; y < 25; y++) {
    for (let x = n0; x <= n1; x++) {
      const belowChin = !f.cells.has(key(x, y)) && f.cells.has(key(x, y - 1));
      const c = p.get(x, y);
      if (belowChin && (same(c, skin) || same(c, skinS))) p.set(x, y, mix(skinS, 0.86));
    }
  }
  for (const [x, y] of [[7, 13], [6, 14], [7, 14], [6, 15], [7, 15], [7, 16]]) p.set(x, y, skin);
  p.set(7, 14, skinS);
  p.set(7, 15, skinS);

  const lid = C(sp.lid ?? '#2B2421');
  switch (sp.eyes ?? 'big') {
    case 'big':
      for (const x of [12, 13, 14]) p.set(x, 13, lid);
      p.set(12, 14, eyeD); p.set(13, 14, SCLERA); p.set(14, 14, eyeD);
      p.set(12, 15, eyeC); p.set(13, 15, eyeC); p.set(14, 15, eyeC);
      p.set(18, 13, lid); p.set(19, 13, lid);
      p.set(18, 14, eyeD); p.set(19, 14, eyeD);
      p.set(18, 15, eyeC); p.set(19, 15, skin);
      if (sp.fem) {
        p.set(11, 12, lid);
        p.set(11, 13, lid);
      }
      break;
    case 'narrow':
      for (const x of [12, 13, 14]) p.set(x, 14, lid);
      p.set(13, 15, eyeD); p.set(14, 15, eyeC);
      p.set(18, 14, lid); p.set(19, 14, lid);
      p.set(18, 15, eyeD);
      break;
    case 'calm':
      for (const x of [12, 13, 14]) p.set(x, 13, lid);
      p.set(13, 14, eyeD); p.set(14, 14, eyeC);
      p.set(12, 14, SCLERA);
      p.set(13, 15, eyeC);
      p.set(18, 13, lid); p.set(19, 13, lid);
      p.set(18, 14, eyeD);
      break;
  }
  const brow = C(sp.brow ?? sp.hair[2]);
  const BROWS: Record<BrowStyle, [number, number][]> = {
    soft: [[11, 11], [12, 11], [13, 11], [14, 11], [18, 11], [19, 11], [20, 12]],
    stern: [[11, 11], [12, 11], [13, 12], [14, 12], [18, 12], [19, 11], [20, 11]],
    heavy: [[11, 11], [12, 11], [13, 11], [14, 12], [12, 12], [13, 12], [18, 12], [19, 11], [20, 11], [19, 12]],
  };
  for (const [x, y] of BROWS[sp.brows ?? 'soft']) p.set(x, y, brow);
  p.set(21, 17, skinS);
  p.set(20, 17, mix(skin, 0.97));
  switch (sp.mouth ?? 'neutral') {
    case 'neutral': p.set(17, 20, MOUTH); p.set(18, 20, MOUTH); break;
    case 'smile': p.set(16, 19, MOUTH); p.set(17, 20, MOUTH); p.set(18, 20, MOUTH); p.set(19, 19, MOUTH); break;
    case 'grim': for (let x = 16; x <= 19; x++) p.set(x, 20, MOUTH); break;
    case 'grin':
      for (let x = 16; x < 21; x++) {
        p.set(x, 19, SCLERA);
        p.set(x, 20, MOUTH);
      }
      p.set(15, 19, MOUTH);
      p.set(21, 19, MOUTH);
      break;
    case 'smirk': p.set(17, 20, MOUTH); p.set(18, 20, MOUTH); p.set(19, 19, MOUTH); break;
  }
  if (sp.blush) {
    p.set(20, 17, C('#E9A08E'));
    p.set(12, 17, C('#E9A08E'));
    p.set(13, 17, C('#EDB49E'));
  }
  // front hair, shaded where it ends on skin, along the back of the head and on the crown
  for (const k of front) {
    const [x, y] = xy(k);
    let c = hair;
    const below = p.get(x, y + 1);
    if (!front.has(key(x, y + 1)) && (same(below, skin) || same(below, skinS))) c = hairD;
    else if (x <= 9 && y >= 10) c = hairD;
    else if ((y === 6 || y === 7) && x >= 13 && x <= 20 && (x + y) % 4 !== 0) c = hairL;
    else if (y === 8 && x >= 16 && x <= 19) c = hairL;
    p.set(x, y, c);
  }
  for (const k of back) {
    const [x, y] = xy(k);
    if (same(p.get(x, y), hair) && (x <= 4 || y >= 26)) p.set(x, y, hairD);
  }
  if (sp.acc) ACCESSORIES[sp.acc](p, sp, f);
  for (const extra of sp.extra ?? []) ACCESSORIES[extra](p, sp, f);
  return outline(p);
}

function outline(p: Pixels): Uint8ClampedArray {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = p.get(x, y) ?? ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => p.get(x + dx, y + dy)) ? OL : undefined);
      if (c) out.set(c, (y * SIZE + x) * 4);
    }
  }
  return out;
}
