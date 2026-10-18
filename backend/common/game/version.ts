// Frozen rule/catalog identifiers for battles, activities, snapshots and replays.
// Bump these only with a migration note; old replays are never silently re-simulated under new rules.
export const ENGINE_VERSION = 1;
export const RULESET_VERSION = 'rules-v4';
// v14 / rules-v4: instance-bound equipment arts, refinement and complete baseline template IDs.
// Preserve historical snapshots/replays; do not silently re-simulate with new grants.
export const CATALOG_VERSION = 14;
export const REPLAY_COMPATIBLE_ENGINES = [1] as const;

export interface VersionedBattle {
  engineVersion?: number;
  rulesetVersion?: string;
  catalogVersion?: number;
}

export function replayCompatibility(battle: VersionedBattle): { compatible: boolean; reason: string | null } {
  const engine = battle.engineVersion ?? 1;
  if (!REPLAY_COMPATIBLE_ENGINES.includes(engine as 1)) return { compatible: false, reason: `旧引擎版本 ${engine}，只能查看终局快照` };
  if ((battle.rulesetVersion ?? 'rules-v1') !== RULESET_VERSION) return { compatible: false, reason: `规则版本 ${battle.rulesetVersion ?? 'rules-v1'} 与当前 ${RULESET_VERSION} 不同` };
  return { compatible: true, reason: null };
}
