import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnyRequest, Event, Operation, PlayerState } from '../../backend/common/protocol/v2.ts';
import { sampleBattle, sampleExecute, sampleGetState, sampleQuote, sampleRun, sampleState } from '../../backend/common/protocol/v2.examples.ts';
import { GameClient } from '../src/game/client.ts';
import { GameStore } from '../src/game/store.ts';
import { MemoryJournal, StorageJournal } from '../src/game/journal.ts';
import { GameFlows } from '../src/game/flows.ts';
import { TransportError } from '../src/game/errors.ts';
import type { Transport } from '../src/game/transport.ts';
import { decodeResponse, HttpTransport } from '../src/game/transport.ts';
import { QueryResource } from '../src/game/resource.ts';
import { compareCursors } from '../src/game/store.ts';
import { decodePush, EventSynchronizer, GameConnection } from '../src/game/sync.ts';
import type { SocketLike } from '../src/game/sync.ts';
import { createGameRuntime } from '../src/game/runtime.ts';

const operations: Operation[] = ['GET_CAPABILITIES', 'GET_STATE', 'GET_COMMAND_STATUS', 'GET_EVENTS',
  'GET_BATTLE', 'GET_ACTIVE_RUN', 'PREVIEW_ACTION', 'EXECUTE_ACTION', 'END_PHASE', 'WITHDRAW_RUN', 'CLAIM_LEGACY'];
function reply(request: AnyRequest, data: unknown, version = 18) {
  return { protocolVersion: 2, op: request.op, seq: request.seq, ok: true, playerVersion: version, data };
}
function harness(handler?: (request: AnyRequest) => unknown | Promise<unknown>) {
  const calls: AnyRequest[] = [];
  let current: PlayerState = structuredClone(sampleState);
  const transport: Transport = {
    mode: 'mock',
    async send(request) {
      calls.push(structuredClone(request));
      if (request.op === 'GET_CAPABILITIES') return reply(request, { protocolVersion: 2, operations, features: {} });
      if (request.op === 'GET_STATE') return reply(request, current, current.playerVersion);
      if (request.op === 'GET_ACTIVE_RUN') return reply(request, current.activeRun, current.playerVersion);
      if (request.op === 'GET_BATTLE') return reply(request, sampleBattle, current.playerVersion);
      if (handler) return handler(request);
      throw new Error(`Unexpected operation: ${request.op}`);
    },
  };
  const client = new GameClient({ transport, journal: new MemoryJournal(), createId: () => 'command-one' });
  return { client, calls, transport, setState(value: PlayerState) { current = value; } };
}

test('a committed command with a lost response recovers its receipt without a second write', async () => {
  let writes = 0;
  let saved: unknown;
  const h = harness(request => {
    if (request.op === 'EXECUTE_ACTION') {
      writes++;
      saved = reply(request, { value: { runId: null, entityId: null }, state: { ...sampleState, playerVersion: 19 }, events: [] }, 19);
      throw new TransportError('network', 'Response lost after commit');
    }
    if (request.op === 'GET_COMMAND_STATUS') return reply(request, { state: 'committed', response: saved }, 19);
    throw new Error('Unexpected request');
  });
  await h.client.initialize();
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }));
  assert.equal(h.client.store.getSnapshot().pending?.status, 'uncertain');
  await h.client.resumePending();
  assert.equal(writes, 1);
  assert.equal(h.client.store.getSnapshot().player?.playerVersion, 19);
  assert.equal(h.client.store.getSnapshot().pending, null);
});

test('an unknown receipt resends the original command ID and original expected version', async () => {
  let writes = 0;
  const h = harness(request => {
    if (request.op === 'GET_COMMAND_STATUS') return reply(request, { state: 'unknown', response: null });
    if (request.op === 'EXECUTE_ACTION') {
      writes++;
      if (writes === 1) throw new TransportError('network', 'Not delivered');
      return reply(request, { value: { runId: null, entityId: null }, state: { ...sampleState, playerVersion: 19 }, events: [] }, 19);
    }
    throw new Error('Unexpected request');
  });
  await h.client.initialize();
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }));
  await h.client.resumePending();
  const requests = h.calls.filter(request => request.op === 'EXECUTE_ACTION');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].commandId, requests[1].commandId);
  assert.equal(requests[0].expectedPlayerVersion, requests[1].expectedPlayerVersion);
  assert.notEqual(requests[0].seq, requests[1].seq);
});

