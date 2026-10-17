import { CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { STAT_KEYS, stats } from '../data/types.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import type { WeaponId } from '../data/weapons.ts';
import type { Behavior, Point, UnitState } from '../engine/types.ts';

// Generic enemies for random encounters (docs/00 §8.1.2). No personal character: they never grow,
// and their numbers are the class template plus the class growth expectation for the level.
interface Template { base: Stats; weapons: WeaponId[]; ranks: Partial<Record<WeaponType, Rank>>; name: string }

const TEMPLATES: Partial<Record<ClassId, Template>> = {
  swordsman: { base: stats(20, 6, 0, 7, 8, 3, 4, 1), weapons: ['iron_sword'], ranks: { sword: 'D' }, name: '剑士' },
  fighter: { base: stats(22, 7, 0, 4, 5, 2, 4, 0), weapons: ['iron_axe'], ranks: { axe: 'D' }, name: '斧兵' },
  knight: { base: stats(24, 8, 0, 4, 2, 2, 11, 1), weapons: ['iron_lance'], ranks: { lance: 'D' }, name: '重甲兵' },
  cavalier: { base: stats(21, 7, 0, 6, 6, 3, 7, 2), weapons: ['iron_lance', 'iron_sword'], ranks: { lance: 'D', sword: 'E' }, name: '骑兵' },
  pegasus: { base: stats(18, 5, 0, 6, 9, 5, 3, 5), weapons: ['iron_lance'], ranks: { lance: 'D' }, name: '天马骑士' },
  archer: { base: stats(19, 6, 0, 7, 6, 3, 4, 1), weapons: ['iron_bow'], ranks: { bow: 'D' }, name: '弓兵' },
  mage: { base: stats(17, 0, 6, 5, 6, 3, 2, 5), weapons: ['fire'], ranks: { tome: 'D' }, name: '魔道士' },
  cleric: { base: stats(16, 0, 5, 3, 5, 7, 1, 6), weapons: ['heal'], ranks: { staff: 'D' }, name: '修士' },
  swordmaster: { base: stats(26, 9, 0, 13, 14, 4, 6, 2), weapons: ['steel_sword'], ranks: { sword: 'B' }, name: '剑圣' },
  assassin: { base: stats(24, 10, 0, 11, 15, 4, 5, 2), weapons: ['killing_edge'], ranks: { sword: 'B' }, name: '刺客' },
  berserker: { base: stats(34, 14, 0, 6, 8, 2, 7, 0), weapons: ['steel_axe'], ranks: { axe: 'B' }, name: '狂战士' },
  general: { base: stats(34, 12, 0, 7, 3, 3, 17, 4), weapons: ['steel_lance', 'hand_axe'], ranks: { lance: 'B', axe: 'C' }, name: '将军' },
  fortress: { base: stats(36, 11, 0, 6, 3, 3, 16, 7), weapons: ['steel_lance'], ranks: { lance: 'B' }, name: '要塞' },
  paladin: { base: stats(30, 11, 0, 10, 11, 4, 11, 6), weapons: ['steel_lance', 'steel_sword'], ranks: { lance: 'B', sword: 'C' }, name: '圣骑士' },
  great_knight: { base: stats(34, 13, 0, 7, 5, 3, 15, 3), weapons: ['steel_lance', 'hand_axe'], ranks: { lance: 'B', axe: 'C' }, name: '大骑士' },
  falcon: { base: stats(26, 8, 0, 11, 16, 7, 6, 10), weapons: ['killer_lance', 'javelin'], ranks: { lance: 'B' }, name: '隼骑士' },
  dragon_knight: { base: stats(33, 13, 0, 8, 9, 3, 15, 3), weapons: ['steel_lance', 'hand_axe'], ranks: { lance: 'B', axe: 'C' }, name: '龙骑士' },
  sniper: { base: stats(26, 10, 0, 14, 9, 4, 7, 2), weapons: ['killer_bow', 'steel_bow'], ranks: { bow: 'B' }, name: '狙击手' },
  bow_knight: { base: stats(27, 10, 0, 11, 11, 4, 8, 3), weapons: ['steel_bow', 'steel_sword'], ranks: { bow: 'B', sword: 'C' }, name: '弓骑兵' },
  sage: { base: stats(24, 1, 12, 10, 9, 4, 4, 11), weapons: ['thunder', 'recover'], ranks: { tome: 'B', staff: 'C' }, name: '贤者' },
  mage_knight: { base: stats(28, 10, 8, 10, 10, 4, 8, 6), weapons: ['thunder', 'steel_sword'], ranks: { tome: 'B', sword: 'C' }, name: '魔剑士' },
  bishop: { base: stats(24, 1, 11, 9, 8, 8, 4, 14), weapons: ['recover', 'thunder'], ranks: { staff: 'B', tome: 'C' }, name: '主教' },
  valkyrie: { base: stats(25, 1, 11, 8, 11, 8, 5, 12), weapons: ['recover', 'thunder'], ranks: { staff: 'B', tome: 'C' }, name: '女武神' },
};

export function templateFor(classId: ClassId): Template {
  const cls = CLASSES[classId];
  const basic: Record<WeaponType, WeaponId> = { sword: 'iron_sword', lance: 'iron_lance', axe: 'iron_axe', bow: 'iron_bow', tome: 'fire', staff: 'heal', fist: 'gauntlet', dagger: 'dagger', beast: 'beast_claw', dragon: 'dragonstone' };
  return TEMPLATES[classId] ?? { name: cls.name, base: stats(20,6,6,6,6,3,4,4),
    weapons: (Object.keys(cls.weapons) as WeaponType[]).map(type => basic[type]), ranks: { ...cls.weapons } };
}

export function enemyStats(classId: ClassId, level: number): Stats {
  const cls = CLASSES[classId], tpl = templateFor(classId);
  const out = {} as Stats;
  for (const key of STAT_KEYS) {
    out[key] = Math.min(cls.caps[key], tpl.base[key] + Math.floor(Math.max(0, cls.growth[key] + (key === 'hp' ? 50 : 25)) * (level - 1) / 100));
  }
  return out;
}

export function defaultBehavior(classId: ClassId): Behavior {
  if (classId === 'cleric' || classId === 'bishop' || classId === 'valkyrie' || classId === 'sage') return 'healer';
  if (classId === 'archer' || classId === 'mage' || classId === 'sniper' || classId === 'bow_knight') return 'opportunist';
  if (classId === 'knight' || classId === 'general' || classId === 'fortress') return 'hold';
  return 'aggressive';
}

export interface EnemySpec { classId: ClassId; level: number; pos: Point; boss?: boolean; behavior?: Behavior; name?: string }

export function createEnemy(id: string, spec: EnemySpec): UnitState {
  const statsValue = enemyStats(spec.classId, spec.level);
  const tpl = templateFor(spec.classId);
  const behavior = spec.behavior ?? defaultBehavior(spec.classId);
  return {
    id, name: spec.name ?? `灰岩${tpl.name}`, side: 'enemy', classId: spec.classId, level: spec.level, exp: 0,
    stats: statsValue, con: 8, hp: statsValue.hp, pos: [spec.pos[0], spec.pos[1]], weapons: [...tpl.weapons],
    items: [], ranks: { ...tpl.ranks }, boss: spec.boss, behavior, acted: false, alive: true,
  };
}

// A mixed enemy roster for a random encounter. `classes` is chosen by the caller so the map theme
// and the region flavour can steer the composition (docs/00 §8.1.2).
export function pickClasses(seed: string, count: number, pool: ClassId[]): ClassId[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out: ClassId[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out.push(pool[h % pool.length]);
  }
  return out;
}
