import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOC_VERSION, OP, OPS, PUSH_OPS } from '../common/protocol/ops.ts';
import { apiDoc } from '../common/protocol/docs.ts';
import { CATALOG_VERSION, ENGINE_VERSION, RULESET_VERSION } from '../common/game/version.ts';

let app: typeof import('./server.ts').app;
let store: typeof import('./server.ts').store;
let login: { token: string; state: { player: { id: string } } };
const dir = mkdtempSync(join(tmpdir(), 'agent-access-'));
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
const access = (token = login.token, method: 'GET' | 'POST' = 'GET') => app.inject({ method, url: '/api/agent-token', headers: headers(token) });
const call = async (token: string, op: number) => (await app.inject({ method: 'POST', url: '/api/op', headers: headers(token), payload: { op, data: {} } })).json();
const versions = { docVersion: DOC_VERSION, engineVersion: ENGINE_VERSION, rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION };

before(async () => {
  const previous = { DB_PATH: process.env.DB_PATH, API_PORT: process.env.API_PORT };
  process.env.DB_PATH = join(dir, 'test.db');
  process.env.API_PORT = '0';
  ({ app, store } = await import('./server.ts'));
  for (const key of ['DB_PATH', 'API_PORT'] as const) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  if (!app.server.listening) await once(app.server, 'listening');
  login = (await app.inject({ method: 'POST', url: '/api/login', payload: { name: 'agent-access' } })).json();
});
after(async () => { await app?.close(); store?.db.close(); rmSync(dir, { recursive: true, force: true }); });

test('Agent connection metadata follows HTTP/HTTPS public hosts and shares current API versions', async () => {
  assert.equal((await access('invalid')).statusCode, 401);
  const first = (await access()).json();
  for (const [requestHeaders, origin] of [
    [{ host: 'game.example:8080' }, 'http://game.example:8080'],
    [{ host: 'internal:8525', 'x-forwarded-host': 'play.example, internal', 'x-forwarded-proto': 'https, http' }, 'https://play.example'],
    [{ host: '[::1]:8525' }, 'http://[::1]:8525'],
  ] as const) {
    const result = (await app.inject({ method: 'GET', url: '/api/agent-token', headers: { ...headers(login.token), ...requestHeaders } })).json();
    assert.equal(result.token, first.token, 'reading metadata never rotates credentials');
    assert.equal(result.apiUrl, origin);
    assert.equal(result.ws, `${origin.replace(/^http/, 'ws')}/ws`);
    assert.equal(result.docs, `${origin}/agent-api.md`);
    for (const [key, value] of Object.entries(versions)) assert.equal(result[key], value);
  }
  assert.deepEqual((await app.inject('/agent-api.json')).json(), apiDoc());
  assert.match((await app.inject('/agent-api.md')).body, new RegExp(`docVersion: ${DOC_VERSION}`));
  assert.equal((await app.inject(`/agent-api/changes/${DOC_VERSION - 1}`)).json().to, DOC_VERSION);
  const health = (await app.inject('/api/health')).json();
  for (const [key, value] of Object.entries(versions)) assert.equal(health[key], value);
});

