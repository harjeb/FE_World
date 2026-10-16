// 普通竞技场现实月榜（docs/00 §10.3、docs/13 §6.4）：按现实月份归档旧榜、重置积分／名次／当月战绩。
// 与个人行动日、派遣返程和职业购买周期都无关；月界用服务端配置时区，不按浏览器时间。

export interface RatingPeriod {
  id: string;
  mode: string;
  startsAt: number;
  endsAt: number;
  status: 'active' | 'archived';
  rewardsFinalizedAt: number | null;
}

export interface RatingRow {
  periodId: string;
  playerId: string;
  mode: string;
  progressBracket: number;
  rating: number;
  wins: number;
  losses: number;
  matches: number;
}

export interface MonthlyRatingReward {
  periodId: string;
  playerId: string;
  finalRank: number;
  reward: { gold: number };
  claimedAt: number | null;
}

// 服务端配置的月界时区偏移（分钟）；默认 UTC+8。
export const RATING_TIMEZONE_OFFSET_MINUTES = Number(process.env.RATING_TZ_OFFSET_MINUTES ?? 480);

// 现实月键：YYYY-MM（按配置时区）。
export function periodIdFor(now: number): string {
  const shifted = new Date(now + RATING_TIMEZONE_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodBounds(id: string): { startsAt: number; endsAt: number } {
  const [year, month] = id.split('-').map(Number);
  const startsAt = Date.UTC(year, month - 1, 1) - RATING_TIMEZONE_OFFSET_MINUTES * 60_000;
  const endsAt = Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - RATING_TIMEZONE_OFFSET_MINUTES * 60_000;
  return { startsAt, endsAt };
}

export function createPeriod(id: string, mode = 'arena'): RatingPeriod {
  const { startsAt, endsAt } = periodBounds(id);
  return { id, mode, startsAt, endsAt, status: 'active', rewardsFinalizedAt: null };
}

// 单场有效赛果的积分；胜多负少，仍允许负场积累少量分。
export function ratingDelta(wins: number, losses: number): number {
  return wins * 20 + losses * 5;
}

export function rankByRating(rows: RatingRow[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId));
  return new Map(sorted.map((row, index) => [row.playerId, index + 1]));
}

// 月末奖励档（草案）：名次越前金币越多。
export function rewardForRank(rank: number): { gold: number } {
  if (rank <= 1) return { gold: 5000 };
  if (rank <= 10) return { gold: 2000 };
  if (rank <= 50) return { gold: 1000 };
  return { gold: 300 };
}
