import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classicAdaptation } from './classic-adaptation.ts';
import { validateClassicScenario } from './classic-validation.ts';
import { createClassicBattle, secretClaims } from './battles.ts';
import { createUnit } from './model.ts';
import { BOUND_WEAPONS, GAME_ITEMS } from './items.ts';
import { rankUpPool, rollRankUpLoot } from './rank-loot.ts';
import { purchasableRank } from './quest-shop.ts';
import { questAvailable, questById } from './quests.ts';
import type { Quest } from './quests.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { interactObject, interactionOptions, scenarioLoot } from '../engine/scenario.ts';
import type { BattleEvent } from '../engine/types.ts';

const party = () => (['erin', 'victor', 'gustav'] as const).map((character, index) => createUnit(character, 20, `u${index}`, 0));
const secretBattle = (lootRank: 'E' | 'C' | 'A', seed = 'secret', claimed: string[] = []) =>
  createClassicBattle(party(), { mapId: 'fe7-ch27-eliwood', seed, day: 240, stageIndex: 0, lootRank, claimed, quest: questById('clx-fe7') });
const secretIds = (state: { objects?: { id: string }[] }) => (state.objects ?? []).map(object => object.id).filter(id => id.startsWith('secret-'));

test('rank-up chests roll one rank above the base and never pay out bound weapons', () => {
  assert.equal(rankUpPool('E').rank, 'D');
  assert.equal(rankUpPool('C').rank, 'B');
  assert.equal(rankUpPool('B').rank, 'A');
  // S/SS/SSS are all unique quest weapons, so an A-rank base stays at A instead of an empty pool.
  assert.equal(rankUpPool('A').rank, 'A');
  for (const base of ['E', 'D', 'C', 'B', 'A'] as const) {
    const { rank, items } = rankUpPool(base);
    assert.ok(items.length >= 3, base);
    for (const id of items) {
      assert.equal(WEAPONS[id].rank, rank, id);
      assert.ok(!BOUND_WEAPONS.has(id), `${id} is bound`);
    }
  }
  const rolled = rollRankUpLoot('C', 'seed-a', 3);
  assert.deepEqual(rolled, rollRankUpLoot('C', 'seed-a', 3), 'the same seed rolls the same chests');
  assert.equal(new Set(rolled).size, 3, 'three chests in one battle do not repeat');
});

test('the purchasable rank follows unlocked regions and their reputation gates', () => {
  assert.equal(purchasableRank([], {}), 'D', 'the capital quartermaster rotates rank-D gear in');
  assert.equal(purchasableRank([1], { 1: 0 }), 'D');
  assert.equal(purchasableRank([1], { 1: 250 }), 'D', 'region 1 only sells an elixir now');
  assert.equal(purchasableRank([2], { 2: 250 }), 'B');
  assert.equal(purchasableRank([2], { 2: 500 }), 'A');
  assert.equal(purchasableRank([1], { 2: 500 }), 'D', 'reputation in a locked region does not count');
});

test('the FE6 dungeon silver-lance chest holds the unsellable old map only inside the FE6 route', () => {
  const chest = classicAdaptation('fe6-ch22-main').objects.find(object => object.id === 'chest-object-4')!;
  assert.deepEqual(chest.loot, { item: 'silver_lance', count: 1 });
  assert.deepEqual(chest.secret, { quest: 'clx-fe6', loot: { item: 'old_map', count: 1 } });
  const inRoute = createClassicBattle(party(), { mapId: 'fe6-ch22-main', seed: 'map', day: 240, stageIndex: 0, quest: questById('clx-fe6') });
  const routed = inRoute.state.objects!.find(object => object.id === 'chest-object-4')!;
  assert.deepEqual(routed.loot, { item: 'old_map', count: 1 });
  assert.equal(routed.once, true);
  assert.equal(routed.secret, undefined, 'adaptation-only fields stay out of the battle state');
  // The same map as a mixed-dungeon finale (no quest) keeps its original silver lance, and is not one-time.
  const finale = createClassicBattle(party(), { mapId: 'fe6-ch22-main', seed: 'map', day: 240, stageIndex: 2 });
  const plain = finale.state.objects!.find(object => object.id === 'chest-object-4')!;
  assert.deepEqual(plain.loot, { item: 'silver_lance', count: 1 });
  assert.equal(plain.once, undefined);
  const claimed = createClassicBattle(party(), { mapId: 'fe6-ch22-main', seed: 'map', day: 240, stageIndex: 0, quest: questById('clx-fe6'), claimed: ['fe6-ch22-main:chest-object-4'] });
  assert.ok(!claimed.state.objects!.some(object => object.id === 'chest-object-4'), 'a claimed old-map chest is gone for good');
  assert.equal(GAME_ITEMS.old_map.kind, 'key');
  assert.equal(GAME_ITEMS.old_map.bound, true);
  assert.deepEqual(validateClassicScenario('fe6-ch22-main'), []);
});

