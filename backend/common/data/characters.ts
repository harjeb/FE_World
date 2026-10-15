import { stats } from './types.ts';
import type { ClassId } from './classes.ts';
import type { SkillId } from './skills.ts';
import type { Stats } from './types.ts';

// docs/02-units-classes-growth.md「样例角色」: base stats include the starting class.
export interface CharacterDef {
  name: string;
  classId: ClassId;
  level: number;
  growthType: '早熟' | '均衡' | '晚成';
  base: Stats;
  con: number;
  growth: Stats;
  skill: SkillId;
}

const TABLE = {
  erin: { name: '艾琳', classId: 'swordsman', level: 1, growthType: '均衡', base: stats(18, 5, 0, 8, 9, 5, 4, 2), con: 6, growth: stats(70, 40, 5, 50, 55, 45, 25, 25), skill: 'opening' },
  karl: { name: '卡尔', classId: 'fighter', level: 1, growthType: '晚成', base: stats(22, 6, 0, 3, 3, 2, 4, 0), con: 11, growth: stats(85, 60, 0, 40, 35, 25, 35, 10), skill: 'surge' },
  victor: { name: '维克托', classId: 'cavalier', level: 6, growthType: '早熟', base: stats(27, 10, 0, 9, 8, 4, 10, 3), con: 10, growth: stats(55, 30, 5, 30, 25, 20, 25, 15), skill: 'veteran' },
  lina: { name: '莉娜', classId: 'pegasus', level: 1, growthType: '均衡', base: stats(16, 4, 1, 7, 10, 7, 3, 7), con: 5, growth: stats(55, 35, 15, 45, 60, 50, 15, 45), skill: 'nimble' },
  owen: { name: '欧文', classId: 'archer', level: 1, growthType: '均衡', base: stats(18, 5, 0, 7, 6, 3, 4, 1), con: 7, growth: stats(65, 45, 0, 55, 40, 30, 25, 15), skill: 'hawkeye' },
  sera: { name: '塞拉', classId: 'mage', level: 1, growthType: '晚成', base: stats(15, 0, 5, 4, 5, 4, 1, 4), con: 4, growth: stats(50, 5, 70, 50, 55, 30, 15, 45), skill: 'focus' },
  noah: { name: '诺亚', classId: 'cleric', level: 1, growthType: '均衡', base: stats(15, 0, 4, 3, 5, 8, 1, 7), con: 5, growth: stats(45, 0, 45, 30, 40, 60, 10, 55), skill: 'shelter' },
  gustav: { name: '古斯塔夫', classId: 'knight', level: 4, growthType: '早熟', base: stats(25, 9, 0, 5, 2, 2, 12, 1), con: 13, growth: stats(75, 40, 0, 30, 15, 20, 45, 15), skill: 'steadfast' },
} satisfies Record<string, CharacterDef>;
export type CharacterId = keyof typeof TABLE;
export const CHARACTERS: Record<CharacterId, CharacterDef> = TABLE;
