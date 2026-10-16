import type { ClassRoute } from '../data/classes.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import type { RngState } from '../engine/rng.ts';
import type { Accessory, BrowStyle, EyeStyle, FaceId, HairStyle, Mouth, Outfit, PortraitSpec } from './draw.ts';

// Random portraits for characters without a hand-made one (docs/00 §3.3 随机角色, generic enemies).
// The same seed and options always give the same spec. Every slot below draws exactly once whatever
// the options, so a unit keeps its face, hair and eyes when it changes route or side; only clothes
// and headwear follow the route.
export type Sex = 'female' | 'male';
export interface PortraitOptions {
  sex?: Sex;
  route?: ClassRoute;
  side?: 'player' | 'enemy';
}

type Weighted<T> = readonly (readonly [T, number])[];

function pick<T>(rng: RngState, table: Weighted<T>): T {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let r = (nextU32(rng) / 4294967296) * total;
  for (const [value, w] of table) {
    if (r < w) return value;
    r -= w;
  }
  return table[table.length - 1][0];
}
const even = <T>(items: readonly T[]): Weighted<T> => items.map(item => [item, 1] as const);
const chance = (rng: RngState, percent: number) => nextU32(rng) % 100 < percent;

// Palettes, mostly taken from the hand-made roster in gen_art.py.
const SKINS = even<[string, string]>([
  ['#F6D4B8', '#D8A88A'], ['#EEDACA', '#C9AE9A'], ['#F2CCA8', '#CF9A78'], ['#F0C49C', '#CF956E'],
  ['#EEC4A0', '#C9906C'], ['#D9A57A', '#B07A56'], ['#D29C74', '#A8704E'], ['#B57E58', '#8C5A3C'],
  ['#8E5E40', '#6A4228'],
]);
const HAIRS: Weighted<[string, string, string]> = [
  [['#3A2A1E', '#5A4430', '#20160E'], 3], // near black
  [['#2C2A34', '#4A4656', '#18161E'], 2], // blue black
  [['#4A3626', '#6E523A', '#2A1E14'], 3], // dark brown
  [['#6B4A2E', '#8E6A44', '#4A321E'], 3], // brown
  [['#9A4430', '#C8673F', '#5E241A'], 2], // auburn
  [['#B5452B', '#DD7448', '#7A2A1A'], 2], // red
  [['#C99A4A', '#E6C072', '#8E6A2E'], 2], // straw
  [['#D6B060', '#F0D488', '#9A7A38'], 2], // gold
  [['#E6D49A', '#FFF2C6', '#B09C62'], 2], // pale blond
  [['#CDD1D8', '#F2F4F8', '#8E949E'], 1], // silver
  [['#B4B2AA', '#DEDCD4', '#77756E'], 1], // grey
  [['#4E3A5E', '#6E5A86', '#2E2238'], 1], // violet
  [['#C77A86', '#E8A6AE', '#8E4A56'], 1], // pink
  [['#3E5E8E', '#5E82B4', '#24385A'], 1], // blue
  [['#4E7A4A', '#70A068', '#2E4A2C'], 1], // green
];
const EYES = even<[string, string]>([
  ['#C0863A', '#4A2E16'], ['#6E4A2A', '#3A2614'], ['#5C7A92', '#2E3E4C'], ['#3E86B8', '#1E3E5E'],
  ['#4E7A3A', '#26401C'], ['#7A5AA8', '#3A2A56'], ['#4A3A2A', '#2A1E14'], ['#B0473C', '#5E1E1A'],
  ['#C08A2A', '#5A3A10'], ['#4E8A5A', '#24442A'], ['#3E6A9A', '#1E3450'], ['#2A1E14', '#120C08'],
]);
type Cloth = [string, string, string, string];
const ALLY_CLOTH = even<Cloth>([
  ['#34556B', '#22394A', '#5A7E98', '#D4AA52'], ['#7A5236', '#56381F', '#9A7048', '#D4AA52'],
  ['#5F6E3A', '#46522A', '#7E8E50', '#D4AA52'], ['#3E5E56', '#2A443E', '#5A7E74', '#D4AA52'],
  ['#3A3E4E', '#262A36', '#50566A', '#2E3A4E'], ['#5A4232', '#3E2C20', '#7A5A44', '#D4AA52'],
  ['#8E3A34', '#5E241F', '#B4544A', '#D4AA52'], ['#3F6B4A', '#2A4A32', '#5E8C66', '#D4AA52'],
]);
const ENEMY_CLOTH = even<Cloth>([
  ['#7A3A30', '#56261F', '#9A5244', '#8E6C2E'], ['#8E3A34', '#5E241F', '#B4544A', '#D4AA52'],
  ['#6A2A3A', '#461A26', '#8E4252', '#8E6C2E'], ['#3E3A3A', '#282424', '#5A5454', '#A84940'],
  ['#5A4232', '#3E2C20', '#7A5A44', '#8E6C2E'], ['#7A5236', '#56381F', '#9A7048', '#8E6C2E'],
]);
// Plate is painted with the cloth colors as metal; priest robes and pegasus whites stay pale.
const METAL = { player: even<Cloth>([['#9EA6AA', '#5E666C', '#D2D8DA', '#D4AA52'], ['#A6AEB2', '#626A70', '#DCE2E4', '#3E6A9A']]),
  enemy: even<Cloth>([['#6E767C', '#3E464C', '#A2AAAE', '#A84940'], ['#5E5A56', '#3A3634', '#8E8A84', '#A84940']]) };
