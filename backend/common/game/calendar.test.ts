// Boundary tests for the 星辉历 display layer on top of the 500-day personal calendar. Gameplay
// indexes (day offsets, arena days, enemy curves) must stay exactly where they were; only the
// rendering of actual dates changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_DAY_OF_MONTH, DAYS_PER_SEASON, DAYS_PER_YEAR, ERA_BASE_YEAR, ERA_NAME,
  MONTH_DAYS_PER_SEASON, MONTHS_PER_YEAR, dateOf, formatEraDate, isArenaDay, nextArenaDay, nextMonthStart,
} from './calendar.ts';

test('day 0 renders as the first day of the era', () => {
  const d = dateOf(0);
  assert.equal(d.year, 1);
  assert.equal(d.era, ERA_NAME);
  assert.equal(d.eraYear, ERA_BASE_YEAR);
  assert.equal(d.season, 1);
  assert.equal(d.month, 1);
  assert.equal(d.monthDay, 1);
  assert.equal(d.dayOfSeason, 1);
  assert.equal(d.dayOfMonth, 1);
  assert.equal(d.label, '星辉历 1001年1月1日');
});

test('month lengths per season are 42/42/41 and transition on the right days', () => {
  assert.deepEqual([...MONTH_DAYS_PER_SEASON], [42, 42, 41]);
  assert.equal(MONTH_DAYS_PER_SEASON.reduce((a, b) => a + b, 0), DAYS_PER_SEASON);
  assert.equal(MONTHS_PER_YEAR, 12);
  // Last day of month 1 / first day of month 2 (day indexes are 0-based).
  assert.deepEqual(pick(dateOf(41)), { year: 1, eraYear: 1001, season: 1, month: 1, monthDay: 42, dayOfSeason: 42 });
  assert.deepEqual(pick(dateOf(42)), { year: 1, eraYear: 1001, season: 1, month: 2, monthDay: 1, dayOfSeason: 43 });
  // 42 + 42 boundary.
  assert.deepEqual(pick(dateOf(83)), { year: 1, eraYear: 1001, season: 1, month: 2, monthDay: 42, dayOfSeason: 84 });
  assert.deepEqual(pick(dateOf(84)), { year: 1, eraYear: 1001, season: 1, month: 3, monthDay: 1, dayOfSeason: 85 });
  // Last day of the season's third month.
  assert.deepEqual(pick(dateOf(124)), { year: 1, eraYear: 1001, season: 1, month: 3, monthDay: 41, dayOfSeason: 125 });
  assert.equal(dateOf(124).label, '星辉历 1001年3月41日 · 竞技场日');
});

test('season boundary at day 125 rolls into month 4 without changing durations', () => {
  const d = dateOf(DAYS_PER_SEASON);
  assert.equal(d.year, 1);
  assert.equal(d.season, 2);
  assert.equal(d.dayOfSeason, 1);
  assert.equal(d.month, 4);
  assert.equal(d.monthDay, 1);
  assert.equal(d.label, '星辉历 1001年4月1日');
  // Arena boundaries unchanged: day 124 is an arena day, day 125 is not, next is 249.
  assert.equal(isArenaDay(124), true);
  assert.equal(isArenaDay(125), false);
  assert.equal(nextArenaDay(125), 249);
  assert.equal(nextMonthStart(0), DAYS_PER_SEASON);
  assert.equal(ARENA_DAY_OF_MONTH, DAYS_PER_SEASON);
});

test('day 499 is the last day of year 1 and day 500 opens era year 1002', () => {
  const last = dateOf(DAYS_PER_YEAR - 1);
  assert.deepEqual(pick(last), { year: 1, eraYear: 1001, season: 4, month: 12, monthDay: 41, dayOfSeason: 125 });
  assert.equal(last.label, '星辉历 1001年12月41日 · 竞技场日');
  const first = dateOf(DAYS_PER_YEAR);
  assert.deepEqual(pick(first), { year: 2, eraYear: 1002, season: 1, month: 1, monthDay: 1, dayOfSeason: 1 });
  assert.equal(first.label, '星辉历 1002年1月1日');
});

test('the 8-year mainline horizon (4000 days) maps to era years 1001…1009', () => {
  assert.equal(dateOf(0).eraYear, 1001);
  for (const [day, eraYear] of [[999, 1002], [1000, 1003], [3998, 1008], [3999, 1008], [4000, 1009]]) {
    assert.equal(dateOf(day).eraYear, eraYear);
  }
  const last = dateOf(3999);
  assert.deepEqual(pick(last), { year: 8, eraYear: 1008, season: 4, month: 12, monthDay: 41, dayOfSeason: 125 });
  assert.equal(dateOf(4000).year, 9);
  // Enemy interpolation and arena math still run off the internal relative year.
  assert.equal(dateOf(3999).year, 8);
  assert.equal(nextArenaDay(3999), 4124);
});

test('formatEraDate matches the label for ordinary days and month 12 exists', () => {
  for (const day of [0, 41, 42, 250, 777, 499, 12345]) {
    const d = dateOf(day);
    assert.equal(formatEraDate(d), d.label.replace(' · 竞技场日', ''));
  }
  assert.equal(dateOf(7 * DAYS_PER_YEAR - 1).month, 12);
});

function pick(d: ReturnType<typeof dateOf>) {
  return { year: d.year, eraYear: d.eraYear, season: d.season, month: d.month, monthDay: d.monthDay, dayOfSeason: d.dayOfSeason };
}
