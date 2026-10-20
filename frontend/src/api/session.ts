// The server session: one place that logs in, keeps GET_STATE / GET_TODAY / GET_ARENA / GET_ROSTER and
// the other shared views, and exposes the op wrappers the screens call. Everything else in the frontend
// derives from here, so there is exactly one source of truth (docs/06「协议只在 common 定义一处」).
import type { AiDifficulty } from '@common/engine/types.ts';
import type { FieldEncounter } from '@common/game/encounters.ts';
import type { BattleMap } from '@common/maps/map.ts';
import { useSyncExternalStore } from 'react';
import { OP } from '@common/protocol/ops.ts';
import type { Action, BattleEvent, BattleState, Point } from '@common/engine/index.ts';
import type { SnapshotUnit } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import type { Rank, StatCaps, StatKey, Stats, WeaponType } from '@common/data/types.ts';
import type { FeatureAccess, WorldMapView } from '@common/game/region-map.ts';
import { ApiError, call, login as apiLogin, newCommandId, setToken, token } from './client.ts';
import { parseRoute } from '../router.ts';
import type { Route } from '../router.ts';

export interface WeaponInstance { id: string; durability: number; maxDurability: number; refinement?: number }
export interface BookInstance { id: string; charges: number; maxCharges: number }

// 身份来源（服务端 unitOrigin）：神主角、固定人物（开局同伴／任务加入）或随机招募。
export type UnitOrigin = 'protagonist' | 'fixed' | 'recruit';
export type LifespanWarning = 'none' | 'oneYear' | 'lastSeason' | 'due';

export interface ServerUnit {
  id: string;
  character: CharacterId;
  crossTimeIdentity?: string | null;
  name: string;
  sex: 'male' | 'female' | null;
  portrait: string | null;
  classId: string;
  homeClassId: string;
  className: string;
  tier: string;
  stage: number;
  route: string;
  species: 'human' | 'beast' | 'dragon';
  ranks: Partial<Record<WeaponType, Rank>>;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  status: 'active' | 'dead' | 'retired';
  equipped: string | null;
  items: string[];
  growthType: 'early' | 'normal' | 'late' | 'growth';
  growthTypeName: string;
  age: number;
  // 服务端算好的合计成长（含个人、分配、职业、装备与年龄修正）；页面不自行拼加。
  totalGrowth: Record<StatKey, number>;
  joinedDay: number;
  weaponExp: Partial<Record<WeaponType, number>>;
  growthLog: { level: number; gains: Record<string, number>; inherited?: Record<string, number> }[];
  // 能力药 used per stat this round (docs/00: 5 per stat, 20 in total).
  drugCounts: Record<string, number>;
  // 永久军团 (docs/00 §5、§7): one reincarnation per life, one inherited legacy per life.
  cycle: 0 | 1;
  lineageDepth: 0 | 1;
  isProtagonist: boolean;
  origin: UnitOrigin;
  lockedRunId: string | null;
  lockedDispatchId: string | null;
  hasInheritance: boolean;
  growthAllocation: Partial<Record<StatKey, number>>;
  personalGrowth: Partial<Stats> | null;
  inheritedGrowth: Partial<Stats> | null;
  classQualifications: string[];
  classMastery: Record<string, number>;
  learnedSkills: string[];
  equippedSkills: string[];
  learnedArts: string[];
  equippedArts: string[];
  equipmentArts: string[];
  // 用限量教材学会的法术（施放还要持书并达到熟练度）。
  learnedSpells: string[];
  lifespanYears: number;
  lifespanEndDay: number | null;
  daysUntilBirthday: number;
  lifespanWarning: LifespanWarning;
  weaponInstances: WeaponInstance[];
  bookInstances: BookInstance[];
  spellbooks: BookInstance[];
  snapshot: SnapshotUnit;
}

export interface CharacterStory {
  profile: string;
  personalQuest: { id: string; name: string; region: number; description: string };
  discovery: string;
  tavern: string[];
}

// GET_UNIT: the summary plus caps, the weapons' numbers, learned/equipment arts and the character story.
export interface ServerUnitDetail extends ServerUnit {
  stats: Stats; caps: StatCaps; con: number;
  weapons: { id: string; name: string; type: WeaponType; might: number; hit: number; crit: number; range: [number, number] }[];
  arts: string[]; equipmentSkills: string[];
  promotedFrom: string | null;
  story: CharacterStory | null;
}

export interface PendingRecruit {
  id: string; region: number; regionName: string; day: number; name: string; sex: 'male' | 'female';
  species: 'human' | 'beast' | 'dragon'; classId: string; className: string; level: number; portrait: CharacterId;
}

