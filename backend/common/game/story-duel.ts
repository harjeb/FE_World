import { createClassicBattle } from './battles.ts';
import type { BattleRecord } from './battles.ts';
import { createEnemy, defaultBehavior, templateFor } from './enemies.ts';
import { generateRecruit } from './random-recruit.ts';
import type { UnitRecord } from './model.ts';
import type { StoryStep } from './story-quests.ts';
import { CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';

export type DuelStep = Extract<StoryStep, { kind: 'duel' }>;
export const DUEL_DAYS = 1;

// 对手的职业与应战角色相近：同一职业；如果这个职业拿不到攻击武器（纯治疗），换成有攻击手段的近似职业，
// 免得单挑变成一场不会还手的仪式。
export function duelClass(classId: ClassId): ClassId {
  const attacks = (id: ClassId) => templateFor(id).weapons.some(weapon => !WEAPONS[weapon].heal && WEAPONS[weapon].might > 0);
  if (attacks(classId)) return classId;
  return CLASSES[classId].weapons.tome !== undefined || CLASSES[classId].weapons.staff !== undefined ? 'mage' : 'swordsman';
}

// 玩家名册里现役角色的最高等级：单挑对手按它来设计。
export function highestLevel(units: readonly Pick<UnitRecord, 'level' | 'status'>[]): number {
  return units.filter(unit => unit.status === 'active').reduce((best, unit) => Math.max(best, unit.level), 1);
}

export function duelLevel(units: readonly Pick<UnitRecord, 'level' | 'status'>[], step: DuelStep): number {
  return Math.min(99, highestLevel(units) + step.levelBonus);
}

// 主线单挑（docs/38 §3.4）：借一张小型经典图，只留我方一人，对手是按种子随机生成的人物——名字随机，
// 等级是玩家名册里最高等级再加 levelBonus，职业与应战角色相近。击败他即获胜。战斗是普通野外战斗：
// 真实死亡、正常经验，但不算地区讨伐。
export function createStoryDuel(unit: UnitRecord, step: DuelStep, options: { seed: string; day: number; level: number }): BattleRecord {
  const record = createClassicBattle([unit], { mapId: step.mapId, seed: options.seed, day: options.day });
  const state = record.state;
  const boss = state.units.find(u => u.side === 'enemy' && u.boss) ?? state.units.find(u => u.side === 'enemy')!;
  const classId = duelClass(unit.classId);
  const name = `${generateRecruit(`duel:${options.seed}`).name}（${step.enemy}）`;
  const champion = createEnemy('e0', { seed: `duel:${options.seed}`, classId, level: options.level, pos: boss.pos, boss: true, name, behavior: defaultBehavior(classId) });
  state.units = [...state.units.filter(u => u.side === 'player'), champion];
  state.goal = { kind: 'boss', target: champion.id };
  state.name = `单挑：${name}`;
  record.name = state.name;
  record.goalText = `单挑击败${name}`;
  record.costDays = DUEL_DAYS;
  record.questId = step.id;
  record.initial = structuredClone(state);
  return record;
}
