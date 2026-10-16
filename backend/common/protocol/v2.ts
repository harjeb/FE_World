// Backend design contract v2. No transport, persistence, validation or gameplay implementation.
// Keep this independent of the prototype's engine-v1 types and browser code.
export type Id = string;
export type Cursor = string;
export type Point = [number, number];
export type Stats = Record<'hp' | 'str' | 'mag' | 'skl' | 'spd' | 'lck' | 'def' | 'res' | 'cha', number>;
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
export type WeaponType = 'sword' | 'lance' | 'axe' | 'bow' | 'tome' | 'staff' | 'gauntlet' | 'dagger' | 'beast' | 'dragon';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Empty = Record<string, never>;
export interface Page<T> { items: T[]; nextCursor: Cursor | null }
export interface Cost { days: number; gold: number; materials: { templateId: Id; quantity: number }[] }
export interface Blocker { code: string; message: string; entityId: Id | null }
export interface Feature { enabled: boolean; reason: string | null }
export interface Event {
  cursor: Cursor; type: string; entityId: Id; playerVersion: number;
  battleVersion: number | null; payload: Json;
}
export interface Calendar {
  day: number; yearLength: number; quarterLength: number;
  year: number; quarter: number; dayOfYear: number;
  upcoming: { id: Id; atDay: number; kind: string; requiresChoice: boolean }[];
}
export interface Unit {
  id: Id; templateId: Id | null; name: string; speciesId: Id; isProtagonist: boolean;
  status: 'active' | 'dead' | 'retired' | 'dismissed';
  classId: Id; level: number; exp: number; cycle: 0 | 1;
  ageDays: number; lifespanEndDay: number | null;
  stats: Stats; caps: Stats; currentHp: number;
  growth: { personal: Stats; class: Stats; age: Stats; modifiers: Stats; total: Stats };
  ranks: Partial<Record<WeaponType, { rank: Rank; exp: number }>>;
  personalSkillId: Id; equippedSkillIds: Id[]; learnedSkillIds: Id[];
  constitution: number; movement: number;
  drugUses: { cycle: 0 | 1; byStat: Stats; total: number; perStatLimit: number; totalLimit: number };
  legacyId: Id | null; eligibleForLegacy: boolean; lockedByRunId: Id | null;
}
export interface Item {
  id: Id; templateId: Id; ownerUnitId: Id | null;
  location: 'warehouse' | 'unit' | 'run' | 'escrow' | 'memorial';
  durability: { current: number; maximum: number } | null;
  usesRemaining: number | null; quality: 'normal' | 'perfect';
  refinementResolved: boolean; lockedByRunId: Id | null;
}
export interface Inventory {
  items: Item[]; materials: { templateId: Id; quantity: number }[];
  capacity: { used: number; maximum: number };
}
export interface Region {
  id: Id; name: string; location: Point; neighborIds: Id[];
  accessible: boolean; blockers: Blocker[]; offset: number;
  firstClearLevel: number | null; cleared: boolean;
  nextEncounter: { baseLevel: number; normalRange: [number, number]; bossLevel: number };
  buildingIds: Id[]; recruitmentPoolId: Id; dungeonId: Id;
}
export interface World {
  clearedRegions: number; regions: Region[]; activeRunId: Id | null;
}
export interface Run {
  id: Id; kind: 'field' | 'dungeon' | 'annual_arena' | 'regular_arena' | 'practice';
  state: 'deployment' | 'battle' | 'between_maps' | 'between_matches' | 'resolving' | 'completed' | 'withdrawn' | 'failed';
  regionId: Id | null; registrationDay: number; rulesetVersion: string; catalogVersion: string;
  lockedUnitIds: Id[]; survivingUnitIds: Id[]; lockedItemIds: Id[];
  encounterLevel: number | null; stageIndex: number; stageCount: number;
  battleId: Id | null; canContinue: boolean; blockers: Blocker[];
  recovery: 'none' | 'survivors_hp_and_short_status';
  pendingLoot: { templateId: Id; quantity: number }[];
  risk: 'permadeath' | 'simulation';
}
export interface BattleUnit {
  id: Id; persistentUnitId: Id | null; side: 'player' | 'enemy';
  name: string; classId: Id; level: number; stats: Stats; hp: number;
  position: Point; disposition: 'active' | 'dead' | 'withdrawn' | 'defeated';
  acted: boolean; equippedItemId: Id | null; inventory: Item[];
  statuses: { id: Id; remainingTurns: number | null; expiresAt: string | null }[];
}
export interface Battle {
  id: Id; runId: Id; version: number; engineVersion: number;
  risk: 'permadeath' | 'simulation'; turn: number; turnLimit: number;
  phase: 'player' | 'enemy'; processing: boolean;
  map: { width: number; height: number; tiles: string[][]; deploymentCells: Point[] };
  goal: { kind: 'rout' | 'boss' | 'seize' | 'survive' | 'escape'; targetId: Id | null; turns: number | null };
  units: BattleUnit[]; result: { winner: 'player' | 'enemy'; reason: string } | null;
  lastEventCursor: Cursor | null;
}
export type UnitAction =
  | { unitId: Id; moveTo: Point; kind: 'wait' }
  | { unitId: Id; moveTo: Point; kind: 'attack' | 'heal'; targetId: Id; itemId: Id }
  | { unitId: Id; moveTo: Point; kind: 'use_item'; itemId: Id; targetId: Id | null }
  | { unitId: Id; moveTo: Point; kind: 'exchange'; targetId: Id; giveItemIds: Id[]; receiveItemIds: Id[] }
  | { unitId: Id; moveTo: Point; kind: 'seize' | 'escape' };
