// 16x16 item icons drawn from code: one distinct icon for every weapon, spellbook, manual and item key
// in GAME_ITEMS. Same style as the gen_art.py icons (1x pixels, #2B2421 outline, light from the top
// left), so they sit next to the hand-made PNGs. icons.test.ts requires every key to render and no two
// keys to share the same pixels.
//
// Swords, daggers and lances are built along the 45° axis from parts (blade, guard, grip, pommel);
// axes and staves put a head shape on the same axis; bows, gauntlets, beast and dragon stones, books
// and the other items are small grids. Material colours come from the item name (木制、青铜、铁、钢、
// 银、杀手、勇者、邪…) and named weapons get their own shapes. Where two items would still look the
// same, the gem/tassel/ribbon colour tells them apart.
import { WEAPONS } from '../data/weapons.ts';
import type { Weapon, WeaponId } from '../data/weapons.ts';
import { GAME_ITEMS } from '../game/items.ts';

export type Rgba = readonly [number, number, number, number];
export const ICON_SIZE = 16;

const C = (hex: string): Rgba => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const lift = (c: Rgba, k: number): Rgba => [clamp(c[0] + (255 - c[0]) * k), clamp(c[1] + (255 - c[1]) * k), clamp(c[2] + (255 - c[2]) * k), 255];
const OL = C('#2B2421');

// The gen_art.py BASE palette, plus a few colours the item grids need.
const BASE: Record<string, Rgba> = Object.fromEntries(Object.entries({
  s: '#F0C8A0', S: '#CC9270', e: '#2B2421',
  m: '#E4E8E6', M: '#A0A8AC', n: '#5E666C',
  w: '#9A683C', W: '#5E3E24',
  y: '#D4AA52', Y: '#8E6C2E',
  k: '#F0EADF', K: '#BFB5A4',
  b: '#4E3A2C',
  r: '#B4835A', R: '#7C5636', q: '#4A3020',
  p: '#F6F3EC', P: '#C9C3B8', f: '#AFC2D0',
  t: '#A2423A', T: '#6A2A24',
  g: '#7CC6DA',
  v: '#C8584E', V: '#8E3A34',
  u: '#8A68B0', U: '#5A4278',
  d: '#DDB868', D: '#B08A42',
  G: '#D4E4EC',
  h: '#6B4A2E', H: '#4A321E',
  a: '#3F6B8C', A: '#284A63', l: '#7FA9C6',
  x: '#B0473C', X: '#74302A',
  j: '#7FA35A', J: '#4F6E38',
  c: '#B4ECF4', o: '#E5873A', O: '#A0521E', i: '#E58FB0', I: '#A8506E', z: '#3A3646', Z: '#1E1A24',
  N: '#4E98B0', F: '#F7E9A8', L: '#A8D878', Q: '#3E7A3A',
}).map(([k, v]) => [k, C(v)]));

// ---------------------------------------------------------------- canvas

type Pal = Record<string, Rgba>;

class Icon {
  private px = new Map<number, Rgba>();
  set(x: number, y: number, c: Rgba | undefined): void {
    if (!c || x < 0 || y < 0 || x >= ICON_SIZE || y >= ICON_SIZE) return;
    this.px.set(y * ICON_SIZE + x, c);
  }
  has(x: number, y: number): boolean { return this.px.has(y * ICON_SIZE + x); }
  grid(rows: readonly string[], pal: Pal, ox = 0, oy = 0): void {
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') this.set(ox + x, oy + y, pal[ch] ?? BASE[ch]); }));
  }
  // Same rule as gen_art.py outline(): every empty pixel next to a filled one (4-neighbourhood).
  outline(): void {
    const add: number[] = [];
    for (let y = 0; y < ICON_SIZE; y++) for (let x = 0; x < ICON_SIZE; x++) {
      if (this.has(x, y)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < ICON_SIZE && ny < ICON_SIZE && this.has(nx, ny);
      })) add.push(y * ICON_SIZE + x);
    }
    for (const k of add) this.px.set(k, OL);
  }
  data(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(ICON_SIZE * ICON_SIZE * 4);
    for (const [k, c] of this.px) out.set(c, k * 4);
    return out;
  }
}

// Axis coordinates: along a = (dx - dy) / 2 toward the top right, across b = (dx + dy) / 2 toward the
// bottom right. Regions are filled with a bevel: bottom/right rim dark, top/left rim shine.
function region(img: Icon, ox: number, oy: number, inside: (a: number, b: number) => boolean, hi: Rgba, lo: Rgba, shine?: Rgba): void {
  const cells = new Set<number>();
  for (let y = 0; y < ICON_SIZE; y++) for (let x = 0; x < ICON_SIZE; x++) {
    const dx = x - ox, dy = y - oy;
    if (inside((dx - dy) / 2, (dx + dy) / 2)) cells.add(y * ICON_SIZE + x);
  }
  for (const k of cells) {
    const x = k % ICON_SIZE, y = Math.floor(k / ICON_SIZE);
    const out = (nx: number, ny: number) => !cells.has(ny * ICON_SIZE + nx);
    img.set(x, y, out(x + 1, y) || out(x, y + 1) ? lo : shine && (out(x - 1, y) || out(x, y - 1)) ? shine : hi);
  }
}

// ---------------------------------------------------------------- materials

type MetalId = 'wood' | 'yew' | 'bronze' | 'iron' | 'steel' | 'silver' | 'killer' | 'brave' | 'cursed' | 'holy'
  | 'magic' | 'poison' | 'thunder' | 'ice' | 'fire' | 'blood' | 'damina' | 'royal' | 'night' | 'wind' | 'hunt' | 'slayer';
const METALS: Record<MetalId, [string, string]> = {
  wood: ['#D2A066', '#8A5A30'], yew: ['#A8744A', '#5E3E24'], bronze: ['#E0A060', '#94582A'],
  iron: ['#CDD2D4', '#7E878C'], steel: ['#E0E9F0', '#6F889C'], silver: ['#FFFFFF', '#A4BACA'],
  killer: ['#BCC2C6', '#4E565C'], brave: ['#F4E2A0', '#B08A3A'], cursed: ['#B49CD4', '#4A3A66'],
  holy: ['#FFF6D0', '#CFA44A'], magic: ['#B4ECF4', '#3E8EA8'], poison: ['#C4E09A', '#557F30'],
  thunder: ['#FAEB8A', '#B0902A'], ice: ['#E4F6FC', '#72B0CE'], fire: ['#F6B070', '#B0473C'],
  blood: ['#E08474', '#7C2E28'], damina: ['#E6F2DC', '#76987A'], royal: ['#FBE6A4', '#A87E36'],
  night: ['#8E8AA8', '#34304A'], wind: ['#CDEFC8', '#4E9A6A'], hunt: ['#C8D2A0', '#6E7A3A'], slayer: ['#E8B8A0', '#8E4A3A'],
};
const metal = (id: MetalId) => ({ hi: C(METALS[id][0]), lo: C(METALS[id][1]) });

const GEM_ORDER = ['red', 'blue', 'green', 'gold', 'purple', 'cyan', 'pink', 'orange', 'white', 'black', 'teal', 'lime'] as const;
type GemId = (typeof GEM_ORDER)[number];
const GEMS: Record<GemId, string> = {
  red: '#D0443A', blue: '#3F7FC6', green: '#4FA048', gold: '#F0C24A', purple: '#8A58C0', cyan: '#5CC8DC',
  pink: '#E880A8', orange: '#E87A2A', white: '#F8F6F0', black: '#2E2A3A', teal: '#2E9A8A', lime: '#B8E048',
};

type GripId = 'brown' | 'red' | 'blue' | 'black' | 'white' | 'green' | 'purple';
const GRIPS: Record<GripId, [string, string]> = {
  brown: ['#9A683C', '#5E3E24'], red: ['#C8584E', '#7C2E28'], blue: ['#4F7FA6', '#284A63'], black: ['#55505E', '#2E2A36'],
  white: ['#F0EADF', '#BFB5A4'], green: ['#6E9A4A', '#3E5E2A'], purple: ['#8A68B0', '#4A3A66'],
};

const GOLD = { hi: C('#E7C266'), lo: C('#8E6C2E') };
const DARKIRON = { hi: C('#8C949A'), lo: C('#4E565C') };

// Name keywords pick the material; rank is the fallback (bows and fists fall back to wood/leather).
function metalOf(w: Weapon): MetalId {
  const n = w.name;
  const rules: [RegExp, MetalId][] = [
    [/木制/, 'wood'], [/青铜/, 'bronze'], [/达·米纳/, 'damina'], [/对魔|魔法/, 'magic'], [/邪|反噬|妖枪|魔枪/, 'cursed'],
    [/勇者/, 'brave'], [/杀手|必杀/, 'killer'], [/银/, 'silver'], [/钢/, 'steel'], [/铁/, 'iron'],
    [/圣|神授|净化|辉/, 'holy'], [/毒/, 'poison'], [/雷/, 'thunder'], [/冰/, 'ice'], [/火|炎|沙拉曼达|龙息/, 'fire'],
    [/王/, 'royal'], [/常夜/, 'night'], [/疾风/, 'wind'], [/猎兽/, 'hunt'], [/屠马|斩马|屠龙|骑士杀手/, 'slayer'],
  ];
  for (const [re, id] of rules) if (re.test(n)) return id;
  if (w.type === 'bow') return 'yew';
  return ({ E: 'iron', D: 'steel', C: 'steel', B: 'silver', A: 'silver' } as Record<string, MetalId>)[w.rank] ?? 'royal';
}

