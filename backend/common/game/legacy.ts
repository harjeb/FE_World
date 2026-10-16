import { CHARACTERS } from '../data/characters.ts';
import type { ClassId } from '../data/classes.ts';
import { CLASSES } from '../data/classes.ts';
import { STAT_KEYS } from '../data/types.ts';
import type { StatKey, Stats } from '../data/types.ts';
import { effectiveCaps } from './model.ts';
import type { UnitRecord } from './model.ts';

// 永久军团：传承、数值保底与一次轮回（docs/00 §5、§7，docs/13 §2.2、§5）。
// All rules here are pure so both the API and the tests can call them without a database.

export type LegacyCause = 'death' | 'retired' | 'age';
export type LegacyMode = 'growth' | 'numeric';

export interface LegacyRecord {
  id: string;
  playerId: string;
  sourceUnitId: string;
  sourceName: string;
  sourceCharacter: string;
  sourceLineageDepth: 0;
  cause: LegacyCause;
  sourceLevel: number;
  // 九项永久属性总量（docs/00 §7.3.1），不含装备、临时状态、体格与移动。
  sourceStats: Stats;
  // 冻结的个人基础成长 + 当时装备／被动提高的成长率；不含职业与年龄曲线（docs/00 §7.3）。
  sourceGrowth: Stats;
  state: 'available' | 'claimed';
  recipientUnitId: string | null;
  mode: LegacyMode | null;
  createdAt: number;
}

export interface InheritanceContract {
  legacyId: string;
  targetLevel: number;
  initialTotal: number;
  sourceTotal: number;
  clippedTarget: number;
  caps: Stats;
  weights: Partial<Record<StatKey, number>>;
  cycle: 0 | 1;
}

export interface ReincarnationRecord {
  unitId: string;
  sourceCycle: 0;
  targetCycle: 1;
  baseStats: Stats;
  growthAllocation: Partial<Stats>;
  newAgeBaseDays: number;
}

// 传承资格（docs/00 §7.3）: 普通角色达到 15 级；主角与已接受过遗产的 B 不可作为来源。
export const LEGACY_MIN_LEVEL = 15;

