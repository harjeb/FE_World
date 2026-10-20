import assert from 'node:assert/strict';
import test from 'node:test';
import { questsInRegion, crossTimeReward } from '../src/pages/cross-time.ts';

test('global trial appears in unlocked offered regions until acceptance, then only the accepted region even when busy', () => {
  const crossTime = { id: 'cross-time-throne', acceptedRegion: null, availableRegions: [1, 2], available: true };
  const quests = { regions: [{ region: 1, quests: [{ id: 'local', available: true }] }, { region: 2, quests: [] }], crossTime };
  assert.deepEqual(questsInRegion(quests, 1).map(q => q.id), ['local', crossTime.id]);
  assert.deepEqual(questsInRegion(quests, 2), [crossTime]);
  assert.deepEqual(questsInRegion(quests, 3), []);
  crossTime.acceptedRegion = 2;
  crossTime.available = false;
  crossTime.inProgress = true;
  assert.deepEqual(questsInRegion(quests, 1).map(q => q.id), ['local']);
  assert.deepEqual(questsInRegion(quests, 2), [crossTime]);
  crossTime.inProgress = false;
  crossTime.done = true;
  assert.deepEqual(questsInRegion(quests, 2), [crossTime]);
  assert.deepEqual(questsInRegion({ ...quests, crossTime: null }, 2), []);
});

test('reward copy distinguishes normal fixed shards from all later independent rolls', () => {
  assert.match(crossTimeReward('normal', false), /2500.*碎片 ×3/);
  assert.doesNotMatch(crossTimeReward('normal', false), /20%/);
  assert.match(crossTimeReward('normal', true), /800.*20%/);
  assert.match(crossTimeReward('hard', false), /3500.*20%/);
  assert.match(crossTimeReward('hard', true), /1500.*20%/);
  assert.doesNotMatch(crossTimeReward('hard', false), /碎片 ×3/);
});