// ---------------------------------------------------------------- specs

type Blade = { len: number; width: 1 | 2 | 3; tip: 'point' | 'blunt' | 'wedge'; curve?: 0 | 1 | 2; leaf?: boolean; serrate?: boolean; hook?: boolean; edge?: boolean; fuller?: boolean; bolt?: boolean };
type Guard = 'none' | 'small' | 'cross' | 'wide' | 'wing' | 'horn' | 'disc' | 'ring';
type LanceHead = 'spike' | 'leaf' | 'broad' | 'needle' | 'halberd' | 'trident' | 'hook' | 'glaive' | 'winged';
type AxeHead = 'axe' | 'double' | 'hammer' | 'mace' | 'club' | 'poleaxe' | 'shield' | 'hand' | 'tomahawk' | 'great';
type BowShape = 'bow' | 'short' | 'long' | 'recurve';
type FistShape = 'gauntlet' | 'knuckle' | 'claw' | 'katar' | 'wheel' | 'spiked' | 'heavy' | 'lizard' | 'wing' | 'radiant';
type StoneShape = 'claw' | 'fang' | 'stone' | 'thunderfang' | 'dstone' | 'dstoneplus' | 'breath' | 'icebreath';
type StaffHead = 'orb' | 'ring' | 'cross' | 'leaf' | 'tri' | 'crook' | 'star' | 'mute' | 'moon';
type CoverId = 'fire' | 'thunder' | 'wind' | 'ice' | 'dark' | 'light' | 'heal' | 'support' | 'hostile' | 'earth' | 'moon' | 'poison' | 'steel';
type Emblem = keyof typeof EMBLEMS;

type Spec =
  | { kind: 'sword'; metal: MetalId; blade: Blade; guard: Guard; grip: GripId; gripLen?: number; gold?: boolean; gem: GemId }
  | { kind: 'lance'; metal: MetalId; head: LanceHead; shaft: GripId; short?: boolean; banner?: boolean; glint?: boolean; gem: GemId }
  | { kind: 'axe'; metal: MetalId; head: AxeHead; shaft: GripId; gem: GemId }
  | { kind: 'bow'; metal: MetalId; shape: BowShape; gem: GemId }
  | { kind: 'fist'; metal: MetalId; shape: FistShape; gem: GemId }
  | { kind: 'stone'; metal: MetalId; shape: StoneShape; gem: GemId }
  | { kind: 'staff'; head: StaffHead; shaft: GripId; long?: boolean; gem: GemId }
  | { kind: 'fan'; metal: MetalId; gem: GemId }
  | { kind: 'book'; style: 'tome' | 'grimoire' | 'scroll'; cover: CoverId; emblem: Emblem; gem: GemId }
  | { kind: 'grid'; rows: readonly string[] };

const S = (len: number, width: Blade['width'], tip: Blade['tip'], more: Partial<Blade> = {}): Blade => ({ len, width, tip, ...more });

// Hand-picked looks for named and special weapons; everything else follows the name rules below.
const NAMED: Partial<Record<WeaponId, Partial<Spec> & { kind: Spec['kind'] }>> = {
  slim_sword: { kind: 'sword', blade: S(8, 1, 'point'), guard: 'small' },
  rapier: { kind: 'sword', blade: S(8, 1, 'point'), guard: 'ring' },
  armor_sword: { kind: 'sword', blade: S(8, 2, 'wedge'), guard: 'cross' },
  wo_dao: { kind: 'sword', blade: S(7, 2, 'point', { curve: 1 }), guard: 'disc', gripLen: 3, grip: 'black' },
  devil_sword: { kind: 'sword', metal: 'blood', blade: S(8, 2, 'point', { serrate: true }), guard: 'horn', grip: 'black' },
  lancereaver: { kind: 'sword', blade: S(8, 2, 'point', { hook: true }), guard: 'cross', grip: 'blue' },
  beastkiller: { kind: 'sword', metal: 'hunt', blade: S(8, 2, 'point', { serrate: true }), guard: 'small', grip: 'green' },
  dragonslayer: { kind: 'sword', metal: 'slayer', blade: S(8, 3, 'wedge'), guard: 'wing', grip: 'red' },
  horseslayer: { kind: 'sword', metal: 'slayer', blade: S(8, 2, 'point', { curve: 2 }), guard: 'small', gripLen: 3 },
  killing_edge: { kind: 'sword', blade: S(8, 2, 'point', { edge: true }), guard: 'cross', grip: 'black' },
  brave_sword: { kind: 'sword', blade: S(8, 2, 'point'), guard: 'wing', gold: true, grip: 'blue' },
  levin_sword: { kind: 'sword', blade: S(8, 2, 'point', { bolt: true }), guard: 'cross', gold: true },
  iron_blade: { kind: 'sword', blade: S(8, 3, 'point', { curve: 1 }), guard: 'disc' },
  steel_blade: { kind: 'sword', blade: S(8, 3, 'point', { curve: 1 }), guard: 'disc' },
  silver_blade: { kind: 'sword', blade: S(8, 3, 'point', { curve: 1 }), guard: 'disc', gold: true },
  killer_blade: { kind: 'sword', blade: S(8, 3, 'point', { curve: 1, edge: true }), guard: 'disc', grip: 'black' },
  royal_sword: { kind: 'sword', blade: S(8, 3, 'point', { fuller: true }), guard: 'wing', gold: true, grip: 'red' },
  fw_weapon_2: { kind: 'sword', blade: S(8, 2, 'point', { leaf: true }), guard: 'small' },
  fw_weapon_8: { kind: 'sword', blade: S(8, 2, 'point', { fuller: true }), guard: 'cross', gold: true, grip: 'white' },
  fw_weapon_10: { kind: 'sword', blade: S(8, 3, 'blunt'), guard: 'wide', grip: 'brown' },
  fw_weapon_15: { kind: 'sword', blade: S(8, 1, 'point', { curve: 1 }), guard: 'small', grip: 'green' },
  fw_weapon_16: { kind: 'sword', blade: S(8, 2, 'point', { serrate: true }), guard: 'wing', grip: 'purple' },
  fw_weapon_17: { kind: 'fan', metal: 'blood' },
  fw_weapon_18: { kind: 'sword', blade: S(8, 2, 'point', { edge: true }), guard: 'horn', grip: 'green' },
  fw_weapon_22: { kind: 'sword', metal: 'royal', blade: S(8, 1, 'point'), guard: 'ring', gold: true, grip: 'red' },
  fw_weapon_158: { kind: 'sword', blade: S(6, 3, 'point', { curve: 1 }), guard: 'horn', grip: 'black' },
  fw_weapon_223: { kind: 'sword', blade: S(8, 3, 'blunt', { serrate: true }), guard: 'horn', grip: 'black' },
  dagger: { kind: 'sword', blade: S(5, 2, 'point'), guard: 'small' },
  silver_dagger: { kind: 'sword', blade: S(5, 2, 'point'), guard: 'small', gold: true, grip: 'blue' },
  poison_dagger: { kind: 'sword', blade: S(5, 2, 'point', { curve: 1 }), guard: 'none', grip: 'green' },

  slim_lance: { kind: 'lance', head: 'needle' },
  heavy_spear: { kind: 'lance', head: 'broad', shaft: 'black' },
  short_spear: { kind: 'lance', head: 'leaf', short: true },
  brave_lance: { kind: 'lance', head: 'winged', shaft: 'blue' },
  master_lance: { kind: 'lance', metal: 'royal', head: 'leaf', banner: true, shaft: 'red' },
  javelin: { kind: 'lance', head: 'spike', short: true },
  armorslayer: { kind: 'lance', head: 'broad' },
  killer_lance: { kind: 'lance', head: 'hook', shaft: 'black' },
  divine_lance: { kind: 'lance', head: 'winged', glint: true, shaft: 'white' },
  fw_weapon_25: { kind: 'lance', head: 'leaf' },
  fw_weapon_32: { kind: 'lance', head: 'hook' },
  fw_weapon_40: { kind: 'lance', metal: 'steel', head: 'glaive' },
  fw_weapon_41: { kind: 'lance', metal: 'silver', head: 'halberd' },
  fw_weapon_43: { kind: 'lance', metal: 'iron', head: 'trident', short: true },
  fw_weapon_44: { kind: 'lance', head: 'winged', shaft: 'white' },
  fw_weapon_45: { kind: 'lance', head: 'glaive', shaft: 'purple', short: true },
  fw_weapon_46: { kind: 'lance', metal: 'bronze', head: 'broad', shaft: 'red' },
  fw_weapon_47: { kind: 'lance', metal: 'magic', head: 'leaf', glint: true },
  fw_weapon_48: { kind: 'lance', head: 'trident', shaft: 'black' },
  fw_weapon_49: { kind: 'lance', head: 'halberd', shaft: 'purple' },
  fw_weapon_161: { kind: 'lance', metal: 'night', head: 'hook', short: true, shaft: 'purple' },
  fw_weapon_228: { kind: 'lance', metal: 'holy', head: 'broad', glint: true, shaft: 'white' },

  poleaxe: { kind: 'axe', head: 'poleaxe' },
  tomahawk: { kind: 'axe', metal: 'silver', head: 'tomahawk' },
  hammer: { kind: 'axe', metal: 'steel', head: 'hammer' },
  brave_axe: { kind: 'axe', head: 'double', shaft: 'blue' },
  hand_axe: { kind: 'axe', head: 'hand' },
  killer_axe: { kind: 'axe', head: 'axe', shaft: 'black' },
  fw_weapon_57: { kind: 'axe', metal: 'steel', head: 'hand', shaft: 'red' },
  fw_weapon_61: { kind: 'axe', metal: 'steel', head: 'shield' },
  fw_weapon_65: { kind: 'axe', metal: 'steel', head: 'great' },
  fw_weapon_66: { kind: 'axe', metal: 'iron', head: 'mace' },
  fw_weapon_71: { kind: 'axe', head: 'double', shaft: 'black' },
  fw_weapon_155: { kind: 'axe', head: 'great', shaft: 'purple' },
  fw_weapon_213: { kind: 'axe', metal: 'royal', head: 'hammer', shaft: 'red' },
  fw_weapon_224: { kind: 'axe', metal: 'yew', head: 'club', shaft: 'brown' },

  magic_bow: { kind: 'bow', shape: 'recurve' },
  longbow: { kind: 'bow', shape: 'long' },
  short_bow: { kind: 'bow', shape: 'short' },
  fw_weapon_88: { kind: 'bow', metal: 'holy', shape: 'recurve' },
  fw_weapon_159: { kind: 'bow', shape: 'recurve' },
  fw_weapon_160: { kind: 'bow', metal: 'magic', shape: 'long' },
  fw_weapon_225: { kind: 'bow', metal: 'royal', shape: 'recurve' },
  fw_weapon_79: { kind: 'bow', shape: 'short' },

  gauntlet: { kind: 'fist', shape: 'gauntlet' },
  steel_gauntlet: { kind: 'fist', shape: 'gauntlet' },
  killer_gauntlet: { kind: 'fist', shape: 'spiked' },
  silver_gauntlet: { kind: 'fist', shape: 'heavy' },
  fw_weapon_89: { kind: 'fist', shape: 'knuckle' },
  fw_weapon_90: { kind: 'fist', shape: 'knuckle' },
  fw_weapon_93: { kind: 'fist', metal: 'wind', shape: 'wing' },
  fw_weapon_94: { kind: 'fist', metal: 'steel', shape: 'spiked' },
  fw_weapon_95: { kind: 'fist', shape: 'lizard' },
  fw_weapon_98: { kind: 'fist', metal: 'yew', shape: 'claw' },
  fw_weapon_99: { kind: 'fist', shape: 'heavy' },
  fw_weapon_100: { kind: 'fist', metal: 'fire', shape: 'wheel' },
  fw_weapon_103: { kind: 'fist', metal: 'holy', shape: 'radiant' },
  fw_weapon_156: { kind: 'fist', shape: 'gauntlet' },
  fw_weapon_157: { kind: 'fist', metal: 'steel', shape: 'katar' },
  fw_weapon_215: { kind: 'fist', shape: 'heavy' },

  beast_claw: { kind: 'stone', metal: 'iron', shape: 'claw' },
  beast_fang: { kind: 'stone', metal: 'holy', shape: 'fang' },
  beaststone_plus: { kind: 'stone', metal: 'hunt', shape: 'stone' },
  thunder_fang: { kind: 'stone', metal: 'thunder', shape: 'thunderfang' },
  dragonstone: { kind: 'stone', metal: 'fire', shape: 'dstone' },
  dragonstone_plus: { kind: 'stone', metal: 'fire', shape: 'dstoneplus' },
  dragon_breath: { kind: 'stone', metal: 'fire', shape: 'breath' },
  ice_breath: { kind: 'stone', metal: 'ice', shape: 'icebreath' },

  heal: { kind: 'staff', head: 'orb' },
  recover: { kind: 'staff', head: 'ring' },
  restore: { kind: 'staff', head: 'leaf' },
  fortify: { kind: 'staff', head: 'tri' },
  rescue_staff: { kind: 'staff', head: 'crook' },
  warp_staff: { kind: 'staff', head: 'star' },
  silence_staff: { kind: 'staff', head: 'mute', shaft: 'black' },
  sleep_staff: { kind: 'staff', head: 'moon', shaft: 'blue' },
  physic: { kind: 'staff', head: 'cross', long: true, shaft: 'white' },

  fire: { kind: 'book', style: 'tome', cover: 'fire', emblem: 'flame' },
  thunder: { kind: 'book', style: 'tome', cover: 'thunder', emblem: 'bolt' },
  wind: { kind: 'book', style: 'tome', cover: 'wind', emblem: 'swirl' },
  flame_lance: { kind: 'book', style: 'tome', cover: 'fire', emblem: 'spear' },
};

