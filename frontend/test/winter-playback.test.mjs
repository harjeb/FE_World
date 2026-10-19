import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.png')) return { format: 'module', source: `export default ${JSON.stringify(url)}`, shortCircuit: true };
    return next(url, context);
  },
});
const { createPinepassBattle } = await import('../../backend/common/battles/pinepass.ts');
const { applyEvents } = await import('../src/watch/recording.ts');
const { playEvents } = await import('../src/battle/playback.ts');
const { describe } = await import('../src/battle/log.ts');
const { mapArt, MAPS } = await import('../src/assets.ts');

test('ice break follows movement in animated and event-only replay without mutating opening board', async () => {
  const state = createPinepassBattle('winter-replay');
  state.map.season = 4;
  const unit = state.units[0];
  unit.pos = [1, 1];
  state.map.tiles[1][1] = 'ice';
  const events = [
    { t: 'move', unit: unit.id, path: [[1, 1], [2, 1]] },
    { t: 'terrain', unit: unit.id, at: [1, 1], terrain: 'water' },
  ];
  const frames = [];
  const host = {
    state: { view: state, settings: { scenes: 'none' }, fading: new Set() }, speed: 1e9,
    get() { return this.state; },
    set(patch) { Object.assign(this.state, patch); if (patch.view) frames.push(patch.view); },
    focus() {}, float() {}, async showBanner() {},
  };
  await playEvents(host, events, state);
  const result = applyEvents(state, events);
  assert.deepEqual(host.state.view, result);
  assert.deepEqual(frames[0].units[0].pos, [2, 1]);
  assert.equal(frames[0].map.tiles[1][1], 'ice');
  assert.equal(result.map.tiles[1][1], 'water');
  assert.equal(state.map.tiles[1][1], 'ice');
  assert.equal(result.map.season, 4);
  assert.match(describe(events, state)[0].text, /冰面破裂，变为水域/);
});

test('named winter maps paint snow, ice and broken ice instead of static PNG, with layout caching', () => {
  const original = globalThis.document;
  let paints = 0;
  globalThis.document = { createElement() {
    return { getContext() { return {
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image) { assert.ok(image.data.some(value => value !== 0)); paints++; },
    }; }, toDataURL() { return `data:winter-${paints}`; } };
  } };
  try {
    const name = '黑松隘口';
    assert.equal(mapArt(name, [['plain']]), MAPS[name]);
    const frozen = mapArt(name, [['snow', 'ice']], 4);
    assert.match(frozen, /^data:/);
    assert.equal(mapArt(name, [['snow', 'ice']], 4), frozen);
    const broken = mapArt(name, [['snow', 'water']], 4);
    assert.notEqual(broken, frozen);
    assert.match(mapArt(name, [['water']], 4), /^data:/);
    assert.match(mapArt(name, [['ice']]), /^data:/);
  } finally { globalThis.document = original; }
});
