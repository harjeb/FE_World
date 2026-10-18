// Frontend check that the 星辉历 rendering the UI helpers produce matches the shared backend
// implementation (same dateOf/formatEraDate, no duplicated relative year/season phrasing).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { dateOf, formatEraDate } = await import('../../backend/common/game/calendar.ts');
const { dateLabel, plainDate, shortDate } = await import('../src/ui/calendar.ts');

test('frontend helpers render actual dates through the shared era implementation', () => {
  // Plain label with era name and no relative year/season phrasing.
  assert.equal(dateLabel(0), '星辉历 1001年1月1日');
  assert.equal(plainDate(0), '星辉历 1001年1月1日');
  assert.equal(dateLabel(124), '星辉历 1001年3月41日 · 竞技场日');
  assert.equal(plainDate(124), '星辉历 1001年3月41日');
  // Short form drops the era prefix.
  assert.equal(shortDate(499), '1001年12月41日');
  assert.equal(shortDate(500), '1002年1月1日');
  // Helpers agree with the shared backend implementation.
  for (const day of [0, 41, 42, 125, 249, 499, 500, 3999, 4000]) {
    const d = dateOf(day);
    assert.equal(plainDate(day), formatEraDate(d));
    assert.equal(shortDate(day), `${d.eraYear}年${d.month}月${d.monthDay}日`);
  }
});
