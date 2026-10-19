import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASS_PATHS } from '../data/classes.ts';
import type { ClassRoute } from '../data/classes.ts';
import { drawPortrait, SIZE } from './draw.ts';
import type { PortraitSpec } from './draw.ts';
import { randomPortrait } from './random.ts';
import { readPng } from '../testing/png.ts';

const ART = new URL('../../../design/pixel-art/', import.meta.url);
const ROUTES = Object.keys(CLASS_PATHS) as ClassRoute[];

// The PORTRAITS list of gen_art.py, read as data: dict(...) and string tuples become JSON.
function pythonPortraits(): (PortraitSpec & { key: string })[] {
  const art = readFileSync(new URL('gen_art.py', ART), 'utf8');
  const start = art.indexOf('PORTRAITS = [') + 'PORTRAITS = '.length;
  const block = art.slice(start, art.indexOf('\n]', start) + 2)
    .replace(/^\s*#.*$/gm, '')
    .replace(/\(((?:\s*'[^']*',?)+)\s*\)/g, '[$1]')
    .replace(/dict\(/g, '{')
    .replace(/\)/g, '}')
    .replace(/(\w+)=/g, '"$1":')
    .replace(/'/g, '"')
    .replace(/\bTrue\b/g, 'true')
    .replace(/,(\s*[\]}])/g, '$1');
  return JSON.parse(block);
}

test('the TypeScript renderer reproduces every portrait PNG of gen_art.py', () => {
  const portraits = pythonPortraits();
  assert.ok(portraits.length >= 14);
  for (const { key, ...spec } of portraits) {
    const want = readPng(new URL(`png/por_${key}.png`, ART));
    const got = drawPortrait(spec);
    const i = want.findIndex((v, n) => v !== got[n]);
    if (i >= 0) {
      const px = Math.floor(i / 4);
      assert.fail(`por_${key}: pixel (${px % SIZE}, ${Math.floor(px / SIZE)}) is ${got.slice(px * 4, px * 4 + 4)}, the PNG has ${want.slice(px * 4, px * 4 + 4)}`);
    }
  }
});

test('random portraits are reproducible, varied and plain JSON', () => {
  assert.deepEqual(randomPortrait('recruit-7'), randomPortrait('recruit-7'));
  const specs = Array.from({ length: 300 }, (_, i) => randomPortrait(`seed-${i}`));
  assert.ok(new Set(specs.map(s => JSON.stringify(s))).size === specs.length);
  const women = specs.filter(s => s.fem).length;
  assert.ok(women > 100 && women < 200, `${women} of 300 are women`);
  for (const s of specs) assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('a unit keeps its face across routes and sides; only clothes and headwear change', () => {
  for (let i = 0; i < 100; i++) {
    const seed = `unit-${i}`;
    const base = randomPortrait(seed);
    for (const route of ROUTES) {
      for (const side of ['player', 'enemy'] as const) {
        const s = randomPortrait(seed, { route, side });
        for (const k of ['skin', 'hair', 'eye', 'face', 'eyes', 'brows', 'mouth', 'fem', 'blush'] as const) assert.deepEqual(s[k], base[k], `${seed} ${route} ${side} ${k}`);
        if (s.style !== 'helm' && s.style !== 'hood') assert.equal(s.style, base.style, `${seed} ${route} ${side} style`);
      }
    }
  }
});

test('random portraits follow sex and part rules, and all of them render', () => {
  const female = new Set(['oval', 'sharp', 'round']);
  for (let i = 0; i < 400; i++) {
    for (const sex of ['female', 'male'] as const) {
      const route = ROUTES[i % ROUTES.length];
      const s = randomPortrait(`rule-${i}`, { sex, route, side: i % 2 ? 'enemy' : 'player' });
      const parts = [s.acc, ...(s.extra ?? [])];
      assert.equal(!!s.fem, sex === 'female');
      assert.equal(female.has(s.face!), sex === 'female', `${sex} got ${s.face}`);
      if (sex === 'female') assert.ok(!parts.includes('beard') && !parts.includes('mustache'));
      assert.equal(s.style === 'helm', s.acc === 'helm');
      assert.equal(s.style === 'hood', s.acc === 'hood');
      if (s.acc === 'headband' || s.acc === 'bandana') assert.ok(s.band);
      if (parts.includes('scarf')) assert.ok(!parts.includes('beard') && !parts.includes('mustache'));
      if (s.outfit === 'priest') assert.ok(s.stole);
      const img = drawPortrait(s);
      assert.equal(img.length, SIZE * SIZE * 4);
      assert.ok(img.some((v, n) => n % 4 === 3 && v === 255));
    }
  }
});