test('pending intent must be saved before the transport may send a write', async () => {
  const h = harness();
  const journal = new MemoryJournal();
  journal.write = () => { throw new Error('Storage quota exceeded'); };
  const client = new GameClient({ transport: h.transport, journal });
  await client.initialize();
  await assert.rejects(client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }), /journal|persist|storage/i);
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 0);
});

test('a delayed older player state cannot restore a dead unit or the previous active run', () => {
  const store = new GameStore();
  store.applyPlayer({ ...sampleState, playerVersion: 20, activeRun: null });
  store.applyPlayer({ ...sampleState, playerVersion: 19, activeRun: sampleRun });
  assert.equal(store.getSnapshot().player?.playerVersion, 20);
  assert.equal(store.getSnapshot().run, null);
  store.applyBattle(sampleBattle);
  assert.equal(store.getSnapshot().battle, null);
});

test('a stale action quote requires a new preview rather than executing at a newer version', async () => {
  const h = harness();
  await h.client.initialize();
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 19 });
  const flows = new GameFlows(h.client);
  await assert.rejects(flows.executeQuote(sampleQuote), /quote|version/i);
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 0);
});

test('observer exceptions cannot turn a committed command into a retryable write', async () => {
  const h = harness(request => reply(request, {
    value: { runId: null, entityId: null }, state: { ...sampleState, playerVersion: 19 }, events: [],
  }, 19));
  await h.client.initialize();
  h.client.store.subscribe(() => { throw new Error('Broken rendering subscriber'); });
  await h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' });
  assert.equal(h.client.store.getSnapshot().pending, null);
  assert.equal(h.client.store.getSnapshot().player?.playerVersion, 19);
});

test('concurrent write attempts are rejected rather than queued as stale business decisions', async () => {
  let release!: (value: unknown) => void;
  let sent!: AnyRequest;
  const h = harness(request => {
    sent = request;
    return new Promise(resolve => { release = resolve; });
  });
  await h.client.initialize();
  const first = h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' });
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-two' }), /pending/i);
  release(reply(sent, { value: { runId: null, entityId: null }, state: { ...sampleState, playerVersion: 19 }, events: [] }, 19));
  await first;
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 1);
});

test('a definitive business rejection clears pending intent without an automatic retry', async () => {
  const h = harness(request => ({ protocolVersion: 2, op: request.op, seq: request.seq, ok: false,
    playerVersion: 18, error: { code: 'INSUFFICIENT_RESOURCE', message: 'Not enough gold', retry: 'none', details: null } }));
  await h.client.initialize();
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }), /gold/);
  assert.equal(h.client.store.getSnapshot().pending, null);
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 1);
});

test('a malformed write response preserves uncertainty and blocks a second intent', async () => {
  const h = harness(request => ({ ...reply(request, {}), seq: request.seq + 1 }));
  await h.client.initialize();
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }), /envelope/);
  assert.equal(h.client.store.getSnapshot().pending?.status, 'uncertain');
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-two' }), /pending/i);
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 1);
});

test('a new client restores a saved intent and an older receipt cannot regress the refreshed profile', async () => {
  const journal = new MemoryJournal();
  let receipt: unknown;
  let writes = 0;
  const h = harness(request => {
    if (request.op === 'GET_COMMAND_STATUS') return reply(request, { state: 'committed', response: receipt }, 20);
    if (request.op === 'EXECUTE_ACTION') {
      writes++;
      receipt = reply(request, { value: { runId: null, entityId: null }, state: { ...sampleState, playerVersion: 19 }, events: [] }, 19);
      throw new TransportError('network', 'Lost response');
    }
    throw new Error('Unexpected operation');
  });
  const first = new GameClient({ transport: h.transport, journal, createId: () => 'saved-command' });
  await first.initialize();
  await assert.rejects(first.command('EXECUTE_ACTION', { quoteId: 'quote-one' }));
  first.dispose();
  h.setState({ ...sampleState, playerVersion: 20 });
  const second = new GameClient({ transport: h.transport, journal, createId: () => { throw new Error('Must not create another command'); } });
  await second.initialize();
  assert.equal(second.store.getSnapshot().pending?.commandId, 'saved-command');
  await second.resumePending();
  assert.equal(second.store.getSnapshot().player?.playerVersion, 20);
  assert.equal(second.store.getSnapshot().pending, null);
  assert.equal(writes, 1);
});