export interface ServerState {
  hardUnlocks?: { regions: number[]; dungeons: number[]; quests: string[] };
  player: { id: string; name: string; legion: string; protagonist: string };
  // Bumped by every successful write; pages that load their own data refetch when it moves.
  version: number;
  eventCursor?: string;
  day: number;
  date: { year: number; season: number; dayOfSeason: number; dayOfMonth: number; label: string };
  gold: number;
  bexp: number;
  arena: { points: number; medals: number; registered: boolean; nextArenaDay: number; isArenaDay: boolean; rank: { place: number | null; change: number } };
  nextMonthStart: number;
  actionDays: number;
  rosterLimit: number;
  rosterCount: number;
  units: ServerUnit[];
  inventory: { item: string; name: string; uses: number; count: number; bound: boolean }[];
  // 活动途中阵亡者的装备，活动结束后才回到仓库。
  recoveryBag: { item: string; name: string; uses: number; bound: boolean }[];
  regions: { id: number; name: string; offset: number; resource: string; cleared: boolean }[];
  progress: { cleared: number; baseLevel: number };
  festival: { round: number; year: number; nextDay: number };
  agentPlan: string | null;
  agentLastSeen: number | null;
  pendingRecruit: PendingRecruit | null;
  legacyUnlocked: boolean;
  control: { owner: string; expiresAt: number } | null;
  perfectWeapons: Record<string, number>;
  // 世界地图视图（GET_STATE 内嵌，@common/game/region-map.ts WorldMapView）：节点状态、路线与可选地区。
  world: WorldMapView;
  // 功能旗标（FeatureAccess）：未开放的模块不进导航、直达路由回落到世界地图。
  features: FeatureAccess;
  // 开局自选同伴：新账号只发主角，needed 为 true 时要先选两名同伴（docs/20 §5.1）。
  setup: {
    needed: boolean;
    pool: { id: string; name: string; classId: string; level: number }[];
    chosen: string[] | null;
    // 神主角固定 平民／成长型；培养倾向由属性分配自动推导，前端只发分配值。
    protagonist: {
      classId: string;
      className: string;
      growthType: string;
      baseStats: Record<string, number>;
      budget: number;
      defaultAllocation: Record<string, number>;
      minPerStat: Record<string, number>;
      maxPerStat: Record<string, number>;
    };
  };
}

export interface ServerOpponent {
  id: string; legion: string; points: number; record: string; map: string; mapName: string;
  deploy: number; bans: number; turnLimit: number; goalText: string; feature: string;
}

export interface ServerArena {
  season: number; points: number; medals: number; registered: boolean; isArenaDay: boolean;
  nextArenaDay: number; day: number | null; settled: boolean;
  progress: { done: number; total: number; points: number } | null;
  opponents: ServerOpponent[];
  mapPool: { id: string; name: string; deploy: number; bans: number; turnLimit: number; goalText: string; feature: string }[];
}

// GET_OPPONENT: the defender's list with stats and gear (no positions or AI) for the ban step.
export interface OpponentUnit { id?: string; character: CharacterId; portrait?: string | null; name: string; classId: string; level: number; stats: Stats; weapons: string[]; ranks: Partial<Record<WeaponType, Rank>> }
export interface ServerOpponentDetail { opponent: ServerOpponent; list: OpponentUnit[] }
// ARENA_BAN: who actually fields and where, the defending commander, and which of mine are barred.
export interface ArenaReveal { fielded: { id?: string; character: CharacterId; name: string; pos: Point }[]; commander: string; barred: string[] }

// GET_TODAY: what each camp action costs right now, and the sortie rules shown before committing days.
export interface TodayAction {
  key: 'sortie' | 'sweep' | 'train' | 'rest' | 'recruit';
  name: string;
  costDays: number;
  costGold?: number;
  available: boolean;
  note: string;
  maxUnits?: number;
  turnLimit?: number;
  goalText?: string;
  lethal?: boolean;
}

export interface FirstClearReward {
  items: { item: string; count: number }[];
  available: boolean;
}

export interface ServerToday {
  day: number;
  date: ServerState['date'];
  actions: TodayAction[];
  sortieRegions: { encounters?: Record<AiDifficulty, FieldEncounter>; dungeonEncounters?: Record<AiDifficulty, FieldEncounter>; id: number; name: string; resource: string; cleared: boolean; level: number; hardUnlocked?: boolean; dungeonFirstClearRewards: Record<AiDifficulty, FirstClearReward>; dungeonStages: { name: string; scenarioId?: string }[]; dungeonHardUnlocked?: boolean }[];
  festival: { open: boolean; round: number; costDays: number };
  nextArenaDay: number;
  nextMonthStart: number;
  battle: { id: string; name: string; kind: 'field' | 'arena'; mode: string; turn: number; opponentId: string | null } | null;
}

// GET_SHOP: this season's stock; it refills on the first day of each season.
// price 为实付单价；庆典期间 discount 为折扣百分比，basePrice 为原价。
export interface ShopRow { item: string; name: string; price: number; basePrice?: number; discount?: number; stock: number; kind: 'weapon' | 'consumable' | 'seal' | 'stat' | 'material' | 'food' | 'key' }

// GET_SNAPSHOTS: the roster as saved on each arena day the player registered (docs/00 §10).
export interface ServerSnapshot { day: number; date: ServerState['date']; roster: SnapshotUnit[] }

export interface ArenaAttackView { opponentId: string; legion?: string; status: string; points: number; bans: CharacterId[]; battleId: string | null; noShow?: boolean; surrender?: boolean }
export interface ArenaResults {
  day: number | null; settled: boolean; attacks: ArenaAttackView[];
  points: number; medals: number;
}

