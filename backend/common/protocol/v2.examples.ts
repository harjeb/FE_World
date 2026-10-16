// Compile-checked fixture data for UI development. These are not live backend responses.
import type {
  ActionQuote, Battle, LegacyPreview, PlayerState, Request, Response, Run, Stats, Unit, World,
} from './v2.ts';

export const sampleStats = {
  hp: 24, str: 8, mag: 4, skl: 8, spd: 8, lck: 8, def: 8, res: 6, cha: 6,
} satisfies Stats;
export const sampleCaps = {
  hp: 150, str: 99, mag: 99, skl: 99, spd: 99, lck: 99, def: 99, res: 99, cha: 99,
} satisfies Stats;
const zeroStats: Stats = { hp: 0, str: 0, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0, cha: 0 };
const personalGrowth: Stats = { hp: 55, str: 35, mag: 10, skl: 30, spd: 30, lck: 25, def: 25, res: 15, cha: 20 };
const ageGrowth: Stats = { ...zeroStats, hp: 5, str: 5, spd: 5 };
const totalGrowth: Stats = { ...personalGrowth, hp: 60, str: 40, spd: 35 };

export const sampleUnit = {
  id: 'unit-demo-01', templateId: null, name: '艾琳', speciesId: 'human', isProtagonist: false,
  status: 'active', classId: 'swordsman', level: 1, exp: 0, cycle: 0,
  ageDays: 2160, lifespanEndDay: 10080,
  stats: sampleStats, caps: sampleCaps, currentHp: 17,
  growth: { personal: personalGrowth, class: zeroStats, age: ageGrowth, modifiers: zeroStats, total: totalGrowth },
  ranks: { sword: { rank: 'E', exp: 0 } },
  personalSkillId: 'steady_hand', equippedSkillIds: [], learnedSkillIds: [],
  constitution: 7, movement: 5,
  drugUses: { cycle: 0, byStat: zeroStats, total: 0, perStatLimit: 5, totalLimit: 20 },
  legacyId: null, eligibleForLegacy: false, lockedByRunId: null,
} satisfies Unit;

export const sampleState = {
  playerId: 'player-demo-01', playerVersion: 18, protocolVersion: 2, catalogVersion: 'draft-2026-10-16',
  setupRequired: false,
  calendar: {
    day: 120, yearLength: 120, quarterLength: 30, year: 2, quarter: 1, dayOfYear: 1,
    upcoming: [{ id: 'annual-02-open', atDay: 240, kind: 'annual_arena_open', requiresChoice: true }],
  },
  gold: 1200, bexp: 350, clearedRegions: 1, activeRun: null,
  roster: { active: 3, maximum: 18 },
  features: {
    mock: { enabled: true, reason: 'Fixture data only; no server is running.' },
    refinement: { enabled: false, reason: 'Timing and latency rules require a prototype.' },
  },
  lastEventCursor: '317',
} satisfies PlayerState;

export const sampleWorld = {
  clearedRegions: 1, activeRunId: null,
  regions: [{
    id: 'region-03', name: '铁丘', location: [355, 500], neighborIds: ['capital', 'region-07'],
    accessible: true, blockers: [], offset: 1, firstClearLevel: null, cleared: false,
    nextEncounter: { baseLevel: 14, normalRange: [12, 16], bossLevel: 18 },
    buildingIds: ['blacksmith'], recruitmentPoolId: 'iron_hills', dungeonId: 'abandoned_mine',
  }],
} satisfies World;

export const sampleQuote = {
  id: 'quote-demo-01', playerVersion: 18, rulesetVersion: 'rules-v2-draft',
  action: {
    kind: 'start_dungeon', regionId: 'region-03', stageId: 'abandoned_mine',
    unitIds: ['unit-demo-01', 'unit-demo-02', 'unit-demo-03'],
    itemIds: ['item-demo-01', 'item-demo-02'],
  },
  cost: { days: 8, gold: 0, materials: [] }, startDay: 120, endDay: 128,
  expiresAt: '2026-10-16T12:05:00Z', encounteredEvents: [],
  risk: 'permadeath', blockers: [], enemyLevels: { minimum: 12, maximum: 18 },
} satisfies ActionQuote;