test('journal records are isolated by backend and player, and corruption is not silently discarded', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key,value); }, removeItem: (key: string) => { data.delete(key); } };
  const journal = new StorageJournal(storage);
  journal.write('backend-a:player-one', { request: sampleExecute });
  assert.equal(journal.read('backend-a:player-one')?.request.commandId, sampleExecute.commandId);
  assert.equal(journal.read('backend-b:player-one'), null);
  assert.equal(journal.read('backend-a:player-two'), null);
  const key = [...data.keys()][0];
  data.set(key, '{damaged');
  assert.throws(() => journal.read('backend-a:player-one'), /journal/i);
  assert.equal(data.get(key), '{damaged');
});

test('HTTP transport routes reads and writes separately and includes session cookies', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = new HttpTransport({ baseUrl: 'https://example.test/', fetch: async (url, init) => {
    calls.push({ url: String(url), init: init! });
    const request = JSON.parse(String(init!.body)) as AnyRequest;
    return new Response(JSON.stringify(reply(request, {})), { status: 200 });
  } });
  await transport.send(sampleGetState);
  await transport.send(sampleExecute);
  assert.deepEqual(calls.map(call => call.url), ['https://example.test/api/v2/query', 'https://example.test/api/v2/commands']);
  assert(calls.every(call => call.init.credentials === 'include'));
  assert.equal(JSON.parse(String(calls[1].init.body)).commandId, sampleExecute.commandId);
});

test('a timed-out HTTP write is not automatically sent again', async () => {
  let attempts = 0;
  const transport = new HttpTransport({ baseUrl: '', timeoutMs: 5, fetch: async (_url, init) => {
    attempts++;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  } });
  await assert.rejects(transport.send(sampleExecute), (error: unknown) => error instanceof TransportError && error.kind === 'timeout');
  assert.equal(attempts, 1);
});

test('HTTP cancellation removes the active request and disposal prevents future requests', async () => {
  let attempts = 0;
  const transport = new HttpTransport({ baseUrl: '', fetch: async (_url, init) => {
    attempts++;
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  } });
  const request = transport.send(sampleGetState);
  transport.dispose();
  await assert.rejects(request, (error: unknown) => error instanceof TransportError && error.kind === 'aborted');
  await assert.rejects(transport.send(sampleGetState));
  assert.equal(attempts, 1);
});

test('structured non-2xx API errors are preserved and non-JSON proxy failures are rejected', async () => {
  const transport = new HttpTransport({ baseUrl: '', fetch: async () => new Response(JSON.stringify({
    protocolVersion: 2, op: 'GET_STATE', seq: 1, ok: false, playerVersion: null,
    error: { code: 'AUTH_REQUIRED', message: 'Sign in', retry: 'none', details: null },
  }), { status: 401 }) });
  const response = decodeResponse(await transport.send(sampleGetState), 'GET_STATE', 1);
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.error.code, 'AUTH_REQUIRED');
  const broken = new HttpTransport({ baseUrl: '', fetch: async () => new Response('<html>Proxy down</html>', { status: 502 }) });
  await assert.rejects(broken.send(sampleGetState), /non-JSON/);
});

