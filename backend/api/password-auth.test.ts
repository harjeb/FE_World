import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changePassword, hashPassword, loginOrRegister, setAccountPassword, verifyPassword } from './auth.ts';
import { OP } from '../common/protocol/ops.ts';

let app: typeof import('./server.ts').app;
let store: typeof import('./server.ts').store;
const dir = mkdtempSync(join(tmpdir(), 'password-auth-'));
const dbPath = join(dir, 'test.db');
const password = 'test-password';
const headers = (token: string) => ({ authorization: `Bearer ${token}` });
const post = (url: string, payload: unknown, token?: string) => app.inject({ method: 'POST', url, payload, headers: token ? headers(token) : {} });
const register = async (name: string, secret = password) => (await post('/api/register', { name, password: secret })).json();
const op = (token: string) => post('/api/op', { op: OP.GET_STATE, data: {} }, token);
const cli = (...args: string[]) => spawnSync(process.execPath, [new URL('../../tools/set-password.ts', import.meta.url).pathname, ...args], { encoding: 'utf8', timeout: 15000 });

before(async () => {
  const previous = { DB_PATH: process.env.DB_PATH, API_PORT: process.env.API_PORT };
  process.env.DB_PATH = dbPath;
  process.env.API_PORT = '0';
  ({ app, store } = await import('./server.ts'));
  for (const key of ['DB_PATH', 'API_PORT'] as const) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  if (!app.server.listening) await once(app.server, 'listening');
});
after(async () => { await app?.close(); store?.db.close(); rmSync(dir, { recursive: true, force: true }); });

test('passwords use independent salts, preserve spaces and reject missing, excessive or malformed inputs', () => {
  const secret = '  密码 password  ';
  const first = hashPassword(secret), second = hashPassword(secret);
  assert.notEqual(first, second);
  assert.ok(!first.includes(secret));
  assert.equal(verifyPassword(secret, first), true);
  assert.equal(verifyPassword(secret.trim(), first), false);
  for (const invalid of [undefined, null, {}, 42, '', 'short', 'x'.repeat(129)]) {
    assert.throws(() => hashPassword(invalid as string), /8–128/);
  }
  for (const malformed of [null, '', 'salt:hash', `${first}:extra`, `${first.split(':')[0]}:bad`]) {
    assert.equal(verifyPassword(secret, malformed), false);
  }
  assert.equal(verifyPassword({ password: secret }, first), false);
  assert.equal(verifyPassword('x'.repeat(10000), first), false);
  assert.throws(() => loginOrRegister(store, 'missing-password', undefined as never), /8–128/);
  assert.equal(store.accountByName('missing-password'), null, 'failed registration is atomic');
});

test('HTTP registration and login require passwords and never silently create or reclaim an account', async () => {
  for (const invalid of [undefined, '', 'short', 12345678, {}, 'x'.repeat(129)]) {
    assert.equal((await post('/api/register', { name: 'bad-password', password: invalid })).statusCode, 400);
  }
  assert.equal(store.accountByName('bad-password'), null);
  assert.equal((await post('/api/login', { name: 'unknown-account', password })).statusCode, 400);
  assert.equal(store.accountByName('unknown-account'), null);
  assert.equal((await post('/api/register', { name: {}, password })).statusCode, 400);
  const registered = await register('  password-user  ', '  password with spaces  ');
  assert.ok(registered.token);
  assert.ok(store.accountByName('password-user')?.passwordHash);
  assert.equal((await post('/api/register', { name: 'password-user', password })).statusCode, 400);
  assert.equal((await post('/api/login', { name: 'password-user' })).statusCode, 400);
  assert.equal((await post('/api/login', { name: 'password-user', password: 'password with spaces' })).statusCode, 400);
  assert.equal((await post('/api/login', { name: 'password-user', password: '  password with spaces  ' })).statusCode, 200);
  assert.equal((await op(registered.token)).statusCode, 200);
});

