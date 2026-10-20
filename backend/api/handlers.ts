import { CROSS_TIME_QUEST_ID, CROSS_TIME_SHARD, crossTimeById, createCrossTimeRecruit } from '../common/game/cross-time.ts';
import { createCrossTimeBattle } from '../common/game/cross-time-battle.ts';
import { crossTimeQuestView, crossTimeRecruitView } from './cross-time.ts';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { OP, OP_BY_NUMBER, WRITE_OPS } from '../common/protocol/ops.ts';
import { schemaFor } from '../common/protocol/schemas.ts';
import { EngineError } from '../common/engine/types.ts';
import { canWield } from '../common/engine/units.ts';
import type { Action, ActAction, AiDifficulty, BattleEvent, BattleState, Point, Side } from '../common/engine/types.ts';
import { actionOptions, artObjectForecast, artForecast, destinationCells, expPreview, forecast, forecastOnHit, inBounds, movementBudget, moveRange, pathTo, spellForecast, spellKind, statusChance, step, threatMap, unitById } from '../common/engine/index.ts';
import { SPELLBOOK_BY_ID } from '../common/data/spellbooks.ts';
import { validateArt, availableArts } from '../common/engine/arts.ts';
import { TERRAINS } from '../common/maps/map.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { ART_TRAINING, WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import type { ArtTraining } from '../common/data/weapon-arts.ts';
import type { WeaponId } from '../common/data/weapons.ts';
import { CATALOG_CLASS_IDS, CLASSES, CLASS_PATHS, CLASS_PURCHASE_LIMIT, canonicalClassId, classChangeReason, classOpenYear, classPrice, classUnavailableReason, hasClassQualification, initialClass, initialClassOf, ROUTE_NAMES, studyForWeapon, trainingBonusFor } from '../common/data/classes.ts';
import { CHARACTER_STORIES } from '../common/data/character-stories.ts';
import { CHARACTERS, deriveProtagonistTendency, PROTAGONIST_ALLOCATION_BUDGET, PROTAGONIST_BASE_STATS, PROTAGONIST_CLASS_ID, PROTAGONIST_GROWTH_TYPE, PROTAGONIST_MAX_ALLOCATION, PROTAGONIST_MIN_ALLOCATION, PROTAGONIST_TENDENCIES } from '../common/data/characters.ts';
import type { CharacterId } from '../common/data/characters.ts';
import { generatedPortraitSex } from '../common/portraits/random.ts';
import { GAME_ITEMS, isCentralShopItem, isItemKey, spellbookItem, stockUses } from '../common/game/items.ts';
import type { ItemKey } from '../common/game/items.ts';
import { catalog } from '../common/game/catalog.ts';
import { ACTION_DAYS, DAYS_PER_SEASON, DAYS_PER_YEAR, dateOf, enemyLevel, encounterLevel, isArenaDay, nextArenaDay, nextMonthStart, REGIONS, regionById, regionLevel } from '../common/game/calendar.ts';
import { fieldEncounter } from '../common/game/encounters.ts';
import { mixedDungeonStages, mixedDungeonMaxUnits } from '../common/game/dungeon-plans.ts';
import type { DungeonStage } from '../common/game/dungeon-plans.ts';
import { encounterMap, createClassicBattle, createFestivalBattle, createFieldBattle, FIELD_BATTLE, sparringRoster } from '../common/game/battles.ts';
import { HARD_ENEMY_EFFECT } from '../common/game/enemies.ts';
import type { BattleRecord } from '../common/game/battles.ts';
import { CATALOG_VERSION, RULESET_VERSION, replayCompatibility } from '../common/game/version.ts';
import { generateRecruit, RECRUIT_UNLOCK_DAY, recruitClass, recruitLevel, recruitPortrait, regionRoutes } from '../common/game/random-recruit.ts';
import type { RandomRecruit } from '../common/game/random-recruit.ts';
import { addWeaponExp, ageDaysOf, bookMax, createUnit, SPELLBOOK_CARRY, weaponMax, gainExperience, growthRates, lifespanEndDayOf, nextLifespanEventDay, rankFromExp, ROSTER_LIMIT, toSnapshot, unitName, useDrug } from '../common/game/model.ts';
import type { UnitRecord } from '../common/game/model.ts';
import { promotionsFor } from '../common/data/promotions.ts';
import { settleAttack, startAttack } from '../common/game/arena.ts';
import type { ArenaDayRecord } from '../common/game/arena.ts';
import type { AttackPlan, Defense } from '../common/arena/rules.ts';
import { applyBans, opponentList, validateDefense } from '../common/arena/rules.ts';
import { ARENA_MAPS } from '../common/arena/maps.ts';
import { seedRng } from '../common/engine/rng.ts';
import { MAINLINE_YEARS, rollGrowthType, rollRecruitAge } from '../common/data/growth-types.ts';
import type { Stats } from '../common/data/types.ts';
import type { Store, Player } from './store.ts';
import { DEMO_LEVEL } from './store.ts';
import { activeSnapshot, applyBattleOutcome, bindDefense, dungeonFirstClearReward, ensureArenaDay, ensureRatingPeriod, flushRecoveryBag, handleAnnualOutcome, handleRunOutcome, hardUnlocks, publicUnitSummary, recordDeath, recordRetire, settleArenaDay, settleDispatches, settleMonthlyRatings, snapshotData, companionPool, setupNeeded, stateView, syncPlayer, unitDetail, unitOrigin, unitSummary } from './services.ts';
import { canClaim, canReincarnate, claimLegacy, LEGACY_MIN_LEVEL, previewInheritance, REINCARNATION_GOLD, reincarnate, totalStats } from '../common/game/legacy.ts';
import type { LegacyMode } from '../common/game/legacy.ts';
import { canStart, createOrder, describeOrder, FACILITIES, facilityById, mature, RECIPES, recipeById, recipeUnlocked, slotsUsed } from '../common/game/production.ts';
import { classMasteryOf, gainMastery, masteryNodesFor, setEquippedSkills, SKILL_SLOTS, switchClass, unlockedNodes } from '../common/game/mastery.ts';
import { createDispatch, dispatchSummary, DISPATCH_MAX_DAYS, DISPATCH_MAX_UNITS, DISPATCH_MIN_DAYS } from '../common/game/dispatch.ts';
import { periodIdFor, rankByRating } from '../common/game/ratings.ts';
import type { WeaponType } from '../common/data/types.ts';
import { STAT_KEYS, withCharm } from '../common/data/types.ts';import { createRun, DUNGEON_STAGE_DAYS, DUNGEON_STAGES, isActiveRun, runSummary, stageCount, stageScenario, survivingIds } from '../common/game/expedition.ts';
import { annualIndexFor, annualSummary, annualWindowOpen, nextAnnualWindowStart, ANNUAL_QUALIFIER_MATCHES, ANNUAL_QUALIFIER_WINS, createAnnualEntry, nextFestivalRound } from '../common/game/annual.ts';
import { CHAPTER_BEXP, CHAPTERS, chapterAvailable, chapterOpenDay, STORY_CHAPTERS } from '../common/game/story.ts';
import { QUEST_DAY_COST, QUEST_LEVEL_CAP, QUESTS, questById, questsForRegion, questAvailable, recruitedCharacters, supportsHardQuest, QUEST_REGIONS, RECRUIT_LINES } from '../common/game/quests.ts';
import { COMPANION_EPILOGUES, STORY_QUESTS } from '../common/game/story-quests.ts';
import { festivalDiscount, festivalPrice } from '../common/game/festival.ts';
import { companionView, completeDuelStep, findStoryStep, recordStoryWin, storyPrerequisite, storyQuestView, syncFindSteps } from './story.ts';
import { createStoryDuel, DUEL_DAYS, duelLevel } from '../common/game/story-duel.ts';
import { classicMap } from '../common/game/classic-catalog.ts';
import { CHALLENGE_FLOORS, challengeById } from '../common/game/challenges.ts';
import { dicePayout, FROG_CHANCE, frogPayout, FROG_NAMES, FROG_RETURN_TENTHS, frogRace, MINIGAME_BETS, MINIGAME_PLAYS_PER_QUARTER, rollDice } from '../common/game/minigames.ts';
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { purchasableRank, regionShop, shopEntry } from '../common/game/quest-shop.ts';
import { normalizeRegions, routeCandidates, worldMap } from '../common/game/region-map.ts';
import { addRegionExploration, adoptRegions, combatFeaturesOpen, playerRegions, tavernOpen, workshopFacilities, worldProgress } from './services.ts';
import { reputationTier } from '../common/game/reputation.ts';

export class OpError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Context {
  store: Store;
  player: Player;
  accountId: string;
  agentModel: string | null;
  actor?: string;
  push: (op: number, data: unknown) => void;
}

type Handler = (ctx: Context, data: Record<string, unknown>) => unknown;
type Json = Record<string, unknown>;

// 训练的金币花费：TRAIN 扣款与 GET_TODAY 展示共用。
const TRAIN_GOLD = 200;

const asString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new OpError('BAD_REQUEST', `缺少字段 ${name}`);
  return value;
};
const asNumber = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new OpError('BAD_REQUEST', `字段 ${name} 必须是数字`);
  return value;
};
const asPoint = (value: unknown, name: string): Point => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(v => Number.isInteger(v))) {
    throw new OpError('BAD_REQUEST', `字段 ${name} 必须是 [x, y] 整数`);
  }
  return [value[0] as number, value[1] as number];
};

// Nested support uses target (not targetId); it cannot recursively submit an action.
function artExtras(data: Json): Pick<Extract<ActAction, { act: 'art' }>, 'ally' | 'secondary' | 'postTo' | 'support'> {
  const extras: ReturnType<typeof artExtras> = {};
  if (data.allyId !== undefined) extras.ally = asString(data.allyId, 'allyId');
  if (data.secondaryId !== undefined) extras.secondary = asString(data.secondaryId, 'secondaryId');
  if (data.postTo !== undefined) extras.postTo = asPoint(data.postTo, 'postTo');
  if (data.support !== undefined) {
    if (!data.support || typeof data.support !== 'object' || Array.isArray(data.support)) throw new OpError('BAD_REQUEST', 'support 必须是对象');
    const support = data.support as Json;
    if (Object.keys(support).some(key => !['target', 'spell', 'weapon', 'dest'].includes(key)) || (support.spell !== undefined) === (support.weapon !== undefined)) throw new OpError('BAD_REQUEST', 'support 只允许 target、spell/weapon（二选一）、dest');
    extras.support = { target: asString(support.target, 'support.target'),
      ...(support.spell === undefined ? { weapon: asString(support.weapon, 'support.weapon') as WeaponId } : { spell: asString(support.spell, 'support.spell') }),
      ...(support.dest === undefined ? {} : { dest: asPoint(support.dest, 'support.dest') }) };
  }
  return extras;
}

function requireUnit(store: Store, player: Player, unitId: string): UnitRecord {
  const unit = store.unit(player.id, unitId);
  if (!unit) throw new OpError('NOT_FOUND', `没有单位 ${unitId}`);
  return unit;
}

function requireBattle(ctx: Context, data: Json): BattleRecord {
  const id = typeof data.battleId === 'string' ? data.battleId : undefined;
  const record = id ? ctx.store.battle(ctx.player.id, id) : ctx.store.activeBattle(ctx.player.id);
  if (!record) throw new OpError('NOT_FOUND', id ? `没有战斗 ${id}` : '当前没有进行中的战斗');
  return record;
}

// 严重损失补员的资格（docs/00 §3.3）：真实伤亡使现役存活人数≤2（含神主角）时开放，
// 每次新损失只领一次；解雇／退役／派遣不构成新伤亡，外出者仍计入存活人数。
const EMERGENCY_SURVIVORS = 2;
const EMERGENCY_UNITS = 2;
function emergencyStatus(ctx: Context): { deaths: number; claimedFor: number; survivors: number; threshold: number; units: number; room: number; available: boolean; blocker: string | null } {
  const deaths = ctx.store.memorials(ctx.player.id).filter(m => m.data.cause === 'death').length;
  const claimedFor = ctx.player.flags.emergencyClaimed ?? 0;
  const survivors = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length;
  const room = ROSTER_LIMIT - survivors;
  const blocker = deaths <= claimedFor ? '没有新的真实伤亡'
    : survivors > EMERGENCY_SURVIVORS ? `现役存活 ${survivors} 人，需 ≤${EMERGENCY_SURVIVORS} 才开放免费补员`
      : room < EMERGENCY_UNITS ? `名册空间不足（还差 ${EMERGENCY_UNITS - room} 个位置）` : null;
  return { deaths, claimedFor, survivors, threshold: EMERGENCY_SURVIVORS, units: EMERGENCY_UNITS, room, available: blocker === null, blocker };
}

// ---- battle helpers ------------------------------------------------------

const PLAYER_GLYPHS = 'abcdefghijklmnopqrstuvwxyz';
const ENEMY_GLYPHS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function asciiMap(state: BattleState): { w: number; h: number; ascii: string[]; legend: Record<string, string> } {
  const grid: string[][] = state.map.tiles.map(row => row.map(tile => TERRAINS[tile].glyph));
  const legend: Record<string, string> = Object.fromEntries(Object.values(TERRAINS).map(t => [t.glyph, t.name] as [string, string]));
  let pi = 0, ei = 0;
  for (const unit of state.units.filter(u => u.alive)) {
    const glyph = unit.side === 'player'
      ? (unit.acted ? PLAYER_GLYPHS[pi].toUpperCase() : PLAYER_GLYPHS[pi])
      : ENEMY_GLYPHS[ei];
    if (unit.side === 'player') pi++; else ei++;
    grid[unit.pos[1]][unit.pos[0]] = glyph;
  }
  legend['a-z'] = '己方（大写 = 已行动）';
  legend['1-9'] = '敌方';
  return { w: state.map.width, h: state.map.height, ascii: grid.map(row => row.join('')), legend };
}

function goalText(state: BattleState): string {
  const goal = state.goal;
  if (goal.kind === 'boss') return `击败主将（${goal.target}）`;
  if (goal.kind === 'seize') return `压制王座 [${goal.throne.join(',')}]`;
  if (goal.kind === 'defend') return `坚守 ${state.turnLimit} 回合`;
  if (goal.kind === 'escape') return `撤离 ${goal.need} 人到撤离点 [${goal.exits.map(e => e.join(',')).join(' ')}]`;
  if (goal.kind === 'gather') return `带 ${goal.need} 箱物资撤离 [${goal.exits.map(e => e.join(',')).join(' ')}]`;
  if (goal.kind === 'escort') return `护送对象抵达撤离点 [${goal.exits.map(e => e.join(',')).join(' ')}]`;
  return '全灭敌军';
}

function asAiDifficulty(value: unknown): 'normal' | 'hard' {
  if (value === undefined) return 'normal';
  if (value === 'normal' || value === 'hard') return value;
  throw new OpError('BAD_REQUEST', 'aiDifficulty 必须是 normal 或 hard');
}

// 开战时玩家能买到的最高装备级，经典图随机升级宝箱据此抽取。
function lootRankOf(player: Player) {
  return purchasableRank(playerRegions(player), player.flags.regionReputation ?? {});
}

// 任务可接条件需要的玩家状态：声望、持有物品、日期和已招募的固定人物。
function questState(ctx: Context, quest: { region: number }, done: ReadonlySet<string>) {
  return {
    done, reputation: ctx.player.flags.regionReputation?.[quest.region] ?? 0,
    holds: (item: ItemKey) => ctx.store.countInventory(ctx.player.id, item) > 0,
    day: ctx.player.day, recruited: recruitedCharacters(ctx.player.flags.questRewardsClaimed ?? []),
  };
}

export function battleView(record: BattleRecord, detail: boolean, sinceEvent = 0) {
  const state = record.state;
  return {
    encounter: state.encounter,
    battleId: record.id,
    aiDifficulty: state.aiDifficulty ?? 'normal',
    kind: record.kind,
    mode: record.mode,
    name: record.name,
    costDays: record.costDays ?? null,
    // 这场战斗属于哪项活动（任务／连续副本／挑战塔／年度赛事），页面据此给出返回去处。
    questId: record.questId ?? null, runId: record.runId ?? null, challengeId: record.challengeId ?? null, annualId: record.annualId ?? null,
    turn: state.turn,
    turnLimit: state.turnLimit,
    phase: state.phase,
    goal: goalText(state),
    nextObjective: state.nextObjective ?? null,
    npcRoute: state.npcRoute ?? null,
    result: state.result ?? null,
    crossTimeRewards: (record as BattleRecord & { crossTimeRewards?: unknown }).crossTimeRewards ?? null,
    crossTimeGroups: state.crossTimeGroups ?? [],
    embers: state.embers ?? [],
    map: { ...asciiMap(state), season: state.map.season ?? null },
    units: state.units.filter(u => u.alive).map(u => ({
      ...(detail ? fullUnit(u) : compactUnit(u)), move: movementBudget(state, u),
      terrain: state.map.tiles[u.pos[1]][u.pos[0]], moveType: CLASSES[u.classId].moveType, armored: CLASSES[u.classId].armored,
    })),
    events: record.events.slice(sinceEvent),
    eventCount: record.events.length,
  };
}

function compactUnit(u: BattleState['units'][number]) {
  return {
    id: u.id, name: u.name, side: u.side, class: CLASSES[u.classId].name, lv: u.level, pos: u.pos,
    hp: [u.hp, u.stats.hp], acted: u.acted, leader: !!u.boss, equip: u.weapons[0] ? WEAPONS[u.weapons[0]].name : null,
    petrified: !!u.petrified, statuses: u.statuses ?? {}, artEffects: u.artEffects ?? {}, immunities: u.immunities ?? [], tags: u.tags ?? [],
    items: u.items.map(i => `${GAME_ITEMS[i.id as ItemKey]?.name ?? i.id}(${i.uses})`),
  };
}

function fullUnit(u: BattleState['units'][number]) {
  return { ...compactUnit(u), stats: withCharm(u.stats), con: u.con, weapons: u.weapons, ranks: u.ranks, skill: u.skill ?? null, arts: availableArts(u), weaponInstances: u.weaponInstances ?? [] };
}

// 进行中的战斗不下发随机数状态或敌方 AI 行为 (docs/03「结束前隐藏种子」、docs/05「AI 行为不公开」)。
function publicState(state: BattleState): BattleState {
  const copy = structuredClone(state) as unknown as { rng?: unknown; growthRng?: unknown; units: { behavior?: unknown; stats: BattleState['units'][number]['stats'] }[] };
  delete copy.rng;
  delete copy.growthRng;
  for (const unit of copy.units) { delete unit.behavior; unit.stats = withCharm(unit.stats); }
  hideSecrets(copy as unknown as BattleState);
  return copy as unknown as BattleState;
}

// 密室未揭开前不下发：去掉 hidden 物件，以及会揭开它们的未触发事件和其地图变化。
function hideSecrets(state: BattleState): void {
  const hidden = new Set((state.objects ?? []).filter(object => object.state === 'hidden').map(object => object.id));
  if (hidden.size === 0) return;
  state.objects = state.objects!.filter(object => !hidden.has(object.id));
  const runtime = state.scenario;
  if (!runtime) return;
  const secret = runtime.events.filter(event => event.actions.some(action => action.kind === 'setObject' && hidden.has(action.object)));
  const changes = new Set(secret.flatMap(event => event.actions.flatMap(action => action.kind === 'mapChange' ? [action.change] : [])));
  runtime.events = runtime.events.filter(event => !secret.includes(event));
  runtime.mapChanges = runtime.mapChanges.filter(change => !changes.has(change.id));
}

function applyAction(ctx: Context, record: BattleRecord, action: Action): { state: BattleState; events: BattleEvent[] } {
  const result = step(record.state, action);
  record.state = result.state;
  record.events.push(...result.events);
  record.actions.push(action);
  record.updatedAt = Date.now();
  ctx.store.saveBattle(record);
  if (result.state.result) finishBattle(ctx, record);
  else if (result.state.phase === 'player') ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: result.state.turn });
  ctx.push(OP.BATTLE_UPDATED, { battleId: record.id, turn: result.state.turn, events: result.events.length });
  return result;
}

// 完成一章主线事件（幂等）：主线任务胜利和旧的确认入口共用。
function completeChapter(ctx: Context, chapter: number): void {
  ctx.player.flags.storyCompleted ??= [];
  if (ctx.player.flags.storyCompleted.includes(chapter)) return;
  ctx.player.flags.storyCompleted.push(chapter);
  ctx.store.savePlayer(ctx.player);
  ctx.store.addEvent(ctx.player.id, 'story', `完成主线第 ${chapter} 章。`, { chapter });
  ctx.push(OP.STATE_CHANGED, { reason: 'story' });
}

function finishBattle(ctx: Context, record: BattleRecord): void {
  const rewards = applyBattleOutcome(ctx.store, ctx.player, record);
  const runOutcome = handleRunOutcome(ctx.store, ctx.player, record);
  const annualOutcome = handleAnnualOutcome(ctx.store, ctx.player, record);
  // 主线单挑：获胜即完成该前置任务（败了可以再次挑战），不走地区任务的结算。
  const duel = record.questId ? findStoryStep(record.questId) : null;
  if (duel && record.state.result?.winner === 'player') {
    completeDuelStep(ctx.player, duel.step.id);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'story', `完成主线前置任务「${duel.step.name}」。`, { step: duel.step.id });
  }
  // 地区任务胜利即标记完成；奖励用 CLAIM_QUEST_REWARD 另领（docs/20 §7）。
  if (record.questId && !duel && record.questId !== CROSS_TIME_QUEST_ID && !record.runId && record.state.result?.winner === 'player') {
    ctx.player.flags.questsDone ??= [];
    if (!ctx.player.flags.questsDone.includes(record.questId)) {
      ctx.player.flags.questsDone.push(record.questId);
      const quest = questById(record.questId);
      // 主线任务不属于任何地区（region 0）：不加探索度，胜利即完成对应章节。
      if (quest && quest.region > 0) addRegionExploration(ctx.store, ctx.player, quest.region, 'quest');
      if (record.state.goal.kind === 'gather') {
        ctx.player.flags.questBoxes ??= {};
        ctx.player.flags.questBoxes[record.questId] = record.state.units.filter(unit => unit.side === 'player' && unit.escaped).reduce((sum, unit) => sum + (unit.carried ?? 0), 0);
      }
      ctx.store.savePlayer(ctx.player);
      ctx.store.addEvent(ctx.player.id, 'quest', `完成任务「${questById(record.questId)?.name ?? record.questId}」，奖励待领取。`, { questId: record.questId });
      if (quest?.story) completeChapter(ctx, quest.story);
    }
  }
  // 挑战塔：胜利即记为通关，首通／重复奖励另用 CLAIM_CHALLENGE_REWARD 领取（docs/00 §9.6）。
  if (record.challengeId && record.state.result?.winner === 'player') {
    ctx.player.flags.towerCleared ??= [];
    if (!ctx.player.flags.towerCleared.includes(record.challengeId)) {
      ctx.player.flags.towerCleared.push(record.challengeId);
      ctx.store.savePlayer(ctx.player);
      ctx.store.addEvent(ctx.player.id, 'challenge', `通关${challengeById(record.challengeId)?.name ?? record.challengeId}，奖励待领取。`, { floorId: record.challengeId });
    }
  }
  if (record.mode === 'arena' && record.opponentId && record.arenaDay !== undefined) {
    const day = ctx.store.arenaDay(ctx.player.id, record.arenaDay);
    if (day) {
      settleAttack(day, record.opponentId, record.state);
      if (record.state.result?.winner === 'player') recordStoryWin(ctx.player, 'arena');
      ctx.store.saveArenaDay(day);
      // 三场都结束后立刻结算，奖励与积分不必等下一次 API 请求；中途只推进日期不会触发。
      if (Object.values(day.attacks).every(attack => attack.status === 'won' || attack.status === 'lost')) {
        settleArenaDay(ctx.store, ctx.player, day);
      }
    }
  }
  // 副本宝箱里取到的任务物品在结算入库后检查（找物品类前置任务）。
  if (syncFindSteps(ctx.store, ctx.player).length > 0) ctx.store.savePlayer(ctx.player);
  ctx.store.addEvent(ctx.player.id, 'battle-end', `${record.name} 结束：${record.state.result?.winner === 'player' ? '胜利' : '失败'}。`, {
    battleId: record.id, deaths: rewards.deaths, gold: rewards.gold, runState: runOutcome?.run.state ?? null, annualState: annualOutcome?.entry.state ?? null,
  });
  ctx.push(OP.STATE_CHANGED, { reason: 'battle-end', battleId: record.id });
}

