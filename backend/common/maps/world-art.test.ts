import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANDMARK_PX, paintWorld, siteCenterPx, WORLD_ART_H, WORLD_ART_W, WORLD_TILE_PX } from './world-art.ts';
import { siteTile, T, worldMap } from './world-tiles.ts';

test('the world paints to a 960x640 opaque pixel image, deterministically', () => {
  const a = paintWorld(), b = paintWorld();
  assert.deepEqual([a.width, a.height, WORLD_TILE_PX], [960, 640, 4]);
  assert.equal(a.data.length, WORLD_ART_W * WORLD_ART_H * 4);
  assert.ok(Buffer.from(a.data).equals(Buffer.from(b.data)));
  for (let i = 3; i < a.data.length; i += 4) assert.equal(a.data[i], 255, 'no transparent pixel');
});

test('each terrain has its own look and every landmark differs from the ground it stands on', () => {
  const img = paintWorld(), map = worldMap();
  const colour = (x: number, y: number) => [0, 1, 2].map(k => img.data[(y * img.width + x) * 4 + k]).join(',');
  const average = (terrain: number) => {
    const sums = [0, 0, 0]; let n = 0;
    for (let i = 0; i < map.tiles.length && n < 400; i++) if (map.tiles[i] === terrain) {
      const tx = i % map.w, ty = Math.floor(i / map.w);
      for (let p = 0; p < 16; p++) for (let k = 0; k < 3; k++) sums[k] += img.data[((ty * 4 + (p >> 2)) * img.width + tx * 4 + (p & 3)) * 4 + k];
      n++;
    }
    return sums.map(v => Math.round(v / (n * 16))).join(',');
  };
  const looks = Object.values(T).map(average);
  assert.equal(new Set(looks).size, looks.length, 'no two terrains share an average colour');
  const seen = new Set<string>();
  for (const site of map.sites) {
    const [cx, cy] = siteCenterPx(site.id);
    const patch: string[] = [];
    for (let y = cy - 8; y < cy + 8; y++) for (let x = cx - 8; x < cx + 8; x++) patch.push(colour(x, y));
    assert.ok(new Set(patch).size > 5, `landmark ${site.id} is more than a flat patch`);
    const sig = patch.join('|');
    assert.ok(!seen.has(sig), `landmark ${site.id} is unique`);
    seen.add(sig);
    assert.equal(LANDMARK_PX, 16);
    assert.deepEqual(siteTile(site.id).map(v => v * 4 + 2), [cx, cy]);
  }
});
