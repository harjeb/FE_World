import { stats } from './types.ts';
import type { ClassId } from './classes.ts';
import type { GrowthType } from './growth-types.ts';
import type { SkillId } from './skills.ts';
import type { Stats } from './types.ts';

// docs/02-units-classes-growth.md「样例角色」: base stats include the starting class.
// The last four were added for the 12-character pool that 王城 (8 + 3) needs.
// growthType + age feed the age-band growth modifier (data/growth-types.ts).
export interface CharacterDef {
  name: string;
  classId: ClassId;
  level: number;
  growthType: GrowthType;
  age: number;
  base: Stats;
  con: number;
  growth: Stats;
  skill: SkillId;
}

// Initial charm is a conservative game-specific draft: base 5, personal growth 20%. These are not source-game character values.
const TABLE = {
  erin: { name: '艾琳', classId: 'swordsman', level: 1, growthType: 'normal', age: 16, base: stats(18, 5, 0, 8, 9, 5, 4, 2, 5), con: 6, growth: stats(70, 40, 5, 50, 55, 45, 25, 25, 20), skill: 'opening' },
  karl: { name: '卡尔', classId: 'fighter', level: 1, growthType: 'late', age: 34, base: stats(22, 6, 0, 3, 3, 2, 4, 0, 5), con: 11, growth: stats(85, 60, 0, 40, 35, 25, 35, 10, 20), skill: 'surge' },
  victor: { name: '维克托', classId: 'cavalier', level: 6, growthType: 'early', age: 28, base: stats(27, 10, 0, 9, 8, 4, 10, 3, 5), con: 10, growth: stats(55, 30, 5, 30, 25, 20, 25, 15, 20), skill: 'veteran' },
  lina: { name: '莉娜', classId: 'pegasus', level: 1, growthType: 'normal', age: 15, base: stats(16, 4, 1, 7, 10, 7, 3, 7, 5), con: 5, growth: stats(55, 35, 15, 45, 60, 50, 15, 45, 20), skill: 'nimble' },
  owen: { name: '欧文', classId: 'archer', level: 1, growthType: 'normal', age: 19, base: stats(18, 5, 0, 7, 6, 3, 4, 1, 5), con: 7, growth: stats(65, 45, 0, 55, 40, 30, 25, 15, 20), skill: 'hawkeye' },
  sera: { name: '塞拉', classId: 'mage', level: 1, growthType: 'late', age: 41, base: stats(15, 0, 5, 4, 5, 4, 1, 4, 5), con: 4, growth: stats(50, 5, 70, 50, 55, 30, 15, 45, 20), skill: 'focus' },
  noah: { name: '诺亚', classId: 'cleric', level: 1, growthType: 'normal', age: 22, base: stats(15, 0, 4, 3, 5, 8, 1, 7, 5), con: 5, growth: stats(45, 0, 45, 30, 40, 60, 10, 55, 20), skill: 'shelter' },
  gustav: { name: '古斯塔夫', classId: 'knight', level: 4, growthType: 'early', age: 45, base: stats(25, 9, 0, 5, 2, 2, 12, 1, 5), con: 13, growth: stats(75, 40, 0, 30, 15, 20, 45, 15, 20), skill: 'steadfast' },
  ren: { name: '雷恩', classId: 'swordsman', level: 5, growthType: 'early', age: 24, base: stats(23, 8, 0, 12, 12, 5, 5, 3, 5), con: 7, growth: stats(55, 35, 5, 40, 45, 30, 20, 20, 20), skill: 'keen' },
  ig: { name: '伊格', classId: 'fighter', level: 1, growthType: 'normal', age: 31, base: stats(24, 7, 0, 4, 5, 3, 5, 0, 5), con: 12, growth: stats(80, 55, 0, 35, 40, 30, 30, 10, 20), skill: 'grit' },
  mira: { name: '米拉', classId: 'cleric', level: 1, growthType: 'late', age: 52, base: stats(14, 0, 4, 2, 6, 9, 0, 6, 5), con: 4, growth: stats(45, 0, 55, 35, 45, 65, 10, 60, 20), skill: 'prayer' },
  roland: { name: '罗兰', classId: 'cavalier', level: 3, growthType: 'normal', age: 37, base: stats(24, 8, 0, 7, 7, 4, 7, 2, 5), con: 9, growth: stats(65, 40, 0, 40, 35, 30, 30, 20, 20), skill: 'charge' },
} satisfies Record<string, CharacterDef>;
export type CharacterId = keyof typeof TABLE;
export const CHARACTERS: Record<CharacterId, CharacterDef> = TABLE;
export const CHARACTER_IDS = Object.keys(TABLE) as CharacterId[];

// 自捏主角（docs/00 「神主角」、docs/13 §开局）：先选职业，取该职业代表角色的基础数值与形象，
// 再自定姓名、成长类型与培养倾向，并用固定预算分配九属性点。
export interface ProtagonistClass { classId: ClassId; name: string; base: CharacterId }
export const PROTAGONIST_CLASSES: ProtagonistClass[] = [
  { classId: 'swordsman', name: '剑士', base: 'erin' },
  { classId: 'fighter', name: '战士', base: 'karl' },
  { classId: 'cavalier', name: '骑兵', base: 'victor' },
  { classId: 'archer', name: '弓手', base: 'owen' },
  { classId: 'mage', name: '法师', base: 'sera' },
  { classId: 'cleric', name: '僧侣', base: 'noah' },
  { classId: 'pegasus', name: '天马骑士', base: 'lina' },
  { classId: 'knight', name: '重甲骑士', base: 'gustav' },
];
// 九属性分配预算：总计 18 点，单项 0–6（首版数值，docs/00 标注待校准）。
export const PROTAGONIST_ALLOCATION_BUDGET = 18;
export const PROTAGONIST_ALLOCATION_MAX = 6;
// 培养倾向：选择个人成长向量（基础值，后续再加职业成长）。
export const PROTAGONIST_TENDENCIES: Record<string, { name: string; growth: Stats }> = {
  balanced: { name: '均衡', growth: stats(60, 40, 40, 45, 45, 40, 30, 30, 20) },
  might: { name: '力量', growth: stats(75, 60, 5, 40, 35, 30, 40, 15, 20) },
  skill: { name: '技巧', growth: stats(55, 35, 10, 65, 60, 45, 20, 25, 20) },
  magic: { name: '魔力', growth: stats(50, 10, 65, 45, 45, 30, 15, 45, 20) },
  guard: { name: '守护', growth: stats(75, 45, 5, 35, 25, 25, 55, 35, 20) },
};
