import { CLASS_GROWTH } from '../data/class-growth.ts';
import type { GrowthRole } from '../data/class-growth.ts';
import { canonicalClassId, CLASS_PATHS, initialClass } from '../data/classes.ts';
import type { ClassId, ClassRoute } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import type { StatKey, Stats } from '../data/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import { CHARACTER_IDS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import type { RngState } from '../engine/rng.ts';

// 随机招募角色的成长率生成（docs/00 §3.4「随机角色」）。用户定案：
// - 基线按职业 role 把每项分成「主 / 副 / 弱」三档，保证入队 10 级勇士不会拿到法师成长；
// - 小概率发生「特化」，把一项弱项顶成主属性，于是会出重甲法师、魔剑、力魔双修的剑圣；
// - 个人成长率在这里一次掷定并固定；成长类型（早熟／晚成…）是独立字段，升级时才在
//   applyGrowthBonus 里加算，两者分开（与预设角色同一套运行时逻辑）。
// - 单项封顶 55%，低于预设角色的 85% 上限：随机角色不跟有名有姓的人抢定位。
//   档位是"加职业后不爆炸"倒推的：个人主档 40–55 叠职业 +15~25，最终主属性落在 58–69%。
export const RECRUIT_GROWTH_CAP = 55;

type Cat = 'hi' | 'mid' | 'lo';

// 档位 = 取值 + 权重，全部是 5 的倍数（参照真实火纹成长率）。
// 主 40–55 / 副 20–35 / 弱 0–15，先按权重抽值。
const TIERS: Record<Cat, { value: number; weight: number }[]> = {
  hi: [{ value: 55, weight: 1 }, { value: 50, weight: 2 }, { value: 45, weight: 4 }, { value: 40, weight: 3 }],
  mid: [{ value: 35, weight: 2 }, { value: 30, weight: 4 }, { value: 25, weight: 3 }, { value: 20, weight: 2 }],
  lo: [{ value: 15, weight: 2 }, { value: 10, weight: 4 }, { value: 5, weight: 4 }, { value: 0, weight: 2 }],
};

// 每个 role 的九项分类，顺序同 STAT_KEYS：HP/力/魔/技/速/运/防/魔防/魅力。
// 分类不是拍脑袋：直接按该 role 下所有目录职业 CLASS_GROWTH 的平均值切档（≥12 主 / ≥5 副 / 其余弱），
// 所以随机角色的个人成长天然贴合它入队的职业。
const c = (hp: Cat, str: Cat, mag: Cat, skl: Cat, spd: Cat, lck: Cat, def: Cat, res: Cat, cha: Cat): Cat[] =>
  [hp, str, mag, skl, spd, lck, def, res, cha];
const ROLE_CATS: Record<GrowthRole, Cat[]> = {
  duelist: c('hi', 'mid', 'lo', 'hi', 'hi', 'lo', 'lo', 'lo', 'lo'),
  striker: c('hi', 'hi', 'lo', 'mid', 'mid', 'lo', 'mid', 'lo', 'lo'),
  marksman: c('mid', 'mid', 'lo', 'hi', 'mid', 'lo', 'mid', 'lo', 'mid'),
  guardian: c('hi', 'hi', 'lo', 'mid', 'lo', 'lo', 'hi', 'lo', 'lo'),
  skirmisher: c('hi', 'mid', 'lo', 'mid', 'hi', 'mid', 'lo', 'mid', 'mid'),
  arcanist: c('mid', 'lo', 'hi', 'mid', 'mid', 'mid', 'lo', 'hi', 'lo'),
  healer: c('mid', 'lo', 'hi', 'mid', 'lo', 'hi', 'lo', 'hi', 'mid'),
  hybrid: c('hi', 'mid', 'hi', 'mid', 'mid', 'lo', 'mid', 'mid', 'lo'),
  support: c('mid', 'lo', 'lo', 'mid', 'hi', 'mid', 'lo', 'lo', 'hi'),
  dragon: c('hi', 'lo', 'hi', 'mid', 'lo', 'lo', 'hi', 'hi', 'lo'),
};

