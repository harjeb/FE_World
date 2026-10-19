import assert from 'node:assert/strict';
import test from 'node:test';
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
  for (const enemyCount of [0, 17, 1.5, NaN]) assert.throws(() => generateMap({ seed: 'bad', enemyCount }));
  assert.throws(() => generateMap({ seed: 'bad', layout: 'unknown' as EncounterLayout }));
  const map = generateMap({ seed: 'legacy' });
  map.generatorVersion = 3;
  delete map.layout; delete map.playerGroups;
  assert.ok(validateMap(map).valid);
  map.playerGroups = [0];
  assert.equal(validateMap(map).valid, false);
});
