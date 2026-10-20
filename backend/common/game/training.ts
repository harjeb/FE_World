import { CLASSES, weaponRankCap } from '../data/classes.ts';
import { RANKS } from '../data/types.ts';
import type { Rank, WeaponType } from '../data/types.ts';
import { RANK_EXP, rankFromExp } from './model.ts';
import type { UnitRecord } from './model.ts';
import { DAYS_PER_YEAR } from './calendar.ts';

// Camp and parallel dispatch training award one point per weapon per day.
export const WEAPON_TRAINING_PER_DAY = 1;
export const TRAIN_GOLD_PER_UNIT = 200;
export const TRAINING_GROUPS = [
  { id: 'agility', name: '剑／弓／拳', weapons: ['sword', 'bow', 'fist'] },
  { id: 'power', name: '斧／枪／兽', weapons: ['axe', 'lance', 'beast'] },
  { id: 'mystic', name: '拳／杖／理／龙', weapons: ['fist', 'staff', 'tome', 'dragon'] },
] as const satisfies readonly { id: string; name: string; weapons: readonly WeaponType[] }[];
export type TrainingGroupId = (typeof TRAINING_GROUPS)[number]['id'];

export function trainingLimit(day: number): number {
  return [1, 3, 5, 8][Math.min(3, Math.max(0, Math.floor(day / DAYS_PER_YEAR)))];
}

// Group practice can prepare weapons outside the current class; wielding permissions stay separate.
// The class stage still limits earned ranks, and already-earned higher ranks never regress.
export function trainingWeaponProgress(unit: Pick<UnitRecord, 'classId' | 'ranks' | 'weaponExp'>, type: WeaponType, amount: number) {
  const rankBefore = unit.ranks[type] ?? 'E';
  const expBefore = Math.max(unit.weaponExp[type] ?? 0, RANK_EXP[rankBefore]);
  const expAfter = expBefore + amount;
  const stage = CLASSES[unit.classId].stage;
  const cap: Rank = weaponRankCap(unit.classId, type) ?? (stage >= 5 ? 'SSS' : stage >= 4 ? 'SS' : 'S');
  const earned = RANKS[Math.min(RANKS.indexOf(rankFromExp(expAfter)), RANKS.indexOf(cap))];
  const rankAfter = RANKS[Math.max(RANKS.indexOf(rankBefore), RANKS.indexOf(earned))];
  return { weaponType: type, rankBefore, rankAfter, rankUp: rankAfter === rankBefore ? null : rankAfter,
    weaponExpGained: amount, expBefore, expAfter, cap };
}

export function addTrainingWeaponExp(unit: UnitRecord, type: WeaponType, amount: number) {
  const result = trainingWeaponProgress(unit, type, amount);
  unit.weaponExp[type] = result.expAfter;
  unit.ranks[type] = result.rankAfter;
  return result;
}