export type Specialization = 'none' | 'single' | 'double';
// 特化分布：大多数纯本职，少数一项跨界，极少数两项（力魔双修、重甲法师再带魔防之类）。
const SPEC_WEIGHTS: { value: Specialization; weight: number }[] = [
  { value: 'none', weight: 75 }, { value: 'single', weight: 20 }, { value: 'double', weight: 5 },
];

// 种族与定位权重（用户定案：大部分人类，少部分兽人／龙人）。不指定地区时的全局权重。
const RACE_WEIGHTS: { value: 'human' | 'beast' | 'dragon'; weight: number }[] = [
  { value: 'human', weight: 85 }, { value: 'beast', weight: 8 }, { value: 'dragon', weight: 7 },
];
// 地区限定的可招募职业路线（用户定案：地区决定能招什么，生成器权重在地区内挑具体职业）。
// 兽／龙只在本族聚居地出现，所以那里本族权重拉高。
const ALL_ROUTES: ClassRoute[] = ['sword', 'axe', 'armor', 'cavalry', 'flying', 'bow', 'magic', 'healing', 'stealth', 'fist', 'beast', 'dragon'];
export const REGION_ROUTES: Record<number, ClassRoute[]> = {
  1: ['sword', 'axe'],
  2: ['bow', 'stealth', 'axe'],
  3: ['armor', 'axe'],
  4: ['cavalry', 'armor', 'sword'],
  5: ['flying', 'healing'],
  6: ['magic', 'healing'],
  7: ['beast', 'fist'],
  8: ['flying', 'bow'],
  9: ['stealth', 'cavalry', 'bow'],
  10: ['dragon', 'magic'],
  11: ['magic', 'armor', 'healing'],
  12: ['dragon', 'magic', 'sword'],
};
export function regionRoutes(regionId: number): ClassRoute[] {
  return REGION_ROUTES[regionId] ?? ALL_ROUTES;
}

// 入队等级：用户定案——第二年结束时到顶 30，之后固定 30，剩下靠自己练。
// 一年 500 天；第二年结束（D1000）到顶 30，之后固定 30。
export const RECRUIT_LEVEL_CAP = 30;
export function recruitLevel(day: number): number {
  return Math.min(RECRUIT_LEVEL_CAP, 1 + Math.floor(Math.max(0, day) / 34));
}
// 招募职业阶段（用户定案「上级也允许」）：等级越高越可能拿到上级职业。
// Lv1–9 初级、10–19 二级、20–29 三级、30+ 四级，取该路线第一条进阶链。
export function recruitClass(route: ClassRoute, level: number): ClassId {
  const path = CLASS_PATHS[route][0];
  return path[Math.min(path.length - 1, Math.floor(Math.max(0, level) / 10))];
}
// 酒馆解锁（用户定案「第二年」）：一年 500 天，第二年从 D500 开始。
export const RECRUIT_UNLOCK_DAY = 500;

// 随机角色的形象锚点（也是个人技能锚点），与加入时用同一个种子，候选阶段就能显示同一张脸。
export function recruitPortrait(seed: string): CharacterId {
  return CHARACTER_IDS[seedRng(`recruit-traits:${seed}`)[2] % CHARACTER_IDS.length];
}
const ARCHETYPE_ROUTES: { value: ClassRoute[]; weight: number }[] = [
  { weight: 40, value: ['sword', 'axe', 'fist'] },
  { weight: 20, value: ['bow', 'stealth'] },
  { weight: 15, value: ['magic', 'healing'] },
  { weight: 15, value: ['armor'] },
  { weight: 10, value: ['cavalry', 'flying'] },
];

