// Frontend check for the new Fire-Emblem style battle interaction flow: first destination click
// only plans locally (ghost + contextual menu, no server call), a second click on the SAME landed
// tile commits exactly one move+wait, cancellation replans without spending, targeting modes never
// quick-wait, readonly/busy ignore clicks, and the shared menu source reflects the engine's legal
// options (dance only for a dancer with a valid target, inventory visible even at full HP).
// Pure controller/menu tests — no server, no browser (see battle-replay.e2e.mjs for that).
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
const { moveRange, step, unitById } = await import('@common/engine/index.ts');
const { BattleController } = await import('../src/battle/controller.ts');
const { actionMenu, carried } = await import('../src/battle/menu.ts');
const { clickCell } = await import('../src/battle/selection.ts');

const ERIN = [10, 6]; // erin's starting tile in the pinepass demo battle
const MAP_W = 24;

const keyTo = k => [k % MAP_W, Math.floor(k / MAP_W)];
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// A controller over a fresh demo battle whose "server" records every apply and answers instantly
// with the real engine result (so acted flags / hp evolve like a real battle, minus animation).
function harness({ readOnly = false } = {}) {
  const state = createPinepassBattle('menu-test');
  const calls = [];
  let authoritative = state;
  const session = {
    key: 'test', initial: state,
    meta: { region: '', goal: '', extraLabel: '', extraValue: '' },
    surrender: false, readOnly,
    apply: async action => {
      calls.push(action);
      const result = step(authoritative, action);
      authoritative = result.state;
      return { state: authoritative, events: [] }; // Playback has separate tests; input tests skip animation.
    },
    result: () => ({ title: '', won: false, lines: [], action: { label: '', run: () => {} } }),
  };
  return { state, calls, session, ctl: new BattleController(session) };
}

const mode = ctl => ctl.get().mode;
async function settled(ctl) {
  await Promise.resolve();
  // The commit goes action → (apply) → busy → playback → idle; wait out the whole transition.
  for (let i = 0; i < 200 && ctl.get().mode.kind !== 'idle'; i++) await new Promise(r => setTimeout(r, 5));
}

// A legal destination for erin right next to her start tile.
function nearStop(state, from, target = null) {
  const stops = [...moveRange(state, unitById(state, 'erin')).stops].map(keyTo);
  return target ? stops.find(p => manhattan(p, target) === 1) : stops.find(p => manhattan(p, from) === 1);
}

test('the first destination click only plans locally: ghost + menu, no server call', () => {
  const { state, ctl, calls } = harness();
  const dest = nearStop(state, ERIN);
  ctl.click(ERIN);
  assert.deepEqual(mode(ctl), { kind: 'move', unit: 'erin' });
  ctl.click(dest);
  assert.deepEqual(mode(ctl), { kind: 'action', unit: 'erin', to: dest });
  assert.equal(calls.length, 0);
  // A different reachable tile replans instead of committing.
  const other = [...moveRange(state, unitById(state, 'erin')).stops].map(keyTo).find(p => manhattan(p, dest) === 1);
  if (other) {
    ctl.click(other);
    assert.deepEqual(mode(ctl), { kind: 'action', unit: 'erin', to: other });
    assert.equal(calls.length, 0);
  }
});

test('clicking the same landed tile again sends exactly ONE move+wait', async () => {
  const { state, ctl, calls } = harness();
  const dest = nearStop(state, ERIN);
  ctl.click(ERIN);
  ctl.click(dest);
  ctl.click(dest); // quick confirm: 移动后待机 without touching the 待机 button
  assert.equal(mode(ctl).kind, 'busy', 'input locks before the asynchronous server reply');
  ctl.click(dest); // another physical click during the request must not enqueue a second write
  assert.deepEqual(calls, [{ type: 'act', unit: 'erin', to: dest, act: 'wait' }]);
  await settled(ctl);
  assert.equal(mode(ctl).kind, 'idle');
  assert.equal(calls.length, 1);
  assert.deepEqual(unitById(ctl.get().state, 'erin').pos, dest);
  assert.equal(unitById(ctl.get().state, 'erin').acted, true);
});