// Plain weapons (no NAMED entry) also change shape with the material, so 铁/钢/银 differ in more than colour.
const TIERS: Partial<Record<Weapon['type'], Partial<Record<MetalId, Partial<Spec>>>>> = {
  sword: {
    wood: { blade: S(8, 3, 'blunt'), guard: 'small' } as Partial<Spec>,
    steel: { blade: S(8, 3, 'point'), guard: 'cross' } as Partial<Spec>,
    silver: { blade: S(8, 3, 'point', { fuller: true }), guard: 'wing' } as Partial<Spec>,
    damina: { blade: S(8, 2, 'point', { leaf: true }), guard: 'horn' } as Partial<Spec>,
  },
  lance: {
    wood: { head: 'needle' }, steel: { head: 'leaf' }, silver: { head: 'broad' }, damina: { head: 'halberd' },
  } as Partial<Record<MetalId, Partial<Spec>>>,
  axe: {
    steel: { head: 'great' }, silver: { head: 'double' }, damina: { head: 'poleaxe' },
  } as Partial<Record<MetalId, Partial<Spec>>>,
  bow: {
    steel: { shape: 'recurve' }, silver: { shape: 'long' }, brave: { shape: 'recurve' }, damina: { shape: 'short' },
  } as Partial<Record<MetalId, Partial<Spec>>>,
};

// Spellbook covers follow the element; the emblem names the spell. White magic books have pale covers.
const SPELLS: Record<string, [CoverId, Emblem]> = {
  fire: ['fire', 'flame'], thunder: ['thunder', 'bolt'], wind: ['wind', 'swirl'], flame_lance: ['fire', 'spear'],
  bolting: ['thunder', 'cloud'], light: ['light', 'sun'], elfire: ['fire', 'blaze'], meteor: ['earth', 'meteor'],
  dark: ['dark', 'orb'], nosferatu: ['dark', 'bat'],
  fw_spell_3: ['ice', 'sword'], fw_spell_4: ['wind', 'wing'], fw_spell_6: ['ice', 'flake'], fw_spell_7: ['fire', 'volcano'],
  fw_spell_8: ['ice', 'wheel'], fw_spell_9: ['light', 'wall'], fw_spell_10: ['dark', 'delta'], fw_spell_11: ['dark', 'tee'],
  fw_spell_12: ['heal', 'cross'], fw_spell_17: ['light', 'drop'], fw_spell_18: ['light', 'wing'], fw_spell_19: ['support', 'eye'],
  fw_spell_20: ['poison', 'slime'], fw_spell_22: ['support', 'zz'], fw_spell_23: ['dark', 'theta'], fw_spell_24: ['heal', 'heart'],
  fw_spell_25: ['heal', 'arrow'], fw_spell_26: ['heal', 'drop'], fw_spell_28: ['dark', 'scythe'], fw_spell_34: ['thunder', 'arrow'],
  fw_spell_36: ['steel', 'sword'], fw_spell_37: ['earth', 'fang'], fw_spell_38: ['moon', 'moon'], fw_spell_40: ['hostile', 'cross_x'],
  fw_spell_42: ['light', 'arrow'], fw_spell_45: ['support', 'torch'], fw_spell_47: ['light', 'ray'], fw_spell_48: ['support', 'shield'],
  fw_spell_49: ['support', 'swirl'], fw_spell_50: ['heal', 'hearts'], fw_spell_52: ['wind', 'sword'], fw_spell_53: ['moon', 'star'],
  fw_spell_54: ['hostile', 'flake'], fw_spell_55: ['support', 'wall'], fw_spell_56: ['support', 'wing'], fw_spell_57: ['support', 'arrow'],
  fw_spell_58: ['heal', 'leaf'], fw_spell_60: ['ice', 'moon'], fw_spell_61: ['fire', 'arrow'], fw_spell_62: ['poison', 'bee'],
};

