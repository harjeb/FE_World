import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'annual', undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

function winMatch(ctx: Context, battleId: string): string {
  // This test checks bracket progression; randomized autoplay need not win every matchup.
  const battle = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = battle.state.units.find(unit => unit.side === 'player' && unit.boss)!;
  for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
  ctx.store.saveBattle(battle);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: leader.id, moveTo: leader.pos,
    action: battle.state.goal.kind === 'seize' ? 'seize' : 'wait' });
  return ctx.store.battle(ctx.player.id, battleId)!.state.result!.winner;
}

test('the annual arena runs three qualifiers then a six-round knockout', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const view = dispatch(ctx, OP.GET_ANNUAL, {}) as { annualIndex: number; windowOpen: boolean; entry: unknown };
  assert.equal(view.annualIndex, 2);
  assert.equal(view.windowOpen, true);
  assert.equal(view.entry, null);
  const registered = dispatch(ctx, OP.REGISTER_ANNUAL, {}) as { entry: { state: string; id: string } };
  assert.equal(registered.entry.state, 'qualifier');
  // The same year cannot be registered twice.
  assert.throws(() => dispatch(ctx, OP.REGISTER_ANNUAL, {}), /已经报名/);
  // Three qualifier wins.
  for (let i = 0; i < 3; i++) {
    const match = dispatch(ctx, OP.START_ANNUAL_MATCH, {}) as { battleId: string; entry: { state: string; qualifierWins: number } };
    assert.equal(winMatch(ctx, match.battleId), 'player');
  }
  let entry = (dispatch(ctx, OP.GET_ANNUAL, {}) as { entry: { state: string; round: number; qualifierWins: number } }).entry;
  assert.equal(entry.state, 'knockout');
  assert.equal(entry.qualifierWins, 3);
  assert.equal(entry.round, 1);
  // Six knockout wins -> champion.
  for (let i = 0; i < 6; i++) {
    const match = dispatch(ctx, OP.START_ANNUAL_MATCH, {}) as { battleId: string };
    assert.equal(winMatch(ctx, match.battleId), 'player');
  }
  entry = (dispatch(ctx, OP.GET_ANNUAL, {}) as { entry: { state: string; round: number } }).entry;
  assert.equal(entry.state, 'champion');
  // A champion cannot start another match this year.
  assert.throws(() => dispatch(ctx, OP.START_ANNUAL_MATCH, {}), /报名/);
});

test('story chapters open on the personal calendar and pay once', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const story = dispatch(ctx, OP.GET_STORY, {}) as { chapters: { chapter: number; available: boolean; completed: boolean; claimed: boolean }[] };
  // 日期已到第二章，但第一章调查完成前不下发第二章内容。
  assert.deepEqual(story.chapters.map(c => c.chapter), [1]);
  assert.equal(story.chapters[0].available, true, 'chapter 1 is open at day 999');
  assert.equal(story.chapters.some(c => c.chapter === 3), false, 'chapter 3 opens at day 1482 and stays hidden');
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 3 }), /尚未开放/);
  // 章节事件由主线任务完成；没打主线任务前不能直接标记完成。
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 1 }), /先完成本章主线任务/);
  player.flags.questsDone = [...(player.flags.questsDone ?? []), 'story-1'];
  store.savePlayer(player);
  dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 1 });
  const next = dispatch(ctx, OP.GET_STORY, {}) as typeof story;
  assert.deepEqual(next.chapters.map(c => c.chapter), [1, 2]);
  assert.equal(next.chapters[1].available, true, 'chapter 2 follows the completed investigation once its date arrives');
  const bexp = player.bexp;
  const claimed = dispatch(ctx, OP.CLAIM_REWARD, { rewardKey: 'chapter:1' }) as { bexp: number };
  assert.equal(claimed.bexp, 1350);
  assert.equal(player.bexp, bexp + 1350);
  assert.throws(() => dispatch(ctx, OP.CLAIM_REWARD, { rewardKey: 'chapter:1' }), /领取过/);
  assert.throws(() => dispatch(ctx, OP.CLAIM_REWARD, { rewardKey: 'nope' }), /奖励键/);
});

test('the annual entry is unique per year and rejected while a run is active', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.REGISTER_ANNUAL, {}), /进行中的战斗|远征/);
  void accountId;
});
