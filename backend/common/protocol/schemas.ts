// Concrete request schemas for high-value/new ops. The prose op table remains the overview; MCP and
// the HTTP dispatcher can use these to reject missing or mistyped fields consistently.
import { OP } from './ops.ts';

export interface OpSchema {
  required?: string[];
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; enum?: readonly (string | number)[]; minimum?: number; maximum?: number; items?: { type: string } }>;
}

export const OP_SCHEMAS: Record<string, OpSchema> = {
  SORTIE: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, unitIds: { type: 'array', items: { type: 'string' } } } },
  START_QUEST: { required: ['questId'], properties: { questId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  RECRUIT: { required: ['region'], properties: { region: { type: 'number', minimum: 1, maximum: 12 } } },
  ACCEPT_RECRUIT: { properties: { id: { type: 'string' } } },
  HIRE_TAVERN: { required: ['region', 'id'], properties: { region: { type: 'number', minimum: 1, maximum: 12 }, id: { type: 'string' } } },
  REFINE_WEAPON: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string', enum: ['fw_weapon_85'] } } },
  REPAIR_ITEM: { required: ['unitId', 'item'], properties: { unitId: { type: 'string' }, item: { type: 'string' } } },
  PLAY_MINIGAME: { required: ['game', 'bet'], properties: { game: { type: 'string', enum: ['dice', 'frogs'] }, bet: { type: 'number', enum: [20, 50, 100] }, choice: { type: 'string', enum: ['big', 'small'] }, pick: { type: 'number', minimum: 0, maximum: 3 } } },
  START_CHALLENGE: { required: ['floorId', 'unitIds'], properties: { floorId: { type: 'string' }, unitIds: { type: 'array', items: { type: 'string' } } } },
  CLAIM_CHALLENGE_REWARD: { required: ['floorId'], properties: { floorId: { type: 'string' } } },
  ARENA_ATTACK: { required: ['opponentId', 'picks', 'commander'], properties: { opponentId: { type: 'string' }, picks: { type: 'array' }, commander: { type: 'string' } } },
  ARENA_BAN: { required: ['opponentId', 'bans'], properties: { opponentId: { type: 'string' }, bans: { type: 'array' } } },
  UNIT_ACT: { required: ['unitId', 'moveTo', 'action'], properties: {
    unitId: { type: 'string' }, moveTo: { type: 'array' }, targetId: { type: 'string' }, weapon: { type: 'string' },
    action: { type: 'string', enum: ['attack', 'heal', 'item', 'seize', 'escape', 'interact', 'wait', 'dance', 'art', 'cast', 'staff'] },
    art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, spell: { type: 'string' }, dest: { type: 'array' }, item: { type: 'number', minimum: 0, maximum: 4 },
  } },
  PREVIEW_COMBAT: { required: ['attackerId', 'from', 'targetId'], properties: { attackerId: { type: 'string' }, from: { type: 'array' }, targetId: { type: 'string' }, weapon: { type: 'string' }, art: { type: 'string' }, allyId: { type: 'string' }, secondaryId: { type: 'string' }, spell: { type: 'string' } } },
  INN_REST: { required: ['unitId', 'book'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' } } },
  USE_FOOD: { required: ['unitId', 'book', 'item'], properties: { unitId: { type: 'string' }, book: { type: 'string' }, spellbook: { type: 'boolean' }, item: { type: 'string', enum: ['ether_ration', 'full_meal'] } } },
  EQUIP_SKILLS: { required: ['unitId', 'skills'], properties: { unitId: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } }, arts: { type: 'array', items: { type: 'string' } } } },
  GET_ART_TRAINING: { required: ['unitId'], properties: { unitId: { type: 'string' } } },
  TRAIN_ART: { required: ['unitId', 'art'], properties: { unitId: { type: 'string' }, art: { type: 'string' } } },
  START_ANNUAL_MATCH: { properties: {} },
  COMPLETE_SETUP: { required: ['protagonist', 'companions'], properties: { protagonist: { type: 'object' }, companions: { type: 'array' } } },
};

// Every public op has at least an empty schema so the Agent/MCP layer cannot drift silently;
// ops with concrete fields override this fallback above.
for (const opName of Object.keys(OP)) {
  OP_SCHEMAS[opName] ??= { properties: {} };
}

export function schemaFor(opName: string): OpSchema | undefined {
  return OP_SCHEMAS[opName];
}
