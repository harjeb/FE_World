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
import { decide } from '../common/engine/index.ts';
import { stats } from '../common/data/types.ts';
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

function playOut(ctx: Context, battleId: string): string {
  for (let guard = 0; guard < 3000; guard++) {
    const battle = ctx.store.battle(ctx.player.id, battleId);
    if (!battle || battle.state.result) return battle?.state.result?.winner ?? 'none';
    const unit = battle.state.units.find(u => u.side === 'player' && u.alive && !u.acted);
    if (unit) {
      const action = decide(battle.state, unit);
      dispatch(ctx, OP.UNIT_ACT, {
        battleId: battle.id, unitId: unit.id, moveTo: action.to, action: action.act,
        targetId: 'target' in action ? action.target : undefined,
        weapon: 'weapon' in action ? action.weapon : undefined,
        item: 'item' in action ? action.item : undefined,
      });
    } else {
      dispatch(ctx, OP.END_PHASE, { battleId: battle.id });
    }
  }
  throw new Error('battle did not finish');
}

function empower(store: Store, player: Player): void {
  for (const unit of store.units(player.id)) {
    if (unit.status !== 'active') continue;
    unit.level = 99;
    unit.stats = stats(150, 99, 99, 99, 99, 99, 99, 99);
    unit.hp = 150;
    store.saveUnit(unit, player.id);
  }
}

test('the annual arena runs three qualifiers then a six-round knockout', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player);
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
    assert.equal(playOut(ctx, match.battleId), 'player');
  }
  let entry = (dispatch(ctx, OP.GET_ANNUAL, {}) as { entry: { state: string; round: number; qualifierWins: number } }).entry;
  assert.equal(entry.state, 'knockout');
  assert.equal(entry.qualifierWins, 3);
  assert.equal(entry.round, 1);
  // Six knockout wins -> champion.
  for (let i = 0; i < 6; i++) {
    const match = dispatch(ctx, OP.START_ANNUAL_MATCH, {}) as { battleId: string };
    assert.equal(playOut(ctx, match.battleId), 'player');
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
  assert.equal(story.chapters.length, 8);
  assert.equal(story.chapters[0].available, true, 'chapter 1 is open at day 999');
  assert.equal(story.chapters[1].available, true, 'chapter 2 opens at day 982');
  assert.equal(story.chapters[2].available, false, 'chapter 3 opens at day 1482');
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 3 }), /尚未开放/);
  dispatch(ctx, OP.COMPLETE_STORY_EVENT, { chapter: 1 });
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
  empower(store, player);
  dispatch(ctx, OP.START_DUNGEON, { region: 1, unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.REGISTER_ANNUAL, {}), /进行中的战斗|远征/);
  void accountId;
});
