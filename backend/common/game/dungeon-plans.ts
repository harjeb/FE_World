import { nextU32, seedRng } from '../engine/rng.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { CLASSIC_MAPS } from './classic-catalog.ts';

export interface DungeonStage { scenarioId?: string; name: string }

export const CLASSIC_DUNGEON_IDS = ['clx-fe1', 'clx-fe2', 'clx-fe3', 'clx-fe6', 'clx-fe7', 'clx-fe8'] as const;

// Catalog order is stable: each of the twelve regions receives five finales.
// Planning owns its RNG so selecting a finale never advances combat randomness.
export function mixedDungeonStages(seed: string, region: number): DungeonStage[] {
  if (!Number.isInteger(region) || region < 1 || region > 12) throw new Error(`未知副本地区 ${region}`);
  const pool = CLASSIC_MAPS.filter((_, index) => index % 12 === region - 1);
  const rng = seedRng(`mixed-dungeon-finale:${region}:${seed}`);
  const finale = pool[nextU32(rng) % pool.length];
  return [
    { name: '外围突破' },
    { name: '深入据点' },
    { scenarioId: finale.id, name: finale.name },
  ];
}

// Reserve a party that can deploy on every subsequent map before starting a run.
export function mixedDungeonMaxUnits(stages: readonly DungeonStage[], generatedMax: number): number {
  return Math.min(generatedMax, ...stages.flatMap(stage =>
    stage.scenarioId ? [classicAdaptation(stage.scenarioId).deployment.max] : []));
}
