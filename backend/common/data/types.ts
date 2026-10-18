import type { Movement } from '../maps/map.ts';

export type StatKey = 'hp' | 'str' | 'mag' | 'skl' | 'spd' | 'lck' | 'def' | 'res' | 'cha';
export type Stats = Record<StatKey, number>;
export type WeaponType = 'sword' | 'lance' | 'axe' | 'bow' | 'tome' | 'staff' | 'fist' | 'dagger' | 'beast' | 'dragon';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
export type MoveType = Movement;

export const STAT_KEYS: StatKey[] = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'cha'];
export const STAT_NAMES: Record<StatKey, string> = {
  hp: 'HP', str: '力', mag: '魔', skl: '技', spd: '速', lck: '运', def: '防', res: '魔防', cha: '魅力',
};
export const RANKS: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
export const WEAPON_TYPE_NAMES: Record<WeaponType, string> = {
  sword: '剑', lance: '枪', axe: '斧', bow: '弓', tome: '理', staff: '杖',
  fist: '拳', dagger: '短刀', beast: '兽爪', dragon: '龙石',
};
export const MOVE_TYPE_NAMES: Record<MoveType, string> = {
  foot: '步行', armored: '重甲', mounted: '骑乘', flying: '飞行',
};

export function stats(hp: number, str: number, mag: number, skl: number, spd: number, lck: number, def: number, res: number, cha = 0): Stats {
  return { hp, str, mag, skl, spd, lck, def, res, cha };
}

// Old eight-stat records gain only the absent field; existing values stay untouched.
export function withCharm(value: Omit<Stats, 'cha'> & Partial<Pick<Stats, 'cha'>>): Stats {
  return { ...value, cha: value.cha ?? 0 };
}

export function rankAtLeast(have: Rank | undefined, need: Rank): boolean {
  return have !== undefined && RANKS.indexOf(have) >= RANKS.indexOf(need);
}