export const sampleRun = {
  id: 'run-demo-01', kind: 'dungeon', state: 'between_maps',
  regionId: 'region-03', registrationDay: 120,
  rulesetVersion: 'rules-v2-draft', catalogVersion: 'draft-2026-10-16',
  lockedUnitIds: ['unit-demo-01', 'unit-demo-02', 'unit-demo-03'],
  survivingUnitIds: ['unit-demo-01', 'unit-demo-03'], lockedItemIds: ['item-demo-01', 'item-demo-02'],
  encounterLevel: 14, stageIndex: 0, stageCount: 3, battleId: null,
  canContinue: true, blockers: [], recovery: 'none',
  pendingLoot: [{ templateId: 'iron_ore', quantity: 3 }], risk: 'permadeath',
} satisfies Run;

export const sampleBattle = {
  id: 'battle-demo-01', runId: 'run-demo-01', version: 6, engineVersion: 2,
  risk: 'permadeath', turn: 2, turnLimit: 20, phase: 'player', processing: false,
  map: {
    width: 5, height: 4,
    tiles: [['plain', 'plain', 'forest', 'plain', 'plain'], ['plain', 'plain', 'plain', 'plain', 'plain'],
      ['plain', 'plain', 'plain', 'plain', 'plain'], ['plain', 'plain', 'plain', 'plain', 'plain']],
    deploymentCells: [[0, 0], [1, 0], [0, 1]],
  },
  goal: { kind: 'rout', targetId: null, turns: null },
  units: [{
    id: 'combat-unit-01', persistentUnitId: 'unit-demo-01', side: 'player',
    name: '艾琳', classId: 'swordsman', level: 1, stats: sampleStats, hp: 17,
    position: [1, 1], disposition: 'active', acted: false, equippedItemId: 'item-demo-01',
    inventory: [{
      id: 'item-demo-01', templateId: 'iron_sword', ownerUnitId: 'unit-demo-01', location: 'run',
      durability: { current: 31, maximum: 45 }, usesRemaining: null,
      quality: 'perfect', refinementResolved: true, lockedByRunId: 'run-demo-01',
    }],
    statuses: [{ id: 'poison', remainingTurns: 2, expiresAt: null }],
  }, {
    id: 'enemy-01', persistentUnitId: null, side: 'enemy', name: '矿坑守卫',
    classId: 'fighter', level: 14, stats: { ...sampleStats, hp: 30, str: 12 }, hp: 30,
    position: [4, 2], disposition: 'active', acted: false,
    equippedItemId: null, inventory: [], statuses: [],
  }],
  result: null, lastEventCursor: '317',
} satisfies Battle;

export const sampleLegacyPreview = {
  legacyId: 'legacy-demo-01', recipientUnitId: 'unit-demo-01', mode: 'stats',
  sourceLevel: 15, sourceTotal: 200, targetTotal: 200, truncated: 0,
  caps: sampleCaps, resultingPersonalGrowth: personalGrowth,
  floorByLevel: Array.from({ length: 15 }, (_, index) => ({
    level: index + 1, total: 80 + Math.ceil(120 * index / 14),
  })),
  cost: { days: 0, gold: 0, materials: [] }, blockers: [],
} satisfies LegacyPreview;

export const sampleGetState = {
  protocolVersion: 2, op: 'GET_STATE', seq: 1, data: {},
} satisfies Request<'GET_STATE'>;

export const sampleExecute = {
  protocolVersion: 2, op: 'EXECUTE_ACTION', seq: 2,
  commandId: '9475a606-ddf6-407e-bc25-4bea3f4421ca', expectedPlayerVersion: 18,
  data: { quoteId: 'quote-demo-01' },
} satisfies Request<'EXECUTE_ACTION'>;

export const sampleEndPhase = {
  protocolVersion: 2, op: 'END_PHASE', seq: 7,
  commandId: 'b1a5c130-c649-4c63-a7c9-94f583b2f673', expectedPlayerVersion: 18, expectedBattleVersion: 6,
  data: { battleId: 'battle-demo-01' },
} satisfies Request<'END_PHASE'>;

export const sampleStateResponse = {
  protocolVersion: 2, op: 'GET_STATE', seq: 1, ok: true, playerVersion: 18, data: sampleState,
} satisfies Response<'GET_STATE'>;

export const sampleWorldResponse = {
  protocolVersion: 2, op: 'GET_WORLD', seq: 2, ok: true, playerVersion: 18, data: sampleWorld,
} satisfies Response<'GET_WORLD'>;

export const sampleStaleResponse = {
  protocolVersion: 2, op: 'END_PHASE', seq: 7, ok: false, playerVersion: 19,
  error: {
    code: 'STALE_BATTLE_VERSION', message: '战斗状态已更新，请刷新后重新选择。', retry: 'refresh',
    details: { currentBattleVersion: 7, requestedBattleVersion: 6 },
  },
} satisfies Response<'END_PHASE'>;
