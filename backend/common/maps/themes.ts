import type { Terrain } from './map.ts';

// ground is the walkable base terrain; deploy areas and repaired paths use it too.
export const THEMES = {
  grassland: { name: '草地', ground: 'plain' },
  city: { name: '城市', ground: 'floor' },
  palace: { name: '王宫内', ground: 'floor' },
  town: { name: '城镇街道', ground: 'plain' },
  mountain: { name: '山地', ground: 'plain' },
  forest: { name: '树林', ground: 'plain' },
} as const;
export type Theme = keyof typeof THEMES;

export function generateTerrain(width: number, height: number, theme: Theme, random: () => number): Terrain[][] {
  const integer = (limit: number) => Math.floor(random() * limit);
  const ground: Terrain = THEMES[theme].ground;
  const tiles = Array.from({ length: height }, () => Array<Terrain>(width).fill(ground));
  const paint = (x: number, y: number, tile: Terrain) => {
    if (x >= 0 && y >= 0 && x < width && y < height) tiles[y][x] = tile;
  };
  const rectangle = (x: number, y: number, w: number, h: number, tile: Terrain) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) paint(x + dx, y + dy, tile);
  };
  const patches = (tile: Terrain, count: number, length: number, wide = false) => {
    for (let patch = 0; patch < count; patch++) {
      let x = integer(width), y = integer(height);
      for (let step = 0; step < length; step++) {
        paint(x, y, tile);
        if (wide) paint(x + 1, y, tile);
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][integer(4)];
        x = Math.max(0, Math.min(width - 1, x + dx));
        y = Math.max(0, Math.min(height - 1, y + dy));
      }
    }
  };
  const river = () => {
    let x = Math.floor(width / 2);
    for (let y = 0; y < height; y++) {
      x = Math.max(3, Math.min(width - 4, x + integer(3) - 1));
      paint(x, y, 'water');
      paint(x + 1, y, random() < 0.35 ? 'shallows' : 'water');
    }
  };
  const area = width * height;

  switch (theme) {
    case 'grassland':
      patches('forest', Math.max(2, Math.floor(area / 65)), 18, true);
      patches('mountain', Math.max(2, Math.floor(area / 140)), 12);
      patches('wall', 2, 6);
      if (random() < 0.8) river();
      break;
    case 'forest':
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        tiles[y][x] = random() < 0.8 ? 'forest' : ground;
      }
      patches(ground, Math.max(3, Math.floor(area / 70)), 20, true);
      patches('mountain', 2, 8);
      if (random() < 0.5) river();
      break;
    case 'mountain':
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        tiles[y][x] = random() < 0.75 ? 'mountain' : ground;
      }
      patches(ground, Math.max(3, Math.floor(area / 65)), 25, true);
      patches('forest', Math.max(2, Math.floor(area / 140)), 12, true);
      if (random() < 0.5) river();
      break;
    case 'city': {
      const block = 5 + integer(2);
      for (let y = 2; y < height - 2; y += block) {
        for (let x = 3; x < width - 3; x += block) {
          const w = Math.min(block - 2, width - 2 - x);
          const h = Math.min(block - 2, height - 2 - y);
          if (random() < 0.2) continue;
          rectangle(x, y, w, h, 'wall');
        }
      }
      rectangle(Math.floor(width / 2) - 1, Math.floor(height / 2) - 1, 3, 3, ground);
      break;
    }
    case 'town':
      patches('forest', Math.max(2, Math.floor(area / 130)), 14, true);
      for (let y = 2; y < height - 3; y += 5) {
        for (let x = 3; x < width - 3; x += 5) {
          if (random() < 0.25) continue;
          rectangle(x, y, 2 + integer(2), 2, 'wall');
        }
      }
      rectangle(0, Math.floor(height / 2), width, 2, 'road');
      rectangle(Math.floor(width / 2), 0, 2, height, 'road');
      break;
    case 'palace': {
      rectangle(0, 0, width, 1, 'wall');
      rectangle(0, height - 1, width, 1, 'wall');
      rectangle(0, 0, 1, height, 'wall');
      rectangle(width - 1, 0, 1, height, 'wall');
      const step = 5 + integer(2);
      for (let x = step; x < width - 3; x += step) {
        rectangle(x, 1, 1, height - 2, 'wall');
        for (let y = 1; y < height - 1; y += step) {
          rectangle(x, Math.min(height - 3, y + 1 + integer(2)), 1, 2, ground);
        }
      }
      for (let y = step; y < height - 3; y += step) {
        rectangle(1, y, width - 2, 1, 'wall');
        for (let x = 1; x < width - 1; x += step) {
          rectangle(Math.min(width - 3, x + 1 + integer(2)), y, 2, 1, ground);
        }
      }
      break;
    }
  }
  for (let i = 0; i < Math.max(2, Math.floor(area / 120)); i++) {
    const x = 2 + integer(width - 4), y = 1 + integer(height - 2);
    if (tiles[y][x] === ground) tiles[y][x] = 'fort';
  }
  return tiles;
}