// GET_RATINGS: the real-month arena table (docs/13 §6.4).
export interface ServerRatings {
  period: { id: string; startsAt: number; endsAt: number };
  current: { rating: number; wins: number; losses: number; matches: number; rank: number | null; field: number };
  points: number;
  archived: { id: string; finalizedAt: number | null; reward: { periodId: string; finalRank: number; reward: { gold: number }; claimedAt: number | null } | null }[];
}

// GET_RUN: the current or latest three-map dungeon run (docs/00 §8.1.3).
export interface ServerRun {
  encounter?: FieldEncounter;
  aiDifficulty?: AiDifficulty;
  id: string; region: number; state: 'battle' | 'between_maps' | 'completed' | 'failed' | 'withdrawn';
  stageIndex: number; level: number; unitIds: string[]; survivingIds: string[]; battleId: string | null;
  // What each survivor brings into the next map: HP and supplies do not recover in between.
  carry: Record<string, { hp: number; items: { id: string; uses: number }[]; weapons: string[] }>;
  pendingLoot: { item: string; count: number }[]; canContinue: boolean;
  // 经典地图副本按场景数结算；随机三图副本也返回 3。
  stageCount?: number; stageDays?: number; stageDayCosts?: number[];
  stageNames?: string[] | null; stageName?: string | null; nextStageName?: string | null;
  questId?: string | null;
}

// GET_ANNUAL: this year's 大竞技场 and the player's entry (docs/00 §9.4).
export type AnnualState = 'qualifier' | 'knockout' | 'eliminated' | 'champion' | 'withdrawn';
export interface ServerAnnual {
  annualIndex: number; windowOpen: boolean; nextOpenDay: number;
  qualifierMatches: number; qualifierWins: number; costDays: number;
  entry: {
    id: string; annualIndex: number; state: AnnualState; qualifierWins: number; qualifierCount: number;
    round: number; unitIds: string[]; survivingIds: string[]; battleId: string | null;
  } | null;
}

// GET_STORY: the eight yearly chapters. Titles arrive once a chapter opens, what was learned once it is done.
export interface StoryChapter {
  chapter: number; openDay: number; available: boolean; completed: boolean; claimed: boolean; title: string | null; learned: string | null;
  event?: string | null; discoveries?: string[];
  finalBoss?: { floorId: string; available: boolean; defeated: boolean } | null;
  quest?: StoryQuest | null;
}
export interface StoryStep {
  id: string; kind: 'dispatch' | 'submit' | 'find' | 'duel' | 'arena' | 'tavern'; name: string; briefing: string; optional: boolean; done: boolean; available: boolean;
  days?: number; item?: string; itemName?: string; count?: number; held?: number | null;
  // find：在哪条固定经典远征、哪张图里；duel：对手名与等级；arena／tavern：需要的胜场和已有的进度。
  where?: string; mapName?: string; enemy?: string; level?: number; wins?: number; have?: number;
  // 完成的那一刻自动发放的奖励。
  reward?: { gold: number; bexp?: number; items?: [string, number][] };
}
// 主线任务（docs/38）：每章一张改编过的经典地图；胜利即完成本章，线索藏在图里的隐藏箱中。
export interface StoryQuest {
  id: string; name: string; briefing: string; objective: string; kind: QuestView['kind']; mapName: string;
  turnLimit: number; maxUnits: number; costDays: number; toDay: number; enemyLevel: number;
  reward: { gold: number; reputation: number; items?: [string, number][] };
  done: boolean; claimed: boolean; inProgress: boolean; available: boolean; legacyCompleted: boolean;
  // 收尾战之前的前置任务：先派遣探索，再提交材料；prerequisite 是第一个没完成的前置任务名。
  steps: StoryStep[]; prerequisite: string | null;
  clue: { item: string; name: string; held: boolean; note: string | null };
}
// 地区固定人物的伙伴任务：人物加入过名册后解锁，任务本身在地区任务页接取。
export interface StoryCompanion {
  character: string; name: string; region: number; recruited: boolean; questId: string; questName: string; done: boolean; epilogue: string | null;
}
export interface ServerStory { bexp: number; annualSummary?: { text: string; data: unknown }; chapters: StoryChapter[]; companions?: StoryCompanion[] }

// GET_QUESTS: regional quests and reputation (docs/20).
export interface QuestView {
  firstClearRewards: Record<AiDifficulty, FirstClearReward> | null;
  dungeonOnly: boolean; archived: boolean; stageNames: string[] | null;
  hardAvailable?: boolean;
  hardUnlocked?: boolean;
  id: string; name: string; objective: string; kind: 'rout' | 'seize' | 'defend' | 'escape' | 'gather' | 'escort';
  tier: 'short' | 'standard' | 'region'; costDays: number; turnLimit: number; maxUnits: number;
  enemyLevel: number; enemyLevelCap?: number; toDay: number; risk: 'permadeath';
  optionalReward: { item: string; perExtraBox: number } | null;
  reward: { gold: number; reputation: number; items?: [string, number][] };
  requires: { quest?: string; reputation?: number; character?: string; chapter?: number } | null;
  // 伙伴任务所属的固定人物与完成后的后记。
  companion?: string | null; epilogue?: string | null;
  // 固定专属实物（首次领奖时入库）。
  exclusive: { item: string; name: string } | null;
  done: boolean; claimed: boolean; available: boolean; inProgress?: boolean;
  classic?: { game: string; mapName: string; stageCount: number; adapted?: boolean } | null;
}
export interface ServerCrossTimeRecruits {
  unlocked: boolean; shards: number; cost: number; slotsUsed: number; slotLimit: number;
  rosterFull: boolean; busy: boolean;
  recruits: {
    identityId: string; name: string; classId: string; personalSkill: string; level: number;
    growthType: 'growth'; exchanged: boolean; eligible: boolean; blockedReason: string | null;
    stats?: Stats; growth?: Stats; con?: number;
  }[];
}

