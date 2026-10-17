import { CLASS_GROWTH } from '../data/class-growth.ts';
import type { GrowthRole } from '../data/class-growth.ts';
import { canonicalClassId, CLASS_PATHS, initialClass } from '../data/classes.ts';
import type { ClassId, ClassRoute } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import type { StatKey, Stats } from '../data/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
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
// 一年 120 天，day/8 每天 +1 级，240 天正好 30 级。
export const RECRUIT_LEVEL_CAP = 30;
export function recruitLevel(day: number): number {
  return Math.min(RECRUIT_LEVEL_CAP, 1 + Math.floor(Math.max(0, day) / 8));
}
// 招募职业阶段（用户定案「上级也允许」）：等级越高越可能拿到上级职业。
// Lv1–9 初级、10–19 二级、20–29 三级、30+ 四级，取该路线第一条进阶链。
export function recruitClass(route: ClassRoute, level: number): ClassId {
  const path = CLASS_PATHS[route][0];
  return path[Math.min(path.length - 1, Math.floor(Math.max(0, level) / 10))];
}
// 酒馆解锁（用户定案「第二年」）：一年 120 天。注意演示存档 SEED_DAY=209 已在第二年，
// 对新演示账号等于开局就解锁；正式开局按个人日历走。
export const RECRUIT_UNLOCK_DAY = 120;
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

// 名字池只是首稿占位，可整体替换。兽／龙不给姓。
const SURNAMES = ['林', '苏', '陆', '沈', '程', '顾', '叶', '韩', '许', '钟', '秦', '萧', '方', '白', '江', '温', '裴', '薛', '黎', '霍'];
const GIVEN_MALE = ['岳', '衡', '砚', '骁', '珩', '屿', '彻', '钧', '朔', '岐', '柏', '隼', '棠', '琛', '临'];
const GIVEN_FEMALE = ['苓', '薇', '瑶', '荞', '澜', '瑾', '纭', '曦', '蝉', '绫', '菡', '笺', '柠', '黛', '栖'];
const BEAST_NAMES = ['灰鬃', '断牙', '铁蹄', '赤爪', '孤嗥', '石脊', '夜行', '裂耳', '沉角', '霜背'];
const DRAGON_NAMES = ['苍鳞', '曜瞳', '沉渊', '白垠', '陨爪', '长眠', '穹翼', '焚息', '灰烬', '渊牙'];

function rollName(rng: RngState, species: RandomRecruit['species'], sex: 'male' | 'female'): string {
  if (species === 'beast') return BEAST_NAMES[nextU32(rng) % BEAST_NAMES.length];
  if (species === 'dragon') return DRAGON_NAMES[nextU32(rng) % DRAGON_NAMES.length];
  const given = sex === 'male' ? GIVEN_MALE : GIVEN_FEMALE;
  return SURNAMES[nextU32(rng) % SURNAMES.length] + given[nextU32(rng) % given.length];
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
