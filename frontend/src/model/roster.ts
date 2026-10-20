// 名册视图（TODO UI-01）：全部由服务端单位推出，不再有模板主力／替补／重伤或武器阈值占位。
// 出战人数按地图规则另算（GET_TODAY／GET_QUESTS 的 maxUnits），名册只记录谁现在能出、谁被活动占用。
import { CLASSES, classEntryReason, hasClassQualification, weaponRankCap } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import { allPromotionsFor } from '@common/data/promotions.ts';
import { RANKS, WEAPON_TYPE_NAMES, rankAtLeast } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import type { Rank, WeaponType } from '@common/data/types.ts';
import { RANK_EXP } from '@common/game/model.ts';
import { trainingWeaponRankCap } from '@common/game/training.ts';
import type { LifespanWarning, ServerAnnual, ServerUnit, UnitOrigin } from '../api/session.ts';

export type UnitStatus = 'ready' | 'run' | 'dispatch' | 'annual';

export const STATUS_TEXT: Record<UnitStatus, string> = { ready: '可出战', run: '远征中', dispatch: '派遣中', annual: '大竞技场名单' };
export const STATUS_TAG: Record<UnitStatus, string> = { ready: 'tag-green', run: 'tag-brass', dispatch: 'tag-blue', annual: 'tag-blue' };
export const ORIGIN_TEXT: Record<UnitOrigin, string> = { protagonist: '主角', fixed: '固定人物', recruit: '招募' };
export const LIFESPAN_TEXT: Record<LifespanWarning, string | null> = { none: null, oneYear: '寿命不足一年', lastSeason: '寿命不足一季', due: '已到寿终' };

// 本届大竞技场进行中（海选或正赛）：服务端暂停其他写操作，只能打比赛或退赛。
export function annualLive(annual: ServerAnnual | null): boolean {
  const entry = annual?.entry;
  return !!entry && (entry.state === 'qualifier' || entry.state === 'knockout');
}

export function unitStatus(unit: ServerUnit, annual: ServerAnnual | null): UnitStatus {
  if (unit.lockedRunId) return 'run';
  if (unit.lockedDispatchId) return 'dispatch';
  if (annualLive(annual) && annual!.entry!.unitIds.includes(unit.id)) return 'annual';
  return 'ready';
}

// Why a unit cannot be picked for a new battle or dispatch right now (the server refuses it too).
export function busyReason(unit: ServerUnit, annual: ServerAnnual | null): string | null {
  const status = unitStatus(unit, annual);
  return status === 'ready' ? null : STATUS_TEXT[status];
}

export const activeUnits = (units: ServerUnit[]) => units.filter(u => u.status === 'active');

// 可转职：所有符合现有资格／目标武器等级的职业里，至少有一个已经买到资格（PROMOTE 与 SWITCH_CLASS 共用这条校验）。
export function canPromote(unit: ServerUnit): boolean {
  return allPromotionsFor(unit.classId as ClassId).some(p => hasClassQualification(unit.classQualifications as ClassId[], p.to)
    && !classEntryReason({ ...unit, classId: unit.classId as ClassId, homeClassId: unit.homeClassId as ClassId }, p.to, (unit.homeClassId ?? CHARACTERS[unit.character].classId) as ClassId));
}

export interface WeaponProgress {
  type: WeaponType; rank: Rank; exp: number;
  // 本级起点与下一级门槛（服务端 RANK_EXP）；next 为 null 表示已到 SSS。
  floor: number; next: number | null; nextRank: Rank | null;
  // 当前职业的上限；null 表示当前职业不能用这类武器（换职前练的熟练度仍保留）。
  cap: Rank | null; capped: boolean;
}

export function weaponProgress(unit: ServerUnit): WeaponProgress[] {
  return (Object.entries(unit.ranks) as [WeaponType, Rank][]).map(([type, rank]) => {
    const exp = Math.max(unit.weaponExp[type] ?? 0, RANK_EXP[rank]);
    const nextRank = RANKS[RANKS.indexOf(rank) + 1] ?? null;
    const cap = weaponRankCap(unit.classId as ClassId, type) ?? null;
    const capped = RANKS.indexOf(rank) >= RANKS.indexOf(trainingWeaponRankCap(unit.classId as ClassId, type));
    return { type, rank, exp, floor: RANK_EXP[rank], next: nextRank ? RANK_EXP[nextRank] : null, nextRank, cap, capped };
  }).sort((a, b) => (a.cap ? 0 : 1) - (b.cap ? 0 : 1) || RANKS.indexOf(b.rank) - RANKS.indexOf(a.rank));
}

// Carrying is unrestricted; equipping needs the current class permission and every required rank.
export function cannotWield(unit: ServerUnit, weapon: WeaponId): string | null {
  const w = WEAPONS[weapon];
  const cap = CLASSES[unit.classId as ClassId]?.weapons[w.type];
  if (!cap) return `${unit.className}不能用${w.name}`;
  if (!rankAtLeast(unit.ranks[w.type], w.rank)) return `需要 ${w.rank} 级，现在 ${unit.ranks[w.type] ?? '无'}`;
  const missing = (w.requires ?? []).find(req => !rankAtLeast(unit.ranks[req.type], req.rank));
  return missing ? `另需${WEAPON_TYPE_NAMES[missing.type]} ${missing.rank} 级，现在 ${unit.ranks[missing.type] ?? '无'}` : null;
}

export const classOfUnit = (unit: ServerUnit) => CLASSES[unit.classId as ClassId];

// 等级经验：100 一级；满级（职业 maxLevel）后不再累积。
export function expLine(unit: ServerUnit): { exp: number; max: boolean } {
  const max = unit.level >= (classOfUnit(unit)?.maxLevel ?? 99);
  return { exp: max ? 100 : unit.exp, max };
}

// The ready units first (highest level first), then those an activity holds.
export function rosterOrder(units: ServerUnit[], annual: ServerAnnual | null): ServerUnit[] {
  const rank = (u: ServerUnit) => (u.isProtagonist ? 0 : unitStatus(u, annual) === 'ready' ? 1 : 2);
  return [...units].sort((a, b) => rank(a) - rank(b) || b.level - a.level);
}