export interface QuestRegion { region: number; name: string; reputation: number; tier: { index: number; at: number; name: string; next: number | null }; shop: { item: string; name: string; price: number; reputation: number; unlocked: boolean }[]; quests: QuestView[] }
export interface ServerQuests { regions: QuestRegion[]; crossTime?: (QuestView & { acceptedRegion: number | null; availableRegions: number[] }) | null }

// GET_CHALLENGES: the tower floors (docs/00 §9.6).
export interface ChallengeFloor {
  id: string; name: string; mapId: string; mapName: string; level: number; costDays: number; maxUnits: number; risk: 'permadeath';
  first: { gold: number; items: [string, number][] }; repeat: { gold: number; items: [string, number][] };
  equipment: string[]; claimedEquipment: boolean;
  cleared: boolean; available: boolean; claimedFirst: boolean; claimedRepeat: boolean;
}

// GET_PRODUCTION: facilities, recipes and the open orders (docs/00 §9.2).
export type FacilityId = 'garden' | 'apothecary' | 'smithy';
export interface ProductionOrder {
  id: string; recipeId: string; facilityId: FacilityId; recipe: string; facility: string; output: string;
  readyDay: number; state: 'growing' | 'ready'; startedDay: number; quality?: 'normal' | 'perfect';
}
export interface ServerProduction {
  day: number;
  facilities: { id: FacilityId; name: string; slots: number; used: number }[];
  recipes: { id: string; name: string; facility: FacilityId; days: number; input: { item: string; count: number }[]; output: { item: string; count: number }; kind: 'grow' | 'brew' | 'forge'; requires: { region: number; reputation: number } | null; unlocked: boolean }[];
  orders: ProductionOrder[];
  ready: string[];
}

// GET_LEGACIES: frozen when a qualifying unit dies, dies of age or retires (docs/00 §7.3).
export interface ServerLegacy {
  id: string; sourceUnitId: string; sourceName: string; cause: 'death' | 'retired' | 'age';
  sourceLevel: number; sourceTotal: number; sourceStats: Stats; sourceGrowth: Stats;
  state: 'available' | 'claimed'; mode: 'growth' | 'numeric' | null; recipientUnitId: string | null; recipientName: string | null;
}
export interface ServerLegacies { minLevel: number; legacies: ServerLegacy[] }

// GET_MEMORIAL: the fallen, those who died of age and the retired, with how they left and what they left.
export interface ServerMemorial {
  unitId: string; name: string; character: string; classId: string; className: string; level: number;
  cause: 'death' | 'retired' | 'age'; atDay: number; battleId: string | null; stats: Stats; lineageDepth: number;
  origin: UnitOrigin | null; age: number | null; joinedDay: number | null; cycle: number; sex: 'male' | 'female' | null; portrait: string | null;
  battle: { id: string; name: string; mode: string; turn: number; reason: string | null } | null;
  legacy: { id: string; state: 'available' | 'claimed'; mode: 'growth' | 'numeric' | null; recipientName: string | null } | null;
  inherited: { sourceName: string; mode: 'growth' | 'numeric' | null } | null;
  record: { battles: number; wins: number; kills: number };
}
export interface ServerEmergency { deaths: number; claimedFor: number; survivors: number; threshold: number; units: number; room: number; available: boolean; blocker: string | null }

// GET_CLASS_MARKET: every class, when it opens and what a qualification costs (docs/00 §5).
export interface ClassMarketRow {
  id: string; name: string; stage: number; route: string; openYear: number; open: boolean; price: number; owned: boolean;
  unavailableReason?: string | null; eligibilityReason?: string | null;
  weapons: Partial<Record<WeaponType, Rank>>;
  // 换成该职业后的合计成长（服务端同一公式）。
  growth: Record<StatKey, number> | null;
}

// GET_MASTERY: class mastery by class, the nodes and the five equip slots (docs/00 §4.2.1).
export interface ServerArtTraining {
  unit: string; day: number; gold: number;
  choices: { art: string; name: string; effect: string; requires: string; requiresName: string; days: number; gold: number; learned: boolean; available: boolean; blocker: string | null }[];
}
export interface ArtTrainingResult {
  unit: string; art: string; name: string; days: number; costGold: number; day: number; gold: number; learnedArts: string[];
}

export interface ServerMastery {
  unit: string; classId: string; cycle: number; slots: number;
  progress: { classId: string; name: string; route: string; routeName: string; stage: number; mastery: number; nodes: { id: string; threshold: number; skill?: string; art?: string; name: string; referenceIds: string[]; unlocked: boolean }[] }[];
  learnedSkills: string[]; learnedArts: string[]; equippedSkills: string[]; equippedArts: string[]; qualifications: string[];
}

