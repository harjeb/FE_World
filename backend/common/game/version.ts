// Frozen rule/catalog identifiers for battles, activities, snapshots and replays.
// Bump these only with a migration note; old replays are never silently re-simulated under new rules.
export const ENGINE_VERSION = 1;
export const RULESET_VERSION = 'rules-v7';
// v17 / rules-v7: special equipment effects (magic weapons, poison, backlash, reaver, purify, guard and
// avoid/res bonuses, multi-rank requirements) and per-cast book charges for follow-ups and counters.
// v16 / rules-v6: explicit classic-art mechanics, shared probabilistic forecast and strike resolution.
// Finish active runs/battles before deployment; prior replays remain frozen only.
export const CATALOG_VERSION = 17;
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
