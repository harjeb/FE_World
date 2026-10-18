import { FW_CLASS_REFERENCE } from './class-reference.ts';
import { CLASS_GROWTH } from './class-growth.ts';
import type { GrowthVector } from './class-growth.ts';
import { stats, STAT_KEYS } from './types.ts';
import type { MoveType, Rank, Stats, WeaponType } from './types.ts';

// Human routes suggest study paths; species routes are closed promotion chains.
export const CLASS_PATHS = {
  sword: [['gladiator', 'swordsman', 'shido', 'swordmaster', 'blade'], ['gladiator', 'mercenary', 'hero']],
  axe: [['gladiator', 'fighter', 'hero', 'battlemaster', 'everlord'], ['gladiator', 'fighter', 'berserker']],
  armor: [['lancer', 'knight', 'dreadnought', 'fortress'], ['lancer', 'knight', 'cataphract', 'great_knight'], ['lancer', 'knight', 'general']],
  cavalry: [['ornius_rider', 'cavalier', 'paladin', 'orichaldia', 'divine_cavalier'], ['ornius_rider', 'armored_ornius', 'divine_ornius', 'high_epitaph']],
  flying: [['ornius_rider', 'pegasus', 'dragon_knight', 'dragon_commander'], ['ornius_rider', 'pegasus', 'falcon']],
  bow: [['hunter', 'archer', 'sniper', 'marksman'], ['hunter', 'rogue', 'forest_knight', 'bow_knight'], ['hunter', 'rogue', 'ranger', 'shadow_seeker', 'calamity']],
  magic: [['adept', 'mage', 'sage', 'druid', 'saint'], ['adept', 'mage', 'blacksmith', 'high_epitaph'], ['adept', 'mage', 'dark_knight'], ['adept', 'mage', 'mage_knight']],
  healing: [['adept', 'cleric', 'bishop', 'wiseman', 'saint'], ['adept', 'cleric', 'troubadour', 'valkyrie'], ['adept', 'cleric', 'guardian', 'sentinel', 'storm_lancer']],
  stealth: [['hunter', 'thief', 'assassin', 'shadow_seeker'], ['hunter', 'ninja']],
  fist: [['gladiator', 'brawler', 'monk', 'fist_deity']],
  beast: [['beast_cub', 'beast_fighter', 'beast_hero', 'beast_guard', 'beast_lord']],
  dragon: [['awakened', 'dragonkin', 'ancient_guard', 'dragon_sage', 'dragon_lord']],
} as const;
export type ClassRoute = keyof typeof CLASS_PATHS;
export type ClassStage = 0 | 1 | 2 | 3 | 4 | 5;
export type ClassStudy = 'sword' | 'lance' | 'axe' | 'bow' | 'fist' | 'whiteMagic' | 'blackMagic' | 'infantry' | 'armor' | 'riding' | 'flying';
export const STAGE_NAMES = ['初级', '中级', '上级', '最上级', '神将级'] as const;
export const ROUTE_NAMES: Record<ClassRoute, string> = {
  sword: '剑术', axe: '斧战', armor: '重甲', cavalry: '骑乘', flying: '飞行', bow: '弓术',
  magic: '魔法', healing: '治疗', stealth: '潜行', fist: '格斗', beast: '兽人', dragon: '龙人',
};
export const CHARACTER_CAPS = stats(150, 99, 99, 99, 99, 99, 99, 99, 99);
// 职业 1 级基础值设计（docs/00「神主角」）：每条路线一个底，再按职业成长率每 5 点加 1（成长可为负，负值不加）。
// 顺序同 STAT_KEYS：HP/力/魔/技/速/运/防/魔防/魅力。首版数值，可校准。
const ROUTE_BASE: Record<ClassRoute, Stats> = {
  sword: stats(16, 4, 0, 6, 6, 3, 3, 1, 5),
  axe: stats(18, 5, 0, 3, 3, 2, 4, 0, 5),
  armor: stats(20, 5, 0, 3, 2, 2, 9, 1, 5),
  cavalry: stats(17, 5, 0, 5, 5, 3, 6, 2, 5),
  flying: stats(14, 3, 0, 5, 8, 5, 2, 5, 5),
  bow: stats(15, 4, 0, 6, 5, 3, 2, 1, 5),
  magic: stats(13, 0, 4, 3, 4, 3, 1, 4, 5),
  healing: stats(13, 0, 3, 2, 4, 5, 1, 5, 5),
  stealth: stats(14, 3, 0, 6, 7, 4, 2, 2, 5),
  fist: stats(17, 4, 0, 5, 5, 3, 3, 2, 5),
  beast: stats(18, 5, 0, 4, 5, 3, 4, 1, 3),
  dragon: stats(20, 5, 3, 4, 4, 3, 6, 5, 3),
};
const ROUTE_CON: Record<ClassRoute, number> = {
  sword: 6, axe: 11, armor: 12, cavalry: 9, flying: 5, bow: 7, magic: 4, healing: 5, stealth: 6, fist: 6, beast: 8, dragon: 9,
};

