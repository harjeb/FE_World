import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';

function setup(t: { after: (fn: () => void) => void }): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { accountId, player } = loginOrRegister(store, 'parity', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player), actor: 'human', agentModel: null, push: () => {} };
}

function snapshot(ctx: Context) {
  return JSON.stringify({ player: ctx.player, stored: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) });
}

function damagedWeapon(ctx: Context) {
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  const row = unit.weaponInstances![0];
  row.durability = 1;
  ctx.store.saveUnit(unit, ctx.player.id);
  return { unitId: unit.id, item: row.id };
}

for (const owner of ['human', 'agent'] as const) {
  test(`repair rejects the opposite ${owner} control lease without mutation`, t => {
    const ctx = setup(t);
    const data = damagedWeapon(ctx);
    ctx.actor = owner === 'human' ? 'agent' : 'human';
    ctx.player.flags.agentLastSeen = Date.now();
    dispatch({ ...ctx, actor: owner }, OP.CLAIM_CONTROL, {});
    const before = snapshot(ctx);
    assert.throws(() => dispatch(ctx, OP.REPAIR_ITEM, data), /控制权/);
    assert.equal(snapshot(ctx), before);
  });
}

for (const lock of ['battle', 'annual']) {
  test(`repair rejects ${lock} lock without mutation`, t => {
    const ctx = setup(t);
    const data = damagedWeapon(ctx);
    if (lock === 'battle') dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
    else dispatch(ctx, OP.REGISTER_ANNUAL, {});
    const before = snapshot(ctx);
    assert.throws(() => dispatch(ctx, OP.REPAIR_ITEM, data), /战斗中的队员|大竞技场/);
    assert.equal(snapshot(ctx), before);
  });
}

test('repair charges once, advances once, replays its receipt and expires prior quotes', t => {
  const ctx = setup(t);
  const data = { ...damagedWeapon(ctx), commandId: 'repair-once' };
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'rest', days: 1 }) as { quoteId: string };
  const gold = ctx.player.gold;
  const version = ctx.player.version;
  const result = dispatch(ctx, OP.REPAIR_ITEM, data);
  assert.ok(ctx.player.gold < gold);
  assert.equal(ctx.player.version, version + 1);
  const after = snapshot(ctx);
  assert.deepEqual(dispatch(ctx, OP.REPAIR_ITEM, data), result);
  assert.equal(snapshot(ctx), after);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, quote), /过期/);
});

for (const quoted of [false, true]) {
  test(`${quoted ? 'quoted' : 'direct'} training charges and advances exactly once with replay`, t => {
    const ctx = setup(t);
    const train = { unitId: 'u_erin', weaponType: 'sword' };
    const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'train', ...train }) as { quoteId: string };
    const op = quoted ? OP.EXECUTE_ACTION : OP.TRAIN;
    const data = { ...(quoted ? { quoteId: quote.quoteId } : train), commandId: 'train-once' };
    const { gold, day, version } = ctx.player;
    const result = dispatch(ctx, op, data);
    assert.equal(ctx.player.gold, gold - 200);
    assert.equal(ctx.player.day, day + 3);
    assert.equal(ctx.player.version, version + 1);
    const after = snapshot(ctx);
    assert.deepEqual(dispatch(ctx, op, data), result);
    assert.equal(snapshot(ctx), after);
  });
}

test('train preview shows battle blocker and execution revalidates a blocker-free target', t => {
  const ctx = setup(t);
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
  const payload = { unitId: 'u_erin', weaponType: 'sword' };
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'train', ...payload }) as { quoteId: string; blockers: string[] };
  assert.ok(quote.blockers.some(message => message.includes('战斗中的队员')));
  // A persisted quote without blockers must still pass the current operation guards.
  ctx.store.saveQuote('unblocked', ctx.player.id, ctx.player.version, { op: OP.TRAIN, payload, blockers: [] });
  const before = snapshot(ctx);
  for (const [op, data] of [[OP.TRAIN, payload], [OP.EXECUTE_ACTION, { quoteId: 'unblocked' }]] as const) {
    assert.throws(() => dispatch(ctx, op, data), /战斗中的队员/);
    assert.equal(snapshot(ctx), before);
  }
});

for (const lock of ['human', 'agent', 'annual'] as const) {
  test(`direct and quoted training reject ${lock} lock without mutation`, t => {
    const ctx = setup(t);
    const payload = { unitId: 'u_victor', weaponType: 'sword' };
    if (lock === 'annual') dispatch(ctx, OP.REGISTER_ANNUAL, {});
    else {
      ctx.player.flags.agentLastSeen = Date.now();
      dispatch({ ...ctx, actor: lock }, OP.CLAIM_CONTROL, {});
      ctx.actor = lock === 'human' ? 'agent' : 'human';
    }
    ctx.store.saveQuote('unblocked', ctx.player.id, ctx.player.version, { op: OP.TRAIN, payload, blockers: [] });
    const before = snapshot(ctx);
    for (const [op, data] of [[OP.TRAIN, payload], [OP.EXECUTE_ACTION, { quoteId: 'unblocked' }]] as const) {
      assert.throws(() => dispatch(ctx, op, data), /控制权|大竞技场/);
      assert.equal(snapshot(ctx), before);
    }
  });
}

test('annual quoted action remains allowed and advances version once', t => {
  const ctx = setup(t);
  dispatch(ctx, OP.REGISTER_ANNUAL, {});
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'annual' }) as { quoteId: string; blockers: string[] };
  assert.deepEqual(quote.blockers, []);
  const version = ctx.player.version;
  assert.ok((dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }) as { battleId: string }).battleId);
  assert.equal(ctx.player.version, version + 1);
});

test('battle commands honor the requested battle instead of silently acting on the current one', t => {
  const ctx = setup(t);
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
  const before = snapshot(ctx);
  const battle = structuredClone(ctx.store.activeBattle(ctx.player.id));
  for (const op of [OP.END_PHASE, OP.RETREAT, OP.SURRENDER]) {
    assert.throws(() => dispatch(ctx, op, { battleId: 'missing-battle' }), /没有战斗/);
    assert.equal(snapshot(ctx), before);
    assert.deepEqual(ctx.store.activeBattle(ctx.player.id), battle);
  }
});

test('human agent-info reads heartbeat independently of optional model metadata', t => {
  const ctx = setup(t);
  dispatch({ ...ctx, actor: 'agent' }, OP.GET_AGENT_INFO, {});
  const info = dispatch(ctx, OP.GET_AGENT_INFO, {}) as { online: boolean; model: string | null };
  assert.equal(info.online, true);
  assert.equal(info.model, null);
  for (const lastSeen of [Date.now() - 5 * 60_000, undefined]) {
    ctx.player.flags.agentLastSeen = lastSeen;
    ctx.store.savePlayer(ctx.player);
    assert.equal((dispatch(ctx, OP.GET_AGENT_INFO, {}) as { online: boolean }).online, false);
  }
});