test('legacy passwordless accounts and every old credential stay locked until local administrator initialization', async () => {
  const emptyId = store.createAccount('legacy-empty-password', '');
  assert.equal(store.resolveSession(store.createSession(emptyId)), null);
  assert.equal(store.resolveToken(store.createToken(emptyId, 'agent', 'empty password')), null);
  const accountId = store.createAccount('legacy-player', null);
  const player = store.createPlayer(accountId, 'legacy-player', '保留军团');
  const oldSession = store.createSession(accountId), oldAgent = store.createToken(accountId, 'agent', 'old');
  const oldWeb = store.createToken(accountId, 'web', 'old');
  const before = { player: store.getPlayer(player.id), units: store.units(player.id), inventory: store.inventory(player.id) };
  assert.throws(() => loginOrRegister(store, 'legacy-player', password), /管理员/);
  assert.equal((await post('/api/register', { name: 'legacy-player', password })).statusCode, 400);
  assert.match((await post('/api/login', { name: 'legacy-player', password })).json().error, /管理员/);
  for (const token of [oldSession, oldAgent, oldWeb]) {
    assert.equal((await op(token)).statusCode, 401);
    assert.equal((await post('/api/password', { currentPassword: password, newPassword: 'new-password' }, token)).statusCode, 401);
  }
  assert.equal(store.accountById(accountId)!.passwordHash, null, 'old tokens cannot claim a password');
  const result = cli('--db', dbPath, '--name', 'legacy-player');
  assert.equal(result.status, 0, result.stderr);
  const generated = JSON.parse(result.stdout);
  assert.equal(generated.name, 'legacy-player');
  assert.equal(generated.password.length, 24);
  assert.equal(verifyPassword(generated.password, store.accountById(accountId)!.passwordHash), true);
  assert.deepEqual({ player: store.getPlayer(player.id), units: store.units(player.id), inventory: store.inventory(player.id) }, before);
  for (const token of [oldSession, oldAgent, oldWeb]) assert.equal((await op(token)).statusCode, 401);
  assert.equal((await post('/api/login', { name: 'legacy-player', password: generated.password })).statusCode, 200);
});

test('changing a password verifies the old password, rejects agents and revokes HTTP plus already-open sockets', async () => {
  const user = await register('change-password');
  const other = await register('unrelated-player');
  const accountId = store.accountByName('change-password')!.id;
  const extraSession = store.createSession(accountId), agent = store.createToken(accountId, 'agent', 'Agent');
  const web = store.createToken(accountId, 'web', 'web');
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const sockets = [new WebSocket(`ws://127.0.0.1:${address.port}/ws`), new WebSocket(`ws://127.0.0.1:${address.port}/ws`)];
  const send = async (socket: WebSocket, op: number, data = {}) => {
    const received = once(socket, 'message');
    socket.send(JSON.stringify({ op, seq: 1, data }));
    return JSON.parse((await received)[0].data);
  };
  try {
    await Promise.all(sockets.map(socket => once(socket, 'open')));
    assert.equal((await send(sockets[0], OP.LOGIN, { token: user.token })).ok, true);
    assert.equal((await send(sockets[1], OP.LOGIN, { token: agent })).ok, true);
    assert.equal((await post('/api/password', { currentPassword: password, newPassword: 'changed-password' }, agent)).statusCode, 403);
    assert.equal((await post('/api/password', { currentPassword: 'wrong-password', newPassword: 'changed-password' }, user.token)).statusCode, 400);
    assert.equal((await post('/api/password', { currentPassword: password, newPassword: 'short' }, user.token)).statusCode, 400);
    assert.equal((await op(user.token)).statusCode, 200, 'a failed change does not revoke credentials');
    const player = store.getPlayer(user.state.player.id)!;
    player.flags.controlLease = { owner: 'human', expiresAt: Date.now() + 100000 };
    store.savePlayer(player);
    const before = store.getPlayer(player.id)!;
    const units = store.units(player.id), inventory = store.inventory(player.id);
    assert.deepEqual((await post('/api/password', { currentPassword: password, newPassword: 'changed-password' }, user.token)).json(), { ok: true });
    const after = store.getPlayer(player.id)!;
    assert.equal(after.flags.controlLease, undefined);
    delete before.flags.controlLease;
    before.version = after.version;
    assert.deepEqual(after, before, 'only transient control and its version change');
    assert.deepEqual(store.units(player.id), units);
    assert.deepEqual(store.inventory(player.id), inventory);
    for (const token of [user.token, extraSession, agent, web]) assert.equal((await op(token)).statusCode, 401);
    for (const socket of sockets) assert.equal((await send(socket, OP.GET_STATE)).error.code, 'UNAUTHORIZED');
    assert.equal((await op(other.token)).statusCode, 200);
    assert.equal((await post('/api/login', { name: 'change-password', password })).statusCode, 400);
    assert.equal((await post('/api/login', { name: 'change-password', password: 'changed-password' })).statusCode, 200);
  } finally {
    await Promise.all(sockets.map(async socket => { const closed = once(socket, 'close'); socket.close(); await closed; }));
  }
});