// 职业基础值 = 路线底 + 成长率加成。指定职业的普通单位共用；神主角使用单独的直接分配。
export function classBase(route: ClassRoute, growth: Stats): Stats {
  const floor = ROUTE_BASE[route];
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = floor[key] + Math.max(0, Math.floor(growth[key] / 5));
  return out;
}
export function classCon(route: ClassRoute): number {
  return ROUTE_CON[route];
}
export interface ClassDef {
  name: string;
  tier: 'base' | 'promoted';
  stage: ClassStage;
  route: ClassRoute;
  moveType: MoveType;
  move: number;
  armored: boolean;
  // 普通单位该职业的1级基础数值与体格；神主角九属性直接分配，不叠加这里的数值。
  base: Stats;
  con: number;
  // S is the current global rank ceiling, not a rank granted by changing class.
  weapons: Partial<Record<WeaponType, Rank>>;
  studies: readonly ClassStudy[];
  // The selected page currently has empty EXP-bonus cells. Unknown bonuses stay absent.
  trainingBonus: Partial<Record<ClassStudy, number>>;
  growth: Stats;
  caps: Stats;
  maxLevel: number;
  source: 'fortunes-weave' | 'legacy' | 'species';
  sourceUrl: string;
  // Keep the original nine source rates independently of the game's targeted buffs.
  referenceGrowth?: readonly number[];
  pendingMechanics: readonly string[];
}

