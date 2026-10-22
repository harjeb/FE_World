import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { generateMap } from './generate.ts';
import { LAYOUTS } from './layouts.ts';
import type { EncounterLayout } from './layouts.ts';
import { canEnter, neighbors, validateMap } from './map.ts';
import type { BattleMap, Point } from './map.ts';

function distance(map: BattleMap, start: Point, targets: Point[]) {
  const key = ([x, y]: Point) => y * map.width + x;
  const goal = new Set(targets.map(key));
  const queue: [Point, number][] = [[start, 0]];
  const seen = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const [point, steps] = queue[i];
    if (goal.has(key(point))) return steps;
    for (const next of neighbors(point, map.width, map.height)) {
      if (seen.has(key(next)) || !canEnter(map.tiles[next[1]][next[0]], 'foot')) continue;
      seen.add(key(next)); queue.push([next, steps + 1]);
    }
  }
  return Infinity;
}

test('legacy capacity output retains its pre-change byte hash', () => {
  const maps = [];
  for (const layout of Object.keys(LAYOUTS) as EncounterLayout[]) {
    for (const enemyCount of [1, 8, 16]) maps.push(generateMap({ seed: 'baseline-capacity', layout, width: 24, height: 24, unitsPerSide: 8, enemyCount }));
  }
  assert.equal(createHash('sha256').update(JSON.stringify(maps)).digest('hex'), 'c26dfe6cbf6b9897fb3019b97cab3102ac242c70f4758cf64b5e47a8ec4dc649');
});

test('overflow slots are independent, reachable, separated, and never truncated', () => {
  for (const layout of Object.keys(LAYOUTS) as EncounterLayout[]) {
    for (let seed = 0; seed < 6; seed++) {
      const options = { seed: `overflow-${seed}`, layout, width: 24, height: 24, unitsPerSide: 8, enemyCount: 64 };
      const map = generateMap(options);
      const small = generateMap({ ...options, unitsPerSide: 2 });
      assert.equal(map.spawns.enemy.length, 64);
      assert.deepEqual(small.spawns.enemy, map.spawns.enemy);
      assert.deepEqual(map, generateMap(options));
      for (const enemyCount of [17, 32]) {
        const partial = generateMap({ ...options, enemyCount });
        assert.deepEqual(partial.spawns.enemy, map.spawns.enemy.slice(0, enemyCount));
        assert.ok(validateMap(partial).valid);
      }
      const parity = (map.spawns.enemy[0][0] + map.spawns.enemy[0][1]) % 2;
      for (const [x, y] of map.spawns.enemy.slice(16)) assert.equal((x + y) % 2, parity);
      assert.deepEqual(map.spawns.enemy.slice(0, 16), generateMap({ ...options, enemyCount: 16 }).spawns.enemy);
      assert.ok(validateMap(map).valid);
      assert.ok(validateMap(small).valid);
      const all = [...map.spawns.player, ...map.spawns.enemy, map.objective.position];
      assert.equal(new Set(all.map(point => point.join(','))).size, all.length);
      for (const point of map.spawns.enemy) {
        const steps = distance(map, point, map.spawns.player);
        assert.ok(Number.isFinite(steps) && steps >= (layout === 'pincer' ? 8 : 4));
        assert.ok(canEnter(map.tiles[point[1]][point[0]], 'armored'));
      }
    }
    assert.throws(() => generateMap({ seed: 'too-small', layout, width: 10, height: 10, enemyCount: 64 }), /空间不足/);
  }
});

test('pincer squads meet only after a long ground route around the protected wall', () => {
  for (let seed = 0; seed < 100; seed++) {
    const map = generateMap({ seed: `split-${seed}`, layout: 'pincer', width: 24, height: 22, unitsPerSide: 8, enemyCount: 16 });
    assert.deepEqual(map.playerGroups, [0, 1, 0, 1, 0, 1, 0, 1]);
    const other = map.spawns.player.filter((_, i) => map.playerGroups![i] === 1);
    for (const point of map.spawns.player.filter((_, i) => map.playerGroups![i] === 0)) {
      const steps = distance(map, point, other);
      assert.ok(Number.isFinite(steps) && steps >= 25, `${seed}: shortest route ${steps}`);
    }
    for (const point of map.spawns.player) assert.ok(distance(map, point, map.spawns.enemy) >= 8);
    assert.ok(validateMap(map).valid);
  }
});

test('layouts are reproducible, seed-varied, and enemy capacity is independent', () => {
  for (const layout of Object.keys(LAYOUTS) as EncounterLayout[]) {
    const positions = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const options = { seed: `layout-${seed}`, layout, width: 24, height: 22, unitsPerSide: 8, enemyCount: 16 };
      const map = generateMap(options);
      assert.equal(map.generatorVersion, 4);
      assert.equal(map.layout, layout);
      assert.deepEqual(map, generateMap(options));
      const small = generateMap({ ...options, unitsPerSide: 2 });
      assert.deepEqual(small.spawns.player, map.spawns.player.slice(0, 2));
      assert.deepEqual(small.spawns.enemy, map.spawns.enemy);
      assert.equal(small.spawns.enemy.length, 16);
      assert.ok(validateMap(small).valid);
      positions.add(JSON.stringify([map.spawns, map.playerGroups]));
      for (const point of map.spawns.player) assert.ok(distance(map, point, map.spawns.enemy) >= 4);
    }
    assert.ok(positions.size >= 4, layout);
  }
});

test('small enemy armies still occupy separate convergence approaches', () => {
  for (let seed = 0; seed < 20; seed++) {
    const map = generateMap({ seed: `enemy-squads-${seed}`, layout: 'convergence', width: 24, height: 24, unitsPerSide: 2, enemyCount: 3 });
    assert.deepEqual(map.playerGroups, [0, 1]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const [a, b] = [map.spawns.enemy[i], map.spawns.enemy[j]];
      assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) >= 8, 'the first three slots must reach different enemy groups');
    }
  }
});

test('compact layouts preserve legal exits at maximum capacity', () => {
  for (const layout of Object.keys(LAYOUTS) as EncounterLayout[]) {
    for (let seed = 0; seed < 20; seed++) {
      const map = generateMap({ seed: String(seed), layout, width: 10, height: 10, unitsPerSide: 8, enemyCount: 16 });
      assert.ok(validateMap(map).valid);
    }
  }
});

test('new optional metadata and count limits are validated; legacy maps remain readable', () => {
  for (const enemyCount of [0, 65, 1.5, NaN]) assert.throws(() => generateMap({ seed: 'bad', enemyCount }));
  assert.throws(() => generateMap({ seed: 'bad', layout: 'unknown' as EncounterLayout }));
  const map = generateMap({ seed: 'legacy' });
  map.generatorVersion = 3;
  delete map.layout; delete map.playerGroups;
  assert.ok(validateMap(map).valid);
  map.playerGroups = [0];
  assert.equal(validateMap(map).valid, false);
});
