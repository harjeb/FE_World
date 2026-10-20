import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicAdaptation, CLASSIC_ADAPTATIONS } from '../common/game/classic-adaptation.ts';
import { ALL_QUESTS, questById } from '../common/game/quests.ts';
import { COMPANION_QUESTS, STORY_CHAPTER_QUESTS, stepReward } from '../common/game/story-quests.ts';
import { GAME_ITEMS } from '../common/game/items.ts';

const POTIONS = ['energy_drop', 'secret_book', 'speedwing', 'goddess_icon', 'dracoshield', 'talisman'];
const isPotion = (item: string) => POTIONS.includes(item);

test('every growth potion is a stat item and the six kinds are all obtainable from quests', () => {
  for (const item of POTIONS) assert.equal(GAME_ITEMS[item as keyof typeof GAME_ITEMS].kind, 'stat');
  const fromQuests = new Set<string>();
  for (const quest of [...ALL_QUESTS, ...STORY_CHAPTER_QUESTS.flatMap(row => row.steps.map(step => ({ reward: stepReward(step) })))]) {
    for (const [item] of quest.reward.items ?? []) if (isPotion(item)) fromQuests.add(item);
  }
  assert.deepEqual([...fromQuests].sort(), [...POTIONS].sort());
});

test('each region\'s second core quest gives one growth potion, rotating through the six kinds', () => {
  const ids = ['r1-8', 'gw8', 'ih8', 'r4-8', 'wl8', 'r6-8', 'r7-8', 'r8-8', 'r9-8', 'r10-8', 'r11-8', 'r12-8'];
  ids.forEach((id, index) => {
    const potions = (questById(id)!.reward.items ?? []).filter(([item]) => isPotion(item));
    assert.deepEqual(potions, [[POTIONS[index % 6], 1]], `region ${index + 1} (${id})`);
  });
  // No other regional quest hands them out, so the supply stays at twelve a full playthrough.
  const holders = ALL_QUESTS.filter(q => !q.companion && (q.reward.items ?? []).some(([item]) => isPotion(item))).map(q => q.id).sort();
  assert.deepEqual(holders, [...ids].sort());
});

test('story tasks and companion quests also give growth potions', () => {
  const stepPotions = STORY_CHAPTER_QUESTS.flatMap(row => row.steps.flatMap(step => (stepReward(step).items ?? []).filter(([item]) => isPotion(item)).map(([item]) => `${step.id}:${item}`)));
  assert.deepEqual(stepPotions, ['story-3-a:secret_book', 'story-4-a:talisman', 'story-5-b:speedwing', 'story-6-b:goddess_icon', 'story-8-a:dracoshield', 'story-8-b:energy_drop']);
  assert.deepEqual(COMPANION_QUESTS.map(q => (q.reward.items ?? []).filter(([item]) => isPotion(item)).map(([item]) => item)), [['secret_book'], ['dracoshield'], ['talisman']]);
});

test('about a quarter of the plain classic chests hold a growth potion, and special chests are untouched', () => {
  const plain = CLASSIC_ADAPTATIONS.flatMap(m => m.objects.filter(o => o.kind === 'chest' && !o.secret && !o.hideIn));
  const potionChests = plain.filter(o => isPotion(o.loot!.item));
  assert.ok(plain.length >= 15, `${plain.length} plain chests`);
  assert.ok(potionChests.length >= 5 && potionChests.length <= plain.length * 0.7, `${potionChests.length} of ${plain.length} chests`);
  assert.ok(new Set(potionChests.map(o => o.loot!.item)).size >= 3, 'several kinds appear');
  for (const o of potionChests) assert.equal(o.loot!.count, 1);
  // The hidden-content chests keep their own design: the old map and the rank-up secret room.
  const old = classicAdaptation('fe6-ch22-main').objects.find(o => o.id === 'chest-object-4')!;
  assert.deepEqual([old.loot, old.secret?.loot], [{ item: 'silver_lance', count: 1 }, { item: 'old_map', count: 1 }]);
  assert.ok(classicAdaptation('fe7-ch27-eliwood').objects.filter(o => o.id.startsWith('secret-chest-')).every(o => o.lootRoll === 'rank_up' && !o.loot));
  assert.deepEqual(classicAdaptation('fe6-ch23-main').objects.find(o => o.id === 'find-2')!.loot, { item: 'story_find_2', count: 1 });
});
