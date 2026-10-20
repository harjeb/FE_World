import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_QUESTS, BASE_QUESTS, QUEST_DAY_COST, QUEST_REGIONS, QUESTS, questAvailable, questById, questsForRegion, recruitedCharacters } from './quests.ts';
import { REPUTATION_TIERS, reputationTier } from './reputation.ts';
import { regionShop } from './quest-shop.ts';

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

test('all twelve regions reach every reputation tier in the same minimum action days', () => {
  for (const region of QUEST_REGIONS) {
    const quests = BASE_QUESTS.filter(q => q.region === region);
    assert.equal(quests.length, 9, `region ${region}`);
    assert.equal(quests.reduce((sum, q) => sum + q.reward.reputation, 0), 500);
    // 穷举合法已完成集合，允许任意支线顺序；不只核对配置总数，防止前置／声望门槛暗中拖慢某地。
    const reachable = new Set([0]);
    const fastest = new Map(REPUTATION_TIERS.slice(1).map(tier => [tier.at, Infinity]));
    for (let mask = 0; mask < 1 << quests.length; mask++) {
      if (!reachable.has(mask)) continue;
      const completed = quests.filter((_, i) => mask & (1 << i));
      const reputation = completed.reduce((sum, q) => sum + q.reward.reputation, 0);
      const days = completed.reduce((sum, q) => sum + (q.costDays ?? QUEST_DAY_COST[q.tier]), 0);
      const done = new Set(completed.map(q => q.id));
      for (const [tier, best] of fastest) if (reputation >= tier) fastest.set(tier, Math.min(best, days));
      quests.forEach((quest, i) => { if (questAvailable(quest, { done, reputation })) reachable.add(mask | (1 << i)); });
    }
    assert.ok(reachable.has((1 << quests.length) - 1), `region ${region} has a deadlock`);
    assert.deepEqual([...fastest], [[100, 5], [250, 14], [500, 32]], `region ${region}`);
    assert.equal(quests.reduce((maps, q) => maps + (q.tier === 'region' ? 3 : 1), 0), 17);
    for (const item of regionShop(region, Infinity)) assert.ok(item.reputation <= 500, `${region}:${item.item}`);
  }
});

test('classic content cannot accelerate three regions and regional endings keep rare rewards limited', () => {
  for (const quest of ALL_QUESTS.filter(q => q.classic)) assert.equal(quest.reward.reputation, 0, quest.id);
  assert.deepEqual(BASE_QUESTS.filter(q => q.unlocksLegacy).map(q => q.id), ['gw9', 'ih9', 'wl9']);
  const rare = new Set(['legacy_stone_growth', 'legacy_stone_numeric', 'reincarnation_core', 'immortal_shield']);
  for (const quest of BASE_QUESTS.filter(q => q.id.startsWith('r'))) {
    assert.ok(!(quest.reward.items ?? []).some(([item]) => rare.has(item)), quest.id);
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
});

test('every regional quest chain can be finished without a reputation deadlock', () => {
  for (const region of QUEST_REGIONS) {
    const quests = questsForRegion(region);
    const done = new Set<string>();
    let reputation = 0, progressed = true;
    while (progressed) {
      progressed = false;
      for (const quest of quests) if (questAvailable(quest, { done, reputation, recruited: recruitedCharacters(done) })) { done.add(quest.id); reputation += quest.reward.reputation; progressed = true; }
    }
    assert.deepEqual(quests.filter(quest => !done.has(quest.id)).map(quest => quest.id), [], `region ${region}`);
  }
});
