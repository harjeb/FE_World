import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toolList } from './server.ts';
import { OPS, PUSH_OPS, WRITE_OPS } from '../backend/common/protocol/ops.ts';
import { apiDoc } from '../backend/common/protocol/docs.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false });
const tools = toolList();

test('MCP covers every browser operation and shares each API data contract', () => {
  const names = new Set(tools.map(tool => tool.name));
  assert.equal(names.size, OPS.length - PUSH_OPS.size - 2);
  function checkDir(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) checkDir(file);
      else if (/\.tsx?$/.test(file)) {
        for (const [, name] of readFileSync(file, 'utf8').matchAll(/\bOP\.([A-Z_]+)/g)) {
          assert.ok(names.has(name.toLowerCase()), `${file} uses ${name}, absent from MCP`);
        }
      }
    }
  }
  checkDir(new URL('../frontend/src', import.meta.url).pathname);
  const docs = apiDoc();
  for (const tool of tools) {
    ajv.compile(tool.inputSchema);
    const def = docs.ops.find(op => op.name.toLowerCase() === tool.name)!;
    const schema = (tool.inputSchema.properties as any).data;
    assert.deepEqual(schema.properties, def.dataSchema?.properties, tool.name);
    assert.deepEqual(schema.required, def.dataSchema?.required ?? [], tool.name);
    if (WRITE_OPS.has(def.op)) assert.equal(schema.properties.commandId.type, 'string');
  }
});

test('advertised nested MCP arguments accept actual gameplay payloads and retry IDs', () => {
  const samples: [string, Record<string, unknown>][] = [
    ['buy', { item: 'vulnerary', count: 2, commandId: 'buy-retry' }],
    ['get_unit', { unitId: 'u_erin' }],
    ['rest', { days: 2 }],
    ['start_dispatch', { region: 1, durationDays: 30, unitIds: ['u_erin'], weaponType: 'sword' }],
    ['start_production', { recipeId: 'wood', perfect: true }],
    ['preview_action', { action: 'train', unitId: 'u_erin', weaponType: 'sword' }],
    ['execute_action', { quoteId: 'quote-1', commandId: 'quote-retry' }],
    ['get_reachable', { unitId: 'u_erin', battleId: 'battle-1' }],
    ['get_battle', { battleId: 'battle-1', full: true, sinceEvent: 10, notes: true }],
    ['end_phase', { battleId: 'battle-1', commandId: 'end-retry' }],
    ['retreat', { battleId: 'battle-1', commandId: 'retreat-retry' }],
    ['surrender', { battleId: 'battle-1', commandId: 'surrender-retry' }],
    ['preview_combat', { attackerId: 'u_erin', from: [1, 2], targetId: 'enemy', battleId: 'battle-1' }],
    ['repair_item', { unitId: 'u_erin', weapon: 'iron_sword', commandId: 'repair-retry' }],
    ['agent_report_plan', { text: '先整备再出击', commandId: 'plan-retry' }],
  ];
  for (const action of ['attack', 'heal', 'item', 'seize', 'escape', 'interact', 'wait', 'dance', 'art', 'cast', 'staff']) {
    samples.push(['unit_act', { battleId: 'battle-1', unitId: 'u_erin', moveTo: [1, 2], action, commandId: `action-${action}` }]);
  }
  for (const [name, data] of samples) {
    const valid = ajv.compile(tools.find(tool => tool.name === name)!.inputSchema);
    assert.equal(valid({ data }), true, `${name}: ${JSON.stringify(valid.errors)}`);
  }
  const buy = ajv.compile(tools.find(tool => tool.name === 'buy')!.inputSchema);
  assert.equal(buy({}), false, 'required fields cannot disappear by omitting data');
  assert.equal(buy({ data: {} }), false);
  assert.equal(buy({ data: { item: 'vulnerary', count: 'two' } }), false);
  assert.equal(buy({ data: { item: 'vulnerary', commandId: '' } }), false);
  assert.equal(buy({ data: { item: 'vulnerary', unknown: true } }), false);
  assert.equal(buy({ item: 'vulnerary', count: 2 }), true, 'legacy flat arguments still pass the advertised schema');
});