// ---- handlers ------------------------------------------------------------


// 经典地图的出战上限来自逐图适配配置；副本取整条路线里最紧的一图，绝不静默裁到 8。
function questMaxUnits(quest: { maxUnits?: number; scenarioId?: string; scenarioIds?: string[] }): number {
  if (quest.maxUnits) return quest.maxUnits;
  const ids = quest.scenarioIds?.length ? quest.scenarioIds : quest.scenarioId ? [quest.scenarioId] : [];
  if (ids.length === 0) return FIELD_BATTLE.maxUnits;
  return Math.min(...ids.map(id => classicAdaptation(id).deployment.max));
}


function dungeonPlan(player: Player, region: number, difficulty: AiDifficulty) {
  const encounter = fieldEncounter(player.id, player.day, region, difficulty, 'dungeon');
  const stages = mixedDungeonStages(encounter.seed, region);
  encounter.maxUnits = mixedDungeonMaxUnits(stages, encounter.maxUnits);
  return { encounter, stages };
}

// 随机角色仍以稳定角色 ID 作为肖像/个人技能锚点，但姓名、性别、种族、职业与成长独立。
function randomRecruitUnit(candidate: RandomRecruit, region: number, day: number, seed: string, levelOverride?: number) {
  const level = levelOverride ?? recruitLevel(day);
  const traits = seedRng(`recruit-traits:${seed}`);
  const growthType = rollGrowthType(traits[0] % 100);
  const remainingYears = Math.max(0, MAINLINE_YEARS - (dateOf(day).year - 1));
  const age = rollRecruitAge(growthType, remainingYears, traits[1]);
  const portrait = recruitPortrait(seed);
  const unit = createUnit(portrait, level, `u_random_${region}_${hashSeed(seed)}`, day, true, {
    classId: candidate.classId, growthType, age, personalGrowth: candidate.growth, startingGear: 'recruit',
  });
  unit.name = candidate.name;
  unit.sex = candidate.sex;
  unit.species = candidate.species;
  unit.portrait = portrait;
  return unit;
}

function hashSeed(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}


// 有次数的书分两类：携带的魔道书／杖（bookInstances）与职业法术书（spellbooks，cast 用）。
// 两边可能同名（如雷霆），spellbook=true 时先找法术书。
function bookOf(unit: UnitRecord, id: string, spellbook: boolean): { charges: number; maxCharges: number } | null {
  const books = (unit.bookInstances ?? []).find(row => row.id === id);
  const spells = (unit.spellbooks ?? []).find(row => row.id === id);
  return (spellbook ? spells ?? books : books ?? spells) ?? null;
}

function lifespanBlockers(ctx: Context, toDay: number): string[] {
  return ctx.store.units(ctx.player.id).filter(unit => unit.status === 'active')
    .flatMap(unit => {
      const end = nextLifespanEventDay(unit, ctx.player.day, toDay);
      return end === null ? [] : [`${unitName(unit)} 将在 ${dateOf(end).label} 寿终；请先安排传承／退役或缩短行动`];
    });
}

function requireArtTraining(id: string): ArtTraining {
  const training = ART_TRAINING.find(row => row.art === id);
  if (!training) throw new OpError('BAD_REQUEST', '该战技不是可研修的强化版');
  return training;
}

function artTrainingProblem(ctx: Context, unit: UnitRecord, training: ArtTraining): OpError | null {
  if (unit.status !== 'active') return new OpError('FORBIDDEN', '该单位不在现役名册');
  if (ctx.store.activeAnnualEntry(ctx.player.id)) return new OpError('FORBIDDEN', '大竞技场进行中，不能研修');
  if (ctx.store.activeBattle(ctx.player.id)) return new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能研修');
  if (unit.lockedRunId || unit.lockedDispatchId) return new OpError('FORBIDDEN', '远征／派遣中的角色不能研修');
  if (unit.learnedArts?.includes(training.art)) return new OpError('FORBIDDEN', '已经学会该强化战技');
  if (!unit.learnedArts?.includes(training.requires)) return new OpError('FORBIDDEN', '尚未学会对应基础战技');
  if (ctx.player.gold < training.gold) return new OpError('NOT_ENOUGH_GOLD', `研修需要 ${training.gold} 金币`);
  const lifespan = lifespanBlockers(ctx, ctx.player.day + training.days);
  return lifespan.length ? new OpError('FORBIDDEN', lifespan.join('；')) : null;
}

