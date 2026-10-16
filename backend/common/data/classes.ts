import { stats, STAT_KEYS } from './types.ts';
import type { MoveType, Rank, Stats, WeaponType } from './types.ts';

// IDs already stored in saves are retained. Each path advances exactly one stage.
export const CLASS_PATHS = {
  sword: [['gladiator', 'swordsman', 'sword_hero', 'swordmaster', 'sword_lord']],
  axe: [['axe_fighter', 'fighter', 'warrior', 'berserker', 'war_lord']],
  armor: [['lancer', 'knight', 'general', 'fortress', 'iron_lord']],
  cavalry: [['squire', 'cavalier', 'paladin', 'great_knight', 'rider_lord'], ['squire', 'cavalier', 'paladin', 'ranger_commander', 'rider_lord']],
  flying: [['wing_recruit', 'pegasus', 'falcon', 'sky_commander', 'wing_lord'], ['wing_recruit', 'wing_soldier', 'dragon_knight', 'dragon_commander', 'wing_lord']],
  bow: [['hunter', 'archer', 'sniper', 'marksman', 'bow_lord'], ['hunter', 'archer', 'sniper', 'bow_knight', 'bow_lord']],
  magic: [['adept', 'mage', 'sage', 'archsage', 'magic_lord'], ['adept', 'mage', 'warlock', 'druid', 'magic_lord'], ['adept', 'mage', 'mage_knight', 'archsage', 'magic_lord']],
  healing: [['acolyte', 'cleric', 'bishop', 'saint', 'holy_lord'], ['acolyte', 'cleric', 'bishop', 'valkyrie', 'holy_lord']],
  stealth: [['scout', 'thief', 'ranger', 'assassin', 'shadow_lord']],
  fist: [['fist_recruit', 'brawler', 'monk', 'fist_master', 'fist_lord']],
  beast: [['beast_cub', 'beast_fighter', 'beast_hero', 'beast_guard', 'beast_lord']],
  dragon: [['awakened', 'dragonkin', 'ancient_guard', 'dragon_sage', 'dragon_lord']],
} as const;
export type ClassRoute = keyof typeof CLASS_PATHS;
export type ClassId = (typeof CLASS_PATHS)[ClassRoute][number][number];
export type ClassStage = 1 | 2 | 3 | 4 | 5;
export const STAGE_NAMES = ['初级', '中级', '上级', '最上级', '神将级'] as const;
export const ROUTE_NAMES: Record<ClassRoute, string> = {
  sword: '剑术', axe: '斧战', armor: '重甲', cavalry: '骑乘', flying: '飞行', bow: '弓术',
  magic: '魔法', healing: '治疗', stealth: '潜行', fist: '格斗', beast: '兽人', dragon: '龙人',
};
export const CHARACTER_CAPS = stats(150, 99, 99, 99, 99, 99, 99, 99);
export interface ClassDef {
  name: string;
  tier: 'base' | 'promoted';
  stage: ClassStage;
  route: ClassRoute;
  moveType: MoveType;
  move: number;
  weapons: Partial<Record<WeaponType, Rank>>;
  growth: Stats;
  caps: Stats;
  maxLevel: number;
}
const ROUTES: Record<ClassRoute, { names: string[][]; weapon: WeaponType; moveType: MoveType; move: number; growth: Stats }> = {
  sword: { names: [['角斗士','剑士','剑豪','剑圣','剑神将']], weapon: 'sword', moveType: 'foot', move: 5, growth: stats(5,5,0,10,10,0,-5,0) },
  axe: { names: [['战士','斧斗士','勇士','狂战士','战神将']], weapon: 'axe', moveType: 'foot', move: 5, growth: stats(10,15,-5,5,0,0,5,-5) },
  armor: { names: [['枪兵','重甲兵','将军','要塞骑士','铁壁神将']], weapon: 'lance', moveType: 'armored', move: 4, growth: stats(10,5,-5,5,-10,0,15,-5) },
  cavalry: { names: [['侍骑','轻骑兵','圣骑士','大骑士','骑神将'],['侍骑','轻骑兵','圣骑士','游骑统领','骑神将']], weapon: 'lance', moveType: 'mounted', move: 7, growth: stats(5,5,0,5,5,0,5,0) },
  flying: { names: [['雏翼骑手','天马骑士','隼骑士','天翼统领','翼神将'],['雏翼骑手','翼兵','龙骑士','龙骑统领','翼神将']], weapon: 'lance', moveType: 'flying', move: 7, growth: stats(0,5,0,5,10,0,-5,10) },
  bow: { names: [['猎人','弓兵','狙击手','神射手','弓神将'],['猎人','弓兵','狙击手','弓骑士','弓神将']], weapon: 'bow', moveType: 'foot', move: 5, growth: stats(0,5,-5,15,5,0,0,0) },
  magic: { names: [['术士','魔道士','贤者','大贤者','法神将'],['术士','魔道士','咒术师','德鲁伊','法神将'],['术士','魔道士','魔剑士','大贤者','法神将']], weapon: 'tome', moveType: 'foot', move: 5, growth: stats(0,-5,15,5,0,0,-5,10) },
  healing: { names: [['学徒','修士','主教','圣导师','圣神将'],['学徒','修士','主教','女武神','圣神将']], weapon: 'staff', moveType: 'foot', move: 5, growth: stats(0,-5,10,0,0,5,-5,15) },
  stealth: { names: [['斥候','盗贼','游侠','暗影行者','影神将']], weapon: 'dagger', moveType: 'foot', move: 5, growth: stats(0,0,-5,10,15,5,-5,0) },
  fist: { names: [['拳徒','格斗家','武僧','拳宗','武神将']], weapon: 'fist', moveType: 'foot', move: 5, growth: stats(5,10,-5,5,5,0,5,-5) },
  beast: { names: [['幼战士','兽战士','兽勇士','兽王卫','兽神将']], weapon: 'beast', moveType: 'foot', move: 5, growth: stats(10,10,-10,5,5,0,5,-5) },
  dragon: { names: [['觉醒者','龙人','古龙卫','龙贤者','龙神将']], weapon: 'dragon', moveType: 'foot', move: 4, growth: stats(10,0,10,0,-5,0,5,10) },
};
export const CLASSES = {} as Record<ClassId, ClassDef>;
for (const route of Object.keys(CLASS_PATHS) as ClassRoute[]) {
  const spec = ROUTES[route];
  CLASS_PATHS[route].forEach((path, branch) => path.forEach((id, index) => {
    if (CLASSES[id]) return;
    const stage = (index + 1) as ClassStage;
    const weapons: ClassDef['weapons'] = { [spec.weapon]: (['D','C','A','S','S'] as Rank[])[index] };
    if (route === 'cavalry') weapons.sword = stage >= 3 ? 'A' : 'D';
    if (route === 'healing' && stage >= 3) weapons.tome = 'A';
    if (route === 'magic' && stage >= 3) weapons.staff = 'B';
    if (id === 'mage_knight' || id === 'assassin') weapons.sword = 'A';
    if (id === 'dragon_knight' || id === 'dragon_commander' || id === 'warrior' || id === 'great_knight') weapons.axe = 'A';
    if (id === 'warrior') weapons.bow = 'A';
    const mounted = id === 'bow_knight' || id === 'valkyrie';
    CLASSES[id] = { name: spec.names[branch][index], tier: stage <= 2 ? 'base' : 'promoted', stage, route,
      moveType: mounted ? 'mounted' : spec.moveType, move: mounted ? 8 : spec.move + (stage >= 3 ? 1 : 0),
      weapons, growth: Object.fromEntries(STAT_KEYS.map(key => [key, spec.growth[key] > 0 ? Math.min(20, spec.growth[key] + index * 2) : spec.growth[key]])) as Stats, caps: { ...CHARACTER_CAPS }, maxLevel: 99 };
  }));
}
export function classDef(id: ClassId): ClassDef { return CLASSES[id]; }
export function initialClass(route: ClassRoute): ClassId { return CLASS_PATHS[route][0][0]; }

// 职业市场（docs/00 §4.1、docs/13 §5.4）：按个人年份开放，可跨路线购买。数值待校准。
export const CLASS_OPEN_YEAR: Record<ClassStage, number> = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 8 };
export const CLASS_PRICE: Record<ClassStage, number> = { 1: 500, 2: 1_500, 3: 4_000, 4: 9_000, 5: 20_000 };
export function classOpenYear(id: ClassId): number { return CLASS_OPEN_YEAR[CLASSES[id].stage]; }
export function classPrice(id: ClassId): number { return CLASS_PRICE[CLASSES[id].stage]; }
// 现实月购买新资格的额度（docs/00 §4.1）；切回已购职业不占额度。数值仍是草案。
export const CLASS_PURCHASE_LIMIT = 3;
export function initialClassOf(classId: ClassId): ClassId { return initialClass(CLASSES[classId].route); }
