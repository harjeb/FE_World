import type { ItemKey } from './items.ts';

// 首版挑战塔：复用经典地图的敌人与地形，只追加首通/重复奖励和风险说明。
export interface ChallengeFloor {
  id: string;
  name: string;
  mapId: string;
  level: number;
  costDays: number;
  risk: 'permadeath';
  first: { gold: number; items: [ItemKey, number][] };
  repeat: { gold: number; items: [ItemKey, number][] };
}

export const CHALLENGE_FLOORS: ChallengeFloor[] = [
  { id: 'tower-1', name: '挑战塔 · 第一层', mapId: 'fe8-ch11-ephraim', level: 40, costDays: 2, risk: 'permadeath', first: { gold: 1_500, items: [['reincarnation_core', 1]] }, repeat: { gold: 500, items: [] } },
  { id: 'tower-2', name: '挑战塔 · 第二层', mapId: 'fe8-ch17-eirika', level: 55, costDays: 2, risk: 'permadeath', first: { gold: 2_500, items: [['legacy_stone_numeric', 1]] }, repeat: { gold: 800, items: [] } },
  { id: 'tower-3', name: '挑战塔 · 终层', mapId: 'fe8-chfinal-1-eirika', level: 80, costDays: 3, risk: 'permadeath', first: { gold: 5_000, items: [['immortal_shield', 1]] }, repeat: { gold: 1_500, items: [] } },
];

export function challengeById(id: string): ChallengeFloor | undefined {
  return CHALLENGE_FLOORS.find(floor => floor.id === id);
}