const REFERENCE_ROUTES: Record<(typeof FW_CLASS_REFERENCE)[number]['id'], ClassRoute> = {
  commoner: 'sword', noble: 'sword', gladiator: 'sword', hunter: 'bow', lancer: 'armor',
  ornius_rider: 'cavalry', adept: 'magic', swordsman: 'sword', fighter: 'axe', brawler: 'fist',
  archer: 'bow', rogue: 'stealth', knight: 'armor', cavalier: 'cavalry', charioteer: 'bow',
  armored_ornius: 'cavalry', pegasus: 'flying', mage: 'magic', cleric: 'healing', shido: 'sword',
  warrior: 'axe', sniper: 'bow', forest_knight: 'bow', dreadnought: 'armor', paladin: 'cavalry',
  sage: 'magic', bishop: 'healing', divine_ornius: 'cavalry', dragon_knight: 'flying',
  troubadour: 'healing', guardian: 'healing', blacksmith: 'magic', cataphract: 'armor',
  ranger: 'stealth', dancer: 'sword', elephant_rider: 'cavalry', swordmaster: 'sword',
  high_epitaph: 'magic', battlemaster: 'axe', monk: 'fist', marksman: 'bow', bow_knight: 'bow',
  shadow_seeker: 'stealth', sentinel: 'healing', fortress: 'armor', orichaldia: 'cavalry',
  great_knight: 'cavalry', falcon: 'flying', dragon_commander: 'flying', druid: 'magic',
  wiseman: 'healing', valkyrie: 'healing', blade: 'sword', apsara: 'sword', everlord: 'axe',
  fist_deity: 'fist', calamity: 'bow', storm_lancer: 'healing', divine_cavalier: 'cavalry', saint: 'healing',
};
const PENDING_MECHANICS: Partial<Record<keyof typeof REFERENCE_ROUTES, string[]>> = {};
const STUDY_WEAPON: Partial<Record<ClassStudy, WeaponType>> = {
  sword: 'sword', lance: 'lance', axe: 'axe', bow: 'bow', fist: 'fist', blackMagic: 'tome', whiteMagic: 'staff',
};
interface ExtraClass {
  name: string; stage: ClassStage; route: ClassRoute; moveType: MoveType; move: number;
  weapons: WeaponType[]; source: 'legacy' | 'species'; sourceUrl: string; armored?: boolean;
}
const SACRED_STONES = 'https://www.nintendo.co.jp/n08/be8j/unit/class/page03.html';
const AWAKENING = 'https://serenesforest.net/awakening/classes/introduction/';
const FATES = 'https://serenesforest.net/fire-emblem-fates/hoshidan-classes/';
const HEROES = 'https://new-guide.fire-emblem-heroes.com/en-US/feh-1090.html';
// Prior-game roles use explicit access sets. Their tier and growth are adaptations for this game.
const EXTRA_CLASSES = {
  mercenary: { name: '佣兵', stage: 2, route: 'sword', moveType: 'foot', move: 5, weapons: ['sword'], source: 'legacy', sourceUrl: SACRED_STONES },
  hero: { name: '勇者', stage: 3, route: 'sword', moveType: 'foot', move: 5, weapons: ['sword','axe'], source: 'legacy', sourceUrl: AWAKENING },
  berserker: { name: '狂战士', stage: 3, route: 'axe', moveType: 'foot', move: 5, weapons: ['axe'], source: 'legacy', sourceUrl: SACRED_STONES },
  thief: { name: '盗贼', stage: 2, route: 'stealth', moveType: 'foot', move: 5, weapons: ['sword'], source: 'legacy', sourceUrl: AWAKENING },
  assassin: { name: '刺客', stage: 3, route: 'stealth', moveType: 'foot', move: 6, weapons: ['sword','bow'], source: 'legacy', sourceUrl: AWAKENING },
  ninja: { name: '忍者', stage: 2, route: 'stealth', moveType: 'foot', move: 5, weapons: ['dagger'], source: 'legacy', sourceUrl: FATES },
  master_ninja: { name: '上忍', stage: 3, route: 'stealth', moveType: 'foot', move: 6, weapons: ['dagger','sword'], source: 'legacy', sourceUrl: FATES },
  mechanist: { name: '机关师', stage: 3, route: 'stealth', moveType: 'mounted', move: 6, weapons: ['dagger','bow'], source: 'legacy', sourceUrl: FATES },
  general: { name: '将军', stage: 3, route: 'armor', moveType: 'armored', move: 4, armored: true, weapons: ['lance','axe'], source: 'legacy', sourceUrl: AWAKENING },
  mage_knight: { name: '神军师', stage: 3, route: 'magic', moveType: 'foot', move: 5, weapons: ['sword','tome'], source: 'legacy', sourceUrl: AWAKENING },
  dark_knight: { name: '黑暗骑士', stage: 3, route: 'magic', moveType: 'mounted', move: 6, weapons: ['sword','tome'], source: 'legacy', sourceUrl: AWAKENING },
  war_cleric: { name: '战斗修士', stage: 3, route: 'healing', moveType: 'foot', move: 5, weapons: ['axe','staff'], source: 'legacy', sourceUrl: 'https://www.nintendo.co.jp/3ds/afej/system/heishu_b20.html' },
  beast_cub: { name: '幼战士', stage: 1, route: 'beast', moveType: 'foot', move: 5, weapons: ['beast'], source: 'species', sourceUrl: HEROES },
  beast_fighter: { name: '兽战士', stage: 2, route: 'beast', moveType: 'foot', move: 5, weapons: ['beast'], source: 'species', sourceUrl: HEROES },
  beast_hero: { name: '兽勇士', stage: 3, route: 'beast', moveType: 'foot', move: 6, weapons: ['beast'], source: 'species', sourceUrl: HEROES },
  beast_guard: { name: '兽王卫', stage: 4, route: 'beast', moveType: 'foot', move: 6, weapons: ['beast'], source: 'species', sourceUrl: HEROES },
  beast_lord: { name: '兽神将', stage: 5, route: 'beast', moveType: 'foot', move: 6, weapons: ['beast'], source: 'species', sourceUrl: HEROES },
  awakened: { name: '觉醒者', stage: 1, route: 'dragon', moveType: 'foot', move: 4, weapons: ['dragon'], source: 'species', sourceUrl: HEROES },
  dragonkin: { name: '龙人', stage: 2, route: 'dragon', moveType: 'foot', move: 4, weapons: ['dragon'], source: 'species', sourceUrl: HEROES },
  ancient_guard: { name: '古龙卫', stage: 3, route: 'dragon', moveType: 'foot', move: 5, weapons: ['dragon'], source: 'species', sourceUrl: HEROES },
  dragon_sage: { name: '龙贤者', stage: 4, route: 'dragon', moveType: 'foot', move: 5, weapons: ['dragon'], source: 'species', sourceUrl: HEROES },
  dragon_lord: { name: '龙神将', stage: 5, route: 'dragon', moveType: 'foot', move: 5, weapons: ['dragon'], source: 'species', sourceUrl: HEROES },
} satisfies Record<string, ExtraClass>;

