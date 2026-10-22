import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { openDb } from '../backend/api/db.ts';
import { Store } from '../backend/api/store.ts';
import { loginOrRegister } from '../backend/api/auth.ts';
import { dispatch, type Context } from '../backend/api/handlers.ts';
import { OP } from '../backend/common/protocol/ops.ts';

type Cleanup = { after: (fn: () => unknown) => void };
async function apiFor(t: Cleanup, handler: (body: any, req: any, res: any) => void) {
  const api = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    handler(JSON.parse(Buffer.concat(chunks).toString()), req, res);
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  t.after(() => { api.closeAllConnections(); api.close(); });
  const address = api.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
function client(t: Cleanup, url: string) {
  const child = spawn(process.execPath, [new URL('./server.ts', import.meta.url).pathname], {
    env: { ...process.env, API_URL: url, AGENT_TOKEN: 'local-test' }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  return {
    child,
    async raw(text: string) {
      child.stdin.write(text + '\n');
      const next = await lines.next();
      assert.equal(next.done, false);
      return JSON.parse(next.value!);
    },
    async send(id: string | number, method: string, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      const next = await lines.next();
      assert.equal(next.done, false);
      const message = JSON.parse(next.value!);
      assert.equal(message.id, id);
      return message;
    },
    async close() { const exited = once(child, 'exit'); child.stdin.end(); assert.deepEqual(await exited, [0, null]); },
  };
}

for (const failure of ['network', 'json']) {
  test(`MCP survives ${failure} failure, retries one receipt key and returns a recovery ID`, { timeout: 10000 }, async t => {
    const requests: any[] = [];
    const url = await apiFor(t, (body, req, res) => {
      requests.push(body);
      if (failure === 'network') req.socket.destroy(); else res.end('not JSON');
    });
    const mcp = client(t, url);
    const response = await mcp.send('failed-write', 'tools/call', { name: 'rest', arguments: { data: { days: 1 } } });
    assert.equal(response.result.isError, true);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1], 'the automatic retry must reuse the exact command');
    assert.ok(requests[0].data.commandId);
    assert.ok(response.result.content[0].text.includes(requests[0].data.commandId));
    assert.match(response.result.content[0].text, /操作结果未确认/);
    assert.deepEqual(await mcp.send(0, 'ping'), { jsonrpc: '2.0', id: 0, result: {} });
    assert.equal(mcp.child.exitCode, null);
    await mcp.close();
  });
}

for (const lostResponses of [1, 2]) {
  test(`MCP lost ${lostResponses} response(s) after commit never repeats the calendar mutation`, { timeout: 10000 }, async t => {
    const store = new Store(openDb(':memory:'));
    t.after(() => store.db.close());
    const { player, accountId } = loginOrRegister(store, `mcp-retry-${lostResponses}`);
    const ctx: Context = { store, player, accountId, actor: 'agent', agentModel: null, push: () => {} };
    const day = player.day;
    const version = player.version;
    const requests: any[] = [];
    const url = await apiFor(t, (body, req, res) => {
      requests.push(body);
      assert.equal(req.headers.authorization, 'Bearer local-test');
      const data = dispatch(ctx, body.op, body.data);
      if (requests.length <= lostResponses) req.socket.destroy();
      else res.end(JSON.stringify({ ok: true, data }));
    });
    let mcp = client(t, url);
    const result = await mcp.send(1, 'tools/call', { name: 'rest', arguments: { data: { days: 1 } } });
    assert.equal(result.result.isError, lostResponses === 2);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
    assert.equal(store.getPlayer(player.id)!.day, day + 1);
    assert.equal(store.getPlayer(player.id)!.version, version + 1);
    const commandId = requests[0].data.commandId;
    assert.ok(store.receipt(player.id, commandId));
    await mcp.close();
    mcp = client(t, url);
    const resumed = await mcp.send('after-restart', 'tools/call', { name: 'rest', arguments: { data: { days: 1, commandId } } });
    assert.equal(resumed.result.isError, false);
    assert.equal(store.getPlayer(player.id)!.day, day + 1, 'manual retry after process restart reuses the persisted receipt');
    const next = await mcp.send(3, 'tools/call', { name: 'rest', arguments: { days: 1 } });
    assert.equal(next.result.isError, false, 'legacy flat arguments remain supported');
    assert.equal(store.getPlayer(player.id)!.day, day + 2, 'an intentional new action gets a new receipt');
    assert.notEqual(requests.at(-1).data.commandId, commandId);
    await mcp.close();
  });
}

test('MCP excludes WebSocket authentication, rejects bad IDs, and does not retry API rejections', { timeout: 10000 }, async t => {
  const requests: any[] = [];
  const url = await apiFor(t, (body, _req, res) => {
    requests.push(body);
    res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: '控制权由另一方持有', action: '先释放控制权' } }));
  });
  const mcp = client(t, url);
  const list = await mcp.send(1, 'tools/list');
  assert.ok(!list.result.tools.some((tool: { name: string }) => ['login', 'logout'].includes(tool.name)));
  for (const name of ['login', 'logout', 'state_changed']) {
    const result = await mcp.send(name, 'tools/call', { name });
    assert.equal(result.result.isError, true);
  }
  for (const commandId of ['', 2, null]) {
    const result = await mcp.send(String(commandId), 'tools/call', { name: 'rest', arguments: { data: { days: 1, commandId } } });
    assert.equal(result.result.isError, true);
  }
  assert.equal(requests.length, 0);
  const result = await mcp.send(2, 'tools/call', { name: 'rest', arguments: { data: { days: 1, commandId: 'explicit-id' } } });
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /FORBIDDEN/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].op, OP.REST);
  assert.equal(requests[0].data.commandId, 'explicit-id');
  await mcp.close();
});

 test('MCP ignores all notifications and survives invalid requests and parse errors', { timeout: 10000 }, async t => {
  const mcp = client(t, 'http://127.0.0.1:1');
  await mcp.send('before', 'ping');
  mcp.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'unknown/notification' }) + '\n');
  await mcp.send(0, 'ping');
  for (const [payload, code] of [['null', -32600], ['[]', -32600], ['{}', -32600], ['{', -32700]]) {
    const response = await mcp.raw(payload);
    assert.equal(response.id, null);
    assert.equal(response.error.code, code);
    await mcp.send('alive', 'ping');
  }
  await mcp.close();
});

test('MCP unauthorized guidance replaces WebSocket LOGIN instructions', { timeout: 10000 }, async t => {
  const url = await apiFor(t, (_body, _req, res) => {
    res.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: 'token expired', action: 'call LOGIN' } }));
  });
  const mcp = client(t, url);
  const response = await mcp.send('auth', 'tools/call', { name: 'get_state' });
  const text = response.result.content[0].text;
  assert.match(text, /UNAUTHORIZED.*token expired/);
  assert.match(text, /AGENT_TOKEN/);
  assert.match(text, /restart MCP/);
  assert.doesNotMatch(text, /LOGIN/);
  await mcp.close();
});