test('human token rotation revokes old HTTP and open WebSocket access without changing the save', async () => {
  const old = (await access()).json();
  const accountId = store.accountByName('agent-access')!.id;
  const extra = store.createToken(accountId, 'agent', 'legacy extra');
  const other = (await app.inject({ method: 'POST', url: '/api/login', payload: { name: 'agent-access-other' } })).json();
  const otherToken = (await access(other.token)).json().token;
  assert.equal((await access('', 'POST')).statusCode, 401);
  assert.equal((await access(old.token, 'POST')).statusCode, 403, 'an Agent cannot rotate its own credentials');
  assert.equal((await access()).json().token, old.token);
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  const send = async (op: number, data = {}) => {
    const next = once(socket, 'message');
    socket.send(JSON.stringify({ op, seq: 1, data }));
    return JSON.parse((await next)[0].data);
  };
  try {
    const authenticated = await send(OP.LOGIN, { token: old.token, docVersion: DOC_VERSION });
    assert.equal(authenticated.ok, true);
    for (const [key, value] of Object.entries(versions)) assert.equal(authenticated.data[key], value);
    assert.equal((await send(OP.CLAIM_CONTROL)).data.owner, 'agent');
    const before = store.getPlayer(login.state.player.id)!;
    const units = store.units(before.id), inventory = store.inventory(before.id);
    const rotated = await access(login.token, 'POST');
    assert.equal(rotated.statusCode, 200);
    const current = rotated.json();
    assert.notEqual(current.token, old.token);
    assert.notEqual(current.token, extra);
    assert.equal((await access()).json().token, current.token);
    assert.equal((await call(old.token, OP.GET_STATE)).error.code, 'UNAUTHORIZED');
    assert.equal((await call(extra, OP.GET_STATE)).error.code, 'UNAUTHORIZED');
    assert.equal((await call(otherToken, OP.GET_STATE)).ok, true, 'other accounts retain access');
    assert.equal((await call(login.token, OP.GET_STATE)).ok, true, 'the web session remains valid');
    assert.equal((await send(OP.GET_STATE)).error.code, 'UNAUTHORIZED', 'revocation covers an already-open socket');
    assert.equal((await send(OP.LOGIN, { token: current.token, docVersion: DOC_VERSION })).data.docNotice, null);
    assert.equal((await send(OP.GET_STATE)).ok, true);
    assert.equal((await send(OP.LOGIN, { token: old.token })).error.code, 'UNAUTHORIZED');
    assert.equal((await send(OP.GET_STATE)).error.code, 'UNAUTHORIZED', 'failed reauthentication cannot retain earlier privileges');
    const after = store.getPlayer(before.id)!;
    for (const key of ['day', 'gold', 'bexp'] as const) assert.equal(after[key], before[key]);
    assert.equal(after.flags.controlLease, undefined, 'revoked Agent control is released');
    assert.deepEqual(store.units(before.id), units);
    assert.deepEqual(store.inventory(before.id), inventory);
  } finally {
    const closed = once(socket, 'close'); socket.close(); await closed;
  }
});

test('rotating Agent credentials preserves a human control lease', async () => {
  assert.equal((await call(login.token, OP.CLAIM_CONTROL)).data.owner, 'human');
  const lease = store.getPlayer(login.state.player.id)!.flags.controlLease;
  assert.equal((await access(login.token, 'POST')).statusCode, 200);
  assert.deepEqual(store.getPlayer(login.state.player.id)!.flags.controlLease, lease);
});

test('stdio MCP discovers all tools and uses real HTTP authentication, receipts and revocation', { timeout: 15000 }, async () => {
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const token = (await access()).json().token;
  const child = spawn(process.execPath, [new URL('../../mcp/server.ts', import.meta.url).pathname], {
    env: { ...process.env, API_URL: `http://127.0.0.1:${address.port}`, AGENT_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let id = 0;
  const send = async (method: string, params = {}) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })}\n`);
    const next = await lines.next();
    assert.equal(next.done, false);
    const response = JSON.parse(next.value!);
    assert.equal(response.id, id);
    return response.result;
  };
  const tool = (name: string, data = {}) => send('tools/call', { name, arguments: { data } });
  try {
    assert.ok((await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'integration-test', version: '1' } })).capabilities.tools);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await send('tools/list');
    assert.equal(list.tools.length, OPS.length - PUSH_OPS.size - 2);
    const state = await tool('get_state');
    assert.equal(state.isError, false);
    assert.equal(JSON.parse(state.content[0].text).player.id, login.state.player.id);
    assert.equal((await tool('rest', { days: 1 })).isError, true, 'MCP obeys the existing human control lease');
    await call(login.token, OP.RELEASE_CONTROL);
    assert.equal((await tool('claim_control')).isError, false);
    const day = store.getPlayer(login.state.player.id)!.day;
    for (let attempt = 0; attempt < 2; attempt++) assert.equal((await tool('rest', { days: 1, commandId: 'actual-mcp-retry' })).isError, false);
    assert.equal(store.getPlayer(login.state.player.id)!.day, day + 1, 'real HTTP retry receipts prevent duplicate spending');
    await access(login.token, 'POST');
    const expired = await tool('get_state');
    assert.equal(expired.isError, true);
    assert.match(expired.content[0].text, /UNAUTHORIZED/);
    assert.match(expired.content[0].text, /AGENT_TOKEN/);
    assert.doesNotMatch(expired.content[0].text, /LOGIN/);
  } finally {
    const exited = once(child, 'exit'); child.stdin.end(); await exited;
  }
});