// Old save/snapshot identifiers remain readable without a database rewrite or duplicate market rows.
export const CLASS_ALIASES = {
  warrior: 'hero',
  sword_hero: 'shido', sword_lord: 'blade', axe_fighter: 'gladiator', war_lord: 'everlord',
  iron_lord: 'fortress', squire: 'ornius_rider', rider_lord: 'divine_cavalier', ranger_commander: 'forest_knight',
  wing_recruit: 'ornius_rider', wing_soldier: 'pegasus', sky_commander: 'falcon', wing_lord: 'falcon',
  bow_lord: 'calamity', warlock: 'sage', archsage: 'wiseman', magic_lord: 'saint', acolyte: 'adept', holy_lord: 'saint',
  scout: 'hunter', shadow_lord: 'calamity', fist_recruit: 'gladiator', fist_master: 'monk', fist_lord: 'fist_deity',
} as const;
// Known canonical IDs include read-only retired definitions; select from CATALOG_CLASS_IDS.
export type CatalogClassId = (typeof FW_CLASS_REFERENCE)[number]['id'] | keyof typeof EXTRA_CLASSES;
export type ClassId = CatalogClassId | keyof typeof CLASS_ALIASES;
export function canonicalClassId(id: ClassId): CatalogClassId {
  return CLASS_ALIASES[id as keyof typeof CLASS_ALIASES] ?? id as CatalogClassId;
}
export function hasClassQualification(qualifications: readonly ClassId[], id: ClassId): boolean {
  return qualifications.some(owned => canonicalClassId(owned) === canonicalClassId(id));
}
// Retain definitions for old saves and replays, but never offer retired classes as live content.
export const RETIRED_CLASS_IDS = ['master_ninja', 'mechanist', 'war_cleric', 'elephant_rider'] as const;
export const CATALOG_CLASS_IDS: CatalogClassId[] = [
  ...FW_CLASS_REFERENCE.map(cls => cls.id), ...Object.keys(EXTRA_CLASSES) as (keyof typeof EXTRA_CLASSES)[],
].filter(id => id !== 'warrior' && !(RETIRED_CLASS_IDS as readonly string[]).includes(id));
export const CLASSES = {} as Record<ClassId, ClassDef>;
const access = (types: readonly WeaponType[]): ClassDef['weapons'] =>
  Object.fromEntries(types.map(type => [type, 'S'])) as ClassDef['weapons'];