const PALE = even<Cloth>([['#ECE6DA', '#C2B8A6', '#FFFFFF', '#D4AA52'], ['#E4E0D6', '#B9B2A2', '#FFFFFF', '#D4AA52'], ['#EEE8DC', '#C4BAA8', '#FFFFFF', '#D4AA52']]);
const BANDS = even<[string, string]>([
  ['#EEE8DC', '#BFB5A4'], ['#A84940', '#74302A'], ['#5E2A24', '#3E1A16'], ['#3E6A9A', '#24405E'], ['#5F6E3A', '#46522A'], ['#D4AA52', '#8E6C2E'],
]);
const STOLES = even(['#34556B', '#536D49', '#8E3A34', '#5A4278']);

interface Looks { face: Weighted<FaceId>; style: Weighted<HairStyle>; eyes: Weighted<EyeStyle>; brows: Weighted<BrowStyle>; mouth: Weighted<Mouth>; blush: number }
const LOOKS: Record<Sex, Looks> = {
  female: {
    face: [['oval', 5], ['sharp', 3], ['round', 3]],
    style: [['long', 5], ['ponytail', 4], ['bob', 4], ['braid', 3], ['neat', 2], ['swept', 2]],
    eyes: [['big', 6], ['calm', 3], ['narrow', 1]],
    brows: [['soft', 7], ['stern', 3]],
    mouth: [['neutral', 8], ['smile', 8], ['smirk', 2], ['grim', 1], ['grin', 1]],
    blush: 30,
  },
  male: {
    face: [['standard', 4], ['square', 3], ['long', 2], ['broad', 2]],
    style: [['neat', 5], ['spiky', 4], ['swept', 4], ['slick', 3], ['wild', 2], ['bald', 1], ['long', 1], ['ponytail', 1]],
    eyes: [['big', 3], ['calm', 3], ['narrow', 4]],
    brows: [['soft', 3], ['stern', 4], ['heavy', 3]],
    mouth: [['neutral', 4], ['smile', 2], ['grim', 2], ['grin', 1], ['smirk', 2]],
    blush: 0,
  },
};

