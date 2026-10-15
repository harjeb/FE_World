import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { generateMap } from '../../backend/common/maps/generate.ts';
import { canEnter, TERRAINS, validateMap } from '../../backend/common/maps/map.ts';
import type { BattleMap, Terrain } from '../../backend/common/maps/map.ts';
import { THEMES } from '../../backend/common/maps/themes.ts';
import type { Theme } from '../../backend/common/maps/themes.ts';
import { renderAscii, renderSvg } from './render.ts';

// Independent traversal and terrain lists catch mistakes shared by generation and validation.
function independentlyCheck(map: BattleMap) {
  const flat: Terrain[] = ['plain', 'road', 'bridge', 'floor', 'village', 'throne'];
  const allowed: Terrain[][] = [
    [...flat, 'forest', 'mountain', 'fort', 'shallows'],
    [...flat, 'forest', 'fort'],
    [...flat, 'forest', 'fort', 'shallows'],
    [...flat, 'forest', 'mountain', 'fort', 'shallows', 'water'],
  ];
  for (const terrain of allowed) {
    const [sx, sy] = map.spawns.player[0];
    const visited = new Set<string>();
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const key = `${x},${y}`;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height || visited.has(key)
        || !terrain.includes(map.tiles[y][x])) continue;
      visited.add(key);
      queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    const count = map.tiles.flat().filter(tile => terrain.includes(tile)).length;
    assert.equal(visited.size, count, `disconnected: ${map.seed}`);
    for (const [x, y] of [...map.spawns.player, ...map.spawns.enemy, map.objective.position]) {
      assert.ok(visited.has(`${x},${y}`), `unreachable target: ${map.seed}`);
    }
  }
}

function plainMap(): BattleMap {
  const map = generateMap({ seed: 'fixture', width: 10, height: 10, unitsPerSide: 1 });
  map.tiles = Array.from({ length: 10 }, () => Array<Terrain>(10).fill('plain'));
  const [x, y] = map.objective.position;
  map.tiles[y][x] = 'throne';
  return map;
}

test('2400 theme/seed/size combinations: all traversable cells and targets are connected', () => {
  for (const theme of Object.keys(THEMES) as Theme[]) {
    for (let seed = 0; seed < 100; seed++) {
      for (const [width, height] of [[10, 10], [20, 20], [25, 25], [32, 18]]) {
        const map = generateMap({ seed: String(seed), theme, width, height, unitsPerSide: 1 + seed % 8 });
        assert.equal(validateMap(map).valid, true);
        independentlyCheck(map);
      }
    }
  }
});

test('maximum and narrow rectangular dimensions, maximum deployment count', () => {
  for (const theme of Object.keys(THEMES) as Theme[]) {
    for (const [width, height] of [[64, 64], [10, 64], [64, 10]]) {
      const map = generateMap({ seed: 'boundary', theme, width, height, unitsPerSide: 8 });
      independentlyCheck(map);
      assert.equal(validateMap(map).valid, true);
    }
  }
});

test('same version, seed and options reproduce exact JSON; different seeds vary', () => {
  const options = { seed: '林中遭遇', width: 25, height: 20 };
  assert.deepEqual(generateMap(options), generateMap(options));
  assert.notDeepEqual(generateMap(options).tiles, generateMap({ ...options, seed: 'other' }).tiles);
});

test('themes change structure, indoor maps contain no outdoor terrain', () => {
  const generated = (Object.keys(THEMES) as Theme[]).map(theme => generateMap({ seed: 'theme', theme, width: 25 }));
  assert.equal(new Set(generated.map(map => JSON.stringify(map.tiles))).size, 6);
  for (const map of generated.filter(map => ['city', 'palace', 'town'].includes(map.theme))) {
    assert.ok(map.tiles.flat().includes('wall'));
    assert.ok(!map.tiles.flat().includes('water'));
    assert.ok(!map.tiles.flat().includes('mountain'));
    if (map.theme !== 'town') assert.ok(!map.tiles.flat().includes('forest'));
  }
  for (const map of generated.filter(map => ['city', 'palace'].includes(map.theme))) {
    assert.ok(map.tiles.flat().includes('floor'));
    assert.ok(!map.tiles.flat().includes('plain'));
  }
  assert.ok(generated.find(map => map.theme === 'town')!.tiles.flat().includes('road'));
  const count = (theme: Theme, tile: Terrain) => generated.find(map => map.theme === theme)!.tiles.flat().filter(t => t === tile).length;
  assert.ok(count('forest', 'forest') > count('grassland', 'forest'));
  assert.ok(count('mountain', 'mountain') > count('grassland', 'mountain'));
  assert.throws(() => generateMap({ seed: 'bad', theme: 'unknown' as Theme }));
  const invalid = plainMap();
  invalid.theme = 'unknown' as Theme;
  assert.equal(validateMap(invalid).valid, false);
});

test('movement restrictions follow current terrain rules', () => {
  assert.equal(canEnter('mountain', 'foot'), true);
  assert.equal(canEnter('mountain', 'armored'), false);
  assert.equal(canEnter('shallows', 'armored'), false);
  assert.equal(canEnter('shallows', 'mounted'), true);
  assert.equal(canEnter('water', 'mounted'), false);
  assert.equal(canEnter('water', 'flying'), true);
  assert.equal(canEnter('wall', 'flying'), false);
  for (const tile of ['road', 'bridge', 'floor', 'village'] as Terrain[]) {
    assert.equal(canEnter(tile, 'armored'), true);
  }
});

