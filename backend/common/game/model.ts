import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import { CLASSES, classChangeReason, classSpecies } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { applyGrowthBonus } from '../data/growth-types.ts';
import type { GrowthType } from '../data/growth-types.ts';
import type { Promotion } from '../data/promotions.ts';
import { RANKS, STAT_KEYS, withCharm } from '../data/types.ts';
import type { Rank, StatKey, Stats, WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import type { SkillId } from '../data/skills.ts';
import { nextU32 } from '../engine/rng.ts';
import type { RngState } from '../engine/rng.ts';
import type { ItemStack, Point, Side, UnitState } from '../engine/types.ts';
import { DRUG_LIMIT_PER_STAT, DRUG_LIMIT_TOTAL, GAME_ITEMS } from './items.ts';
import type { ItemKey } from './items.ts';
import { DAYS_PER_YEAR } from './calendar.ts';
import { applyInheritanceFloor } from './legacy.ts';
import type { InheritanceContract } from './legacy.ts';
import type { SnapshotUnit } from '../arena/rules.ts';

// The server-side unit: permanent stats plus everything the battle layer needs to build a UnitState
// (docs/04「units」). SnapshotUnit (arena) and UnitState (battle) are both derived from this.
export interface UnitRecord {
  id: string;
  character: CharacterId;
  // 自捏主角覆盖（docs/00 「神主角」）：显示名、性别与形象预设；其余角色沿用 CHARACTERS[character]。
  name?: string;
  sex?: 'male' | 'female';
  portrait?: CharacterId;
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
  // 年龄按天计（docs/13 §2.2）：ageBaseDays 是 ageEpochDay 当天的年龄天数，之后随个人日历增加。
  ageBaseDays: number;
  ageEpochDay: number;
  // 可见自然寿命（整年，从出生起算）；主角不衰老也不寿终。
  lifespanYears: number;
  growthLog: { level: number; gains: Partial<Stats>; inherited?: Partial<Stats> }[];
  // 能力药 counts (docs/09.3): 5 per stat, 20 total per round.
  drugCounts: Partial<Record<StatKey, number>>;
  promotedFrom?: ClassId;
  // 一次轮回（docs/00 §5.2）：cycle 0→1，轮回后成长率分配、资格与学习进度都按新轮次重来。
  cycle: 0 | 1;
  // 轮回额外奖励：总计 30 个百分点的个人成长率分配，固定不跨代。
  growthAllocation: Partial<Stats>;
  // 成长率传承替换后的个人基础成长向量（绝对向量，非偏移）；轮回保留（docs/00 §5.2）。
  inheritedGrowth: Partial<Stats> | null;
  // 已购买职业资格（按轮次）；年份开放后购买，允许跨路线；已购职业可在营地免费切回。
  classQualifications: ClassId[];
  // 职业精通（docs/00 §4.2.1）：按 (cycle, classId) 独立累计，由有效参战／训练提供。
  classMastery: Partial<Record<ClassId, number>>;
  // 职业学习进度：每个职业已解锁的精通节点。
  learningProgress: Partial<Record<ClassId, string[]>>;
  // 已学会、可跨职业自由装备的技能（共用 5 格）；个人技能单列，不算在 5 格内。
  learnedSkills: SkillId[];
  equippedSkills: SkillId[];
  // 传承血缘锁（docs/00 §7.3）：接收过遗产的 B 为 1，永不再接或再产。
  lineageDepth: 0 | 1;
  receivedLegacyId: string | null;
  isProtagonist?: boolean;
  retiredDay?: number;
  reincarnatedDay?: number;
  // 数值传承的逐级保底合同（docs/00 §7.3.1）。
  inheritance?: InheritanceContract;
  // 远征锁（docs/13 §2.4）；锁定中的单位不能轮回或转职。
  lockedRunId?: string | null;
  // 后台派遣锁（docs/13 §5.5）；派遣中不能参加其他战斗、换职、轮回或退役。
  lockedDispatchId?: string | null;
}

// Deterministic visible natural lifespan per species (docs/00 §3.4): humans 80–100, beasts shorter,
// dragons much longer. Values are a first draft and need calibration.
const SPECIES_LIFESPAN: Record<'human' | 'beast' | 'dragon', [number, number]> = {
  human: [80, 100],
  beast: [45, 65],
  dragon: [180, 320],
};

function lifespanYearsFor(id: string, species: 'human' | 'beast' | 'dragon' = 'human'): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const [min, max] = SPECIES_LIFESPAN[species];
  return min + (h % (max - min + 1));
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
  unit.stats = withCharm(unit.stats);
  if (unit.inheritedGrowth) unit.inheritedGrowth.cha ??= 0;
  if (unit.inheritance) unit.inheritance.caps = withCharm(unit.inheritance.caps);
  unit.species ??= classSpecies(unit.classId);
  unit.cycle ??= 0;
  unit.lineageDepth ??= 0;
  unit.receivedLegacyId ??= null;
  unit.growthAllocation ??= {};
  unit.inheritedGrowth ??= null;
  unit.classQualifications ??= [];
  unit.classMastery ??= {};
  unit.learningProgress ??= {};
  unit.learnedSkills ??= [];
  unit.equippedSkills ??= [];
  if (unit.ageEpochDay === undefined) unit.ageEpochDay = unit.joinedDay;
  if (unit.ageBaseDays === undefined) unit.ageBaseDays = (unit.baseAge ?? CHARACTERS[unit.character].age) * DAYS_PER_YEAR;
  unit.lifespanYears ??= lifespanYearsFor(unit.id, unit.species);
  return unit;
}

