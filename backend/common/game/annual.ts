import { dateOf } from './calendar.ts';
import type { RunCarry } from './expedition.ts';

// 年度大竞技场（docs/00 §9.4、docs/13 §6）：每届从三场海选（至少两胜）开始，正赛 64 强单败。
// 名次不阻挡八章主线；已报名后淘汰或退赛，当届不能重报。

export const ANNUAL_QUALIFIER_MATCHES = 3;
export const ANNUAL_QUALIFIER_WINS = 2;
export const ANNUAL_KNOCKOUT_ROUNDS = 6; // 64→32→16→8→4→2→1
// 大竞技场战斗轮号：1–3 海选，4–9 正赛（沿用 festival 的地图选择）。
export const ANNUAL_FIRST_KNOCKOUT_ROUND = 4;

export type AnnualState = 'qualifier' | 'knockout' | 'eliminated' | 'champion' | 'withdrawn';

export interface AnnualEntry {
  id: string;
  playerId: string;
  annualIndex: number;
  state: AnnualState;
  qualifierWins: number;
  qualifierCount: number;
  round: number;
  unitIds: string[];
  carry: Record<string, RunCarry>;
  battleId: string | null;
  createdAt: number;
  updatedAt: number;
}

// 第一届在累计 D=120 开放，第八届 D=960（docs/13 §3.1）。
export function annualIndexFor(day: number): number {
  return Math.floor(day / 120);
}

// 报名窗口在年末最后几日开放；已有报名进行中时也允许继续。
export function annualWindowOpen(day: number): boolean {
  return dateOf(day).dayOfMonth >= 28;
}

export function createAnnualEntry(id: string, playerId: string, annualIndex: number, unitIds: string[]): AnnualEntry {
  return {
    id, playerId, annualIndex, state: 'qualifier', qualifierWins: 0, qualifierCount: 0, round: 0,
    unitIds: [...unitIds], carry: {}, battleId: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 海选打完三场判断；未通过为 eliminated（docs/00 §9.4.1）。
export function qualifierResult(entry: AnnualEntry, won: boolean): void {
  entry.qualifierCount += 1;
  if (won) entry.qualifierWins += 1;
  if (entry.qualifierCount >= ANNUAL_QUALIFIER_MATCHES) {
    if (entry.qualifierWins >= ANNUAL_QUALIFIER_WINS) { entry.state = 'knockout'; entry.round = 1; }
    else entry.state = 'eliminated';
  }
}

// 正赛单败：赢满六轮夺冠，输一场即淘汰。
export function knockoutResult(entry: AnnualEntry, won: boolean): void {
  if (!won) { entry.state = 'eliminated'; return; }
  entry.round += 1;
  if (entry.round > ANNUAL_KNOCKOUT_ROUNDS) entry.state = 'champion';
}

// 下一场使用的 festival 轮号。
export function nextFestivalRound(entry: AnnualEntry): number {
  if (entry.state === 'qualifier') return entry.qualifierCount + 1;
  return ANNUAL_FIRST_KNOCKOUT_ROUND + entry.round - 1;
}

export function annualSummary(entry: AnnualEntry): Record<string, unknown> {
  return {
    id: entry.id, annualIndex: entry.annualIndex, state: entry.state,
    qualifierWins: entry.qualifierWins, qualifierCount: entry.qualifierCount, round: entry.round,
    unitIds: entry.unitIds, survivingIds: Object.keys(entry.carry), battleId: entry.battleId,
  };
}
