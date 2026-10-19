import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from './calendar.ts';
import { normalizeRegions, routeCandidates, worldMap } from './region-map.ts';
import type { RegionProgress } from './region-map.ts';

const progress = (unlockedRegions: number[], clearedRegions: number[], regionExploration: Record<number, number> = {}): RegionProgress =>
  ({ unlockedRegions, clearedRegions, regionExploration });

test('a fresh world offers exactly the four radial starting routes and nothing else', () => {
  const map = worldMap(progress([], []));
  assert.equal(map.nodes.length, REGIONS.length);
  assert.deepEqual(map.unlockedRegions, []);
  assert.deepEqual(map.selectableRegions, [1, 2, 3, 4]);
  assert.deepEqual(map.edges, [
    [0, 1], [1, 5], [5, 9], [0, 2], [2, 6], [6, 10],
    [0, 3], [3, 7], [7, 11], [0, 4], [4, 8], [8, 12],
    [1, 2], [2, 4], [4, 3], [3, 1], [5, 6], [6, 8], [8, 7], [7, 5],
  ]);
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  assert.deepEqual(map.capital, { id: 0, name: '王都', x: 50, y: 50 });
  for (const id of [1, 2, 3, 4]) assert.equal(byId.get(id)!.state, 'available', `地区${id} 是起步路线`);
  for (const id of [5, 6, 7, 8, 9, 10, 11, 12]) assert.equal(byId.get(id)!.state, 'locked');
  for (const node of map.nodes) {
    const region = REGIONS.find(r => r.id === node.id)!;
    assert.equal(node.exploration, 0);
    assert.equal(node.name, region.name);
    assert.equal(node.resource, region.resource);
    assert.equal(Number.isInteger(node.x) && Number.isInteger(node.y), true);
  }
});

test('routes only fan out from fully explored regions, independently of first victory', () => {
  assert.deepEqual(routeCandidates(progress([1], [])), []);
  assert.deepEqual(routeCandidates(progress([1, 5], [])), []);
  for (const amount of [0, 3, 98, 99]) {
    assert.deepEqual(routeCandidates(progress([1], [1], { 1: amount })), [], `探索 ${amount} 不足以开放新路线`);
  }
  assert.deepEqual(routeCandidates(progress([1], [1], { 1: 100 })), [2, 3, 5]);
  assert.deepEqual(routeCandidates(progress([1], [], { 1: 100 })), [2, 3, 5], '路线只看探索度');
  assert.deepEqual(routeCandidates(progress([1, 5], [1, 5], { 1: 100, 5: 100 })), [2, 3, 6, 7, 9]);
  assert.deepEqual(routeCandidates(progress([1, 5], [1, 5], { 1: 100, 5: 99 })), [2, 3], '新地区未满不能继续向外开图');
  assert.deepEqual(routeCandidates(progress([1], [], { 9: 100 })), [], '未开通地区的值不能绕过路线门禁');
});

test('exact fully-explored adjacency across the ring roads', () => {
  // 内环：1-2、2-4、4-3、3-1；中环：5-6、6-8、8-7、7-5。
  assert.deepEqual(routeCandidates(progress([2], [2], { 2: 100 })), [1, 4, 6]);
  assert.deepEqual(routeCandidates(progress([4], [4], { 4: 100 })), [2, 3, 8]);
  assert.deepEqual(routeCandidates(progress([6], [6], { 6: 100 })), [2, 5, 8, 10]);
  assert.deepEqual(routeCandidates(progress([12], [12], { 12: 100 })), [8]);
  // 跳线尝试：未相邻的地区永远不在可选项里。
  assert.equal(routeCandidates(progress([1], [1], { 1: 100 })).includes(9), false);
  assert.equal(routeCandidates(progress([1], [1], { 1: 100 })).includes(12), false);
});

test('worldMap states are exact: cleared > unlocked > available > locked', () => {
  const map = worldMap(progress([1, 2, 5, 9], [1, 5], { 1: 100, 5: 100, 2: 3, 9: 20 }));
  const byId = new Map(map.nodes.map(node => [node.id, node]));
  assert.equal(byId.get(1)!.state, 'cleared');
  assert.equal(byId.get(5)!.state, 'cleared');
  assert.equal(byId.get(2)!.state, 'unlocked');
  assert.equal(byId.get(9)!.state, 'unlocked');
  // 已讨伐 1、5 的相邻地区（3、6、7）尚未解锁，成为可选路线；其余仍是锁定。
  for (const id of [3, 6, 7]) assert.equal(byId.get(id)!.state, 'available', `地区${id} 是可选路线`);
  for (const id of [4, 8, 10, 11, 12]) assert.equal(byId.get(id)!.state, 'locked');
  assert.deepEqual(map.unlockedRegions, [1, 2, 5, 9]);
  assert.deepEqual(map.selectableRegions, [3, 6, 7]);
  assert.equal(byId.get(2)!.exploration, 3);
  assert.equal(byId.get(9)!.exploration, 20);
});

test('displayed exploration is bounded at zero and one hundred', () => {
  const map = worldMap(progress([1, 2], [], { 1: 103, 2: -3 }));
  assert.equal(map.nodes.find(node => node.id === 1)!.exploration, 100);
  assert.equal(map.nodes.find(node => node.id === 2)!.exploration, 0);
});

test('normalizeRegions sorts, dedupes and clamps to the twelve real regions', () => {
  assert.deepEqual(normalizeRegions([12, 1, 5, 5, 0, -3, 13, 2.5]), [1, 5, 12]);
  assert.deepEqual(normalizeRegions([]), []);
});