export interface Forecast {
  battleVersion: number; attackerId: Id; defenderId: Id;
  effect: 'attack' | 'heal'; healing: number | null;
  sides: { unitId: Id; damage: number; displayedHit: number; trueHit: number; crit: number; strikes: number; lethalProbability: number }[];
  triangle: 'advantage' | 'neutral' | 'disadvantage';
  expectedDurabilityCost: { itemId: Id; maximumUses: number }[];
  warnings: string[];
}
export interface Deployment { unitId: Id; position: Point; equippedItemId: Id | null }
export interface Legacy {
  id: Id; sourceUnitId: Id; sourceLevel: number; sourceTotal: number;
  sourceGrowth: Stats; state: 'available' | 'claimed';
  claimedMode: 'growth' | 'stats' | null; recipientUnitId: Id | null;
}
export interface LegacyPreview {
  legacyId: Id; recipientUnitId: Id; mode: 'growth' | 'stats';
  sourceLevel: number; sourceTotal: number; targetTotal: number; truncated: number;
  caps: Stats; resultingPersonalGrowth: Stats;
  floorByLevel: { level: number; total: number }[]; cost: Cost; blockers: Blocker[];
}
export interface ProductionOrder {
  id: Id; recipeId: Id; state: 'growing' | 'ready' | 'refining' | 'claimed' | 'cancelled';
  startedDay: number; readyDay: number; refinementAvailable: boolean; resultItemId: Id | null;
}
export interface Recruitment {
  regionId: Id; tavernStockVersion: number;
  candidates: { id: Id; name: string; speciesId: Id; level: number; price: number; expiresDay: number }[];
  travel: { costDays: number; failureCount: number; guaranteedNext: boolean };
}
export interface Shop {
  id: Id; stockVersion: number; refreshDay: number;
  offers: { id: Id; templateId: Id; price: number; remaining: number; blockers: Blocker[] }[];
}
export interface Quest {
  id: Id; chapter: number | null; state: 'locked' | 'available' | 'completed' | 'claimed';
  summary: string; blockers: Blocker[]; reward: { gold: number; bexp: number; unlockIds: Id[] };
}
export interface ArenaEntry {
  id: Id; kind: 'annual' | 'regular'; annualIndex: number | null;
  registrationDay: number; runId: Id;
  state: 'qualifying' | 'bracket' | 'eliminated' | 'champion' | 'withdrawn' | 'completed';
  qualifiersPlayed: number; qualifiersWon: number;
  bracketSize: 64 | 32 | 16 | 8 | 4 | 2 | 1 | null;
  opponent: { snapshotId: Id; source: 'player' | 'official'; capturedDay: number; visibleSlotIds: Id[] } | null;
}
export interface PublicOpponent {
  snapshotId: Id; source: 'player' | 'official'; capturedDay: number;
  displayName: string; mapId: Id; deployCount: number; banCount: number;
  slots: {
    slotId: Id; name: string; speciesId: Id; classId: Id; level: number;
    stats: Stats; items: Item[]; ranks: Partial<Record<WeaponType, Rank>>; skillIds: Id[];
  }[];
  revealedDeployment: Deployment[] | null;
}
export interface DefensePlan {
  id: Id; mapId: Id; unitIds: Id[]; deployment: Deployment[];
  behaviors: { unitId: Id; behavior: 'aggressive' | 'opportunist' | 'hold' | 'guard' | 'healer' }[];
}
export interface PlayerState {
  playerId: Id; playerVersion: number; protocolVersion: 2; catalogVersion: string;
  setupRequired: boolean;
  calendar: Calendar; gold: number; bexp: number; clearedRegions: number;
  activeRun: Run | null; roster: { active: number; maximum: number };
  features: Record<string, Feature>; lastEventCursor: Cursor | null;
}
export type WorldAction =
  | { kind: 'start_field' | 'start_dungeon'; regionId: Id; stageId: Id; unitIds: Id[]; itemIds: Id[] }
  | { kind: 'continue_run'; runId: Id }
  | { kind: 'start_annual_arena' | 'start_regular_arena'; unitIds: Id[]; itemIds: Id[] }
  | { kind: 'start_practice'; snapshotId: Id; unitIds: Id[]; itemIds: Id[] }
  | { kind: 'explore' | 'travel_recruit'; regionId: Id }
  | { kind: 'train'; unitIds: Id[]; weaponType: WeaponType }
  | { kind: 'wait'; days: number }
  | { kind: 'start_production'; recipeId: Id; quantity: number; facilityId: Id };
