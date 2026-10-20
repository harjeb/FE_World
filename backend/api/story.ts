import type { Player, Store } from './store.ts';
import { CHARACTERS } from '../common/data/characters.ts';
import { enemyLevel } from '../common/game/calendar.ts';
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { isActiveRun } from '../common/game/expedition.ts';
import { recruitedCharacters } from '../common/game/quests.ts';
import { chapterAvailable } from '../common/game/story.ts';
import { COMPANION_EPILOGUES, COMPANION_QUEST_DEFS, STORY_CHAPTER_QUESTS, STORY_QUESTS, companionQuestId, storyClueKey } from '../common/game/story-quests.ts';

// 主线任务与伙伴任务的视图（docs/38）。任务本身走 START_QUEST／CLAIM_QUEST_REWARD，这里只拼展示数据。
export function storyQuestView(store: Store, player: Player, chapter: number) {
  const quest = STORY_QUESTS.find(q => q.story === chapter);
  const def = STORY_CHAPTER_QUESTS.find(row => row.chapter === chapter);
  if (!quest || !def) return null;
  const done = (player.flags.questsDone ?? []).includes(quest.id);
  const clueKey = storyClueKey(chapter);
  const adaptation = classicAdaptation(quest.scenarioId!);
  const busy = !!store.activeBattle(player.id) || isActiveRun(store.activeRun(player.id)) || !!store.activeAnnualEntry(player.id);
  const open = chapterAvailable(chapter, player.day);
  return {
    id: quest.id, name: quest.name, briefing: quest.event, objective: quest.objective, kind: quest.kind,
    mapName: classicMap(quest.scenarioId!).name, turnLimit: quest.turnLimit, maxUnits: adaptation.deployment.max,
    costDays: quest.costDays, toDay: player.day + (quest.costDays ?? 2), enemyLevel: Math.min(99, enemyLevel(player.day, 0) + adaptation.difficulty),
    reward: quest.reward, done, claimed: (player.flags.questRewardsClaimed ?? []).includes(quest.id),
    inProgress: store.activeBattle(player.id)?.questId === quest.id,
    available: open && !done && !busy,
    // 旧档里这一章可能早就被旧版“完成本章事件”按钮标记过：任务仍可补打，领取奖励与线索。
    legacyCompleted: !done && (player.flags.storyCompleted ?? []).includes(chapter),
    clue: { item: clueKey, name: def.clue.name, held: store.countInventory(player.id, clueKey) > 0, note: done || store.countInventory(player.id, clueKey) > 0 ? def.clue.note : null },
  };
}

// 地区固定人物的伙伴任务摘要：人物经地区远征加入过名册后解锁，阵亡不撤销。
export function companionView(player: Player) {
  const recruited = recruitedCharacters(player.flags.questRewardsClaimed ?? []);
  const done = new Set(player.flags.questsDone ?? []);
  return COMPANION_QUEST_DEFS.map(def => {
    const id = companionQuestId(def.character);
    return {
      character: def.character, name: CHARACTERS[def.character].name, region: def.region, recruited: recruited.has(def.character),
      questId: id, questName: def.name, done: done.has(id), epilogue: done.has(id) ? COMPANION_EPILOGUES[id] : null,
    };
  });
}
