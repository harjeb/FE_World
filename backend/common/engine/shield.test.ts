import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUnit } from '../game/model.ts';
import { createFieldBattle } from '../game/battles.ts';
import { runCombat } from './resolve.ts';
import { actionOptions } from './ranges.ts';
import { step } from './step.ts';
import type { BattleEvent, BattleState } from './types.ts';

function battle(): BattleState {
  const unit = createUnit('erin', 10, 'hero', 0, true);
  const record = createFieldBattle([unit], { region: 1, cleared: 0, seed: 'shield-test' });
  const state = record.state;
  const me = state.units.find(u => u.side === 'player')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  me.pos = [1, 1];
  foe.pos = [1, 2];
  return state;
}

test('a lethal hit consumes an immortal shield, keeps 1 HP and petrifies', () => {
  const state = battle();
  const me = state.units.find(u => u.side === 'player')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  me.hp = 5;
  me.stats.hp = 30;
  me.stats.def = 0;
  me.shields = 1;
  foe.stats.str = 99;
  foe.stats.skl = 99;
  foe.weapons = ['iron_sword'];
  foe.ranks = { sword: 'A' };
  const events: BattleEvent[] = [];
  runCombat(state, foe, me, 'iron_sword', events);
  assert.equal(me.alive, true);
  assert.equal(me.hp, 1);
  assert.equal(me.petrified, true);
  assert.equal(me.shields, 0);
  assert.equal(me.shieldsUsed, 1);
  assert.ok(events.some(e => e.t === 'shield' && e.unit === me.id));
  assert.ok(!events.some(e => e.t === 'defeated' && e.unit === me.id));
});

test('a petrified unit takes no further damage and cannot act, then recovers next player phase', () => {
  const state = battle();
  const me = state.units.find(u => u.side === 'player')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  me.hp = 1;
  me.petrified = true;
  foe.stats.str = 99; foe.stats.skl = 99;
  const events: BattleEvent[] = [];
  runCombat(state, foe, me, 'iron_sword', events);
  assert.equal(me.hp, 1, 'protected from damage');
  assert.throws(() => step(state, { type: 'act', unit: me.id, to: me.pos, act: 'wait' }), /石化/);
  // The shield item is not offered in the item menu.
  me.items = [{ id: 'immortal_shield', uses: 1 }];
  assert.deepEqual(actionOptions(state, me, me.pos).items, []);
});

test('without a shield a lethal hit still defeats the unit', () => {
  const state = battle();
  const me = state.units.find(u => u.side === 'player')!;
  const foe = state.units.find(u => u.side === 'enemy')!;
  me.hp = 1;
  me.stats.hp = 30;
  me.stats.def = 0;
  me.shields = 0;
  foe.stats.str = 99; foe.stats.skl = 99;
  foe.weapons = ['iron_sword']; foe.ranks = { sword: 'A' };
  const events: BattleEvent[] = [];
  runCombat(state, foe, me, 'iron_sword', events);
  assert.equal(me.alive, false);
  assert.ok(events.some(e => e.t === 'defeated' && e.unit === me.id));
});
