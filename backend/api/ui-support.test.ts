import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { recordDeath, syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import type { Player } from './store.ts';

// Read-model additions the web pages rely on: story titles, the free-recruit status, what a dungeon
// run carries between maps, and gear surviving a reincarnation.

function setup(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

interface Chapter { chapter: number; available: boolean; completed: boolean; claimed: boolean; title: string | null; learned: string | null }

test('story chapters show a title once open and what was learned once completed', () => {
  const { store, accountId, player } = setup('story-ui');
  player.day = 499;
  store.savePlayer(player);
  const ctx = ctxFor(store, accountId, player);
  const story = () => dispatch(ctx, OP.GET_STORY, {}) as { bexp: number; chapters: Chapter[] };
  const first = story();
  assert.ok(first.bexp > 0);
  // 未开放且未完成的章节整行隐藏；第 499 日只有第 1 章开放。
  assert.equal(first.chapters.length, 1);
  const one = first.chapters[0];
  assert.equal(one.available, true, 'the seeded day is past day 120');
  assert.equal(one.title, '盛会');
  assert.equal(one.learned, null, 'nothing is spoiled before the chapter is completed');
  player.flags.questsDone = [...(player.flags.questsDone ?? []), 'story-1'];
  store.savePlayer(player);
  dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 1 });
  const done = story().chapters[0];
  assert.equal(done.completed, true);
  assert.ok(done.learned && done.learned.includes('求援信'));
});

test('the memorial reports the free emergency recruit status and the op follows it', () => {
  const { store, accountId, player } = setup('emergency-ui');
  const ctx = ctxFor(store, accountId, player);
  const status = () => (dispatch(ctx, OP.GET_MEMORIAL, {}) as { emergency: { deaths: number; available: boolean; blocker: string | null; survivors: number } }).emergency;
  assert.equal(status().available, false);
  assert.match(status().blocker ?? '', /新的真实伤亡/);
  // Real casualties until only two survivors remain (the protagonist included).
  for (const id of ['u_karl', 'u_victor', 'u_lina', 'u_owen', 'u_sera', 'u_noah', 'u_gustav', 'u_ren', 'u_ig', 'u_mira']) {
    recordDeath(store, player, store.unit(player.id, id)!, 'death', null);
  }
  const ready = status();
  assert.equal(ready.deaths, 10);
  assert.equal(ready.survivors, 2);
  assert.equal(ready.available, true);
  assert.equal(ready.blocker, null);
  const recruited = dispatch(ctx, OP.EMERGENCY_RECRUIT, {}) as { units: unknown[] };
  assert.equal(recruited.units.length, 2);
  const after = status();
  assert.equal(after.available, false);
  assert.match(after.blocker ?? '', /新的真实伤亡/);
  assert.throws(() => dispatch(ctx, OP.EMERGENCY_RECRUIT, {}), /新的真实伤亡/);
});

test('a dungeon run reports the HP and supplies each survivor carries into the next map', () => {
  const { store, accountId, player } = setup('run-ui');
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav'];
  const started = dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ids }) as { battleId: string };
  const battle = store.battle(player.id, started.battleId)!;
  const [leader, survivor, fallen] = battle.state.units.filter(u => u.side === 'player');
  leader.hp = 11;
  survivor.hp = 7;
  survivor.items = [{ id: 'vulnerary', uses: 1 }];
  fallen.hp = 0; fallen.alive = false;
  // Settle a controlled near-win: this checks carry data, not random autoplay strength.
  for (const enemy of battle.state.units.filter(u => u.side === 'enemy')) { enemy.hp = 0; enemy.alive = false; }
  assert.equal(battle.state.goal.kind, 'seize');
  if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
  store.saveBattle(battle);
  dispatch(ctx, OP.UNIT_ACT, { battleId: battle.id, unitId: leader.id, moveTo: leader.pos, action: 'seize' });
  const { run } = dispatch(ctx, OP.GET_RUN, {}) as { run: { state: string; survivingIds: string[]; carry: Record<string, { hp: number; items: { id: string; uses: number }[] }> } };
  assert.equal(run.state, 'between_maps');
  assert.deepEqual(Object.keys(run.carry).sort(), [...run.survivingIds].sort());
  assert.deepEqual(run.survivingIds, [leader.id, survivor.id]);
  assert.equal(run.carry[leader.id].hp, 11);
  assert.equal(run.carry[survivor.id].hp, 7);
  assert.deepEqual(run.carry[survivor.id].items, [{ id: 'vulnerary', uses: 1 }]);
});

