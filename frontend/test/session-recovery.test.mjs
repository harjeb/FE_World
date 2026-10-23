import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { beforeEach, after } from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { session } = await import('../src/api/session.ts');
const { setToken } = await import('../src/api/client.ts');
const { OP } = await import('../../backend/common/protocol/ops.ts');
const originalFetch = globalThis.fetch;
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.window = { location: { hash: '#/prep' } };
let state, requests, handlers;
const response = data => Response.json({ ok: true, data });
const failure = (message, code = 'INTERNAL') => Response.json({ ok: false, error: { code, message, action: '重试' } });
beforeEach(() => {
  session.logout();
  setToken('test-session');
  window.location.hash = '#/prep';
  state = { version: 0, day: 0, gold: 1000, units: [{ id: 'unit' }], features: { arena: true, dungeon: true, annual: true, story: true, quests: true, workshop: true, legacy: true } };
  requests = [];
  handlers = new Map();
  globalThis.fetch = async (_url, options) => {
    const { op, data } = JSON.parse(options.body);
    requests.push({ op, data });
    if (handlers.has(op)) return handlers.get(op)(data);
    if (op === OP.GET_STATE) return response(state);
    if (op === OP.GET_RUN) return response({ run: null });
    if (op === OP.BUY) { state = { ...state, version: state.version + 1, gold: state.gold - 300 }; return response({ price: 300 }); }
    return response({ day: state.day });
  };
});
after(() => { session.logout(); globalThis.fetch = originalFetch; });

test('confirmed purchase remains successful when refreshing fails; retry only reads', async () => {
  await session.refresh();
  handlers.set(OP.BUY, () => {
    state = { ...state, version: 1, gold: 700 };
    handlers.set(OP.GET_STATE, () => failure('暂时断线'));
    return response({ price: 300 });
  });
  assert.deepEqual(await session.run(OP.BUY, { item: 'vulnerary' }), { price: 300 });
  assert.match(session.get().error, /操作已提交.*不要重复提交/);
  assert.equal(session.get().state.gold, 1000, 'keep the last readable snapshot until reconnection');
  handlers.delete(OP.GET_STATE);
  await session.refresh();
  assert.equal(session.get().state.gold, 700);
  assert.equal(session.get().error, null);
  assert.equal(requests.filter(r => r.op === OP.BUY).length, 1);
});

test('server rejects a write without reporting success or refreshing', async () => {
  await session.refresh();
  requests.length = 0;
  handlers.set(OP.BUY, () => failure('金币不足', 'NOT_ENOUGH_GOLD'));
  await assert.rejects(session.run(OP.BUY, { item: 'vulnerary' }), /金币不足/);
  assert.deepEqual(requests.map(r => r.op), [OP.BUY]);
});

test('a purchase refreshes resources once without reloading unrelated views or duplicate roster', async () => {
  window.location.hash = '#/camp';
  await session.refresh();
  requests.length = 0;
  await session.run(OP.BUY, { item: 'vulnerary' });
  assert.deepEqual(requests.map(r => r.op), [OP.BUY, OP.GET_STATE]);
  assert.equal(session.get().state.gold, 700);
  assert.deepEqual(session.get().roster, state.units);
});

test('page-specific information loads when opened and stays current once loaded', async () => {
  await session.refresh();
  assert.ok(!requests.some(r => r.op === OP.GET_QUESTS));
  window.location.hash = '#/quests';
  await session.loadPage('quests');
  assert.ok(requests.some(r => r.op === OP.GET_QUESTS));
  requests.length = 0;
  await session.loadPage('quests');
  assert.equal(requests.length, 0, 'already-current page does not request again');
  window.location.hash = '#/prep';
  state = { ...state, version: 2, day: 1 };
  await session.refresh();
  assert.equal(session.get().quests.day, 1, 'loaded badges cannot retain the old day');
});

test('locked features do not trigger module requests', async () => {
  window.location.hash = '#/camp';
  state.features = Object.fromEntries(Object.keys(state.features).map(key => [key, false]));
  await session.refresh();
  assert.deepEqual(requests.map(r => r.op), [OP.GET_STATE, OP.GET_TODAY]);
});

