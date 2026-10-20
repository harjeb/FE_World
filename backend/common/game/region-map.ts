import { REGIONS } from './calendar.ts';

export type RegionMapStatus = 'locked' | 'available' | 'unlocked' | 'cleared';
export interface WorldMapNode {
  id: number; name: string; resource: string; offset: number;
  x: number; y: number; state: RegionMapStatus; exploration: number;
}
export interface WorldMapView {
  capital: { id: 0; name: string; x: number; y: number };
  nodes: WorldMapNode[];
  edges: readonly (readonly [number, number])[];
  unlockedRegions: number[];
  selectableRegions: number[];
}
export type FeatureKey = 'field' | 'dungeon' | 'dispatch' | 'quests' | 'tower' | 'workshop'
  | 'tavern' | 'arena' | 'annual' | 'story' | 'legacy' | 'reports' | 'spectate';
export type FeatureAccess = Record<FeatureKey, boolean>;

// 与设计世界地图共用四条放射路线及内／中环道路；0只代表王都，不是可讨伐地区。
export const WORLD_EDGES = [
  [0, 1], [1, 5], [5, 9], [0, 2], [2, 6], [6, 10],
  [0, 3], [3, 7], [7, 11], [0, 4], [4, 8], [8, 12],
  [1, 2], [2, 4], [4, 3], [3, 1], [5, 6], [6, 8], [8, 7], [7, 5],
] as const;
export const POSITIONS: Record<number, readonly [number, number]> = {
  1: [35, 63], 5: [23, 76], 9: [10, 90],
  2: [35, 37], 6: [23, 24], 10: [10, 10],
  3: [65, 63], 7: [78, 76], 11: [90, 90],
  4: [65, 37], 8: [78, 24], 12: [90, 10],
};
export const REGION_EXPLORATION_MAX = 100;
export const REGION_EXPLORATION_GAIN = { field: 3, quest: 5, dungeon: 20 } as const;
export interface RegionProgress {
  unlockedRegions?: readonly number[];
  clearedRegions: readonly number[];
  regionExploration?: Readonly<Record<number, number>>;
}
export function explorationOf(progress: RegionProgress, region: number): number {
  return Math.max(0, Math.min(REGION_EXPLORATION_MAX, progress.regionExploration?.[region] ?? 0));
}
export function normalizeRegions(ids: readonly number[]): number[] {
  return [...new Set(ids)].filter(id => Number.isInteger(id) && id >= 1 && id <= 12).sort((a, b) => a - b);
}
export function unlockedRegions(progress: RegionProgress): number[] {
  return normalizeRegions([...(progress.unlockedRegions ?? []), ...progress.clearedRegions]);
}
export function routeCandidates(progress: RegionProgress): number[] {
  const open = unlockedRegions(progress);
  if (!open.length) return [1, 2, 3, 4];
  const explored = new Set(open.filter(id => explorationOf(progress, id) >= REGION_EXPLORATION_MAX));
  return normalizeRegions(WORLD_EDGES.flatMap(([from, to]) => [
    ...(explored.has(from) ? [to] : []), ...(explored.has(to) ? [from] : []),
  ])).filter(id => !open.includes(id));
}
export function worldMap(progress: RegionProgress): WorldMapView {
  const open = unlockedRegions(progress);
  const selectable = routeCandidates(progress);
  return {
    capital: { id: 0, name: '王都', x: 50, y: 50 }, edges: WORLD_EDGES,
    unlockedRegions: open, selectableRegions: selectable,
    nodes: REGIONS.map(region => ({ ...region, x: POSITIONS[region.id][0], y: POSITIONS[region.id][1],
      exploration: explorationOf(progress, region.id),
      state: progress.clearedRegions.includes(region.id) ? 'cleared' : open.includes(region.id) ? 'unlocked'
        : selectable.includes(region.id) ? 'available' : 'locked' })),
  };
}
