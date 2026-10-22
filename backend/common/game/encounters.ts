import type { AiDifficulty } from '../engine/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import type { EncounterLayout } from '../maps/layouts.ts';
import type { Theme } from '../maps/themes.ts';
import { chapterOpenDay, STORY_CHAPTERS } from './story.ts';
import { HARD_ENEMY_RULES } from './enemies.ts';

export interface FieldEncounter {
  seed: string;
  layout: EncounterLayout;
  name: string;
  description: string;
  theme: Theme;
  width: number;
  height: number;
  maxUnits: number;
  enemyCount: number;
  // Missing in saved encounters means the original 20-turn battle without timed waves.
  turnLimit?: number;
  reinforcements?: { turn: number; count: number }[];
}

const PLANS = [
  { layout: 'skirmish', name: '交错遭遇', description: '紧凑战场，双方沿地形错位展开。', width: 18, height: 18, normal: 4, hard: 6, enemies: 3 },
  { layout: 'pincer', name: '分进合击', description: '队伍分为两路，沿隔开的通道推进，在中段会合；名单交替分配到两队。', width: 24, height: 22, normal: 6, hard: 8, enemies: 5 },
  { layout: 'convergence', name: '分散据点', description: '多支小队分散开局，沿据点与通道向战场中部汇合。', width: 24, height: 24, normal: 8, hard: 8, enemies: 6 },
] as const;
const THEMES: Theme[] = ['grassland', 'forest', 'mountain', 'town', 'grassland', 'city', 'mountain', 'mountain', 'grassland', 'mountain', 'palace', 'palace'];

// Retain early deployment limits and the dungeon's original enemy scale.
// Ordinary fields use their separate chapter-scaled army and wave plan below.
const EARLY_MAX_UNITS = { skirmish: 4, pincer: 5, convergence: 5 } as const;
const EARLY_ENEMY_RANGE = [3, 5] as const;
// 分散布局需要两路／多路出生点：少于 8 人可出战时不启用；前期上限本身 < 8，
// 因此前期（含首战）一律集中出生，中后期仅在显式传入可出战人数且 < 8 时才集中。
const CONVERGENCE_MIN_UNITS = 8;
const SCALING_CHAPTER = 3;

function earlyProgress(day: number, chapter?: number): number {
  if (chapter !== undefined) return chapter >= 1 && chapter <= SCALING_CHAPTER ? Math.min(chapter, SCALING_CHAPTER) : SCALING_CHAPTER;
  if (day >= chapterOpenDay(SCALING_CHAPTER)) return SCALING_CHAPTER;
  if (day >= chapterOpenDay(2)) return 2;
  return 1;
}

// The same unspent day keeps the encounter fixed; combat rolls use a separate server-generated seed.
// availableUnits is the available roster, so choosing fewer units cannot reroll a smaller army.
// Chapter defaults to calendar progress; field armies grow independently of the selected team.
export function fieldEncounter(playerId: string, day: number, region: number, difficulty: AiDifficulty = 'normal',
  activity: 'field' | 'dungeon' = 'field', availableUnits?: number, chapter?: number): FieldEncounter {
  const rng = seedRng(JSON.stringify(['field-encounter', playerId, day, region, activity]));
  const plan = PLANS[nextU32(rng) % PLANS.length];
  let theme = THEMES[(region - 1) % THEMES.length];
  if (activity === 'field' && (region === 4 || region === 5) && nextU32(rng) % 2) theme = region === 4 ? 'riverlands' : 'lakeland';
  const early = earlyProgress(day, chapter);
  const earlyPhase = early < SCALING_CHAPTER;
  // 布局门控：分散布局（分进合击／分散据点）需要两路或多路出生点，
  // 前期一律集中出生；中后期只有明确知道可出战人数不足 8 时才退回集中。
  const gate = plan.layout !== 'skirmish' && (earlyPhase || (availableUnits !== undefined && availableUnits < CONVERGENCE_MIN_UNITS));
  const effective = gate ? PLANS[0] : plan;
  const enemies = effective.enemies + (region > 4 ? 2 : 0);
  // 出战上限永不高于可出战人数；前期另压到 3–5，中后期保持各图原值。
  const maxUnits = Math.max(1, Math.min(effective[difficulty], availableUnits ?? effective[difficulty], earlyPhase ? EARLY_MAX_UNITS[effective.layout] : effective[difficulty]));
  let baseEnemies = earlyPhase
    ? Math.max(EARLY_ENEMY_RANGE[0], Math.min(EARLY_ENEMY_RANGE[1], (availableUnits ?? enemies) + (early - 1) + (region > 4 ? 1 : 0)))
    : enemies;
  const scale = (count: number) => count + (difficulty === 'hard' ? Math.ceil(count * HARD_ENEMY_RULES.extraRatio) : 0);
  let width: number = effective.width, height: number = effective.height;
  let field: Pick<FieldEncounter, 'turnLimit' | 'reinforcements'> = {};
  if (activity === 'field') {
    const progress = Math.max(1, Math.min(STORY_CHAPTERS, chapter ?? Array.from({ length: STORY_CHAPTERS }, (_, i) => i + 1)
      .filter(n => day >= chapterOpenDay(n)).length));
    const normalMax = Math.max(1, Math.min(effective.normal, availableUnits ?? effective.normal,
      earlyPhase ? EARLY_MAX_UNITS[effective.layout] : effective.normal));
    const armyRng = seedRng(JSON.stringify(['field-army', playerId, day, region]));
    // shortcut: crowded hard phases can take several seconds; optimize AI candidates if this latency is unacceptable.
    baseEnemies = 2 * Math.max(4, normalMax) + 3 * (progress - 1) + nextU32(armyRng) % 5 - 2;
    field = {
      turnLimit: 20 + 2 * (progress - 1),
      reinforcements: Array.from({ length: Math.floor((progress - 1) / 2) }, (_, i) => ({
        turn: 5 + 4 * i, count: scale(Math.max(2, normalMax + nextU32(armyRng) % 3 - 1)),
      })),
    };
    if (progress >= 3) { width = Math.max(width, 24); height = Math.max(height, 24); }
    if (progress >= 6) { width = Math.max(width, 28); height = Math.max(height, 28); }
  }
  const enemyCount = activity === 'field' ? scale(baseEnemies) : earlyPhase ? Math.min(EARLY_ENEMY_RANGE[1], scale(baseEnemies)) : scale(baseEnemies);
  return {
    seed: `encounter-${Array.from({ length: 4 }, () => nextU32(rng).toString(16)).join('-')}`,
    layout: effective.layout, name: effective.name, description: effective.description, theme,
    width, height, maxUnits, enemyCount, ...field,
  };
}
