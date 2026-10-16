import type { Stats } from './types.ts';

// 成长类型与年龄修正（docs/02「成长类型与年龄」）:
// 早熟型前期涨得快、后期停滞；晚成型相反；通常型平稳；成长型稀有，各年龄段都 +5。
// 修正是加在「个人成长率 + 职业成长率」上的全属性百分比偏移，与等级无关。
export type GrowthType = 'early' | 'normal' | 'late' | 'growth';

export const GROWTH_TYPE_NAMES: Record<GrowthType, string> = {
  early: '早熟型', normal: '通常型', late: '晚成型', growth: '成长型',
};

export const GROWTH_TYPE_NOTES: Record<GrowthType, string> = {
  early: '12–30 岁全属性成长率 +5，48–66 岁 −5',
  normal: '各年龄段都没有成长率修正',
  late: '12–30 岁全属性成长率 −5，48–66 岁 +5',
  growth: '稀有：所有年龄段全属性成长率 +5',
};

export interface AgeBand { id: string; name: string; min: number; max: number }

// 年龄段（左闭右开）: [12,30)、[30,48)、[48,66)。范围外仅成长型保留 +5。
export const AGE_BANDS: AgeBand[] = [
  { id: '12-30', name: '12–30 岁', min: 12, max: 30 },
  { id: '30-48', name: '30–48 岁', min: 30, max: 48 },
  { id: '48-66', name: '48–66 岁', min: 48, max: 66 },
];

// Per-band all-stat growth bonus, in percentage points, indexed like AGE_BANDS.
export const GROWTH_BONUS: Record<GrowthType, number[]> = {
  early: [5, 0, -5],
  normal: [0, 0, 0],
  late: [-5, 0, 5],
  growth: [5, 5, 5],
};

export function ageBandIndex(age: number): number {
  return AGE_BANDS.findIndex(band => age >= band.min && age < band.max);
}

export function ageBandOf(age: number): AgeBand | null {
  const index = ageBandIndex(age);
  return index < 0 ? null : AGE_BANDS[index];
}

// 成长型全年龄 +5；其他类型仅在对应年龄段生效。
export function growthBonus(growthType: GrowthType, age: number): number {
  if (growthType === 'growth') return 5;
  const index = ageBandIndex(age);
  return index < 0 ? 0 : GROWTH_BONUS[growthType][index];
}

// Applies the age/growth-type offset to a rate table, clamped at 0 like the rest of growth.
export function applyGrowthBonus(rates: Stats, growthType: GrowthType, age: number): Stats {
  const bonus = growthBonus(growthType, age);
  if (bonus === 0) return rates;
  const out = {} as Stats;
  for (const key of Object.keys(rates) as (keyof Stats)[]) out[key] = Math.max(0, rates[key] + bonus);
  return out;
}

// 随机招募的成长类型分布（docs/02）: 成长型 5%，其余按 早熟 25% / 通常 45% / 晚成 25%。
export const GROWTH_TYPE_WEIGHTS: [GrowthType, number][] = [
  ['growth', 5], ['early', 25], ['normal', 45], ['late', 25],
];

export function rollGrowthType(roll0to99: number): GrowthType {
  let acc = 0;
  for (const [type, weight] of GROWTH_TYPE_WEIGHTS) {
    acc += weight;
    if (roll0to99 < acc) return type;
  }
  return 'normal';
}

// 随机招募年龄（docs/00 §3.4）：最低 12 岁，固定类型不变；有转折的曲线尽量在剩余主线内跨过转折。
export const RECRUIT_AGE_RANGE: [number, number] = [12, 45];
export const MAINLINE_YEARS = 8;
// 当前曲线在两个年龄段之间的转折年龄（旧试算 30／48，待重新校准）。
export const CURVE_TRANSITIONS = [30, 48];

// 能在剩余主线年份内跨过一个转折的合法年龄候选；平稳曲线（通常／成长）不强行制造转折。
export function recruitAgeCandidates(growthType: GrowthType, remainingYears: number): number[] {
  if (growthType === 'normal' || growthType === 'growth') return [];
  const [min, max] = RECRUIT_AGE_RANGE;
  const out: number[] = [];
  for (let age = min; age <= max; age++) {
    if (CURVE_TRANSITIONS.some(t => age < t && age + Math.max(0, remainingYears) >= t)) out.push(age);
  }
  return out;
}

// 确定性抽取招募年龄：先定类型，再优先从能跨转折的候选里取；没有候选时按内部兜底均匀取。
export function rollRecruitAge(growthType: GrowthType, remainingYears: number, roll0to99: number): number {
  const candidates = recruitAgeCandidates(growthType, remainingYears);
  if (candidates.length > 0) return candidates[Math.abs(roll0to99) % candidates.length];
  const [min, max] = RECRUIT_AGE_RANGE;
  return min + (Math.abs(roll0to99) % (max - min + 1));
}
