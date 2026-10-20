import type { Player, Store } from './store.ts';
import { CHARACTERS } from '../common/data/characters.ts';
import { enemyLevel } from '../common/game/calendar.ts';
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { isActiveRun } from '../common/game/expedition.ts';
import { recruitedCharacters } from '../common/game/quests.ts';
import { chapterAvailable, chapterOpenDay } from '../common/game/story.ts';
import type { DispatchRecord } from '../common/game/dispatch.ts';
import { GAME_ITEMS } from '../common/game/items.ts';
import { COMPANION_EPILOGUES, COMPANION_QUEST_DEFS, STORY_CHAPTER_QUESTS, STORY_QUESTS, companionQuestId, storyClueKey, storyQuestId } from '../common/game/story-quests.ts';
import type { StoryStep } from '../common/game/story-quests.ts';

const stepsDone = (player: Player): Set<string> => new Set(player.flags.storyStepsDone ?? []);

// 旧版里已被“完成本章事件”按钮记为完成、但新收尾战还没打的章节：前置任务不再拦收尾战。
const legacyCompleted = (player: Player, chapter: number): boolean =>
  (player.flags.storyCompleted ?? []).includes(chapter) && !(player.flags.questsDone ?? []).includes(storyQuestId(chapter));

// 收尾战的前置检查：返回第一个没完成的前置任务名；全部完成（或旧档补打）返回 null。
export function storyPrerequisite(player: Player, chapter: number): string | null {
  if (legacyCompleted(player, chapter)) return null;
  const done = stepsDone(player);
  return STORY_CHAPTER_QUESTS.find(row => row.chapter === chapter)?.steps.find(step => !done.has(step.id))?.name ?? null;
}

// 派遣返程时结算：章节已开放，派遣在章节开放之后出发、满足天数，就完成该章的派遣任务。
// 一次派遣只计入最早一个还没完成的章节。返回新完成的前置任务 ID。
export function completeDispatchSteps(player: Player, dispatch: Pick<DispatchRecord, 'startedDay' | 'durationDays'>): string | null {
  const done = stepsDone(player);
  for (const row of STORY_CHAPTER_QUESTS) {
    const step = row.steps.find(s => s.kind === 'dispatch');
    if (!step || done.has(step.id) || step.kind !== 'dispatch') continue;
    if (!chapterAvailable(row.chapter, player.day) || dispatch.startedDay < chapterOpenDay(row.chapter) || dispatch.durationDays < step.days) continue;
    player.flags.storyStepsDone = [...done, step.id];
    return step.id;
  }
  return null;
}

export function findStoryStep(stepId: string): { chapter: number; step: StoryStep } | null {
  for (const row of STORY_CHAPTER_QUESTS) {
    const step = row.steps.find(s => s.id === stepId);
    if (step) return { chapter: row.chapter, step };
  }
  return null;
}

function stepViews(store: Store, player: Player, chapter: number) {
  const row = STORY_CHAPTER_QUESTS.find(r => r.chapter === chapter);
  if (!row) return [];
  const done = stepsDone(player);
  const open = chapterAvailable(chapter, player.day);
  const optional = legacyCompleted(player, chapter);
  return row.steps.map((step, index) => {
    const previous = index === 0 || done.has(row.steps[index - 1].id);
    const held = step.kind === 'submit' ? store.countInventory(player.id, step.item) : null;
    return {
      id: step.id, kind: step.kind, name: step.name, briefing: step.briefing, optional,
      done: done.has(step.id), available: open && previous && !done.has(step.id),
      ...(step.kind === 'dispatch' ? { days: step.days } : { item: step.item, itemName: GAME_ITEMS[step.item].name, count: step.count, held }),
    };
  });
}

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
    steps: stepViews(store, player, chapter), prerequisite: storyPrerequisite(player, chapter),
    available: open && !done && !busy && storyPrerequisite(player, chapter) === null,
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