test('a query resource discards out-of-order results when the selected unit changes', async () => {
  const pending = new Map<string, { request: AnyRequest; resolve: (value: unknown) => void }>();
  const h = harness(request => {
    if (request.op !== 'GET_UNIT') throw new Error('Unexpected request');
    return new Promise(resolve => { pending.set(request.data.unitId, { request, resolve }); });
  });
  await h.client.initialize();
  const resource = new QueryResource(h.client, 'GET_UNIT');
  const first = resource.load({ unitId: 'first' });
  const second = resource.load({ unitId: 'second' });
  const selected = pending.get('second')!;
  selected.resolve(reply(selected.request, { id: 'second' }));
  await second;
  const stale = pending.get('first')!;
  stale.resolve(reply(stale.request, { id: 'first' }));
  await first;
  assert.equal(resource.getSnapshot().data?.id, 'second');
  resource.dispose();
});

function event(cursor: string): Event {
  return { cursor, type: 'STATE_CHANGED', entityId: 'player-demo-01', playerVersion: 19, battleVersion: null, payload: null };
}

test('event synchronization handles paging, duplicate pushes and authoritative state refresh', async () => {
  const h = harness(async request => {
    if (request.op !== 'GET_EVENTS') throw new Error('Unexpected request');
    await Promise.resolve();
    h.setState({ ...sampleState, playerVersion: 19, lastEventCursor: '319' });
    if (request.data.after === '317') return reply(request, { items: [event('318')], nextCursor: '318', resyncRequired: false }, 19);
    if (request.data.after === '318') return reply(request, { items: [event('318'), event('319')], nextCursor: null, resyncRequired: false }, 19);
    return reply(request, { items: [], nextCursor: null, resyncRequired: false }, 19);
  });
  await h.client.initialize();
  const sync = new EventSynchronizer(h.client);
  const push = { protocolVersion: 2, type: 'EVENTS_AVAILABLE', latestCursor: '319', playerVersion: 19 } as const;
  await Promise.all([sync.notify(push), sync.notify(push)]);
  assert.deepEqual(h.client.store.getSnapshot().recentEvents.map(event => event.cursor), ['318','319']);
  assert.equal(h.client.store.getSnapshot().player?.playerVersion, 19);
  const count = h.calls.length;
  await sync.notify(push);
  assert.equal(h.calls.length, count);
  sync.dispose();
});

test('an expired event cursor triggers a full refresh instead of replaying old deltas', async () => {
  const h = harness(request => {
    if (request.op !== 'GET_EVENTS') throw new Error('Unexpected request');
    h.setState({ ...sampleState, playerVersion: 40, lastEventCursor: '400' });
    return reply(request, { items: [], nextCursor: null, resyncRequired: true }, 40);
  });
  await h.client.initialize();
  const sync = new EventSynchronizer(h.client);
  await sync.notify();
  assert.equal(h.client.store.getSnapshot().eventCursor, '400');
  assert.equal(h.client.store.getSnapshot().player?.playerVersion, 40);
  sync.dispose();
});

test('event cursors retain precision and incoming events are ordered and deduplicated', () => {
  assert.equal(compareCursors('9007199254740993', '9007199254740992'), 1);
  const store = new GameStore();
  store.appendEvents([event('319'), event('318'), event('319')]);
  assert.deepEqual(store.getSnapshot().recentEvents.map(event => event.cursor), ['318','319']);
  assert.equal(decodePush({ protocolVersion: 2, type: 'EVENTS_AVAILABLE', latestCursor: 'broken', playerVersion: 1 }), null);
  assert.equal(decodePush({ protocolVersion: 1, type: 'EVENTS_AVAILABLE', latestCursor: '319', playerVersion: 1 }), null);
});

test('the mock dungeon carries damage, poison and death across a continued map', async () => {
  const runtime = createGameRuntime({ mode: 'mock', scenario: 'dungeon' });
  await runtime.start();
  assert.equal(runtime.store.getSnapshot().run?.recovery, 'none');
  const quote = await runtime.flows.previewContinue();
  await runtime.flows.executeQuote(quote);
  assert.throws(() => runtime.flows.deploy([{ unitId: 'unit-demo-02', position: [0,0], equippedItemId: null }]), /dead|roster/);
  await runtime.flows.deploy([{ unitId: 'unit-demo-01', position: [0,0], equippedItemId: 'item-demo-01' }]);
  const battle = runtime.store.getSnapshot().battle!;
  assert.equal(battle.units[0].hp, 17);
  assert.equal(battle.units[0].statuses[0].id, 'poison');
  assert.equal(battle.units[0].inventory[0].durability?.current, 31);
  assert.equal(runtime.store.getSnapshot().player?.calendar.day, 128);
  await runtime.flows.withdraw();
  assert.equal(runtime.store.getSnapshot().run, null);
  assert.equal((await runtime.client.query('GET_UNIT', { unitId: 'unit-demo-02' })).status, 'dead');
  assert.equal(runtime.store.getSnapshot().player?.gold, 1200);
  runtime.dispose();
});

