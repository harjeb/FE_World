// Concrete request schemas for high-value/new ops. The prose op table remains the overview; MCP and
// the HTTP dispatcher can use these to reject missing or mistyped fields consistently.
import { PROTAGONIST_ALLOCATION_BUDGET, PROTAGONIST_MAX_ALLOCATION, PROTAGONIST_MIN_ALLOCATION } from '../data/characters.ts';
import { STAT_KEYS } from '../data/types.ts';
import { OP } from './ops.ts';

export interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'; enum?: readonly (string | number)[]; minimum?: number; maximum?: number; items?: { type: string }; properties?: Record<string, SchemaProperty>; required?: string[]; additionalProperties?: boolean; oneOf?: { required: string[] }[]; description?: string;
}
const point: SchemaProperty = { type: 'array', items: { type: 'integer' } };
const support: SchemaProperty = { type: 'object', required: ['target'], additionalProperties: false, oneOf: [{ required: ['spell'] }, { required: ['weapon'] }], description: 'One paid nonhostile extra; nested target, not targetId. No nested action/art.', properties: { target: { type: 'string' }, spell: { type: 'string' }, weapon: { type: 'string' }, dest: point } };

export interface OpSchema {
  required?: string[];
  properties: Record<string, SchemaProperty>;
}

export const OP_SCHEMAS: Record<string, OpSchema> = {
  SORTIE: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, unitIds: { type: 'array', items: { type: 'string' } } } },
  START_QUEST: { required: ['questId'], properties: { questId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  RECRUIT: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12 } } },
  ACCEPT_RECRUIT: { properties: { id: { type: 'string' } } },
  HIRE_TAVERN: { required: ['region', 'id'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, id: { type: 'string' } } },
  REFINE_WEAPON: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string', enum: ['fw_weapon_85'] } } },
  REPAIR_ITEM: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string' } } },
  TRANSFER_ITEM: { required: ['unitId', 'item', 'action'], properties: { unitId: { type: 'string' }, item: { type: 'string', description: '武器 id、道具 id，或 spellbook:<法术id>' }, action: { type: 'string', enum: ['equip', 'toUnit', 'toWarehouse'] }, uses: { type: 'number', minimum: 0 } } },
  SELL: { required: ['item'], properties: { item: { type: 'string' }, count: { type: 'number', minimum: 1, description: '出售数量，默认1' }, uses: { type: 'number', minimum: 0, description: '只卖指定剩余次数的一叠；省略时按原库存顺序出售' } } },
  ASSIGN_BEXP: { required: ['unitId', 'amount'], properties: { unitId: { type: 'string' }, amount: { type: 'number', minimum: 1, description: '分配经验上限；实际扣除不超过库存及距离满级所需，返回 amount 为实际消耗' } } },
  USE_ITEM: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string', description: '能力药 id 或 manual:<法术id>' } } },
  BUY_QUEST_ITEM: { required: ['region', 'item'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, item: { type: 'string' } } },
  PLAY_MINIGAME: { required: ['game', 'bet'], properties: { game: { type: 'string', enum: ['dice', 'frogs'] }, bet: { type: 'number', enum: [20, 50, 100] }, choice: { type: 'string', enum: ['big', 'small'] }, pick: { type: 'number', minimum: 0, maximum: 3 } } },
  START_CHALLENGE: { required: ['floorId', 'unitIds'], properties: { floorId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  CLAIM_CHALLENGE_REWARD: { required: ['floorId'], properties: { floorId: { type: 'string' } } },
  ARENA_ATTACK: { required: ['opponentId', 'picks', 'commander'], properties: { opponentId: { type: 'string' }, picks: { type: 'array' }, commander: { type: 'string' } } },
  ARENA_BAN: { required: ['opponentId', 'bans'], properties: { opponentId: { type: 'string' }, bans: { type: 'array' } } },
  UNIT_ACT: { required: ['unitId', 'moveTo', 'action'], properties: {
    unitId: { type: 'string' }, moveTo: { type: 'array' }, targetId: { type: 'string' }, weapon: { type: 'string' },
    action: { type: 'string', enum: ['attack', 'heal', 'item', 'seize', 'escape', 'interact', 'wait', 'dance', 'art', 'cast', 'staff'] },
    art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, postTo: point, support, spell: { type: 'string' }, dest: { type: 'array' }, item: { type: 'number', minimum: 0, maximum: 4 },
  } },
  PREVIEW_COMBAT: { required: ['attackerId', 'from', 'targetId'], properties: { attackerId: { type: 'string' }, from: { type: 'array' }, targetId: { type: 'string' }, weapon: { type: 'string' }, art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, postTo: point, support, spell: { type: 'string' } } },
  INN_REST: { required: ['unitId', 'book'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' } } },
  USE_FOOD: { required: ['unitId', 'book', 'item'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' }, item: { type: 'string', enum: ['ether_ration', 'full_meal'] } } },
  EQUIP_SKILLS: { required: ['unitId', 'skills'], properties: { unitId: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, arts: { type: 'array', items: { type: 'string' } } } },
  GET_ART_TRAINING: { required: ['unitId'], properties: { unitId: { type: 'string' } } },
  TRAIN_ART: { required: ['unitId', 'art'], properties: { unitId: { type: 'string' }, art: { type: 'string' } } },
  START_ANNUAL_MATCH: { properties: {} },
  CHOOSE_ROUTE: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12, description: '必须是世界地图 selectableRegions 中的整数地区 id；初选1–4自由，之后须将已开通地区探索至100才可选择其相邻新路线；已开通地区访问权保留' } } },
  COMPLETE_SETUP: { required: ['protagonist', 'companions'], properties: {
    protagonist: { type: 'object', required: ['name', 'sex', 'portrait', 'allocation'], additionalProperties: false, properties: {
      name: { type: 'string' }, sex: { type: 'string', enum: ['male', 'female'] }, portrait: { type: 'string' },
      allocation: { type: 'object', additionalProperties: false,
        description: `填写基础属性之上的额外加点，总计必须正好${PROTAGONIST_ALLOCATION_BUDGET}点，每项0–5，未填写项按0计；倾向由加点自动推导。`,
        properties: Object.fromEntries(STAT_KEYS.map(key => [key, { type: 'number', minimum: PROTAGONIST_MIN_ALLOCATION[key], maximum: PROTAGONIST_MAX_ALLOCATION[key] }])) },
    } }, companions: { type: 'array', items: { type: 'string' } },
  } },
};

// Every public op has at least an empty schema so the Agent/MCP layer cannot drift silently;
// ops with concrete fields override this fallback above.
for (const opName of Object.keys(OP)) {
  OP_SCHEMAS[opName] ??= { properties: {} };
}

export function schemaFor(opName: string): OpSchema | undefined {
  return OP_SCHEMAS[opName];
}
