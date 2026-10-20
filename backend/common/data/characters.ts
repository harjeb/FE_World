import { stats } from './types.ts';
import type { StatKey, Stats } from './types.ts';
import type { ClassId } from './classes.ts';
import type { GrowthType } from './growth-types.ts';
import type { SkillId } from './skills.ts';

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

// 自捏神主角（docs/00「神主角」、docs/13 §开局）：职业与成长类型固定（平民／成长型），
// 自定姓名、性别与随机形象，保留固定基础属性，另分配 10 点加成。
// 新主角以 erin 作为默认技能锚点，形象独立保存；数值与成长全部来自显式保存的字段。
export const PROTAGONIST_CLASS_ID: ClassId = 'commoner';
export const PROTAGONIST_GROWTH_TYPE: GrowthType = 'growth';

// 基础值沿用原默认属性；额外分配从 0 开始，每项最多加 5 点，总计必须正好 10 点。
export const PROTAGONIST_BASE_STATS: Stats = stats(20, 6, 4, 6, 6, 5, 5, 4, 4);
export const PROTAGONIST_ALLOCATION_BUDGET = 10;
export const PROTAGONIST_ALLOCATION_DEFAULT: Stats = stats(0, 0, 0, 0, 0, 0, 0, 0, 0);
export const PROTAGONIST_MIN_ALLOCATION: Record<StatKey, number> = { hp: 0, str: 0, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0, cha: 0 };
export const PROTAGONIST_MAX_ALLOCATION: Record<StatKey, number> = { hp: 5, str: 5, mag: 5, skl: 5, spd: 5, lck: 5, def: 5, res: 5, cha: 5 };

// 培养倾向：不再手选，由属性分配自动推导（deriveProtagonistTendency）；这里只保留五条
// 个人成长向量作为推导结果的数据来源（基础值，运行时再叠加职业成长、年龄修正与轮回分配）。
export type ProtagonistTendency = 'balanced' | 'might' | 'skill' | 'magic' | 'guard';
export const PROTAGONIST_TENDENCY_NAMES: Record<ProtagonistTendency, string> = {
  balanced: '均衡', might: '力量', skill: '技巧', magic: '魔力', guard: '守护',
};
export const PROTAGONIST_TENDENCIES: Record<ProtagonistTendency, { name: string; growth: Stats }> = {
  balanced: { name: '均衡', growth: stats(60, 40, 40, 45, 45, 40, 30, 30, 20) },
  might: { name: '力量', growth: stats(75, 60, 5, 40, 35, 30, 40, 15, 20) },
  skill: { name: '技巧', growth: stats(55, 35, 10, 65, 60, 45, 20, 25, 20) },
  magic: { name: '魔力', growth: stats(50, 10, 65, 45, 45, 30, 15, 45, 20) },
  guard: { name: '守护', growth: stats(75, 45, 5, 35, 25, 25, 55, 35, 20) },
};

// 由九属性分配推导培养倾向：力×2、魔×2、技+速、防+魔防四组打分，最高者胜；
// 平手（含全同的默认分配）一律取「均衡」。纯函数，前后端共用。
export function deriveProtagonistTendency(allocation: Stats): ProtagonistTendency {
  const scores: [ProtagonistTendency, number][] = [
    ['might', allocation.str * 2], ['magic', allocation.mag * 2],
    ['skill', allocation.skl + allocation.spd], ['guard', allocation.def + allocation.res],
  ];
  const best = Math.max(...scores.map(([, value]) => value));
  const winners = scores.filter(([, value]) => value === best).map(([id]) => id);
  return winners.length === 1 ? winners[0] : 'balanced';
}