export const ROSTER_LIMIT = 18;

// docs/04: a new character starts at level 1 with the class base. `expected: true` uses the growth
// expectation (deterministic) — the seed roster and opponents use it; real level-ups roll randomly.
// `opts` lets recruitment override the character default's growth type and age.
export interface UnitOptions { growthType?: GrowthType; age?: number; classId?: ClassId; lifespanYears?: number; cycle?: 0 | 1; base?: Stats; personalGrowth?: Stats }

export function createUnit(character: CharacterId, level: number, id: string, joinedDay: number, expected = true, opts: UnitOptions = {}): UnitRecord {
  const def = CHARACTERS[character];
  const classId = opts.classId ?? def.classId;
  const cls = CLASSES[classId];
  const growthType = opts.growthType ?? def.growthType;
  const age = opts.age ?? def.age;
  const species: UnitRecord['species'] = cls.route === 'beast' || cls.route === 'dragon' ? cls.route : 'human';
  // 自捏主角可传入自定的 1 级基础值与个人成长向量（opts.base / opts.personalGrowth）。
  // 指定职业（opts.classId）时用该职业的 1 级基础值与体格，从 1 级推导，包括上级职业；
  // 不指定则用角色表默认（有名有姓的预设角色保留手写 base）。
  const classBased = opts.base !== undefined || opts.classId !== undefined;
  const personal = opts.personalGrowth ?? def.growth;
  const base = opts.base ?? (classBased ? cls.base : def.base);
  const baseLevel = classBased ? 1 : def.level;
  const rates = applyGrowthBonus(Object.fromEntries(STAT_KEYS.map(key => [key, Math.max(0, personal[key] + cls.growth[key])])) as Stats, growthType, age);
  const stats = {} as Stats;
  for (const key of STAT_KEYS) {
    const rate = rates[key];
    stats[key] = expected
      ? Math.min(cls.caps[key], base[key] + Math.floor(rate * Math.max(0, level - baseLevel) / 100))
      : base[key];
  }
  const startingWeapons = (Object.keys(cls.weapons) as WeaponType[]).flatMap(type => {
    const first = (Object.keys(WEAPONS) as WeaponId[]).find(id => WEAPONS[id].type === type && WEAPONS[id].rank === 'E');
    return first ? [first] : [];
  }).slice(0, 5);
  const kit = opts.classId ? { weapons: startingWeapons,
    ranks: Object.fromEntries(Object.keys(cls.weapons).map(type => [type, 'E'])) as UnitRecord['ranks'], items: [] } : KITS[character];
  return {
    id, character, classId, species, level, exp: 0, stats, con: classBased ? cls.con : def.con, hp: stats.hp,
    weapons: [...kit.weapons], items: (kit.items ?? []).map(([item, uses]) => ({ id: item, uses })),
    ranks: { ...kit.ranks }, weaponExp: {}, status: 'active', joinedDay, growthType, baseAge: age, age,
    ageBaseDays: age * DAYS_PER_YEAR, ageEpochDay: joinedDay,
    lifespanYears: opts.lifespanYears ?? lifespanYearsFor(id, species), growthLog: [], drugCounts: {},
    cycle: opts.cycle ?? 0, growthAllocation: {}, inheritedGrowth: null, classQualifications: [], classMastery: {}, learningProgress: {},
    learnedSkills: [], equippedSkills: [],
    lineageDepth: 0, receivedLegacyId: null,
  };
}

// 自捏主角 1 级基础值（docs/00「神主角」）：不直接沿用代表角色的 base，而是把 base 当作该职业 1 级最低值，
// 再按个人成长率掷一个 0.5–1.5 倍的随机加成（成长越高，1 级基础越可能偏高）。
export function rollProtagonistBase(classMin: Stats, personalGrowth: Stats, rng: RngState): Stats {
  const base = {} as Stats;
  for (const key of STAT_KEYS) {
    const factor = 0.5 + (nextU32(rng) % 1000) / 1000;
    base[key] = classMin[key] + Math.floor(personalGrowth[key] / 20 * factor);
  }
  return base;
}

// Personal + class growth with the growth-type/age offset already applied.
export function personalGrowth(character: CharacterId, growthType: GrowthType, age: number): Stats {
  const personal = CHARACTERS[character].growth, own = CLASSES[CHARACTERS[character].classId].growth;
  const rates = {} as Stats;
  for (const key of STAT_KEYS) rates[key] = Math.max(0, personal[key] + own[key]);
  return applyGrowthBonus(rates, growthType, age);
}