test('terrain glyphs are unique and match the pixel-art painters', () => {
  const glyphs = Object.values(TERRAINS).map(terrain => terrain.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
  assert.ok(!glyphs.includes('A') && !glyphs.includes('E'));
  const art = readFileSync(fileURLToPath(new URL('../../design/pixel-art/gen_art.py', import.meta.url)), 'utf8');
  const painters = art.match(/^PAINTERS = \{([^}]*)\}/m)![1];
  assert.deepEqual([...painters.matchAll(/'(.)':/g)].map(match => match[1]).sort(), [...glyphs].sort());
});

test('repaired paths cross rivers on bridges, so only river themes have bridges', () => {
  let bridged = 0;
  for (const theme of Object.keys(THEMES) as Theme[]) {
    for (let seed = 0; seed < 50; seed++) {
      if (!generateMap({ seed: `bridge-${seed}`, theme }).tiles.flat().includes('bridge')) continue;
      bridged++;
      assert.ok(['grassland', 'forest', 'mountain'].includes(theme));
    }
  }
  assert.ok(bridged > 0);
});

test('a water barrier passes flying but fails ground movement', () => {
  const map = plainMap();
  for (let y = 0; y < map.height; y++) map.tiles[y][5] = 'water';
  const result = validateMap(map);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.startsWith('armored:')));
  assert.ok(!result.errors.some(error => error.startsWith('flying:')));
});

test('reject an isolated island even when spawns and objective remain connected', () => {
  const map = plainMap();
  map.tiles[0][1] = 'wall';
  map.tiles[1][0] = 'wall';
  const result = validateMap(map);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('断开')));
});

test('reject blocked objective and a spawn with no exit', () => {
  const map = plainMap();
  const [x, y] = map.objective.position;
  for (const [a, b] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) map.tiles[b][a] = 'wall';
  assert.equal(validateMap(map).valid, false);
  const blocked = plainMap();
  const [sx, sy] = blocked.spawns.player[0];
  for (const [a, b] of [[sx - 1, sy], [sx + 1, sy], [sx, sy - 1], [sx, sy + 1]]) blocked.tiles[b][a] = 'wall';
  assert.ok(validateMap(blocked).errors.some(error => error.includes('邻格')));
});

test('invalid generation input is rejected, never silently clamped', () => {
  for (const width of [0, 9, 65, NaN, Infinity, 20.5]) {
    assert.throws(() => generateMap({ seed: 'bad', width }));
  }
  for (const unitsPerSide of [0, 9, 1.5]) {
    assert.throws(() => generateMap({ seed: 'bad', unitsPerSide }));
  }
  assert.throws(() => generateMap({ seed: '' }));
  assert.throws(() => generateMap({ seed: 'a'.repeat(201) }));
});

test('validator handles malformed external JSON and overlapping spawns', () => {
  for (const value of [null, {}, [], { width: 20, height: 20 }]) assert.equal(validateMap(value).valid, false);
  const invalidTile = plainMap();
  (invalidTile.tiles[0] as string[])[0] = '__proto__';
  assert.equal(validateMap(invalidTile).valid, false);
  const duplicate = plainMap();
  duplicate.spawns.enemy[0] = duplicate.spawns.player[0];
  assert.equal(validateMap(duplicate).valid, false);
  const malformed = plainMap();
  malformed.tiles.pop();
  assert.equal(validateMap(malformed).valid, false);
});

test('SVG escapes seed markup; ASCII retains spawn and goal labels', () => {
  const map = generateMap({ seed: '<script>&"\'' });
  const svg = renderSvg(map);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;&amp;&quot;&apos;'));
  assert.match(renderAscii(map), /A.*E/s);
  assert.ok(renderAscii(map).includes('T'));
  const palace = renderSvg(generateMap({ seed: 'legend', theme: 'palace' }));
  assert.ok(palace.includes('p 石地板') && !palace.includes('w 水域'));
  assert.ok(renderSvg(generateMap({ seed: 'legend', theme: 'forest' })).includes('class="tile inverse"'));
});

test('CLI generates, checks, rejects invalid flags and refuses file overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-mapgen-test-'));
  const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  try {
    const path = join(dir, 'map.json');
    assert.equal(run('--seed', 'cli', '--width', '25', '--format', 'json', '--out', path).status, 0);
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).height, 25);
    assert.equal(run('--check', path).status, 0);
    const original = readFileSync(path, 'utf8');
    assert.equal(run('--seed', 'changed', '--out', path).status, 1);
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.equal(run('--format', 'unknown').status, 1);
    assert.equal(run('--theme', 'unknown').status, 1);
    assert.equal(JSON.parse(run('--theme', 'palace', '--format', 'json').stdout).theme, 'palace');
    assert.equal(run('--width', '25.5').status, 1);
    assert.equal(run('--unknown').status, 1);
    assert.equal(run('--check', path, '--width', '20').status, 1);
    writeFileSync(path, '{');
    assert.equal(run('--check', path).status, 1);
    const invalid = plainMap();
    invalid.tiles[invalid.spawns.enemy[0][1]][invalid.spawns.enemy[0][0]] = 'water';
    writeFileSync(path, JSON.stringify(invalid));
    assert.equal(run('--check', path).status, 1);
    assert.equal(run('--format', 'svg', '--seed', 'cli').status, 0);
    assert.equal(run('--help').status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
