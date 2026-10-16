import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import { CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { applyGrowthBonus } from '../data/growth-types.ts';
import type { GrowthType } from '../data/growth-types.ts';
import type { Promotion } from '../data/promotions.ts';
import { RANKS, STAT_KEYS } from '../data/types.ts';
import type { Rank, StatKey, Stats, WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import { nextU32 } from '../engine/rng.ts';
import type { RngState } from '../engine/rng.ts';
import type { ItemStack, Point, Side, UnitState } from '../engine/types.ts';
import { DRUG_LIMIT_PER_STAT, DRUG_LIMIT_TOTAL, GAME_ITEMS } from './items.ts';
import type { ItemKey } from './items.ts';
import type { SnapshotUnit } from '../arena/rules.ts';

// The server-side unit: permanent stats plus everything the battle layer needs to build a UnitState
// (docs/04「units」). SnapshotUnit (arena) and UnitState (battle) are both derived from this.
export interface UnitRecord {
  id: string;
  character: CharacterId;
  classId: ClassId;
  species: 'human' | 'beast' | 'dragon';
  level: number;
  exp: number;
  stats: Stats;
  con: number;
  // Out-of-battle HP; battles carry their own copy and never write back into this (docs/00 §8.1.3).
  hp: number;
  weapons: WeaponId[];
  items: ItemStack[];
  ranks: Partial<Record<WeaponType, Rank>>;
  weaponExp: Partial<Record<WeaponType, number>>;
  status: 'active' | 'dead' | 'retired';
  joinedDay: number;
  // 成长类型与年龄（docs/02）: baseAge is the age at recruitment; age is refreshed from the calendar.
  growthType: GrowthType;
  baseAge: number;
  age: number;
  growthLog: { level: number; gains: Partial<Stats> }[];
  // 能力药 counts (docs/09.3): 5 per stat, 20 total per round.
  drugCounts: Partial<Record<StatKey, number>>;
  promotedFrom?: ClassId;
}

// Default gear per character, mirroring the arena demo kits so a fresh roster is immediately playable.
const KITS: Record<CharacterId, { weapons: WeaponId[]; ranks: Partial<Record<WeaponType, Rank>>; items?: [ItemId, number][] }> = {
  erin: { weapons: ['killing_edge', 'steel_sword'], ranks: { sword: 'C' }, items: [['vulnerary', 2]] },
  karl: { weapons: ['steel_axe', 'hand_axe'], ranks: { axe: 'C' } },
  victor: { weapons: ['steel_lance', 'armorslayer', 'steel_sword'], ranks: { lance: 'C', sword: 'D' } },
  lina: { weapons: ['killer_lance', 'javelin'], ranks: { lance: 'C' } },
  owen: { weapons: ['steel_bow', 'killer_bow'], ranks: { bow: 'C' }, items: [['vulnerary', 1]] },
  sera: { weapons: ['thunder', 'wind'], ranks: { tome: 'C' } },
  noah: { weapons: ['heal', 'recover'], ranks: { staff: 'C' } },
  gustav: { weapons: ['steel_lance', 'javelin'], ranks: { lance: 'C' } },
  ren: { weapons: ['steel_sword', 'iron_sword'], ranks: { sword: 'C' } },
  ig: { weapons: ['steel_axe', 'hand_axe'], ranks: { axe: 'C' } },
  mira: { weapons: ['heal', 'recover'], ranks: { staff: 'C' } },
  roland: { weapons: ['steel_lance', 'javelin'], ranks: { lance: 'C' } },
};

export function normalizeUnit(unit: UnitRecord): UnitRecord {
  // Old IDs, levels and earned attributes stay intact; only absent progression fields are filled.
  unit.species ??= 'human';
  return unit;
}

export const ROSTER_LIMIT = 18;

// docs/04: a new character starts at level 1 with the class base. `expected: true` uses the growth
// expectation (deterministic) — the seed roster and opponents use it; real level-ups roll randomly.
// `opts` lets recruitment override the character default's growth type and age.
export interface UnitOptions { growthType?: GrowthType; age?: number; classId?: ClassId }

export function createUnit(character: CharacterId, level: number, id: string, joinedDay: number, expected = true, opts: UnitOptions = {}): UnitRecord {
  const def = CHARACTERS[character];
  const classId = opts.classId ?? def.classId;
  const cls = CLASSES[classId];
  const growthType = opts.growthType ?? def.growthType;
  const age = opts.age ?? def.age;
  const rates = applyGrowthBonus(Object.fromEntries(STAT_KEYS.map(key => [key, Math.max(0, def.growth[key] + cls.growth[key])])) as Stats, growthType, age);
  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    const rate = rates[key];
    stats[key] = expected
      ? Math.min(cls.caps[key], def.base[key] + Math.floor(rate * Math.max(0, level - def.level) / 100))
      : def.base[key];
  }
  const kit = opts.classId ? { weapons: Object.keys(WEAPONS).filter(id => {
    const w = WEAPONS[id as WeaponId]; return w.rank === 'E' && cls.weapons[w.type];
  }) as WeaponId[], ranks: Object.fromEntries(Object.keys(cls.weapons).map(type => [type, 'E'])) as UnitRecord['ranks'], items: [] } : KITS[character];
  return {
    id, character, classId, species: cls.route === 'beast' || cls.route === 'dragon' ? cls.route : 'human', level, exp: 0, stats, con: def.con, hp: stats.hp,
    weapons: [...kit.weapons], items: (kit.items ?? []).map(([item, uses]) => ({ id: item, uses })),
    ranks: { ...kit.ranks }, weaponExp: {}, status: 'active', joinedDay, growthType, baseAge: age, age,
    growthLog: [], drugCounts: {},
  };
}

// Personal + class growth with the growth-type/age offset already applied.
export function personalGrowth(character: CharacterId, growthType: GrowthType, age: number): Stats {
  const personal = CHARACTERS[character].growth, own = CLASSES[CHARACTERS[character].classId].growth;
  const rates = {} as Stats;
  for (const key of STAT_KEYS) rates[key] = Math.max(0, personal[key] + own[key]);
  return applyGrowthBonus(rates, growthType, age);
}

// Recomputes a unit's age from the calendar; callers persist the record when it changes.
export function ageAt(unit: UnitRecord, day: number, daysPerYear: number): number {
  // Old saves may predate baseAge; fall back to the character's written age (docs/02).
  const base = unit.baseAge ?? CHARACTERS[unit.character].age;
  return base + Math.floor((day - unit.joinedDay) / daysPerYear);
}

export function effectiveCaps(unit: UnitRecord): Stats {
  return CLASSES[unit.classId].caps;
}

export function growthRates(unit: UnitRecord): Stats {
  const personal = CHARACTERS[unit.character].growth, own = CLASSES[unit.classId].growth;
  const rates = {} as Stats;
  for (const key of STAT_KEYS) rates[key] = Math.max(0, personal[key] + own[key]);
  return applyGrowthBonus(rates, unit.growthType, unit.age);
}

// Random growth for one level, using the battle-style roll but a plain RngState so training and
// 公共经验 share the engine's rules without needing a BattleState (docs/02「随机成长」).
export function rollGrowth(unit: UnitRecord, rng: RngState): { gains: Partial<Stats>; rerolls: number } {
  const rates = growthRates(unit), caps = effectiveCaps(unit);
  const roll = () => {
    const gains: Partial<Stats> = {};
    for (const key of STAT_KEYS) {
      const room = caps[key] - unit.stats[key];
      if (room <= 0) continue;
      let gain = Math.floor(rates[key] / 100);
      const rest = rates[key] % 100;
      if (rest > 0 && nextU32(rng) % 100 < rest) gain++;
      if (gain > 0) gains[key] = Math.min(gain, room);
    }
    return gains;
  };
  const anyRoom = STAT_KEYS.some(key => unit.stats[key] < caps[key]);
  let gains = roll(), rerolls = 0;
  while (Object.keys(gains).length === 0 && anyRoom && rerolls < 2) { gains = roll(); rerolls++; }
  return { gains, rerolls };
}

// Applies one level-up in place; returns the gains for the record.
export function levelUp(unit: UnitRecord, rng: RngState): Partial<Stats> {
  const cls = CLASSES[unit.classId];
  unit.level += 1;
  unit.exp = unit.level >= cls.maxLevel ? 0 : unit.exp - 100;
  const { gains } = rollGrowth(unit, rng);
  for (const [key, gain] of Object.entries(gains) as [StatKey, number][]) {
    unit.stats[key] += gain;
    if (key === 'hp') unit.hp += gain;
  }
  unit.growthLog.push({ level: unit.level, gains });
  return gains;
}

// Adds experience out of battle (公共经验 / 训练), returning every level-up for the response.
export function gainExperience(unit: UnitRecord, amount: number, rng: RngState): { level: number; gains: Partial<Stats> }[] {
  const cls = CLASSES[unit.classId];
  const ups: { level: number; gains: Partial<Stats> }[] = [];
  if (unit.level >= cls.maxLevel) return ups;
  unit.exp += amount;
  while (unit.exp >= 100 && unit.level < cls.maxLevel) ups.push({ level: unit.level + 1, gains: levelUp(unit, rng) });
  return ups;
}

// Promotion preserves total level, experience and permanent attributes.
export function promote(unit: UnitRecord, promotion: Promotion): void {
  if (unit.classId !== promotion.from || CLASSES[promotion.to].stage !== CLASSES[unit.classId].stage + 1) throw new Error('必须逐阶转职');
  unit.classId = promotion.to;
  unit.promotedFrom = promotion.from;
  for (const type of Object.keys(CLASSES[unit.classId].weapons) as WeaponType[]) unit.ranks[type] ??= 'E';
}

export function toSnapshot(unit: UnitRecord): SnapshotUnit {
  return {
    id: unit.id, character: unit.character, classId: unit.classId, level: unit.level, stats: { ...unit.stats },
    con: unit.con, weapons: [...unit.weapons], ranks: { ...unit.ranks }, items: unit.items.map(i => ({ ...i })),
  };
}

// Builds the engine unit. Battle stats are a copy, so the record survives a lost battle (the caller
// decides whether death is permanent, docs/00 §7.1).
export function toBattleUnit(unit: UnitRecord, side: Side, id: string, pos: Point, extra: Partial<UnitState> = {}): UnitState {
  return {
    id, name: CHARACTERS[unit.character].name, side, character: unit.character, classId: unit.classId,
    level: unit.level, exp: unit.exp, stats: { ...unit.stats }, con: unit.con, hp: unit.stats.hp,
    pos: [pos[0], pos[1]], weapons: [...unit.weapons], items: unit.items.map(i => ({ ...i })),
    ranks: { ...unit.ranks }, skill: CHARACTERS[unit.character].skill, growthType: unit.growthType, age: unit.age,
    acted: false, alive: true, ...extra,
  };
}

export const RANK_EXP: Record<Rank, number> = { E: 0, D: 30, C: 70, B: 120, A: 180, S: 250 };

export function rankFromExp(exp: number): Rank {
  let rank: Rank = 'E';
  for (const r of RANKS) if (exp >= RANK_EXP[r]) rank = r;
  return rank;
}

// Weapon experience raises the rank when it crosses a threshold (docs/04.3「熟练度通过实际使用提升」).
export function addWeaponExp(unit: UnitRecord, type: WeaponType, amount: number): Rank | null {
  const before = unit.ranks[type] ?? 'E';
  const exp = Math.max(unit.weaponExp[type] ?? 0, RANK_EXP[before]) + amount;
  unit.weaponExp[type] = exp;
  const after = rankFromExp(exp);
  const cap = CLASSES[unit.classId].weapons[type];
  const capped = cap && RANKS[Math.min(RANKS.indexOf(after), RANKS.indexOf(cap))];
  if (capped && RANKS.indexOf(capped) > RANKS.indexOf(before)) {
    unit.ranks[type] = capped;
    return capped;
  }
  return null;
}

// 能力药 (docs/09.3): 5 per stat and 20 total per round, never above the class cap.
export function useDrug(unit: UnitRecord, key: ItemKey): { stat: StatKey; amount: number } {
  const item = GAME_ITEMS[key];
  if (item.kind !== 'stat' || !item.stat || !item.amount) throw new Error(`${item.name} 不是能力药`);
  const used = unit.drugCounts[item.stat] ?? 0;
  const total = Object.values(unit.drugCounts).reduce((a, b) => a + (b ?? 0), 0);
  if (used >= DRUG_LIMIT_PER_STAT) throw new Error(`${item.name}：单项能力药已达 ${DRUG_LIMIT_PER_STAT} 次上限`);
  if (total >= DRUG_LIMIT_TOTAL) throw new Error(`能力药已达合计 ${DRUG_LIMIT_TOTAL} 次上限`);
  const cap = effectiveCaps(unit)[item.stat];
  if (unit.stats[item.stat] >= cap) throw new Error(`${item.name}：该属性已达上限`);
  const amount = Math.min(item.amount, cap - unit.stats[item.stat]);
  unit.stats[item.stat] += amount;
  if (item.stat === 'hp') unit.hp += amount;
  unit.drugCounts[item.stat] = used + 1;
  return { stat: item.stat, amount };
}

export function inventoryItem(key: ItemKey): { name: string; kind: string } {
  return { name: GAME_ITEMS[key].name, kind: GAME_ITEMS[key].kind };
}
