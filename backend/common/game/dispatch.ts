import type { ClassId } from '../data/classes.ts';
import type { WeaponType } from '../data/types.ts';
import { seedRng } from '../engine/rng.ts';
import { WEAPON_SERIES } from '../data/weapons.ts';
import { materialDrops, materialTier } from './materials.ts';
import { enemyLevel, regionById } from './calendar.ts';
import type { ItemKey } from './items.ts';

// 自动探索／职业训练（docs/00 §9.1.1、docs/13 §5.5）：后台占用任务，按个人行动日并行。
// 玩家自选正整数天数；出发时冻结职业、武器与规则，返程只结算一次，奖励只给参与者。

export const DISPATCH_MIN_DAYS = 1;
export const DISPATCH_MAX_DAYS = 30;
export const DISPATCH_MAX_UNITS = 6;

export type DispatchState = 'running' | 'returned' | 'cancelled';

export interface DispatchUnitReward {
  unitId: string;
  exp: number;
  levelUps: { level: number; gains: Record<string, number> }[];
  mastery: number;
  unlocked: string[];
  weaponType: WeaponType;
  weaponRank: string | null;
}

export interface DispatchResult {
  day: number;
  materials: { item: ItemKey; count: number }[];
  weapons: { item: ItemKey; count: number }[];
  unitRewards: DispatchUnitReward[];
}

export interface DispatchRecord {
  id: string;
  playerId: string;
  state: DispatchState;
  region: number;
  startedDay: number;
  durationDays: number;
  returnDay: number;
  // 出发时冻结的职业与训练武器（每名角色各自一份）。
  classId: ClassId;
  weaponType: WeaponType;
  unitIds: string[];
  result: DispatchResult | null;
  weaponLoot?: { item: ItemKey; count: number }[];
  materialLoot?: { item: ItemKey; count: number }[];
  createdAt: number;
}

export function createDispatch(
  id: string, playerId: string, region: number, unitIds: string[], durationDays: number,
  classId: ClassId, weaponType: WeaponType, startedDay: number,
): DispatchRecord {
  return {
    id, playerId, state: 'running', region, unitIds: [...unitIds], durationDays,
    startedDay, returnDay: startedDay + durationDays, classId, weaponType,
    weaponLoot: durationDays >= 5 && seedRng(`dispatch-weapons:${id}`)[0] % 4 === 0
      ? [{ item: WEAPON_SERIES[(['sword', 'bow', 'lance', 'axe', 'fist'] as const)[(region - 1) % 5]][Math.min(5, materialTier(enemyLevel(startedDay, regionById(region).offset))) - 1], count: 1 }] : [],
    result: null, materialLoot: [...materialDrops(region, enemyLevel(startedDay, regionById(region).offset), `${id}:materials`, Math.max(1, Math.floor(durationDays / 2)), 0.04),
      { item: 'seed', count: Math.max(1, Math.floor(durationDays / 4)) }], createdAt: Date.now(),
  };
}

export function isRunning(dispatch: DispatchRecord | null): boolean {
  return !!dispatch && dispatch.state === 'running';
}

// Legacy dispatches without frozen materialLoot retain their original payout.
export function dispatchMaterials(region: number, days: number): { item: ItemKey; count: number }[] {
  const material: ItemKey = region % 3 === 0 ? 'ore' : region % 3 === 1 ? 'herb' : 'wood';
  return [{ item: material, count: Math.max(1, Math.floor(days / 2)) }, { item: 'seed', count: Math.max(1, Math.floor(days / 4)) }];
}

// 训练武器掉落的候选：低概率，按天数和地区缩放。
export function dispatchWeapons(region: number, days: number, roll: number): { item: ItemKey; count: number }[] {
  if (days < 5 || roll % 4 !== 0) return [];
  return [{ item: region % 3 === 0 ? 'iron_lance' : region % 3 === 1 ? 'iron_sword' : 'iron_axe', count: 1 }];
}

export function dispatchSummary(dispatch: DispatchRecord): Record<string, unknown> {
  return {
    id: dispatch.id, state: dispatch.state, region: dispatch.region, unitIds: dispatch.unitIds,
    startedDay: dispatch.startedDay, durationDays: dispatch.durationDays, returnDay: dispatch.returnDay,
    classId: dispatch.classId, weaponType: (dispatch.weaponType as string) === 'dagger' ? 'sword' : dispatch.weaponType,
    result: dispatch.result && { ...dispatch.result, unitRewards: dispatch.result.unitRewards.map(reward => ({
      ...reward, weaponType: (reward.weaponType as string) === 'dagger' ? 'sword' : reward.weaponType,
    })) },
  };
}