type Headwear = 'none' | 'headband' | 'bandana' | 'circlet' | 'hood' | 'helm';
interface Kit { outfit: Weighted<Outfit>; headwear: Weighted<Headwear>; glasses: number; mask: number }
const KIT_DEFAULT: Kit = { outfit: even(['tunic', 'vest', 'armor', 'light', 'cloak', 'robe', 'scarf']), headwear: [['none', 8], ['headband', 1], ['circlet', 1]], glasses: 5, mask: 0 };
const KITS: Record<ClassRoute, Kit> = {
  sword: { ...KIT_DEFAULT, outfit: [['tunic', 5], ['scarf', 2], ['light', 2], ['vest', 1]] },
  axe: { ...KIT_DEFAULT, outfit: [['vest', 6], ['fur', 4]], headwear: [['none', 5], ['bandana', 4], ['headband', 1]], glasses: 0 },
  armor: { ...KIT_DEFAULT, outfit: [['plate', 7], ['armor', 3]], headwear: [['none', 6], ['helm', 4]], glasses: 0 },
  cavalry: { ...KIT_DEFAULT, outfit: [['armor', 7], ['tunic', 3]] },
  flying: { ...KIT_DEFAULT, outfit: [['light', 6], ['armor', 4]] },
  bow: { ...KIT_DEFAULT, outfit: [['cloak', 5], ['tunic', 5]], headwear: [['none', 7], ['hood', 3]] },
  magic: { ...KIT_DEFAULT, outfit: [['robe', 7], ['cloak', 3]], headwear: [['none', 8], ['circlet', 2]], glasses: 20 },
  healing: { ...KIT_DEFAULT, outfit: [['priest', 7], ['robe', 3]], headwear: [['none', 7], ['circlet', 3]], glasses: 15 },
  stealth: { ...KIT_DEFAULT, outfit: [['cloak', 5], ['scarf', 5]], headwear: [['none', 5], ['hood', 5]], mask: 35 },
  fist: { ...KIT_DEFAULT, outfit: [['vest', 6], ['tunic', 4]], headwear: [['none', 5], ['headband', 5]], glasses: 0 },
  beast: { ...KIT_DEFAULT, outfit: [['fur', 7], ['vest', 3]], glasses: 0 },
  dragon: { ...KIT_DEFAULT, outfit: [['robe', 5], ['armor', 5]] },
};

export function randomPortrait(seed: string, opts: PortraitOptions = {}): PortraitSpec {
  const rng = seedRng(`portrait:${seed}`);
  // who they are: never depends on route or side
  const rolledSex: Sex = chance(rng, 50) ? 'female' : 'male';
  const sex = opts.sex ?? rolledSex;
  const looks = LOOKS[sex];
  const skin = pick(rng, SKINS);
  const hair = pick(rng, HAIRS);
  const eye = pick(rng, EYES);
  const face = pick(rng, looks.face);
  const ownStyle = pick(rng, looks.style);
  const eyes = pick(rng, looks.eyes);
  const brows = pick(rng, looks.brows);
  const mouth = pick(rng, looks.mouth);
  const blush = chance(rng, looks.blush);
  const facialHair = pick<Accessory | null>(rng, [[null, 14], ['mustache', 3], ['beard', 3]]);
  const scar = chance(rng, sex === 'male' ? 8 : 3);
  const scarNear = chance(rng, sex === 'male' ? 8 : 3);
  const glassesRoll = nextU32(rng) % 100;
  // what they wear: follows route and side
  const side = opts.side ?? 'player';
  const kit = opts.route ? KITS[opts.route] : KIT_DEFAULT;
  const outfit = pick(rng, kit.outfit);
  const anyCloth = pick(rng, side === 'enemy' ? ENEMY_CLOTH : ALLY_CLOTH);
  const metal = pick(rng, METAL[side]);
  const pale = pick(rng, PALE);
  const band = pick(rng, BANDS);
  const stole = pick(rng, STOLES);
  const headwear = pick(rng, kit.headwear);
  const mask = chance(rng, kit.mask);

  // Helm and hood hide the hair and need their matching head shape.
  const style: HairStyle = headwear === 'helm' || headwear === 'hood' ? headwear : ownStyle;
  const acc = headwear === 'none' ? undefined : headwear;
  const extra: Accessory[] = [];
  if (sex === 'male' && facialHair && !mask) extra.push(facialHair);
  if (mask) extra.push('scarf');
  if (glassesRoll < kit.glasses && headwear !== 'helm') extra.push('glasses');
  if (scar && headwear !== 'helm') extra.push('scar');
  if (scarNear) extra.push('scar_near');
  const colors = outfit === 'plate' ? metal : outfit === 'priest' || outfit === 'light' ? pale : anyCloth;

  return {
    skin, hair, eye, face, style, outfit, colors, eyes, brows, mouth,
    ...(acc ? { acc } : {}),
    ...(extra.length ? { extra } : {}),
    ...(acc === 'headband' || acc === 'bandana' ? { band } : {}),
    ...(outfit === 'priest' ? { stole } : {}),
    ...(sex === 'female' ? { fem: true } : {}),
    ...(blush ? { blush: true } : {}),
  };
}
