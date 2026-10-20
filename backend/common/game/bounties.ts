import type { ClassRoute } from '../data/classes.ts';
import { ROUTE_NAMES } from '../data/classes.ts';
import type { ItemKey } from './items.ts';
import { materialDrops } from './materials.ts';
import type { Quest } from './quests.ts';

// 目标类支线任务（悬赏，docs/38 §3.7）：不用接取，条件满足的那一刻起自动计数，打完就能交；
// 进度不挑具体战斗，只要是普通出战（地区野外、任务、副本图、挑战塔、单挑）都算。
//  - kill：击败敌军，可限定职业路线（剑、弓、法术……）；每场战斗结束后按场上被击败的敌军结算；
//  - win：赢得出战战斗；
//  - dungeon：完整通关一次地区大副本或经典副本（含重复与困难）。
// 章节门槛：requires.chapter 的悬赏在该章开放之后才开始计数（“第 3 章进入就有一个击杀 10 名剑职业敌人”）。
export type BountySpec =
  | { type: 'kill'; count: number; route?: ClassRoute }
  | { type: 'win'; count: number }
  | { type: 'dungeon'; count: number };

interface BountyDef { id: string; name: string; chapter?: number; spec: BountySpec; gold: number; items: [ItemKey, number][] }

const DEFS: BountyDef[] = [
  { id: 'bounty-rookie', name: '新兵试炼', spec: { type: 'kill', count: 10 }, gold: 200, items: [['vulnerary', 2]] },
  { id: 'bounty-wins', name: '野外三连胜', spec: { type: 'win', count: 3 }, gold: 300, items: [['antidote', 1], ['vulnerary', 2]] },
  { id: 'bounty-c1-bow', name: '弓手猎人', chapter: 1, spec: { type: 'kill', count: 8, route: 'bow' }, gold: 300, items: [['antidote', 2], ['vulnerary', 2]] },
  { id: 'bounty-c1-dungeon', name: '第一座副本', chapter: 1, spec: { type: 'dungeon', count: 1 }, gold: 500, items: [['elixir', 1], ['vulnerary', 2]] },
  { id: 'bounty-c2-armor', name: '重甲破阵', chapter: 2, spec: { type: 'kill', count: 8, route: 'armor' }, gold: 400, items: [['elixir', 1], ['antidote', 1]] },
  { id: 'bounty-c3-sword', name: '剑下功夫', chapter: 3, spec: { type: 'kill', count: 10, route: 'sword' }, gold: 450, items: [['elixir', 1], ['vulnerary', 3]] },
  { id: 'bounty-c4-wins', name: '连战连胜', chapter: 4, spec: { type: 'win', count: 5 }, gold: 600, items: [['elixir', 2]] },
  { id: 'bounty-c5-magic', name: '猎杀法师', chapter: 5, spec: { type: 'kill', count: 10, route: 'magic' }, gold: 500, items: [['antidote', 2], ['elixir', 1]] },
  { id: 'bounty-c6-dungeon', name: '深入险地', chapter: 6, spec: { type: 'dungeon', count: 2 }, gold: 700, items: [['elixir', 2], ['silver_lance', 1]] },
  { id: 'bounty-c7-flying', name: '击落飞兵', chapter: 7, spec: { type: 'kill', count: 8, route: 'flying' }, gold: 600, items: [['elixir', 1], ['antidote', 2]] },
  { id: 'bounty-c8-sweep', name: '终局清剿', chapter: 8, spec: { type: 'kill', count: 20 }, gold: 800, items: [['elixir', 2], ['brave_sword', 1]] },
];

export function bountyObjective(spec: BountySpec): string {
  if (spec.type === 'kill') return `击败 ${spec.count} 名${spec.route ? `${ROUTE_NAMES[spec.route]}职业` : ''}敌军`;
  if (spec.type === 'win') return `赢得 ${spec.count} 场战斗`;
  return `完整通关 ${spec.count} 次地区大副本或经典副本`;
}

export const BOUNTY_QUESTS: Quest[] = DEFS.map(def => ({
  id: def.id, region: 0, name: def.name, objective: bountyObjective(def.spec), kind: 'rout', tier: 'short', turnLimit: 0,
  bounty: def.spec, ...(def.chapter ? { requires: { chapter: def.chapter } } : {}),
  reward: { gold: def.gold, reputation: 0, items: [...def.items, ...materialDrops(
    [1, 2, 3, 4, 6, 9, 8, 11, 12][def.chapter ?? 0],
    [1, 1, 10, 20, 35, 55, 55, 75, 75][def.chapter ?? 0],
    `bounty:${def.id}`, 3, 0,
  ).map(({ item, count }): [ItemKey, number] => [item, count])] },
  event: `${def.name}：${bountyObjective(def.spec)}。不用接取，打完就能交任务。`,
}));
