import type { ItemKey } from './items.ts';
import { EQUIPMENT_ART_LINKS } from '../data/expanded-weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import type { NarrativeBoss } from './story-bosses.ts';
import { CHALLENGE_ENEMY_IDENTITIES } from './enemy-identities.ts';

const equipment = [...new Set<WeaponId>(EQUIPMENT_ART_LINKS.map(link => link.projectWeaponId))];

// 首版挑战塔：复用经典地图的敌人与地形，只追加首通/重复奖励和风险说明。
export interface ChallengeFloor {
  postgame?: boolean;
  requiresFloor?: string;
  briefing?: string;
  boss?: NarrativeBoss;
  id: string;
  name: string;
  mapId: string;
  level: number;
  costDays: number;
  risk: 'permadeath';
  equipment: WeaponId[];
  first: { gold: number; items: [ItemKey, number][] };
  repeat: { gold: number; items: [ItemKey, number][] };
}

export const CHALLENGE_FLOORS: ChallengeFloor[] = [
  { id: 'tower-1', name: '挑战塔 · 第一层', mapId: 'fe8-ch11-ephraim', level: 40, costDays: 2, risk: 'permadeath', equipment: equipment.filter((_, index) => index % 3 === 0), first: { gold: 1_500, items: [['reincarnation_core', 1]] }, repeat: { gold: 500, items: [] } },
  { id: 'tower-2', name: '挑战塔 · 第二层', mapId: 'fe8-ch17-eirika', level: 55, costDays: 2, risk: 'permadeath', equipment: equipment.filter((_, index) => index % 3 === 1), first: { gold: 2_500, items: [['legacy_stone_numeric', 1]] }, repeat: { gold: 800, items: [] } },
  { id: 'tower-3', name: '禁忌之地 · 缚门者', mapId: 'fe8-chfinal-1-eirika', level: 80, costDays: 3, risk: 'permadeath', postgame: true,
    briefing: '北道的门已被撞开，仍忠于旧枷锁的守卫却把所有来者视为逃囚。越过它，才能进入魔神曾被囚禁的深处。',
    boss: { name: CHALLENGE_ENEMY_IDENTITIES['tower-3'].commander, classId: 'general', bonus: { hp: 15, str: 6, def: 8 } },
    equipment: equipment.filter((_, index) => index % 3 === 2), first: { gold: 5_000, items: [['immortal_shield', 1]] }, repeat: { gold: 1_500, items: [] } },
  { id: 'forbidden-altar', name: '禁忌之地 · 逆祷祭坛', mapId: 'fe7-chfinal-1-eliwood', level: 90, costDays: 3, risk: 'permadeath', postgame: true, requiresFloor: 'tower-3',
    briefing: '残余的导晶在此汇集。逆祷者不再假装替谁祈祷，她正把王城送来的神力全部奉给苏醒的魔神。',
    boss: { name: CHALLENGE_ENEMY_IDENTITIES['forbidden-altar'].commander, classId: 'high_epitaph', bonus: { hp: 20, mag: 10, res: 8 } },
    equipment: [], first: { gold: 7_000, items: [['reincarnation_core', 1], ['elixir', 3]] }, repeat: { gold: 2_000, items: [] } },
  { id: 'forbidden-abyss', name: '禁忌之地 · 无枷之渊', mapId: 'fe6-ch24-main', level: 95, costDays: 4, risk: 'permadeath', postgame: true, requiresFloor: 'forbidden-altar',
    briefing: '“他求一个人回来，我只求一扇门打开。”阿扎赫立在断裂的枷锁之间。它已经等到了代价，现在轮到你阻止它离开。',
    boss: { name: CHALLENGE_ENEMY_IDENTITIES['forbidden-abyss'].commander, classId: 'dragon_lord', bonus: { hp: 30, str: 10, mag: 10, def: 8, res: 8 } },
    equipment: [], first: { gold: 10_000, items: [['legacy_stone_numeric', 1], ['elixir', 5]] }, repeat: { gold: 3_000, items: [] } },
];

export function challengeBlocker(floor: ChallengeFloor, completed: readonly number[], cleared: readonly string[]): string | null {
  if (floor.postgame && !completed.includes(8)) return '完成第八章后开放禁忌之地';
  if (floor.requiresFloor && !cleared.includes(floor.requiresFloor)) return `先击败${challengeById(floor.requiresFloor)!.boss!.name}`;
  return null;
}

export function challengeById(id: string): ChallengeFloor | undefined {
  return CHALLENGE_FLOORS.find(floor => floor.id === id);
}