test('password-protected old accounts with short passwords can log in and upgrade without losing their save', async () => {
  const salt = randomBytes(16).toString('hex');
  const hash = `${salt}:${scryptSync('old', salt, 64).toString('hex')}`;
  const id = store.createAccount('short-old-password', hash);
  const player = store.createPlayer(id, 'short-old-password', '旧军团');
  const logged = await post('/api/login', { name: 'short-old-password', password: 'old' });
  assert.equal(logged.statusCode, 200);
  assert.equal(logged.json().state.player.id, player.id);
  assert.equal((await post('/api/password', { currentPassword: 'old', newPassword: password }, logged.json().token)).statusCode, 200);
});

test('password updates and revocation roll back together on a database failure', () => {
  const user = loginOrRegister(store, 'atomic-password', password);
  const agent = store.createToken(user.accountId, 'agent', 'keep on failure');
  const oldHash = store.accountById(user.accountId)!.passwordHash;
  store.db.exec("CREATE TEMP TRIGGER fail_password_reset BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'reset blocked'); END");
  try {
    assert.throws(() => changePassword(store, user.accountId, password, 'new-password'), /reset blocked/);
    assert.equal(store.accountById(user.accountId)!.passwordHash, oldHash);
    assert.equal(store.resolveSession(user.token), user.accountId);
    assert.equal(store.resolveToken(agent)?.accountId, user.accountId);
  } finally { store.db.exec('DROP TRIGGER fail_password_reset'); }
  assert.throws(() => setAccountPassword(store, 'nonexistent-account', password), /不存在/);
});

test('administrator reset never creates accounts/files or accepts plaintext password arguments', () => {
  for (const args of [[], ['--db', dbPath, '--name', 'not-an-account'], ['--db', dbPath, '--name', 'legacy-player', '--password', 'do-not-log'], ['--password=do-not-log']]) {
    const result = cli(...args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('do-not-log'), 'rejected password arguments never reach logs');
  }
  const missing = join(dir, 'missing.db');
  assert.notEqual(cli('--db', missing, '--name', 'legacy-player').status, 0);
  assert.equal(existsSync(missing), false);
});

test('password endpoints throttle the real peer, not spoofed forwarded headers', async () => {
  for (let i = 0; i < 61; i++) {
    const response = await app.inject({ method: 'POST', url: '/api/login', remoteAddress: '192.0.2.55',
      headers: { 'x-forwarded-for': `192.0.2.${i}` }, payload: { name: 'nonexistent-rate-account', password } });
    assert.equal(response.statusCode, i < 60 ? 400 : 429);
    if (i === 60) assert.equal(response.headers['retry-after'], '60');
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/login', remoteAddress: '192.0.2.56',
    payload: { name: 'password-user', password: '  password with spaces  ' } })).statusCode, 200);
});
