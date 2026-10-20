import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, REGION_BIOME, siteTile, T, walkable, WORLD_H, WORLD_W, worldMap } from './world-tiles.ts';
import { WORLD_EDGES } from '../game/region-map.ts';

test('the world is 240x160 and generation is deterministic', () => {
  const a = generateWorld(), b = generateWorld();
  assert.equal(a.tiles.length, WORLD_W * WORLD_H);
  assert.deepEqual([a.w, a.h], [240, 160]);
  assert.ok(Buffer.from(a.tiles).equals(Buffer.from(b.tiles)));
  assert.equal(worldMap(), worldMap(), 'the shared map is cached');
  assert.deepEqual(worldMap().sites.map(s => s.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('the capital sits in the middle and regions follow the design layout', () => {
  assert.deepEqual(siteTile(0), [120, 80]);
  const [x1, y1] = siteTile(1), [x10, y10] = siteTile(10), [x11, y11] = siteTile(11);
  assert.ok(x10 < x1 && y10 < y1, 'region 10 is far north-west, region 1 is near south-west of the capital');
  assert.ok(x11 > 200 && y11 > 130, 'region 11 is the far south-east');
  for (const s of worldMap().sites) {
    assert.ok(s.x >= 10 && s.x < WORLD_W - 10 && s.y >= 10 && s.y < WORLD_H - 10, `site ${s.id} keeps clear of the edge`);
  }
});

test('every site stands on land with a plaza and every road edge connects its two ends', () => {
  const map = worldMap();
  for (const s of map.sites) assert.equal(map.tiles[s.y * map.w + s.x], T.plaza, `site ${s.id}`);
  assert.equal(map.roads.length, WORLD_EDGES.length);
  // Walk from the capital over walkable tiles: every site is reachable, so no region is cut off by the sea.
  const seen = new Uint8Array(map.w * map.h);
  const [sx, sy] = siteTile(0);
  const queue = [sy * map.w + sx];
  seen[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i], x = at % map.w, y = Math.floor(at / map.w);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const n = ny * map.w + nx;
      if (!seen[n] && walkable(map.tiles[n])) { seen[n] = 1; queue.push(n); }
    }
  }
  for (const s of map.sites) assert.ok(seen[s.y * map.w + s.x], `site ${s.id} is reachable from the capital`);
  for (const road of map.roads) {
    const first = road.path[0], last = road.path[road.path.length - 1];
    assert.deepEqual(first, siteTile(road.from));
    assert.deepEqual(last, siteTile(road.to));
    road.path.forEach(([x, y], i) => {
      if (i > 0) assert.equal(Math.abs(x - road.path[i - 1][0]) + Math.abs(y - road.path[i - 1][1]), 1, 'roads are 4-connected');
    });
  }
});

test('the map has the full range of terrain and every region has its own flavour', () => {
  const map = worldMap();
  const count = new Map<number, number>();
  for (const t of map.tiles) count.set(t, (count.get(t) ?? 0) + 1);
  for (const terrain of Object.values(T)) assert.ok((count.get(terrain) ?? 0) > 50, `terrain ${terrain} appears`);
  // Around each region the themed terrain dominates the nearby non-road, non-plaza ground more than elsewhere.
  for (const id of Object.keys(REGION_BIOME).map(Number)) {
    const [cx, cy] = siteTile(id);
    let themed = 0, total = 0;
    for (let y = cy - 8; y <= cy + 8; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      const t = map.tiles[y * map.w + x];
      if (t === T.road || t === T.bridge || t === T.plaza) continue;
      total++;
      if (t === REGION_BIOME[id]) themed++;
    }
    assert.ok(themed / total > 0.2, `region ${id} shows its terrain (${themed}/${total})`);
  }
});
