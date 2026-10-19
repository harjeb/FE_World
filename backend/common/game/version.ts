// Frozen rule/catalog identifiers for battles, activities, snapshots and replays.
// Bump these only with a migration note; old replays are never silently re-simulated under new rules.
export const ENGINE_VERSION = 1;
export const RULESET_VERSION = 'rules-v7';
// v17 / rules-v7: special equipment effects (magic weapons, poison, backlash, reaver, purify, guard and
// avoid/res bonuses, multi-rank requirements), per-cast book charges for follow-ups and counters, spell
// effects (defense stat, fixed hits, drain, status hit rolls, buffs, area heals) and spellbook items.
// v16 / rules-v6: explicit classic-art mechanics, shared probabilistic forecast and strike resolution.
// Finish active runs/battles before deployment; prior replays remain frozen only.
// v18: twelve equal-budget regional reputation routes; classic rewards no longer add regional reputation.
// v19: direct protagonist allocation, fixed commoner/growth and modest production starting kits.
// v20: world-map pioneering (GET_WORLD_MAP/CHOOSE_ROUTE): regions unlock along chosen routes only;
// the central shop narrows to rank-E basics plus usual consumables, advanced weapons move to the
// regional reputation shops.
// v21: protagonist keeps the former default base stats plus 10 bonus points, at most 5 per stat.
// Only new setups change; existing units and frozen history retain their saved stats and growth.
// v22：十二地区探索度保存于 flags.regionExploration（0–100，新账号为0）；野外胜利+3、
// 单图任务完成+5、每个副本（含多图任务）仅首次完整通关+20，不叠加、不计中间图或重刷。
// 缺失字段的旧档惰性初始化，仅此前已讨伐地区设100；已有进度不再回填，已开通地区访问权、
// clearedRegions、养成与冻结历史保留。探索满100才可选择相邻新路线，初选1–4仍自由。
export const CATALOG_VERSION = 22;
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
