import assert from 'node:assert/strict';
import test from 'node:test';
import { copyText } from '../src/ui/clipboard.ts';
import { agentToken, agentBundle } from '../src/api/client.ts';

test('clipboard available, unavailable, rejected, and false/throw cleanup', async () => {
  let removed = 0, focused = 0, copied = 0;
  globalThis.document = {
    activeElement: { focus: () => focused++ }, getSelection: () => null,
    createElement: () => ({ style: {}, focus() {}, select() {}, remove() { removed++; } }),
    body: { appendChild() {} }, execCommand: () => { copied++; return true; },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => assert.equal(text, 'secret') } } });
  await copyText('secret');
  assert.equal(copied, 0);
  navigator.clipboard = undefined;
  await copyText('secret');
  navigator.clipboard = { writeText: async () => { throw Error('denied'); } };
  await copyText('secret');
  document.execCommand = () => false;
  await assert.rejects(copyText('secret'));
  document.execCommand = () => { throw Error('blocked'); };
  await assert.rejects(copyText('secret'));
  assert.equal(removed, 4);
  assert.equal(focused, 4);
});

test('agent metadata uses actual origin; GET reads, POST rotates, errors reject', async () => {
  globalThis.window = { location: { origin: 'https://game.example:444' } };
  globalThis.localStorage = { getItem: () => 'human' };
  const methods = [];
  globalThis.fetch = async (_url, options) => {
    methods.push(options.method);
    assert.equal(options.headers.authorization, 'Bearer human');
    return Response.json({ token: 'secret', docVersion: 123, apiUrl: 'http://localhost:8525', ws: 'ws://localhost:8525/ws', docs: 'http://localhost:8525/agent-api.md' });
  };
  const agent = await agentToken();
  await agentToken(true);
  assert.deepEqual(methods, ['GET', 'POST']);
  assert.equal(agent.apiUrl, window.location.origin);
  assert.equal(agent.ws, 'wss://game.example:444/ws');
  assert.equal(agent.docs, 'https://game.example:444/agent-api.md');
  const bundle = agentBundle(agent);
  for (const part of ['AGENT_TOKEN=secret', 'API_URL=https://game.example:444', 'docVersion: 123', '/agent-api.json', 'MCP']) assert.ok(bundle.includes(part));
  assert.ok(!bundle.includes('localhost'));
  globalThis.fetch = async () => Response.json({ error: 'human required' }, { status: 403 });
  await assert.rejects(agentToken(true), /human required/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(agentToken(), /响应无效/);
});
