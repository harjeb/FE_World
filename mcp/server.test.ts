import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

for (const failure of ['network', 'json']) {
  test(`MCP survives ${failure} tool failure and answers ping with original IDs`, { timeout: 10000 }, async t => {
    let requests = 0;
    const api = createServer((req, res) => {
      requests++;
      if (failure === 'network') req.socket.destroy();
      else res.end('not JSON');
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    t.after(() => api.close());
    const address = api.address();
    assert.ok(address && typeof address !== 'string');
    const child = spawn(process.execPath, [new URL('./server.ts', import.meta.url).pathname], {
      env: { ...process.env, API_URL: `http://127.0.0.1:${address.port}`, AGENT_TOKEN: 'local-test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => child.kill());
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    const send = (id: string | number, method: string, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    send('failed-write', 'tools/call', { name: 'rest', arguments: { data: { days: 1 } } });
    const failed = await lines.next();
    assert.equal(failed.done, false);
    const response = JSON.parse(failed.value!);
    assert.equal(response.id, 'failed-write');
    assert.equal(response.result.isError, true);
    assert.equal(response.result.content[0].type, 'text');
    assert.ok(response.result.content[0].text.length > 0);
    send(0, 'ping');
    assert.deepEqual(JSON.parse((await lines.next()).value!), { jsonrpc: '2.0', id: 0, result: {} });
    assert.equal(requests, 1, 'failed writes must not be retried');
    assert.equal(child.exitCode, null);
    const exited = once(child, 'exit');
    child.stdin.end();
    assert.deepEqual(await exited, [0, null]);
  });
}
