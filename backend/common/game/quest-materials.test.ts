import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_QUESTS, QUESTS, questById, type Quest } from './quests.ts';
import { BOUNTY_QUESTS } from './bounties.ts';
import { CLASSIC_QUESTS } from './classic-quests.ts';
import { STORY_CHAPTER_QUESTS, STORY_QUESTS } from './story-quests.ts';
import { GAME_ITEMS } from './items.ts';
import { MATERIALS, materialDrops, type MaterialId } from './materials.ts';

const materials = (quest: Quest) => (quest.reward.items ?? []).filter(([id]) => id in MATERIALS)
  .map(([id, count]) => ({ id: id as MaterialId, count, ...MATERIALS[id as MaterialId] }));
const active = [...ALL_QUESTS.filter(q => !q.archived), ...STORY_QUESTS, ...BOUNTY_QUESTS];

test('all active regional, companion, story and bounty quests award valid common materials', () => {
  for (const quest of active) {
    assert.ok(materials(quest).length > 0, `${quest.id} lacks materials`);
    for (const [id, count] of quest.reward.items ?? []) {
      assert.ok(GAME_ITEMS[id], `${quest.id}: unknown ${id}`);
      assert.ok(Number.isInteger(count) && count > 0, `${quest.id}: invalid count`);
    }
    for (const material of materials(quest)) {
      assert.equal(material.rare, false, `${quest.id}: guaranteed rare`);
      if (quest.region) assert.ok(material.regions.includes(quest.region), `${quest.id}: ${material.id} habitat`);
    }
  }
});

test('regional material rewards follow progress and remain fixed across previews', () => {
  for (const quest of QUESTS) {
    const core = /(?:gw|ih|wl)[789]$|^r\d+-[789]$/.test(quest.id);
    const level = quest.tier === 'short' ? 1 : quest.tier === 'standard' ? 10 : core ? 35 : 20;
    const rolls = quest.tier === 'short' ? 3 : quest.tier === 'standard' ? 4 : core ? 8 : 6;
    const drops = materialDrops(quest.region, level, `quest:${quest.id}`, rolls, 0);
    assert.equal(materials(quest).reduce((n, m) => n + m.count, 0), rolls, quest.id);
    assert.deepEqual(materials(quest).map(m => ({ item: m.id, count: m.count })), drops);
    assert.deepEqual(questById(quest.id)?.reward, quest.reward);
    const maxTier = quest.tier === 'short' ? 1 : quest.tier === 'standard' ? 2 : core ? 4 : 3;
    assert.ok(materials(quest).every(m => m.tier <= maxTier), quest.id);
  }
});

test('archived classics keep their old rewards and featured routes have distinct supplies', () => {
  for (const quest of CLASSIC_QUESTS.filter(q => q.archived)) assert.equal(quest.reward.items, undefined);
  const featured = CLASSIC_QUESTS.filter(q => !q.archived);
  assert.equal(new Set(featured.map(q => JSON.stringify(q.reward.items))).size, featured.length);
});

test('story submissions preserve saved IDs and counts while naming the required species', () => {
  const submissions = STORY_CHAPTER_QUESTS.flatMap(q => q.steps).filter(s => s.kind === 'submit');
  assert.deepEqual(submissions.map(s => [s.id, s.item, s.count]), [['story-3-b', 'ore', 8], ['story-7-a', 'herb', 15]]);
  assert.ok(submissions[0].briefing.includes('铁矿'));
  assert.ok(submissions[1].briefing.includes('止血草'));
});

test('baseline weapon progression supplements retained limited rewards', () => {
  for (const [id, item] of [['r1-1', 'fw_weapon_1'], ['r1-2', 'fw_weapon_2'], ['r1-3', 'iron_sword'], ['r1-7', 'steel_sword'], ['r1-9', 'silver_sword'], ['gw1', 'short_bow'], ['gw6', 'killer_bow'], ['ih6', 'killer_lance']]) {
    assert.ok(questById(id)?.reward.items?.some(([key]) => key === item), `${id}: ${item}`);
  }
  assert.equal(questById('wl7')?.exclusive, 'fw_weapon_8');
});
