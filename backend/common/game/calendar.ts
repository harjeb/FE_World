// The personal calendar (docs/00 §2.1–2.2): 500 days a year, 125 days a season, 4 seasons. Time moves
// only when an action spends days; nothing is handed out by the wall clock.

export const DAYS_PER_SEASON = 125;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

// Arena days sit at the end of each game month, when the month-end snapshot is taken (docs/07).
export const ARENA_DAY_OF_MONTH = DAYS_PER_SEASON;
// The annual 大竞技场 window opens at the end of each year (docs/00 §9.4.2).
export const FESTIVAL_DAY = DAYS_PER_YEAR;

export interface CalendarDate { year: number; season: number; dayOfSeason: number; dayOfMonth: number; label: string }

export function dateOf(day: number): CalendarDate {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1;
  const withinYear = day % DAYS_PER_YEAR;
  const season = Math.floor(withinYear / DAYS_PER_SEASON) + 1;
  const dayOfSeason = (withinYear % DAYS_PER_SEASON) + 1;
  const dayOfMonth = (day % DAYS_PER_SEASON) + 1;
  const festival = dayOfMonth === ARENA_DAY_OF_MONTH;
  return {
    year, season, dayOfSeason, dayOfMonth,
    label: `第 ${year} 年 · 第 ${season} 季 · 第 ${dayOfSeason} 日${festival ? ' · 竞技场日' : ''}`,
  };
}

export function isArenaDay(day: number): boolean {
  return (day % DAYS_PER_SEASON) + 1 === ARENA_DAY_OF_MONTH;
}

// The first arena day strictly after `day`.
export function nextArenaDay(day: number): number {
  const remainder = (day % DAYS_PER_SEASON) + 1;
  return remainder < ARENA_DAY_OF_MONTH
    ? day + (ARENA_DAY_OF_MONTH - remainder)
    : day + (DAYS_PER_SEASON - remainder + ARENA_DAY_OF_MONTH);
}

export function nextMonthStart(day: number): number {
  return (Math.floor(day / DAYS_PER_SEASON) + 1) * DAYS_PER_SEASON;
}

// Action costs, docs/00 §9.1 (draft numbers, kept in one place so a balance pass is a one-line change).
export const ACTION_DAYS = {
  sortie: 8,
  dungeon: 24,
  festivalMatch: 2,
  arenaMatch: 1,
  sweep: 5,
  recruit: 4,
  train: 3,
  plant: 1,
} as const;

// 十二地区 (docs/00 §8.1.1). δ is the region offset used by the dynamic-level formula. Names follow a
// Western-fantasy naming scheme (transliterated proper noun + terrain); ids never change.
export interface RegionDef { id: number; name: string; offset: 0 | 1 | 2; resource: string }

export const REGIONS: RegionDef[] = [
  { id: 1, name: '奥伦平原', offset: 0, resource: '药草' },
  { id: 2, name: '希尔瓦林地', offset: 0, resource: '木材' },
  { id: 3, name: '托尔加丘陵', offset: 1, resource: '矿石' },
  { id: 4, name: '瓦恩要塞', offset: 1, resource: '特效配方' },
  { id: 5, name: '莱斯米尔湖镇', offset: 0, resource: '恢复配方' },
  { id: 6, name: '泽拉斯古都', offset: 1, resource: '元素材料' },
  { id: 7, name: '巴尔格山岭', offset: 1, resource: '兽石材料' },
  { id: 8, name: '斯凯恩风崖', offset: 1, resource: '轻金属' },
  { id: 9, name: '萨鲁恩荒原', offset: 2, resource: '锻造材料' },
  { id: 10, name: '德拉克莫龙谷', offset: 2, resource: '龙石材料' },
  { id: 11, name: '莫尔达王陵', offset: 2, resource: '仪式材料' },
  { id: 12, name: '赛勒斯汀之门', offset: 2, resource: '轮回线索' },
];

// 各年末培养目标：前期快、后期慢；敌军按日期插值，不读取队伍等级。
export const ENEMY_YEAR_LEVELS = [1, 20, 35, 47, 57, 66, 74, 81, 87] as const;
export function enemyLevel(day: number, offset = 0): number {
  const elapsed = Math.max(0, day) / DAYS_PER_YEAR;
  const year = Math.floor(elapsed);
  const last = ENEMY_YEAR_LEVELS.length - 1;
  const level = year >= last
    ? ENEMY_YEAR_LEVELS[last] + Math.floor((elapsed - last) * 4)
    : ENEMY_YEAR_LEVELS[year] + Math.floor((ENEMY_YEAR_LEVELS[year + 1] - ENEMY_YEAR_LEVELS[year]) * (elapsed - year));
  return Math.max(1, Math.min(95, level + offset));
}

// 保留旧的讨伐数曲线供资源与旧招募使用，不再决定敌军等级。
export function baseLevel(cleared: number): number {
  return Math.min(93, 5 + 8 * cleared);
}

export function regionLevel(cleared: number, offset: number): number {
  return Math.max(1, Math.min(95, baseLevel(cleared) + offset));
}

export function encounterLevel(cleared: number, offset: number, encounterOffset: number): number {
  return Math.max(1, Math.min(99, regionLevel(cleared, offset) + encounterOffset));
}

// Deterministic per-encounter offset in −2…+2, so re-opening the same offer does not reroll it.
export function encounterOffset(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return (h % 5) - 2;
}

export function regionById(id: number): RegionDef {
  const region = REGIONS.find(r => r.id === id);
  if (!region) throw new Error(`没有地区 ${id}`);
  return region;
}