test('annual reserves who did not play stay available in registration order; the dead drop out', () => {
  const { store, accountId, player } = setup('annual-ui');
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah', 'u_karl', 'u_sera'];
  dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ids });
  const first = dispatch(ctx, OP.START_ANNUAL_MATCH, {}) as { battleId: string };
  const deployed = store.battle(player.id, first.battleId)!.state.units.filter(u => u.side === 'player').map(u => u.id);
  assert.deepEqual(deployed, ids.slice(0, 6), 'the qualifier map fields the first six in registration order');
  dispatch(ctx, OP.SURRENDER, {});
  const entry = () => (dispatch(ctx, OP.GET_ANNUAL, {}) as { entry: { survivingIds: string[]; qualifierCount: number } }).entry;
  assert.equal(entry().qualifierCount, 1);
  assert.deepEqual(entry().survivingIds, ids, 'the two reserves are still on the list, in order');

  recordDeath(store, player, store.unit(player.id, 'u_sera')!, 'death', null);
  const second = dispatch(ctx, OP.START_ANNUAL_MATCH, {}) as { battleId: string };
  dispatch(ctx, OP.SURRENDER, { battleId: second.battleId });
  assert.deepEqual(entry().survivingIds, ids.filter(id => id !== 'u_sera'), 'a dead member never comes back');
});

test('reincarnation returns the carried weapons and items to the warehouse', () => {
  const { store, accountId, player } = setup('reincarnate-ui');
  const ctx = ctxFor(store, accountId, player);
  const unit = store.unit(player.id, 'u_victor')!;
  unit.level = 99;
  unit.weapons = ['steel_lance', 'javelin'];
  unit.items = [{ id: 'vulnerary', uses: 2 }];
  store.saveUnit(unit, player.id);
  store.addInventory(player.id, 'reincarnation_core', 0, 1);
  player.gold = 9000;
  store.savePlayer(player);
  const lances = store.countInventory(player.id, 'steel_lance');
  const javelins = store.countInventory(player.id, 'javelin');
  const vulneraries = store.inventory(player.id).filter(r => r.item === 'vulnerary' && r.uses === 2).reduce((n, r) => n + r.count, 0);

  // An invalid allocation is refused before anything moves.
  assert.throws(() => dispatch(ctx, OP.REINCARNATE_UNIT, { unitId: 'u_victor', allocation: { str: 11 } }), /单项分配上限/);
  assert.equal(store.countInventory(player.id, 'steel_lance'), lances);
  assert.deepEqual(store.unit(player.id, 'u_victor')!.weapons, ['steel_lance', 'javelin']);

  const result = dispatch(ctx, OP.REINCARNATE_UNIT, { unitId: 'u_victor', allocation: { str: 10, spd: 10, def: 10 } }) as { returned: { weapons: string[]; items: unknown[] } };
  assert.deepEqual(result.returned.weapons, ['steel_lance', 'javelin']);
  const after = store.unit(player.id, 'u_victor')!;
  assert.equal(after.level, 1);
  assert.equal(after.weapons.length, 0);
  assert.equal(store.countInventory(player.id, 'steel_lance'), lances + 1);
  assert.equal(store.countInventory(player.id, 'javelin'), javelins + 1);
  const returnedVulneraries = store.inventory(player.id).filter(r => r.item === 'vulnerary' && r.uses === 2).reduce((n, r) => n + r.count, 0);
  assert.equal(returnedVulneraries, vulneraries + 1, 'the item keeps its remaining uses');
  assert.equal(store.countInventory(player.id, 'reincarnation_core'), 0);
});
