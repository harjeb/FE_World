// The personal calendar (docs/00 §2.1–2.2): 500 days a year, 125 days a season, 4 seasons. Time moves
// only when an action spends days; nothing is handed out by the wall clock.
//
// Display layer: every actual date is shown in the in-world 星辉历 era. Year 1 (internal, relative —
// all gameplay logic and indexes stay on it) renders as 星辉历 1001年1月1日. Each season (quarter) is
// split into 3 fictional months of 42/42/41 days, giving 12 months × ~42 days per 500-day year.
export const DAYS_PER_SEASON = 125;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

// 星辉历 display constants. ERA_BASE_YEAR maps internal year 1 → era year 1001; internal date.year
// itself is never shifted, so enemy interpolation, class-open years and saves stay untouched.
export const ERA_NAME = '星辉历';
export const ERA_BASE_YEAR = 1001;
export const MONTHS_PER_SEASON = 3;
export const MONTHS_PER_YEAR = MONTHS_PER_SEASON * SEASONS_PER_YEAR;
// Month lengths inside one season (quarter): 42 + 42 + 41 = 125.
export const MONTH_DAYS_PER_SEASON = [42, 42, 41] as const;
// Fictional month names, season-major order (3 per season). Flavor only; ids/lengths never change.
export const MONTH_NAMES = [
  '新月', '芽月', '风月',
  '雨月', '炎月', '辉月',
  '露月', '丰月', '霜月',
  '雾月', '雪月', '寂月',
] as const;

// Cumulative start offsets of the 3 months inside a season, derived from MONTH_DAYS_PER_SEASON.
const MONTH_STARTS = [0, MONTH_DAYS_PER_SEASON[0], MONTH_DAYS_PER_SEASON[0] + MONTH_DAYS_PER_SEASON[1]] as const;

// `星辉历 1001年1月1日` — the canonical era rendering shared by backend payloads and the frontend.
export function formatEraDate(date: Pick<CalendarDate, 'eraYear' | 'month' | 'monthDay'>): string {
  return `${ERA_NAME} ${date.eraYear}年${date.month}月${date.monthDay}日`;
}

// Arena days sit at the end of each game month, when the month-end snapshot is taken (docs/07).
export const ARENA_DAY_OF_MONTH = DAYS_PER_SEASON;
// The annual 大竞技场 window opens at the end of each year (docs/00 §9.4.2).
export const FESTIVAL_DAY = DAYS_PER_YEAR;

export interface CalendarDate {
  year: number; season: number; dayOfSeason: number; dayOfMonth: number;
  era: string; eraYear: number; month: number; monthDay: number; label: string;
}

export function dateOf(day: number): CalendarDate {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1;
  const withinYear = day % DAYS_PER_YEAR;
  const season = Math.floor(withinYear / DAYS_PER_SEASON) + 1;
  const dayOfSeason = (withinYear % DAYS_PER_SEASON) + 1;
  const dayOfMonth = (day % DAYS_PER_SEASON) + 1;
  const festival = dayOfMonth === ARENA_DAY_OF_MONTH;
  // Locate the fictional month within the season: 1–42 → 1st, 43–84 → 2nd, 85–125 → 3rd.
  let monthInSeason = MONTH_STARTS.length - 1;
  while (dayOfSeason - 1 < MONTH_STARTS[monthInSeason]) monthInSeason--;
  const month = (season - 1) * MONTHS_PER_SEASON + monthInSeason + 1;
  const monthDay = dayOfSeason - MONTH_STARTS[monthInSeason];
  return {
    year, season, dayOfSeason, dayOfMonth,
    era: ERA_NAME, eraYear: year + ERA_BASE_YEAR - 1, month, monthDay,
    label: `${formatEraDate({ eraYear: year + ERA_BASE_YEAR - 1, month, monthDay })}${festival ? ' · 竞技场日' : ''}`,
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
