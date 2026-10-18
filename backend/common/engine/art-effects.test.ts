import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinepassBattle } from '../battles/pinepass.ts';
import { addArtBuff, afterClassicArt, artBonus, artHeal, artStats, consumeArtExchange, expireArtPhase, inflictArtStatus } from './art-effects.ts';
import type { BattleEvent } from './types.ts';

function setup() {
  const state = createPinepassBattle('art-effects');
  state.objects = [];
  state.map = { width: 8, height: 8, tiles: Array.from({ length: 8 }, () => Array(8).fill('plain')) };
  const unit = state.units[0], target = state.units[1];
  state.units = [unit, target];
  unit.side = 'player'; target.side = 'enemy'; unit.pos = [2, 2]; target.pos = [3, 2];
  unit.alive = target.alive = true; unit.hp = unit.stats.hp; target.hp = target.stats.hp;
  const events: BattleEvent[] = [];
  return { state, unit, target, events };
}

test('map family cap, strongest temporary boosts/penalties, and immutable base stats', () => {
  const { state, unit, events } = setup();
  const base = { ...unit.stats };
  addArtBuff(state, unit, 'base', 'str', 7, 'map', events, 10);
  addArtBuff(state, unit, 'upgrade', 'str', 7, 'map', events, 10);
  addArtBuff(state, unit, 'a', 'str', 3, 'next_phase', events);
  addArtBuff(state, unit, 'b', 'str', 5, 'exchange', events);
  addArtBuff(state, unit, 'a', 'str', 1, 'next_phase', events);
  addArtBuff(state, unit, 'c', 'str', -2, 'phase', events);
  addArtBuff(state, unit, 'd', 'str', -4, 'phase', events);
  assert.equal(artBonus(unit, 'str'), 11);
  assert.equal(artStats(unit).str, base.str + 11);
  assert.deepEqual(unit.stats, base);
  addArtBuff(state, unit, 'x', 'def', -999, 'phase', events);
  assert.equal(artStats(unit).def, 0);
  assert.equal(artStats(unit).hp, base.hp);
});

test('phase boundaries are side-specific and unrelated action refresh does not expire effects', () => {
  const { state, target, events } = setup();
  addArtBuff(state, target, 'a', 'spd', -2, 'phase', events);
  addArtBuff(state, target, 'b', 'def', 3, 'next_phase', events);
  inflictArtStatus(target, 'root', events);
  target.acted = false;
  expireArtPhase(state, 'player', 'end', events);
  assert.equal(artBonus(target, 'spd'), -2);
  expireArtPhase(state, 'enemy', 'start', events);
  assert.equal(artBonus(target, 'def'), 0);
  assert.deepEqual(target.artEffects?.statuses, ['root']);
  expireArtPhase(state, 'enemy', 'end', events);
  assert.equal(artBonus(target, 'spd'), 0);
  assert.deepEqual(target.artEffects?.statuses, []);
});

test('poison is nonlethal and immunities prevent status/debuff and poison damage', () => {
  const { state, unit, events } = setup();
  unit.hp = 2; unit.stats.hp = 100;
  inflictArtStatus(unit, 'poison', events);
  expireArtPhase(state, 'player', 'end', events);
  assert.equal(unit.hp, 1);
  unit.immunities = ['poison', 'debuff', 'movement_debuff'];
  inflictArtStatus(unit, 'poison', events); inflictArtStatus(unit, 'root', events);
  addArtBuff(state, unit, 'x', 'str', -2, 'phase', events);
  assert.equal(artBonus(unit, 'str'), 0);
  assert.deepEqual(unit.artEffects?.statuses, []);
});

test('art healing clamps and respects healing ban, death and petrification', () => {
  const { unit, events } = setup();
  unit.hp = unit.stats.hp - 2;
  assert.equal(artHeal(unit, 20, null, events), 2);
  unit.hp--;
  unit.immunities = ['healing']; assert.equal(artHeal(unit, 20, null, events), 0);
  unit.immunities = []; unit.petrified = true; assert.equal(artHeal(unit, 20, null, events), 0);
  unit.petrified = false; unit.hp = 0; assert.equal(artHeal(unit, 20, null, events), 0);
  assert.equal(events.filter(e => e.t === 'heal').length, 1);
});

test('exchange consumes only old records even when same source is refreshed', () => {
  const { state, unit, events } = setup();
  addArtBuff(state, unit, 'x', 'avoid', -10, 'exchange', events);
  const old = [...unit.artEffects!.buffs!];
  addArtBuff(state, unit, 'x', 'avoid', -10, 'exchange', events);
  consumeArtExchange(unit, old, events);
  assert.equal(artBonus(unit, 'avoid'), -10);
  consumeArtExchange(unit, [...unit.artEffects!.buffs!], events);
  assert.equal(artBonus(unit, 'avoid'), 0);
});

test('push checks hit, occupancy, adjacency and terrain without refreshing actions', () => {
  const { state, unit, target, events } = setup();
  target.acted = true;
  afterClassicArt(state, unit, target, 'push', { push: true }, false, false, events);
  assert.deepEqual(target.pos, [3, 2]);
  state.map.tiles[2][4] = 'wall';
  afterClassicArt(state, unit, target, 'push', { push: true }, true, false, events);
  assert.deepEqual(target.pos, [3, 2]);
  state.map.tiles[2][4] = 'plain';
  afterClassicArt(state, unit, target, 'push', { push: true }, true, false, events);
  assert.deepEqual(target.pos, [4, 2]);
  assert.equal(target.acted, true);
  assert.equal(target.artEffects?.displaced, true);
  assert.ok(events.some(e => e.t === 'move'));
});
