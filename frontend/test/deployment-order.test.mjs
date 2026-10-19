import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultOrder, normalizeOrder, loadDeploymentOrder, saveDeploymentOrder } from '../src/battle/deployment-order.ts';

test('saved priority removes stale, duplicate and invalid IDs, appending new available members', () => {
  const available = ['a', 'b', 'new', 'c'];
  assert.deepEqual(defaultOrder(['b', 'dead', 'b', null, 9, 'away', 'a'], available, 6), ['b', 'a', 'new', 'c']);
  for (const invalid of [null, {}, 'bad', 12]) assert.deepEqual(defaultOrder(invalid, available, 2), ['a', 'b']);
  assert.deepEqual(normalizeOrder(['c', 'b', 'a', 'c'], available, 2), ['c', 'b']);
  assert.deepEqual(normalizeOrder([], available, 6), []);
  assert.equal(defaultOrder([], Array.from({ length: 12 }, (_, i) => String(i)), 10).length, 6);
});

test('storage handles malformed JSON and isolates accounts, including shared roster IDs', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  try {
    saveDeploymentOrder('one', ['b', 'a']);
    assert.deepEqual(defaultOrder(loadDeploymentOrder('one'), ['a', 'b', 'new'], 6), ['b', 'a', 'new']);
    assert.deepEqual(defaultOrder(loadDeploymentOrder('two'), ['a', 'b'], 6), ['a', 'b']);
    values.set('agent-tactics.deployment-order.one', '{bad');
    assert.equal(loadDeploymentOrder('one'), null);
    globalThis.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
    assert.equal(loadDeploymentOrder('one'), null);
    assert.doesNotThrow(() => saveDeploymentOrder('one', ['a']));
  } finally { delete globalThis.localStorage; }
});
