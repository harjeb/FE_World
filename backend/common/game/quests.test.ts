import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_QUESTS, QUEST_DAY_COST, QUEST_REGIONS, QUESTS, questAvailable, questById, questsForRegion } from './quests.ts';
import { REPUTATION_TIERS, REPEAT_REPUTATION_CAP, reputationTier } from './reputation.ts';

test('quest ids are unique and every prerequisite exists in the same region and comes first', () => {
  const ids = new Set<string>();
  for (const q of QUESTS) {
    assert.ok(!ids.has(q.id), `duplicate quest id ${q.id}`);
    ids.add(q.id);
  }
  for (const q of QUESTS) {
    if (!q.requires?.quest) continue;
    const req = questById(q.requires.quest);
    assert.ok(req, `${q.id} requires missing ${q.requires.quest}`);
    assert.equal(req.region, q.region, `${q.id} requires a quest from another region`);
    assert.ok(QUESTS.indexOf(req) < QUESTS.indexOf(q), `${q.id} requires a later quest`);
  }
});

test('the three launch regions each have nine base quests summing to 500 reputation', () => {
  for (const region of [2, 3, 5]) {
    const quests = BASE_QUESTS.filter(q => q.region === region);
    assert.equal(quests.length, 9, `region ${region} has ${quests.length} quests`);
    const total = quests.reduce((sum, q) => sum + q.reward.reputation, 0);
    assert.equal(total, 500, `region ${region} reputation sums to ${total}`);
    // 短+标准+区域三档耗日都在配置里，且远征恰好一个。
    assert.ok(quests.filter(q => q.tier === 'region').length >= 1);
    for (const q of quests) assert.ok(QUEST_DAY_COST[q.tier] > 0);
  }
});

test('a chain quest stays locked until the previous one is done, and mid-chain needs 100 reputation', () => {
  const none = { done: new Set<string>(), reputation: 0 };
  assert.ok(questAvailable(questById('gw1')!, none));
  assert.ok(!questAvailable(questById('gw2')!, none), 'gw2 needs gw1');
  const afterFirst = { done: new Set(['gw1']), reputation: 0 };
  assert.ok(questAvailable(questById('gw2')!, afterFirst));
  assert.ok(!questAvailable(questById('gw4')!, { done: new Set(['gw1', 'gw2', 'gw3']), reputation: 0 }), 'gw4 needs 熟悉');
  assert.ok(questAvailable(questById('gw4')!, { done: new Set(['gw1', 'gw2', 'gw3']), reputation: 100 }));
  // 已完成的任务不再可接。
  assert.ok(!questAvailable(questById('gw1')!, { done: new Set(['gw1']), reputation: 0 }));
});

test('reputation tiers sit at the four documented thresholds', () => {
  assert.deepEqual(REPUTATION_TIERS.map(t => t.at), [0, 100, 250, 500]);
  assert.equal(reputationTier(0).name, '陌生');
  assert.equal(reputationTier(99).name, '陌生');
  assert.equal(reputationTier(100).name, '熟悉');
  assert.equal(reputationTier(249).name, '熟悉');
  assert.equal(reputationTier(250).name, '信任');
  assert.equal(reputationTier(500).name, '盟友');
  assert.equal(reputationTier(500).next, null);
  assert.equal(REPEAT_REPUTATION_CAP, 250);
});
