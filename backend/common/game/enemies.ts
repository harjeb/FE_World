import { CLASSES, CLASS_PATHS, canonicalClassId, classOpenYear } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { STAT_KEYS, rankAtLeast, stats } from '../data/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import { WEAPONS, WEAPON_SERIES, weaponSeriesTier } from '../data/weapons.ts';
import { materialTier } from './materials.ts';
import type { WeaponId } from '../data/weapons.ts';
import type { AiDifficulty, Behavior, Point, UnitState } from '../engine/types.ts';
import { DAYS_PER_YEAR, enemyLevel } from './calendar.ts';

// Enemy stages follow the existing year/level curve: 1, 20, 47, 66, 81; player unlocks stay separate.
export function enemyClassForLevel(classId: ClassId, level: number): ClassId {
  const allowed = (id: ClassId) => level >= enemyLevel((classOpenYear(id) - 1) * DAYS_PER_YEAR);
  if (allowed(classId)) return classId;
  const paths = CLASS_PATHS[CLASSES[classId].route] as readonly (readonly ClassId[])[];
  const path = paths.find(ids => ids.includes(canonicalClassId(classId))) ?? paths[0];
  return [...path].reverse().find(allowed) ?? path[0];
}

const ENEMY_NAMES = ['灰岩军团', '黑旗军', '赤牙强盗', '黑巷小偷'];

export const HARD_ENEMY_RULES = { extraRatio: 0.5, levelMin: 2, levelMax: 5, hpMin: 20, hpMax: 35, statMin: 10, statMax: 25, conMin: 1, conMax: 3 } as const;
export const HARD_ENEMY_EFFECT = `敌军人数 +${HARD_ENEMY_RULES.extraRatio * 100}%（以合法空位为限），等级 +${HARD_ENEMY_RULES.levelMin}～${HARD_ENEMY_RULES.levelMax}（上限99），HP +${HARD_ENEMY_RULES.hpMin}～${HARD_ENEMY_RULES.hpMax}%，其他${STAT_KEYS.length - 1}项能力值各 +${HARD_ENEMY_RULES.statMin}～${HARD_ENEMY_RULES.statMax}%（独立随机、至少+1、向上取整；HP上限150，其他能力值无上限），体格 +${HARD_ENEMY_RULES.conMin}～${HARD_ENEMY_RULES.conMax}，装备升级，移动不变`;

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
  const basic: Record<WeaponType, WeaponId> = { sword: 'iron_sword', lance: 'iron_lance', axe: 'iron_axe', bow: 'iron_bow', tome: 'fire', staff: 'heal', fist: 'gauntlet', beast: 'beast_claw', dragon: 'dragonstone' };
  return TEMPLATES[classId] ?? { name: cls.name, base: stats(20,6,6,6,6,3,4,4),
    weapons: (Object.keys(cls.weapons) as WeaponType[]).map(type => basic[type]), ranks: { ...cls.weapons } };
}

export function enemyStats(classId: ClassId, level: number): Stats {
  const cls = CLASSES[classId], tpl = templateFor(classId);
  const out = {} as Stats;
  for (const key of STAT_KEYS) {
    out[key] = Math.min(cls.caps[key] ?? Infinity, tpl.base[key] + Math.floor(Math.max(0, cls.growth[key] + (key === 'hp' ? 50 : 25)) * (level - 1) / 100));
  }
  return out;
}

export function defaultBehavior(classId: ClassId): Behavior {
  if (CLASSES[classId].weapons.staff !== undefined && templateFor(classId).weapons.some(id => WEAPONS[id].heal)) return 'healer';
  if (classId === 'archer' || classId === 'mage' || classId === 'sniper' || classId === 'bow_knight') return 'opportunist';
  if (classId === 'knight' || classId === 'general' || classId === 'fortress') return 'hold';
  return 'aggressive';
}