test('an external calendar change overrides the resource-only refresh shortcut', async () => {
  await session.refresh();
  requests.length = 0;
  state = { ...state, day: 5, version: 1 };
  await session.run(OP.BUY, { item: 'vulnerary' });
  assert.ok(requests.some(r => r.op === OP.GET_TODAY));
  assert.equal(session.get().today.day, 5);
});

test('a failed optional read preserves its previous view and exposes the error', async () => {
  window.location.hash = '#/quests';
  await session.refresh();
  const quests = session.get().quests;
  state = { ...state, version: 1, gold: 700 };
  handlers.set(OP.GET_QUESTS, () => failure('任务暂不可用'));
  await assert.rejects(session.refresh(), /任务暂不可用/);
  assert.equal(session.get().state.gold, 700);
  assert.equal(session.get().quests, quests);
  assert.equal(session.get().ready, true);
  assert.match(session.get().error, /任务暂不可用/);
});

test('a response arriving after logout cannot restore the account', async () => {
  let release;
  handlers.set(OP.GET_STATE, () => new Promise(resolve => { release = () => resolve(response(state)); }));
  const pending = session.refresh();
  session.logout();
  release();
  await pending;
  assert.equal(session.get().ready, false);
  assert.equal(session.get().state, null);
});

test('an older refresh cannot overwrite a newer snapshot', async () => {
  let release;
  const old = structuredClone(state);
  handlers.set(OP.GET_STATE, () => new Promise(resolve => { release = () => resolve(response(old)); }));
  const pending = session.refresh();
  handlers.delete(OP.GET_STATE);
  state = { ...state, version: 1, gold: 700 };
  await session.refresh();
  release();
  await pending;
  assert.equal(session.get().state.gold, 700);
});

for (const op of [OP.BUY, OP.ARENA_ATTACK]) {
  test(`late write ${op} cannot modify a replacement session or copy its battle`, async () => {
    await session.refresh();
    let release;
    handlers.set(op, () => new Promise(resolve => { release = () => resolve(response({ battleId: 'old-battle', state: { oldAccount: true } })); }));
    const pending = op === OP.BUY ? session.run(op) : session.arenaAttack('opponent', [], 'erin');
    session.logout();
    setToken('replacement-session');
    await session.refresh();
    const snapshot = session.get();
    const reads = requests.length;
    release();
    await pending;
    assert.equal(session.get(), snapshot);
    assert.equal(requests.length, reads);
    assert.deepEqual(session.get().battles, {});
  });
}

test('expired authentication clears old account data', async () => {
  await session.refresh();
  handlers.set(OP.GET_STATE, () => failure('过期', 'UNAUTHORIZED'));
  await assert.rejects(session.refresh(), /过期/);
  assert.equal(session.get().ready, false);
  assert.equal(session.get().state, null);
});

test('password change preserves spaces and clears credentials and cached state only on success', async () => {
  await session.refresh();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/password');
    assert.equal(options.headers.authorization, 'Bearer test-session');
    assert.deepEqual(JSON.parse(options.body), { currentPassword: ' old password ', newPassword: ' new password ' });
    return Response.json({ ok: true });
  };
  await session.changePassword(' old password ', ' new password ');
  assert.equal(storage.get('agent-tactics.token'), undefined);
  assert.equal(session.get().ready, false);
  assert.equal(session.get().state, null);
});

test('failed password change keeps the active session', async () => {
  await session.refresh();
  globalThis.fetch = async () => Response.json({ error: '当前密码错误' }, { status: 400 });
  await assert.rejects(session.changePassword('wrong-pass', 'new-password'), /当前密码错误/);
  assert.equal(session.get().ready, true);
  assert.equal(storage.get('agent-tactics.token'), 'test-session');
});

test('a revoked session cannot leave cached account state visible after a password attempt', async () => {
  await session.refresh();
  globalThis.fetch = async () => Response.json({ error: '未登录' }, { status: 401 });
  await assert.rejects(session.changePassword('old-password', 'new-password'), /未登录/);
  assert.equal(storage.get('agent-tactics.token'), undefined);
  assert.equal(session.get().ready, false);
  assert.equal(session.get().state, null);
});
