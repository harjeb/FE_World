import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { createPinepassBattle } = await import('../../backend/common/battles/pinepass.ts');
const { applyEvents, replayFrom } = await import('../src/watch/recording.ts');
const { playEvents } = await import('../src/battle/playback.ts');

function fixture() {
  const state = createPinepassBattle('art-playback');
  const [a, d] = state.units;
  a.hp = 10; d.hp = 15;
  state.objects = [{ id: 'wall', kind: 'wall', pos: [1, 1], state: 'intact', hp: 50 }];
  const events = [
    { t: 'combat', attacker: a.id, defender: d.id, weapons: ['iron_sword', null], strikes: [
      { by: a.id, target: d.id, hit: true, crit: false, damage: 6, hpAfter: 9, byHpAfter: 13 },
      { by: d.id, target: a.id, hit: true, crit: false, damage: 2, hpAfter: 11 },
    ] },
    { t: 'artState', unit: d.id, effects: { statuses: ['poison'], buffs: [{ source: 'test', stat: 'spd', amount: -3, duration: 'phase', turn: 1 }] } },
    { t: 'embers', cells: [{ pos: [4, 4], side: 'player', until: d.id }] },
    { t: 'object', object: 'wall', by: a.id, state: 'intact', hpAfter: 23 },
    { t: 'art', unit: a.id, target: 'wall', art: 'fw_art_60' },
  ];
  return { state, events, a, d };
}

test('replay boards retain per-strike lifesteal, temporary effects, embers and wall damage', () => {
  const { state, events, a, d } = fixture();
  const result = applyEvents(state, events);
  assert.equal(result.units.find(u => u.id === a.id).hp, 11);
  assert.equal(result.units.find(u => u.id === d.id).hp, 9);
  assert.deepEqual(result.units.find(u => u.id === d.id).artEffects, events[1].effects);
  assert.deepEqual(result.embers, events[2].cells);
  assert.equal(result.objects[0].hp, 23);
  assert.equal(state.objects[0].hp, 50);
  const end = applyEvents(result, [
    { t: 'artState', unit: d.id, effects: undefined }, { t: 'embers', cells: [] },
    { t: 'object', object: 'wall', by: a.id, state: 'destroyed', hpAfter: 0 },
  ]);
  assert.equal(end.units.find(u => u.id === d.id).artEffects, undefined);
  assert.deepEqual(end.embers, []);
  assert.equal(end.objects[0].hp, 0);
  assert.equal(end.map.tiles[1][1], 'floor');
});

for (const scenes of ['none', 'all']) test(`animated playback matches replay board with scenes=${scenes}`, async () => {
  const { state, events } = fixture();
  const host = {
    state: { view: state, settings: { scenes }, fading: new Set() },
    speed: 1e9,
    get() { return this.state; },
    set(patch) { Object.assign(this.state, patch); patch.combat?.done(); },
    focus() {}, float() {}, async showBanner() {},
  };
  await playEvents(host, events, state);
  assert.deepEqual(host.state.view, applyEvents(state, events));
});

test('phase recordings accept temporary-effect events before the first phase/action event', () => {
  const { state, a } = fixture();
  state.goal = { kind: 'defend', turns: 20 };
  for (const u of state.units) { u.acted = true; if (u.side === 'enemy') u.statuses = { sleep: true }; }
  a.artEffects = { buffs: [{ source: 'expired', stat: 'move', amount: -2, duration: 'phase', turn: 1 }] };
  const recording = replayFrom(state, [{ type: 'endPhase' }]);
  assert.ok(recording.steps.length);
  assert.equal(recording.steps[0].side, 'player');
  assert.equal(recording.steps[0].events[0].t, 'artState');
  assert.deepEqual(recording.states.at(-1).units.find(u => u.id === a.id).artEffects,
    recording.last.units.find(u => u.id === a.id).artEffects);
});