// Items that are not weapons or books: hand-drawn grids in the BASE palette.
const ITEM_GRIDS: Record<string, readonly string[]> = {
  vulnerary: [
    '................',
    '................',
    '......WW........',
    '......kk........',
    '.....kkkk.......',
    '....kvvvvk......',
    '...kmvvvvvk.....',
    '...kmvvvvvk.....',
    '...kvvvvvVk.....',
    '...kvvvvVVk.....',
    '....kvVVVk......',
    '.....kkkk.......',
  ],
  immortal_shield: [
    '................',
    '................',
    '...yyyyyyyyyy...',
    '...ydmmmmmmMy...',
    '...ymmmyymmMy...',
    '...ymmyYYymMy...',
    '...ymmyYYymMy...',
    '...ymmmyymmMy...',
    '....ymmmmmMy....',
    '....ymmmmMMy....',
    '.....ymmMMy.....',
    '......yMMy......',
    '.......yy.......',
  ],
  seal_promote: [
    '................',
    '......yyyy......',
    '....yyYYYYyy....',
    '...yYYyyyyYYy...',
    '...yYyykkyyYy...',
    '..yYyykyykyyYy..',
    '..yYykyyyykyYy..',
    '..yYyykkkkyyYy..',
    '...yYyyyyyyYy...',
    '...yYYyyyyYYy...',
    '....yyYYYYyy....',
    '......yyyy......',
    '.....aa..aa.....',
    '....aA....Aa....',
    '....A......A....',
  ],
  energy_drop: [
    '................',
    '................',
    '.k....pppp....k.',
    '.kk..pPppPp..kk.',
    '.kkk.pppppp.kkk.',
    '..kkkppyypppkk..',
    '...kkppyyppkk...',
    '.....pppppp.....',
    '.....pppppP.....',
    '....ppppppPP....',
    '....pppppPPP....',
    '...ppppppPPPP...',
    '...yyyyyyyyyy...',
  ],
  secret_book: [
    '................',
    '..WWwwwwwwwwk...',
    '..WWwwwwwwwwk...',
    '..WWwyyyyywwk...',
    '..WWwyddydwwk...',
    '..WWwyddydwwyy..',
    '..WWwyyyyywwYy..',
    '..WWwwwwwwwwyy..',
    '..WWwwwwwwwwk...',
    '..WWwwwwwwwwk...',
    '..WWwwwwwwwwk...',
    '..WWwwwwwwwwk...',
    '...Wkkkkkkkkk...',
  ],
  speedwing: [
    '................',
    '............ll..',
    '..........llal..',
    '.........llaal..',
    '........llaala..',
    '.......llaaal...',
    '......llaaaa....',
    '.....llaaaal....',
    '....llaaaa......',
    '....laaaa.......',
    '...laaa.........',
    '...aaW..........',
    '..W.............',
    '.W..............',
  ],
  goddess_icon: [
    '................',
    '......yyyy......',
    '.....y....y.....',
    '......kkkk......',
    '......ksSk......',
    '......kkkk......',
    '.....kkkkkK.....',
    '....kkkkkkKK....',
    '.....kkkkKK.....',
    '.....kkkkKK.....',
    '.....kkkkKK.....',
    '....kkkkkKKK....',
    '...yyyyyyyyyy...',
    '...YYYYYYYYYY...',
  ],
  dracoshield: [
    '................',
    '..vvvvvvvvvvvv..',
    '..vxxxvvvvxxxV..',
    '..vxvvxxxxvvxV..',
    '..vvxxyyyyxxvV..',
    '..vvxyYvvYyxvV..',
    '..vvxyvvvvyxvV..',
    '...vxyYvvYyxV...',
    '...vvxyyyyxvV...',
    '....vvxxxxvV....',
    '.....vvxxvV.....',
    '......vVVV......',
    '.......VV.......',
  ],
  talisman: [
    '................',
    '....y......y....',
    '.....y....y.....',
    '......y..y......',
    '.......yy.......',
    '......yggy......',
    '.....yggggy.....',
    '....yggkgggy....',
    '....ygggggNy....',
    '....yggggNNy....',
    '.....ygNNNy.....',
    '......yyyy......',
  ],
  herb: [
    '................',
    '................',
    '..........jj....',
    '.........jjJ....',
    '...jj...jjJ.....',
    '..jjjJ..jJ......',
    '...jjJJjJ..jj...',
    '.....JjJ..jjjJ..',
    '......JJjjjJJ...',
    '.......JJJJ.....',
    '.......J........',
    '......J.........',
    '.....J..........',
  ],
  ore: [
    '................',
    '................',
    '................',
    '......MMM.......',
    '....MMmmmMM.....',
    '...MmmmymmmM....',
    '..MmmmyYymmnM...',
    '..MmmmmymmnnM...',
    '..MnmmmmmnnnM...',
    '...MnnmmnnnM....',
    '....MMnnnMM.....',
    '......MMM.......',
  ],
  wood: [
    '................',
    '................',
    '................',
    '................',
    '...WWWWWWWWW....',
    '..WwwwwwwwwWrr..',
    '..WwwWwwwwwrRRr.',
    '..WwwwwwWwwrRqRr',
    '..WwwwwwwwwrRRr.',
    '...WWWWWWWWWrr..',
  ],
  seed: [
    '................',
    '................',
    '......KK........',
    '.....KkkK.......',
    '......KK........',
    '.....kkkkk......',
    '....kkkkkkk.....',
    '...kkkkkkkkk....',
    '...kkkkkkkkK....',
    '...KkkkkkkKK.d..',
    '....KKKKKKK.dDd.',
    '............d.d.',
  ],
  reincarnation_core: [
    '................',
    '......u..u......',
    '.......uu.......',
    '.....uuUUuu.....',
    '....uccccccu....',
    '...uccGGcccNu...',
    '..uucGkGcccNuu..',
    '...ucccccccNu...',
    '...uccccccNNu...',
    '....uccccNNu....',
    '.....uuNNuu.....',
    '.......uu.......',
    '......u..u......',
  ],
  legacy_stone_growth: [
    '................',
    '................',
    '.......LL.......',
    '......LLjj......',
    '.....LkLjjJ.....',
    '.....LLjjjJ.....',
    '....LLjjjjJJ....',
    '....LjjjjjJJ....',
    '....jjjjjJJJ....',
    '.....jjjJJJ.....',
    '...KKKKKKKKKK...',
    '...PPPPPPPPPP...',
  ],
  legacy_stone_numeric: [
    '................',
    '................',
    '.......ll.......',
    '......llaa......',
    '.....lklaaA.....',
    '.....llaaaA.....',
    '....llaaaaAA....',
    '....laaaaaAA....',
    '....aaaaaAAA....',
    '.....aaaAAA.....',
    '...KKKKKKKKKK...',
    '...PPPPPPPPPP...',
  ],
  ether_ration: [
    '................',
    '................',
    '................',
    '.......aa.......',
    '....rrraarrr....',
    '...rddddddddr...',
    '..rddFddFdddDr..',
    '..rddddddddDDr..',
    '..rdFddFddDDDr..',
    '..rRDDDDDDDDRr..',
    '...RRRRRRRRRR...',
  ],
  // A fractured cyan/violet crystal with a gold time-ring, lit from the upper left.
  cross_time_shard: [
    '................',
    '.........cc.....',
    '........cpg.....',
    '.......cpgN.....',
    '......cpgNU.....',
    '....ddcgNUdd....',
    '...dD.cgU..Dd...',
    '..dD..cU....Dd..',
    '..dD....cu..Dd..',
    '...dD..cgUUdD...',
    '....ddcgUUdd....',
    '.....cgUU.......',
    '.....gUU........',
    '.....UU.........',
    '................',
  ],
  old_map: [
    '................',
    '.eeeeeeeeeeeeee.',
    '.eFFFFFFFFFFFDe.',
    '.eFRFFFFFFxFxDe.',
    '.eFFRFFFFFFxFDe.',
    '.eFFFRRFFFxFxDe.',
    '.eFFFFFRFFFFFDe.',
    '.eFjjFFFRRFFFDe.',
    '.eFjJjFFFFRFFDe.',
    '.eFFFFFFFFFFFDe.',
    '.eDDDDDDDDDDDDe.',
    '.eeeeeeeeeeeeee.',
  ],
  full_meal: [
    '................',
    '................',
    '.......kk.......',
    '......k..k......',
    '.......kk.......',
    '.....vvjjoo.....',
    '....vVjjJooO....',
    '...rrrrrrrrrr...',
    '..pppppppppppp..',
    '..pPPPPPPPPPPp..',
    '...pppppppppp...',
  ],
};

// Battle consumables: an elixir (golden flask) and an antidote (green vial).
Object.assign(ITEM_GRIDS, {
  elixir: ['................', '......eeee......', '......edde......', '.....eddde......', '......eppe......', '.....eppppe.....', '....epyyyype....', '....epyyyype....', '....epyyyype....', '....epppppe.....', '.....eeeeee.....', '................'],
  antidote: ['................', '.......ee.......', '......eddde.....', '.......ede......', '......eLLLe.....', '.....eLjjjLe....', '....eLjjjjjLe...', '....eLjJjjjLe...', '....eLjjjjJLe...', '.....eLLLLLe....', '......eeeee.....', '................'],
});

// Story quest items found in classic dungeon chests: a crystal shard, a wax seal, a map scrap and a keystone.
const FIND_ICONS: Record<string, readonly string[]> = {
  story_find_2: ['................', '.......ee.......', '......egge......', '.....eggcge.....', '....eggccgge....', '...egcccccgge...', '...eggccccgge...', '....eggccgge....', '.....eggcge.....', '......egge......', '.......ee.......', '................'],
  story_find_4: ['................', '......eeee......', '....eevvvvee....', '...evvvvvvvve...', '..evvVVVVVVvve..', '..evVvvyyvvVve..', '..evVvyyyyvVve..', '..evVvvyyvvVve..', '..evvVVVVVVvve..', '...evvvvvvvve...', '....eevvvvee....', '......eeee......'],
  story_find_6: ['................', '..eeeeeeeeeeee..', '..ekkkkkkkkkke..', '..ekKKKKkkkKke..', '..ekkkkkkkkkke..', '..ekkkkttkkkke..', '..ekkkkttkkkke..', '..ekKKkkkkKKke..', '..ekkkkkkkkkke..', '..eeeeeeeeeeee..', '................', '................'],
  story_find_8: ['................', '......eeee......', '.....euuuue.....', '....euuUUuue....', '....euUyyUue....', '....euUyyUue....', '....euuUUuue....', '....euuuuuue....', '....eUUUUUUe....', '.....eeeeee.....', '................', '................'],
};
Object.assign(ITEM_GRIDS, FIND_ICONS);

