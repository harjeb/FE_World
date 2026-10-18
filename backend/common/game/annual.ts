import type { RunCarry } from './expedition.ts';
import type { UnitRecord } from './model.ts';

// 年度大竞技场（docs/00 §9.4、docs/13 §6）：每届从三场海选（至少两胜）开始，正赛 64 强单败。
// 名次不阻挡八章主线；已报名后淘汰或退赛，当届不能重报。

export const ANNUAL_QUALIFIER_MATCHES = 3;
export const ANNUAL_QUALIFIER_WINS = 2;
export const ANNUAL_KNOCKOUT_ROUNDS = 6; // 64→32→16→8→4→2→1
// 大竞技场战斗轮号：1–3 海选，4–9 正赛（沿用 festival 的地图选择）。
export const ANNUAL_FIRST_KNOCKOUT_ROUND = 4;

export type AnnualState = 'qualifier' | 'knockout' | 'eliminated' | 'champion' | 'withdrawn';

export interface AnnualBracket { size: 64; slots: string[]; winners: string[][]; }

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
  roster?: Record<string, UnitRecord>;
  matchSeeds?: string[];
  bracket?: AnnualBracket;
  ruleVersion?: string;
  battleId: string | null;
  createdAt: number;
  updatedAt: number;
}

// 每届窗口是年度最后 18 日（D482–499、D982–999……），第八届最迟 D3982 开始。
// 届次与显示年份分开：D482 前仍是上一届，D3982 起是第八届。
export function annualIndexFor(day: number): number {
  return Math.max(0, Math.min(8, Math.floor((day + 18) / 500)));
}

export function annualWindowOpen(day: number): boolean {
  return day >= 482 && day % 500 >= 500 - 18 && day < 4000;
}

export function annualWindowStart(annualIndex: number): number {
  return annualIndex * 500 - 18;
}

export function nextAnnualWindowStart(day: number): number {
  for (let index = Math.max(1, annualIndexFor(day)); index <= 8; index++) {
    const start = annualWindowStart(index);
    if (start > day) return start;
  }
  return 4000;
}

export function createAnnualEntry(id: string, playerId: string, annualIndex: number, unitIds: string[]): AnnualEntry {
  const entry: AnnualEntry = {
    id, playerId, annualIndex, state: 'qualifier', qualifierWins: 0, qualifierCount: 0, round: 0,
    unitIds: [...unitIds], carry: {}, battleId: null, ruleVersion: 'annual-v2', createdAt: Date.now(), updatedAt: Date.now(),
  };
  entry.bracket = createBracket(entry);
  return entry;
}

function bracketSeed(entry: AnnualEntry): number {
  let h = 2166136261;
  for (const ch of `${entry.id}:${entry.annualIndex}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function createBracket(entry: AnnualEntry): AnnualBracket {
  const seed = bracketSeed(entry);
  const slots = Array.from({ length: 64 }, (_, i) => i === 0 ? `player:${entry.playerId}` : `official:${(seed + i * 37) % 64}:${i}`);
  return { size: 64, slots, winners: [slots] };
}

// 玩家只打自己的比赛；其余对局用固定 seed 规则 AI 结算，整届签表因此可复现。
export function advanceBracket(entry: AnnualEntry, playerWon: boolean): AnnualBracket | null {
  if (!entry.bracket) entry.bracket = createBracket(entry);
  const bracket = entry.bracket;
  if (entry.state !== 'knockout' || bracket.winners.length < entry.round) return bracket;
  const previous = bracket.winners[entry.round - 1] ?? bracket.slots;
  const next: string[] = [];
  for (let i = 0; i < previous.length; i += 2) {
    const a = previous[i], b = previous[i + 1];
    if (a?.startsWith('player:')) next.push(playerWon ? a : b);
    else if (b?.startsWith('player:')) next.push(playerWon ? b : a);
    else {
      const hash = Math.imul(seedForMatch(entry, entry.round, i) ^ (a?.length ?? 0), 16777619) >>> 0;
      next.push(hash % 2 === 0 ? a : b);
    }
  }
  bracket.winners[entry.round] = next;
  return bracket;
}

function seedForMatch(entry: AnnualEntry, round: number, index: number): number {
  let h = bracketSeed(entry) ^ Math.imul(round, 2654435761) ^ index;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  return h;
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
    bracket: entry.bracket ? { size: entry.bracket.size, round: entry.bracket.winners.length - 1, remaining: entry.bracket.winners.at(-1)?.length ?? 64 } : null,
  };
}