test('disabled mock combat and refinement do not pretend to be implemented backend features', async () => {
  const runtime = createGameRuntime({ mode: 'mock', scenario: 'battle' });
  await runtime.start();
  assert.equal(runtime.client.supports('UNIT_ACT'), false);
  await assert.rejects(runtime.client.command('UNIT_ACT', { battleId: 'battle-demo-01', action: { unitId: 'combat-unit-01', moveTo: [1,1], kind: 'wait' } }), /not enabled/);
  await assert.rejects(runtime.client.command('START_REFINEMENT', { challengeId: 'challenge-one' }), /not enabled/);
  assert.equal(runtime.store.getSnapshot().pending, null);
  runtime.dispose();
});

test('connection start-stop-start tolerates effect cleanup while initialization is still pending', async () => {
  const h = harness(request => reply(request, { items: [], nextCursor: null, resyncRequired: false }));
  const client = new GameClient({ transport: { ...h.transport, mode: 'http' } });
  const sockets: SocketLike[] = [];
  const connection = new GameConnection({ client, socketUrl: 'ws://example.test/api/v2/ws', pollMs: 60_000,
    createSocket: () => {
      const socket: SocketLike = { onopen: null, onmessage: null, onclose: null, onerror: null, close() { socket.onclose?.(); } };
      sockets.push(socket);
      return socket;
    },
  });
  try {
    const first = connection.start();
    connection.stop();
    const second = connection.start();
    await Promise.all([first, second]);
    assert.equal(sockets.length, 1);
    sockets[0].onopen?.();
    assert.equal(client.store.getSnapshot().connection, 'live');
  } finally { connection.stop(); client.dispose(); }
});

test('the external store keeps stable immutable snapshots until an actual update', () => {
  const store = new GameStore();
  store.applyPlayer(sampleState);
  const first = store.getSnapshot();
  assert.equal(first, store.getSnapshot());
  assert(Object.isFrozen(first.player?.calendar));
  assert.throws(() => { first.player!.calendar.day = 999; }, TypeError);
  assert.equal(sampleState.calendar.day, 120);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  store.update({ connection: 'mock' });
  unsubscribe();
  store.update({ connection: 'offline' });
  assert.equal(notifications, 1);
});

test('ending a phase immediately blocks another player action until authoritative refresh', async () => {
  const run = { ...sampleRun, state: 'battle' as const, battleId: sampleBattle.id };
  const h = harness(request => reply(request, {
    value: { battleId: sampleBattle.id, processing: true },
    state: { ...sampleState, playerVersion: 19, activeRun: run }, events: [],
  }, 19));
  h.setState({ ...sampleState, activeRun: run });
  await h.client.initialize();
  const flows = new GameFlows(h.client);
  await flows.endPhase();
  assert.equal(h.client.store.getSnapshot().battle?.processing, true);
  assert.throws(() => flows.endPhase(), /player phase/i);
  assert.equal(h.calls.filter(request => request.op === 'END_PHASE').length, 1);
});

test('page resources invalidate and reload when a committed player version changes', async () => {
  let reads = 0;
  const h = harness(request => {
    reads++;
    return reply(request, { id: 'selected', status: reads === 1 ? 'active' : 'dead' }, reads === 1 ? 18 : 19);
  });
  await h.client.initialize();
  const resource = new QueryResource(h.client, 'GET_UNIT');
  await resource.load({ unitId: 'selected' });
  assert.equal(resource.getSnapshot().data?.status, 'active');
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 19 });
  assert.equal(resource.getSnapshot().data, null);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(resource.getSnapshot().data?.status, 'dead');
  resource.dispose();
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 20 });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(reads, 2);
});

