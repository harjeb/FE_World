import { enemyLevel } from './calendar.ts';
import { createClassicBattle } from './battles.ts';
import type { BattleRecord } from './battles.ts';
import type { UnitRecord } from './model.ts';
import type { StoryStep } from './story-quests.ts';

export type DuelStep = Extract<StoryStep, { kind: 'duel' }>;
export const DUEL_DAYS = 1;

// 主线单挑（docs/38 §3.4）：借一张小型经典图，只留我方一人和一名带名字的强敌，其余敌军全部去掉；
// 强敌比同期敌军高 levelBonus 级（再加经典图首领的 +2），击败他即获胜。战斗是普通野外战斗：真实死亡、
// 正常经验，但不算地区讨伐。
export function createStoryDuel(unit: UnitRecord, step: DuelStep, options: { seed: string; day: number }): BattleRecord {
  const record = createClassicBattle([unit], { mapId: step.mapId, seed: options.seed, day: options.day, level: enemyLevel(options.day, 0) + step.levelBonus });
  const state = record.state;
  const champion = state.units.find(u => u.side === 'enemy' && u.boss) ?? state.units.find(u => u.side === 'enemy')!;
  champion.boss = true;
  champion.name = step.enemy;
  state.units = state.units.filter(u => u.side === 'player' || u === champion);
  state.goal = { kind: 'boss', target: champion.id };
  state.name = `单挑：${step.enemy}`;
  record.name = state.name;
  record.goalText = `单挑击败${step.enemy}`;
  record.costDays = DUEL_DAYS;
  record.questId = step.id;
  record.initial = structuredClone(state);
  return record;
}