function pickWeighted<T>(rng: RngState, table: { value: T; weight: number }[]): T {
  const total = table.reduce((sum, t) => sum + t.weight, 0);
  let r = (nextU32(rng) / 4294967296) * total;
  for (const t of table) {
    if (r < t.weight) return t.value;
    r -= t.weight;
  }
  return table[table.length - 1].value;
}

function rollStat(rng: RngState, cat: Cat): number {
  return pickWeighted(rng, TIERS[cat]);
}

// 弱项比副项更容易被特化（重甲法师这种反差主要来自弱项翻盘）。
function rollSpecial(rng: RngState, cats: Cat[]): StatKey[] {
  const spec = pickWeighted(rng, SPEC_WEIGHTS);
  const count = spec === 'double' ? 2 : spec === 'single' ? 1 : 0;
  if (count === 0) return [];
  const pool: number[] = [];
  cats.forEach((cat, i) => {
    if (cat === 'hi') return;
    for (let k = 0; k < (cat === 'lo' ? 3 : 1); k++) pool.push(i);
  });
  const chosen: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const pick = pool[nextU32(rng) % pool.length];
    if (!chosen.includes(pick)) chosen.push(pick);
  }
  return chosen.map(i => STAT_KEYS[i]);
}

export interface RolledGrowth { growth: Stats; specialization: Specialization; specialStats: StatKey[] }

// 掷一份固定个人成长向量。同一个 rng 序列永远给同一个结果，方便按种子复现。
export function rollPersonalGrowth(role: GrowthRole, rng: RngState): RolledGrowth {
  const cats = [...ROLE_CATS[role]];
  const specialStats = rollSpecial(rng, cats);
  for (const key of specialStats) cats[STAT_KEYS.indexOf(key)] = 'hi';
  const growth = {} as Stats;
  STAT_KEYS.forEach((key, i) => { growth[key] = Math.min(RECRUIT_GROWTH_CAP, rollStat(rng, cats[i])); });
  const specialization: Specialization = specialStats.length === 2 ? 'double' : specialStats.length === 1 ? 'single' : 'none';
  return { growth, specialization, specialStats };
}

export interface RandomRecruit extends RolledGrowth {
  species: 'human' | 'beast' | 'dragon';
  classId: ClassId;
  role: GrowthRole;
  name: string;
  sex: 'male' | 'female';
}

// 人类走定位路线（在地区允许的路线内按权重挑），兽／龙走各自封闭的初级职业。
function pickClass(rng: RngState, species: RandomRecruit['species'], allowed: ClassRoute[]): ClassId {
  if (species === 'beast') return 'beast_cub';
  if (species === 'dragon') return 'awakened';
  const human = allowed.filter(r => r !== 'beast' && r !== 'dragon');
  const table = ARCHETYPE_ROUTES
    .map(a => ({ value: a.value.filter(r => allowed.includes(r)), weight: a.weight }))
    .filter(a => a.value.length > 0);
  if (table.length === 0) return initialClass(human[0] ?? 'sword');
  const routes = pickWeighted(rng, table);
  return initialClass(routes[nextU32(rng) % routes.length]);
}