// Story clue scrolls (one per chapter): the same parchment with a seal whose colour and shape change.
const CLUE_SEALS: [string, string[]][] = [
  ['v', ['SS', 'SSSS', 'SS']], ['n', ['S.', 'SSSS', '.S']], ['t', ['.SS.', 'SSSS', '.SS.']], ['u', ['SS', 'S.SS', 'SS']],
  ['o', ['.S', 'SSSS', 'S.']], ['a', ['SSSS', '.SS.', 'SSSS']], ['y', ['S.S.', 'SSSS', '.S.S']], ['j', ['SSSS', 'S..S', 'SSSS']],
];
CLUE_SEALS.forEach(([colour, seal], index) => {
  const mid = seal.map(row => row.padStart(Math.ceil((4 + row.length) / 2), '.').padEnd(4, '.').slice(0, 4).replace(/S/g, colour));
  const paper = (body: string) => `.ewwek${body}kewwe.`;
  ITEM_GRIDS[`story_clue_${index + 1}`] = [
    '................', '..eeeeeeeeeeee..', paper('kkkk'), paper(mid[0]), paper(mid[1]), paper(mid[2]), paper('kkkk'), paper('KKKK'),
    '..eeeeeeeeeeee..', '................', '................', '................',
  ];
});

const EMBLEMS = {
  flame: ['..+..', '.++..', '.+*+.', '+***+', '.+++.'],
  bolt: ['..++.', '.++..', '++++.', '..++.', '.++..'],
  swirl: ['.+++.', '....+', '.++.+', '+..+.', '.++..'],
  spear: ['...++', '...++', '..+..', '.+...', '+....'],
  cloud: ['.++..', '+++++', '.....', '.+.+.', '+.+..'],
  sun: ['..+..', '.+++.', '++*++', '.+++.', '..+..'],
  ray: ['+.+.+', '.+++.', '++*++', '.+++.', '+.+.+'],
  blaze: ['+.+.+', '+++++', '+*+*+', '.***.', '.+++.'],
  meteor: ['....+', '...+.', '.++..', '+*++.', '.++..'],
  orb: ['.+++.', '+*+++', '++#++', '+++++', '.+++.'],
  bat: ['+...+', '++.++', '+++++', '+.+.+', '.....'],
  sword: ['....+', '...+.', '+.+..', '.+...', '+.+..'],
  wing: ['...++', '..+++', '.++++', '+++..', '++...'],
  flake: ['+.+.+', '.+++.', '++*++', '.+++.', '+.+.+'],
  volcano: ['..+..', '.+*+.', '..+..', '.###.', '#####'],
  wheel: ['.+++.', '+.+.+', '+++++', '+.+.+', '.+++.'],
  wall: ['+++++', '+.+.+', '+++++', '.+.+.', '+++++'],
  delta: ['..+..', '.+.+.', '.+.+.', '+...+', '+++++'],
  tee: ['+++++', '..+..', '..+..', '..+..', '..+..'],
  cross: ['..+..', '..+..', '+++++', '..+..', '..+..'],
  drop: ['..+..', '.+++.', '+++++', '+*+++', '.+++.'],
  eye: ['.....', '.+++.', '+.#.+', '.+++.', '.....'],
  slime: ['.....', '..+..', '.+++.', '+#+#+', '+++++'],
  zz: ['+++..', '.+...', '+++++', '...+.', '..+++'],
  theta: ['.+++.', '+...+', '+++++', '+...+', '.+++.'],
  heart: ['.+.+.', '+++++', '+++++', '.+++.', '..+..'],
  arrow: ['..+++', '...++', '..+.+', '.+...', '+....'],
  scythe: ['++++.', '....+', '...+.', '..+..', '.+...'],
  fang: ['+...+', '++.++', '+++++', '.+.+.', '.+.+.'],
  moon: ['.++..', '++...', '+....', '++...', '.++..'],
  cross_x: ['+...+', '.+.+.', '..+..', '.+.+.', '+...+'],
  torch: ['.+*+.', '..+..', '.###.', '..#..', '..#..'],
  shield: ['+++++', '+*+++', '+++++', '.+++.', '..+..'],
  hearts: ['++.++', '++.++', '.....', '.+++.', '..+..'],
  star: ['..+..', '..+..', '+++++', '.+.+.', '+...+'],
  leaf: ['...++', '..+++', '.+++.', '+++..', '+....'],
  bee: ['.+.+.', '..+..', '.+#+.', '.+#+.', '..+..'],
} satisfies Record<string, readonly string[]>;

const COVERS: Record<CoverId, [string, string, string, string]> = { // cover, dark, emblem, accent
  fire: ['#B0473C', '#74302A', '#F2C25A', '#5E2620'], thunder: ['#C29A2E', '#7E6018', '#FFF4B0', '#5A4410'],
  wind: ['#4F8A4A', '#2F5A2C', '#D8F0B8', '#1E3E1C'], ice: ['#4E98B8', '#2C6280', '#E4F6FC', '#1E4660'],
  dark: ['#4A3A66', '#2A2040', '#C49AE8', '#1A1428'], light: ['#EDE6D4', '#BFB5A4', '#C8962E', '#8E6C2E'],
  heal: ['#E8C8CC', '#B4868E', '#C8443A', '#7C2E28'], support: ['#CFDCE6', '#8EA4B4', '#2E5E86', '#1E3E58'],
  hostile: ['#9A94A0', '#625C68', '#3A2A56', '#22182E'], earth: ['#8A6A44', '#5A4228', '#F0C880', '#3A2A18'],
  moon: ['#2E3E62', '#1A2440', '#E4E8F6', '#0E1428'], poison: ['#6A8A3A', '#3E5A20', '#E0F0A0', '#26381A'],
  steel: ['#6E7E8A', '#44525C', '#F0F4F6', '#2A343C'],
};

// ---------------------------------------------------------------- spec table

function defaultSpec(id: WeaponId, w: Weapon): Spec {
  const m = metalOf(w);
  const named = NAMED[id];
  const base: Spec = (() => {
    switch (w.type) {
      case 'sword':
        return { kind: 'sword', metal: m, blade: S(8, 2, 'point'), guard: 'cross', grip: 'brown', gem: 'red' };
      case 'lance': return { kind: 'lance', metal: m, head: 'spike', shaft: 'brown', gem: 'red' };
      case 'axe': return { kind: 'axe', metal: m, head: 'axe', shaft: 'brown', gem: 'red' };
      case 'bow': return { kind: 'bow', metal: m, shape: 'bow', gem: 'red' };
      case 'fist': return { kind: 'fist', metal: m, shape: 'gauntlet', gem: 'red' };
      case 'beast': case 'dragon': return { kind: 'stone', metal: m, shape: 'dstone', gem: 'red' };
      case 'staff': return { kind: 'staff', head: 'orb', shaft: 'brown', gem: 'cyan' };
      case 'tome': return { kind: 'book', style: 'tome', cover: 'fire', emblem: 'flame', gem: 'red' };
    }
  })();
  const spec = { ...base, ...(named ? {} : TIERS[w.type]?.[m]), ...named } as Spec;
  if ('metal' in spec && named && !('metal' in named)) spec.metal = m;
  const picked = named as { grip?: GripId; gold?: boolean } | undefined;
  if (spec.kind === 'sword' && !picked?.grip) spec.grip = w.rank === 'A' || w.rank === 'S' ? 'blue' : 'brown';
  if (spec.kind === 'sword' && picked?.gold === undefined) spec.gold = ['silver', 'brave', 'holy', 'royal'].includes(spec.metal);
  return spec;
}

function itemSpec(key: string): Spec | null {
  if (key in WEAPONS) return defaultSpec(key as WeaponId, WEAPONS[key as WeaponId]);
  const item = GAME_ITEMS[key as keyof typeof GAME_ITEMS];
  if (!item) return null;
  if (item.kind === 'spellbook' || item.kind === 'manual') {
    const [cover, emblem] = SPELLS[item.spell ?? ''] ?? ['dark', 'orb'];
    return { kind: 'book', style: item.kind === 'manual' ? 'scroll' : 'grimoire', cover, emblem, gem: 'red' };
  }
  const rows = ITEM_GRIDS[key];
  return rows ? { kind: 'grid', rows } : null;
}

// Two keys whose specs only differ in the gem would otherwise be drawn alike: give each a different gem.
let SPECS: Map<string, Spec> | null = null;
function specs(): Map<string, Spec> {
  if (SPECS) return SPECS;
  SPECS = new Map();
  const used = new Map<string, Set<GemId>>();
  for (const key of Object.keys(GAME_ITEMS)) {
    const spec = itemSpec(key);
    if (!spec) continue;
    if ('gem' in spec) {
      const shape = JSON.stringify({ ...spec, gem: undefined });
      const taken = used.get(shape) ?? new Set<GemId>();
      if (taken.has(spec.gem)) spec.gem = GEM_ORDER.find(g => !taken.has(g)) ?? spec.gem;
      taken.add(spec.gem);
      used.set(shape, taken);
    }
    SPECS.set(key, spec);
  }
  return SPECS;
}

// ---------------------------------------------------------------- painters