// GET_DISPATCHES: background exploration / class training (docs/00 §9.1.1).
export interface DispatchView {
  id: string; state: 'running' | 'returned' | 'cancelled'; region: number; unitIds: string[];
  startedDay: number; durationDays: number; returnDay: number; classId: string; weaponType: WeaponType;
  result: {
    day: number; materials: { item: string; count: number }[]; weapons: { item: string; count: number }[];
    unitRewards: { unitId: string; exp: number; levelUps: { level: number; gains: Record<string, number> }[]; mastery: number; unlocked: string[]; weaponType: WeaponType; weaponRank: string | null }[];
  } | null;
}
export interface ServerDispatches { day: number; running: DispatchView[]; history: DispatchView[]; limits: { minDays: number; maxDays: number; maxUnits: number } }

// GET_TAVERN / GET_MINIGAMES: from the second year (docs/18).
export interface TavernRow { region: number; id: string; price: number; hired: boolean; name: string; sex: 'male' | 'female'; species: 'human' | 'beast' | 'dragon'; classId: string; className: string; portrait: CharacterId; level: number }
export interface ServerTavern { quarter: number; regions: TavernRow[] }
// frogs: 每只青蛙的夺冠率（%）与押中返还（十分之一倍，含本金），由服务端规则表给出。
export interface ServerFrogOdds { name: string; chance: number; returnTenths: number }
export interface ServerMinigames { quarter: number; played: number; limit: number; bets: number[]; games: ('dice' | 'frogs')[]; frogNames: string[]; frogs: ServerFrogOdds[] }
export type MinigameResult =
  | { game: 'dice'; choice: 'big' | 'small'; dice: [number, number, number]; total: number; triple: boolean; big: boolean; payout: number; bet: number; net: number; remaining: number }
  | { game: 'frogs'; pick: number; order: number[]; winner: number; payout: number; bet: number; net: number; remaining: number };

export interface ServerAgentInfo { online: boolean; model: string | null; plan: string | null; dailyReport: string | null }

// Quotes are bound to the player version; EXECUTE_ACTION re-checks it (docs/13 §3.2).
export interface ActionQuote {
  dungeonStages?: { name: string; scenarioId?: string }[];
  encounter?: FieldEncounter & { map: Pick<BattleMap, 'width' | 'height' | 'tiles' | 'spawns' | 'playerGroups' | 'objective'> };
  quoteId: string; playerVersion: number; action: string; costDays: number; costGold: number;
  fromDay: number; toDay: number; date: ServerState['date']; risk: 'permadeath' | 'simulation';
  events: { day: number; kind: 'arena' | 'month' | 'annual' }[]; blockers: string[];
}

// Agent notes stored with a battle (AGENT_PHASE_NOTE / AGENT_COMMENT_BATTLE).
export interface BattleNote { kind: 'phase' | 'comment' | string; turn: number | null; text: string; at: number }

// GET_BATTLE with full: the public engine state, events since `sinceEvent` and the Agent's notes.
export interface ServerBattleView {
  battleId: string; kind: 'field' | 'arena'; mode: string; name: string; costDays: number | null;
  questId: string | null; runId: string | null; challengeId: string | null; annualId: string | null;
  turn: number; turnLimit: number; phase: 'player' | 'enemy'; goal: string;
  result: { winner: 'player' | 'enemy'; reason: string } | null;
  events: BattleEvent[]; eventCount: number; notes?: BattleNote[]; state?: BattleState;
}

export type ReplayActivity = 'field' | 'quest' | 'dungeon' | 'challenge' | 'arena' | 'annual' | 'sparring';

// GET_REPLAYS rows: one per finished battle of mine, plus other legions' published arena matches.
export interface ServerReplay {
  id: string; name: string; kind: 'field' | 'arena'; mode: string; activity: ReplayActivity;
  winner: 'player' | 'enemy' | null; reason: string | null; turns: number;
  createdAt: number; publicAt: number; public: boolean; mine: boolean;
  day: number | null; region: number | null; questId: string | null; questName: string | null;
  runId: string | null; stageIndex: number | null; annualId: string | null; challengeId: string | null;
  opponentId: string | null; arenaDay: number | null;
  fielded: number; fallen: number;
  compatible: boolean; compatibilityNote: string | null;
}
export interface ServerReplayList { replays: ServerReplay[]; total: number; activities: { id: ReplayActivity; name: string }[] }
export interface ReplayFilter { activity?: ReplayActivity | null; result?: 'won' | 'lost' | null; mine?: boolean; fromDay?: number; toDay?: number; limit?: number }

// A stored BattleRecord: `initial` plus the action list rebuilds every step (see watch/recording.ts).
export interface ServerReplayData {
  id: string; name: string; kind: 'field' | 'arena'; mode: string; goalText: string;
  initial: BattleState; state: BattleState; events: BattleEvent[]; actions: Action[];
  endDay?: number; runId?: string; stageIndex?: number; questId?: string; annualId?: string; challengeId?: string;
}
export interface ServerReplayDetail {
  replayId: string; battle: ServerReplayData; publicAt: number; public: boolean; mine: boolean;
  summary: ServerReplay; notes: BattleNote[];
  compatible: boolean; reason?: string | null; rulesetVersion: string; currentRulesetVersion: string;
}

