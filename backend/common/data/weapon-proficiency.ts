import { RANKS } from './types.ts';
import type { Rank, WeaponType } from './types.ts';

// A 500-day year needs a much longer curve than Fire Emblem's map-based campaigns.
export const RANK_EXP: Record<Rank, number> = { E: 0, D: 50, C: 200, B: 600, A: 1500, S: 3000, SS: 5000, SSS: 8000 };

export interface WeaponRankBonus { attack: number; hit: number; crit: number; heal: number }
type BonusRank = 'C' | 'B' | 'A' | 'S';
type BonusRow = Record<BonusRank, Readonly<WeaponRankBonus>>;
const bonus = (attack = 0, hit = 0, crit = 0, heal = 0): Readonly<WeaponRankBonus> => Object.freeze({ attack, hit, crit, heal });
const sword: BonusRow = { C: bonus(1), B: bonus(2), A: bonus(3), S: bonus(3, 5, 5) };
const balanced: BonusRow = { C: bonus(1), B: bonus(1, 5), A: bonus(2, 5), S: bonus(2, 10, 5) };
const accuracy: BonusRow = { C: bonus(0, 5), B: bonus(0, 10), A: bonus(1, 10), S: bonus(1, 15, 5) };
const staff: BonusRow = { C: bonus(0, 0, 0, 1), B: bonus(0, 0, 0, 2), A: bonus(0, 0, 0, 3), S: bonus(0, 0, 0, 5) };
const NONE = bonus();
const BONUSES: Record<WeaponType, BonusRow> = {
  sword, lance: balanced, axe: accuracy, bow: balanced, tome: balanced, staff,
  fist: accuracy, beast: balanced, dragon: balanced,
};

// Only the weapon being used contributes. SS/SSS retain S bonuses; ranks never stack.
export function weaponRankBonus(type: WeaponType, rank: Rank = 'E'): Readonly<WeaponRankBonus> {
  const index = RANKS.indexOf(rank);
  if (index < RANKS.indexOf('C')) return NONE;
  return BONUSES[type][RANKS[Math.min(index, RANKS.indexOf('S'))] as BonusRank];
}

export function weaponRankBonusText(type: WeaponType, rank: Rank = 'E'): string {
  const b = weaponRankBonus(type, rank);
  return ([['攻击', b.attack], ['命中', b.hit], ['必杀', b.crit], ['治疗', b.heal]] as const)
    .filter(([, value]) => value > 0).map(([name, value]) => `${name} +${value}`).join(' · ');
}