function paintSword(img: Icon, s: Extract<Spec, { kind: 'sword' }>): void {
  const { hi, lo } = metal(s.metal);
  const edge = C('#C8443A');
  const gem = C(GEMS[s.gem]);
  const guard = s.gold ? GOLD : DARKIRON;
  const [gh, gl] = GRIPS[s.grip].map(C);
  const gripLen = s.gripLen ?? 2;
  const b = s.blade;
  const g = gripLen + 1;
  const shift = Math.floor((8 - b.len) / 2);
  const sx = 3 + shift - (gripLen - 2), sy = 12 - shift + (gripLen - 2);
  const P = (t: number): [number, number] => [sx + t, sy - t];
  // Blade, row by row along the axis.
  for (let i = 0; i < b.len; i++) {
    const [x, y] = P(g + 1 + i);
    const width = b.leaf ? (i >= Math.floor(b.len * 0.3) && i <= Math.ceil(b.len * 0.65) ? 3 : 2) : b.width;
    let offs: [number, 'hi' | 'lo' | 'edge' | 'mid'][] =
      width === 1 ? [[0, 'hi']] : width === 2 ? [[0, 'hi'], [1, 'lo']] : [[-1, 'hi'], [0, b.fuller ? 'mid' : 'hi'], [1, 'lo']];
    const last = i === b.len - 1;
    if (b.tip === 'wedge' && i >= b.len - 3) offs = [[-1, 'hi'], [0, 'hi'], [1, 'lo']];
    if (last && b.tip === 'point') offs = [[0, 'hi']];
    if (last && b.tip === 'wedge') offs = [[-1, 'hi'], [0, 'hi']];
    if (b.edge && i > 0 && !last) offs = offs.map(([dx, r]) => [dx, r === 'lo' ? 'edge' : r]);
    if (b.fuller && (i === 0 || i >= b.len - 2)) offs = offs.map(([dx, r]) => [dx, r === 'mid' ? 'hi' : r]);
    if (b.serrate && i % 2 === 1 && !last) offs.push([width === 3 ? -2 : -1, 'lo']);
    if (b.hook && i === b.len - 3) offs.push([2, 'lo']);
    let dx0 = 0;
    if (b.curve) dx0 = (i >= Math.ceil(b.len / 2) ? 1 : 0) + (b.curve === 2 && i >= b.len - 2 ? 1 : 0);
    if (b.bolt) dx0 = [0, 0, 1, 1, 0, 0, 1, 1][i] ?? 0;
    for (const [dx, r] of offs) img.set(x + dx + dx0, y, r === 'hi' ? hi : r === 'lo' ? lo : r === 'edge' ? edge : gem);
  }
  // Guard across the axis, through G = P(g).
  const [gx, gy] = P(g);
  const across = (k: number) => img.set(gx + k, gy + k, k <= 0 ? guard.hi : guard.lo);
  const span = { none: 0, small: 1, cross: 2, wide: 3, wing: 2, horn: 2, disc: 1, ring: 1 }[s.guard];
  for (let k = -span; k <= span; k++) across(k);
  if (s.guard === 'none') img.set(gx, gy, guard.lo);
  if (s.guard === 'wing') { img.set(gx - 1, gy - 3, guard.hi); img.set(gx + 3, gy + 1, guard.lo); }
  if (s.guard === 'horn') { img.set(gx - 3, gy - 1, guard.hi); img.set(gx + 1, gy + 3, guard.lo); }
  if (s.guard === 'disc') for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) img.set(gx + dx, gy + dy, guard.lo);
  if (s.guard === 'ring') for (const [dx, dy] of [[1, 2], [0, 3], [-1, 4], [-2, 4]]) img.set(gx + dx, gy + dy, guard.hi);
  // Grip with alternating wraps, pommel gem.
  for (let t = 1; t <= gripLen; t++) { const [x, y] = P(t); img.set(x, y, t % 2 ? gh : gl); }
  const [px, py] = P(0);
  img.set(px, py, gem);
}

function paintFan(img: Icon, s: Extract<Spec, { kind: 'fan' }>): void {
  const { hi, lo } = metal(s.metal);
  // Folded war fan: ribs spread from the rivet at the bottom left.
  const rib = C('#2E2A36');
  for (let y = 0; y < ICON_SIZE; y++) for (let x = 0; x < ICON_SIZE; x++) {
    const dx = x - 3, dy = y - 12;
    const r = Math.hypot(dx, dy), angle = Math.atan2(-dy, dx); // 0 = right, π/2 = up
    if (r < 2.5 || r > 10.5 || angle < 0.05 || angle > Math.PI / 2 - 0.05) continue;
    const band = Math.floor(angle / (Math.PI / 2 / 6));
    img.set(x, y, r <= 4.5 ? rib : r > 9.5 || band % 2 === 0 ? lo : hi);
  }
  for (let r = 1; r <= 4; r++) { img.set(3 + r, 12, rib); img.set(3, 12 - r, rib); }
  img.set(3, 12, C(GEMS[s.gem]));
}