test('a failed command restores the action menu so the player can retry or cancel', async () => {
  const { state, ctl, session } = harness();
  const dest = nearStop(state, ERIN);
  session.apply = async () => { throw new Error('temporary connection failure'); };
  ctl.click(ERIN);
  ctl.click(dest);
  ctl.click(dest);
  assert.equal(mode(ctl).kind, 'busy');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(mode(ctl), { kind: 'action', unit: 'erin', to: dest });
  assert.match(ctl.get().notice, /temporary connection failure/);
  assert.equal(unitById(ctl.get().state, 'erin').acted, false);
  ctl.cancel();
  assert.equal(mode(ctl).kind, 'move');
});

test('cancelling the plan (Esc / right-click path) never calls the server', () => {
  const { state, ctl, calls } = harness();
  const dest = nearStop(state, ERIN);
  ctl.click(ERIN);
  ctl.click(dest);
  ctl.cancel();
  assert.deepEqual(mode(ctl), { kind: 'move', unit: 'erin' });
  assert.equal(calls.length, 0);
  ctl.cancel();
  assert.equal(mode(ctl).kind, 'idle');
  assert.equal(calls.length, 0);
});

test('clicks on enemies still resolve to the legal attack flow from move mode', () => {
  const { state, ctl, calls } = harness();
  const axe = unitById(state, 'axe1');
  unitById(state, 'erin').pos = [14, 7]; // adjacent to the axe fighter
  ctl.click([14, 7]);
  assert.deepEqual(mode(ctl), { kind: 'move', unit: 'erin' });
  ctl.click(axe.pos);
  assert.equal(mode(ctl).kind, 'attack');
  assert.equal(mode(ctl).target, 'axe1');
  assert.equal(calls.length, 0);
});

test('targeting modes never quick-wait: same-tile click returns to the action menu', () => {
  const { state, ctl, calls } = harness();
  const axe = unitById(state, 'axe1');
  const dest = nearStop(state, ERIN, axe.pos);
  ctl.click(ERIN);
  ctl.click(dest);
  ctl.chooseAction('attack');
  assert.equal(mode(ctl).kind, 'attack');
  assert.equal(mode(ctl).target, 'axe1'); // single target auto-picked
  ctl.click(dest); // clicking the landed tile in a targeting mode must NOT commit
  assert.equal(calls.length, 0);
  assert.deepEqual(mode(ctl), { kind: 'action', unit: 'erin', to: dest });
  // And clicking the enemy from the menu still targets it instead of quick-waiting.
  ctl.click(axe.pos);
  assert.equal(mode(ctl).kind, 'attack');
  assert.equal(mode(ctl).target, 'axe1');
  assert.equal(calls.length, 0);
});

test('readonly sessions and busy playback ignore clicks', () => {
  const { ctl, calls } = harness({ readOnly: true });
  ctl.click(ERIN);
  assert.equal(mode(ctl).kind, 'idle');
  assert.equal(calls.length, 0);
  const { ctl: busy, calls: busyCalls } = harness();
  busy.set({ mode: { kind: 'busy' } });
  busy.click(ERIN);
  assert.equal(mode(busy).kind, 'busy');
  assert.equal(busyCalls.length, 0);
});

