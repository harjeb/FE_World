// Frozen rule/catalog identifiers for battles, activities, snapshots and replays.
// Bump these only with a migration note; old replays are never silently re-simulated under new rules.
export const ENGINE_VERSION = 1;
export const RULESET_VERSION = 'rules-v26';
// v65: new ordinary field enemies use level-based weapon ranks (E at Lv1, +1 every 12 levels).
// Commanders earn one extra rank; final hard levels, class caps and carried-weapon requirements apply.
// Template rank caps no longer become starting ranks. Other modes and frozen battles are unchanged.
// v64: new ordinary field commanders receive their class's weapon proficiency caps (S/SS/SSS).
// Only permitted weapon types change; equipment, mob/reserve ranks, fixed/quest/dungeon bosses,
// saved battles and combat formulas remain unchanged. Existing rank bonuses apply without stacking.
// v63: ordinary field commanders now use their own class template with 150% of normal effective
// growth before hard modifiers, replacing the v62 mob-stat maximum and flat bonuses. Class weaknesses
// remain; no guarantee of leading every stat. Level +4 and early promotions are unchanged.
// Fixed/quest/dungeon bosses, ordinary enemies, saved battles and combat rules are unchanged.
// v62: new ordinary field commanders use base level +4 (before hard bonuses), the highest
// attacking class stage allowed at that level, and at least each mob's stats plus HP6/other1.
// This brings promotions forward four levels; HP150 and level99 remain the limits. Quest/dungeon,
// classic/festival/fixed bosses and saved battle snapshots are unchanged. Combat rules do not change.
// v61: dungeon routes and all sixty classic maps use local scene names without source-work
// titles. New first-clear bundles guarantee quality equipment, stat boosters, elixirs, full meals
// and promotion seals; rewards no longer downgrade at low departure levels. Saved runs retain
// their frozen names and loot, and completion flags remain unchanged. Combat rules do not change.
// v57: story chapters, duels, companion missions, regional battles and tower/forbidden-land maps
// use contextual enemy identities. New battle snapshots freeze faction/role naming for initial units,
// scripted waves and hard reserves. Dialogue and duel previews share the actual combatant names;
// duel classes/levels and all combat rules remain unchanged. Existing battles/replays keep their names.
// v56: eight royal-capital investigations with server-gated background, testimony, pre-battle and
// post-battle scenes. Calendar openings also require preceding investigations; completed legacy
// chapters remain readable/replayable. Chapter eight fights a named transformed church leader after
// the eighth personal tournament ends (or day 4000 for nonentrants). Postgame challenge tower-3 keeps
// its reward keys and opens two further hard forbidden-land bosses. Existing battle snapshots,
// completed chapters, inventory IDs and claimed rewards are retained; no unit migration or rule change.
// v55 / rules-v26: every classic map explicitly audits its looting units and activation conditions.
// No default turn or assassin-class heuristic. Source thief waves read chapter turnBytes, not event
// indices, and match the catalog's original FE7 mode. FE3 waypoint scripts become latched position
// conditions (unwalkable source waypoints explicitly adapted). Reinforcements/reserves inherit gates;
// thieves open doors on the treasure route. Turn/area/object/flag and any/all conditions are frozen
// with the battle; activation warnings fire once. Explicit legacy thiefTurn is retained. Old replays
// remain terminal snapshots; existing saved battles do not receive new map configurations.
// v54 / rules-v25: C–S bonuses for all nine weapon types share the combat forecast,
// resolution, unit stats and healing formulas. SS/SSS retain S bonuses; only used weapons count.
// Ranks now require 0/50/200/600/1500/3000/5000/8000 cumulative XP; v3 unit migration
// preserves learned ranks and earned in-rank points from either original or v2 curves.
// New battles give 1 XP per actual strike (including misses, counters and follow-ups),
// or per utility spell/staff use. Catalog-53 battles retain 2/exchange; earlier retain 2/map.
// Older replays remain terminal snapshots; see docs/40-weapon-proficiency.md.
// rules-v24: thief looting is now a visible Fire Emblem-style three-step: the thief stays put until turn 3
// (thiefTurn), the player gets a scenario warning when it wakes, it steals into `carrying`, then flees to
// the nearest map edge and leaves for good; killing it drops the stolen item back to the player.
// rules-v23: classic-map thieves (original class thief/assassin) loot the nearest closed chest or idle
// village when the map has any, taking the item out of the player's haul. One-shot quest objects
// (once) are never stolen. Other enemies still cannot interact with objects; old battles are frozen.
// rules-v22: enemy AI follows Fire Emblem behaviour tables instead of a stronger search.
// 固守 units now strike anything already in reach without leaving their tile (bosses, armour);
// new battles give enemies a 5-cell 警戒半径 (7 on hard) so they hold position until a player unit
// enters it, instead of charging across the map on turn one. Enemies also take a losing-but-safe
// exchange when they can deal damage and will not die. Old battles have no radius and stay unrestricted.
// v53: Fire Emblem-inspired cumulative WEXP costs 50/60/70/80/90/100/110 per rank.
// normalizeUnit migrates each old unit once, keeping learned ranks and points within the rank.
// New battles grant 2 WEXP per actual exchange/cast/staff use; unopened counters grant none,
// multi-hit/area effects do not multiply a single paid use. Active pre-v53 battles keep old rewards.
// Combat simulation and saved replays are unchanged; see docs/40-weapon-proficiency.md.
// v52 / rules-v21: grouped camp training opens 1/3/5/8 slots by year, with shared three-day
// duration and per-person payment; E→D needs 50 XP. New setup companions use stage-one classes.
// Human promotion can target any qualified class. Flying movement is 7 at every stage;
// stage-three+ non-armored foot/mounted movement is 6/7. Dragon weapons and arts are melee.
// Early random encounters scale to the available roster and chapter (3–5 enemies); dispersed
// layouts require eight available units. Existing learned ranks/stats and frozen encounters survive;
// previous-rule replays retain their terminal snapshots instead of being re-simulated.
// v51: fixed companions' nine-stat personal growth totals are 250–270. On load,
// exact legacy templates on fixed companion IDs adopt the new personal growth only;
// earned stats, inheritance, random recruits, protagonist and frozen battles/replays stay intact.
// v50 / rules-v20: protagonist turn-start damage/speed aura and Lv60 desperation;
// mastery gains halved, stage 0/1 classes grant no new mastery; weapon training is 1 XP/day.
// Existing learned skills and attributes survive; unsold shop stock is capped at three.
// Existing battle snapshots do not receive the new personal skill; old replays remain frozen.
// v49 / rules-v19: 72 regional materials, six grades per herb/mineral/timber category, and five
// canonical weapon material tiers. New field/run/dispatch rewards freeze at departure; legacy records
// without loot fields use their former payouts. Existing inventory IDs and production outputs survive.
// Generic enemy equipment (including scripted reinforcements) now follows level; finish active battles/runs
// and back up before deployment. Old replays stay frozen. Completed reward claims are never reset.
// v48: bounty quests (bounty-*, no acceptance, auto-counted kills by class route, wins and dungeon clears, handed in with
// CLAIM_QUEST_REWARD) and a server-built quest board of four to seven main/side quests. New flag flags.questProgress.
// v47: reputation shops sell a few advanced items only (rank C+ gear, growth potions, elixir), four per region per season with a
// per-item season limit (flags.regionShopBought); rank E/D gear moves to a rotating capital quartermaster (eight a season).
// New games start with 1,500 gold instead of 13,120; test fixtures keep the old amount.
// v46: advanced capital shop items open by year (elixir, full meal and the six growth potions from day 500, the
// immortal shield from day 1000); elixir and antidote join the shop. Growth potions also drop from region core quests (-8),
// story tasks, companion quests and a quarter of the plain classic chests. No flags; old saves gain shop rows through ensureShopRows.
// v45 / rules-v18: attack risk is measured against staying put, so ranged units can step back
// and shoot without a counter even when both positions can be chased next turn. Equal landings favor shorter moves.
// Hold, guard, status and movement rules are unchanged. Finish active battles/runs and back up before deployment;
// previous-rule replays keep their frozen snapshots and are never re-simulated with the new AI.
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
export const CATALOG_VERSION = 65;
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