export interface SessionSnapshot {
  ready: boolean;
  loading: boolean;
  error: string | null;
  state: ServerState | null;
  today: ServerToday | null;
  arena: ServerArena | null;
  results: ArenaResults | null;
  roster: ServerUnit[];
  // The active arena attack's raw battle state, keyed by opponent id, so a reload can resume.
  battles: Record<string, BattleState>;
  // 永久军团 systems the camp, the navigation and their own pages read.
  run: ServerRun | null;
  annual: ServerAnnual | null;
  story: ServerStory | null;
  quests: ServerQuests | null;
  production: ServerProduction | null;
  legacies: ServerLegacies | null;
}

const EMPTY: SessionSnapshot = {
  ready: false, loading: false, error: null, state: null, today: null, arena: null, results: null,
  roster: [], battles: {}, run: null, annual: null, story: null, quests: null, production: null, legacies: null,
};

type ViewKey = 'arena' | 'results' | 'story' | 'quests' | 'production' | 'legacies';
const VIEWS: { key: ViewKey; op: number; feature: keyof FeatureAccess }[] = [
  { key: 'arena', op: OP.GET_ARENA, feature: 'arena' },
  { key: 'results', op: OP.GET_ARENA_RESULTS, feature: 'arena' },
  { key: 'story', op: OP.GET_STORY, feature: 'story' },
  { key: 'quests', op: OP.GET_QUESTS, feature: 'quests' },
  { key: 'production', op: OP.GET_PRODUCTION, feature: 'workshop' },
  { key: 'legacies', op: OP.GET_LEGACIES, feature: 'legacy' },
];
const PAGE_VIEWS: Partial<Record<Route['page'], ViewKey[]>> = {
  camp: VIEWS.map(v => v.key), rules: ['story', 'production'],
  arena: ['arena', 'results'], ban: ['arena', 'results'], deploy: ['arena', 'results'], 'arena-battle': ['arena', 'results'],
  story: ['story'], dungeon: ['quests'], quests: ['quests'], workshop: ['production'], legacy: ['legacies'], roster: ['legacies'],
};
// These commands change only resources/units/control, not calendar events or module progress.
const STATE_ONLY = new Set<number>([
  OP.BUY, OP.SELL, OP.TRANSFER_ITEM, OP.USE_ITEM, OP.ASSIGN_BEXP, OP.REPAIR_ITEM, OP.REFINE_WEAPON,
  OP.EQUIP_SKILLS, OP.CLAIM_CONTROL, OP.RELEASE_CONTROL,
]);

class SessionStore {
  private snap: SessionSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private revision = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = (): SessionSnapshot => this.snap;

