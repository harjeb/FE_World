// Frozen rule/catalog identifiers for battles, activities, snapshots and replays.
// Bump these only with a migration note; old replays are never silently re-simulated under new rules.
export const ENGINE_VERSION = 1;
export const RULESET_VERSION = 'rules-v17';
// v44: preliminary story task rewards are per task (potions, elixirs, antidotes, weapons, a little gold). New battle
// consumables elixir (full heal) and antidote (cures art-inflicted poison); additive, existing battles and replays are unchanged.
// v43: new three-map dungeon runs cost 3/3/2 days (eight total), frozen in stageDayCosts.
// Existing runs retain their saved per-map costs (or the legacy eight-day default); no dates are refunded.
// Battle rules and old replays are unchanged.
// v40: story duel opponents are random people built from the roster's highest level (+1/+1/+2) with a random
// class of the same tier (stage) as the duelist's, drawn from available human classes that can attack. START_STORY_DUEL needs no new flags; battles already started are unchanged.
// v42: preliminary story tasks pay a reward when they complete (gold by kind and chapter; duels also give shared
// experience and two potions). No new flags: payment happens in the same call that marks the task done.
// v41 / rules-v17: generic enemy classes unlock at Lv1/20/47/66/81; classic openings and
// reinforcements downgrade along their route, relocating illegal ground spawns. Names describe factions.
// Ordinary field sorties cost two days; dungeon and fixed cross-time costs are unchanged.
// Class qualifications require any permitted weapon at D/C/B/A/S by stage; current/home entry stays valid.
// Daggers use sword proficiency; old ranks/experience merge on load, keeping the higher of each.
// Existing qualifications, equipment and frozen snapshots stay intact. Finish active battles/runs/dispatches
// and back up before deployment; previous-rule replays remain frozen.
// v38: the two preliminary tasks per chapter now vary by chapter (dispatch, hand-in, dungeon-chest quest item,
// duel, arena wins, tavern wins). New key items story_find_2/4/6/8 and chest overlays gated by chapter
// (secret.chapter), START_STORY_DUEL, flags.storyProgress. Existing saves keep storyStepsDone as is.
// v36: each main chapter chains a dispatch task, a material hand-in and then the finale battle
// (COMPLETE_STORY_STEP, flags.storyStepsDone). Saves whose chapter was already marked complete are not gated.
// v35: main story quests (story-1..8, region 0, chapter-gated), companion quests for the fixed region
// recruits, eight story clue key items, and a festival discount on the capital monthly shop.
// Story maps reuse classic adaptations with quest-scoped object overlays; existing battles are unchanged.
// v34 / rules-v16: fixed cross-time dungeon, persisted group alerts and 17 personal traits.
// Each probabilistic trait rolls once per exchange; forecasts expose weighted branches.
// Recruitment and first-clear flags are account-wide; prior saves default to no unlocks.
// Finish active battles/runs and back up before deployment; older replays stay frozen.
// v33 / rules-v15: only HP retains a stat cap (150); the other eight caps are JSON null.
// Existing stats stay unchanged; old numeric inheritance targets use their saved source total.
// Apollo's lightshot doubles opening full-HP bow skill for the exchange; personalSkill overrides
// the portrait skill in saved units and snapshots. Cross-time dungeon/recruitment follows separately.
// Finish active battles/runs before deployment; previous-rule replays keep their frozen snapshots.
// v31: frozen mixed dungeon plans, six three-map classic dungeons, and difficulty-specific first-clear bundles.
// Legacy runs retain their sequence; matching completed difficulty prevents retroactive grants.
// Legacy questsDone blocks normal rewards only; exploration/manual quest rewards remain once overall.
// v30 (historical): fixed equipment/items for a dungeon's first full clear; normal/hard shared eligibility.
// Existing completion evidence stays authoritative, without retroactive grants or combat replay changes.
// v29 / rules-v14: map-designed encounter formations and difficulty-specific deployment caps.
// Encounters are fixed for the unspent departure day; reduced parties no longer shrink the enemy army.
// Existing boards/runs and replay snapshots retain their saved deployments; finish active runs before upgrade.
// v28 / rules-v13: normal wild victories and complete dungeon clears unlock only their own hard modes.
// Existing normal completion records backfill unlocks once; single-map quests remain normal-only.
// Saved active hard runs may finish, and old replays keep their frozen rules.
// v27 / rules-v12: hard formations and reinforcement waves grow by 50% where legal space permits;
// separately seeded levels, every non-move stat and equipment improve once at creation.
// Existing saved units are not rerolled; finish active battles/runs before deploying. Old replays stay frozen.
// v26 / rules-v11: newly created hard enemies (including reinforcements) get capped HP/str/mag bonuses.
// Existing saved units are never rebuffed; finish active battles/runs before deploying. Old replays stay frozen.
// v25 / rules-v10: opt-in hard AI for field/quest/dungeon battles; difficulty is frozen in battle/run.
// Old records default to normal. No stat, reward or calendar changes; arenas stay on normal AI.
// Normal now coordinates focus fire and actor order; hard searches three-action continuations
// with independent simulated rolls, including occupancy and broken ice. Real RNG is never peeked.
// v24 / rules-v9: healing AI follows the front, chooses safer healing positions and can cast healing
// books. New generic/classic units keep their healing role; explicit saved behaviors are unchanged.
// Existing replays stay frozen; finish active battles/runs before deploying the changed AI.
// v23 / rules-v8: new battles freeze the departure season; winter plain/water become snow/ice.
// Armored movement breaks ice persistently. Existing boards are not repainted; old replays stay frozen.
// Riverlands/lakeland are additional field layouts in regions 4/5; no player progression is migrated.
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
// v32: hidden content, only inside the fixed FE6/FE7 classic routes and once per account
// (flags.secretsClaimed, banked on a full clear). In clx-fe6 one silver-lance chest holds the key item
// old_map (unsellable, warehouse-only; quests may require holding it). clx-fe7's first map gains a
// secret room whose three chests roll gear one rank above the best purchasable rank at battle creation.
// Existing battles keep their frozen objects; no saves are migrated.
export const CATALOG_VERSION = 44;
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
