// 个人日历 (docs/00 §2): every label comes from the shared dateOf, so the page and the server agree.
// Actions show where they move the date and which arena days they pass (docs/00 §2「跨多日行动」、§11).
import { DAYS_PER_SEASON, dateOf, nextArenaDay } from '@common/game/calendar.ts';
import { session } from '../api/session.ts';

export const dateLabel = (day: number): string => dateOf(day).label;

export function plainDate(day: number): string {
  const d = dateOf(day);
  return `第 ${d.year} 年 · 第 ${d.season} 季 · 第 ${d.dayOfSeason} 日`;
}

// For narrow table cells: 2 年 3 季 30 日.
export function shortDate(day: number): string {
  const d = dateOf(day);
  return `${d.year} 年 ${d.season} 季 ${d.dayOfSeason} 日`;
}

// Where `days` of action from `day` lands, and the arena days strictly in between (the landing day
// itself already says 竞技场日 in its label).
export function advance(day: number, days: number): { label: string; passes: string | null } {
  const end = day + days;
  const crossed: number[] = [];
  for (let d = nextArenaDay(day); d < end; d += DAYS_PER_SEASON) crossed.push(d);
  const passes = crossed.length === 0 ? null
    : crossed.length === 1 ? `途经竞技场日（${plainDate(crossed[0])}）`
      : `途经 ${crossed.length} 个竞技场日（最早 ${plainDate(crossed[0])}）`;
  return { label: dateLabel(end), passes };
}

// Moving the date off today's arena day settles it: unplayed attacks count as losses with no gold
// (backend services.ts::settleArenaDay). Null when nothing is at stake.
export function arenaTodayWarning(): string | null {
  const { arena } = session.get();
  if (!arena?.isArenaDay || arena.settled || !arena.progress) return null;
  const left = arena.progress.total - arena.progress.done;
  return left > 0 ? `今天是竞技场日，还有 ${left} 场进攻没打。推进日期后今天的竞技场随即结算，没打的按落败计，不发金币。` : null;
}

// Real-world timestamps (reports, Agent notes, leases) in 24-hour Chinese form, whatever the browser locale.
export const clockTime = (at: number): string => new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
export const realDateTime = (at: number): string => new Date(at).toLocaleString('zh-CN', { hour12: false });
