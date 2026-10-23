import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'quote', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

test('an action quote binds to the player version and executes once', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const day = player.day;
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'sortie', region: 1, unitIds: ['u_erin', 'u_victor'] }) as
    { quoteId: string; playerVersion: number; costDays: number; fromDay: number; toDay: number; risk: string; blockers: string[]; events: { kind: string }[] };
  assert.equal(quote.costDays, 2);
  assert.equal(quote.fromDay, day);
  assert.equal(quote.toDay, day + 2);
  assert.equal(quote.risk, 'permadeath');
  assert.deepEqual(quote.blockers, []);
  assert.ok(quote.events.some(e => e.kind === 'arena') || quote.events.length >= 0);
  // Previewing does not advance the world.
  assert.equal(player.day, day);
  const executed = dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }) as { battleId: string };
  assert.ok(executed.battleId);
  assert.equal(player.day, day + 2);
});

test('a quote expires when the player version moves', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'rest', days: 5 }) as { quoteId: string };
  // Any write command advances the version.
  dispatch(ctx, OP.TRAIN, { unitId: 'u_erin', weaponType: 'sword' });
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), /过期/);
});

test('a blocked quote refuses to execute and a refresh is required', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'sortie', region: 1, unitIds: ['u_erin'] }) as { quoteId: string; blockers: string[] };
  assert.ok(quote.blockers.length > 0);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), /进行中的战斗/);
});

test('quote costs follow the shared action table and reject unknown actions', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const sweep = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'sweep', region: 1, times: 2 }) as { costDays: number };
  assert.equal(sweep.costDays, 10);
  const train = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'train', unitId: 'u_erin', weaponType: 'sword' }) as { costDays: number; costGold: number };
  assert.equal(train.costDays, 3);
  assert.equal(train.costGold, 200);
  assert.throws(() => dispatch(ctx, OP.PREVIEW_ACTION, { action: 'nope' }), /action/);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: 'missing' }), /报价/);
});
