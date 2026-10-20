import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRun, DUNGEON_DAYS, runStageDays, runSummary } from './expedition.ts';

test('new runs freeze eight days across three maps and expose the next map cost', () => {
  const run = createRun('new', 'player', 1, ['unit'], 1, 0);
  assert.deepEqual(run.stageDayCosts, [3, 3, 2]);
  assert.equal(run.stageDayCosts!.reduce((sum, days) => sum + days, 0), DUNGEON_DAYS);
  const saved = JSON.parse(JSON.stringify(run));
  for (const [index, days] of [3, 3, 2].entries()) {
    saved.stageIndex = index;
    assert.equal(runStageDays(saved), days);
    assert.equal(runSummary(saved).stageDays, days);
  }
});

test('legacy runs retain their paid schedule without changing the save', () => {
  for (const stageDays of [undefined, 2, 8]) {
    const run = createRun('legacy', 'player', 1, ['unit'], 1, 0, { stageDays });
    delete run.stageDayCosts;
    const before = structuredClone(run);
    for (let index = 0; index < 3; index++) assert.equal(runStageDays(run, index), stageDays ?? 8);
    assert.equal(runSummary(run).stageDays, stageDays ?? 8);
    assert.deepEqual(run, before);
  }
});
