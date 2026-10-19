// 青蛙赛跑演出：冲线顺序必须等于服务端名次，同一种子重播一致，途中领先会变化。
import assert from 'node:assert/strict';
import test from 'node:test';

const { frogAt, leaderAt, raceTimeline, RACE_MS, TRACK } = await import('../src/model/frog-race.ts');

const ORDERS = [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]];

test('frogs cross the line in exactly the stored order', () => {
  for (const order of ORDERS) for (let s = 0; s < 50; s++) {
    const tracks = raceTimeline(order, `seed-${s}`);
    const byFinish = [...tracks].sort((a, b) => a.finish - b.finish).map(t => t.frog);
    assert.deepEqual(byFinish, order, `seed-${s}`);
    for (const t of tracks) {
      assert.equal(frogAt(t, t.finish).x, TRACK);
      assert.ok(frogAt(t, t.finish - 1).x < TRACK, 'nobody is at the line before its finish time');
      // Monotonic forward motion, never past the line.
      let last = 0;
      for (let ms = 0; ms <= t.finish; ms += 50) { const x = frogAt(t, ms).x; assert.ok(x >= last - 1e-9 && x <= TRACK + 1e-9); last = x; }
    }
    assert.equal(Math.min(...tracks.map(t => t.finish)), RACE_MS);
  }
});

test('the same race replays identically', () => {
  assert.deepEqual(raceTimeline([2, 0, 3, 1], 'abc'), raceTimeline([2, 0, 3, 1], 'abc'));
  assert.notDeepEqual(raceTimeline([2, 0, 3, 1], 'abc'), raceTimeline([2, 0, 3, 1], 'abd'));
});

test('the lead changes during most races', () => {
  let changed = 0;
  for (let s = 0; s < 60; s++) {
    const tracks = raceTimeline([0, 1, 2, 3], `lead-${s}`);
    const leaders = new Set();
    for (let ms = 2000; ms < RACE_MS; ms += 250) leaders.add(leaderAt(tracks, ms));
    if (leaders.size > 1) changed++;
  }
  assert.ok(changed >= 40, `${changed} / 60 races had a lead change`);
});
