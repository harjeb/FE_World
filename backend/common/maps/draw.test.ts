import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPng } from '../testing/png.ts';
import { drawMap, glyphRows, mapSeed, TILE } from './draw.ts';
import { generateMap } from './generate.ts';
import { THEMES } from './themes.ts';
import type { Theme } from './themes.ts';

const ART = new URL('../../../design/pixel-art/', import.meta.url);

// The MAPS dict of gen_art.py: key, hand-picked seed and glyph rows.
function pythonMaps(): { key: string; seed: number; rows: string[] }[] {
  const art = readFileSync(new URL('gen_art.py', ART), 'utf8');
  const start = art.indexOf('\nMAPS = {');
  const block = art.slice(start, art.indexOf('\n}', start));
  return [...block.matchAll(/'(\w+)': \((\d+), \[([^\]]*)\]\)/g)]
    .map(([, key, seed, rows]) => ({ key, seed: Number(seed), rows: [...rows.matchAll(/"([^"]+)"/g)].map(m => m[1]) }));
}

// The pixel at (x, y) as 'r,g,b,a'.
const pixel = (img: Uint8ClampedArray, width: number, x: number, y: number) => img.slice((y * width + x) * 4, (y * width + x) * 4 + 4).join();

test('the TypeScript painters reproduce every map PNG of gen_art.py', () => {
  const maps = pythonMaps();
  assert.ok(maps.length >= 9);
  for (const { key, seed, rows } of maps) {
    const want = readPng(new URL(`png/map_${key}.png`, ART));
    const got = drawMap(rows, seed);
    assert.equal(got.length, want.length, `map_${key}: size`);
    const i = want.findIndex((v, n) => v !== got[n]);
    if (i >= 0) {
      const px = Math.floor(i / 4), width = rows[0].length * TILE;
      assert.fail(`map_${key}: pixel (${px % width}, ${Math.floor(px / width)}) is ${got.slice(px * 4, px * 4 + 4)}, the PNG has ${want.slice(px * 4, px * 4 + 4)}`);
    }
  }
});

test('generated maps of every theme paint opaque and the same each time', () => {
  for (const theme of Object.keys(THEMES) as Theme[]) {
    const rows = glyphRows(generateMap({ seed: `art-${theme}`, theme, width: 20, height: 16 }).tiles);
    const img = drawMap(rows, mapSeed(theme));
    assert.equal(img.length, 20 * TILE * 16 * TILE * 4, theme);
    assert.ok(img.every((v, n) => n % 4 !== 3 || v === 255), `${theme}: every pixel is opaque`);
    assert.deepEqual(drawMap(rows, mapSeed(theme)), img, theme);
  }
});

test('a changed tile repaints only itself and the tiles beside it', () => {
  // Destroyed walls turn into floor mid-battle; the rest of the map must keep its look.
  const rows = pythonMaps().find(m => m.key === 'castle')!.rows;
  const [wx, wy] = [16, 2];
  assert.equal(rows[wy][wx], '#');
  const before = drawMap(rows, 7);
  const after = drawMap(rows.map((row, y) => y === wy ? `${row.slice(0, wx)}p${row.slice(wx + 1)}` : row), 7);
  const width = rows[0].length * TILE;
  const changed = new Set<string>();
  for (let n = 0; n < before.length; n++) {
    if (before[n] !== after[n]) changed.add(`${Math.floor((n / 4) % width / TILE)},${Math.floor(n / 4 / width / TILE)}`);
  }
  assert.ok(changed.has(`${wx},${wy}`));
  for (const tile of changed) {
    const [x, y] = tile.split(',').map(Number);
    assert.ok(Math.abs(x - wx) + Math.abs(y - wy) <= 1, `tile ${tile} changed too`);
  }
});

test('bridges run along the path, across rivers flowing either way', () => {
  // The shadow under a bridge's first parapet is one line of one color along the path: pixel row 2
  // of a west-east bridge, pixel column 2 of a north-south one.
  const westEast = drawMap(['.w.', 'rbr', '.w.'], 1);
  const northSouth = drawMap(['.r.', 'wbw', '.r.'], 1);
  const line = (img: Uint8ClampedArray, cells: number[][]) => new Set(cells.map(([x, y]) => pixel(img, 3 * TILE, TILE + x, TILE + y))).size === 1;
  const row2 = Array.from({ length: 15 }, (_, k) => [k + 1, 2]), column2 = row2.map(([x, y]) => [y, x]);
  assert.ok(line(westEast, row2) && !line(westEast, column2));
  assert.ok(line(northSouth, column2) && !line(northSouth, row2));
});
