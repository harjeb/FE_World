import type { MoveType, Rank, WeaponType } from './types.ts';

// docs/03-combat.md「武器（v1）」; v1 weapons have no durability.
export interface Weapon {
  name: string;
  type: WeaponType;
  rank: Rank;
  might: number;
  hit: number;
  weight: number;
  crit: number;
  range: readonly [number, number];
  effective?: readonly MoveType[];
  brave?: boolean;
  // Staves: heal = 'mag10' restores 魔 + 10, 'full' restores all HP; magRange caps range at 魔 ÷ 2.
  heal?: 'mag10' | 'full';
  magRange?: boolean;
  note?: string;
}

const FLYING = ['flying'] as const;

const TABLE = {
  iron_sword: { name: '铁剑', type: 'sword', rank: 'E', might: 5, hit: 90, weight: 5, crit: 0, range: [1, 1] },
  steel_sword: { name: '钢剑', type: 'sword', rank: 'D', might: 8, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  horseslayer: { name: '斩马刀', type: 'sword', rank: 'D', might: 6, hit: 70, weight: 9, crit: 0, range: [1, 1], effective: ['mounted'], note: '对骑乘特效' },
  killing_edge: { name: '杀手剑', type: 'sword', rank: 'C', might: 7, hit: 75, weight: 7, crit: 30, range: [1, 1] },
  silver_sword: { name: '银剑', type: 'sword', rank: 'A', might: 13, hit: 80, weight: 8, crit: 0, range: [1, 1] },
  brave_sword: { name: '勇者之剑', type: 'sword', rank: 'A', might: 9, hit: 75, weight: 12, crit: 0, range: [1, 1], brave: true, note: '连击' },
  iron_lance: { name: '铁枪', type: 'lance', rank: 'E', might: 7, hit: 80, weight: 8, crit: 0, range: [1, 1] },
  steel_lance: { name: '钢枪', type: 'lance', rank: 'D', might: 10, hit: 70, weight: 13, crit: 0, range: [1, 1] },
  javelin: { name: '投枪', type: 'lance', rank: 'D', might: 6, hit: 65, weight: 11, crit: 0, range: [1, 2] },
  armorslayer: { name: '破甲枪', type: 'lance', rank: 'D', might: 7, hit: 70, weight: 12, crit: 0, range: [1, 1], effective: ['armored'], note: '对重甲特效' },
  killer_lance: { name: '杀手枪', type: 'lance', rank: 'C', might: 8, hit: 70, weight: 9, crit: 30, range: [1, 1] },
  silver_lance: { name: '银枪', type: 'lance', rank: 'A', might: 14, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  iron_axe: { name: '铁斧', type: 'axe', rank: 'E', might: 8, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  steel_axe: { name: '钢斧', type: 'axe', rank: 'D', might: 11, hit: 65, weight: 15, crit: 0, range: [1, 1] },
  hand_axe: { name: '手斧', type: 'axe', rank: 'D', might: 7, hit: 60, weight: 12, crit: 0, range: [1, 2] },
  killer_axe: { name: '杀手斧', type: 'axe', rank: 'C', might: 9, hit: 65, weight: 11, crit: 30, range: [1, 1] },
  silver_axe: { name: '银斧', type: 'axe', rank: 'A', might: 15, hit: 70, weight: 12, crit: 0, range: [1, 1] },
  iron_bow: { name: '铁弓', type: 'bow', rank: 'E', might: 6, hit: 85, weight: 5, crit: 0, range: [2, 2], effective: FLYING },
  steel_bow: { name: '钢弓', type: 'bow', rank: 'D', might: 9, hit: 70, weight: 9, crit: 0, range: [2, 2], effective: FLYING },
  killer_bow: { name: '杀手弓', type: 'bow', rank: 'C', might: 9, hit: 75, weight: 7, crit: 30, range: [2, 2], effective: FLYING },
  longbow: { name: '长弓', type: 'bow', rank: 'B', might: 5, hit: 65, weight: 10, crit: 0, range: [2, 3], effective: FLYING },
  silver_bow: { name: '银弓', type: 'bow', rank: 'A', might: 13, hit: 75, weight: 6, crit: 0, range: [2, 2], effective: FLYING },
  fire: { name: '火焰', type: 'tome', rank: 'E', might: 5, hit: 90, weight: 4, crit: 0, range: [1, 2] },
  thunder: { name: '雷霆', type: 'tome', rank: 'D', might: 8, hit: 80, weight: 6, crit: 5, range: [1, 2] },
  wind: { name: '风刃', type: 'tome', rank: 'C', might: 6, hit: 85, weight: 3, crit: 0, range: [1, 2], effective: FLYING, note: '对飞行特效' },
  flame_lance: { name: '炎枪', type: 'tome', rank: 'B', might: 12, hit: 75, weight: 10, crit: 0, range: [1, 2] },
  heal: { name: '治疗杖', type: 'staff', rank: 'E', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'mag10', note: '回复 魔 + 10' },
  recover: { name: '恢复杖', type: 'staff', rank: 'C', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'full', note: '回复全部 HP' },
  physic: { name: '远疗杖', type: 'staff', rank: 'B', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'mag10', magRange: true, note: '射程 1–魔÷2，回复 魔 + 10' },
} satisfies Record<string, Weapon>;
export type WeaponId = keyof typeof TABLE;
export const WEAPONS: Record<WeaponId, Weapon> = TABLE;

export function weapon(id: WeaponId): Weapon {
  return WEAPONS[id];
}

// Sword beats axe, axe beats lance, lance beats sword; bows, tomes and staves sit outside the triangle.
const BEATS: Partial<Record<WeaponType, WeaponType>> = { sword: 'axe', axe: 'lance', lance: 'sword' };

export function triangle(mine: WeaponType, theirs: WeaponType): -1 | 0 | 1 {
  if (BEATS[mine] === theirs) return 1;
  if (BEATS[theirs] === mine) return -1;
  return 0;
}

export const ITEMS = {
  vulnerary: { name: '伤药', heal: 10, uses: 3 },
} as const;
export type ItemId = keyof typeof ITEMS;