export interface ActionQuote {
  id: Id; playerVersion: number; rulesetVersion: string; action: WorldAction;
  cost: Cost; startDay: number; endDay: number; expiresAt: string;
  encounteredEvents: { id: Id; atDay: number; kind: string }[];
  risk: 'permadeath' | 'simulation' | 'none'; blockers: Blocker[];
  enemyLevels: { minimum: number; maximum: number } | null;
}
export interface MutationResult<T> { value: T; state: PlayerState; events: Event[] }
export interface Capabilities { protocolVersion: 2; operations: Operation[]; features: Record<string, Feature> }
export interface Replay {
  id: Id; engineVersion: number; catalogVersion: string; available: boolean;
  unavailableReason: string | null; initialPublicState: Battle | null;
  frames: { index: number; events: Event[]; publicState: Battle | null }[];
  nextCursor: Cursor | null;
}
export interface Refinement {
  id: Id; orderId: Id; state: 'armed' | 'running' | 'resolved';
  rulesVersion: string; durationMs: number; rewardZone: [number, number];
  startedAt: string | null; expiresAt: string; resolvedQuality: 'normal' | 'perfect' | null;
}
export interface OperationMap {
  GET_CAPABILITIES: { input: Empty; output: Capabilities };
  GET_STATE: { input: Empty; output: PlayerState };
  GET_CATALOG: { input: { kind: string; version: string | null }; output: { version: string; records: Json[] } };
  GET_WORLD: { input: Empty; output: World };
  GET_ROSTER: { input: { status: Unit['status']; cursor: Cursor | null }; output: Page<Unit> };
  GET_UNIT: { input: { unitId: Id }; output: Unit };
  GET_INVENTORY: { input: Empty; output: Inventory };
  GET_SHOP: { input: { shopId: Id }; output: Shop };
  GET_RECRUITMENT: { input: { regionId: Id }; output: Recruitment };
  GET_PRODUCTION: { input: Empty; output: ProductionOrder[] };
  GET_LEGACIES: { input: { cursor: Cursor | null }; output: Page<Legacy> };
  GET_QUESTS: { input: { cursor: Cursor | null }; output: Page<Quest> };
  GET_ARENA: { input: Empty; output: { annualAvailable: boolean; entry: ArenaEntry | null; history: ArenaEntry[] } };
  GET_ARENA_HISTORY: { input: { cursor: Cursor | null }; output: Page<ArenaEntry> };
  GET_OPPONENT: { input: { entryId: Id }; output: PublicOpponent };
  GET_DEFENSE: { input: Empty; output: DefensePlan | null };
  GET_SPARRING: { input: { cursor: Cursor | null }; output: Page<PublicOpponent> };
  GET_DISCOVERIES: { input: { cursor: Cursor | null }; output: Page<{ id: Id; discoveredDay: number; title: string; text: string }> };
  GET_LEADERBOARD: { input: { mode: 'annual' | 'regular'; bracketId: Id; cursor: Cursor | null }; output: Page<{ playerId: Id; displayName: string; rating: number; rank: number }> };
  GET_ACTIVE_RUN: { input: Empty; output: Run | null };
  GET_RUN: { input: { runId: Id }; output: Run };
  GET_GROWTH_HISTORY: { input: { unitId: Id; cursor: Cursor | null }; output: Page<{ cycle: 0 | 1; level: number; randomGains: Stats; inheritedGains: Stats; rates: Stats }> };
  GET_BATTLE: { input: { battleId: Id }; output: Battle };
  GET_REACHABLE: { input: { battleId: Id; unitId: Id }; output: { battleVersion: number; cells: { point: Point; moveCost: number; actions: UnitAction[] }[] } };
  PREVIEW_COMBAT: { input: { battleId: Id; action: Extract<UnitAction, { kind: 'attack' | 'heal' }> }; output: Forecast };
  GET_THREAT_MAP: { input: { battleId: Id }; output: { battleVersion: number; cells: { point: Point; attackerIds: Id[]; maximumDamage: number }[] } };
  GET_REPLAY: { input: { replayId: Id; cursor: Cursor | null }; output: Replay };
  GET_EVENTS: { input: { after: Cursor | null; limit: number }; output: Page<Event> & { resyncRequired: boolean } };
  GET_COMMAND_STATUS: { input: { commandId: Id }; output: { state: 'unknown' | 'committed' | 'rejected'; response: Json } };
  PREVIEW_ACTION: { input: { action: WorldAction }; output: ActionQuote };
  PREVIEW_LEGACY: { input: { legacyId: Id; recipientUnitId: Id; mode: 'growth' | 'stats' }; output: LegacyPreview };
  SETUP_LEGION: { input: { protagonistName: string; appearancePresetId: Id; statAllocation: Stats; companionTemplateIds: [Id, Id] }; output: MutationResult<{ protagonistId: Id; companionIds: [Id, Id] }> };
  EXECUTE_ACTION: { input: { quoteId: Id }; output: MutationResult<{ runId: Id | null; entityId: Id | null }> };
  DEPLOY: { input: { runId: Id; deployment: Deployment[] }; output: MutationResult<Battle> };
  UNIT_ACT: { input: { battleId: Id; action: UnitAction }; output: MutationResult<Battle> };
  END_PHASE: { input: { battleId: Id }; output: MutationResult<{ battleId: Id; processing: boolean }> };
  WITHDRAW_RUN: { input: { runId: Id }; output: MutationResult<Run> };
  BUY: { input: { shopId: Id; offerId: Id; stockVersion: number; quantity: number }; output: MutationResult<Inventory> };
  SELL: { input: { itemIds: Id[] }; output: MutationResult<Inventory> };
  RECRUIT_TAVERN: { input: { candidateId: Id; stockVersion: number }; output: MutationResult<Unit> };
  RESOLVE_RECRUIT: { input: { encounterId: Id; accept: boolean }; output: MutationResult<{ unitId: Id | null }> };
  TRANSFER_ITEM: { input: { itemId: Id; toUnitId: Id | null }; output: MutationResult<Inventory> };
  EQUIP_SKILLS: { input: { unitId: Id; skillIds: Id[] }; output: MutationResult<Unit> };
  USE_ITEM: { input: { unitId: Id; itemId: Id }; output: MutationResult<Unit> };
  PROMOTE: { input: { unitId: Id; classId: Id }; output: MutationResult<Unit> };
  ASSIGN_BEXP: { input: { unitId: Id; amount: number }; output: MutationResult<Unit> };
  RETIRE_UNIT: { input: { unitId: Id }; output: MutationResult<{ unit: Unit; legacyId: Id | null }> };
  DISMISS_UNIT: { input: { unitId: Id }; output: MutationResult<Unit> };
  CLAIM_LEGACY: { input: { legacyId: Id; recipientUnitId: Id; mode: 'growth' | 'stats'; inheritanceItemId: Id; weights: Stats | null }; output: MutationResult<Unit> };
  REINCARNATE: { input: { unitId: Id; growthAllocation: Stats }; output: MutationResult<Unit> };
  REPAIR_ITEM: { input: { itemId: Id }; output: MutationResult<Item> };
  CLAIM_PRODUCTION: { input: { orderId: Id }; output: MutationResult<{ itemIds: Id[] }> };
  ARM_REFINEMENT: { input: { orderId: Id }; output: MutationResult<Refinement> };
  START_REFINEMENT: { input: { challengeId: Id }; output: MutationResult<Refinement> };
  STOP_REFINEMENT: { input: { challengeId: Id }; output: MutationResult<Refinement> };
  SKIP_REFINEMENT: { input: { challengeId: Id }; output: MutationResult<Refinement> };
  COMPLETE_STORY_EVENT: { input: { questId: Id }; output: MutationResult<Quest> };
  CLAIM_REWARD: { input: { sourceKind: 'quest' | 'run' | 'arena'; sourceId: Id }; output: MutationResult<{ receiptId: Id }> };
  ARENA_BAN: { input: { entryId: Id; bannedSlotIds: Id[] }; output: MutationResult<{ entry: ArenaEntry; revealedUnitIds: Id[] }> };
  SET_DEFENSE: { input: Omit<DefensePlan, 'id'>; output: MutationResult<{ defenseId: Id }> };
}
export type Operation = keyof OperationMap;
export type Mutation = 'SETUP_LEGION' | 'EXECUTE_ACTION' | 'DEPLOY' | 'UNIT_ACT' | 'END_PHASE' | 'WITHDRAW_RUN'
  | 'BUY' | 'SELL' | 'RECRUIT_TAVERN' | 'RESOLVE_RECRUIT' | 'TRANSFER_ITEM' | 'EQUIP_SKILLS'
  | 'USE_ITEM' | 'PROMOTE' | 'ASSIGN_BEXP' | 'RETIRE_UNIT' | 'DISMISS_UNIT' | 'CLAIM_LEGACY'
  | 'REINCARNATE' | 'REPAIR_ITEM' | 'CLAIM_PRODUCTION' | 'ARM_REFINEMENT' | 'START_REFINEMENT'
  | 'STOP_REFINEMENT' | 'SKIP_REFINEMENT' | 'COMPLETE_STORY_EVENT' | 'CLAIM_REWARD'
  | 'ARENA_BAN' | 'SET_DEFENSE';
export type Request<K extends Operation> = {
  protocolVersion: 2; op: K; seq: number; data: OperationMap[K]['input'];
} & (K extends Mutation
  ? { commandId: Id; expectedPlayerVersion: number; expectedBattleVersion?: number }
  : { commandId?: never; expectedPlayerVersion?: never; expectedBattleVersion?: never });
export type AnyRequest = { [K in Operation]: Request<K> }[Operation];
export interface Failure {
  code: string; message: string; retry: 'refresh' | 'same_command' | 'wait' | 'none';
  details: Json;
}
export type Response<K extends Operation> =
  | { protocolVersion: 2; op: K; seq: number; ok: true; playerVersion: number; data: OperationMap[K]['output'] }
  | { protocolVersion: 2; op: K; seq: number; ok: false; playerVersion: number | null; error: Failure };
export interface Push {
  protocolVersion: 2; type: 'EVENTS_AVAILABLE'; latestCursor: Cursor; playerVersion: number;
}