test('the menu offers dance only for a dancer with a legal acted neighbour, and commits it', async () => {
  const { state, ctl, calls } = harness();
  unitById(state, 'lina').classId = 'dancer'; // lina stands at (11,4), gustav at (11,8)
  unitById(state, 'gustav').acted = true;
  const dest = nearStop(state, ERIN, [11, 8]); // a stop adjacent to gustav
  assert.ok(dest, 'erin should reach a tile next to gustav');
  // Non-dancer never sees 跳舞, wherever she stands.
  assert.ok(!actionMenu(state, 'erin', dest).some(e => e.action.id === 'dance'));
  // The dancer adjacent to an acted ally does.
  const linaMenu = actionMenu(state, 'lina', dest);
  assert.ok(linaMenu.some(e => e.action.id === 'dance'));
  // Without an acted ally the entry disappears again.
  unitById(state, 'gustav').acted = false;
  assert.ok(!actionMenu(state, 'lina', dest).some(e => e.action.id === 'dance'));
  unitById(state, 'gustav').acted = true;

  ctl.click(ERIN);
  ctl.click(dest);
  ctl.chooseAction('dance');
  assert.deepEqual(mode(ctl), { kind: 'dance', unit: 'erin', to: dest, target: null }); // erin had no dance targets
  ctl.cancel();

  const { state: s2, ctl: c2, calls: calls2 } = harness();
  unitById(s2, 'lina').classId = 'dancer';
  unitById(s2, 'gustav').acted = true;
  const linaStop = [...moveRange(s2, unitById(s2, 'lina')).stops].map(keyTo).find(p => manhattan(p, [11, 8]) === 1);
  assert.ok(linaStop, 'lina should reach a tile next to gustav');
  c2.click([11, 4]);
  c2.click(linaStop);
  c2.chooseAction('dance'); // single legal target auto-picked
  assert.equal(mode(c2).kind, 'dance');
  assert.equal(mode(c2).target, 'gustav');
  c2.confirm();
  await settled(c2);
  assert.deepEqual(calls2, [{ type: 'act', unit: 'lina', to: linaStop, act: 'dance', target: 'gustav' }]);
  assert.equal(calls2.length, 1);
});

test('持有物 is available at full HP; a potion is usable only once the unit is hurt', async () => {
  const { state, ctl, calls } = harness();
  const dest = nearStop(state, ERIN);
  // Full HP: the menu still lists 持有物, but the vulnerary is informational only.
  assert.ok(actionMenu(state, 'erin', dest).some(e => e.action.id === 'item'));
  const full = carried(state, 'erin', dest);
  assert.equal(full.consumables[0].name, '伤药');
  assert.equal(full.consumables[0].usable, false);
  assert.ok(full.weapons.length >= 3); // killing_edge, steel_sword, iron_sword all listed
  unitById(state, 'erin').spellbooks = [{ id: 'fire', charges: 1, maxCharges: 10 }];
  assert.ok(carried(state, 'erin', dest).weapons.some(entry => entry.name !== 'fire' && entry.name.length > 0 && entry.detail === '次数 1/10'));
  // Hurt, the same potion becomes usable through the existing item flow.
  unitById(state, 'erin').hp -= 5;
  assert.equal(carried(state, 'erin', dest).consumables[0].usable, true);
  ctl.click(ERIN);
  ctl.click(dest);
  ctl.chooseAction('item');
  ctl.useItem(0);
  await settled(ctl);
  assert.deepEqual(calls, [{ type: 'act', unit: 'erin', to: dest, act: 'item', item: 0 }]);
});

test('the shared menu source mirrors actionOptions exactly (single list, no divergence)', () => {
  const { state } = harness();
  const dest = nearStop(state, ERIN, unitById(state, 'axe1').pos);
  const menu = actionMenu(state, 'erin', dest);
  const ids = menu.map(e => e.action.id);
  // Fixed Fire-Emblem order: legal entries only, 持有物/移动/待机 always last, 攻击 first when legal.
  assert.equal(ids[0], 'attack');
  assert.ok(!ids.includes('dance') && !ids.includes('cast') && !ids.includes('heal') && !ids.includes('staff'));
  assert.deepEqual(ids.slice(-3), ['item', 'move', 'wait']);
  assert.ok(menu.map(e => e.label).join('·').includes('攻击·持有物·移动·待机'));
  // A cleric offers 治疗-style support and never 攻击.
  const noahMenu = actionMenu(state, 'noah', [8, 7]);
  const noaIds = noahMenu.map(e => e.action.id);
  assert.ok(noaIds.includes('item') && noaIds.includes('move') && noaIds.includes('wait'));
  assert.ok(!noaIds.includes('attack'));
  // clickCell still drives the same flow the menu sits on top of.
  const planned = clickCell(state, { kind: 'move', unit: 'erin' }, dest, null);
  assert.deepEqual(planned, { kind: 'action', unit: 'erin', to: dest });
});