export function totalStats(stats: Stats): number {
  return STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

export function eligibleForLegacy(unit: UnitRecord): boolean {
  return !unit.isProtagonist && unit.lineageDepth === 0 && unit.level >= LEGACY_MIN_LEVEL && unit.status !== 'dead';
}

// 来源的成长向量：个人基础 + 已记录装备／被动／传承偏移，排除职业与年龄曲线（docs/00 §7.3）。
export function sourceGrowthVector(unit: UnitRecord): Stats {
  const personal = CHARACTERS[unit.character].growth;
  const out = {} as Stats;
  for (const key of STAT_KEYS) out[key] = Math.max(0, personal[key] + (unit.growthAllocation?.[key] ?? 0));
  return out;
}

// 生成一份可用遗产；同一来源只生成一次（调用方用 source_unit_id UNIQUE 兜底）。
export function createLegacy(unit: UnitRecord, cause: LegacyCause, id: string, playerId: string): LegacyRecord {
  return {
    id, playerId, sourceUnitId: unit.id, sourceName: CHARACTERS[unit.character].name, sourceCharacter: unit.character,
    sourceLineageDepth: 0, cause,
    sourceLevel: unit.level, sourceStats: { ...unit.stats }, sourceGrowth: sourceGrowthVector(unit),
    state: 'available', recipientUnitId: null, mode: null, createdAt: Date.now(),
  };
}

// 数值保底下限 F(l) = S0 + ceil(max(0, target - S0) * (l - 1) / (Ld - 1))（docs/00 §7.3.1）。
export function numericFloor(level: number, initialTotal: number, target: number, sourceLevel: number): number {
  if (sourceLevel <= 1) return Math.max(initialTotal, target);
  const l = Math.max(1, Math.min(level, sourceLevel));
  return initialTotal + Math.ceil(Math.max(0, target - initialTotal) * (l - 1) / (sourceLevel - 1));
}

export interface InheritancePreview {
  sourceLevel: number;
  sourceTotal: number;
  initialTotal: number;
  capacity: number;
  clippedTarget: number;
  lost: number;
  caps: Stats;
  floors: { level: number; total: number }[];
}

// 接受前预览：来源总量、继承者上限、截断目标与每级下限（docs/00 §7.3.1）。
export function previewInheritance(legacy: LegacyRecord, recipient: UnitRecord): InheritancePreview {
  const caps = effectiveCaps(recipient);
  const capacity = totalStats(caps);
  const initialTotal = totalStats(recipient.stats);
  const sourceTotal = totalStats(legacy.sourceStats);
  const clippedTarget = Math.min(sourceTotal, capacity);
  const floors: { level: number; total: number }[] = [];
  for (let level = 1; level <= legacy.sourceLevel; level++) {
    floors.push({ level, total: numericFloor(level, initialTotal, clippedTarget, legacy.sourceLevel) });
  }
  return { sourceLevel: legacy.sourceLevel, sourceTotal, initialTotal, capacity, clippedTarget, lost: Math.max(0, sourceTotal - capacity), caps, floors };
}

export function canClaim(legacy: LegacyRecord, recipient: UnitRecord): string | null {
  if (legacy.state !== 'available') return '这份遗产已经被兑现';
  if (recipient.status !== 'active') return '继承者不在现役名册';
  if (recipient.lineageDepth !== 0) return '该角色已经接受过遗产，一生只能接受一次';
  if (recipient.level !== 1) return '首稿只允许新建的一级角色接受遗产';
  if (legacy.sourceUnitId === recipient.id) return '不能继承自己的遗产';
  return null;
}

// 逐点分配补点：正整数权重，当前“已分补点／权重”最小者优先，相同按 StatKey 顺序（docs/00 §7.3.1）。
export function distributeBackfill(bonus: number, weights: Partial<Record<StatKey, number>>, stats: Stats, caps: Stats): Partial<Stats> {
  const gains: Partial<Stats> = {};
  let left = bonus;
  while (left > 0) {
    let best: StatKey | null = null;
    let bestRatio = Infinity;
    for (const key of STAT_KEYS) {
      const weight = weights[key] ?? 0;
      if (weight <= 0) continue;
      if (stats[key] + (gains[key] ?? 0) >= caps[key]) continue;
      const ratio = (gains[key] ?? 0) / weight;
      if (ratio < bestRatio - 1e-9) { best = key; bestRatio = ratio; }
    }
    if (best === null) break;
    gains[best] = (gains[best] ?? 0) + 1;
    left--;
  }
  return gains;
}

// 每次升级后把总量补到当前等级下限；幂等，重复调用不会多发（docs/00 §7.3.1）。
export function applyInheritanceFloor(unit: UnitRecord): Partial<Stats> {
  const contract = unit.inheritance;
  if (!contract) return {};
  const floor = numericFloor(unit.level, contract.initialTotal, contract.clippedTarget, contract.targetLevel);
  const current = totalStats(unit.stats);
  if (current >= floor) return {};
  const gains = distributeBackfill(floor - current, contract.weights, unit.stats, contract.caps);
  for (const [key, gain] of Object.entries(gains) as [StatKey, number][]) {
    unit.stats[key] += gain;
    if (key === 'hp') unit.hp += gain;
  }
  return gains;
}

// 接受遗产：成长模式替换个人成长向量；数值模式记录逐级保底合同。两种模式共用血缘锁。
export function claimLegacy(legacy: LegacyRecord, recipient: UnitRecord, mode: LegacyMode, weights: Partial<Record<StatKey, number>> = {}): InheritanceContract {
  const problem = canClaim(legacy, recipient);
  if (problem) throw new Error(problem);
  if (mode === 'growth') {
    const personal = CHARACTERS[recipient.character].growth;
    const allocation: Partial<Stats> = {};
    for (const key of STAT_KEYS) {
      const offset = legacy.sourceGrowth[key] - personal[key];
      if (offset !== 0) allocation[key] = offset;
    }
    // 保留轮回已分配的 30 点，叠加在成长遗产之上（docs/00 §5.2）。
    for (const key of STAT_KEYS) {
      const add = recipient.growthAllocation?.[key] ?? 0;
      if (add !== 0) allocation[key] = (allocation[key] ?? 0) + add;
    }
    recipient.growthAllocation = allocation;
  }
  const caps = effectiveCaps(recipient);
  const initialTotal = totalStats(recipient.stats);
  const clippedTarget = Math.min(totalStats(legacy.sourceStats), totalStats(caps));
  const contract: InheritanceContract = {
    legacyId: legacy.id, targetLevel: legacy.sourceLevel, initialTotal, sourceTotal: totalStats(legacy.sourceStats),
    clippedTarget, caps: { ...caps }, weights: { ...weights }, cycle: recipient.cycle,
  };
  recipient.inheritance = contract;
  recipient.lineageDepth = 1;
  recipient.receivedLegacyId = legacy.id;
  legacy.state = 'claimed';
  legacy.recipientUnitId = recipient.id;
  legacy.mode = mode;
  return contract;
}

// 轮回归零：等级、经验、第一轮成长、药效与数值补点都清除，回到固定一级基准（docs/00 §5.2）。
export function reincarnationBase(character: UnitRecord['character'], classId: ClassId): Stats {
  const def = CHARACTERS[character];
  const cls = CLASSES[classId];
  const stats = {} as Stats;
  for (const key of STAT_KEYS) stats[key] = Math.min(cls.caps[key], def.base[key]);
  return stats;
}

export function canReincarnate(unit: UnitRecord): string | null {
  if (unit.isProtagonist) return '主角不能轮回';
  if (unit.cycle !== 0) return '每个角色一生只能轮回一次';
  if (unit.status !== 'active') return '只有存活且未锁定的角色可以轮回';
  if (unit.level < 99) return '必须达到 99 级才能轮回';
  if (unit.lockedRunId) return '远征中的角色不能轮回';
  return null;
}

export interface ReincarnationResult {
  record: ReincarnationRecord;
  baseStats: Stats;
  allocation: Partial<Stats>;
}

// 轮回：清技能学习、熟练度、职业资格与学习进度，回初始职业，年龄 16 岁，额外 30 点分配。
export function reincarnate(unit: UnitRecord, allocation: Partial<Stats>, initialClassId: ClassId, daysPerYear: number, day: number): ReincarnationResult {
  const problem = canReincarnate(unit);
  if (problem) throw new Error(problem);
  const total = STAT_KEYS.reduce((sum, key) => sum + Math.max(0, allocation[key] ?? 0), 0);
  if (total > 30) throw new Error('轮回成长分配最多 30 个百分点');
  for (const [key, value] of Object.entries(allocation) as [StatKey, number][]) {
    if (value < 0) throw new Error('轮回分配不能为负');
    if (value > 10) throw new Error(`单项分配上限为 10 个百分点（${key}）`);
  }
  const baseStats = reincarnationBase(unit.character, initialClassId);
  const record: ReincarnationRecord = {
    unitId: unit.id, sourceCycle: 0, targetCycle: 1, baseStats, growthAllocation: { ...allocation },
    newAgeBaseDays: 16 * daysPerYear,
  };
  unit.cycle = 1;
  unit.classId = initialClassId;
  unit.level = 1;
  unit.exp = 0;
  unit.stats = { ...baseStats };
  unit.hp = baseStats.hp;
  unit.growthLog = [];
  unit.drugCounts = {};
  unit.growthAllocation = { ...allocation };
  unit.classQualifications = [];
  unit.learningProgress = {};
  unit.weapons = [];
  unit.items = [];
  unit.ranks = {};
  unit.weaponExp = {};
  unit.promotedFrom = undefined;
  unit.inheritance = undefined;
  unit.ageBaseDays = record.newAgeBaseDays;
  unit.ageEpochDay = day;
  unit.baseAge = 16;
  unit.age = 16;
  unit.reincarnatedDay = day;
  return { record, baseStats, allocation };
}
