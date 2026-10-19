import { REGION_EXPLORATION_MAX } from '@common/game/region-map.ts';
import type { WorldMapNode } from '@common/game/region-map.ts';

export function RegionExploration({ region }: { region: WorldMapNode }) {
  return (
    <span className="region-exploration">
      <span><span className="region-exploration-label">探索度 </span><b className="num">{region.exploration} / {REGION_EXPLORATION_MAX}</b></span>
      <progress value={region.exploration} max={REGION_EXPLORATION_MAX} aria-label={`${region.name}探索度`} />
    </span>
  );
}
