import type { Player, Store } from './store.ts';
import { CLASSES } from '../common/data/classes.ts';
import type { ClassId } from '../common/data/classes.ts';
import { BOUNTY_QUESTS } from '../common/game/bounties.ts';
import type { Quest } from '../common/game/quests.ts';
import { chapterAvailable } from '../common/game/story.ts';
import type { BattleState } from '../common/engine/types.ts';

// 目标类支线任务（悬赏）的进度与完成（docs/38 §3.7）。进度记在 flags.questProgress，完成时记入 questsDone，
// 之后用 CLAIM_QUEST_REWARD 交付；任务门槛（章节）开放之前的战斗不计数。
const progressOf = (player: Player, id: string): number => player.flags.questProgress?.[id] ?? 0;
const doneSet = (player: Player): Set<string> => new Set(player.flags.questsDone ?? []);

// 此刻正在计数的悬赏：章节门槛已开放且还没完成。
function counting(player: Player, type: 'kill' | 'win' | 'dungeon'): Quest[] {
  const done = doneSet(player);
  return BOUNTY_QUESTS.filter(q => q.bounty!.type === type && !done.has(q.id)
    && (q.requires?.chapter === undefined || chapterAvailable(q.requires.chapter, player.day)));
}

function add(player: Player, quest: Quest, amount: number): boolean {
  if (amount <= 0) return false;
  player.flags.questProgress ??= {};
  const need = quest.bounty!.count;
  const have = Math.min(need, progressOf(player, quest.id) + amount);
  player.flags.questProgress[quest.id] = have;
  if (have < need) return false;
  player.flags.questsDone = [...new Set([...(player.flags.questsDone ?? []), quest.id])];
  return true;
}

// 一场出战战斗结束后调用：被击败的敌军按职业路线计入击杀类悬赏，胜利计入连胜类悬赏。
// 只算普通出战（mode=field），竞技场和年度赛事的对手是别的玩家的快照，不计。返回新完成的悬赏 ID。
export function trackBattleBounties(player: Player, record: { mode: string; state: BattleState }): string[] {
  if (record.mode !== 'field') return [];
  const defeated = record.state.units.filter(u => u.side === 'enemy' && !u.alive);
  const finished: string[] = [];
  for (const quest of counting(player, 'kill')) {
    const route = quest.bounty!.type === 'kill' ? quest.bounty!.route : undefined;
    const n = route ? defeated.filter(u => CLASSES[u.classId as ClassId]?.route === route).length : defeated.length;
    if (add(player, quest, n)) finished.push(quest.id);
  }
  if (record.state.result?.winner === 'player') {
    for (const quest of counting(player, 'win')) if (add(player, quest, 1)) finished.push(quest.id);
  }
  return finished;
}

// 完整通关一次地区大副本／经典副本后调用。
export function trackDungeonBounties(player: Player): string[] {
  return counting(player, 'dungeon').filter(quest => add(player, quest, 1)).map(quest => quest.id);
}

export function announceBounties(store: Store, player: Player, ids: readonly string[]): void {
  if (ids.length === 0) return;
  store.savePlayer(player);
  for (const id of ids) {
    const quest = BOUNTY_QUESTS.find(q => q.id === id)!;
    store.addEvent(player.id, 'quest', `完成目标任务「${quest.name}」：${quest.objective}。打完即可交任务。`, { questId: id });
  }
}

export interface BountyRow {
  id: string; name: string; objective: string; type: 'kill' | 'win' | 'dungeon'; need: number; have: number;
  chapter: number | null; available: boolean; done: boolean; claimed: boolean; reward: Quest['reward'];
}

export function bountyRows(player: Player): BountyRow[] {
  const done = doneSet(player);
  const claimed = new Set(player.flags.questRewardsClaimed ?? []);
  return BOUNTY_QUESTS.map(q => {
    const spec = q.bounty!;
    const chapter = q.requires?.chapter ?? null;
    const have = done.has(q.id) ? spec.count : Math.min(spec.count, progressOf(player, q.id));
    return {
      id: q.id, name: q.name, objective: q.objective, type: spec.type, need: spec.count, have, chapter,
      available: chapter === null || chapterAvailable(chapter, player.day), done: done.has(q.id), claimed: claimed.has(q.id), reward: q.reward,
    };
  });
}