// 年龄天数（docs/13 §2.2）：ageBaseDays + (day - ageEpochDay)。主角不衰老，返回固定基准。
export function ageDaysOf(unit: UnitRecord, day: number): number {
  if (unit.isProtagonist) return unit.ageBaseDays;
  return unit.ageBaseDays + Math.max(0, day - unit.ageEpochDay);
}

// 寿终日（绝对行动日）：ageEpochDay + (寿命天数 - 基准年龄天数)。
export function lifespanEndDayOf(unit: UnitRecord): number {
  return unit.ageEpochDay + unit.lifespanYears * DAYS_PER_YEAR - unit.ageBaseDays;
}

// Recomputes a unit's age from the calendar; callers persist the record when it changes.
export function ageAt(unit: UnitRecord, day: number, daysPerYear: number): number {
  // Old saves may predate baseAge; fall back to the character's written age (docs/02).
  const base = unit.baseAge ?? CHARACTERS[unit.character].age;
  if (unit.isProtagonist) return base;
  return Math.floor(((unit.ageBaseDays ?? base * daysPerYear) + Math.max(0, day - (unit.ageEpochDay ?? unit.joinedDay))) / daysPerYear);
}

export function effectiveCaps(unit: UnitRecord): Stats {
  return CLASSES[unit.classId].caps;
}

export function growthRates(unit: UnitRecord): Stats {
  const personal = unit.inheritedGrowth ?? CHARACTERS[unit.character].growth;
  const own = CLASSES[unit.classId].growth;
  const rates = {} as Stats;
  for (const key of STAT_KEYS) rates[key] = Math.max(0, (personal[key] ?? 0) + (unit.growthAllocation?.[key] ?? 0) + own[key]);
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
  // 数值遗产的逐级保底在自然成长之后补差额（docs/00 §7.3.1）。
  const inherited = applyInheritanceFloor(unit);
  if (Object.keys(inherited).length > 0) unit.growthLog[unit.growthLog.length - 1].inherited = inherited;
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
  const problem = classChangeReason(unit, promotion.to);
  if (problem) throw new Error(problem);
  if (unit.classId !== promotion.from || CLASSES[promotion.to].stage <= CLASSES[unit.classId].stage) throw new Error('无效的职业进阶方向');
  unit.classId = promotion.to;
  unit.promotedFrom = promotion.from;
  for (const type of Object.keys(CLASSES[unit.classId].weapons) as WeaponType[]) unit.ranks[type] ??= 'E';
}

export function toSnapshot(unit: UnitRecord): SnapshotUnit {
  return {
    id: unit.id, character: unit.character, classId: unit.classId, level: unit.level, stats: withCharm(unit.stats),
    con: unit.con, weapons: [...unit.weapons], ranks: { ...unit.ranks }, items: unit.items.map(i => ({ ...i })),
    name: unitName(unit), sex: unit.sex, portrait: unit.portrait,
  };
}

// 单位显示名：自捏主角用自己的名字，其余角色用预设名。
export function unitName(unit: UnitRecord): string {
  return unit.name ?? CHARACTERS[unit.character].name;
}

// Builds the engine unit. Battle stats are a copy, so the record survives a lost battle (the caller
// decides whether death is permanent, docs/00 §7.1).
export function toBattleUnit(unit: UnitRecord, side: Side, id: string, pos: Point, extra: Partial<UnitState> = {}): UnitState {
  return {
    id, name: unitName(unit), side, character: unit.character, portrait: unit.portrait, classId: unit.classId,
    level: unit.level, exp: unit.exp, stats: withCharm(unit.stats), con: unit.con, hp: unit.stats.hp,
    pos: [pos[0], pos[1]], weapons: [...unit.weapons], items: unit.items.map(i => ({ ...i })),
    ranks: { ...unit.ranks }, skill: CHARACTERS[unit.character].skill, growthType: unit.growthType, age: unit.age,
    growthAllocation: unit.growthAllocation ? { ...unit.growthAllocation } : undefined,
    inheritedGrowth: unit.inheritedGrowth ? { ...unit.inheritedGrowth } : undefined,
    inheritance: unit.inheritance ? structuredClone(unit.inheritance) : undefined,
    skills: [...(unit.equippedSkills ?? [])],
    shields: unit.items.filter(i => i.id === 'immortal_shield').length,
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
// `classId` overrides the class whose weapon cap applies (used by training a class off-field).
export function addWeaponExp(unit: UnitRecord, type: WeaponType, amount: number, classId: ClassId = unit.classId): Rank | null {
  if (!CLASSES[classId].weapons[type] || !Number.isFinite(amount) || amount <= 0) return null;
  const before = unit.ranks[type] ?? 'E';
  const exp = Math.max(unit.weaponExp[type] ?? 0, RANK_EXP[before]) + amount;
  unit.weaponExp[type] = exp;
  const after = rankFromExp(exp);
  const cap = CLASSES[classId].weapons[type];
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
