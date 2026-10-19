import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaign } from '../../tools/sim/campaign.ts';

test('production account persists eight calendar years and continues after year eight', () => {
  const report = campaign();
  assert.equal(report.rows.length, 8);
  assert.equal(report.rows[0].units.length, 3);
  assert.ok(report.rows[0].units.some(u => u.level > 1));
  assert.ok(report.rows[7].dispatches > report.rows[0].dispatches);
  assert.equal(report.postgame.day, report.rows[7].day + 30);
  assert.equal(report.checks.firstFieldVictory, true);
  assert.ok(report.openingBattles >= 1 && report.openingBattles <= 20);
  assert.equal(report.postgame.battles, report.openingBattles + 8);
  assert.ok(report.rows.every(row => row.resources.some(r => r.item === 'herb' && r.count > 6)));
});
