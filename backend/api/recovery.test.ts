import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { CLASSES } from '../common/data/classes.ts';

function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'recovery');
  seedFullRoster(store, player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, actor: 'human', push: () => {} };
}

test('a stale worker snapshot cannot erase a committed lease or version', t => {
  const ctx = setup(t);
  const stale = ctx.store.getPlayer(ctx.player.id)!;
  dispatch(ctx, OP.CLAIM_CONTROL, { commandId: 'claim' });
  const committed = ctx.store.getPlayer(ctx.player.id)!;
  syncPlayer(ctx.store, stale);
  assert.equal(stale.version, committed.version);
  assert.deepEqual(ctx.store.getPlayer(stale.id)!.flags.controlLease, committed.flags.controlLease);
  assert.deepEqual(dispatch(ctx, OP.CLAIM_CONTROL, { commandId: 'claim' }), committed.flags.controlLease);
  assert.equal(ctx.store.getPlayer(stale.id)!.version, committed.version, 'replay must not apply the write twice');
});

test('stale command contexts reload before applying a distinct write', t => {
  const ctx = setup(t);
  const other = { ...ctx, player: ctx.store.getPlayer(ctx.player.id)! };
  const day = ctx.player.day;
  dispatch(ctx, OP.REST, { days: 1, commandId: 'first' });
  dispatch(other, OP.REST, { days: 1, commandId: 'second' });
  assert.equal(ctx.store.getPlayer(ctx.player.id)!.day, day + 2);
  assert.equal(other.player.version, ctx.player.version + 1);
});

test('selling selects the requested charge stack and rejects invalid counts without consuming inventory', t => {
  const ctx = setup(t);
  const full = ctx.store.inventory(ctx.player.id).find(row => row.item === 'vulnerary' && row.uses === 3)!.count;
  ctx.store.addInventory(ctx.player.id, 'vulnerary', 1, 2);
  dispatch(ctx, OP.SELL, { item: 'vulnerary', count: 1, uses: 1 });
  const inventory = ctx.store.inventory(ctx.player.id);
  assert.equal(inventory.find(row => row.item === 'vulnerary' && row.uses === 3)!.count, full);
  assert.equal(inventory.find(row => row.item === 'vulnerary' && row.uses === 1)!.count, 1);
  const gold = ctx.store.getPlayer(ctx.player.id)!.gold;
  for (const data of [{ count: -1 }, { count: 0 }, { count: 0.5 }, { uses: -1 }, { uses: 0.5 }, { uses: 99 }]) {
    assert.throws(() => dispatch(ctx, OP.SELL, { item: 'vulnerary', ...data }));
    assert.deepEqual(ctx.store.inventory(ctx.player.id), inventory);
    assert.equal(ctx.store.getPlayer(ctx.player.id)!.gold, gold);
  }
  dispatch(ctx, OP.SELL, { item: 'vulnerary' });
  assert.equal(ctx.store.inventory(ctx.player.id).find(row => row.item === 'vulnerary' && row.uses === 3)!.count, full - 1, 'omitting uses preserves the original inventory order');
});

test('experience allocation charges only the amount a unit can retain', t => {
  const ctx = setup(t);
  const unit = ctx.store.unit(ctx.player.id, 'u_owen')!;
  const max = CLASSES[unit.classId].maxLevel;
  unit.level = max - 1;
  unit.exp = 90;
  ctx.store.saveUnit(unit, ctx.player.id);
  const before = ctx.player.bexp;
  const result = dispatch(ctx, OP.ASSIGN_BEXP, { unitId: unit.id, amount: 100 }) as { amount: number; bexp: number; level: number };
  assert.deepEqual({ amount: result.amount, bexp: result.bexp, level: result.level }, { amount: 10, bexp: before - 10, level: max });
  assert.throws(() => dispatch(ctx, OP.ASSIGN_BEXP, { unitId: unit.id, amount: 100 }), /已满级/);
  assert.equal(ctx.store.getPlayer(ctx.player.id)!.bexp, before - 10);
});

test('HTTP and WebSocket derive control identity from credentials, including during annual events', { timeout: 20000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-auth-regression-'));
  const previous = { DB_PATH: process.env.DB_PATH, API_PORT: process.env.API_PORT };
  process.env.DB_PATH = join(dir, 'test.db');
  process.env.API_PORT = '0';
  const { app, store } = await import('./server.ts');
  for (const key of ['DB_PATH', 'API_PORT'] as const) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  t.after(async () => { await app.close(); store.db.close(); rmSync(dir, { recursive: true, force: true }); });
  if (!app.server.listening) await once(app.server, 'listening');
  const login = (await app.inject({ method: 'POST', url: '/api/login', payload: { name: 'identity-test' } })).json();
  const agent = (await app.inject({ method: 'GET', url: '/api/agent-token', headers: { authorization: `Bearer ${login.token}` } })).json();
  const call = async (token: string, op: number, data = {}) => (await app.inject({ method: 'POST', url: '/api/op', headers: { authorization: `Bearer ${token}` }, payload: { op, data } })).json();
  assert.equal((await call(login.token, OP.CLAIM_CONTROL)).data.owner, 'human');
  assert.equal((await call(agent.token, OP.REST, { days: 1 })).error.code, 'FORBIDDEN');
  assert.equal((await call(agent.token, OP.CLAIM_CONTROL)).error.code, 'FORBIDDEN');
  await call(agent.token, OP.GET_STATE);
  assert.ok(store.getPlayer(login.state.player.id)!.flags.agentLastSeen);

  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(socket, 'open');
  try {
    const send = async (op: number, data: Record<string, unknown>) => {
      const response = once(socket, 'message');
      socket.send(JSON.stringify({ op, seq: 1, data }));
      return JSON.parse((await response)[0].data);
    };
    assert.equal((await send(OP.LOGIN, { token: login.token, agentModel: 'spoofed-model' })).ok, true);
    assert.equal((await send(OP.CLAIM_CONTROL, {})).data.owner, 'human', 'self-reported model cannot change the actor');
    await call(login.token, OP.RELEASE_CONTROL);
    assert.equal((await send(OP.LOGIN, { token: agent.token })).ok, true);
    assert.equal((await send(OP.CLAIM_CONTROL, {})).data.owner, 'agent', 'agent token needs no model string');
    assert.equal((await call(login.token, OP.REST, { days: 1 })).error.code, 'FORBIDDEN');
    assert.equal((await send(OP.RELEASE_CONTROL, {})).ok, true);
  } finally {
    const closed = once(socket, 'close');
    socket.close();
    await closed;
  }
  const player = store.getPlayer(login.state.player.id)!;
  seedFullRoster(store, player);
  assert.equal((await call(login.token, OP.REGISTER_ANNUAL)).ok, true);
  assert.equal((await call(login.token, OP.CLAIM_CONTROL)).data.owner, 'human');
  assert.equal((await call(login.token, OP.RELEASE_CONTROL)).ok, true);
  assert.equal((await call(agent.token, OP.CLAIM_CONTROL)).data.owner, 'agent');
  assert.equal((await call(agent.token, OP.RELEASE_CONTROL)).ok, true);
  assert.ok(store.activeAnnualEntry(player.id), 'control changes do not alter the tournament');
});
