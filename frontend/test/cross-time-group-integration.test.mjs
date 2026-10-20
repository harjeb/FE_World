import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@common/') ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
} });
const { createPinepassBattle } = await import('../../backend/common/battles/pinepass.ts');
const { createCrossTimeGroups } = await import('../../backend/common/engine/cross-time-groups.ts');
const { applyEvents } = await import('../src/watch/recording.ts');
const { playEvents } = await import('../src/battle/playback.ts');
const { planningGroupWarnings } = await import('../src/battle/cross-time-groups.ts');
const { overlaysFor } = await import('../src/battle/overlays.ts');
const { describe } = await import('../src/battle/log.ts');

test('combat log displays the recorded trait result without rerolling', () => {
  const state = createPinepassBattle('trait-log'), unit = state.units[0], enemy = state.units.find(u => u.side === 'enemy');
  unit.skill = 'xiliang';
  for (const active of [false, true]) {
    const events = [{ t: 'combat', attacker: unit.id, defender: enemy.id, weapons: ['iron_sword', null], strikes: [], forecast: { traitRolls: { [unit.id]: active } } }];
    const before = JSON.stringify(state), log = describe(events, state);
    assert.ok(log.some(e => e.text.includes(`「西凉铁骑」${active ? '发动' : '未发动'}`)));
    assert.equal(JSON.stringify(state), before);
  }
});

test('animated and recording replay retain schedules and activation without changing the initial state', async () => {
  const state = createPinepassBattle('group-replay');
  state.crossTimeGroups = createCrossTimeGroups([{ id: 'b', group: 'B' }]);
  const events = [
    { t: 'cross_time_group', id: 'B', name: '中厅五谋', turn: 3, active: false, reason: '玩家越过警戒线' },
    { t: 'cross_time_group', id: 'B', name: '中厅五谋', turn: 3, active: true, reason: '玩家越过警戒线' },
  ];
  const host = { state: { view: state, settings: { scenes: 'none' } },
    get() { return this.state; }, set(patch) { Object.assign(this.state, patch); }, focus() {}, float() {}, async showBanner() {} };
  await playEvents(host, events, state);
  assert.deepEqual(host.state.view, applyEvents(state, events));
  assert.equal(host.state.view.crossTimeGroups[1].active, true);
  assert.equal(host.state.view.crossTimeGroups[1].activateTurn, 3);
  assert.equal(state.crossTimeGroups[1].activateTurn, undefined);
});

test('planning warnings cover move hover, hostile target, teleport and post-action landing', () => {
  const state = createPinepassBattle('group-warning');
  state.crossTimeGroups = createCrossTimeGroups([{ id: 'b', group: 'B' }]);
  const player = state.units.find(unit => unit.side === 'player');
  const enemy = state.units.find(unit => unit.side === 'enemy');
  state.crossTimeGroups[1].unitIds = [enemy.id];
  assert.equal(planningGroupWarnings(state, { kind: 'move', unit: player.id }, [0, 4]).length, 3);
  assert.match(planningGroupWarnings(state, { kind: 'attack', unit: player.id, to: [0, 19], target: enemy.id, weapon: player.weapons[0] }, null)[0], /未命中/);
  assert.equal(planningGroupWarnings(state, { kind: 'staff', unit: player.id, to: [0, 19], target: player.id, weapon: 'warp_staff', dest: [0, 4] }, null).length, 3);
  assert.equal(planningGroupWarnings(state, { kind: 'art', unit: player.id, to: [0, 19], target: null, art: null, weapon: null, postTo: [0, 8] }, null).length, 2);
});

test('hover and inspection show the same future range for dormant enemies', () => {
  const state = createPinepassBattle('group-range');
  const enemy = state.units.find(unit => unit.side === 'enemy');
  state.crossTimeGroups = [{ id: 'A', name: '前殿', unitIds: [enemy.id], active: false, activateTurn: 2 }];
  const hover = overlaysFor(state, { kind: 'idle' }, enemy.pos);
  assert.deepEqual(hover, overlaysFor(state, { kind: 'inspect', unit: enemy.id }, null));
  assert.ok(hover.move.size > 0); assert.ok(hover.attack.size > 0);
});