test('expired or blocked quotes cannot submit a write', async () => {
  const h = harness();
  await h.client.initialize();
  const flows = new GameFlows(h.client, () => 1000);
  await assert.rejects(flows.executeQuote({ ...sampleQuote, expiresAt: new Date(999).toISOString() }), /expired/i);
  await assert.rejects(flows.executeQuote({ ...sampleQuote, blockers: [{ code: 'LIFESPAN_CROSSING', message: 'Resolve lifespan first', entityId: null }] }), /lifespan/i);
  assert.equal(h.calls.filter(request => request.op === 'EXECUTE_ACTION').length, 0);
});

test('losing the session after a command rejection disables further writes until initialization', async () => {
  const h = harness(request => ({ protocolVersion: 2, op: request.op, seq: request.seq, ok: false,
    playerVersion: null, error: { code: 'AUTH_REQUIRED', message: 'Sign in again', retry: 'none', details: null } }));
  await h.client.initialize();
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-one' }), /Sign in/);
  assert.equal(h.client.store.getSnapshot().status, 'error');
  assert.equal(h.client.store.getSnapshot().pending, null);
  await assert.rejects(h.client.command('EXECUTE_ACTION', { quoteId: 'quote-two' }), /Initialize/);
});

test('a legacy preview cannot be silently reused after another mutation', async () => {
  const h = harness();
  await h.client.initialize();
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 19 });
  const flows = new GameFlows(h.client);
  await assert.rejects(flows.claimLegacy({ data: {
    legacyId: 'legacy-one', recipientUnitId: 'unit-one', mode: 'stats', sourceLevel: 15, sourceTotal: 200,
    targetTotal: 180, truncated: 20, caps: sampleBattle.units[0].stats, resultingPersonalGrowth: sampleBattle.units[0].stats,
    floorByLevel: [], cost: { days: 0, gold: 0, materials: [] }, blockers: [],
  }, playerVersion: 18 }, 'inheritance-stone', null), /version/i);
  assert.equal(h.calls.filter(request => request.op === 'CLAIM_LEGACY').length, 0);
});

test('disposing the runtime clears player data and disposes page resources', async () => {
  const runtime = createGameRuntime({ mode: 'mock' });
  await runtime.start();
  const roster = runtime.resource('GET_ROSTER');
  await roster.load({ status: 'active', cursor: null });
  assert.equal(roster.getSnapshot().data?.items.length, 3);
  assert(Object.isFrozen(roster.getSnapshot().data?.items));
  runtime.dispose();
  assert.equal(runtime.store.getSnapshot().player, null);
  assert.equal(runtime.store.getSnapshot().battle, null);
  assert.equal(runtime.store.getSnapshot().capabilities, null);
  assert.equal(runtime.store.getSnapshot().status, 'disposed');
  await assert.rejects(runtime.client.query('GET_STATE', {}), /disposed/);
});

test('a stalled event page is rejected instead of causing an endless request loop', async () => {
  const h = harness(request => {
    if (request.op !== 'GET_EVENTS') throw new Error('Unexpected request');
    return reply(request, { items: [], nextCursor: request.data.after, resyncRequired: false });
  });
  await h.client.initialize();
  const sync = new EventSynchronizer(h.client);
  await assert.rejects(sync.notify(), /did not advance/);
  assert.equal(h.calls.filter(request => request.op === 'GET_EVENTS').length, 1);
  assert.equal(h.client.store.getSnapshot().connection, 'offline');
  sync.dispose();
});

test('an older battle response cannot restore the live view after a newer player commit', async () => {
  const run = { ...sampleRun, state: 'battle' as const, battleId: sampleBattle.id };
  const h = harness();
  h.setState({ ...sampleState, activeRun: run });
  await h.client.initialize();
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 20, activeRun: { ...run, battleId: null } });
  h.client.store.applyPlayer({ ...sampleState, playerVersion: 21, activeRun: run });
  assert.equal(h.client.store.getSnapshot().battle, null);
  await h.client.query('GET_BATTLE', { battleId: sampleBattle.id });
  assert.equal(h.client.store.getSnapshot().battle, null);
});
