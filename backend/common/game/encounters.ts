import type { AiDifficulty } from '../engine/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import type { EncounterLayout } from '../maps/layouts.ts';
import type { Theme } from '../maps/themes.ts';
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
}

const PLANS = [
  { layout: 'skirmish', name: '交错遭遇', description: '紧凑战场，双方沿地形错位展开。', width: 18, height: 18, normal: 4, hard: 6, enemies: 3 },
  { layout: 'pincer', name: '分进合击', description: '队伍分为两路，沿隔开的通道推进，在中段会合；名单交替分配到两队。', width: 24, height: 22, normal: 6, hard: 8, enemies: 5 },
  { layout: 'convergence', name: '分散据点', description: '多支小队分散开局，沿据点与通道向战场中部汇合。', width: 24, height: 24, normal: 8, hard: 8, enemies: 6 },
] as const;
const THEMES: Theme[] = ['grassland', 'forest', 'mountain', 'town', 'grassland', 'city', 'mountain', 'mountain', 'grassland', 'mountain', 'palace', 'palace'];

// The same unspent day keeps the encounter fixed; combat rolls use a separate server-generated seed.
export function fieldEncounter(playerId: string, day: number, region: number, difficulty: AiDifficulty = 'normal', activity: 'field' | 'dungeon' = 'field'): FieldEncounter {
  const rng = seedRng(JSON.stringify(['field-encounter', playerId, day, region, activity]));
  const plan = PLANS[nextU32(rng) % PLANS.length];
  let theme = THEMES[(region - 1) % THEMES.length];
  if (activity === 'field' && (region === 4 || region === 5) && nextU32(rng) % 2) theme = region === 4 ? 'riverlands' : 'lakeland';
  const enemies = plan.enemies + (region > 4 ? 2 : 0);
  return {
    seed: `encounter-${Array.from({ length: 4 }, () => nextU32(rng).toString(16)).join('-')}`,
    layout: plan.layout, name: plan.name, description: plan.description, theme,
    width: plan.width, height: plan.height, maxUnits: plan[difficulty],
    enemyCount: enemies + (difficulty === 'hard' ? Math.ceil(enemies * HARD_ENEMY_RULES.extraRatio) : 0),
  };
}
