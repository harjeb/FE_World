import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_VERSION, ERRORS, OPS, PUSH_OPS, opDef } from './ops.ts';
import { apiDoc, changesSince, renderMarkdown } from './docs.ts';
import { encode, errorBody, parseRequest } from './frames.ts';
import { CATALOG_VERSION, ENGINE_VERSION, RULESET_VERSION } from '../game/version.ts';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

test('op numbers and names are unique and every op has an agentNote', () => {
  const numbers = new Set<number>(), names = new Set<string>();
  for (const def of OPS) {
    assert.equal(numbers.has(def.op), false, `重复 op 号 ${def.op}`);
    assert.equal(names.has(def.name), false, `重复 op 名 ${def.name}`);
    numbers.add(def.op); names.add(def.name);
    assert.ok(def.agentNote.length > 0, `${def.name} 缺少 agentNote`);
  }
  assert.equal(numbers.size, OPS.length);
});

test('every error code has a meaning and an action', () => {
  const codes = new Set<string>();
  for (const def of ERRORS) {
    assert.equal(codes.has(def.code), false, `重复错误码 ${def.code}`);
    codes.add(def.code);
    assert.ok(def.meaning.length > 0 && def.action.length > 0, `${def.code} 缺少 meaning/action`);
  }
  assert.equal(errorBody('NOT_YOUR_PHASE', 'x').action.length > 0, true);
  assert.equal(errorBody('INTERNAL', 'x').code, 'INTERNAL');
});

test('the checked-in docs are generated from the op table', () => {
  const markdown = readFileSync(join(ROOT, 'docs', 'agent-api.md'), 'utf8');
  assert.equal(markdown, renderMarkdown(), 'docs/agent-api.md 与生成结果不一致，请运行 npm run docs');
  const json = JSON.parse(readFileSync(join(ROOT, 'agent-api.json'), 'utf8')) as { docVersion: number; ops: unknown[]; errors: unknown[] };
  assert.deepEqual(json, apiDoc());
  assert.equal(json.docVersion, DOC_VERSION);
  assert.equal(apiDoc().engineVersion, ENGINE_VERSION);
  assert.equal(apiDoc().rulesetVersion, RULESET_VERSION);
  assert.equal(apiDoc().catalogVersion, CATALOG_VERSION);
});

test('frames round-trip and reject malformed requests', () => {
  const parsed = parseRequest(encode({ op: 50, seq: 7, data: { battleId: 'b1' } }));
  assert.deepEqual(parsed, { op: 50, seq: 7, data: { battleId: 'b1' } });
  assert.throws(() => parseRequest('{"seq":1}'), /op/);
  assert.throws(() => parseRequest('not json'), SyntaxError);
  assert.throws(() => parseRequest('{"op":1,"seq":"x"}'), /seq/);
});

test('changesSince reports the first release and rejects unknown versions', () => {
  assert.deepEqual(changesSince(DOC_VERSION), { from: DOC_VERSION, to: DOC_VERSION, changes: [] });
  assert.equal(changesSince(0)?.to, DOC_VERSION);
  assert.ok(changesSince(1)?.changes.some(change => change.includes('WITHDRAW_ANNUAL')));
  assert.ok(changesSince(2)?.changes.some(change => change.includes('COMPLETE_SETUP')));
  assert.ok(!changesSince(2)?.changes.some(change => change.startsWith('v2:')));
  assert.ok(changesSince(6)?.changes.some(change => change.startsWith('v7:') && change.includes('commandId')));
  assert.equal(changesSince(99), null);
});

test('push ops are a subset of the op table and are not callable requests', () => {
  for (const op of PUSH_OPS) assert.ok(opDef(op), `推送 op ${op} 不在表中`);
  assert.ok([...PUSH_OPS].every(op => op >= 200));
});