// 名字池只是首稿，可整体替换：西方幻想风格的音译名，人类为「名·姓」，兽人与龙人用种族风格的单名。
// 避开固定人物的名字（艾琳、卡尔、维克托……），名字最后抽取，不影响其它随机结果。
const GIVEN_MALE = [
  '阿德里安', '奥斯温', '巴尔德', '本尼迪克', '卡斯珀', '达里安', '埃德蒙', '法恩', '加雷斯', '哈尔多',
  '贾斯帕', '凯兰', '兰德尔', '马库斯', '奈杰尔', '奥瑞克', '珀西瓦尔', '昆廷', '拉格纳', '塞德里克',
  '塔里克', '瓦伦丁', '泽维尔', '艾德温', '伯纳德', '席恩', '托里安', '布兰德', '康拉德', '德里克',
  '埃里克', '芬恩', '格兰特', '亨德里克', '伊万', '约瑟', '凯尔', '洛根', '马蒂亚斯', '西奥',
];
const GIVEN_FEMALE = [
  '阿德拉', '贝娅特丽丝', '布琳', '卡莉丝', '塞西莉亚', '黛芙妮', '埃莉诺', '菲奥娜', '弗蕾雅', '格温',
  '海伦娜', '伊索尔德', '茱莉亚', '凯拉', '梅里达', '妮维娅', '奥菲莉亚', '佩妮洛普', '罗莎琳', '西尔维娅',
  '塔丽莎', '尤菲米娅', '薇薇安', '温妮', '伊薇特', '泽菲拉', '索菲娅', '娜塔莉', '奥黛特', '维奥拉',
  '萝温娜', '玛蒂尔达', '赫尔加', '伊莲', '诺拉', '黛安娜', '芙洛拉', '吉赛尔', '艾薇', '克拉拉',
];
const FAMILY_NAMES = [
  '霍克', '斯通', '格雷', '温特', '阿什', '布伦', '卡弗', '达尔', '埃弗', '哈特',
  '凯恩', '洛克', '默瑟', '诺斯', '奥克', '奎因', '罗斯', '索恩', '塔尔', '维尔',
  '沃德', '雅尔', '泽恩', '莫兰', '贝恩', '克罗', '弗林', '海尔', '兰登', '斯塔克',
];
const BEAST_NAMES = ['格罗克', '乌尔夫', '布鲁恩', '卡格', '拉克沙', '莫格', '霍格', '斯卡尔', '芬里克', '加斯克', '托格', '瓦尔格', '鲁克', '奥格兰'];
const DRAGON_NAMES = ['瓦拉西恩', '赛勒克斯', '伊格瑞斯', '阿兹瑞尔', '莫德瑞丝', '卡里欧斯', '泰兰妮', '奥克修斯', '薇瑟拉', '德拉格隆', '萨菲罗', '艾瑟林'];

function rollName(rng: RngState, species: RandomRecruit['species'], sex: 'male' | 'female'): string {
  if (species === 'beast') return BEAST_NAMES[nextU32(rng) % BEAST_NAMES.length];
  if (species === 'dragon') return DRAGON_NAMES[nextU32(rng) % DRAGON_NAMES.length];
  const given = sex === 'male' ? GIVEN_MALE : GIVEN_FEMALE;
  return `${given[nextU32(rng) % given.length]}·${FAMILY_NAMES[nextU32(rng) % FAMILY_NAMES.length]}`;
}

// 入口：一个种子生成一个完整随机角色（种族／职业／姓名／固定个人成长）。
// `allowed` 是地区限定的路线；不传则用全地区 + 全局种族权重。
export function generateRecruit(seed: string, allowed: ClassRoute[] = ALL_ROUTES): RandomRecruit {
  const rng = seedRng(`recruit-gen:${seed}`);
  const human = allowed.filter(r => r !== 'beast' && r !== 'dragon');
  const raceTable = allowed === ALL_ROUTES ? RACE_WEIGHTS : [
    ...(human.length ? [{ value: 'human' as const, weight: 55 }] : []),
    ...(allowed.includes('beast') ? [{ value: 'beast' as const, weight: 45 }] : []),
    ...(allowed.includes('dragon') ? [{ value: 'dragon' as const, weight: 45 }] : []),
  ];
  const species = raceTable.length ? pickWeighted(rng, raceTable) : 'human';
  const classId = pickClass(rng, species, allowed);
  const role = CLASS_GROWTH[canonicalClassId(classId)].role;
  const sex = nextU32(rng) % 2 === 0 ? 'male' : 'female';
  const rolled = rollPersonalGrowth(role, rng);
  return { species, classId, role, sex, name: rollName(rng, species, sex), ...rolled };
}