  private set(patch: Partial<SessionSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  get loggedIn(): boolean {
    return this.snap.ready;
  }

  async login(name: string, password?: string, legion?: string): Promise<void> {
    this.set({ loading: true, error: null });
    try {
      await apiLogin(name, password, legion);
      await this.refresh();
      this.set({ ready: true });
    } catch (error) {
      this.set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // Core activity gates stay current; page views load on demand, then stay current for nav badges.
  async refresh(afterOp?: number): Promise<void> {
    const credential = token();
    if (!credential) return;
    const revision = ++this.revision;
    const previous = this.snap;
    const current = () => revision === this.revision && credential === token();
    this.set({ loading: true, error: null });
    try {
      const state = await call<ServerState>(OP.GET_STATE);
      if (!current()) return;
      const patch: Partial<SessionSnapshot> = { state, roster: state.units };
      const errors: string[] = [];
      const stateOnly = afterOp !== undefined && STATE_ONLY.has(afterOp) && !previous.error
        && state.day === previous.state?.day && state.version === previous.state.version + 1;
      if (!stateOnly) {
        const page = typeof window === 'undefined' ? 'camp' : parseRoute(window.location.hash).page;
        const wanted = PAGE_VIEWS[page] ?? [];
        const loadView = async <K extends ViewKey>(key: K, op: number, enabled: boolean) => {
          if (!enabled) { patch[key] = null; return; }
          if (wanted.includes(key) || previous[key] !== null) {
            try { patch[key] = await call<SessionSnapshot[K]>(op); }
            catch (error) {
              if (error instanceof ApiError && error.code === 'UNAUTHORIZED') throw error;
              errors.push(error instanceof Error ? error.message : String(error));
            }
          }
        };
        const [today, run, annual] = await Promise.all([
          call<ServerToday>(OP.GET_TODAY),
          state.features.dungeon ? call<{ run: ServerRun | null }>(OP.GET_RUN).then(r => r.run) : null,
          state.features.annual ? call<ServerAnnual>(OP.GET_ANNUAL) : null,
          ...VIEWS.map(v => loadView(v.key, v.op, state.features[v.feature])),
        ]);
        Object.assign(patch, { today, run, annual });
      }
      if (current()) {
        this.set({ ...patch, loading: false, ready: true, error: null });
        if (errors.length) throw new Error(`部分信息未更新：${errors.join('；')}`);
      }
    } catch (error) {
      if (!current()) return;
      if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
        setToken(null);
        this.set({ ...EMPTY, error: '登录已过期，请重新登录' });
      } else {
        this.set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
      throw error;
    }
  }

  async loadPage(page: Route['page']): Promise<void> {
    const wanted = PAGE_VIEWS[page] ?? [];
    if (this.snap.state && VIEWS.some(v => wanted.includes(v.key) && this.snap.state!.features[v.feature] && this.snap[v.key] === null)) {
      await this.refresh();
    }
  }

  // A committed command must remain successful even if its following read cannot reach the server.
  private async afterWrite(op: number, credential: string | null): Promise<void> {
    if (credential !== token()) return;
    try { await this.refresh(op); }
    catch (error) {
      if (credential === token()) this.set({ error: `操作已提交，但状态尚未同步：${error instanceof Error ? error.message : String(error)}。请重新同步，不要重复提交。` });
    }
  }

  logout(): void {
    this.revision++;
    setToken(null);
    this.set({ ...EMPTY });
  }

  async run<T = unknown>(op: number, data: Record<string, unknown> = {}, refresh = true): Promise<T> {
    const credential = token();
    const commandId = typeof data.commandId === 'string' ? data.commandId : newCommandId();
    const result = await call<T>(op, data, commandId);
    if (refresh) await this.afterWrite(op, credential);
    return result;
  }

  // ---- arena attacks -----------------------------------------------------

  async opponent(opponentId: string): Promise<ServerOpponentDetail> {
    return call<ServerOpponentDetail>(OP.GET_OPPONENT, { opponentId });
  }

  async arenaBan(opponentId: string, bans: string[]): Promise<ArenaReveal> {
    const result = await this.run<{ opponentId: string; reveal: ArenaReveal }>(OP.ARENA_BAN, { opponentId, bans });
    return result.reveal;
  }

  async arenaAttack(opponentId: string, picks: { character: CharacterId; unitId?: string; pos: [number, number] }[], commander: string): Promise<string> {
    const credential = token();
    const result = await call<{ battleId: string; state: BattleState }>(OP.ARENA_ATTACK, { opponentId, picks, commander }, newCommandId());
    if (credential === token()) this.set({ battles: { ...this.snap.battles, [opponentId]: result.state } });
    await this.afterWrite(OP.ARENA_ATTACK, credential);
    return result.battleId;
  }

  battleFor(opponentId: string): BattleState | null {
    return this.snap.battles[opponentId] ?? null;
  }

  // The bridge the battle controller uses when a session is server-authoritative.
  async applyBattle(battleId: string, action: Action): Promise<{ state: BattleState; events: BattleEvent[] }> {
    const data: Record<string, unknown> = { battleId };
    let op: number;
    if (action.type === 'endPhase') op = OP.END_PHASE;
    else if (action.type === 'retreat') op = OP.RETREAT;
    else if (action.type === 'surrender') op = OP.SURRENDER;
    else {
      op = OP.UNIT_ACT;
      data.unitId = action.unit;
      data.moveTo = action.to;
      data.action = action.act;
      if (action.act === 'attack' || action.act === 'heal') { data.targetId = action.target; data.weapon = action.weapon; }
      if (action.act === 'interact' || action.act === 'dance') data.targetId = action.target;
      if (action.act === 'item') data.item = action.item;
      if (action.act === 'art') { data.targetId = action.target; data.weapon = action.weapon; data.art = action.art; if (action.ally) data.allyId = action.ally; if (action.secondary) data.secondaryId = action.secondary; if (action.postTo) data.postTo = action.postTo; if (action.support) data.support = action.support; }
      if (action.act === 'cast') { data.targetId = action.target; data.spell = action.spell; if (action.dest) data.dest = action.dest; }
      if (action.act === 'staff') { data.targetId = action.target; data.weapon = action.weapon; if (action.dest) data.dest = action.dest; }
    }
    const credential = token();
    const result = await call<{ state: BattleState; events?: BattleEvent[] }>(op, data, newCommandId());
    if (result.state?.result) await this.afterWrite(op, credential);
    return { state: result.state, events: result.events ?? [] };
  }

  async sortie(region: number, unitIds: string[], aiDifficulty: AiDifficulty = 'normal'): Promise<{ battleId: string; state: BattleState }> {
    return this.run<{ battleId: string; state: BattleState }>(OP.SORTIE, { region, unitIds, aiDifficulty });
  }

  // 完成自捏开局：自建主角（固定平民／成长型，基础属性 + 10 点加成，每项最多加 5）+ 两名同伴，只能提交一次。
  async completeSetup(protagonist: {
    name: string; sex: 'male' | 'female'; portrait: string; allocation: Record<string, number>;
  }, companions: string[]): Promise<{ companions: string[] }> {
    return this.run<{ companions: string[] }>(OP.COMPLETE_SETUP, { protagonist, companions });
  }

  // 选择世界路线（CHOOSE_ROUTE）：开通 region 地区，不消耗行动日；随后统一 refresh。
  async chooseRoute(region: number): Promise<{ region: number }> {
    return this.run<{ region: number }>(OP.CHOOSE_ROUTE, { region });
  }

  // ---- reports and live battles -----------------------------------------

  async replays(filter: ReplayFilter = {}): Promise<ServerReplayList> {
    const data: Record<string, unknown> = {};
    if (filter.activity) data.activity = filter.activity;
    if (filter.result) data.result = filter.result;
    if (filter.mine) data.mine = true;
    if (filter.fromDay !== undefined) data.fromDay = filter.fromDay;
    if (filter.toDay !== undefined) data.toDay = filter.toDay;
    if (filter.limit !== undefined) data.limit = filter.limit;
    return call<ServerReplayList>(OP.GET_REPLAYS, data);
  }

  async replay(replayId: string): Promise<ServerReplayDetail> {
    return call<ServerReplayDetail>(OP.GET_REPLAY, { replayId });
  }

  // One battle by id (finished ones too), with the public state, events since `sinceEvent` and notes.
  async battle(battleId: string | null, sinceEvent = 0): Promise<ServerBattleView> {
    return call<ServerBattleView>(OP.GET_BATTLE, { ...(battleId ? { battleId } : {}), full: true, sinceEvent });
  }

  async shop(): Promise<ShopRow[]> {
    return (await this.shopView()).items;
  }

  // 王都商店：items 是现在能买的，locked 是还没上架的高级物品（按年份上架）。
  async shopView(): Promise<{ items: ShopRow[]; locked: { item: string; name: string; openDay: number }[] }> {
    const result = await call<{ items: ShopRow[]; locked?: { item: string; name: string; openDay: number }[] }>(OP.GET_SHOP);
    return { items: result.items, locked: result.locked ?? [] };
  }

  async snapshots(): Promise<ServerSnapshot[]> {
    const result = await call<{ snapshots: ServerSnapshot[] }>(OP.GET_SNAPSHOTS);
    return result.snapshots;
  }

  // ---- 永久军团 ----------------------------------------------------------

  async unit(unitId: string): Promise<ServerUnitDetail> {
    return call<ServerUnitDetail>(OP.GET_UNIT, { unitId });
  }

  async memorial(): Promise<{ memorials: ServerMemorial[]; emergency: ServerEmergency }> {
    return call(OP.GET_MEMORIAL);
  }

  async classMarket(unitId: string): Promise<{ year: number; monthLimit: number; monthUsed: number; classes: ClassMarketRow[] }> {
    return call(OP.GET_CLASS_MARKET, { unitId });
  }

  async artTraining(unitId: string): Promise<ServerArtTraining> {
    return call<ServerArtTraining>(OP.GET_ART_TRAINING, { unitId });
  }

  async mastery(unitId: string): Promise<ServerMastery> {
    return call<ServerMastery>(OP.GET_MASTERY, { unitId });
  }

  async dispatches(): Promise<ServerDispatches> {
    return call<ServerDispatches>(OP.GET_DISPATCHES);
  }

  async challenges(): Promise<ChallengeFloor[]> {
    const result = await call<{ floors: ChallengeFloor[] }>(OP.GET_CHALLENGES);
    return result.floors;
  }

  async crossTimeRecruits(): Promise<ServerCrossTimeRecruits> {
    return call<ServerCrossTimeRecruits>(OP.GET_CROSS_TIME_RECRUITS);
  }

  async tavern(region?: number): Promise<ServerTavern> {
    return call<ServerTavern>(OP.GET_TAVERN, region === undefined ? {} : { region });
  }

  async minigames(): Promise<ServerMinigames> {
    return call<ServerMinigames>(OP.GET_MINIGAMES);
  }

  async ratings(): Promise<ServerRatings> {
    return call<ServerRatings>(OP.GET_RATINGS);
  }

  async agentInfo(): Promise<ServerAgentInfo> {
    return call<ServerAgentInfo>(OP.GET_AGENT_INFO);
  }

  // The raw state of the unfinished battle, if any, so a page can resume it exactly. `mode` tells a
  // 大竞技场 match (festival) from an arena attack, which share the engine's 'arena' kind.
  async activeBattle(): Promise<{ id: string; state: BattleState; mode: string; name: string; costDays: number | null; questId: string | null; challengeId: string | null; runId: string | null } | null> {
    const active = await call<ServerBattleView>(OP.GET_BATTLE, { full: true }).catch(() => null);
    return active?.state && !active.state.result
      ? { id: active.battleId, state: active.state, mode: active.mode ?? active.state.kind, name: active.name, costDays: active.costDays ?? null, questId: active.questId ?? null, challengeId: active.challengeId ?? null, runId: active.runId ?? null }
      : null;
  }

  // Calendar actions with real death or several days at stake are quoted first (PREVIEW_ACTION) and
  // then executed by quote id; a stale quote fails instead of silently costing more.
  async quote(action: string, data: Record<string, unknown> = {}): Promise<ActionQuote> {
    return call<ActionQuote>(OP.PREVIEW_ACTION, { action, ...data });
  }

  async execute<T = unknown>(quoteId: string): Promise<T> {
    return this.run<T>(OP.EXECUTE_ACTION, { quoteId });
  }
}

export const session = new SessionStore();

export function useSession(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.get);
}