const handlers: Record<number, Handler> = {
  [OP.GET_STATE]: ctx => stateView(ctx.store, ctx.player),

  [OP.GET_EVENTS]: (ctx, data) => {
    // 事件游标是十进制字符串（docs/13 §2.1）：可传 cursor 或旧的 sinceId。
    const since = typeof data.cursor === 'string' ? data.cursor : String(data.sinceId ?? 0);
    const events = ctx.store.events(ctx.player.id, since);
    const cursor = events.length > 0 ? String(events[events.length - 1].id) : since;
    return { events: events.map(event => ({ ...event, id: String(event.id) })), cursor };
  },

  [OP.GET_AGENT_INFO]: ctx => ({
    online: !!ctx.player.flags.agentLastSeen && Date.now() - ctx.player.flags.agentLastSeen < 5 * 60_000,
    model: ctx.agentModel,
    plan: ctx.store.notes(ctx.player.id, 'plan')[0]?.text ?? null,
    dailyReport: ctx.store.notes(ctx.player.id, 'daily')[0]?.text ?? null,
  }),

  [OP.GET_ROSTER]: ctx => ({
    limit: ROSTER_LIMIT,
    count: ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length,
    units: ctx.store.units(ctx.player.id).map(unit => publicUnitSummary(unit, ctx.player.day)),
  }),

  [OP.GET_UNIT]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    // 固定人物才有见闻；随机招募与神主角只借用形象锚点，不继承那名角色的故事。
    return { ...unitDetail(unit, ctx.player.day), story: unitOrigin(unit) === 'fixed' ? CHARACTER_STORIES[unit.character] ?? null : null };
  },

  [OP.GET_INVENTORY]: ctx => ({
    inventory: ctx.store.inventory(ctx.player.id).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name, uses: row.uses, count: row.count })),
    units: ctx.store.units(ctx.player.id).map(u => ({ unit: u.id, items: u.items.map(i => ({ item: i.id, uses: i.uses })) })),
  }),

  [OP.GET_CATALOG]: () => catalog(),

  [OP.GET_TODAY]: ctx => {
    const cleared = ctx.player.flags.clearedRegions;
    const unlocked = adoptRegions(ctx.store, ctx.player);
    const date = dateOf(ctx.player.day);
    const current = ctx.store.activeBattle(ctx.player.id);
    const fighting = !!current;
    const full = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT;
    const recruitBlock = ctx.player.flags.pendingRecruit ? '已有待确认的游历候选，先接受或拒绝'
      : ctx.player.day < RECRUIT_UNLOCK_DAY ? `第二年（${dateOf(RECRUIT_UNLOCK_DAY).label}）开放游历招募`
        : full ? `名册已满（上限 ${ROSTER_LIMIT} 人）` : null;
    return {
      day: ctx.player.day,
      date,
      actions: [
        { key: 'sortie', name: '出击', costDays: ACTION_DAYS.sortie, available: !fighting && unlocked.length > 0, note: fighting ? '已有进行中的战斗，打完再出击' : unlocked.length === 0 ? '先在世界地图选择行军路线' : '手动打一场野外战斗，经验与掉落最多',
          maxUnits: FIELD_BATTLE.maxUnits, turnLimit: FIELD_BATTLE.turnLimit, goalText: FIELD_BATTLE.goalText, lethal: true },
        { key: 'sweep', name: '扫荡', costDays: ACTION_DAYS.sweep, available: cleared.length > 0, note: cleared.length > 0 ? '自动结算已讨伐地区' : '先讨伐至少一个地区' },
        { key: 'train', name: '训练', costDays: ACTION_DAYS.train, costGold: TRAIN_GOLD, available: true, note: '补武器熟练度，暂不发等级经验' },
        { key: 'rest', name: '休整', costDays: 1, available: true, note: '自选日数推进日期' },
        { key: 'recruit', name: '游历招募', costDays: ACTION_DAYS.recruit, available: recruitBlock === null, note: recruitBlock ?? '只花行动日，按地区概率遇到新人；遇到后可接受或拒绝' },
      ],
      // 只有已解锁地区可出击；完整地图（含锁定节点与可选路线）走 GET_WORLD_MAP / state.world。
      sortieRegions: REGIONS.filter(region => unlocked.includes(region.id)).map(region => {
        const normalDungeon = dungeonPlan(ctx.player, region.id, 'normal');
        const hardDungeon = dungeonPlan(ctx.player, region.id, 'hard');
        return {
        id: region.id, name: region.name, resource: region.resource,
        hardUnlocked: hardUnlocks(ctx.store, ctx.player).regions.includes(region.id),
        encounters: { normal: fieldEncounter(ctx.player.id, ctx.player.day, region.id, 'normal'), hard: fieldEncounter(ctx.player.id, ctx.player.day, region.id, 'hard') },
        dungeonEncounters: { normal: normalDungeon.encounter, hard: hardDungeon.encounter },
        dungeonStages: normalDungeon.stages,
        dungeonHardUnlocked: hardUnlocks(ctx.store, ctx.player).dungeons.includes(region.id),
        dungeonFirstClearRewards: {
          normal: dungeonFirstClearReward(ctx.store, ctx.player, region.id),
          hard: dungeonFirstClearReward(ctx.store, ctx.player, region.id, undefined, 'hard'),
        },
        cleared: cleared.includes(region.id), level: enemyLevel(ctx.player.day, region.offset),
      }; }),
      festival: { open: date.dayOfMonth >= 28 || ctx.player.flags.festivalRound > 0, round: ctx.player.flags.festivalRound, costDays: ACTION_DAYS.festivalMatch },
      nextArenaDay: nextArenaDay(ctx.player.day),
      nextMonthStart: nextMonthStart(ctx.player.day),
      // The unfinished battle, if any, so the camp can offer to resume it.
      battle: current ? { id: current.id, name: current.name, kind: current.kind, mode: current.mode, turn: current.state.turn, opponentId: current.opponentId ?? null } : null,
    };
  },

  // ---- 世界地图开荒（region-map.ts 契约） ----------------------------------

  [OP.GET_WORLD_MAP]: ctx => {
    adoptRegions(ctx.store, ctx.player);
    return worldMap(worldProgress(ctx.player));
  },

  // 选择一条可选路线解锁相邻地区：0 日、互不排斥；不能跳过相邻关系，需先完成开局。
  [OP.CHOOSE_ROUTE]: (ctx, data) => {
    if (setupNeeded(ctx.player, ctx.store.units(ctx.player.id).filter(unit => unit.status === 'active').length)) throw new OpError('FORBIDDEN', '先完成开局自捏，再选择行军路线');
    const region = asNumber(data.region, 'region');
    if (!Number.isInteger(region) || region < 1 || region > 12) throw new OpError('BAD_REQUEST', '地区编号需为 1–12 的整数');
    const unlocked = adoptRegions(ctx.store, ctx.player);
    const selectable = routeCandidates(worldProgress(ctx.player));
    if (!selectable.includes(region)) {
      throw new OpError('FORBIDDEN', '只能选择世界地图上的可选路线：开局为 1–4 四条起步路线，此后需先将相连已开通地区的探索度提升至 100，才能选择新路线');
    }
    const next = normalizeRegions([...unlocked, region]);
    ctx.player.flags.unlockedRegions = next;
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'world', `军队开进 ${regionById(region).name}，解锁新地区。`, { region });
    ctx.push(OP.STATE_CHANGED, { reason: 'choose-route' });
    const world = worldMap(worldProgress(ctx.player));
    return { region, unlockedRegions: next, selectableRegions: world.selectableRegions, world };
  },

  [OP.SORTIE]: (ctx, data) => {
    const aiDifficulty = asAiDifficulty(data.aiDifficulty);
    if (aiDifficulty === 'hard' && !hardUnlocks(ctx.store, ctx.player).regions.includes(asNumber(data.region, 'region'))) throw new OpError('FORBIDDEN', '先以普通难度赢得本地区野外战斗，才能挑战困难野外战斗');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    const encounter = fieldEncounter(ctx.player.id, ctx.player.day, region, aiDifficulty);
    const ready = deploymentUnits(ctx, data.unitIds, encounter.maxUnits);
    // 种子由服务器生成，不采用客户端提交的 seed，避免预选随机结果 (docs/03)。
    const seed = randomUUID().slice(0, 8);
    const record = createFieldBattle(ready, { region, cleared: ctx.player.flags.clearedRegions.length, day: ctx.player.day, seed, aiDifficulty, encounter });
    record.playerId = ctx.player.id;
    ctx.player.day += ACTION_DAYS.sortie;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'sortie', `出征 ${regionById(region).name}，${ready.length} 人。`, { battleId: record.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, battle: battleView(record, false), state: publicState(record.state) };
  },

  [OP.SWEEP]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    const times = Math.max(1, Math.min(10, typeof data.times === 'number' ? data.times : 1));
    if (!ctx.player.flags.clearedRegions.includes(region)) throw new OpError('BAD_REQUEST', '只能扫荡已讨伐地区');
    const material: ItemKey = region % 3 === 0 ? 'ore' : region % 3 === 1 ? 'herb' : 'wood';
    const perRun = 2 + Math.floor(regionLevel(ctx.player.flags.clearedRegions.length, regionById(region).offset) / 20);
    ctx.player.day += ACTION_DAYS.sweep * times;
    ctx.store.addInventory(ctx.player.id, material, 0, perRun * times);
    syncPlayer(ctx.store, ctx.player);
    ctx.store.addEvent(ctx.player.id, 'sweep', `扫荡 ${regionById(region).name} ${times} 次，获得 ${GAME_ITEMS[material].name} ×${perRun * times}。`, { region, times });
    ctx.push(OP.STATE_CHANGED, { reason: 'sweep' });
    return { days: ACTION_DAYS.sweep * times, items: [{ item: material, count: perRun * times }], day: ctx.player.day };
  },

  [OP.TRAIN]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在名册中');
    if (unit.lockedDispatchId) throw new OpError('FORBIDDEN', '派遣中的角色不能参加武器专项训练');
    if (ctx.player.gold < TRAIN_GOLD) throw new OpError('NOT_ENOUGH_GOLD', `训练需要 ${TRAIN_GOLD} 金币`);
    const type = typeof data.weaponType === 'string' ? data.weaponType : null;
    const allowedWeapons = unit.weapons.filter(w => CLASSES[unit.classId].weapons[WEAPONS[w].type]);
    const weaponId = type ? allowedWeapons.find(w => WEAPONS[w].type === type) : allowedWeapons[0];
    if (!weaponId) throw new OpError('BAD_REQUEST', '当前职业没有携带可训练的该类武器');
    ctx.player.gold -= TRAIN_GOLD;
    const weaponType = WEAPONS[weaponId].type;
    const before = unit.ranks[weaponType] ?? 'E';
    const bonus = trainingBonusFor(unit.classId, studyForWeapon(weaponType)) ?? 0;
    const rank = addWeaponExp(unit, weaponType, 10 + bonus);
    ctx.player.day += ACTION_DAYS.train;
    ctx.store.saveUnit(unit, ctx.player.id);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'train' });
    return { unit: unit.id, weaponType, rankBefore: before, rankAfter: unit.ranks[weaponType] ?? 'E', rankUp: rank, day: ctx.player.day, gold: ctx.player.gold };
  },

  [OP.REST]: (ctx, data) => {
    const days = Math.max(1, Math.min(500, typeof data.days === 'number' ? data.days : 1));
    ctx.player.day += days;
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'rest' });
    return { days, day: ctx.player.day, date: dateOf(ctx.player.day) };
  },

  [OP.RECRUIT]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    const pending = ctx.player.flags.pendingRecruit;
    if (pending) throw new OpError('FORBIDDEN', '已有待确认的游历候选，先接受或拒绝');
    if (ctx.player.day < RECRUIT_UNLOCK_DAY) throw new OpError('FORBIDDEN', `需要到${dateOf(RECRUIT_UNLOCK_DAY).label}才能游历招募`);
    if (ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT) throw new OpError('BAD_REQUEST', '名册已满');
    const fails = ctx.player.flags.recruitFailsByRegion?.[region] ?? ctx.player.flags.recruitFails ?? 0;
    const roll = seedRng(`recruit:${ctx.player.id}:${ctx.player.day}:${region}`)[0] % 100;
    const success = roll < 40 || fails >= 4;
    const seed = `${ctx.player.id}:${ctx.player.day}:${region}`;
    ctx.player.day += ACTION_DAYS.recruit;
    ctx.player.flags.recruitFailsByRegion ??= {};
    if (!success) {
      ctx.player.flags.recruitFailsByRegion[region] = fails + 1;
      ctx.player.flags.recruitFails = fails + 1;
      syncPlayer(ctx.store, ctx.player);
      ctx.store.savePlayer(ctx.player);
      ctx.store.addEvent(ctx.player.id, 'recruit', `在 ${regionById(region).name} 游历未遇到新人（第 ${fails + 1} 次失败）。`, { region });
      return { success: false, fails: fails + 1, day: ctx.player.day, region };
    }
    ctx.player.flags.recruitFailsByRegion[region] = 0;
    ctx.player.flags.recruitFails = 0;
    const candidate = generateRecruit(seed, regionRoutes(region));
    ctx.player.flags.pendingRecruit = { id: `pending-${seed}`, region, day: ctx.player.day, seed, candidate };
    syncPlayer(ctx.store, ctx.player);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `在 ${regionById(region).name} 遇到候选 ${candidate.name}（${candidate.classId}）。`, { region, candidate });
    return { success: true, pending: { id: ctx.player.flags.pendingRecruit.id, region, candidate, level: recruitLevel(ctx.player.day) }, day: ctx.player.day };
  },

  [OP.ACCEPT_RECRUIT]: (ctx, data) => {
    const pending = ctx.player.flags.pendingRecruit;
    if (!pending) throw new OpError('NOT_FOUND', '没有待确认的游历候选');
    if (data.id !== undefined && asString(data.id, 'id') !== pending.id) throw new OpError('NOT_FOUND', '候选已经变化');
    if (ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT) throw new OpError('ROSTER_FULL', '名册已满，腾出位置后再接受');
    const unit = randomRecruitUnit(pending.candidate, pending.region, ctx.player.day, pending.seed);
    ctx.store.addUnit(ctx.player.id, unit);
    delete ctx.player.flags.pendingRecruit;
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `${unitName(unit)} 加入了军团。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'recruit' });
    return { accepted: true, unit: unitSummary(unit, ctx.player.day), day: ctx.player.day };
  },

  [OP.DECLINE_RECRUIT]: ctx => {
    const pending = ctx.player.flags.pendingRecruit;
    if (!pending) throw new OpError('NOT_FOUND', '没有待确认的游历候选');
    delete ctx.player.flags.pendingRecruit;
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `拒绝了 ${pending.candidate.name}；已支付的日期不退还。`, { region: pending.region });
    return { declined: true, day: ctx.player.day };
  },

  [OP.GET_TAVERN]: (ctx, data) => {
    const quarter = Math.floor(ctx.player.day / DAYS_PER_SEASON);
    // 安全空读：酒馆未开放时返回空列表，不报错（会话引导会在锁定时拉取）。
    if (!tavernOpen(ctx.store, ctx.player)) return { quarter, regions: [] };
    if (ctx.player.flags.tavernQuarter !== quarter) {
      ctx.player.flags.tavernQuarter = quarter;
      ctx.player.flags.tavernCandidates = {};
    }
    ctx.player.flags.tavernCandidates ??= {};
    const regions = data.region === undefined ? [2, 3, 5] : [asNumber(data.region, 'region')];
    const rows = regions.flatMap(region => {
      if (!ctx.player.flags.tavernCandidates![region]) {
        ctx.player.flags.tavernCandidates![region] = Array.from({ length: 3 }, (_, i) => {
          const seed = `${ctx.player.id}:tavern:${quarter}:${region}:${i}`;
          const candidate = generateRecruit(seed, regionRoutes(region));
          return { id: `${region}-${quarter}-${i}`, price: 1_200 + recruitLevel(ctx.player.day) * 80, hired: false, candidate };
        });
      }
      return ctx.player.flags.tavernCandidates![region].map(row => ({
        region, id: row.id, price: row.price, hired: row.hired, name: row.candidate.name,
        sex: row.candidate.sex, species: row.candidate.species, classId: row.candidate.classId,
        className: CLASSES[row.candidate.classId].name, portrait: recruitPortrait(row.id),
        level: recruitLevel(ctx.player.day),
      }));
    });
    ctx.store.savePlayer(ctx.player);
    return { quarter, regions: rows };
  },

  [OP.HIRE_TAVERN]: (ctx, data) => {
    if (!tavernOpen(ctx.store, ctx.player)) throw new OpError('FORBIDDEN', `酒馆招募在${dateOf(RECRUIT_UNLOCK_DAY).label}开放`);
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    const id = asString(data.id, 'id');
    const quarter = Math.floor(ctx.player.day / DAYS_PER_SEASON);
    const row = ctx.player.flags.tavernCandidates?.[region]?.find(entry => entry.id === id);
    if (!row) throw new OpError('NOT_FOUND', '本季度没有这个候选');
    if (row.hired) throw new OpError('FORBIDDEN', '这个候选已经被雇佣');
    if (ctx.store.units(ctx.player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT) throw new OpError('ROSTER_FULL', '名册已满');
    if (ctx.player.gold < row.price) throw new OpError('NOT_ENOUGH_GOLD', `需要 ${row.price} 金币`);
    ctx.player.gold -= row.price;
    row.hired = true;
    const unit = randomRecruitUnit(row.candidate, region, ctx.player.day, id);
    ctx.store.addUnit(ctx.player.id, unit);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `在酒馆雇佣了 ${unitName(unit)}（-${row.price} 金币）。`, { unit: unit.id, region });
    ctx.push(OP.STATE_CHANGED, { reason: 'tavern' });
    return { hired: true, unit: unitSummary(unit, ctx.player.day), day: ctx.player.day, gold: ctx.player.gold };
  },

  [OP.START_MAIN_STAGE]: ctx => {
    return handlers[OP.START_ANNUAL_MATCH](ctx, {});
  },

  [OP.SKIP_MAIN_STAGE]: ctx => {
    ctx.player.day = nextMonthStart(ctx.player.day);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.MONTH_STARTED, { day: ctx.player.day, date: dateOf(ctx.player.day) });
    return { day: ctx.player.day, date: dateOf(ctx.player.day) };
  },

  // 行动报价（docs/13 §3.2）：与 playerVersion 绑定，不改变世界；执行时重新校验。
  [OP.PREVIEW_ACTION]: (ctx, data) => {
    const action = asString(data.action, 'action');
    const built = buildQuote(ctx, action, data);
    const quoteId = `quote-${randomUUID().slice(0, 8)}`;
    const quote = { quoteId, playerVersion: ctx.player.version ?? 0, ...built };
    ctx.store.saveQuote(quoteId, ctx.player.id, quote.playerVersion, quote);
    return quote;
  },

  [OP.EXECUTE_ACTION]: (ctx, data) => {
    const quoteId = asString(data.quoteId, 'quoteId');
    const stored = ctx.store.quote(ctx.player.id, quoteId);
    if (!stored) throw new OpError('NOT_FOUND', '没有这个报价');
    if (stored.playerVersion !== (ctx.player.version ?? 0)) throw new OpError('BAD_REQUEST', '报价已过期，请重新预览');
    const quote = stored.data as { op: number; payload: Record<string, unknown>; blockers: string[] };
    if (quote.blockers && quote.blockers.length > 0) throw new OpError('FORBIDDEN', quote.blockers.join('；'));
    const handler = handlers[quote.op];
    if (!handler) throw new OpError('INTERNAL', '报价对应的操作不存在');
    return runHandler(ctx, quote.op, handler, quote.payload ?? {});
  },

  [OP.GET_SHOP]: ctx => ({
    season: dateOf(ctx.player.day).season,
    // 旧档 shop 表可能还存着已迁往地区商店的旧行：只展示当前王都商店在售商品。
    // 庆典窗口内整店打折（docs/38）：price 为实付单价，basePrice 为原价，discount 为折扣百分比（非庆典为 0）。
    items: ctx.store.shop(ctx.player.id).filter(row => isCentralShopItem(row.item)).map(row => ({ item: row.item, name: GAME_ITEMS[row.item].name,
      discount: festivalDiscount(ctx.player.id, ctx.player.day, row.item), basePrice: GAME_ITEMS[row.item].price,
      price: festivalPrice(GAME_ITEMS[row.item].price, festivalDiscount(ctx.player.id, ctx.player.day, row.item)), stock: row.stock, kind: GAME_ITEMS[row.item].kind })),
  }),

  [OP.BUY]: (ctx, data) => {
    const item = asString(data.item, 'item');
    const count = Math.max(1, Math.min(10, typeof data.count === 'number' ? data.count : 1));
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有商品 ${item}`);
    // 已迁往地区声望商店的旧商品即使残留在旧档 SQLite 行里也不能再买。
    if (!isCentralShopItem(item)) throw new OpError('NOT_FOUND', '王都不再出售这件物品；进阶武器请到对应地区的声望商店购买');
    const stockRow = ctx.store.shop(ctx.player.id).find(s => s.item === item);
    if (!stockRow || stockRow.stock < count) throw new OpError('BAD_REQUEST', '库存不足');
    const price = festivalPrice(GAME_ITEMS[item].price, festivalDiscount(ctx.player.id, ctx.player.day, item)) * count;
    if (ctx.player.gold < price) throw new OpError('NOT_ENOUGH_GOLD', `需要 ${price} 金币`);
    ctx.player.gold -= price;
    ctx.store.setShopStock(ctx.player.id, item, stockRow.stock - count);
    ctx.store.addInventory(ctx.player.id, item, GAME_ITEMS[item].uses ?? 0, count);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'buy' });
    return { item, count, price, gold: ctx.player.gold };
  },

  [OP.REFINE_WEAPON]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const item = asString(data.item, 'item');
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能精炼');
    if (ctx.store.activeAnnualEntry(ctx.player.id)) throw new OpError('FORBIDDEN', '大竞技场期间不能精炼');
    if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', '远征／派遣中的角色不能精炼');
    if (item !== 'fw_weapon_85') throw new OpError('BAD_REQUEST', '仅支持 fw_weapon_85 精炼');
    const instance = unit.weaponInstances?.find(row => row.id === item);
    if (!unit.weapons.includes(item) || !instance) throw new OpError('NO_SUCH_ITEM', '该单位没有携带这件武器实例');
    const level = instance.refinement === undefined ? 0 : instance.refinement;
    if (!Number.isInteger(level) || level < 0 || level >= 3) throw new OpError('BAD_REQUEST', '精炼等级须为0至2，最高3级');
    const refinement = level + 1;
    const costGold = 300 * refinement;
    const costOre = refinement;
    if (ctx.player.gold < costGold) throw new OpError('NOT_ENOUGH_GOLD', `需要 ${costGold} 金币`);
    if (ctx.store.countInventory(ctx.player.id, 'ore') < costOre) throw new OpError('NO_SUCH_ITEM', `需要 ${costOre} 矿石`);
    ctx.store.takeInventory(ctx.player.id, 'ore', costOre);
    ctx.player.gold -= costGold;
    instance.refinement = refinement;
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'refine-weapon' });
    return { unit: unit.id, item, refinement, costGold, costOre, gold: ctx.player.gold };
  },

  [OP.SELL]: (ctx, data) => {
    const item = asString(data.item, 'item');
    const count = data.count === undefined ? 1 : data.count;
    const uses = data.uses;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) throw new OpError('BAD_REQUEST', 'count 需要正整数');
    if (uses !== undefined && (typeof uses !== 'number' || !Number.isSafeInteger(uses) || uses < 0)) throw new OpError('BAD_REQUEST', 'uses 需要非负整数');
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    if (GAME_ITEMS[item].bound) throw new OpError('FORBIDDEN', GAME_ITEMS[item].kind === 'key' ? '任务物品不能出售' : '这件唯一武器已绑定，不能出售');
    const taken = ctx.store.takeInventory(ctx.player.id, item, count, uses as number | undefined);
    if (taken === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
    for (let i = 0; i < taken; i++) {
      const index = ctx.player.flags.storedWeapons?.findIndex(row => row.id === item) ?? -1;
      if (index >= 0) ctx.player.flags.storedWeapons!.splice(index, 1);
      const book = ctx.player.flags.storedBooks?.findIndex(row => row.id === item) ?? -1;
      if (book >= 0) ctx.player.flags.storedBooks!.splice(book, 1);
    }
    const gain = Math.floor(GAME_ITEMS[item].price / 2) * taken;
    ctx.player.gold += gain;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'sell' });
    return { item, count: taken, gold: ctx.player.gold, gained: gain };
  },

  [OP.TRANSFER_ITEM]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.lockedDispatchId) throw new OpError('FORBIDDEN', '派遣中的角色不能搬运物品');
    // 战斗与远征按出发时的物资结算，途中改动会在结算时被覆盖或复制，所以出战中的角色不能搬运。
    if (unit.lockedRunId || ctx.store.activeBattle(ctx.player.id)?.state.units.some(u => u.id === unit.id && u.side === 'player')) {
      throw new OpError('BATTLE_IN_PROGRESS', '该角色正在战斗或远征中，结束后再整理物品');
    }
    const item = asString(data.item, 'item');
    const action = asString(data.action, 'action');
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    // 大竞技场整届固定物资，不能中途补给（docs/13 §6.2）。
    const annual = ctx.store.activeAnnualEntry(ctx.player.id);
    if (annual && annual.unitIds.includes(unit.id) && (action === 'toUnit' || action === 'equip')) {
      throw new OpError('FORBIDDEN', '大竞技场整届固定物资，报名名单中的角色不能中途补给');
    }
    const kind = GAME_ITEMS[item].kind;
    const isWeapon = kind === 'weapon';
    // 魔道书与杖的剩余次数跟着实物走：放回仓库时记下，交给角色时取回，不因搬运补满。
    const charged = isWeapon && (WEAPONS[item as WeaponId].type === 'tome' || WEAPONS[item as WeaponId].type === 'staff');
    if (action === 'equip') {
      if (!unit.weapons.includes(item as never)) throw new OpError('BAD_REQUEST', '该单位没有携带这件武器');
      if (!canWield(unit, item as WeaponId)) throw new OpError('FORBIDDEN', '当前职业不能使用这类武器，或武器所需熟练度不足');
      const index = unit.weapons.indexOf(item as never);
      unit.weapons.splice(index, 1);
      unit.weapons.unshift(item as never);
    } else if (action === 'toUnit') {
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
      if (isWeapon) {
        if (unit.weapons.length >= 5) throw new OpError('BAD_REQUEST', '武器携带栏已满');
        if (ctx.store.takeInventory(ctx.player.id, item, 1) === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件武器');
        const storedIndex = ctx.player.flags.storedWeapons?.findIndex(row => row.id === item) ?? -1;
        unit.weaponInstances ??= [];
        if (storedIndex >= 0) {
          unit.weaponInstances.push(ctx.player.flags.storedWeapons!.splice(storedIndex, 1)[0]);
        } else {
          const perfect = ctx.player.flags.perfectWeapons?.[item] ?? 0;
          if (perfect > 0) ctx.player.flags.perfectWeapons![item] = perfect - 1;
          const max = weaponMax(item as never) + (perfect > 0 ? 10 : 0);
          unit.weaponInstances.push({ id: item as never, durability: max, maxDurability: max });
        }
        if (charged) {
          const bookIndex = ctx.player.flags.storedBooks?.findIndex(row => row.id === item) ?? -1;
          unit.bookInstances ??= [];
          unit.bookInstances.push(bookIndex >= 0 ? ctx.player.flags.storedBooks!.splice(bookIndex, 1)[0] : { id: item as WeaponId, charges: bookMax(item as WeaponId), maxCharges: bookMax(item as WeaponId) });
        }
        unit.weapons.push(item as never);
      } else if (kind === 'spellbook') {
        const spell = GAME_ITEMS[item].spell!;
        unit.spellbooks ??= [];
        if (unit.spellbooks.length >= SPELLBOOK_CARRY) throw new OpError('BAD_REQUEST', `法术书携带栏已满（最多 ${SPELLBOOK_CARRY} 本）`);
        if (unit.spellbooks.some(row => row.id === spell)) throw new OpError('BAD_REQUEST', '已经携带同一种法术书');
        const charges = ctx.store.takeStack(ctx.player.id, item, typeof data.uses === 'number' ? data.uses : null);
        if (charges === null) throw new OpError('NO_SUCH_ITEM', '仓库里没有这本书');
        unit.spellbooks.push({ id: spell, charges, maxCharges: SPELLBOOK_BY_ID.get(spell)!.maxCharges });
      } else {
        // 只有武器、法术书和战斗道具能带进战斗；材料、转职印、能力药留在仓库 (docs/00 §6「材料不占战斗携带栏」)。
        if (kind !== 'consumable') throw new OpError('BAD_REQUEST', `${GAME_ITEMS[item].name}不能带进战斗`);
        if (item === 'immortal_shield' && unit.items.some(entry => entry.id === 'immortal_shield')) throw new OpError('FORBIDDEN', '每名角色最多携带 1 枚不朽盾');
        if (unit.items.length >= 5) throw new OpError('BAD_REQUEST', '携带栏已满');
        const uses = ctx.store.takeStack(ctx.player.id, item, typeof data.uses === 'number' ? data.uses : null);
        if (uses === null) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
        unit.items.push({ id: item as never, uses });
      }
    } else if (action === 'toWarehouse') {
      if (isWeapon) {
        const index = unit.weapons.indexOf(item as never);
        if (index < 0) throw new OpError('NO_SUCH_ITEM', '该单位没有携带这件武器');
        unit.weapons.splice(index, 1);
        const instanceIndex = unit.weaponInstances?.findIndex(row => row.id === item) ?? -1;
        if (instanceIndex >= 0) {
          ctx.player.flags.storedWeapons ??= [];
          ctx.player.flags.storedWeapons.push(unit.weaponInstances!.splice(instanceIndex, 1)[0]);
        }
        const bookIndex = charged ? unit.bookInstances?.findIndex(row => row.id === item) ?? -1 : -1;
        if (bookIndex >= 0) (ctx.player.flags.storedBooks ??= []).push(unit.bookInstances!.splice(bookIndex, 1)[0]);
        ctx.store.addInventory(ctx.player.id, item, 0, 1);
      } else if (kind === 'spellbook') {
        const index = unit.spellbooks?.findIndex(row => row.id === GAME_ITEMS[item].spell) ?? -1;
        if (index < 0) throw new OpError('NO_SUCH_ITEM', '该单位没有携带这本书');
        const [book] = unit.spellbooks!.splice(index, 1);
        // 剩余次数随书回仓库，不会变回满的。
        ctx.store.addInventory(ctx.player.id, item, book.charges, 1);
      } else {
        const index = unit.items.findIndex(i => i.id === item);
        if (index < 0) throw new OpError('NO_SUCH_ITEM', '该单位没有这件物品');
        const [stack] = unit.items.splice(index, 1);
        // 剩余次数随物品回仓库，不会变回满的。
        ctx.store.addInventory(ctx.player.id, item, stack.uses, 1);
      }
    } else {
      throw new OpError('BAD_REQUEST', 'action 只能是 equip / toUnit / toWarehouse');
    }
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'transfer' });
    return unitDetail(unit, ctx.player.day);
  },

  [OP.USE_ITEM]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.lockedDispatchId) throw new OpError('FORBIDDEN', '派遣中的角色不能使用道具');
    const item = asString(data.item, 'item');
    if (!isItemKey(item)) throw new OpError('NOT_FOUND', `没有物品 ${item}`);
    if (GAME_ITEMS[item].kind === 'stat') {
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
      if (ctx.store.countInventory(ctx.player.id, item) === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件物品');
      let result: ReturnType<typeof useDrug>;
      try {
        result = useDrug(unit, item);
      } catch (error) {
        // 额度用满或属性已到上限：不扣道具 (docs/00 §9「溢出使用应拦截」)。
        throw new OpError('FORBIDDEN', error instanceof Error ? error.message : String(error));
      }
      ctx.store.takeInventory(ctx.player.id, item, 1);
      ctx.store.saveUnit(unit, ctx.player.id);
      ctx.push(OP.STATE_CHANGED, { reason: 'use-item' });
      return { unit: unit.id, stat: result.stat, amount: result.amount, stats: unit.stats, drugCounts: unit.drugCounts };
    }
    if (GAME_ITEMS[item].kind === 'manual') {
      // 限量教材：为一名有对应魔法权限的角色解锁法术，消耗教材；施放仍须持书并达到熟练度。
      const book = SPELLBOOK_BY_ID.get(GAME_ITEMS[item].spell!)!;
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
      if (ctx.store.countInventory(ctx.player.id, item) === 0) throw new OpError('NO_SUCH_ITEM', '仓库里没有这件教材');
      if (CLASSES[unit.classId].weapons[book.study === 'whiteMagic' ? 'staff' : 'tome'] === undefined) {
        throw new OpError('FORBIDDEN', `${unitName(unit)}的现职业没有${book.study === 'whiteMagic' ? '白魔法' : '黑魔法'}权限`);
      }
      if (unit.learnedSpells?.includes(book.id)) throw new OpError('FORBIDDEN', `${unitName(unit)}已经学会${book.name}`);
      ctx.store.takeInventory(ctx.player.id, item, 1);
      unit.learnedSpells = [...(unit.learnedSpells ?? []), book.id];
      ctx.store.saveUnit(unit, ctx.player.id);
      ctx.push(OP.STATE_CHANGED, { reason: 'use-item' });
      return { unit: unit.id, learnedSpell: book.id, learnedSpells: unit.learnedSpells };
    }
    throw new OpError('BAD_REQUEST', '这件物品不能这样使用');
  },

  [OP.PROMOTE]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const name = asString(data.promotion, 'promotion');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能转职');
    const target = Object.hasOwn(CLASSES, name) ? canonicalClassId(name as keyof typeof CLASSES) : name;
    const promotion = promotionsFor(unit.classId).find(p => p.name === name || p.to === target);
    if (!promotion) throw new OpError('NOT_FOUND', `当前职业没有转职方向 ${name}`);
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    return handlers[OP.SWITCH_CLASS](ctx, { ...data, classId: promotion.to });
  },

  [OP.ASSIGN_BEXP]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const amount = Math.min(
      Math.max(1, Math.min(ctx.player.bexp, asNumber(data.amount, 'amount'))),
      Math.max(0, (CLASSES[unit.classId].maxLevel - unit.level) * 100 - unit.exp),
    );
    if (ctx.player.bexp < amount) throw new OpError('BAD_REQUEST', '公共经验不足');
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    // 满级时经验不再累积；先拦下，免得公共经验被白白扣掉。
    if (unit.level >= CLASSES[unit.classId].maxLevel) throw new OpError('FORBIDDEN', '已满级，不能再分配经验');
    ctx.player.bexp -= amount;
    const ups = gainExperience(unit, amount, seedRng(`bexp:${unit.id}:${ctx.player.day}:${amount}`));
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'bexp' });
    return { unit: unit.id, amount, level: unit.level, exp: unit.exp, levelUps: ups, bexp: ctx.player.bexp };
  },

  [OP.DISMISS]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.isProtagonist) throw new OpError('FORBIDDEN', '不能解雇主角');
    ctx.store.removeUnit(ctx.player.id, unit.id);
    ctx.store.addEvent(ctx.player.id, 'dismiss', `${unitName(unit)} 离开了军团。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'dismiss' });
    return { unit: unit.id, removed: true };
  },

  // ---- permanent legion: legacies, retirement, reincarnation (docs/00 §5、§7) ----

  [OP.GET_LEGACIES]: ctx => {
    const units = ctx.store.units(ctx.player.id);
    return {
      minLevel: LEGACY_MIN_LEVEL,
      legacies: ctx.store.legacies(ctx.player.id).map(legacy => {
        const recipient = legacy.recipientUnitId ? units.find(u => u.id === legacy.recipientUnitId) : undefined;
        return {
          id: legacy.id, sourceUnitId: legacy.sourceUnitId, sourceName: legacy.sourceName,
          cause: legacy.cause, sourceLevel: legacy.sourceLevel, sourceTotal: totalStats(legacy.sourceStats),
          sourceStats: legacy.sourceStats, sourceGrowth: legacy.sourceGrowth,
          state: legacy.state, mode: legacy.mode, recipientUnitId: legacy.recipientUnitId,
          recipientName: recipient ? unitName(recipient) : null,
        };
      }),
    };
  },

  [OP.CLAIM_LEGACY]: (ctx, data) => {
    const legacy = ctx.store.legacy(ctx.player.id, asString(data.legacyId, 'legacyId'));
    if (!ctx.player.flags.legacyUnlocked) throw new OpError('FORBIDDEN', '尚未完成传承解锁任务');
    if (!legacy) throw new OpError('NOT_FOUND', '没有这份遗产');
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const mode = asString(data.mode, 'mode') as LegacyMode;
    if (mode !== 'growth' && mode !== 'numeric') throw new OpError('BAD_REQUEST', 'mode 取 growth / numeric');
    const problem = canClaim(legacy, unit);
    if (problem) throw new OpError('FORBIDDEN', problem);
    const stone = mode === 'growth' ? 'legacy_stone_growth' : 'legacy_stone_numeric';
    if (ctx.store.countInventory(ctx.player.id, stone) < 1) throw new OpError('NO_SUCH_ITEM', `需要一枚${GAME_ITEMS[stone].name}`);
    const preview = previewInheritance(legacy, unit);
    const weights = (data.weights && typeof data.weights === 'object' ? data.weights : {}) as Record<string, number>;
    try { claimLegacy(legacy, unit, mode, weights); }
    catch (error) { throw new OpError('BAD_REQUEST', error instanceof Error ? error.message : String(error)); }
    ctx.store.takeInventory(ctx.player.id, stone, 1);
    ctx.store.saveLegacy(legacy);
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.addEvent(ctx.player.id, 'legacy', `${unitName(unit)} 以${mode === 'growth' ? '成长' : '数值'}传承兑现了 ${legacy.sourceName} 的遗产。`, { unit: unit.id, legacy: legacy.id, mode });
    ctx.push(OP.STATE_CHANGED, { reason: 'legacy' });
    return { legacy: { id: legacy.id, state: legacy.state, mode: legacy.mode, recipientUnitId: legacy.recipientUnitId }, unit: unitDetail(unit), preview };
  },

  [OP.RETIRE_UNIT]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.isProtagonist) throw new OpError('FORBIDDEN', '主角不能退役');
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', '远征／派遣中的角色不能退役');
    const legacyId = recordRetire(ctx.store, ctx.player, unit);
    ctx.push(OP.STATE_CHANGED, { reason: 'retire' });
    return { unit: unit.id, status: unit.status, legacyId };
  },

  [OP.REINCARNATE_UNIT]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const problem = canReincarnate(unit);
    if (problem) throw new OpError('FORBIDDEN', problem);
    if (ctx.store.countInventory(ctx.player.id, 'reincarnation_core') < 1) throw new OpError('NO_SUCH_ITEM', '需要一枚轮回核心');
    const cost = REINCARNATION_GOLD;
    if (ctx.player.gold < cost) throw new OpError('NOT_ENOUGH_GOLD', `轮回需要 ${cost} 金币`);
    const allocation = (data.allocation && typeof data.allocation === 'object' ? data.allocation : {}) as Record<string, number>;
    const initial = unit.species === 'human' ? initialClassOf(unit.homeClassId ?? CHARACTERS[unit.character].classId) : initialClass(unit.species);
    // 轮回只清学习成果（docs/00 §5.2），不没收装备：携带的武器与道具连同剩余次数回到仓库。
    // 先记下来，轮回校验通过后再入库，校验失败时什么都不写。
    // 武器耐久／强化、魔道书与杖次数、法术书次数都跟着实物回仓库，不因轮回补满。
    const gear = { weapons: [...unit.weapons], items: unit.items.map(i => ({ ...i })), spellbooks: (unit.spellbooks ?? []).map(row => ({ ...row })) };
    const instances = (unit.weaponInstances ?? []).map(row => ({ ...row })), books = (unit.bookInstances ?? []).map(row => ({ ...row }));
    let result: ReturnType<typeof reincarnate>;
    try {
      result = reincarnate(unit, allocation as never, initial, DAYS_PER_YEAR, ctx.player.day);
    } catch (error) {
      throw new OpError('FORBIDDEN', error instanceof Error ? error.message : String(error));
    }
    for (const weapon of gear.weapons) ctx.store.addInventory(ctx.player.id, weapon as ItemKey, 0, 1);
    for (const item of gear.items) ctx.store.addInventory(ctx.player.id, item.id as ItemKey, item.uses, 1);
    for (const book of gear.spellbooks) ctx.store.addInventory(ctx.player.id, spellbookItem(book.id), book.charges, 1);
    (ctx.player.flags.storedWeapons ??= []).push(...instances.filter(row => gear.weapons.includes(row.id)));
    (ctx.player.flags.storedBooks ??= []).push(...books.filter(row => gear.weapons.includes(row.id)));
    ctx.store.takeInventory(ctx.player.id, 'reincarnation_core', 1);
    ctx.player.gold -= cost;
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.saveReincarnation(ctx.player.id, unit.id, result.record);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'reincarnate', `${unitName(unit)} 完成轮回，回到 ${CLASSES[initial].name} 与 16 岁。`, { unit: unit.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'reincarnate' });
    return { unit: unitDetail(unit), allocation: result.allocation, baseStats: result.baseStats, returned: gear };
  },

  [OP.GET_MEMORIAL]: ctx => {
    const legacies = ctx.store.legacies(ctx.player.id);
    const units = ctx.store.units(ctx.player.id);
    const record = serviceRecords(ctx);
    return {
      memorials: ctx.store.memorials(ctx.player.id).map(row => {
        const m = row.data;
        const unit = units.find(u => u.id === m.unitId);
        const left = legacies.find(l => l.sourceUnitId === m.unitId);
        const received = unit?.receivedLegacyId ? legacies.find(l => l.id === unit.receivedLegacyId) : undefined;
        const battle = m.battleId ? ctx.store.battle(ctx.player.id, m.battleId) : null;
        const heir = left?.recipientUnitId ? units.find(u => u.id === left.recipientUnitId) : undefined;
        return {
          ...m, className: CLASSES[m.classId as keyof typeof CLASSES]?.name ?? m.classId, date: dateOf(m.atDay),
          origin: unit ? unitOrigin(unit) : null, age: unit?.age ?? null, joinedDay: unit?.joinedDay ?? null, cycle: unit?.cycle ?? 0,
          sex: unit?.sex ?? null, portrait: unit?.portrait ?? null,
          battle: battle ? { id: battle.id, name: battle.name, mode: battle.mode, turn: battle.state.turn, reason: battle.state.result?.reason ?? null } : null,
          legacy: left ? { id: left.id, state: left.state, mode: left.mode, recipientName: heir ? unitName(heir) : null } : null,
          inherited: received ? { sourceName: received.sourceName, mode: received.mode } : null,
          record: record.get(m.unitId) ?? { battles: 0, wins: 0, kills: 0 },
        };
      }),
      emergency: emergencyStatus(ctx),
    };
  },

  [OP.EMERGENCY_RECRUIT]: ctx => {
    const { blocker, deaths } = emergencyStatus(ctx);
    if (blocker) throw new OpError('FORBIDDEN', blocker);
    const level = Math.max(1, regionLevel(ctx.player.flags.clearedRegions.length, 0) - 4);
    const created: ReturnType<typeof unitSummary>[] = [];
    for (let i = 0; i < EMERGENCY_UNITS; i++) {
      const seed = `emergency:${ctx.player.id}:${deaths}:${i}`;
      const candidate = generateRecruit(seed);
      const unit = randomRecruitUnit(candidate, 0, ctx.player.day, seed, level);
      ctx.store.addUnit(ctx.player.id, unit);
      created.push(unitSummary(unit, ctx.player.day));
    }
    ctx.player.flags.emergencyClaimed = deaths;
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'recruit', `严重损失补员：酒馆免费加入 ${created.length} 人。`, { units: created.map(u => u.id) });
    ctx.push(OP.STATE_CHANGED, { reason: 'emergency-recruit' });
    return { units: created, free: true };
  },

  [OP.GET_CLASS_MARKET]: (ctx, data) => {
    const year = dateOf(ctx.player.day).year;
    const unit = typeof data.unitId === 'string' ? ctx.store.unit(ctx.player.id, data.unitId) : null;
    return {
      year,
      monthLimit: CLASS_PURCHASE_LIMIT,
      monthUsed: ctx.player.flags.classPurchases?.[periodIdFor(Date.now())] ?? 0,
      classes: CATALOG_CLASS_IDS.filter(id => CLASSES[id].stage > 0).map(id => ({
        id, name: CLASSES[id].name, stage: CLASSES[id].stage, route: CLASSES[id].route,
        openYear: classOpenYear(id), open: year >= classOpenYear(id) && !classUnavailableReason(id), price: classPrice(id),
        owned: !!unit && hasClassQualification(unit.classQualifications ?? [], id),
        source: CLASSES[id].source, sourceUrl: CLASSES[id].sourceUrl, weapons: CLASSES[id].weapons,
        studies: CLASSES[id].studies, trainingBonus: CLASSES[id].trainingBonus,
        unavailableReason: classUnavailableReason(id),
        eligibilityReason: unit ? classChangeReason(unit, id) : null,
        // 换成该职业后的合计成长（服务端同一公式，含个人、分配、装备与年龄修正）。
        growth: unit ? growthRates({ ...unit, classId: id }) : null,
      })),
    };
  },

  [OP.BUY_CLASS_QUALIFICATION]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const requested = asString(data.classId, 'classId') as keyof typeof CLASSES;
    if (!Object.hasOwn(CLASSES, requested)) throw new OpError('NOT_FOUND', `没有职业 ${requested}`);
    const classId = canonicalClassId(requested);
    if (CLASSES[classId].stage === 0) throw new OpError('FORBIDDEN', '基础身份职业不作为购买资格出售');
    const unavailable = classUnavailableReason(classId);
    if (unavailable) throw new OpError('FEATURE_DISABLED', unavailable);
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能购买资格');
    if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', '远征／派遣中的角色不能购买资格');
    const year = dateOf(ctx.player.day).year;
    if (year < classOpenYear(classId)) throw new OpError('FORBIDDEN', `${CLASSES[classId].name} 要到${dateOf((classOpenYear(classId) - 1) * DAYS_PER_YEAR).label}才开放`);
    const eligibility = classChangeReason(unit, classId);
    if (eligibility) throw new OpError('FORBIDDEN', eligibility);
    if (hasClassQualification(unit.classQualifications ?? [], classId)) throw new OpError('FORBIDDEN', '已经拥有该职业资格');
    const price = classPrice(classId);
    if (ctx.player.gold < price) throw new OpError('NOT_ENOUGH_GOLD', `购买 ${CLASSES[classId].name} 需要 ${price} 金币`);
    // 现实月额度只限制购买新资格；切回已购职业不占额度（docs/00 §4.1）。
    const month = periodIdFor(Date.now());
    ctx.player.flags.classPurchases ??= {};
    const used = ctx.player.flags.classPurchases[month] ?? 0;
    if (used >= CLASS_PURCHASE_LIMIT) throw new OpError('FORBIDDEN', `本月购买新资格已达上限（${CLASS_PURCHASE_LIMIT} 个）`);
    ctx.player.flags.classPurchases[month] = used + 1;
    ctx.player.gold -= price;
    unit.classQualifications = [...(unit.classQualifications ?? []), classId];
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'class-market', `${unitName(unit)} 购买职业资格 ${CLASSES[classId].name}（${price} 金币）。`, { unit: unit.id, classId });
    ctx.push(OP.STATE_CHANGED, { reason: 'class-market' });
    return { unit: unit.id, classId, price, gold: ctx.player.gold, qualifications: unit.classQualifications };
  },

  // ---- class mastery and free class switching (docs/00 §4.2.1, docs/13 §5.5) ----

  [OP.GET_MASTERY]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const classes = CATALOG_CLASS_IDS;
    return {
      unit: unit.id, classId: unit.classId, cycle: unit.cycle, slots: SKILL_SLOTS,
      progress: classes.map(id => ({
        classId: id, name: CLASSES[id].name, route: CLASSES[id].route, routeName: ROUTE_NAMES[CLASSES[id].route],
        stage: CLASSES[id].stage, mastery: classMasteryOf(unit, id),
        nodes: masteryNodesFor(id).map(node => ({ id: node.id, threshold: node.threshold, skill: node.skill, art: node.art, name: node.name, referenceIds: node.referenceIds ?? [], unlocked: unlockedNodes(unit, id).includes(node.id) })),
      })),
      learnedSkills: unit.learnedSkills ?? [], learnedArts: unit.learnedArts ?? [], equippedSkills: unit.equippedSkills ?? [], equippedArts: unit.equippedArts ?? [],
      qualifications: unit.classQualifications ?? [],
    };
  },

  [OP.GET_ART_TRAINING]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    return {
      unit: unit.id, day: ctx.player.day, gold: ctx.player.gold,
      choices: ART_TRAINING.map(training => {
        const art = WEAPON_ART_BY_ID.get(training.art)!;
        const blocker = artTrainingProblem(ctx, unit, training)?.message ?? null;
        return { ...training, name: art.name, effect: art.effect, requiresName: WEAPON_ART_BY_ID.get(training.requires)!.name,
          learned: unit.learnedArts?.includes(training.art) ?? false, available: blocker === null, blocker };
      }),
    };
  },

  [OP.TRAIN_ART]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const training = requireArtTraining(asString(data.art, 'art'));
    const problem = artTrainingProblem(ctx, unit, training);
    if (problem) throw problem;
    ctx.player.gold -= training.gold;
    ctx.player.day += training.days;
    unit.learnedArts = [...(unit.learnedArts ?? []), training.art];
    ctx.store.saveUnit(unit, ctx.player.id);
    syncPlayer(ctx.store, ctx.player);
    const name = WEAPON_ART_BY_ID.get(training.art)!.name;
    ctx.store.addEvent(ctx.player.id, 'art-training', `${unitName(unit)} 研修学会 ${name}（${training.days}日／${training.gold}金币）。`, { unit: unit.id, art: training.art });
    ctx.push(OP.STATE_CHANGED, { reason: 'art-training' });
    return { unit: unit.id, art: training.art, name, days: training.days, costGold: training.gold, day: ctx.player.day, gold: ctx.player.gold, learnedArts: unit.learnedArts };
  },

  [OP.SWITCH_CLASS]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const requested = asString(data.classId, 'classId') as keyof typeof CLASSES;
    if (!Object.hasOwn(CLASSES, requested)) throw new OpError('NOT_FOUND', `没有职业 ${requested}`);
    const classId = canonicalClassId(requested);
    const unavailable = classUnavailableReason(classId);
    if (unavailable) throw new OpError('FEATURE_DISABLED', unavailable);
    if (unit.status !== 'active') throw new OpError('BAD_REQUEST', '该单位不在现役名册');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能换职');
    if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', '远征／派遣中的角色不能换职');
    const eligibility = classChangeReason(unit, classId);
    if (eligibility) throw new OpError('FORBIDDEN', eligibility);
    // 已购资格或本轮起始职业可免费切回，形象不授予其原人物的职业资格。
    const owned = hasClassQualification(unit.classQualifications ?? [], classId) || classId === canonicalClassId(unit.classId) || classId === canonicalClassId(unit.homeClassId ?? CHARACTERS[unit.character].classId);
    if (!owned) throw new OpError('FORBIDDEN', '尚未购买该职业资格');
    switchClass(unit, classId);
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.addEvent(ctx.player.id, 'class-switch', `${unitName(unit)} 切换职业为 ${CLASSES[classId].name}。`, { unit: unit.id, classId });
    ctx.push(OP.STATE_CHANGED, { reason: 'class-switch' });
    return unitDetail(unit, ctx.player.day);
  },

  [OP.EQUIP_SKILLS]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    if (unit.status !== 'active') throw new OpError('FORBIDDEN', '该单位不在现役名册');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '战斗结束后才能调整技能格');
    if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', '远征／派遣中的角色不能调整技能格');
    if (!Array.isArray(data.skills) || data.skills.some(id => typeof id !== 'string')) throw new OpError('BAD_REQUEST', 'skills 需要字符串数组');
    if (data.arts !== undefined && (!Array.isArray(data.arts) || data.arts.some(id => typeof id !== 'string'))) throw new OpError('BAD_REQUEST', 'arts 需要字符串数组');
    const problem = setEquippedSkills(unit, data.skills as never[], data.arts as string[] | undefined);
    if (problem) throw new OpError('FORBIDDEN', problem);
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.push(OP.STATE_CHANGED, { reason: 'equip-skills' });
    return { unit: unit.id, equippedSkills: unit.equippedSkills, equippedArts: unit.equippedArts, slots: SKILL_SLOTS };
  },

  // ---- dungeon runs (docs/00 §8.1.3, docs/13 §4.3) ---------------------

  [OP.GET_RUN]: ctx => {
    const run = ctx.store.activeRun(ctx.player.id) ?? ctx.store.latestRun(ctx.player.id);
    return { run: run ? runSummary(run) : null };
  },

  [OP.START_DUNGEON]: (ctx, data) => {
    const aiDifficulty = asAiDifficulty(data.aiDifficulty);
    if (aiDifficulty === 'hard' && !hardUnlocks(ctx.store, ctx.player).dungeons.includes(asNumber(data.region, 'region'))) throw new OpError('FORBIDDEN', '先以普通难度完整通关本地区副本，才能挑战困难副本');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const lifeBlock = lifespanBlockers(ctx, ctx.player.day + DUNGEON_STAGE_DAYS);
    if (lifeBlock.length) throw new OpError('FORBIDDEN', lifeBlock.join('；'));
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '已有进行中的远征');
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    if (!combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player))) throw new OpError('FORBIDDEN', '完成一次地区讨伐后开放大副本');
    const { encounter, stages } = dungeonPlan(ctx.player, region, aiDifficulty);
    const ready = deploymentUnits(ctx, data.unitIds, encounter.maxUnits);
    // 出发时锁定等级、名单与物品；只有实际创建 run 才锁配置（docs/13 §4.4）。
    const level = enemyLevel(ctx.player.day, regionById(region).offset);
    const run = createRun(`run-${randomUUID().slice(0, 8)}`, ctx.player.id, region, ready.map(u => u.id), level, ctx.player.flags.clearedRegions.length, { aiDifficulty, encounter, stages });
    for (const unit of ready) { unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); }
    ctx.player.day += DUNGEON_STAGE_DAYS;
    syncPlayer(ctx.store, ctx.player);
    const seed = randomUUID().slice(0, 8);
    const record = createFieldBattle(ready, { region, cleared: run.clearedAtStart, day: ctx.player.day - DUNGEON_STAGE_DAYS, seed, level, stageIndex: 0, runId: run.id, aiDifficulty, encounter });
    record.playerId = ctx.player.id;
    run.battleId = record.id;
    ctx.store.saveRun(run);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'dungeon', `进入 ${regionById(region).name} 大副本（第 1 图）。`, { runId: run.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { run: runSummary(run), battleId: record.id, battle: battleView(record, false) };
  },

  [OP.CONTINUE_DUNGEON]: ctx => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const run = ctx.store.activeRun(ctx.player.id);
    if (!run || run.state !== 'between_maps') throw new OpError('NOT_FOUND', '没有等待继续的远征');
    // 下一张只能使用原名单中仍存活、未离队的角色（docs/00 §8.1.3）。
    const units = survivingIds(run.carry).map(id => ctx.store.unit(ctx.player.id, id)).filter((u): u is NonNullable<typeof u> => !!u && u.status === 'active');
    if (units.length === 0) throw new OpError('FORBIDDEN', '没有存活的队员，只能撤离');
    const scenarioId = stageScenario(run, run.stageIndex);
    if (scenarioId) {
      const maxUnits = classicAdaptation(scenarioId).deployment.max;
      if (units.length > maxUnits) throw new OpError('FORBIDDEN', `本图最多出战 ${maxUnits} 人`);
    }
    const runQuest = run.questId ? questById(run.questId) : undefined;
    if (runQuest?.betweenMapHeal) {
      for (const unit of units) {
        const carry = run.carry[unit.id];
        if (carry) carry.hp = Math.min(unit.stats.hp, carry.hp + Math.floor(unit.stats.hp * runQuest.betweenMapHeal / 100));
      }
    }
    ctx.player.day += run.stageDays ?? DUNGEON_STAGE_DAYS;
    syncPlayer(ctx.store, ctx.player);
    const seed = randomUUID().slice(0, 8);
    const record = scenarioId
      ? createClassicBattle(units, { aiDifficulty: run.aiDifficulty ?? 'normal', mapId: scenarioId, seed, quest: runQuest,
          level: run.stages || runQuest?.dungeonOnly ? run.level : undefined, stageIndex: run.stageIndex, runId: run.id, carry: run.carry, day: ctx.player.day,
          lootRank: lootRankOf(ctx.player), claimed: ctx.player.flags.secretsClaimed ?? [], season: dateOf(ctx.player.day - (run.stageDays ?? DUNGEON_STAGE_DAYS)).season })
      : createFieldBattle(units, { aiDifficulty: run.aiDifficulty ?? 'normal', region: run.region, cleared: run.clearedAtStart, day: ctx.player.day - (run.stageDays ?? DUNGEON_STAGE_DAYS), seed, level: run.level, stageIndex: run.stageIndex, runId: run.id, carry: run.carry, quest: runQuest, encounter: run.encounter, legacyDeployment: !run.encounter });
    record.playerId = ctx.player.id;
    record.region = run.region;
    record.costDays = run.stageDays ?? DUNGEON_STAGE_DAYS;
    run.state = 'battle';
    run.battleId = record.id;
    ctx.store.saveRun(run);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'dungeon', `${regionById(run.region).name} 大副本第 ${run.stageIndex + 1} 图开始。`, { runId: run.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { run: runSummary(run), battleId: record.id, battle: battleView(record, false) };
  },

  [OP.WITHDRAW_RUN]: ctx => {
    const run = ctx.store.activeRun(ctx.player.id);
    if (!run) throw new OpError('NOT_FOUND', '没有进行中的远征');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('FORBIDDEN', '战斗中请先用 RETREAT 撤离');
    run.state = 'withdrawn';
    for (const id of run.unitIds) {
      const unit = ctx.store.unit(ctx.player.id, id);
      if (unit?.lockedRunId === run.id) { unit.lockedRunId = null; ctx.store.saveUnit(unit, ctx.player.id); }
    }
    ctx.store.saveRun(run);
    flushRecoveryBag(ctx.store, ctx.player);
    ctx.store.addEvent(ctx.player.id, 'dungeon', '撤离大副本，未带回的掉落作废。', { runId: run.id });
    return { run: runSummary(run) };
  },

  // ---- background dispatches (docs/00 §9.1.1, docs/13 §5.5) -------------

  [OP.GET_DISPATCHES]: ctx => {
    // 达到 return_day 的派遣在此一次结算；纯读取不发新奖励，这里只把到期项落账。
    settleDispatches(ctx.store, ctx.player);
    const all = ctx.store.dispatches(ctx.player.id);
    return {
      day: ctx.player.day,
      running: all.filter(d => d.state === 'running').map(dispatchSummary),
      history: all.filter(d => d.state !== 'running').slice(0, 10).map(dispatchSummary),
      limits: { minDays: DISPATCH_MIN_DAYS, maxDays: DISPATCH_MAX_DAYS, maxUnits: DISPATCH_MAX_UNITS },
    };
  },

  [OP.START_DISPATCH]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    if (!combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player))) throw new OpError('FORBIDDEN', '完成一次地区讨伐后开放派遣');
    regionById(region);
    const days = Math.floor(asNumber(data.durationDays, 'durationDays'));
    if (days < DISPATCH_MIN_DAYS || days > DISPATCH_MAX_DAYS) throw new OpError('BAD_REQUEST', `派遣天数需在 ${DISPATCH_MIN_DAYS}–${DISPATCH_MAX_DAYS} 之间`);
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    if (ids.length === 0) throw new OpError('BAD_REQUEST', '至少派出一名角色');
    if (ids.length > DISPATCH_MAX_UNITS) throw new OpError('BAD_REQUEST', `一次最多派出 ${DISPATCH_MAX_UNITS} 人`);
    const units = ids.map(id => requireUnit(ctx.store, ctx.player, id));
    // 已锁定正式赛事名单的角色不能再派出去（docs/13 §5.5）。
    const annual = ctx.store.activeAnnualEntry(ctx.player.id);
    for (const unit of units) {
      if (unit.status !== 'active') throw new OpError('BAD_REQUEST', `${unitName(unit)} 不在现役名册`);
      if (unit.lockedRunId || unit.lockedDispatchId) throw new OpError('FORBIDDEN', `${unitName(unit)} 已被远征或派遣占用`);
      if (annual && annual.unitIds.includes(unit.id)) throw new OpError('FORBIDDEN', `${unitName(unit)} 已锁定在大竞技场名单中`);
    }
    const requested = (typeof data.classId === 'string' ? data.classId : units[0].classId) as keyof typeof CLASSES;
    if (!Object.hasOwn(CLASSES, requested)) throw new OpError('NOT_FOUND', `没有职业 ${requested}`);
    const classId = canonicalClassId(requested);
    const unavailable = classUnavailableReason(classId);
    if (unavailable) throw new OpError('FEATURE_DISABLED', unavailable);
    for (const unit of units) {
      const eligibility = classChangeReason(unit, classId);
      if (eligibility) throw new OpError('FORBIDDEN', eligibility);
      const owned = hasClassQualification(unit.classQualifications ?? [], classId) || classId === canonicalClassId(unit.classId) || classId === canonicalClassId(unit.homeClassId ?? CHARACTERS[unit.character].classId);
      if (!owned) throw new OpError('FORBIDDEN', `${unitName(unit)} 没有 ${CLASSES[classId].name} 资格`);
    }
    const defaultWeapon = units[0].weapons[0] ? WEAPONS[units[0].weapons[0]].type : (Object.keys(CLASSES[classId].weapons)[0] as WeaponType);
    const weaponType = (typeof data.weaponType === 'string' ? data.weaponType : defaultWeapon) as WeaponType;
    if (!CLASSES[classId].weapons[weaponType]) throw new OpError('BAD_REQUEST', `${CLASSES[classId].name} 不能训练该武器`);
    const dispatch = createDispatch(`disp-${randomUUID().slice(0, 8)}`, ctx.player.id, region, units.map(u => u.id), days, classId, weaponType, ctx.player.day);
    for (const unit of units) { unit.lockedDispatchId = dispatch.id; ctx.store.saveUnit(unit, ctx.player.id); }
    ctx.store.saveDispatch(dispatch);
    ctx.store.addEvent(ctx.player.id, 'dispatch', `派遣 ${units.length} 人前往 ${regionById(region).name} ${days} 日。`, { dispatchId: dispatch.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'dispatch' });
    return { dispatch: dispatchSummary(dispatch) };
  },

  // ---- production (docs/00 §9.2, docs/13 §2.3) -------------------------

  [OP.GET_PRODUCTION]: ctx => {
    const orders = ctx.store.productionOrders(ctx.player.id).map(o => mature(o, ctx.player.day));
    for (const order of orders) ctx.store.saveProductionOrder(order);
    const open = orders.filter(o => o.state !== 'collected');
    const reputation = ctx.player.flags.regionReputation ?? {};
    // 工坊设施按地区解锁（药草田←地区2、铁匠铺←地区3、炼药所←地区5）；已有订单的设施保留。
    const facilities = workshopFacilities(ctx.store, ctx.player, playerRegions(ctx.player));
    return {
      day: ctx.player.day,
      facilities: FACILITIES.filter(f => facilities[f.id]).map(f => ({ ...f, used: slotsUsed(open, f.id) })),
      recipes: RECIPES.filter(r => facilities[r.facility]).map(r => ({ id: r.id, name: r.name, facility: r.facility, days: r.days, input: r.input, output: r.output, kind: r.kind, requires: r.requires ?? null, unlocked: recipeUnlocked(r, reputation) })),
      // 已有订单（含其它设施的历史单）始终可见，避免旧档内容被锁死。
      orders: open.map(o => ({ id: o.id, recipeId: o.recipeId, facilityId: o.facility, ...describeOrder(o), startedDay: o.startedDay, quality: o.quality })),
      ready: open.filter(o => o.state === 'ready').map(o => o.id),
    };
  },

  [OP.PLANT]: ctx => {
    const recipe = recipeById('plant_herb')!;
    if (!workshopFacilities(ctx.store, ctx.player, playerRegions(ctx.player)).garden) throw new OpError('FORBIDDEN', '解锁希尔瓦林地（地区2）后才能开辟药草田');
    if (!canStart(ctx.store.productionOrders(ctx.player.id), recipe)) throw new OpError('FORBIDDEN', '药草田工位已满');
    if (ctx.store.countInventory(ctx.player.id, 'seed') < 1) throw new OpError('NO_SUCH_ITEM', '没有种子');
    ctx.store.takeInventory(ctx.player.id, 'seed', 1);
    // 播种消耗种子并推进 1 日（docs/00 §9.2）。
    ctx.player.day += 1;
    const order = createOrder(`po-${randomUUID().slice(0, 8)}`, ctx.player.id, recipe, ctx.player.day);
    ctx.store.saveProductionOrder(order);
    syncPlayer(ctx.store, ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'plant' });
    return { order: { id: order.id, ...describeOrder(order) }, day: ctx.player.day };
  },

  [OP.START_PRODUCTION]: (ctx, data) => {
    const recipe = recipeById(asString(data.recipeId, 'recipeId'));
    if (!recipe) throw new OpError('NOT_FOUND', '没有这个配方');
    if (!workshopFacilities(ctx.store, ctx.player, playerRegions(ctx.player))[recipe.facility]) {
      throw new OpError('FORBIDDEN', `${facilityById(recipe.facility).name}尚未解锁：先在世界地图解锁对应地区`);
    }
    if (!recipeUnlocked(recipe, ctx.player.flags.regionReputation ?? {})) {
      const req = recipe.requires!;
      throw new OpError('FORBIDDEN', `需要 ${regionById(req.region).name} 声望 ${req.reputation} 才能开工`);
    }
    if (!canStart(ctx.store.productionOrders(ctx.player.id), recipe)) throw new OpError('FORBIDDEN', `${facilityById(recipe.facility).name}工位已满`);
    for (const input of recipe.input) {
      if (ctx.store.countInventory(ctx.player.id, input.item) < input.count) throw new OpError('NO_SUCH_ITEM', `缺少${GAME_ITEMS[input.item].name}`);
    }
    // 开工先扣输入、消耗开工日，ready_day = 开工动作结束日 + duration（docs/13 §3.3）。
    const perfect = data.perfect === true;
    const perfectCost = perfect ? 1_500 : 0;
    if (ctx.player.gold < perfectCost) throw new OpError('NOT_ENOUGH_GOLD', `完美锻造需要 ${perfectCost} 金币`);
    ctx.player.gold -= perfectCost;
    for (const input of recipe.input) ctx.store.takeInventory(ctx.player.id, input.item, input.count);
    const order = createOrder(`po-${randomUUID().slice(0, 8)}`, ctx.player.id, recipe, ctx.player.day, perfect ? 'perfect' : 'normal');
    ctx.store.saveProductionOrder(order);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'production' });
    return { order: { id: order.id, ...describeOrder(order) }, day: ctx.player.day };
  },

  [OP.COLLECT_PRODUCTION]: (ctx, data) => {
    const order = ctx.store.productionOrder(ctx.player.id, asString(data.orderId, 'orderId'));
    if (!order) throw new OpError('NOT_FOUND', '没有这个订单');
    if (order.state === 'collected') throw new OpError('FORBIDDEN', '这个订单已经领取过');
    mature(order, ctx.player.day);
    if (order.state !== 'ready') throw new OpError('FORBIDDEN', `还要等到第 ${order.readyDay} 日`);
    // 领取不额外推进日期；产出在开工时固定，不能重抽（docs/13 §2.3）。
    ctx.store.addInventory(ctx.player.id, order.output.item, GAME_ITEMS[order.output.item].uses ?? 0, order.output.count);
    if (order.quality === 'perfect' && GAME_ITEMS[order.output.item].kind === 'weapon') {
      ctx.player.flags.perfectWeapons ??= {};
      ctx.player.flags.perfectWeapons[order.output.item] = (ctx.player.flags.perfectWeapons[order.output.item] ?? 0) + order.output.count;
    }
    ctx.store.savePlayer(ctx.player);
    order.state = 'collected';
    ctx.store.saveProductionOrder(order);
    ctx.push(OP.STATE_CHANGED, { reason: 'collect' });
    return { orderId: order.id, item: order.output.item, count: order.output.count };
  },

  [OP.INN_REST]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id) || isActiveRun(ctx.store.activeRun(ctx.player.id)) || ctx.store.activeAnnualEntry(ctx.player.id)) {
      throw new OpError('FORBIDDEN', '战斗／远征／年度赛事中不能旅馆休息');
    }
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const book = asString(data.book, 'book');
    const instance = bookOf(unit, book, data.spellbook === true);
    if (!instance) throw new OpError('NO_SUCH_ITEM', '这个单位没有携带该书');
    const cost = 200 + unit.level * 10;
    if (ctx.player.gold < cost) throw new OpError('NOT_ENOUGH_GOLD', `旅馆休息需要 ${cost} 金币`);
    ctx.player.gold -= cost;
    ctx.player.day += 1;
    instance.charges = instance.maxCharges;
    ctx.store.saveUnit(unit, ctx.player.id);
    syncPlayer(ctx.store, ctx.player);
    ctx.store.savePlayer(ctx.player);
    return { unit: unit.id, book, charges: [instance.charges, instance.maxCharges], gold: ctx.player.gold, day: ctx.player.day };
  },

  [OP.USE_FOOD]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id) || isActiveRun(ctx.store.activeRun(ctx.player.id)) || ctx.store.activeAnnualEntry(ctx.player.id)) {
      throw new OpError('FORBIDDEN', '战斗／远征／年度赛事中不能使用食物恢复法术书');
    }
    const item = asString(data.item, 'item');
    if (item !== 'ether_ration' && item !== 'full_meal') throw new OpError('BAD_REQUEST', 'item 取 ether_ration / full_meal');
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const book = asString(data.book, 'book');
    const instance = bookOf(unit, book, data.spellbook === true);
    if (!instance) throw new OpError('NO_SUCH_ITEM', '这个单位没有携带该书');
    if (ctx.store.countInventory(ctx.player.id, item) < 1) throw new OpError('NO_SUCH_ITEM', `没有${GAME_ITEMS[item].name}`);
    const restore = item === 'full_meal' ? instance.maxCharges : Math.max(1, Math.ceil(instance.maxCharges / 4));
    instance.charges = Math.min(instance.maxCharges, instance.charges + restore);
    ctx.store.takeInventory(ctx.player.id, item, 1);
    ctx.store.saveUnit(unit, ctx.player.id);
    return { unit: unit.id, book, restored: restore, charges: [instance.charges, instance.maxCharges] };
  },

  [OP.REPAIR_ITEM]: (ctx, data) => {
    const unit = requireUnit(ctx.store, ctx.player, asString(data.unitId, 'unitId'));
    const item = asString(data.item ?? data.weapon, 'item') as WeaponId;
    if (!unit.weapons.includes(item)) throw new OpError('NO_SUCH_ITEM', `${unitName(unit)} 没有携带这件武器`);
    if (WEAPONS[item]?.type === 'staff') {
      const book = (unit.bookInstances ?? []).find(row => row.id === item);
      if (!book) throw new OpError('NO_SUCH_ITEM', '没有可补充的杖实例');
      if (book.charges >= book.maxCharges) throw new OpError('BAD_REQUEST', '这根杖次数已满');
      const staffCost = 150 + (book.maxCharges - book.charges) * 20;
      if (ctx.player.gold < staffCost) throw new OpError('NOT_ENOUGH_GOLD', `补充杖需要 ${staffCost} 金币`);
      ctx.player.gold -= staffCost;
      book.charges = book.maxCharges;
      ctx.store.saveUnit(unit, ctx.player.id);
      ctx.store.savePlayer(ctx.player);
      return { item, repaired: 1, gold: ctx.player.gold, durability: [[book.charges, book.maxCharges]] };
    }
    const rows = (unit.weaponInstances ?? []).filter(row => row.id === item);
    if (rows.length === 0) throw new OpError('NO_SUCH_ITEM', '没有可维修的武器实例');
    const damaged = rows.filter(row => row.durability < row.maxDurability);
    if (damaged.length === 0) throw new OpError('BAD_REQUEST', '这件武器耐久已满');
    const cost = 100 + Math.max(...damaged.map(row => row.maxDurability)) * 5;
    if (ctx.player.gold < cost) throw new OpError('NOT_ENOUGH_GOLD', `维修需要 ${cost} 金币`);
    ctx.player.gold -= cost;
    for (const row of damaged) row.durability = row.maxDurability;
    ctx.store.saveUnit(unit, ctx.player.id);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'repair', `${unitName(unit)} 的 ${GAME_ITEMS[item].name} 已修复。`, { unit: unit.id, item });
    return { item, repaired: damaged.length, gold: ctx.player.gold, durability: rows.map(row => [row.durability, row.maxDurability]) };
  },

  // ---- battle ops --------------------------------------------------------

  [OP.GET_BATTLE]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const view = battleView(record, data.detail === true, typeof data.sinceEvent === 'number' ? data.sinceEvent : 0);
    const notes = data.full === true || data.notes === true ? { notes: battleNotes(ctx, record.id) } : {};
    // `full` returns the raw engine state so a browser can resume animation exactly (docs/06).
    return data.full === true ? { ...view, ...notes, state: publicState(record.state) } : { ...view, ...notes };
  },

  [OP.GET_REACHABLE]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const unit = unitById(record.state, asString(data.unitId, 'unitId'));
    if (unit.side !== record.state.phase) throw new OpError('NOT_YOUR_PHASE', '当前不是该单位的阶段');
    const range = moveRange(record.state, unit);
    const stops = [...range.stops].map(key => {
      const pos: Point = [key % record.state.map.width, Math.floor(key / record.state.map.width)];
      const options = actionOptions(record.state, unit, pos);
      const dest = (rule: Parameters<typeof destinationCells>[3] | null) => (rule ? { ...rule, cells: destinationCells(record.state, unit, pos, rule) } : null);
      return {
        pos, cost: range.cost.get(key) ?? 0, path: pathTo(record.state, range, pos),
        attackable: options.attack.flatMap(o => o.targets.map(t => ({ target: t.id, weapon: o.weapon }))),
        healable: options.heal.flatMap(o => o.targets.map(t => ({ target: t.id, weapon: o.weapon }))),
        seize: options.seize,
        escape: options.escape,
        interactions: options.interactions,
        // 战技／法术／杖／舞蹈（UNIT_ACT action = art / cast / staff / dance）：只列有目标的项。
        arts: options.arts.filter(o => o.targets.length > 0 || o.objects.length > 0).map(o => ({ art: o.art, weapon: o.weapon, cost: o.cost, durability: o.durability, usable: o.usable, targets: o.targets.map(t => t.id), allies: o.allies, secondaries: o.secondaries, objects: o.objects, postMoves: o.postMoves, supportOptions: o.supportOptions, name: WEAPON_ART_BY_ID.get(o.art)?.name, effect: WEAPON_ART_BY_ID.get(o.art)?.effect, rank: WEAPON_ART_BY_ID.get(o.art)?.rank })),
        casts: options.casts.filter(o => o.targets.length > 0).map(o => ({ spell: o.spell, role: o.role, charges: o.charges, targets: o.targets.map(t => t.id), dest: dest(o.dest) })),
        staves: options.staff.filter(o => o.targets.length > 0 && o.effect !== 'heal').map(o => ({ weapon: o.weapon, effect: o.effect, targets: o.targets.map(t => t.id), dest: dest(o.dest) })),
        dance: options.dance,
      };
    });
    return { unit: unit.id, origin: unit.pos, move: movementBudget(record.state, unit), stops };
  },

  [OP.PREVIEW_COMBAT]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const attacker = asString(data.attackerId, 'attackerId');
    const from = asPoint(data.from, 'from');
    const target = asString(data.targetId, 'targetId');
    // 攻击法术按法术书数值预测：spell 代替 weapon（只对 attack／hostile_support 类法术有意义）。
    const book = typeof data.spell === 'string' ? SPELLBOOK_BY_ID.get(data.spell) : undefined;
    if (typeof data.spell === 'string' && !book) throw new OpError('NOT_FOUND', `没有法术 ${data.spell}`);
    if (book && !(unitById(record.state, attacker).spellbooks ?? []).some(row => row.id === book.id)) throw new OpError('NO_SUCH_ITEM', '没有携带这本法术书');
    const weapon = (book ? book.id : asString(data.weapon, 'weapon')) as never;
    const art = typeof data.art === 'string' ? WEAPON_ART_BY_ID.get(data.art as never) : undefined;
    if (data.art !== undefined && !art) throw new OpError('BAD_REQUEST', '没有这个战技');
    if (art && book) throw new OpError('BAD_REQUEST', '战技与法术不能同时使用');
    const attackerUnit = unitById(record.state, attacker);
    if (!inBounds(record.state, from) || !moveRange(record.state, attackerUnit).stops.has(from[1] * record.state.map.width + from[0])) throw new OpError('UNREACHABLE', '预测落点不可达');
    if (art) {
      validateArt(record.state, attackerUnit, { type: 'act', unit: attacker, to: from, act: 'art', weapon, art: art.id, target, ...artExtras(data) }, art);
      if (record.state.objects?.some(object => object.id === target)) return { art: art.id, ...artObjectForecast(record.state, attackerUnit, from, weapon, art, target) };
    }
    const defenderUnit = unitById(record.state, target);
    // 状态杖与敌方控场法术不进交战：只预测命中率（首领减半、免疫为 0）。
    const status = book && spellKind(book) === 'status' ? { kind: book.effects.status!, hit: book.hit } : !book ? WEAPONS[weapon as WeaponId]?.status : undefined;
    if (status) return { attackerId: attacker, targetId: target, ...(book ? { spell: book.id } : { weapon }), status: statusChance(record.state, attackerUnit, defenderUnit, status.kind, status.hit) };
    if (book && spellKind(book) !== 'attack') throw new OpError('BAD_REQUEST', '只有攻击法术与控场法术可以预测；治疗与辅助法术直接看效果说明');
    const f = book ? spellForecast(record.state, attacker, from, book.id, target)
      : art ? artForecast(record.state, attackerUnit, from, weapon, art, defenderUnit, data.secondaryId === undefined ? undefined : asString(data.secondaryId, 'secondaryId'), data.allyId === undefined ? undefined : asString(data.allyId, 'allyId'))
        : forecast(record.state, attacker, from, weapon, target);
    return {
      attacker: f.attacker, defender: f.defender, order: f.order, onHit: forecastOnHit(f),
      ...('art' in f ? { art: f.art } : {}),
      defenderDies: f.defenderDies, attackerDies: f.attackerDies,
      expectedDealt: f.expectedDealt, expectedTaken: f.expectedTaken,
      exp: record.kind === 'field' ? expPreview(attackerUnit, defenderUnit) : null,
      ...('targets' in f ? { targets: f.targets } : {}),
    };
  },

  [OP.GET_THREAT_MAP]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const side: Side = data.side === 'player' ? 'player' : 'enemy';
    const threat = threatMap(record.state, side);
    return {
      side,
      cells: [...threat.entries()].map(([key, count]) => ({ pos: [key % record.state.map.width, Math.floor(key / record.state.map.width)], count })),
    };
  },

  [OP.UNIT_ACT]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const unit = asString(data.unitId, 'unitId');
    const to = asPoint(data.moveTo, 'moveTo');
    const act = asString(data.action, 'action');
    let action: ActAction;
    if (act === 'attack') action = { type: 'act', unit, to, act: 'attack', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never };
    else if (act === 'heal') action = { type: 'act', unit, to, act: 'heal', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never };
    else if (act === 'item') action = { type: 'act', unit, to, act: 'item', item: asNumber(data.item, 'item') };
    else if (act === 'seize') action = { type: 'act', unit, to, act: 'seize' };
    else if (act === 'escape') action = { type: 'act', unit, to, act: 'escape' };
    else if (act === 'interact') action = { type: 'act', unit, to, act: 'interact', target: asString(data.targetId, 'targetId') };
    else if (act === 'wait') action = { type: 'act', unit, to, act: 'wait' };
    else if (act === 'dance') action = { type: 'act', unit, to, act: 'dance', target: asString(data.targetId, 'targetId') };
    else if (act === 'art') action = { type: 'act', unit, to, act: 'art', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never, art: asString(data.art, 'art'), ...artExtras(data) };
    else if (act === 'cast') action = { type: 'act', unit, to, act: 'cast', target: asString(data.targetId, 'targetId'), spell: asString(data.spell, 'spell'), ...(data.dest !== undefined ? { dest: asPoint(data.dest, 'dest') } : {}) };
    else if (act === 'staff') action = { type: 'act', unit, to, act: 'staff', target: asString(data.targetId, 'targetId'), weapon: asString(data.weapon, 'weapon') as never, ...(data.dest !== undefined ? { dest: asPoint(data.dest, 'dest') } : {}) };
    else throw new OpError('BAD_REQUEST', 'action 取 attack / heal / item / seize / escape / interact / wait / dance / art / cast / staff');
    const { state, events } = applyAction(ctx, record, action);
    return { battleId: record.id, result: state.result ?? null, events, state: publicState(state), battle: battleView(record, false, record.events.length - events.length) };
  },

  [OP.END_PHASE]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const { state, events } = applyAction(ctx, record, { type: 'endPhase' });
    return { battleId: record.id, result: state.result ?? null, events, state: publicState(state), battle: battleView(record, false, record.events.length - events.length) };
  },

  [OP.RETREAT]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    const { state } = applyAction(ctx, record, { type: 'retreat' });
    return { battleId: record.id, result: state.result, state: publicState(state) };
  },

  [OP.GET_BATTLE_LOG]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    return { battleId: record.id, events: record.events, actions: record.actions };
  },

  // ---- arena -------------------------------------------------------------

  [OP.GET_ARENA]: ctx => {
    const player = ctx.player;
    const day = isArenaDay(player.day) ? player.day : null;
    const record = day !== null ? ctx.store.arenaDay(player.id, day) : ctx.store.latestArenaDay(player.id);
    return {
      season: dateOf(player.day).season,
      points: player.arenaPoints,
      medals: player.arenaMedals,
      registered: player.registered,
      isArenaDay: isArenaDay(player.day),
      nextArenaDay: nextArenaDay(player.day),
      day: record?.day ?? null,
      settled: record?.settled ?? false,
      progress: record ? arenaProgress(record) : null,
      opponents: (record?.opponents ?? []).map(opponentView),
      mapPool: Object.values(ARENA_MAPS).map(m => ({ id: m.id, name: m.name, deploy: m.deploy, bans: m.bans, turnLimit: m.turnLimit, goalText: m.goalText, feature: m.feature })),
    };
  },

  [OP.GET_DEFENSE]: ctx => {
    const record = isArenaDay(ctx.player.day) ? ctx.store.arenaDay(ctx.player.id, ctx.player.day) : null;
    // 存下的槽位是保存那一刻的单位数据；按当前名册重建后返回，转职、升级、换装后显示的就是下次报名会用的阵容。
    const active = ctx.store.units(ctx.player.id).filter(u => u.status === 'active');
    const defense = ctx.player.defense ? bindDefense(active, ctx.player.defense, false) : null;
    // 今日竞技场已报名且未结算时，改阵只影响下一次 (docs/00 §10.1)。
    return { defense, locked: !!record && !record.settled, lockedDay: record?.day ?? null };
  },

  [OP.SET_DEFENSE]: (ctx, data) => {
    const submitted = data.defense as Defense | undefined;
    if (!submitted || typeof submitted !== 'object') throw new OpError('BAD_REQUEST', '缺少 defense');
    let bound: Defense;
    try {
      // 只信任角色与站位，属性/装备一律用服务器名册重建 (docs/00 §10.1)。
      bound = bindDefense(ctx.store.units(ctx.player.id).filter(u => u.status === 'active'), submitted);
    } catch (error) {
      throw new OpError('DEFENSE_INVALID', error instanceof Error ? error.message : String(error));
    }
    bound = { ...bound, id: `mine-${ctx.player.id}`, legion: ctx.player.legion };
    const errors = validateDefense(bound);
    if (errors.length > 0) throw new OpError('DEFENSE_INVALID', errors.join('；'));
    ctx.player.defense = bound;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'defense' });
    return { defense: ctx.player.defense };
  },

  [OP.ARENA_REGISTER]: ctx => {
    if (!combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player))) throw new OpError('FORBIDDEN', '完成一次地区讨伐后开放竞技场');
    ctx.player.registered = true;
    ctx.store.saveSnapshot(ctx.player.id, ctx.player.day, snapshotData(ctx.store, ctx.player));
    ensureArenaDay(ctx.store, ctx.player);
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'arena', '已报名下一次竞技场。', { day: ctx.player.day });
    return { registered: true, day: ctx.player.day, nextArenaDay: nextArenaDay(ctx.player.day) };
  },

  [OP.GET_OPPONENT]: (ctx, data) => {
    const record = requireArenaDay(ctx, data);
    const opponent = findOpponent(record, asString(data.opponentId, 'opponentId'));
    return {
      opponent: opponentView(opponent),
      list: opponentList(opponent).map(u => ({ id: u.id, character: u.character, name: u.name ?? CHARACTERS[u.character].name, portrait: u.portrait ?? null, classId: u.classId, level: u.level, stats: u.stats, weapons: u.weapons, ranks: u.ranks })),
    };
  },

  [OP.ARENA_BAN]: (ctx, data) => {
    const record = requireArenaDay(ctx, data);
    const opponentId = asString(data.opponentId, 'opponentId');
    const bans = Array.isArray(data.bans) ? data.bans as never[] : [];
    const roster = activeSnapshot(ctx.store, ctx.player);
    const attack = record.attacks[opponentId];
    if (attack && (attack.status === 'won' || attack.status === 'lost')) throw new OpError('ARENA_ALREADY_ATTACKED', '这个对手今天已经打过了');
    let reveal;
    try {
      reveal = applyBans(findOpponent(record, opponentId), bans, roster);
    } catch (error) {
      if (error instanceof EngineError) throw new OpError(error.code, error.message);
      throw error;
    }
    if (attack) { attack.bans = bans as never[]; attack.reveal = reveal; attack.status = 'revealed'; }
    ctx.store.saveArenaDay(record);
    return {
      opponentId, reveal: {
        fielded: reveal.fielded.map(s => ({ id: s.unit.id, character: s.unit.character, name: s.unit.name ?? CHARACTERS[s.unit.character].name, pos: s.pos })),
        commander: reveal.commander, barred: reveal.barred,
      },
    };
  },

  [OP.ARENA_ATTACK]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const record = requireArenaDay(ctx, data);
    const opponentId = asString(data.opponentId, 'opponentId');
    const picks = (Array.isArray(data.picks) ? data.picks : []).map(p => {
      const entry = p as { character: string; unitId?: unknown; pos: unknown };
      // unitId 选中具体的单位实例（同一形象可能有多人）；不带时按角色匹配旧客户端。
      return { character: entry.character as never, pos: asPoint(entry.pos, 'pos'), ...(typeof entry.unitId === 'string' ? { unitId: entry.unitId } : {}) };
    });
    const plan: AttackPlan = { picks, commander: asString(data.commander, 'commander') as never };
    const roster = activeSnapshot(ctx.store, ctx.player);
    // 种子由服务器生成，不采用客户端提交的 seed (docs/03)。
    const seed = randomUUID().slice(0, 8);
    let state: BattleState;
    try {
      state = startAttack(record, opponentId, roster, plan, seed, ctx.player.day);
    } catch (error) {
      if (error instanceof EngineError) throw new OpError(error.code, error.message);
      throw error;
    }
    const opponent = findOpponent(record, opponentId);
    const map = ARENA_MAPS[opponent.map];
    const battle: BattleRecord = {
      id: state.id, playerId: ctx.player.id, kind: 'arena', mode: 'arena',
      name: `${opponent.legion} · ${map.name}`, goalText: map.goalText, initial: structuredClone(state), state, events: [], actions: [],
      seed, opponentId, arenaDay: record.day, rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
    };
    ctx.store.saveBattle(battle);
    ctx.store.saveArenaDay(record);
    // 普通竞技场每场独立 1 日，入场时支付；断线重连只读同一 battle，不重复扣。
    ctx.player.day += ACTION_DAYS.arenaMatch;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.PHASE_STARTED, { battleId: battle.id, turn: 1 });
    return { battleId: battle.id, battle: battleView(battle, false), state: publicState(state) };
  },

  [OP.SURRENDER]: (ctx, data) => {
    const record = requireBattle(ctx, data);
    if (record.mode !== 'arena' && record.mode !== 'festival') throw new OpError('BAD_REQUEST', '只有竞技场战斗可以投降');
    const { state } = applyAction(ctx, record, { type: 'surrender' });
    return { battleId: record.id, result: state.result, state: publicState(state) };
  },

  [OP.GET_ARENA_RESULTS]: ctx => {
    const record = ctx.store.latestArenaDay(ctx.player.id);
    if (!record) return { day: null, attacks: [], defenseTrials: [], points: ctx.player.arenaPoints };
    return {
      day: record.day,
      settled: record.settled,
      attacks: Object.values(record.attacks).map(a => ({
        opponentId: a.opponentId, legion: record.opponents.find(o => o.id === a.opponentId)?.legion ?? a.opponentId,
        status: a.status, points: a.points, bans: a.bans, battleId: a.battleId,
        // Neither earns participation gold (services.ts::settleArenaDay).
        noShow: !!a.noShow, surrender: !!a.surrender,
      })),
      defenseTrials: record.defenseTrials,
      // The defense locked at registration: what that day's trials used, whatever was edited since.
      lockedDefense: record.defense ?? null,
      points: ctx.player.arenaPoints,
      medals: ctx.player.arenaMedals,
    };
  },

  [OP.GET_REPLAY]: (ctx, data) => {
    const id = asString(data.replayId, 'replayId');
    const replay = ctx.store.replay(ctx.player.id, id);
    if (!replay) throw new OpError('NOT_FOUND', '找不到回放，或这场对局还没有公开');
    const compatibility = replayCompatibility(replay.data as typeof replay.data & { rulesetVersion?: string });
    return {
      replayId: replay.id, battle: replay.data, publicAt: replay.publicAt, public: replay.publicAt <= Date.now(), mine: replay.playerId === ctx.player.id,
      summary: replaySummary(ctx, replay), notes: battleNotes(ctx, replay.id, replay.playerId),
      rulesetVersion: (replay.data as { rulesetVersion?: string }).rulesetVersion ?? 'rules-v1', catalogVersion: (replay.data as { catalogVersion?: number }).catalogVersion ?? 0, currentRulesetVersion: RULESET_VERSION, currentCatalogVersion: CATALOG_VERSION, ...compatibility,
    };
  },

  // 战报列表（docs/00 §11）：自己的全部战斗与他人已公开的对局；可按活动、结果、本人、个人日期筛选。
  [OP.GET_REPLAYS]: (ctx, data) => {
    const limit = Math.max(1, Math.min(200, typeof data.limit === 'number' ? Math.floor(data.limit) : 50));
    const activity = typeof data.activity === 'string' ? data.activity : null;
    const result = data.result === 'won' || data.result === 'lost' ? data.result : null;
    const fromDay = typeof data.fromDay === 'number' ? data.fromDay : null;
    const toDay = typeof data.toDay === 'number' ? data.toDay : null;
    const rows = ctx.store.replays(ctx.player.id, 200).map(r => replaySummary(ctx, r)).filter(r => (!activity || r.activity === activity)
      && (!result || (result === 'won' ? r.winner === 'player' : r.winner !== 'player'))
      && (data.mine !== true || r.mine)
      && (fromDay === null || (r.day !== null && r.day >= fromDay)) && (toDay === null || (r.day !== null && r.day <= toDay)));
    return { replays: rows.slice(0, limit), total: rows.length, activities: REPLAY_ACTIVITIES };
  },

  [OP.GET_SNAPSHOTS]: ctx => ({
    snapshots: ctx.store.snapshots(ctx.player.id, 12).map(s => ({ day: s.day, date: dateOf(s.day), roster: s.data.roster, defense: s.data.defense })),
  }),

  // ---- real-month arena ratings (docs/13 §6.4) --------------------------

  [OP.GET_RATINGS]: ctx => {
    settleMonthlyRatings(ctx.store);
    const current = ensureRatingPeriod(ctx.store);
    const row = ctx.store.rating(current.id, ctx.player.id);
    const rows = ctx.store.ratingsForPeriod(current.id);
    const rank = row ? rankByRating(rows).get(ctx.player.id) ?? null : null;
    return {
      period: { id: current.id, startsAt: current.startsAt, endsAt: current.endsAt },
      current: row ? { rating: row.rating, wins: row.wins, losses: row.losses, matches: row.matches, rank, field: rows.length } : { rating: 0, wins: 0, losses: 0, matches: 0, rank: null, field: rows.length },
      points: ctx.player.arenaPoints,
      archived: ctx.store.ratingPeriods().filter(p => p.status === 'archived').map(p => {
        const reward = ctx.store.monthlyReward(p.id, ctx.player.id);
        return { id: p.id, finalizedAt: p.rewardsFinalizedAt, reward };
      }),
    };
  },

  [OP.CLAIM_RATING_REWARD]: (ctx, data) => {
    const periodId = asString(data.periodId, 'periodId');
    const reward = ctx.store.monthlyReward(periodId, ctx.player.id);
    if (!reward) throw new OpError('NOT_FOUND', '没有这个现实月的排名奖励');
    if (reward.claimedAt) throw new OpError('FORBIDDEN', '这个现实月的奖励已经领取过');
    reward.claimedAt = Date.now();
    ctx.store.saveMonthlyReward(reward);
    ctx.player.gold += reward.reward.gold;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'rating-reward' });
    return { periodId, rank: reward.finalRank, gold: reward.reward.gold, total: ctx.player.gold };
  },

  [OP.GET_SPARRING]: () => ({
    sparring: [
      { id: 'frost', legion: '霜狼骑团', roster: sparringRoster('frost', 6) },
      { id: 'maple', legion: '赤枫商会', roster: sparringRoster('maple', 6) },
      { id: 'white', legion: '白塔学士团', roster: sparringRoster('white', 8) },
    ],
  }),

  [OP.START_SPARRING]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const legion = typeof data.legion === 'string' ? data.legion : '霜狼骑团';
    const roster = sparringRoster(legion, 6);
    const defense = {
      id: `sparring-${legion}`, legion, points: 0, record: '陪练', map: 'plains' as const,
      slots: roster.map((unit, i) => ({ unit, pos: [11 + (i % 4), 3 + Math.floor(i / 4)], behavior: 'aggressive' as const })),
      commanders: [roster[0].character], bans: [],
    };
    const mine = activeSnapshot(ctx.store, ctx.player);
    const picks = mine.slice(0, 6).map((u, i) => ({ character: u.character, pos: [1 + (i % 3), 3 + Math.floor(i / 3)] as Point }));
    const seed = randomUUID().slice(0, 8);
    const state = startAttack({ id: 'sparring', playerId: ctx.player.id, day: ctx.player.day, opponents: [defense], attacks: { [defense.id]: { opponentId: defense.id, status: 'revealed', bans: [], battleId: null, points: 0 } }, defenseTrials: [], defensePoints: 0, defense: null, settled: false },
      defense.id, mine, { picks, commander: picks[0].character }, seed);
    const battle: BattleRecord = {
      id: state.id, playerId: ctx.player.id, kind: 'arena', mode: 'sparring', name: `${legion} · 陪练`,
      goalText: ARENA_MAPS.plains.goalText, initial: structuredClone(state), state, events: [], actions: [], seed,
      rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
    };
    ctx.store.saveBattle(battle);
    return { battleId: battle.id, battle: battleView(battle, false) };
  },

  // ---- annual arena (docs/00 §9.4, docs/13 §6) -------------------------

  [OP.GET_ANNUAL]: ctx => {
    const active = ctx.store.activeAnnualEntry(ctx.player.id);
    const calendarIndex = annualIndexFor(ctx.player.day);
    const annualIndex = active?.annualIndex ?? Math.max(1, calendarIndex);
    const entry = active ?? ctx.store.annualEntryFor(ctx.player.id, annualIndex) ?? ctx.store.latestAnnualEntry(ctx.player.id);
    return {
      annualIndex,
      windowOpen: annualWindowOpen(ctx.player.day),
      nextOpenDay: nextAnnualWindowStart(ctx.player.day),
      qualifierMatches: ANNUAL_QUALIFIER_MATCHES,
      qualifierWins: ANNUAL_QUALIFIER_WINS,
      costDays: ACTION_DAYS.festivalMatch,
      entry: entry ? annualSummary(entry) : null,
    };
  },

  [OP.REGISTER_ANNUAL]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    const annualIndex = annualIndexFor(ctx.player.day);
    if (ctx.store.annualEntryFor(ctx.player.id, annualIndex)) throw new OpError('FORBIDDEN', '本届已经报名；淘汰或退赛后当届不能重报');
    if (!annualWindowOpen(ctx.player.day)) throw new OpError('FORBIDDEN', '大竞技场报名窗口未开放（每届最后18日）');
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    const units = (ids.length > 0 ? ids.map(id => requireUnit(ctx.store, ctx.player, id)) : ctx.store.units(ctx.player.id))
      .filter(u => u.status === 'active');
    if (units.length === 0) throw new OpError('BAD_REQUEST', '没有可报名的单位');
    if (new Set(units.map(unit => unit.id)).size !== units.length) throw new OpError('BAD_REQUEST', '报名单位不能重复');
    if (units.some(unit => unit.lockedRunId || unit.lockedDispatchId)) throw new OpError('FORBIDDEN', '报名队员正在远征或派遣中');
    const entry = createAnnualEntry(`annual-${annualIndex}-${randomUUID().slice(0, 8)}`, ctx.player.id, annualIndex, units.map(u => u.id));
    entry.roster = Object.fromEntries(units.map(unit => [unit.id, structuredClone(unit)]));
    entry.matchSeeds = Array.from({ length: 9 }, () => randomUUID());
    ctx.store.saveAnnualEntry(entry);
    ctx.store.saveSnapshot(ctx.player.id, ctx.player.day, snapshotData(ctx.store, ctx.player));
    ctx.store.addEvent(ctx.player.id, 'festival', `报名第 ${annualIndex} 届大竞技场（${units.length} 人）。`, { annualIndex });
    ctx.push(OP.STATE_CHANGED, { reason: 'annual-register' });
    return { entry: annualSummary(entry) };
  },

  [OP.START_ANNUAL_MATCH]: ctx => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const entry = ctx.store.activeAnnualEntry(ctx.player.id);
    if (!entry) throw new OpError('NOT_FOUND', '没有进行中的大竞技场报名');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    // 第一场用报名名单；之后只能用原名单中仍存活者（docs/00 §9.4.2）。
    const sourceIds = entry.qualifierCount === 0 && entry.round === 0 ? entry.unitIds : Object.keys(entry.carry);
    const living = sourceIds.map(id => ctx.store.unit(ctx.player.id, id)).filter((u): u is NonNullable<typeof u> => !!u && u.status === 'active' && !u.lockedDispatchId);
    // Older entries freeze once when resumed; new entries freeze at registration.
    entry.roster ??= Object.fromEntries(living.map(unit => [unit.id, structuredClone(unit)]));
    const units = living.map(unit => entry.roster![unit.id]).filter((unit): unit is UnitRecord => !!unit);
    if (units.length === 0) throw new OpError('FORBIDDEN', '没有可出战的报名队员，只能退赛');
    const round = nextFestivalRound(entry);
    entry.matchSeeds ??= Array.from({ length: 9 }, () => randomUUID());
    const seed = entry.matchSeeds[round - 1];
    const record = createFestivalBattle(units, round, seed, { day: entry.annualIndex * DAYS_PER_YEAR, season: dateOf(ctx.player.day).season, annualId: entry.id, edition: entry.annualIndex, carry: entry.carry });
    record.playerId = ctx.player.id;
    ctx.player.day += ACTION_DAYS.festivalMatch;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    entry.battleId = record.id;
    ctx.store.saveAnnualEntry(entry);
    ctx.store.addEvent(ctx.player.id, 'festival', `大竞技场第 ${entry.annualIndex} 届第 ${round} 轮开始。`, { battleId: record.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { entry: annualSummary(entry), round, battleId: record.id, battle: battleView(record, false) };
  },

  [OP.WITHDRAW_ANNUAL]: ctx => {
    const entry = ctx.store.activeAnnualEntry(ctx.player.id);
    if (!entry) throw new OpError('NOT_FOUND', '没有进行中的大竞技场报名');
    const battle = ctx.store.activeBattle(ctx.player.id);
    if (battle) {
      if (battle.annualId !== entry.id) throw new OpError('BATTLE_IN_PROGRESS', '已有其他战斗');
      applyAction(ctx, battle, { type: 'surrender' });
    }
    const current = ctx.store.annualEntry(ctx.player.id, entry.id)!;
    current.state = 'withdrawn';
    current.battleId = null;
    ctx.store.saveAnnualEntry(current);
    flushRecoveryBag(ctx.store, ctx.player);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'annual-withdraw' });
    return { entry: annualSummary(current) };
  },

  // ---- eight-chapter story (docs/00 §9.4.2, docs/13 §6.3) --------------

  [OP.GET_STORY]: ctx => {
    if (syncFindSteps(ctx.store, ctx.player).length > 0) ctx.store.savePlayer(ctx.player);
    const annualEvent = ctx.store.events(ctx.player.id, 0, 10000).filter(event => event.kind === 'festival').at(-1);
    return {
    bexp: CHAPTER_BEXP,
    annualSummary: annualEvent ? { text: annualEvent.text, data: annualEvent.data } : { text: '本届大竞技场未参赛。', data: null },
    // 只下发已开放或已完成的章节：未开放的章节不提前剧透，也不出现在列表里。
    chapters: Array.from({ length: STORY_CHAPTERS }, (_, i) => {
      const chapter = i + 1;
      const available = chapterAvailable(chapter, ctx.player.day);
      const completed = (ctx.player.flags.storyCompleted ?? []).includes(chapter);
      if (!available && !completed) return null;
      return {
        chapter, openDay: chapterOpenDay(chapter), available, completed,
        claimed: ctx.player.flags.chapterExpClaimed.includes(chapter),
        // 标题开放后才给，完成后的认识完成后才给（不提前剧透）。
        title: available ? CHAPTERS[i].title : null,
        learned: completed ? CHAPTERS[i].learned : null,
        event: completed ? CHAPTERS[i].event : null,
        finalBoss: chapter === 8 ? { floorId: 'tower-3', available: completed, defeated: (ctx.player.flags.towerCleared ?? []).includes('tower-3') } : null,
        discoveries: completed ? CHAPTERS[i].discoveries : [],
        quest: available ? storyQuestView(ctx.store, ctx.player, chapter) : null,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null),
    companions: companionView(ctx.player),
  };
  },

  [OP.COMPLETE_STORY_EVENT]: (ctx, data) => {
    const chapter = asNumber(data.chapter, 'chapter');
    if (!chapterAvailable(chapter, ctx.player.day)) throw new OpError('FORBIDDEN', '该章尚未开放');
    // 主线任务胜利会自动完成本章；这里只补记旧流程或确认已完成，不能绕过任务。
    const storyQuest = STORY_QUESTS.find(q => q.story === chapter);
    if (storyQuest && !(ctx.player.flags.questsDone ?? []).includes(storyQuest.id) && !(ctx.player.flags.storyCompleted ?? []).includes(chapter)) {
      throw new OpError('FORBIDDEN', `先完成本章主线任务「${storyQuest.name}」`);
    }
    completeChapter(ctx, chapter);
    return { chapter, completed: true };
  },

  // 提交材料类前置任务（docs/38 §3.4）：从仓库扣除，需先完成同章的派遣任务。
  [OP.COMPLETE_STORY_STEP]: (ctx, data) => {
    const found = findStoryStep(asString(data.step, 'step'));
    if (!found) throw new OpError('NOT_FOUND', '没有这个前置任务');
    const { chapter, step } = found;
    if (step.kind !== 'submit') throw new OpError('BAD_REQUEST', '这类前置任务不用提交材料：派遣满天数返程时自动完成，找物品／胜场／单挑按各自的方式完成');
    if (!chapterAvailable(chapter, ctx.player.day)) throw new OpError('FORBIDDEN', '该章尚未开放');
    const done = new Set(ctx.player.flags.storyStepsDone ?? []);
    if (done.has(step.id)) throw new OpError('FORBIDDEN', '这个前置任务已经完成');
    if (ctx.store.countInventory(ctx.player.id, step.item) < step.count) {
      throw new OpError('NO_SUCH_ITEM', `需要 ${step.count} 份${GAME_ITEMS[step.item].name}，仓库里只有 ${ctx.store.countInventory(ctx.player.id, step.item)} 份`);
    }
    ctx.store.takeInventory(ctx.player.id, step.item, step.count);
    ctx.player.flags.storyStepsDone = [...done, step.id];
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'story', `完成主线前置任务「${step.name}」。`, { step: step.id });
    ctx.push(OP.STATE_CHANGED, { reason: 'story-step' });
    return { step: step.id, chapter, item: step.item, count: step.count };
  },

  // 主线单挑类前置任务：借小型经典图，一名己方角色对一名强敌，真实死亡；败了可再次挑战。
  [OP.START_STORY_DUEL]: (ctx, data) => {
    const found = findStoryStep(asString(data.step, 'step'));
    if (!found || found.step.kind !== 'duel') throw new OpError('NOT_FOUND', '没有这个单挑任务');
    const { chapter, step } = found;
    if (!chapterAvailable(chapter, ctx.player.day)) throw new OpError('FORBIDDEN', '该章尚未开放');
    if ((ctx.player.flags.storyStepsDone ?? []).includes(step.id)) throw new OpError('FORBIDDEN', '这个单挑已经赢过了');
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    if (ctx.store.activeAnnualEntry(ctx.player.id)) throw new OpError('FORBIDDEN', '大竞技场进行中，暂时不能单挑');
    const block = lifespanBlockers(ctx, ctx.player.day + DUEL_DAYS);
    if (block.length) throw new OpError('FORBIDDEN', block.join('；'));
    const [unit] = deploymentUnits(ctx, [asString(data.unitId, 'unitId')], 1);
    const record = createStoryDuel(unit, step, { seed: randomUUID().slice(0, 8), day: ctx.player.day, level: duelLevel(ctx.store.units(ctx.player.id), step) });
    record.playerId = ctx.player.id;
    ctx.player.day += DUEL_DAYS;
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'quest', `应战「${step.enemy}」（主线第 ${chapter} 章单挑）。`, { battleId: record.id, step: step.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, stepId: step.id, goalText: record.goalText, battle: battleView(record, false), state: publicState(record.state) };
  },

  [OP.CLAIM_REWARD]: (ctx, data) => {
    const key = asString(data.rewardKey, 'rewardKey');
    const match = /^chapter:(\d+)$/.exec(key);
    if (!match) throw new OpError('NOT_FOUND', '没有这个奖励键');
    const chapter = Number(match[1]);
    if (!(ctx.player.flags.storyCompleted ?? []).includes(chapter)) throw new OpError('FORBIDDEN', '该章尚未完成');
    // 唯一奖励键：重复请求不会重复发（docs/13 §2.5）。
    if (ctx.player.flags.chapterExpClaimed.includes(chapter)) throw new OpError('FORBIDDEN', '该奖励已经领取过');
    ctx.player.flags.chapterExpClaimed.push(chapter);
    ctx.player.bexp += CHAPTER_BEXP;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'reward' });
    return { rewardKey: key, bexp: CHAPTER_BEXP, total: ctx.player.bexp };
  },

  // ---- 地区任务与声望（docs/20） ------------------------------------------

  [OP.GET_QUESTS]: ctx => {
    const unlocked = adoptRegions(ctx.store, ctx.player);
    const done = new Set(ctx.player.flags.questsDone ?? []);
    const claimed = new Set(ctx.player.flags.questRewardsClaimed ?? []);
    const reputation = ctx.player.flags.regionReputation ?? {};
    const holds = (item: ItemKey) => ctx.store.countInventory(ctx.player.id, item) > 0;
    const recruited = recruitedCharacters(ctx.player.flags.questRewardsClaimed ?? []);
    // 进行中的任务（活动远征或战斗）即使暂不满足可接条件也保留显示。
    const ongoing = new Set([ctx.store.activeRun(ctx.player.id)?.questId, ctx.store.activeBattle(ctx.player.id)?.questId]
      .filter((id): id is string => typeof id === 'string'));
    return {
      crossTime: crossTimeQuestView(ctx.store, ctx.player, unlocked),
      // 只下发已解锁地区；可接或已完成的任务保留，进行中／可领奖的也不丢。
      regions: QUEST_REGIONS.filter(region => unlocked.includes(region)).map(region => {
        const rep = reputation[region] ?? 0;
        return {
          region, name: regionById(region).name, reputation: rep, tier: reputationTier(rep),
          shop: regionShop(region, rep),
          quests: questsForRegion(region).filter(q => !q.archived || ongoing.has(q.id) || (done.has(q.id) && !claimed.has(q.id))).map(q => ({
            id: q.id, name: q.name, objective: q.objective, kind: q.kind, tier: q.tier,
            archived: !!q.archived, dungeonOnly: !!q.dungeonOnly,
            stageNames: q.scenarioIds?.map(id => classicMap(id).name) ?? null,
            costDays: q.costDays ?? QUEST_DAY_COST[q.tier], turnLimit: q.turnLimit, maxUnits: questMaxUnits(q), reward: q.reward,
            enemyLevel: Math.min(q.enemyLevelCap ?? QUEST_LEVEL_CAP[q.tier], enemyLevel(ctx.player.day, regionById(region).offset) + (q.scenarioId ? classicAdaptation(q.scenarioId).difficulty : 0)),
            enemyLevelCap: q.enemyLevelCap ?? QUEST_LEVEL_CAP[q.tier],
            toDay: ctx.player.day + (q.costDays ?? QUEST_DAY_COST[q.tier]), risk: 'permadeath',
            classic: q.classic ?? null,
            optionalReward: q.kind === 'gather' ? { item: region === 3 ? 'ore' : region === 5 ? 'herb' : 'wood', perExtraBox: 1 } : null,
            requires: q.requires ?? null,
            companion: q.companion ?? null, epilogue: done.has(q.id) ? COMPANION_EPILOGUES[q.id] ?? null : null,
            // 固定专属实物：领取前预览（docs/27「确认领取前预览绑定」）。
            exclusive: q.exclusive ? { item: q.exclusive, name: GAME_ITEMS[q.exclusive].name } : null,
            done: done.has(q.id), claimed: claimed.has(q.id), inProgress: ongoing.has(q.id),
            hardAvailable: !q.archived && supportsHardQuest(q),
            firstClearRewards: !q.archived && supportsHardQuest(q) ? {
              normal: dungeonFirstClearReward(ctx.store, ctx.player, region, q.id),
              hard: dungeonFirstClearReward(ctx.store, ctx.player, region, q.id, 'hard'),
            } : null,
            hardUnlocked: !q.archived && supportsHardQuest(q) && hardUnlocks(ctx.store, ctx.player).quests.includes(q.id),
            available: !q.archived && ((supportsHardQuest(q) && done.has(q.id)) || questAvailable(q, { done, reputation: rep, holds, day: ctx.player.day, recruited })),
          })).filter(row => row.available || row.done || ongoing.has(row.id)),
        };
      }),
    };
  },

  [OP.CLAIM_CONTROL]: ctx => {
    const owner = ctx.actor ?? (ctx.agentModel ? 'agent' : 'human');
    const lease = ctx.player.flags.controlLease;
    if (lease && lease.expiresAt > Date.now() && lease.owner !== owner) throw new OpError('FORBIDDEN', '控制权由另一方持有，先等待租约到期或由对方释放');
    ctx.player.flags.controlLease = { owner, expiresAt: Date.now() + 5 * 60_000 };
    ctx.store.savePlayer(ctx.player);
    return { owner, expiresAt: ctx.player.flags.controlLease.expiresAt };
  },

  [OP.RELEASE_CONTROL]: ctx => {
    const owner = ctx.actor ?? (ctx.agentModel ? 'agent' : 'human');
    if (ctx.player.flags.controlLease?.owner === owner) delete ctx.player.flags.controlLease;
    ctx.store.savePlayer(ctx.player);
    return { released: true, owner };
  },

  [OP.GET_MINIGAMES]: ctx => {
    const quarter = Math.floor(ctx.player.day / DAYS_PER_SEASON);
    if (ctx.player.flags.minigameQuarter !== quarter) {
      ctx.player.flags.minigameQuarter = quarter;
      ctx.player.flags.minigamePlays = 0;
    }
    return { quarter, played: ctx.player.flags.minigamePlays ?? 0, limit: MINIGAME_PLAYS_PER_QUARTER, bets: MINIGAME_BETS, games: ['dice', 'frogs'], frogNames: FROG_NAMES,
      frogs: FROG_NAMES.map((name, i) => ({ name, chance: FROG_CHANCE[i], returnTenths: FROG_RETURN_TENTHS[i] })) };
  },

  [OP.PLAY_MINIGAME]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id) || isActiveRun(ctx.store.activeRun(ctx.player.id)) || ctx.store.activeAnnualEntry(ctx.player.id)) {
      throw new OpError('FORBIDDEN', '战斗／远征／年度赛事中不能下注');
    }
    if (ctx.player.day < 500) throw new OpError('FORBIDDEN', '酒馆在第二年开放');
    const quarter = Math.floor(ctx.player.day / DAYS_PER_SEASON);
    if (ctx.player.flags.minigameQuarter !== quarter) {
      ctx.player.flags.minigameQuarter = quarter;
      ctx.player.flags.minigamePlays = 0;
    }
    if ((ctx.player.flags.minigamePlays ?? 0) >= MINIGAME_PLAYS_PER_QUARTER) throw new OpError('FORBIDDEN', '本季度正式局已用完');
    const game = asString(data.game, 'game');
    const bet = asNumber(data.bet, 'bet');
    if (!MINIGAME_BETS.includes(bet as never)) throw new OpError('BAD_REQUEST', '下注档位取 20／50／100');
    if (ctx.player.gold < bet) throw new OpError('NOT_ENOUGH_GOLD', '金币不足以下注');
    let result: unknown;
    let payout = 0;
    if (game === 'dice') {
      const choice = asString(data.choice, 'choice');
      if (choice !== 'big' && choice !== 'small') throw new OpError('BAD_REQUEST', 'choice 取 big / small');
      const dice = rollDice(`${ctx.player.id}:${ctx.player.day}:${ctx.player.flags.minigamePlays ?? 0}:${randomUUID()}`);
      payout = dicePayout(bet, choice, dice);
      result = { game, choice, ...dice, payout };
    } else if (game === 'frogs') {
      const pick = asNumber(data.pick, 'pick');
      if (!Number.isInteger(pick) || pick < 0 || pick > 3) throw new OpError('BAD_REQUEST', 'pick 取 0–3');
      const race = frogRace(`${ctx.player.id}:${ctx.player.day}:${ctx.player.flags.minigamePlays ?? 0}:${randomUUID()}`);
      payout = frogPayout(bet, pick, race);
      result = { game, pick, ...race, payout };
    } else {
      throw new OpError('BAD_REQUEST', 'game 取 dice / frogs');
    }
    ctx.player.gold -= bet;
    ctx.player.gold += payout;
    ctx.player.flags.minigamePlays = (ctx.player.flags.minigamePlays ?? 0) + 1;
    // 返还高于下注才算赢（主线酒馆小游戏前置任务）。
    if (payout > bet) recordStoryWin(ctx.player, 'tavern');
    ctx.store.savePlayer(ctx.player);
    ctx.store.addEvent(ctx.player.id, 'minigame', `${game === 'dice' ? '猜大小' : '青蛙赛跑'}：下注 ${bet}，返还 ${payout}。`, result);
    return { ...result as Record<string, unknown>, bet, net: payout - bet, remaining: MINIGAME_PLAYS_PER_QUARTER - ctx.player.flags.minigamePlays, day: ctx.player.day };
  },

  [OP.GET_CHALLENGES]: ctx => {
    const towerOpen = combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player));
    const cleared = ctx.player.flags.towerCleared ?? [];
    const storyDone = ctx.player.flags.storyCompleted ?? [];
    const opened = (floor: (typeof CHALLENGE_FLOORS)[number]) => floor.id !== 'tower-3' || storyDone.includes(8);
    return {
      // 只显示已开放或已通关的塔层；特性未开时列表为空（挑战塔随首次讨伐开放）。
      floors: CHALLENGE_FLOORS.filter(floor => (towerOpen && opened(floor)) || cleared.includes(floor.id)).map(floor => ({
      ...floor,
      mapName: classicMap(floor.mapId).name,
      maxUnits: classicAdaptation(floor.mapId).deployment.max,
      cleared: cleared.includes(floor.id),
      available: opened(floor),
      claimedFirst: (ctx.player.flags.challengeRewardsClaimed ?? []).includes(`${floor.id}:first`),
      claimedRepeat: (ctx.player.flags.challengeRewardsClaimed ?? []).includes(`${floor.id}:repeat`),
      claimedEquipment: (ctx.player.flags.challengeRewardsClaimed ?? []).includes(`${floor.id}:equipment-v1`),
    })),
    };
  },

  [OP.START_CHALLENGE]: (ctx, data) => {
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中');
    if (!combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player))) throw new OpError('FORBIDDEN', '完成一次地区讨伐后开放挑战塔');
    const floor = challengeById(asString(data.floorId, 'floorId'));
    if (!floor) throw new OpError('NOT_FOUND', '没有这个塔层');
    if (floor.id === 'tower-3' && !(ctx.player.flags.storyCompleted ?? []).includes(8)) throw new OpError('FORBIDDEN', '完成第八章后才能挑战最终首领');
    const ids = Array.isArray(data.unitIds) ? data.unitIds as string[] : [];
    const units = ids.map(id => requireUnit(ctx.store, ctx.player, id)).filter(unit => unit.status === 'active');
    if (units.length === 0) throw new OpError('BAD_REQUEST', '没有可出战单位');
    if (units.some(unit => unit.lockedRunId || unit.lockedDispatchId)) throw new OpError('FORBIDDEN', '远征或派遣中的单位不能挑战塔');
    const maxUnits = classicAdaptation(floor.mapId).deployment.max;
    if (units.length > maxUnits) throw new OpError('BAD_REQUEST', `该层最多出战 ${maxUnits} 人`);
    const block = lifespanBlockers(ctx, ctx.player.day + floor.costDays);
    if (block.length) throw new OpError('FORBIDDEN', block.join('；'));
    const record = createClassicBattle(units, { mapId: floor.mapId, seed: `tower:${ctx.player.id}:${floor.id}:${ctx.player.day}`, day: ctx.player.day, level: floor.level, lootRank: lootRankOf(ctx.player), claimed: ctx.player.flags.secretsClaimed ?? [] });
    record.playerId = ctx.player.id;
    record.challengeId = floor.id;
    record.costDays = floor.costDays;
    ctx.store.saveBattle(record);
    ctx.player.day += floor.costDays;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, floor, day: ctx.player.day };
  },

  [OP.CLAIM_CHALLENGE_REWARD]: (ctx, data) => {
    const floor = challengeById(asString(data.floorId, 'floorId'));
    if (!floor) throw new OpError('NOT_FOUND', '没有这个塔层');
    if (floor.id === 'tower-3' && !(ctx.player.flags.storyCompleted ?? []).includes(8)) throw new OpError('FORBIDDEN', '完成第八章后才能挑战最终首领');
    if (!(ctx.player.flags.towerCleared ?? []).includes(floor.id)) throw new OpError('FORBIDDEN', '该层尚未通关');
    const first = !(ctx.player.flags.challengeRewardsClaimed ?? []).includes(`${floor.id}:first`);
    ctx.player.flags.challengeRewardsClaimed ??= [];
    const claimed = ctx.player.flags.challengeRewardsClaimed;
    const normalKey = `${floor.id}:${first ? 'first' : 'repeat'}`;
    const equipmentKey = `${floor.id}:equipment-v1`;
    const equipment = claimed.includes(equipmentKey) ? [] : floor.equipment;
    const normal = !claimed.includes(normalKey);
    if (!normal && !equipment.length) throw new OpError('FORBIDDEN', '该层奖励已经领取');
    const key = normal ? normalKey : equipmentKey;
    const reward = normal ? (first ? floor.first : floor.repeat) : { gold: 0, items: [] };
    if (normal) claimed.push(normalKey);
    if (equipment.length) {
      for (const weapon of equipment) ctx.store.addInventory(ctx.player.id, weapon, 0, 1);
      claimed.push(equipmentKey);
    }
    ctx.player.gold += reward.gold;
    for (const [item, count] of reward.items) ctx.store.addInventory(ctx.player.id, item, GAME_ITEMS[item].uses ?? 0, count);
    ctx.store.savePlayer(ctx.player);
    return { floorId: floor.id, key, gold: reward.gold, items: reward.items, equipment };
  },

  [OP.GET_CROSS_TIME_RECRUITS]: ctx => crossTimeRecruitView(ctx.store, ctx.player),

  [OP.EXCHANGE_CROSS_TIME_RECRUIT]: (ctx, data) => {
    if (!asString(data.commandId, 'commandId').trim()) throw new OpError('BAD_REQUEST', 'commandId不能为空');
    const identityId = asString(data.identityId, 'identityId');
    const identity = crossTimeById(identityId);
    if (!identity) throw new OpError('NOT_FOUND', '没有这个时空身份');
    const view = crossTimeRecruitView(ctx.store, ctx.player);
    const entry = view.recruits.find(row => row.identityId === identityId)!;
    if (!entry.eligible) throw new OpError('FORBIDDEN', entry.blockedReason!);
    const unit = createCrossTimeRecruit(identityId, `u_cross_${randomUUID()}`, ctx.player.day);
    ctx.store.takeInventory(ctx.player.id, CROSS_TIME_SHARD, 3);
    const flags = ctx.player.flags.crossTime ??= {};
    flags.exchanged = [...(flags.exchanged ?? []), identityId];
    ctx.store.addUnit(ctx.player.id, unit);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'cross-time-recruit' });
    return { identityId, unitId: unit.id, unit: unitDetail(unit), cost: 3 };
  },

  [OP.START_QUEST]: (ctx, data) => {
    if (data.questId === CROSS_TIME_QUEST_ID) {
      const aiDifficulty = asAiDifficulty(data.aiDifficulty);
      if (ctx.player.day < 1000) throw new OpError('FORBIDDEN', '第1000日起开放时空试炼');
      if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
      if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中');
      if (aiDifficulty === 'hard' && !ctx.player.flags.crossTime?.clearedNormal) throw new OpError('FORBIDDEN', '先普通通关时空试炼');
      const regions = adoptRegions(ctx.store, ctx.player);
      const accepted = ctx.player.flags.crossTime?.acceptedRegion;
      const region = data.region === undefined ? accepted ?? regions[0] : asNumber(data.region, 'region');
      if (!Number.isInteger(region) || !regions.includes(region) || accepted !== undefined && region !== accepted) throw new OpError('FORBIDDEN', '请选择已开通地区；接取后入口地区固定');
      const blockers = lifespanBlockers(ctx, ctx.player.day + 8);
      if (blockers.length) throw new OpError('FORBIDDEN', blockers.join('；'));
      const units = deploymentUnits(ctx, data.unitIds, 8);
      const record = createCrossTimeBattle(units, { region, day: ctx.player.day, seed: randomUUID(), aiDifficulty });
      record.playerId = ctx.player.id;
      record.questId = CROSS_TIME_QUEST_ID;
      record.costDays = 8;
      (ctx.player.flags.crossTime ??= {}).acceptedRegion = region;
      ctx.player.day += 8;
      syncPlayer(ctx.store, ctx.player);
      ctx.store.saveBattle(record);
      ctx.store.savePlayer(ctx.player);
      ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
      return { battleId: record.id, questId: CROSS_TIME_QUEST_ID, goalText: record.goalText, battle: battleView(record, false), state: publicState(record.state) };
    }
    const aiDifficulty = asAiDifficulty(data.aiDifficulty);
    if (aiDifficulty === 'hard') {
      const quest = questById(asString(data.questId, 'questId'));
      if (quest && !supportsHardQuest(quest)) throw new OpError('FORBIDDEN', '单图任务没有困难版本，完成后不能重复挑战');
      if (quest && !hardUnlocks(ctx.store, ctx.player).quests.includes(quest.id)) throw new OpError('FORBIDDEN', '先以普通难度完整通关本任务副本，才能挑战困难版本');
    }
    if (ctx.store.activeBattle(ctx.player.id)) throw new OpError('BATTLE_IN_PROGRESS', '已有进行中的战斗');
    const questForLife = questById(asString(data.questId, 'questId'));
    if (questForLife) {
      const block = lifespanBlockers(ctx, ctx.player.day + (questForLife.costDays ?? QUEST_DAY_COST[questForLife.tier]));
      if (block.length) throw new OpError('FORBIDDEN', block.join('；'));
    }
    if (isActiveRun(ctx.store.activeRun(ctx.player.id))) throw new OpError('FORBIDDEN', '远征进行中，先打完或撤离');
    const quest = questById(asString(data.questId, 'questId'));
    if (!quest) throw new OpError('NOT_FOUND', '没有这个任务');
    if (quest.archived) throw new OpError('FORBIDDEN', '此经典关卡已编入副本；旧奖励仍可领取，已开始的远征可以继续');
    if (quest.dungeonOnly && !combatFeaturesOpen(ctx.store, ctx.player, playerRegions(ctx.player))) throw new OpError('FORBIDDEN', '完成一次地区讨伐后开放副本');
    if (quest.story) {
      if (!chapterAvailable(quest.story, ctx.player.day)) throw new OpError('FORBIDDEN', '该章尚未开放');
      if (syncFindSteps(ctx.store, ctx.player).length > 0) ctx.store.savePlayer(ctx.player);
      const missing = storyPrerequisite(ctx.player, quest.story);
      if (missing) throw new OpError('FORBIDDEN', `先完成本章前置任务「${missing}」`);
    }
    // 主线任务不属于任何地区（region 0），由章节开放控制；其余任务需要地区已开通。
    if (!quest.story && !playerRegions(ctx.player).includes(quest.region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(quest.region).name}；先在世界地图选择行军路线`);
    const done = new Set(ctx.player.flags.questsDone ?? []);
    if (!(supportsHardQuest(quest) && done.has(quest.id)) && !questAvailable(quest, questState(ctx, quest, done))) {
      throw new OpError('FORBIDDEN', quest.story ? (done.has(quest.id) ? '本章主线任务已经完成' : '该章尚未开放') : '任务尚未解锁或已完成');
    }
    const maxUnits = questMaxUnits(quest);
    const ready = deploymentUnits(ctx, data.unitIds, maxUnits);
    const seed = randomUUID().slice(0, 8);
    // 经典地图副本：按 scenarioIds 顺序逐图连战，跨图携带由 run.carry 维护（docs/24）。
    if (quest.scenarioIds?.length) {
      const costDays = quest.stageDays ?? 2;
      const run = createRun(`run-${randomUUID().slice(0, 8)}`, ctx.player.id, quest.region, ready.map(u => u.id),
        enemyLevel(ctx.player.day, regionById(quest.region).offset), ctx.player.flags.clearedRegions.length,
        { aiDifficulty, questId: quest.id, stageDays: costDays, scenarioIds: quest.scenarioIds, stageNames: quest.scenarioIds.map(id => classicMap(id).name) });
      for (const unit of ready) { unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); }
      ctx.player.day += costDays;
      syncPlayer(ctx.store, ctx.player);
      const record = createClassicBattle(ready, { aiDifficulty, mapId: quest.scenarioIds[0], seed, quest, level: run.level, stageIndex: 0, runId: run.id, day: ctx.player.day, lootRank: lootRankOf(ctx.player), claimed: ctx.player.flags.secretsClaimed ?? [], season: dateOf(ctx.player.day - costDays).season });
      record.costDays = costDays;
      record.playerId = ctx.player.id;
      run.battleId = record.id;
      ctx.store.saveRun(run);
      ctx.store.saveBattle(record);
      ctx.store.addEvent(ctx.player.id, 'quest', `接取经典副本「${quest.name}」（${quest.scenarioIds.length} 图）。`, { runId: run.id, questId: quest.id });
      ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
      return { battleId: record.id, questId: quest.id, run: runSummary(run), goalText: record.goalText, battle: battleView(record, false) };
    }
    // 单张经典地图任务。
    if (quest.scenarioId) {
      const record = createClassicBattle(ready, { aiDifficulty, mapId: quest.scenarioId, seed, quest, day: ctx.player.day, lootRank: lootRankOf(ctx.player), claimed: ctx.player.flags.secretsClaimed ?? [] });
      record.playerId = ctx.player.id;
      ctx.player.day += quest.costDays ?? QUEST_DAY_COST[quest.tier];
      syncPlayer(ctx.store, ctx.player);
      ctx.store.saveBattle(record);
      ctx.store.addEvent(ctx.player.id, 'quest', `接取经典地图「${quest.name}」（${quest.story ? `主线第 ${quest.story} 章` : regionById(quest.region).name}）。`, { battleId: record.id, questId: quest.id });
      ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
      return { battleId: record.id, questId: quest.id, goalText: record.goalText, battle: battleView(record, false), state: publicState(record.state) };
    }
    // 地区远征（tier region）：三图连战，完成整本才标记任务（docs/20 §2）。
    if (quest.tier === 'region') {
      const level = enemyLevel(ctx.player.day, regionById(quest.region).offset);
      const stageDays = QUEST_DAY_COST.region / DUNGEON_STAGES;
      const stages = mixedDungeonStages(`${ctx.player.id}:${ctx.player.day}:${quest.id}`, quest.region);
      const run = createRun(`run-${randomUUID().slice(0, 8)}`, ctx.player.id, quest.region, ready.map(u => u.id), level, ctx.player.flags.clearedRegions.length, { aiDifficulty, questId: quest.id, stageDays, stages });
      for (const unit of ready) { unit.lockedRunId = run.id; ctx.store.saveUnit(unit, ctx.player.id); }
      ctx.player.day += stageDays;
      syncPlayer(ctx.store, ctx.player);
      const record = createFieldBattle(ready, { region: quest.region, cleared: run.clearedAtStart, day: ctx.player.day - stageDays, seed, level, stageIndex: 0, runId: run.id, quest, aiDifficulty });
      record.playerId = ctx.player.id;
      run.battleId = record.id;
      ctx.store.saveRun(run);
      ctx.store.saveBattle(record);
      ctx.store.addEvent(ctx.player.id, 'quest', `接取地区远征「${quest.name}」（${regionById(quest.region).name}，三图）。`, { runId: run.id, questId: quest.id });
      ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
      return { battleId: record.id, questId: quest.id, run: runSummary(run), goalText: record.goalText, battle: battleView(record, false) };
    }
    const record = createFieldBattle(ready, { region: quest.region, cleared: ctx.player.flags.clearedRegions.length, day: ctx.player.day, seed, quest, aiDifficulty });
    record.playerId = ctx.player.id;
    ctx.player.day += QUEST_DAY_COST[quest.tier];
    syncPlayer(ctx.store, ctx.player);
    ctx.store.saveBattle(record);
    ctx.store.addEvent(ctx.player.id, 'quest', `接取任务「${quest.name}」（${regionById(quest.region).name}）。`, { battleId: record.id, questId: quest.id });
    ctx.push(OP.PHASE_STARTED, { battleId: record.id, turn: 1 });
    return { battleId: record.id, questId: quest.id, goalText: record.goalText, battle: battleView(record, false), state: publicState(record.state) };
  },

  [OP.CLAIM_QUEST_REWARD]: (ctx, data) => {
    if (data.questId === CROSS_TIME_QUEST_ID) throw new OpError('FORBIDDEN', '时空试炼胜利自动发奖，不可另领');
    const quest = questById(asString(data.questId, 'questId'));
    if (!quest) throw new OpError('NOT_FOUND', '没有这个任务');
    if (!(ctx.player.flags.questsDone ?? []).includes(quest.id)) throw new OpError('FORBIDDEN', '任务尚未完成');
    // 唯一奖励键：重复请求不会重复发（docs/20 §7）。
    ctx.player.flags.questRewardsClaimed ??= [];
    if (ctx.player.flags.questRewardsClaimed.includes(quest.id)) throw new OpError('FORBIDDEN', '该任务奖励已经领取过');
    // 先做完整校验再落账：名册满时不消耗领取资格，人物不丢失（docs/20 §5）。
    if (quest.recruit) {
      const units = ctx.store.units(ctx.player.id);
      const owned = units.some(u => u.character === quest.recruit);
      const active = units.filter(u => u.status === 'active').length;
      if (!owned && active >= ROSTER_LIMIT) throw new OpError('ROSTER_FULL', '名册已满，腾出位置后再领取（人物不会丢失）');
    }
    ctx.player.flags.questRewardsClaimed.push(quest.id);
    if (quest.unlocksLegacy) ctx.player.flags.legacyUnlocked = true;
    ctx.player.gold += quest.reward.gold;
    const items: [ItemKey, number][] = [...(quest.reward.items ?? [])];
    if (quest.exclusive) items.push([quest.exclusive, 1]);
    if (quest.kind === 'gather') {
      const extra = Math.max(0, (ctx.player.flags.questBoxes?.[quest.id] ?? 1) - 1);
      if (extra) items.push([quest.region === 3 ? 'ore' : quest.region === 5 ? 'herb' : 'wood', extra]);
    }
    for (const [item, count] of items) ctx.store.addInventory(ctx.player.id, item, stockUses(item), count);
    ctx.player.flags.regionReputation ??= {};
    const before = ctx.player.flags.regionReputation[quest.region] ?? 0;
    // 主线任务（region 0）不属于任何地区，不记声望。
    const after = quest.region > 0 ? before + quest.reward.reputation : before;
    if (quest.region > 0) ctx.player.flags.regionReputation[quest.region] = after;
    // 固定人物加入（docs/20 §5）：唯一性；校验已在落账前完成。
    const recruited: { character: string; name: string; unitId: string }[] = [];
    if (quest.recruit) {
      const units = ctx.store.units(ctx.player.id);
      const owned = units.some(u => u.character === quest.recruit);
      if (!owned) {
        const unit = createUnit(quest.recruit, CHARACTERS[quest.recruit].level, `u_${quest.recruit}`, ctx.player.day, true, { startingGear: 'recruit' });
        ctx.store.addUnit(ctx.player.id, unit);
        recruited.push({ character: quest.recruit, name: CHARACTERS[quest.recruit].name, unitId: unit.id });
      }
    }
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'quest-reward' });
    return { questId: quest.id, gold: quest.reward.gold, items, recruited, recruitLine: quest.recruit ? RECRUIT_LINES[quest.recruit] ?? null : null, reputation: { region: quest.region, before, after, tier: reputationTier(after) } };
  },

  [OP.BUY_QUEST_ITEM]: (ctx, data) => {
    const region = asNumber(data.region, 'region');
    if (!playerRegions(ctx.player).includes(region)) throw new OpError('FORBIDDEN', `尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
    const item = asString(data.item, 'item');
    const found = shopEntry(region, item);
    if (!found) throw new OpError('NOT_FOUND', '该地区不出售这件物品');
    const reputation = ctx.player.flags.regionReputation?.[region] ?? 0;
    if (reputation < found.entry.reputation) throw new OpError('FORBIDDEN', `需要 ${regionById(region).name} 声望 ${found.entry.reputation}`);
    if (ctx.player.gold < found.price) throw new OpError('NOT_ENOUGH_GOLD', `购买需要 ${found.price} 金币`);
    ctx.player.gold -= found.price;
    ctx.store.addInventory(ctx.player.id, found.entry.item, stockUses(found.entry.item), 1);
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'quest-shop' });
    return { region, item: found.entry.item, name: GAME_ITEMS[found.entry.item].name, price: found.price, gold: ctx.player.gold };
  },

  // 开局：自建神主角 + 两名同伴，一次事务完成（docs/00「神主角」、docs/13 §开局）。
  // 职业与成长类型固定（平民／成长型）：可选 legacy 字段传了错值要明确报错；培养倾向由属性分配
  // 自动推导，不接受手选。保留固定基础值，额外分配 10 点，每项 0–5。
  [OP.COMPLETE_SETUP]: (ctx, data) => {
    if (ctx.player.flags.setupCompleted) throw new OpError('FORBIDDEN', '开局已经完成，不能重开');
    const p = (data.protagonist ?? {}) as Record<string, unknown>;
    const name = asString(p.name, 'protagonist.name').trim();
    if (name.length < 2 || name.length > 12) throw new OpError('BAD_REQUEST', '主角姓名需要 2–12 个字符');
    const sex = p.sex === 'female' ? 'female' : p.sex === 'male' ? 'male' : null;
    if (!sex) throw new OpError('BAD_REQUEST', '主角性别需要 male 或 female');
    if (p.classId !== undefined && p.classId !== PROTAGONIST_CLASS_ID) {
      throw new OpError('BAD_REQUEST', `神主角固定以平民开局，不能自选职业（只接受 ${PROTAGONIST_CLASS_ID}）`);
    }
    if (p.growthType !== undefined && p.growthType !== PROTAGONIST_GROWTH_TYPE) {
      throw new OpError('BAD_REQUEST', `神主角成长类型固定为成长型（只接受 ${PROTAGONIST_GROWTH_TYPE}）`);
    }
    if (p.tendency !== undefined) throw new OpError('BAD_REQUEST', '培养倾向由属性分配自动推导，不能指定');
    const portrait = p.portrait === undefined ? `random:${sex}:${ctx.player.id}` : asString(p.portrait, 'protagonist.portrait');
    if (generatedPortraitSex(portrait) !== sex) throw new OpError('BAD_REQUEST', '主角形象需为与性别一致的随机形象键 random:male|female:seed（seed 为1–64位字母、数字、下划线或连字符）');
    const allocation = (p.allocation ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(allocation)) {
      if (!(STAT_KEYS as string[]).includes(key)) throw new OpError('BAD_REQUEST', `未知属性 ${key}`);
    }
    const alloc = { hp: 0, str: 0, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0, cha: 0 } as Stats;
    for (const key of STAT_KEYS) {
      const value = allocation[key] ?? 0;
      if (typeof value !== 'number' || !Number.isInteger(value) || value < PROTAGONIST_MIN_ALLOCATION[key] || value > PROTAGONIST_MAX_ALLOCATION[key]) {
        throw new OpError('BAD_REQUEST', `${key} 分配需为 ${PROTAGONIST_MIN_ALLOCATION[key]}–${PROTAGONIST_MAX_ALLOCATION[key]} 的整数`);
      }
      alloc[key] = value;
    }
    const spent = STAT_KEYS.reduce((sum, key) => sum + alloc[key], 0);
    if (spent !== PROTAGONIST_ALLOCATION_BUDGET) throw new OpError('BAD_REQUEST', `额外属性分配总计需为 ${PROTAGONIST_ALLOCATION_BUDGET} 点（当前 ${spent}）`);
    const tendency = deriveProtagonistTendency(alloc);
    const raw = Array.isArray(data.companions) ? data.companions : [];
    const ids = raw.map(value => asString(value, 'companions'));
    if (ids.length !== 2) throw new OpError('BAD_REQUEST', '必须正好选择 2 名同伴');
    if (new Set(ids).size !== 2) throw new OpError('BAD_REQUEST', '两名同伴不能重复');
    const pool = companionPool();
    for (const id of ids) {
      if (!pool.includes(id as CharacterId)) throw new OpError('FORBIDDEN', `${id} 不能作为开局同伴`);
    }
    // 先移除占位主角，再建自捏主角与同伴（同一请求内一次写入）。
    const placeholder = ctx.store.units(ctx.player.id).find(u => u.isProtagonist);
    if (placeholder) ctx.store.removeUnit(ctx.player.id, placeholder.id);
    const base = Object.fromEntries(STAT_KEYS.map(key => [key, PROTAGONIST_BASE_STATS[key] + alloc[key]])) as Stats;
    const hero = createUnit('erin', 1, 'u_protagonist', ctx.player.day, true, {
      classId: PROTAGONIST_CLASS_ID, growthType: PROTAGONIST_GROWTH_TYPE, age: 16,
      base, personalGrowth: PROTAGONIST_TENDENCIES[tendency].growth, startingGear: 'basic',
    });
    hero.name = name;
    hero.sex = sex;
    hero.portrait = portrait;
    hero.isProtagonist = true;
    ctx.store.addUnit(ctx.player.id, hero);
    for (const id of ids) {
      ctx.store.addUnit(ctx.player.id, createUnit(id as CharacterId, 1, `u_${id}`, ctx.player.day, true, { classId: CHARACTERS[id as CharacterId].classId, startingGear: 'basic' }));
    }
    ctx.player.protagonist = hero.character;
    ctx.player.flags.companions = ids as CharacterId[];
    ctx.player.flags.setupCompleted = true;
    ctx.store.savePlayer(ctx.player);
    ctx.push(OP.STATE_CHANGED, { reason: 'setup' });
    return {
      protagonist: { id: hero.id, name, sex, classId: PROTAGONIST_CLASS_ID, portrait, tendency },
      companions: ids, state: stateView(ctx.store, ctx.player),
    };
  },

  // ---- agent narrative ---------------------------------------------------

  [OP.AGENT_REPORT_PLAN]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'plan', text, null);
    return { ok: true };
  },
  // 阶段意图挂到战斗与当时的回合上（不带 battleId 时用进行中的战斗），观战与回放按回合显示。
  [OP.AGENT_PHASE_NOTE]: (ctx, data) => {
    const text = asString(data.text, 'text');
    const battle = typeof data.battleId === 'string' ? ctx.store.battle(ctx.player.id, data.battleId) : ctx.store.activeBattle(ctx.player.id);
    const battleId = battle?.id ?? (typeof data.battleId === 'string' ? data.battleId : null);
    ctx.store.addNote(ctx.player.id, 'phase', text, battleId, battle?.state.turn ?? null);
    return { ok: true, battleId, turn: battle?.state.turn ?? null };
  },
  [OP.AGENT_COMMENT_BATTLE]: (ctx, data) => {
    const text = asString(data.text, 'text');
    const battle = typeof data.battleId === 'string' ? ctx.store.battle(ctx.player.id, data.battleId) : ctx.store.activeBattle(ctx.player.id);
    const battleId = battle?.id ?? (typeof data.battleId === 'string' ? data.battleId : null);
    ctx.store.addNote(ctx.player.id, 'comment', text, battleId, battle?.state.turn ?? null);
    return { ok: true, battleId };
  },
  [OP.AGENT_DAILY_REPORT]: (ctx, data) => {
    const text = asString(data.text, 'text');
    ctx.store.addNote(ctx.player.id, 'daily', text, null);
    return { ok: true };
  },
};

// Late import to break the model<->services cycle for the few model helpers used above.

// 报价构造：不改变世界，只计算成本、起止日期、风险、途经日期事件与阻挡（docs/13 §3.2）。
interface ActionQuote {
  dungeonStages?: DungeonStage[];
  encounter?: ReturnType<typeof fieldEncounter> & { map: ReturnType<typeof encounterMap> };
  aiDifficulty?: 'normal' | 'hard';
  aiDifficultyText?: string;
  op: number;
  action: string;
  payload: Record<string, unknown>;
  costDays: number;
  costGold: number;
  fromDay: number;
  toDay: number;
  date: ReturnType<typeof dateOf>;
  risk: 'permadeath' | 'simulation';
  events: { day: number; kind: string }[];
  blockers: string[];
}

function dateEventsBetween(fromDay: number, toDay: number): { day: number; kind: string }[] {
  const out: { day: number; kind: string }[] = [];
  for (let day = fromDay + 1; day <= toDay; day++) {
    if (annualWindowOpen(day) && !annualWindowOpen(day - 1)) out.push({ day, kind: 'annual' });
    if (day % DAYS_PER_SEASON === 0) out.push({ day, kind: 'month' });
    if (isArenaDay(day)) out.push({ day, kind: 'arena' });
  }
  return out;
}

function deploymentUnits(ctx: Context, value: unknown, max: number) {
  if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some(id => typeof id !== 'string' || !id.trim()))) throw new OpError('BAD_REQUEST', 'unitIds 需要非空角色 ID 列表');
  const ids = value as string[] | undefined;
  if (ids && (new Set(ids).size !== ids.length || ids.length > max)) throw new OpError('BAD_REQUEST', `角色不可重复，最多出战 ${max} 人`);
  const units = ids ? ids.map(id => requireUnit(ctx.store, ctx.player, id)) : ctx.store.units(ctx.player.id).filter(u => u.status === 'active' && !u.lockedRunId && !u.lockedDispatchId).slice(0, max);
  const busy = units.find(u => u.lockedRunId || u.lockedDispatchId);
  if (busy) throw new OpError('FORBIDDEN', `${unitName(busy)} 正在远征或派遣中`);
  if (!units.length || units.some(u => u.status !== 'active')) throw new OpError('BAD_REQUEST', '名单包含无法出战的角色');
  return units;
}

function buildQuote(ctx: Context, action: string, data: Json): ActionQuote {
  const player = ctx.player;
  const fighting = !!ctx.store.activeBattle(player.id);
  const run = ctx.store.activeRun(player.id);
  const blockers: string[] = [];
  if (ctx.store.activeAnnualEntry(player.id) && action !== 'annual') blockers.push('大竞技场进行中，请先完成或退出本届赛事');
  let op = 0;
  let payload: Record<string, unknown> = {};
  let costDays = 0;
  let costGold = 0;
  let risk: 'permadeath' | 'simulation' = 'simulation';
  switch (action) {
    case 'sortie': {
      op = OP.SORTIE;
      costDays = ACTION_DAYS.sortie;
      risk = 'permadeath';
      const region = asNumber(data.region, 'region');
      payload = { region, unitIds: data.unitIds, aiDifficulty: asAiDifficulty(data.aiDifficulty) };
      if (payload.aiDifficulty === 'hard' && !hardUnlocks(ctx.store, player).regions.includes(region)) blockers.push('先以普通难度赢得本地区野外战斗，才能挑战困难野外战斗');
      if (fighting) blockers.push('已有进行中的战斗');
      if (isActiveRun(run)) blockers.push('远征进行中');
      if (!playerRegions(player).includes(region)) blockers.push(`尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
      break;
    }
    case 'sweep': {
      op = OP.SWEEP;
      const region = asNumber(data.region, 'region');
      const times = Math.max(1, Math.min(10, typeof data.times === 'number' ? data.times : 1));
      costDays = ACTION_DAYS.sweep * times;
      payload = { region, times };
      if (!player.flags.clearedRegions.includes(region)) blockers.push('只能扫荡已讨伐地区');
      break;
    }
    case 'train': {
      op = OP.TRAIN;
      costDays = ACTION_DAYS.train;
      costGold = TRAIN_GOLD;
      payload = { unitId: data.unitId, weaponType: data.weaponType };
      if (ctx.store.activeBattle(player.id)?.state.units.some(unit => unit.id === data.unitId)) blockers.push('战斗中的队员不能培养或调整物资');
      if (player.gold < TRAIN_GOLD) blockers.push(`训练需要 ${TRAIN_GOLD} 金币`);
      break;
    }
    case 'art_training': {
      op = OP.TRAIN_ART;
      const unit = requireUnit(ctx.store, player, asString(data.unitId, 'unitId'));
      const training = requireArtTraining(asString(data.art, 'art'));
      payload = { unitId: unit.id, art: training.art };
      costDays = training.days;
      costGold = training.gold;
      const problem = artTrainingProblem(ctx, unit, training);
      if (problem) blockers.push(problem.message);
      break;
    }
    case 'rest': {
      op = OP.REST;
      costDays = Math.max(1, Math.min(500, typeof data.days === 'number' ? data.days : 1));
      payload = { days: costDays };
      break;
    }
    case 'recruit': {
      op = OP.RECRUIT;
      costDays = ACTION_DAYS.recruit;
      const region = asNumber(data.region, 'region');
      payload = { region };
      if (!playerRegions(player).includes(region)) blockers.push(`尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
      if (ctx.store.units(player.id).filter(u => u.status === 'active').length >= ROSTER_LIMIT) blockers.push('名册已满');
      break;
    }
    case 'dungeon': {
      op = OP.START_DUNGEON;
      costDays = DUNGEON_STAGE_DAYS;
      risk = 'permadeath';
      const region = asNumber(data.region, 'region');
      payload = { region, unitIds: data.unitIds, aiDifficulty: asAiDifficulty(data.aiDifficulty) };
      if (payload.aiDifficulty === 'hard' && !hardUnlocks(ctx.store, player).dungeons.includes(region)) blockers.push('先以普通难度完整通关本地区副本，才能挑战困难副本');
      if (fighting) blockers.push('已有进行中的战斗');
      if (isActiveRun(run)) blockers.push('已有进行中的远征');
      if (!playerRegions(player).includes(region)) blockers.push(`尚未解锁 ${regionById(region).name}；先在世界地图选择行军路线`);
      if (!combatFeaturesOpen(ctx.store, player, playerRegions(player))) blockers.push('完成一次地区讨伐后开放大副本');
      break;
    }
    case 'annual': {
      op = OP.START_ANNUAL_MATCH;
      costDays = ACTION_DAYS.festivalMatch;
      risk = 'permadeath';
      if (fighting) blockers.push('已有进行中的战斗');
      if (isActiveRun(run)) blockers.push('远征进行中');
      if (!ctx.store.activeAnnualEntry(player.id)) blockers.push('没有进行中的大竞技场报名');
      break;
    }
    default:
      throw new OpError('BAD_REQUEST', 'action 取 sortie / sweep / train / art_training / rest / recruit / dungeon / annual');
  }
  let encounter: ActionQuote['encounter'];
  let dungeonStages: DungeonStage[] | undefined;
  if (action === 'sortie' || action === 'dungeon') {
    const region = asNumber(data.region, 'region');
    const difficulty = asAiDifficulty(data.aiDifficulty);
    const dungeon = action === 'dungeon' ? dungeonPlan(player, region, difficulty) : null;
    const plan = dungeon?.encounter ?? fieldEncounter(player.id, player.day, region, difficulty);
    dungeonStages = dungeon?.stages;
    deploymentUnits(ctx, data.unitIds, plan.maxUnits);
    encounter = { ...plan, map: encounterMap(plan, player.day) };
  }
  const toDay = player.day + costDays;
  for (const unit of ctx.store.units(player.id).filter(unit => unit.status === 'active')) {
    const end = nextLifespanEventDay(unit, player.day, toDay);
    const message = end === null ? '' : `${unitName(unit)} 将在 ${dateOf(end).label} 寿终；请先安排传承／退役或缩短行动`;
    if (end !== null && !blockers.includes(message)) blockers.push(message);
  }
  return { encounter, dungeonStages, ...(payload.aiDifficulty ? { aiDifficulty: asAiDifficulty(payload.aiDifficulty), aiDifficultyText: `战斗难度：${payload.aiDifficulty === 'hard' ? `困难（hard）；${HARD_ENEMY_EFFECT}` : '普通（normal）；敌军属性不加成'}` } : {}), op, action, payload, costDays, costGold, fromDay: player.day, toDay, date: dateOf(toDay), risk, events: dateEventsBetween(player.day, toDay), blockers };
}

// ---- 战报与 Agent 说明 -----------------------------------------------------

export const REPLAY_ACTIVITIES = [
  { id: 'field', name: '野外遭遇战' }, { id: 'quest', name: '地区任务' }, { id: 'dungeon', name: '连续副本' },
  { id: 'challenge', name: '挑战塔' }, { id: 'arena', name: '普通竞技场' }, { id: 'annual', name: '年度大竞技场' }, { id: 'sparring', name: '练习' },
] as const;
type ReplayActivity = (typeof REPLAY_ACTIVITIES)[number]['id'];

export function replayActivity(record: BattleRecord): ReplayActivity {
  if (record.mode === 'sparring') return 'sparring';
  if (record.mode === 'arena') return 'arena';
  if (record.mode === 'festival') return 'annual';
  if (record.challengeId) return 'challenge';
  if (record.runId) return 'dungeon';
  if (record.questId) return 'quest';
  return 'field';
}

function battleNotes(ctx: Context, battleId: string, owner = ctx.player.id) {
  return ctx.store.notesForBattle(owner, battleId).map(note => ({ kind: note.kind, turn: note.turn ?? null, text: note.text, at: note.createdAt }));
}

function replaySummary(ctx: Context, r: { id: string; playerId: string; data: BattleRecord; publicAt: number; createdAt: number }) {
  const record = r.data;
  const compat = replayCompatibility(record as BattleRecord & { rulesetVersion?: string });
  const players = record.state.units.filter(u => u.side === 'player' && !u.npc);
  return {
    id: r.id, name: record.name, kind: record.kind, mode: record.mode, activity: replayActivity(record),
    winner: record.state.result?.winner ?? null, reason: record.state.result?.reason ?? null,
    turns: record.state.turn, createdAt: r.createdAt, publicAt: r.publicAt, public: r.publicAt <= Date.now(), mine: r.playerId === ctx.player.id,
    day: record.endDay ?? null, region: record.region ?? null, questId: record.questId ?? null, questName: record.questId ? questById(record.questId)?.name ?? null : null,
    runId: record.runId ?? null, stageIndex: record.stageIndex ?? null, annualId: record.annualId ?? null, challengeId: record.challengeId ?? null,
    opponentId: record.opponentId ?? null, arenaDay: record.arenaDay ?? null,
    fielded: players.length, fallen: players.filter(u => !u.alive && !u.escaped).length,
    // 兼容性单独成字段，不覆盖战斗结果的 reason。
    rulesetVersion: record.rulesetVersion ?? 'rules-v1', compatible: compat.compatible, compatibilityNote: compat.reason,
  };
}

// 参战记录：按已保存的本人战报统计出场、胜场与击败数（击败 = 由该单位出手把目标打到 0 HP）。
function serviceRecords(ctx: Context): Map<string, { battles: number; wins: number; kills: number }> {
  const out = new Map<string, { battles: number; wins: number; kills: number }>();
  for (const replay of ctx.store.replays(ctx.player.id, 200).filter(r => r.playerId === ctx.player.id)) {
    const record = replay.data;
    const won = record.state.result?.winner === 'player';
    for (const unit of record.initial.units.filter(u => u.side === 'player')) {
      const row = out.get(unit.id) ?? { battles: 0, wins: 0, kills: 0 };
      row.battles++;
      if (won) row.wins++;
      out.set(unit.id, row);
    }
    for (const event of record.events) {
      if (event.t !== 'combat') continue;
      for (const strike of event.strikes) {
        if (strike.hpAfter !== 0 || strike.damage === 0) continue;
        const row = out.get(strike.by);
        if (row) row.kills++;
      }
    }
  }
  return out;
}

function requireArenaDay(ctx: Context, data: Json): ArenaDayRecord {
  const day = typeof data.day === 'number' ? data.day : ctx.player.day;
  const record = ctx.store.arenaDay(ctx.player.id, day) ?? ctx.store.latestArenaDay(ctx.player.id);
  if (!record) throw new OpError('ARENA_NOT_OPEN', '现在不是竞技场日，或你还没有报名');
  return record;
}

function findOpponent(record: ArenaDayRecord, id: string): Defense {
  const opponent = record.opponents.find(o => o.id === id);
  if (!opponent) throw new OpError('NOT_FOUND', `今天没有对手 ${id}`);
  return opponent;
}

function opponentView(opponent: { id: string; legion: string; points: number; record: string; map: string }) {
  const map = ARENA_MAPS[opponent.map as keyof typeof ARENA_MAPS];
  return {
    id: opponent.id, legion: opponent.legion, points: opponent.points, record: opponent.record,
    map: opponent.map, mapName: map.name, deploy: map.deploy, bans: map.bans, turnLimit: map.turnLimit,
    goalText: map.goalText, feature: map.feature,
  };
}

function arenaProgress(record: { attacks: Record<string, { status: string; points: number }>; defensePoints: number }) {
  const records = Object.values(record.attacks);
  return {
    done: records.filter(r => r.status === 'won' || r.status === 'lost').length,
    total: records.length,
    points: records.reduce((sum, r) => sum + r.points, 0) + record.defensePoints,
  };
}

export function dispatch(ctx: Context, op: number, data: Json): unknown {
  const handler = handlers[op];
  if (!handler) throw new OpError('UNKNOWN_OP', `没有 op ${op}`);
  const inTransaction = ctx.store.db.isTransaction;
  return ctx.store.transaction(() => {
    // Keep the caller's object, but discard snapshots superseded by another command.
    if (!inTransaction) {
      const current = ctx.store.getPlayer(ctx.player.id);
      if (current && current.version !== ctx.player.version) Object.assign(ctx.player, current);
    }
    // Credential actor drives heartbeat; model is optional display metadata.
    if ((ctx.actor ?? (ctx.agentModel ? 'agent' : 'human')) === 'agent') {
      const now = Date.now();
      if (!ctx.player.flags.agentLastSeen || now - ctx.player.flags.agentLastSeen > 60_000) {
        ctx.player.flags.agentLastSeen = now;
        ctx.store.savePlayer(ctx.player);
      }
    }
    // 幂等命令收据 (docs/13 §1.4、§2.1)：带 commandId 的写命令超时重发返回原结果，换负载则报冲突。
    const commandId = typeof data.commandId === 'string' && data.commandId.length > 0 ? data.commandId : null;
    if (!commandId) return runHandler(ctx, op, handler, data);
    const payloadHash = commandHash(op, data);
    const existing = ctx.store.receipt(ctx.player.id, commandId);
    if (existing) {
      if (existing.payloadHash !== payloadHash || existing.op !== op) {
        throw new OpError('IDEMPOTENCY_CONFLICT', '同一个 commandId 被用于不同的请求负载');
      }
      return existing.response;
    }
    const result = runHandler(ctx, op, handler, data);
    ctx.store.saveReceipt(ctx.player.id, commandId, op, payloadHash, result);
    return result;
  });
}

// 写命令成功后推进玩家版本，供预览／执行绑定（docs/13 §2.1）。
function runHandler(ctx: Context, op: number, handler: Handler, data: Json): unknown {
  const annual = ctx.store.activeAnnualEntry(ctx.player.id);
  if (annual && WRITE_OPS.has(op) && !ANNUAL_OPS.has(op)) {
    throw new OpError('FORBIDDEN', '大竞技场名单已经报名，整届固定物资与培养，请先完成或退出本届赛事');
  }
  const lease = ctx.player.flags.controlLease;
  const actor = ctx.actor ?? (ctx.agentModel ? 'agent' : 'human');
  if (lease && lease.expiresAt > Date.now() && lease.owner !== actor && WRITE_OPS.has(op) && op !== OP.CLAIM_CONTROL && op !== OP.RELEASE_CONTROL) {
    throw new OpError('FORBIDDEN', `控制权由 ${lease.owner} 持有，租约至 ${new Date(lease.expiresAt).toISOString()}`);
  }
  const battle = ctx.store.activeBattle(ctx.player.id);
  const unitId = typeof data.unitId === 'string' ? data.unitId : null;
  if (battle && unitId && battle.state.units.some(unit => unit.id === unitId) && WRITE_OPS.has(op) && !ANNUAL_OPS.has(op)) {
    throw new OpError('BATTLE_IN_PROGRESS', '战斗中的队员不能培养或调整物资');
  }
  const expectedVersion = ctx.player.version ?? 0;
  const opName = OP_BY_NUMBER.get(op)?.name;
  const schema = opName ? schemaFor(opName) : undefined;
  if (schema) {
    for (const key of schema.required ?? []) {
      if (data[key] === undefined) throw new OpError('BAD_REQUEST', `缺少字段 ${key}`);
    }
    for (const [key, rule] of Object.entries(schema.properties)) {
      const value = data[key];
      if (value === undefined) continue;
      if (rule.type === 'string' && typeof value !== 'string') throw new OpError('BAD_REQUEST', `${key} 需要字符串`);
      if (rule.type === 'number' && typeof value !== 'number') throw new OpError('BAD_REQUEST', `${key} 需要数字`);
      if (rule.type === 'boolean' && typeof value !== 'boolean') throw new OpError('BAD_REQUEST', `${key} 需要布尔值`);
      if (rule.type === 'array' && !Array.isArray(value)) throw new OpError('BAD_REQUEST', `${key} 需要数组`);
      if (rule.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) throw new OpError('BAD_REQUEST', `${key} 需要对象`);
      if (rule.enum && !rule.enum.includes(value as string | number)) throw new OpError('BAD_REQUEST', `${key} 取值不合法`);
      if (typeof value === 'number' && rule.minimum !== undefined && value < rule.minimum) throw new OpError('BAD_REQUEST', `${key} 低于下限`);
      if (typeof value === 'number' && rule.maximum !== undefined && value > rule.maximum) throw new OpError('BAD_REQUEST', `${key} 超过上限`);
    }
  }
  let result: unknown;
  try { result = handler(ctx, data); }
  catch (error) {
    if (error instanceof EngineError) throw new OpError(error.code, error.message);
    throw error;
  }
  // Quoted execution already advances the version in its inner operation.
  if (WRITE_OPS.has(op) && op !== OP.EXECUTE_ACTION) {
    ctx.player.version = expectedVersion + 1;
    ctx.store.savePlayer(ctx.player, expectedVersion);
  }
  return result;
}

const ANNUAL_OPS = new Set<number>([
  OP.START_ANNUAL_MATCH, OP.START_MAIN_STAGE, OP.WITHDRAW_ANNUAL, OP.UNIT_ACT, OP.END_PHASE,
  OP.RETREAT, OP.SURRENDER, OP.EXECUTE_ACTION, OP.CLAIM_CONTROL, OP.RELEASE_CONTROL,
]);

// 负载摘要包含操作与数据（去掉 commandId），不包含连接 seq（docs/13 §2.1）。
function commandHash(op: number, data: Json): string {
  const rest: Json = {};
  for (const [key, value] of Object.entries(data)) if (key !== 'commandId') rest[key] = value as Json;
  return createHash('sha256').update(`${op}:${stableStringify(rest)}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function hasHandler(op: number): boolean {
  return op in handlers;
}

export { requireUnit, requireBattle, isArenaDay, encounterLevel, rankFromExp, toSnapshot };