function paintLance(img: Icon, s: Extract<Spec, { kind: 'lance' }>): void {
  const { hi, lo } = metal(s.metal);
  const [sh, sl] = GRIPS[s.shaft].map(C);
  const gem = C(GEMS[s.gem]);
  const P = (t: number): [number, number] => [2 + t, 13 - t];
  const start = s.short ? 3 : 0;
  const headAt = s.head === 'broad' || s.head === 'glaive' ? 8 : 9;
  for (let t = start; t < headAt; t++) { const [x, y] = P(t); img.set(x, y, t % 4 === 3 ? sl : sh); }
  const [bx, by] = P(start);
  img.set(bx, by, lo);
  if (s.short) { img.set(bx - 1, by, C('#F0EADF')); img.set(bx, by + 1, C('#F0EADF')); }
  const rows: Record<LanceHead, [number, [number, 'h' | 'l'][]][]> = {
    spike: [[9, [[0, 'h'], [1, 'l']]], [10, [[0, 'h'], [1, 'l']]], [11, [[0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
    needle: [[9, [[0, 'h'], [1, 'l']]], [10, [[0, 'h']]], [11, [[0, 'h']]], [12, [[0, 'h']]]],
    leaf: [[9, [[0, 'h'], [1, 'l']]], [10, [[-1, 'h'], [0, 'h'], [1, 'l']]], [11, [[0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
    broad: [[8, [[0, 'h'], [1, 'l']]], [9, [[-1, 'h'], [0, 'h'], [1, 'l']]], [10, [[-1, 'h'], [0, 'h'], [1, 'l']]], [11, [[-1, 'h'], [0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
    halberd: [[9, [[-1, 'l'], [0, 'h'], [1, 'l'], [2, 'h'], [3, 'l']]], [10, [[0, 'h'], [1, 'l'], [2, 'l']]], [11, [[0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
    trident: [[9, [[0, 'h']]], [10, [[0, 'h']]], [11, [[0, 'h']]], [12, [[0, 'h']]]],
    hook: [[9, [[0, 'h'], [1, 'l']]], [10, [[0, 'h'], [1, 'l'], [2, 'l']]], [11, [[0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
    glaive: [[8, [[0, 'h'], [1, 'l']]], [9, [[0, 'h'], [1, 'l'], [2, 'l']]], [10, [[0, 'h'], [1, 'h'], [2, 'l']]], [11, [[1, 'h'], [2, 'l']]], [12, [[1, 'h']]]],
    winged: [[9, [[0, 'h'], [1, 'l']]], [10, [[-1, 'h'], [0, 'h'], [1, 'l']]], [11, [[0, 'h'], [1, 'l']]], [12, [[0, 'h']]]],
  };
  for (const [t, cells] of rows[s.head]) { const [x, y] = P(t); for (const [dx, r] of cells) img.set(x + dx, y, r === 'h' ? hi : lo); }
  if (s.head === 'hook') { const [x, y] = P(9); img.set(x + 3, y, lo); }
  if (s.head === 'trident') {
    const [x, y] = P(9);
    for (let k = -2; k <= 2; k++) img.set(x + k, y + k, lo);
    for (const j of [1, 2]) { img.set(x - 2 + j, y - 2 - j, hi); img.set(x + 2 + j, y + 2 - j, hi); }
  }
  if (s.head === 'winged') { const [x, y] = P(8); for (const k of [-2, -1, 1, 2]) img.set(x + k, y + k, k < 0 ? GOLD.hi : GOLD.lo); img.set(x, y, GOLD.lo); }
  // Tassel just under the head, or a banner for the commander's lance.
  const [tx, ty] = P(headAt - 1);
  if (s.banner) {
    const [fx, fy] = P(6);
    for (let dy = 0; dy < 3; dy++) for (let dx = 1; dx <= 3; dx++) img.set(fx + dx, fy + dy, gem);
    img.set(fx + 3, fy + 2, C('#7C2E28'));
    img.set(fx + 2, fy + 1, GOLD.hi);
  } else if (s.head !== 'winged') {
    img.set(tx + 1, ty + 1, gem);
  } else {
    img.set(tx - 1, ty + 1, gem);
  }
  if (s.glint) {
    const [x, y] = P(12);
    img.set(x - 1, y - 1, C('#FFFFFF'));
    img.set(x + 1, y + 1, C('#FFF4B0'));
  }
}

function paintAxe(img: Icon, s: Extract<Spec, { kind: 'axe' }>): void {
  const { hi, lo } = metal(s.metal);
  const shine = lift(hi, 0.6);
  const [sh, sl] = GRIPS[s.shaft].map(C);
  const gem = C(GEMS[s.gem]);
  const short = s.head === 'hand' || s.head === 'tomahawk';
  const top = s.head === 'poleaxe' ? 10 : short ? 8 : 9;
  const start = short ? 3 : 0;
  const P = (t: number): [number, number] => [2 + t, 13 - t];
  const shaftEnd = s.head === 'club' ? 6 : top;
  for (let t = start; t <= shaftEnd; t++) { const [x, y] = P(t); img.set(x, y, t % 3 === 2 ? sl : sh); }
  const [ox, oy] = P(top - 1);
  const fan = (b0: number, b1: number, w0: number, k: number) => (a: number, b: number) => b >= b0 && b <= b1 && Math.abs(a) <= w0 + (b - b0) * k;
  switch (s.head) {
    case 'axe': case 'hand':
      region(img, ox, oy, (a, b) => fan(0.5, s.head === 'hand' ? 2.5 : 3.5, 0.6, 0.45)(a, b) || (b >= -1 && b < 0.5 && Math.abs(a) <= 0.5), hi, lo, shine);
      break;
    case 'great':
      region(img, ox, oy, (a, b) => fan(0.5, 4, 0.8, 0.55)(a, b) || (b >= -1.5 && b < 0.5 && Math.abs(a) <= 1), hi, lo, shine);
      break;
    case 'double':
      region(img, ox, oy, (a, b) => fan(0.5, 3.2, 0.6, 0.5)(a, b) || fan(0.5, 3.2, 0.6, 0.5)(a, -b) || (Math.abs(b) < 0.5 && Math.abs(a) <= 0.5), hi, lo, shine);
      break;
    case 'tomahawk':
      region(img, ox, oy, (a, b) => (b >= 0.5 && b <= 2.5 && a >= -0.5 && a <= 0.5 + (b - 0.5) * 0.5) || (b <= 0 && b >= -2 && Math.abs(a) <= 0.5 - (-b) * 0.2), hi, lo, shine);
      break;
    case 'poleaxe':
      region(img, ox, oy, (a, b) => (b >= 0.5 && b <= 2.5 && Math.abs(a + 0.5) <= 0.5 + (b - 0.5) * 0.4) || (Math.abs(b) < 0.5 && a >= 0 && a <= 2.5), hi, lo, shine);
      break;
    case 'hammer':
      region(img, ox, oy, (a, b) => Math.abs(b) <= 2.5 && a >= -0.5 && a <= 1.5, hi, lo, shine);
      break;
    case 'mace':
      region(img, ox, oy, (a, b) => (a - 1) ** 2 + b ** 2 <= 3.2, hi, lo, shine);
      for (const [a, b] of [[3, 0], [1, 2.5], [1, -2.5], [-1, 0]]) img.set(ox + Math.round(a + b), oy + Math.round(b - a), lo);
      break;
    case 'shield':
      region(img, ox, oy, (a, b) => a ** 2 + (b - 0.5) ** 2 <= 5.2, hi, lo, shine);
      img.set(ox + 1, oy, gem);
      break;
    case 'club': {
      const [cx, cy] = P(6);
      region(img, cx, cy, (a, b) => a >= 0 && a <= 4.5 && Math.abs(b) <= 0.5 + a * 0.25, hi, lo, lift(hi, 0.3));
      for (const [a, b] of [[2, -1], [3, 1], [4, 0]]) img.set(cx + a + b, cy + b - a, GOLD.lo);
      break;
    }
  }
  const [bx, by] = P(start);
  img.set(bx, by, gem);
}

const BOWS: Record<BowShape, readonly string[]> = {
  bow: [
    '................',
    '.....222........',
    '.....K.12.......',
    '.....K..12......',
    '.....K...12.....',
    '.....K...12.....',
    '.....K....12....',
    '.....K....452...',
    '.....K....562...',
    '.....K....12....',
    '.....K...12.....',
    '.....K...12.....',
    '.....K..12......',
    '.....K.12.......',
    '.....222........',
  ],
  short: [
    '................',
    '................',
    '................',
    '......222.......',
    '......K.12......',
    '......K..12.....',
    '......K...12....',
    '......K...452...',
    '......K...562...',
    '......K...12....',
    '......K..12.....',
    '......K.12......',
    '......222.......',
  ],
  long: [
    '.....22.........',
    '.....K12........',
    '.....K.12.......',
    '.....K..12......',
    '.....K...12.....',
    '.....K....12....',
    '.....K....12....',
    '.....K.....452..',
    '.....K.....562..',
    '.....K....12....',
    '.....K....12....',
    '.....K...12.....',
    '.....K..12......',
    '.....K.12.......',
    '.....K12........',
    '.....22.........',
  ],
  recurve: [
    '................',
    '...222..........',
    '.....K112.......',
    '.....K..12......',
    '.....K...12.....',
    '.....K....12....',
    '.....K....12....',
    '.....K....452...',
    '.....K....562...',
    '.....K....12....',
    '.....K....12....',
    '.....K...12.....',
    '.....K..12......',
    '.....K112.......',
    '...222..........',
  ],
};

const FISTS: Record<FistShape, readonly string[]> = {
  gauntlet: [
    '................',
    '................',
    '................',
    '................',
    '.......11.11....',
    '......1111111...',
    '.....111111111..',
    '..555111111211..',
    '..545122221211..',
    '..555111121211..',
    '..545111112211..',
    '..555.2222222...',
  ],
  knuckle: [
    '................',
    '................',
    '................',
    '................',
    '...11.11.11.11..',
    '..1331331331311.',
    '..1221221221221.',
    '...111111111111.',
    '....2.....2.....',
    '....2.....2.....',
    '....555555555...',
    '....565656545...',
    '....555555555...',
  ],
  claw: [
    '................',
    '...3...3...3....',
    '...13..13..13...',
    '...13..13..13...',
    '....13..13..13..',
    '....12..12..12..',
    '...5555555555...',
    '...5666666665...',
    '...5655665565...',
    '...5666466665...',
    '...5555555555...',
    '....56....65....',
  ],
  katar: [
    '................',
    '.......3........',
    '.......13.......',
    '......1112......',
    '......1112......',
    '......1112......',
    '......1112......',
    '.....111122.....',
    '...5.......5....',
    '...5.55555.5....',
    '...5.56465.5....',
    '...5.55555.5....',
    '...555555555....',
  ],
  wheel: [
    '................',
    '.....#....#.....',
    '....##.11.##....',
    '.....112211.....',
    '....1#....#1....',
    '...12......12...',
    '...12..44..12...',
    '...12..44..12...',
    '...12......12...',
    '....1#....#1....',
    '.....112211.....',
    '....##.22.##....',
    '.....#....#.....',
  ],
  spiked: [
    '................',
    '................',
    '.......3..3.....',
    '.......1..1.....',
    '.......11.11....',
    '......1111111...',
    '.....111111111..',
    '..555111111211..',
    '..545122221211..',
    '..555111121211..',
    '..545111112211..',
    '..555.2222222...',
  ],
  heavy: [
    '................',
    '................',
    '................',
    '......111111....',
    '.....13131311...',
    '....1111111121..',
    '..5511111111121.',
    '..5412222221121.',
    '..5511111111221.',
    '..5412222221121.',
    '..55111111112...',
    '...5.22222222...',
  ],
  lizard: [
    '................',
    '.......#..#.....',
    '......#3.#3.....',
    '.......1..1.....',
    '.......11.11....',
    '......1111111...',
    '.....111211121..',
    '..555121112121..',
    '..545112121211..',
    '..555121211211..',
    '..545111112211..',
    '..555.2222222...',
  ],
  wing: [
    '................',
    '.k..............',
    '.kk.............',
    '.kkk...11.11....',
    '..kkk.1111111...',
    '...kk111111111..',
    '..555111111211..',
    '..545122221211..',
    '..555111121211..',
    '..545111112211..',
    '..555.2222222...',
  ],
  radiant: [
    '................',
    '........*.......',
    '.....*..*..*....',
    '......*...*.....',
    '...*...11.11..*.',
    '......1111111...',
    '.....111111111..',
    '..555111111211..',
    '..545122221211..',
    '..555111121211..',
    '..545111112211..',
    '..555.2222222...',
  ],
};

const STONES: Record<StoneShape, readonly string[]> = {
  claw: [
    '................',
    '................',
    '............32..',
    '...........32...',
    '........32.32...',
    '.......32.32....',
    '....32.32.32....',
    '...32.32.32.....',
    '...32.32.32.....',
    '..hhhhhhhhh.....',
    '..hhHhhHhhh.....',
    '..hhhhhhhhh.....',
    '..WWWWWWWWW.....',
    '..W4WWWWW4W.....',
    '..WWWWWWWWW.....',
  ],
  fang: [
    '................',
    '................',
    '.....5555.......',
    '....5....5......',
    '...5......5.....',
    '...5.3311.5.....',
    '....53112.5.....',
    '.....3112..5....',
    '.....3112..5....',
    '......112..5....',
    '......112.5.....',
    '.......12.5.....',
    '.......2..4.....',
  ],
  stone: [
    '................',
    '................',
    '......2222......',
    '.....233112.....',
    '....23111112....',
    '...2311hh1112...',
    '...211h44h112...',
    '...2111hh1112...',
    '....21111122....',
    '.....222222.....',
    '....yyyyyyyy....',
    '....YYYYYYYY....',
  ],
  thunderfang: [
    '................',
    '..........3.....',
    '.....5555.31....',
    '....5....5.31...',
    '...5......5.3...',
    '...5.3311.5.....',
    '....53112.5.....',
    '.....3112..5....',
    '.....3112..5....',
    '......112..5....',
    '......112.5.....',
    '.......12.5.....',
    '.......2..4.....',
  ],
  dstone: [
    '................',
    '................',
    '.......11.......',
    '......1331......',
    '.....133112.....',
    '....13311112....',
    '....13111122....',
    '....11111122....',
    '....11111222....',
    '.....111222.....',
    '......1222......',
    '.......42.......',
  ],
  dstoneplus: [
    '................',
    '......yyy.......',
    '.....y111y......',
    '....y13311y.....',
    '...y1331111y....',
    '...y1311112y....',
    '...y1111112y....',
    '...y1111122y....',
    '....y11122y.....',
    '.....y122y......',
    '......y4y.......',
    '.......y........',
  ],
  breath: [
    '................',
    '..........1.....',
    '........113.....',
    '.......1131.....',
    '......11331..1..',
    '.....113311.11..',
    '....1133311131..',
    '...113333111....',
    '...12333311.....',
    '...1223331......',
    '....122211......',
    '.....4222.......',
  ],
  icebreath: [
    '................',
    '.......3........',
    '....3..1..3.....',
    '.....3.1.3......',
    '......313.......',
    '...3111311113...',
    '......313.......',
    '.....3.1.3......',
    '....3..1..3.....',
    '.......2...22...',
    '...22.....2222..',
    '..22222.4222222.',
  ],
};

function paintGrid(img: Icon, rows: readonly string[], pal: Pal, oy?: number): void {
  // Centre short grids vertically: content rows sit in the middle of the 16 pixels.
  const top = rows.findIndex(r => /[^.]/.test(r));
  const bottom = rows.length - 1 - [...rows].reverse().findIndex(r => /[^.]/.test(r));
  const shift = oy ?? Math.floor((ICON_SIZE - (bottom - top + 1)) / 2) - top;
  img.grid(rows, pal, 0, shift);
}

function metalPal(id: MetalId, gem: GemId): Pal {
  const { hi, lo } = metal(id);
  return { 1: hi, 2: lo, 3: lift(hi, 0.6), 4: C(GEMS[gem]), 5: C('#9A683C'), 6: C('#5E3E24'), '#': C('#E87A2A'), '*': C('#FFF4B0') };
}

function paintStaff(img: Icon, s: Extract<Spec, { kind: 'staff' }>): void {
  const [sh, sl] = GRIPS[s.shaft].map(C);
  const gem = C(GEMS[s.gem]);
  const P = (t: number): [number, number] => [2 + t, 13 - t];
  const top = s.long ? 9 : 8;
  for (let t = 0; t <= top; t++) { const [x, y] = P(t); img.set(x, y, t % 3 === 2 ? sl : sh); }
  img.set(...P(0), GOLD.lo);
  const [ox, oy] = P(top);
  const gold = (inside: (a: number, b: number) => boolean) => region(img, ox, oy, inside, GOLD.hi, GOLD.lo, lift(GOLD.hi, 0.5));
  const dot = (a: number, b: number, c: Rgba) => img.set(ox + Math.round(a + b), oy + Math.round(b - a), c);
  switch (s.head) {
    case 'orb':
      gold((a, b) => a >= 0 && a <= 1 && Math.abs(b) <= 1.5 && !(a > 0.5 && Math.abs(b) < 1));
      region(img, ox, oy, (a, b) => (a - 2) ** 2 + b ** 2 <= 1.3, gem, gem, lift(gem, 0.5));
      break;
    case 'ring':
      gold((a, b) => { const r = (a - 2) ** 2 + b ** 2; return r >= 1.2 && r <= 3.3; });
      dot(2, 0, gem);
      break;
    case 'cross':
      gold((a, b) => (Math.abs(b) <= 0.5 && a >= 0 && a <= 3.5) || (Math.abs(a - 2) <= 0.5 && Math.abs(b) <= 1.5));
      dot(2, 0, gem);
      break;
    case 'leaf':
      region(img, ox, oy, (a, b) => a >= 0.5 && a <= 4 && Math.abs(b) <= 1.4 * Math.sin(Math.PI * (a - 0.5) / 3.5), C('#7FA35A'), C('#4F6E38'), C('#A8D878'));
      dot(1, 0, gem);
      break;
    case 'tri':
      gold((a, b) => a >= 0 && a <= 1 && Math.abs(b) <= 0.5);
      for (const [a, b] of [[2.5, 0], [1.5, 1.5], [1.5, -1.5]]) region(img, ox, oy, (u, v) => (u - a) ** 2 + (v - b) ** 2 <= 0.6, gem, gem, lift(gem, 0.5));
      break;
    case 'crook':
      gold((a, b) => { const r = (a - 2) ** 2 + (b - 1) ** 2; return (r >= 0.9 && r <= 2.6 && !(b > 1 && a < 2)) || (Math.abs(b) <= 0.5 && a >= 0 && a <= 1.5); });
      dot(3.5, 1, gem);
      break;
    case 'star':
      gold((a, b) => (Math.abs(b) <= 0.5 && a >= 0 && a <= 4) || (Math.abs(a - 2) <= 0.5 && Math.abs(b) <= 2) || (Math.abs(a - 2) === Math.abs(b) && Math.abs(b) <= 1));
      dot(2, 0, gem);
      break;
    case 'mute':
      region(img, ox, oy, (a, b) => (a - 2) ** 2 + b ** 2 <= 2.6, C('#55505E'), C('#2E2A36'), C('#8C8898'));
      dot(1.5, -0.5, gem); dot(2.5, 0.5, gem);
      break;
    case 'moon':
      region(img, ox, oy, (a, b) => (a - 2) ** 2 + b ** 2 <= 3 && (a - 2.6) ** 2 + (b - 0.9) ** 2 > 1.4, C('#F7E9A8'), C('#C8A848'), C('#FFFFFF'));
      dot(1, 0, gem);
      break;
  }
}

function paintBook(img: Icon, s: Extract<Spec, { kind: 'book' }>): void {
  const [cover, dark, sign, accent] = COVERS[s.cover].map(C);
  const pal: Pal = { 9: cover, 0: dark, 4: C(GEMS[s.gem]), 7: GOLD.hi, 8: GOLD.lo };
  const emblem = EMBLEMS[s.emblem];
  const ePal: Pal = { '+': sign, '*': lift(sign, 0.6), '#': accent };
  if (s.style === 'grimoire') {
    img.grid([
      '................',
      '..0799999997k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0999999999k...',
      '..0799999997k...',
      '...0kkkkkkkkk...',
      '..........4.....',
      '..........4.....',
    ], pal);
    img.grid(emblem, ePal, 5, 4);
  } else if (s.style === 'tome') {
    img.grid([
      '................',
      '................',
      '...0999999999K..',
      '..00799999997kK.',
      '..00999999999kK.',
      '..00999999999kK.',
      '..00999999999kK.',
      '..00999999999788',
      '..00999999999784',
      '..00999999999788',
      '..00999999999kK.',
      '..00799999997kK.',
      '...0kkkkkkkkkK..',
      '....KKKKKKKKK...',
    ], pal);
    img.grid(emblem, ePal, 6, 4);
  } else {
    img.grid([
      '................',
      '................',
      '................',
      '..80000000000...',
      '.8kkkkkkkkkkk8..',
      '.8kkkkkkkkkkk8..',
      '.8kkkkkkkkkkk8..',
      '.8kkkkkkkkkkk8..',
      '.8kkkkkkkkkkk8..',
      '.8kkkkkkkkkkk8..',
      '.8kKKKKKKKKKk8..',
      '..80000000000.4.',
      '..............4.',
    ], { ...pal, k: C('#F0E2C0'), K: C('#C8B490'), 8: GOLD.lo, 0: dark });
    img.grid(emblem, { ...ePal, '+': cover, '*': lift(cover, 0.5), '#': dark }, 5, 5);
  }
}

// ---------------------------------------------------------------- entry points

// Any 16x16 grid in the same style (hex palette per character, '.' empty, outlined): the tavern frogs use it.
export function drawPixelGrid(rows: readonly string[], palette: Record<string, string>): Uint8ClampedArray {
  const img = new Icon();
  img.grid(rows, Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, C(v)])));
  img.outline();
  return img.data();
}

// Every key with an icon: all GAME_ITEMS (weapons, spellbooks, manuals and items).
export function iconKeys(): string[] {
  return [...specs().keys()];
}

// The 16x16 RGBA pixels of one item's icon, or null for an unknown key.
export function drawItemIcon(key: string): Uint8ClampedArray | null {
  const spec = specs().get(key);
  if (!spec) return null;
  const img = new Icon();
  switch (spec.kind) {
    case 'sword': paintSword(img, spec); break;
    case 'fan': paintFan(img, spec); break;
    case 'lance': paintLance(img, spec); break;
    case 'axe': paintAxe(img, spec); break;
    case 'bow': paintGrid(img, BOWS[spec.shape], metalPal(spec.metal, spec.gem)); break;
    case 'fist': paintGrid(img, FISTS[spec.shape], metalPal(spec.metal, spec.gem)); break;
    case 'stone': paintGrid(img, STONES[spec.shape], metalPal(spec.metal, spec.gem)); break;
    case 'staff': paintStaff(img, spec); break;
    case 'book': paintBook(img, spec); break;
    case 'grid': paintGrid(img, spec.rows, {}); break;
  }
  img.outline();
  return img.data();
}