test('the FE7 secret room stays hidden until the throne-side chest is opened', () => {
  assert.deepEqual(validateClassicScenario('fe7-ch27-eliwood'), []);
  const record = secretBattle('C');
  const state = record.state;
  const secrets = state.objects!.filter(object => object.id.startsWith('secret-chest-'));
  assert.equal(secrets.length, 3);
  for (const chest of secrets) {
    assert.equal(chest.state, 'hidden');
    assert.equal(chest.lootRoll, undefined, 'the roll is resolved into fixed loot at creation');
    assert.equal(WEAPONS[chest.loot!.item as WeaponId].rank, 'B', 'one rank above the purchasable C');
    assert.equal(state.map.tiles[chest.pos[1]][chest.pos[0]], 'wall', 'the room starts walled in');
  }
  assert.deepEqual(secretBattle('C').state.objects, state.objects, 'the same seed freezes the same loot');
  assert.equal(WEAPONS[secretBattle('A').state.objects!.find(o => o.id === 'secret-chest-1')!.loot!.item as WeaponId].rank, 'A');

  const opener = state.units.find(unit => unit.side === 'player')!;
  opener.pos = [8, 5];
  assert.ok(!interactionOptions(state, opener, [7, 3]).some(option => option.object.startsWith('secret-chest-')), 'hidden chests cannot be used');
  const events: BattleEvent[] = [];
  interactObject(state, opener, 'secret-trigger', events);
  assert.equal(state.map.tiles[4][7], 'floor', 'a passage opens behind the throne');
  for (const chest of secrets) {
    assert.equal(chest.state, 'closed');
    assert.equal(state.map.tiles[chest.pos[1]][chest.pos[0]], 'floor');
  }
  assert.ok(events.some(event => event.t === 'scenario' && event.message.includes('密室')));

  opener.pos = [7, 3];
  interactObject(state, opener, 'secret-chest-2', events);
  const middle = secrets.find(chest => chest.id === 'secret-chest-2')!;
  assert.deepEqual(scenarioLoot(state).map(drop => drop.item), [middle.loot!.item]);
  assert.deepEqual(secretClaims(state), ['fe7-ch27-eliwood:secret-chest-2'], 'only looted one-time chests are claimed');
});

test('the secret room exists only in the FE7 route and each chest pays out once per account', () => {
  const outside = createClassicBattle(party(), { mapId: 'fe7-ch27-eliwood', seed: 'secret', day: 240, stageIndex: 2 });
  assert.deepEqual(secretIds(outside.state), [], 'a mixed-dungeon finale or tower floor has no secret room');
  assert.ok(!outside.state.scenario!.events.some(event => event.id === 'secret-room-open'));
  assert.ok(!outside.state.scenario!.mapChanges.some(change => change.id === 'secret-room'));
  assert.ok(outside.state.scenario!.mapChanges.some(change => change.id === 'lever-change-0'), 'the original lever stays');

  const partly = secretBattle('C', 'secret', ['fe7-ch27-eliwood:secret-chest-2']);
  assert.deepEqual(secretIds(partly.state), ['secret-trigger', 'secret-chest-1', 'secret-chest-3']);
  const reveal = partly.state.scenario!.events.find(event => event.id === 'secret-room-open')!;
  assert.ok(!reveal.actions.some(action => action.kind === 'setObject' && action.object === 'secret-chest-2'));
  const opener = partly.state.units.find(unit => unit.side === 'player')!;
  opener.pos = [8, 5];
  interactObject(partly.state, opener, 'secret-trigger', []);
  assert.equal(partly.state.objects!.find(object => object.id === 'secret-chest-3')!.state, 'closed');

  const emptied = secretBattle('C', 'secret', [1, 2, 3].map(i => `fe7-ch27-eliwood:secret-chest-${i}`));
  assert.deepEqual(secretIds(emptied.state), [], 'with every chest taken the trigger chest disappears too');
  assert.ok(!emptied.state.scenario!.events.some(event => event.id === 'secret-room-open'));
  assert.ok(!emptied.state.scenario!.mapChanges.some(change => change.id === 'secret-room'));
});

test('a hidden dungeon quest appears only while the required key item is held', () => {
  const base = questById('gw1')!;
  const hidden: Quest = { ...base, id: 'hidden-test', requires: { item: 'old_map' } };
  const done = new Set<string>();
  assert.equal(questAvailable(hidden, { done, reputation: 500 }), false);
  assert.equal(questAvailable(hidden, { done, reputation: 500, holds: () => false }), false);
  assert.equal(questAvailable(hidden, { done, reputation: 500, holds: item => item === 'old_map' }), true);
});