function classGrowth(id: CatalogClassId): Stats {
  const values: GrowthVector = CLASS_GROWTH[id].values;
  return stats(...values);
}
for (const ref of FW_CLASS_REFERENCE) {
  const types = ref.skills.flatMap(skill => STUDY_WEAPON[skill] ? [STUDY_WEAPON[skill]!] : []);
  CLASSES[ref.id] = {
    name: ref.name, tier: ref.stage <= 2 ? 'base' : 'promoted', stage: ref.stage,
    route: REFERENCE_ROUTES[ref.id], moveType: ref.moveType, move: ref.move, armored: ref.armored,
    weapons: access(types), studies: ref.skills, trainingBonus: {}, growth: classGrowth(ref.id),
    base: classBase(REFERENCE_ROUTES[ref.id], classGrowth(ref.id)), con: classCon(REFERENCE_ROUTES[ref.id]),
    caps: { ...CHARACTER_CAPS }, maxLevel: 99, source: 'fortunes-weave',
    sourceUrl: 'https://fire-emblem-fw.site/classes.html#' + ref.referenceId,
    referenceGrowth: ref.growth, pendingMechanics: PENDING_MECHANICS[ref.id] ?? [],
  };
}
for (const [id, extra] of Object.entries(EXTRA_CLASSES) as [keyof typeof EXTRA_CLASSES, ExtraClass][]) {
  CLASSES[id] = {
    ...extra, tier: extra.stage <= 2 ? 'base' : 'promoted', armored: extra.armored ?? false,
    weapons: access(extra.weapons), studies: [], trainingBonus: {}, pendingMechanics: [],
    growth: classGrowth(id), base: classBase(extra.route, classGrowth(id)), con: classCon(extra.route), caps: { ...CHARACTER_CAPS }, maxLevel: 99,
  };
}
for (const [oldId, id] of Object.entries(CLASS_ALIASES) as [keyof typeof CLASS_ALIASES, CatalogClassId][]) {
  CLASSES[oldId] = CLASSES[id];
}
export function classDef(id: ClassId): ClassDef { return CLASSES[id]; }
export function initialClass(route: ClassRoute): ClassId { return CLASS_PATHS[route][0][0]; }
export function initialClassOf(classId: ClassId): ClassId { return initialClass(CLASSES[classId].route); }
export function weaponRankCap(id: ClassId, type: WeaponType): Rank | undefined {
  const cls = CLASSES[id];
  if (!cls || !cls.weapons[type]) return undefined;
  if (cls.stage >= 5) return 'SSS';
  if (cls.stage >= 4) return 'SS';
  return cls.weapons[type];
}

export function classUnavailableReason(id: ClassId): string | null {
  if ((RETIRED_CLASS_IDS as readonly string[]).includes(id)) return '该职业已移除，仅保留旧存档读取兼容';
  const cls = CLASSES[id];
  return cls.pendingMechanics.length ? '尚未实现：' + cls.pendingMechanics.join('、') : null;
}

export function classSpecies(id: ClassId): 'human' | 'beast' | 'dragon' {
  const route = CLASSES[id].route;
  return route === 'beast' || route === 'dragon' ? route : 'human';
}

export function classChangeReason(
  unit: { classId: ClassId; species: 'human' | 'beast' | 'dragon'; isProtagonist?: boolean }, target: ClassId,
): string | null {
  target = canonicalClassId(target);
  const unavailable = classUnavailableReason(target);
  if (unavailable) return unavailable;
  const required = classSpecies(target);
  if (unit.isProtagonist && required !== 'human') return '主角不能使用兽／龙职业';
  if (unit.species !== required) return '该职业需要匹配种族';
  if (unit.species === 'human') return null;
  const chain: readonly ClassId[] = CLASS_PATHS[unit.species][0];
  const current = canonicalClassId(unit.classId);
  const index = chain.indexOf(current);
  if (index < 0 || (target !== current && target !== chain[index + 1])) return '特殊职业只能进阶到本族下一阶，不能跳阶或降阶';
  return null;
}

// Purchase policy belongs to this game; source-game exams, seals and stat bonuses are not imposed.
export const CLASS_OPEN_YEAR: Record<ClassStage, number> = { 0: 1, 1: 1, 2: 2, 3: 4, 4: 6, 5: 8 };
export const CLASS_PRICE: Record<ClassStage, number> = { 0: 0, 1: 500, 2: 1_500, 3: 4_000, 4: 9_000, 5: 20_000 };
export function classOpenYear(id: ClassId): number { return CLASS_OPEN_YEAR[CLASSES[id].stage]; }
export function classPrice(id: ClassId): number { return CLASS_PRICE[CLASSES[id].stage]; }
export const CLASS_PURCHASE_LIMIT = 3;

// 原表技能 EXP 加成栏为空：没有确认值时返回 undefined，不把未知误写成 0。
export function trainingBonusFor(id: ClassId, study: ClassStudy): number | undefined {
  return CLASSES[id].trainingBonus[study];
}

export function studyForWeapon(type: WeaponType): ClassStudy {
  if (type === 'tome') return 'blackMagic';
  if (type === 'staff') return 'whiteMagic';
  if (type === 'beast' || type === 'dragon') return 'infantry';
  return type as ClassStudy;
}
