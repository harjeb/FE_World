import { createClassicBattle } from './battles.ts';
import type { BattleRecord } from './battles.ts';
import { createEnemy, defaultBehavior, templateFor } from './enemies.ts';
import type { UnitRecord } from './model.ts';
import type { StoryStep } from './story-quests.ts';
import { CATALOG_CLASS_IDS, CLASSES, classUnavailableReason } from '../data/classes.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import type { ClassId } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';

export type DuelStep = Extract<StoryStep, { kind: 'duel' }>;
export const DUEL_DAYS = 1;

// 对手的职业是与应战角色**同阶级**（同一 stage：初级／中级／上级／最上级／神将级）的随机一个：
// 只从目录里可用、有攻击手段的人类职业里挑（纯治疗职业、兽龙种族职业不参与），免得对手不会还手。
// 同一个种子挑出的职业固定；池子为空时退回应战者自己的职业（再不行就剑士）。
export function duelClassPool(classId: ClassId): ClassId[] {
  const attacks = (id: ClassId) => templateFor(id).weapons.some(weapon => !WEAPONS[weapon].heal && WEAPONS[weapon].might > 0);
  return (CATALOG_CLASS_IDS as ClassId[]).filter(id => CLASSES[id].stage === CLASSES[classId].stage && CLASSES[id].source !== 'species'
    && !classUnavailableReason(id) && attacks(id));
}

export function duelClass(classId: ClassId, seed: string): ClassId {
  const pool = duelClassPool(classId);
  if (pool.length === 0) return templateFor(classId).weapons.some(weapon => !WEAPONS[weapon].heal) ? classId : 'swordsman';
  return pool[nextU32(seedRng(`duel-class:${seed}`)) % pool.length];
}

// 玩家名册里现役角色的最高等级：单挑对手按它来设计。
export function highestLevel(units: readonly Pick<UnitRecord, 'level' | 'status'>[]): number {
  return units.filter(unit => unit.status === 'active').reduce((best, unit) => Math.max(best, unit.level), 1);
}

export function duelLevel(units: readonly Pick<UnitRecord, 'level' | 'status'>[], step: DuelStep): number {
  return Math.min(99, highestLevel(units) + step.levelBonus);
}

// 主线单挑（docs/38 §3.4）：借一张小型经典图，只留我方一人；对手使用剧情中的固定身份。
// 等级是玩家名册里最高等级再加 levelBonus，职业仍是与应战角色同阶级的随机一个。击败他即获胜。战斗是普通野外战斗：
// 真实死亡、正常经验，但不算地区讨伐。
export function createStoryDuel(unit: UnitRecord, step: DuelStep, options: { seed: string; day: number; level: number }): BattleRecord {
  const record = createClassicBattle([unit], { mapId: step.mapId, seed: options.seed, day: options.day });
  const state = record.state;
  const boss = state.units.find(u => u.side === 'enemy' && u.boss) ?? state.units.find(u => u.side === 'enemy')!;
  const classId = duelClass(unit.classId, options.seed);
  const name = step.enemy;
  state.enemyIdentity = { faction: '单挑护卫', commander: name };
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
