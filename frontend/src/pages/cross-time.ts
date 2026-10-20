import type { AiDifficulty } from '@common/engine/types.ts';
import type { QuestView, ServerQuests } from '../api/session.ts';

export const isCrossTime = (quest: { id: string }) => quest.id === 'cross-time-throne';

// A single account-global quest is projected into the selected region; acceptance
// narrows the server's availableRegions rather than creating regional copies.
export function questsInRegion(quests: ServerQuests, region: number): QuestView[] {
  const local = quests.regions.find(r => r.region === region)?.quests ?? [];
  const cross = quests.crossTime;
  return [...local.filter(q => !isCrossTime(q) && !q.dungeonOnly && (q.available || q.done || q.claimed || q.inProgress)),
    ...(cross && cross.availableRegions.includes(region) && (cross.acceptedRegion === null || cross.acceptedRegion === region) ? [cross] : [])];
}

export function crossTimeReward(difficulty: AiDifficulty, cleared: boolean): string {
  if (difficulty === 'hard') return cleared
    ? '1500 金币；20% 概率获得时空碎片 ×1'
    : '困难首通：3500 金币、勇者之剑 ×1、完整料理 ×2；20% 概率获得时空碎片 ×1';
  return cleared ? '800 金币；20% 概率获得时空碎片 ×1'
    : '普通首通：2500 金币、银剑 ×1、伤药 ×2、时空碎片 ×3；解锁固定兑换与本图困难';
}
