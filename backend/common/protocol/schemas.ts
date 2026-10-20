// Request contracts shared by protocol documentation and Agent/MCP callers.
import { PROTAGONIST_ALLOCATION_BUDGET, PROTAGONIST_MAX_ALLOCATION, PROTAGONIST_MIN_ALLOCATION } from '../data/characters.ts';
import { STAT_KEYS } from '../data/types.ts';
import { OP } from './ops.ts';

export interface SchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | readonly ('string' | 'number')[]; enum?: readonly (string | number)[]; minimum?: number; maximum?: number; minLength?: number; minItems?: number; maxItems?: number; uniqueItems?: boolean; items?: SchemaProperty; properties?: Record<string, SchemaProperty>; required?: string[]; additionalProperties?: boolean | SchemaProperty; oneOf?: { required: string[] }[]; description?: string;
}
const aiDifficulty: SchemaProperty = { type: 'string', enum: ['normal', 'hard'], description: 'Battle difficulty; defaults to normal and locks for the entire run. Hard requires a normal victory in this wild region or a normal full clear of this exact dungeon. Single-map quests do not support hard except cross-time-throne: its own normal win unlocks hard, fixed 17 enemies at level48/52 with dedicated stats, eight players, eight days, repeatable and automatic rewards; generic difficulty scaling does not apply. Read GET_STATE.hardUnlocks and GET_QUESTS.hardAvailable/hardUnlocked first. Hard adds deeper AI search, 50% more enemies where legal space permits, random +2–5 levels (cap 99), HP +20–35%, each other stat +10–25% (rounded up, minimum +1; HP cap 150, other stats uncapped), constitution +1–3, and upgraded usable equipment. Movement is unchanged. Applies to initial enemies and reinforcement waves; generation is seeded and saved, never rerolled on reload. Day costs and fixed quest rewards stay the same. Random encounters have map/difficulty-specific deployment limits and enemy counts independent of the selected party; read the encounter preview. More/higher-level foes can yield more combat experience; carried enemy gear is not a probabilistic drop. Dungeon first-clear equipment/items are separate per difficulty (hard has different higher-tier gear and more supplies); exploration and manual quest rewards remain once across difficulties.' };
const point: SchemaProperty = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 };
const string: SchemaProperty = { type: 'string' };
const number: SchemaProperty = { type: 'number' };
const boolean: SchemaProperty = { type: 'boolean' };
const strings: SchemaProperty = { type: 'array', items: string };
const fieldUnits: SchemaProperty = { ...strings, minItems: 1, maxItems: 8, uniqueItems: true, description: 'Ordered, distinct available roster IDs; the first is commander and index i uses map.spawns.player[i]. The current map/difficulty may allow fewer than eight: read GET_TODAY sortieRegions.encounters/dungeonEncounters and PREVIEW_ACTION.encounter.maxUnits. For dungeons this limit accounts for every stage, including the classic finale. Omission chooses available units up to that limit; excess or duplicate IDs are rejected.' };
const stats: SchemaProperty = { type: 'object', properties: Object.fromEntries(STAT_KEYS.map(key => [key, number])), additionalProperties: number };
const support: SchemaProperty = { type: 'object', required: ['target'], additionalProperties: false, oneOf: [{ required: ['spell'] }, { required: ['weapon'] }], description: 'One paid nonhostile extra; nested target, not targetId. No nested action/art.', properties: { target: { type: 'string' }, spell: { type: 'string' }, weapon: { type: 'string' }, dest: point } };

export interface OpSchema {
  required?: string[];
  properties: Record<string, SchemaProperty>;
}

