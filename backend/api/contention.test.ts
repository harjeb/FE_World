import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contention } from '../../tools/sim/contention.ts';

test('separate API and worker processes preserve receipts, updates and crash atomicity', async () => {
  const report = await contention();
  assert.ok([...report.same, ...report.distinct].every(result => result.ok), JSON.stringify(report));
  assert.equal(report.checks.crashRollback, true);
  assert.equal(report.checks.eventsOutboxAtomic, true);
  assert.equal(report.checks.sameIdExactlyOneDay, true, JSON.stringify(report));
  assert.equal(report.checks.distinctIdsNoLostUpdates, true, JSON.stringify(report));
  assert.ok(report.receipts.every(r => r.committed), JSON.stringify(report));
});