// Deliberately bounded catalog choices: no personal legends or movement-granting gear.
const HARD_GEAR: Partial<Record<WeaponId, WeaponId>> = {
  iron_sword: 'steel_sword', iron_lance: 'steel_lance', iron_axe: 'steel_axe', iron_bow: 'steel_bow',
  steel_sword: 'silver_sword', killing_edge: 'silver_sword', steel_lance: 'silver_lance',
  killer_lance: 'silver_lance', javelin: 'silver_lance', steel_axe: 'silver_axe', hand_axe: 'tomahawk',
  steel_bow: 'silver_bow', killer_bow: 'silver_bow', fire: 'thunder', thunder: 'flame_lance',
  gauntlet: 'steel_gauntlet', dagger: 'silver_dagger', beast_claw: 'beaststone_plus', dragonstone: 'dragonstone_plus',
  heal: 'recover', recover: 'physic',
};

export interface EnemySpec { seed?: string; aiDifficulty?: AiDifficulty; classId: ClassId; level: number; pos: Point; boss?: boolean; behavior?: Behavior; vision?: number; thiefTurn?: number; name?: string; tags?: UnitState['tags'] }

export function createEnemy(id: string, spec: EnemySpec): UnitState {
  const hard = spec.aiDifficulty === 'hard';
  // A fresh, unit-specific stream never consumes battle/combat randomness.
  const rng = seedRng(JSON.stringify(['hard-enemy', spec.seed ?? id, id]));
  const int = (min: number, max: number) => min + Math.floor(nextU32(rng) / 4294967296 * (max - min + 1));
  const rules = HARD_ENEMY_RULES;
  const level = hard ? Math.max(spec.level, Math.min(99, spec.level + int(rules.levelMin, rules.levelMax))) : spec.level;
  const statsValue = enemyStats(spec.classId, level);
  if (hard) {
    for (const key of STAT_KEYS) {
      const percent = key === 'hp' ? int(rules.hpMin, rules.hpMax) : int(rules.statMin, rules.statMax);
      statsValue[key] = Math.min(CLASSES[spec.classId].caps[key] ?? Infinity, statsValue[key] + Math.max(1, Math.ceil(statsValue[key] * percent / 100)));
    }
  }
  const tpl = templateFor(spec.classId);
  const ranks = { ...tpl.ranks };
  const baseWeapons = tpl.weapons.map(id => {
    const type = WEAPONS[id].type as keyof typeof WEAPON_SERIES;
    return weaponSeriesTier(id) ? WEAPON_SERIES[type][Math.min(5, materialTier(spec.level)) - 1] : id;
  });
  let weapons = [...baseWeapons];
  if (hard) {
    const upgrades = baseWeapons.map(weapon => {
      const tier = weaponSeriesTier(weapon);
      return tier ? WEAPON_SERIES[WEAPONS[weapon].type as keyof typeof WEAPON_SERIES][Math.min(4, tier)] : HARD_GEAR[weapon];
    }).filter((weapon): weapon is WeaponId =>
      weapon !== undefined && CLASSES[spec.classId].weapons[WEAPONS[weapon].type] !== undefined);
    // Keep original crit, effectiveness and range choices. Full healing stays first.
    weapons = [...new Set([...upgrades.filter(id => id !== 'physic'), ...baseWeapons, ...upgrades])];
  }
  for (const id of weapons) {
    const weapon = WEAPONS[id];
    if (!rankAtLeast(ranks[weapon.type], weapon.rank)) ranks[weapon.type] = weapon.rank;
  }
  const behavior = spec.behavior ?? defaultBehavior(spec.classId);
  return {
    id, name: spec.name ?? ENEMY_NAMES[nextU32(seedRng(`${spec.seed ?? id}:name:${id}`)) % ENEMY_NAMES.length], side: 'enemy', classId: spec.classId, level, exp: 0,
    stats: statsValue, con: hard ? 8 + int(rules.conMin, rules.conMax) : 8, hp: statsValue.hp, pos: [spec.pos[0], spec.pos[1]], weapons,
    items: [], ranks, boss: spec.boss, behavior, acted: false, alive: true,
    ...(spec.vision === undefined ? {} : { vision: spec.vision }),
    ...(spec.thiefTurn === undefined ? {} : { thiefTurn: spec.thiefTurn }),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
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
