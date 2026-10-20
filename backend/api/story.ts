import type { Player, Store } from './store.ts';
import { CHARACTERS } from '../common/data/characters.ts';
import { enemyLevel } from '../common/game/calendar.ts';
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { isActiveRun } from '../common/game/expedition.ts';
import { questById, recruitedCharacters } from '../common/game/quests.ts';
import { chapterAvailable, chapterOpenDay } from '../common/game/story.ts';
import type { DispatchRecord } from '../common/game/dispatch.ts';
import { GAME_ITEMS } from '../common/game/items.ts';
import { COMPANION_EPILOGUES, COMPANION_QUEST_DEFS, STORY_CHAPTER_QUESTS, STORY_QUESTS, companionQuestId, storyClueKey, storyQuestId } from '../common/game/story-quests.ts';
import type { StoryStep } from '../common/game/story-quests.ts';
import { duelLevel } from '../common/game/story-duel.ts';

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

const markDone = (player: Player, stepId: string): void => {
  player.flags.storyStepsDone = [...new Set([...(player.flags.storyStepsDone ?? []), stepId])];
};

// 每种前置任务的统一入口：这些函数只改玩家状态，由调用方存盘。返回新完成的前置任务 ID。
function openSteps(player: Player, kind: StoryStep['kind']): StoryStep[] {
  const done = stepsDone(player);
  return STORY_CHAPTER_QUESTS.filter(row => chapterAvailable(row.chapter, player.day))
    .flatMap(row => row.steps.filter(step => step.kind === kind && !done.has(step.id)));
}

// 派遣返程时结算：派遣在章节开放之后出发、满足天数，就完成该章的派遣任务。
// 一次派遣只计入最早一个还没完成的章节。
export function completeDispatchSteps(player: Player, dispatch: Pick<DispatchRecord, 'startedDay' | 'durationDays'>): string | null {
  for (const step of openSteps(player, 'dispatch')) {
    if (step.kind !== 'dispatch') continue;
    const chapter = Number(step.id.split('-')[1]);
    if (dispatch.startedDay < chapterOpenDay(chapter) || dispatch.durationDays < step.days) continue;
    markDone(player, step.id);
    return step.id;
  }
  return null;
}

// 竞技场胜场／酒馆小游戏胜次：每次胜利给所有已开放、没完成的同类任务各加一次（章节开放之后才计）。
export function recordStoryWin(player: Player, kind: 'arena' | 'tavern'): string[] {
  const finished: string[] = [];
  player.flags.storyProgress ??= {};
  for (const step of openSteps(player, kind)) {
    if (step.kind !== 'arena' && step.kind !== 'tavern') continue;
    const have = (player.flags.storyProgress[step.id] ?? 0) + 1;
    player.flags.storyProgress[step.id] = have;
    if (have >= step.wins) { markDone(player, step.id); finished.push(step.id); }
  }
  return finished;
}

// 副本宝箱里的任务物品：已开放章节的“找物品”任务，仓库里持有对应物品就算完成（不扣除）。
export function syncFindSteps(store: Store, player: Player): string[] {
  const finished: string[] = [];
  for (const step of openSteps(player, 'find')) {
    if (step.kind === 'find' && store.countInventory(player.id, step.item) > 0) { markDone(player, step.id); finished.push(step.id); }
  }
  return finished;
}

export function completeDuelStep(player: Player, stepId: string): void { markDone(player, stepId); }

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
  return row.steps.map(step => {
    const base = { id: step.id, kind: step.kind, name: step.name, briefing: step.briefing, optional, done: done.has(step.id), available: open && !done.has(step.id) };
    switch (step.kind) {
      case 'dispatch': return { ...base, days: step.days };
      case 'submit': return { ...base, item: step.item, itemName: GAME_ITEMS[step.item].name, count: step.count, held: store.countInventory(player.id, step.item) };
      case 'find': return { ...base, item: step.item, itemName: GAME_ITEMS[step.item].name, held: store.countInventory(player.id, step.item), where: questById(step.route)?.name ?? step.route, mapName: classicMap(step.mapId).name };
      case 'duel': return { ...base, enemy: step.enemy, level: duelLevel(store.units(player.id), step) };
      case 'arena': case 'tavern': return { ...base, wins: step.wins, have: Math.min(step.wins, player.flags.storyProgress?.[step.id] ?? 0) };
    }
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