export const OP_SCHEMAS: Record<string, OpSchema> = {
  LOGIN: { required: ['token'], properties: { token: string, docVersion: number, agentModel: string } },
  GET_EVENTS: { properties: { cursor: string, sinceId: { type: ['string', 'number'] } } },
  GET_UNIT: { required: ['unitId'], properties: { unitId: string } },
  GET_TAVERN: { properties: { region: number } },
  BUY: { required: ['item'], properties: { item: string, count: number } },
  SWEEP: { required: ['region'], properties: { region: number, times: number } },
  TRAIN: { properties: { unitIds: { ...strings, minItems: 1, maxItems: 8, uniqueItems: true, description: '训练名单：第1/2/3/4年起上限为1/3/5/8人，此后不变。与groupId一起传入。' }, groupId: { type: 'string', enum: ['agility', 'power', 'mystic'], description: 'agility=剑/弓/拳；power=斧/枪/兽；mystic=拳/杖/理/龙。组内所有武器各获经验，不要求当前携带或职业权限。' }, unitId: { ...string, description: '旧客户端单人训练兼容参数；与unitIds互斥。' }, weaponType: string } },
  REST: { properties: { days: number } },
  PREVIEW_ACTION: { required: ['action'], properties: {
    action: { type: 'string', enum: ['sortie', 'sweep', 'train', 'art_training', 'rest', 'recruit', 'dungeon', 'annual'] },
    region: number, unitIds: strings, groupId: { type: 'string', enum: ['agility', 'power', 'mystic'] }, aiDifficulty, times: number, unitId: string, weaponType: string, art: string, days: number,
  } },
  EXECUTE_ACTION: { required: ['quoteId'], properties: { quoteId: string } },
  PROMOTE: { required: ['unitId', 'promotion'], properties: { unitId: string, promotion: string } },
  DISMISS: { required: ['unitId'], properties: { unitId: string } },
  RETIRE_UNIT: { required: ['unitId'], properties: { unitId: string } },
  CLAIM_LEGACY: { required: ['legacyId', 'unitId', 'mode'], properties: { legacyId: string, unitId: string, mode: { type: 'string', enum: ['growth', 'numeric'] }, weights: stats } },
  REINCARNATE_UNIT: { required: ['unitId'], properties: { unitId: string, allocation: stats } },
  GET_CLASS_MARKET: { properties: { unitId: string } },
  BUY_CLASS_QUALIFICATION: { required: ['unitId', 'classId'], properties: { unitId: string, classId: string } },
  SWITCH_CLASS: { required: ['unitId', 'classId'], properties: { unitId: string, classId: string } },
  GET_MASTERY: { required: ['unitId'], properties: { unitId: string } },
  START_DUNGEON: { required: ['region'], properties: { region: number, unitIds: fieldUnits, aiDifficulty } },
  START_DISPATCH: { required: ['region', 'durationDays', 'unitIds'], properties: { region: number, durationDays: number, unitIds: strings, classId: string, weaponType: string } },
  PLANT: { properties: { recipeId: string } },
  START_PRODUCTION: { required: ['recipeId'], properties: { recipeId: string, perfect: boolean } },
  COLLECT_PRODUCTION: { required: ['orderId'], properties: { orderId: string } },
  REGISTER_ANNUAL: { properties: { unitIds: strings } },
  GET_BATTLE: { properties: { battleId: string, detail: boolean, full: boolean, notes: boolean, sinceEvent: number } },
  END_PHASE: { properties: { battleId: string } },
  RETREAT: { properties: { battleId: string } },
  SURRENDER: { properties: { battleId: string } },
  GET_REACHABLE: { required: ['unitId'], properties: { unitId: string, battleId: string } },
  GET_THREAT_MAP: { properties: { battleId: string, side: string } },
  GET_BATTLE_LOG: { properties: { battleId: string } },
  GET_OPPONENT: { required: ['opponentId'], properties: { opponentId: string, day: number } },
  SET_DEFENSE: { required: ['defense'], properties: { defense: { type: 'object', required: ['map', 'slots', 'commanders', 'bans'], properties: {
    id: string, legion: string, points: number, record: string, map: string, commanders: strings, bans: strings,
    slots: { type: 'array', items: { type: 'object', required: ['unit', 'pos', 'behavior'], properties: {
      unit: { type: 'object', properties: { id: string, character: string }, additionalProperties: true }, pos: point, behavior: string,
    } } },
  } } } },
  GET_REPLAY: { required: ['replayId'], properties: { replayId: string } },
  GET_REPLAYS: { properties: { limit: number, activity: string, result: string, fromDay: number, toDay: number, mine: boolean } },
  START_SPARRING: { properties: { legion: string } },
  CLAIM_RATING_REWARD: { required: ['periodId'], properties: { periodId: string } },
  COMPLETE_STORY_EVENT: { required: ['chapter'], properties: { chapter: number } },
  COMPLETE_STORY_STEP: { required: ['step'], properties: { step: string } },
  START_STORY_DUEL: { required: ['step', 'unitId'], properties: { step: string, unitId: string } },
  CLAIM_REWARD: { required: ['rewardKey'], properties: { rewardKey: string } },
  CLAIM_QUEST_REWARD: { required: ['questId'], properties: { questId: string } },
  AGENT_REPORT_PLAN: { required: ['text'], properties: { text: string } },
  AGENT_PHASE_NOTE: { required: ['text'], properties: { text: string, battleId: string } },
  AGENT_COMMENT_BATTLE: { required: ['text'], properties: { text: string, battleId: string } },
  AGENT_DAILY_REPORT: { required: ['text'], properties: { text: string } },
  SORTIE: { required: ['region'], properties: { aiDifficulty, region: { type: 'number', minimum: 1, maximum: 12 }, unitIds: fieldUnits } },
  GET_CROSS_TIME_RECRUITS: { properties: {} },
  EXCHANGE_CROSS_TIME_RECRUIT: { required: ['identityId', 'commandId'], properties: { identityId: string, commandId: string } },
  START_QUEST: { required: ['questId'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, aiDifficulty, questId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  RECRUIT: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12 } } },
  ACCEPT_RECRUIT: { properties: { id: { type: 'string' } } },
  HIRE_TAVERN: { required: ['region', 'id'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, id: { type: 'string' } } },
  REFINE_WEAPON: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string', enum: ['fw_weapon_85'] } } },
  REPAIR_ITEM: { required: ['unitId'], properties: { unitId: { type: 'string' }, item: { type: 'string' }, weapon: { type: 'string', description: 'Legacy alias for item.' } } },
  TRANSFER_ITEM: { required: ['unitId', 'item', 'action'], properties: { unitId: { type: 'string' }, item: { type: 'string', description: '武器 id、道具 id，或 spellbook:<法术id>' }, action: { type: 'string', enum: ['equip', 'toUnit', 'toWarehouse'] }, uses: { type: 'number', minimum: 0 } } },
  SELL: { required: ['item'], properties: { item: { type: 'string' }, count: { type: 'number', minimum: 1, description: '出售数量，默认1' }, uses: { type: 'number', minimum: 0, description: '只卖指定剩余次数的一叠；省略时按原库存顺序出售' } } },
  ASSIGN_BEXP: { required: ['unitId', 'amount'], properties: { unitId: { type: 'string' }, amount: { type: 'number', minimum: 1, description: '分配经验上限；实际扣除不超过库存及距离满级所需，返回 amount 为实际消耗' } } },
  USE_ITEM: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string', description: '能力药 id 或 manual:<法术id>' } } },
  BUY_QUEST_ITEM: { required: ['region', 'item'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, item: { type: 'string' } } },
  PLAY_MINIGAME: { required: ['game', 'bet'], properties: { game: { type: 'string', enum: ['dice', 'frogs'] }, bet: { type: 'number', enum: [20, 50, 100] }, choice: { type: 'string', enum: ['big', 'small'] }, pick: { type: 'number', minimum: 0, maximum: 3 } } },
  START_CHALLENGE: { required: ['floorId', 'unitIds'], properties: { floorId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  CLAIM_CHALLENGE_REWARD: { required: ['floorId'], properties: { floorId: { type: 'string' } } },
  ARENA_ATTACK: { required: ['opponentId', 'picks', 'commander'], properties: { opponentId: { type: 'string' }, picks: { type: 'array', items: { type: 'object', required: ['pos'], properties: { character: string, unitId: string, pos: point } } }, commander: { type: 'string' } } },
  ARENA_BAN: { required: ['opponentId', 'bans'], properties: { opponentId: { type: 'string' }, bans: strings } },
  UNIT_ACT: { required: ['unitId', 'moveTo', 'action'], properties: {
    unitId: { type: 'string' }, moveTo: point, targetId: { type: 'string' }, weapon: { type: 'string' },
    action: { type: 'string', enum: ['attack', 'heal', 'item', 'seize', 'escape', 'interact', 'wait', 'dance', 'art', 'cast', 'staff'] },
    art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, postTo: point, support, spell: { type: 'string' }, dest: point, item: { type: 'number', minimum: 0, maximum: 4 },
  } },
  PREVIEW_COMBAT: { required: ['attackerId', 'from', 'targetId'], properties: { attackerId: { type: 'string' }, from: point, targetId: { type: 'string' }, weapon: { type: 'string' }, art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, postTo: point, support, spell: { type: 'string' } } },
  INN_REST: { required: ['unitId', 'book'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' } } },
  USE_FOOD: { required: ['unitId', 'book', 'item'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' }, item: { type: 'string', enum: ['ether_ration', 'full_meal'] } } },
  EQUIP_SKILLS: { required: ['unitId', 'skills'], properties: { unitId: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, arts: { type: 'array', items: { type: 'string' } } } },
  GET_ART_TRAINING: { required: ['unitId'], properties: { unitId: { type: 'string' } } },
  TRAIN_ART: { required: ['unitId', 'art'], properties: { unitId: { type: 'string' }, art: { type: 'string' } } },
  START_ANNUAL_MATCH: { properties: {} },
  CHOOSE_ROUTE: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12, description: '必须是世界地图 selectableRegions 中的整数地区 id；初选1–4自由，之后须将已开通地区探索至100才可选择其相邻新路线；已开通地区访问权保留' } } },
  COMPLETE_SETUP: { required: ['protagonist', 'companions'], properties: {
    protagonist: { type: 'object', required: ['name', 'sex', 'allocation'], additionalProperties: false, properties: {
      name: { type: 'string' }, sex: { type: 'string', enum: ['male', 'female'] }, portrait: { type: 'string', description: 'Generated portrait key random:male|female:seed, matching sex; seed must be 1–64 letters, digits, underscores or hyphens. Omission uses an account-specific key. Named teammate portraits are rejected.' },
      classId: { type: 'string', enum: ['commoner'] }, growthType: { type: 'string', enum: ['growth'] },
      allocation: { type: 'object', additionalProperties: false,
        description: `填写基础属性之上的额外加点，总计必须正好${PROTAGONIST_ALLOCATION_BUDGET}点，每项0–5，未填写项按0计；倾向由加点自动推导。`,
        properties: Object.fromEntries(STAT_KEYS.map(key => [key, { type: 'number', minimum: PROTAGONIST_MIN_ALLOCATION[key], maximum: PROTAGONIST_MAX_ALLOCATION[key] }])) },
    } }, companions: { type: 'array', items: { type: 'string' } },
  } },
};

// Explicit zero-argument requests: adding an op must not silently create an empty contract.
for (const opName of [
  'LOGOUT', 'GET_STATE', 'GET_AGENT_INFO', 'GET_ROSTER', 'GET_INVENTORY', 'GET_CATALOG',
  'GET_TODAY', 'GET_WORLD_MAP', 'DECLINE_RECRUIT', 'START_MAIN_STAGE', 'SKIP_MAIN_STAGE',
  'GET_SHOP', 'GET_LEGACIES', 'GET_MEMORIAL', 'EMERGENCY_RECRUIT', 'GET_RUN',
  'CONTINUE_DUNGEON', 'WITHDRAW_RUN', 'GET_DISPATCHES', 'GET_PRODUCTION',
  'GET_ARENA', 'GET_DEFENSE', 'ARENA_REGISTER',
  'GET_ARENA_RESULTS', 'GET_SNAPSHOTS', 'GET_RATINGS', 'GET_SPARRING', 'GET_ANNUAL',
  'WITHDRAW_ANNUAL', 'GET_STORY', 'GET_QUESTS', 'CLAIM_CONTROL', 'RELEASE_CONTROL',
  'GET_MINIGAMES', 'GET_CHALLENGES',
]) {
  OP_SCHEMAS[opName] = { properties: {} };
}
for (const opName of ['UNIT_ACT', 'PREVIEW_COMBAT']) OP_SCHEMAS[opName].properties.battleId = string;
for (const opName of ['ARENA_BAN', 'ARENA_ATTACK']) OP_SCHEMAS[opName].properties.day = number;
for (const schema of Object.values(OP_SCHEMAS)) {
  schema.properties.commandId = { type: 'string', minLength: 1, description: 'Caller-supplied retry identifier; reuse for retries of the same command.' };
}

export function schemaFor(opName: string): OpSchema | undefined {
  return Object.hasOwn(OP_SCHEMAS, opName) && Object.hasOwn(OP, opName) ? OP_SCHEMAS[opName] : undefined;
}
