import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ART_TRAINING, WEAPON_ART_BY_ID } from '../common/data/weapon-arts.ts';
import { switchClass } from '../common/game/mastery.ts';
import { reincarnate } from '../common/game/legacy.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { DAYS_PER_YEAR } from '../common/game/calendar.ts';
import { OP } from '../common/protocol/ops.ts';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'art-training', undefined, '研修测试');
  seedFullRoster(store, player);
  player.gold = 1_000_000;
  store.savePlayer(player);
  return { store, player, accountId, agentModel: null, push: () => {} };
}
const training = ART_TRAINING[0];
function ready(ctx: Context) {
  const unit = ctx.store.unit(ctx.player.id, 'u_erin')!;
  unit.learnedArts = [training.requires];
  ctx.store.saveUnit(unit, ctx.player.id);
  return unit;
}
function snapshot(ctx: Context) {
  return JSON.stringify({ player: ctx.player, saved: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id), events: ctx.store.events(ctx.player.id, '0') });
}
function train(ctx: Context, extra = {}) {
  return dispatch(ctx, OP.TRAIN_ART, { unitId: 'u_erin', art: training.art, ...extra });
}

test('all 103 upgrades have positive configured fees and require a learned base, not rank or current class', () => {
  const ctx = setup();
  const unit = ready(ctx);
  unit.ranks = { sword: 'E' };
  switchClass(unit, 'troubadour');
  assert.equal(ART_TRAINING.length, 103);
  assert.equal(new Set(ART_TRAINING.map(row => row.art)).size, 103);
  for (const row of ART_TRAINING) {
    const art = WEAPON_ART_BY_ID.get(row.art)!;
    assert.equal(row.days, Math.max(2, Math.ceil(art.cost / 2)));
    assert.equal(row.gold, row.days * 200);
    unit.learnedArts = [];
    ctx.store.saveUnit(unit, ctx.player.id);
    assert.throws(() => dispatch(ctx, OP.TRAIN_ART, { unitId: unit.id, art: row.art }), /基础战技/);
    unit.learnedArts = [row.requires];
    ctx.store.saveUnit(unit, ctx.player.id);
    const { day, gold } = ctx.player;
    dispatch(ctx, OP.TRAIN_ART, { unitId: unit.id, art: row.art });
    assert.equal(ctx.player.day, day + row.days);
    assert.equal(ctx.player.gold, gold - row.gold);
    assert.deepEqual(ctx.store.unit(ctx.player.id, unit.id)!.learnedArts, [row.requires, row.art]);
  }
});

test('training quotes, command receipts and reloads pay and learn once, without mastery or experience', () => {
  const ctx = setup();
  const unit = ready(ctx);
  const before = snapshot(ctx);
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'art_training', unitId: unit.id, art: training.art }) as {
    quoteId: string; costDays: number; costGold: number; toDay: number; blockers: string[];
  };
  assert.equal(snapshot(ctx), before, 'preview does not change the player or units');
  assert.equal(quote.costDays, training.days);
  assert.equal(quote.costGold, training.gold);
  assert.equal(quote.toDay, ctx.player.day + training.days);
  assert.deepEqual(quote.blockers, []);
  const command = { quoteId: quote.quoteId, commandId: 'train-once' };
  const result = dispatch(ctx, OP.EXECUTE_ACTION, command);
  const after = snapshot(ctx);
  assert.equal(JSON.stringify(dispatch(ctx, OP.EXECUTE_ACTION, command)), JSON.stringify(result));
  assert.equal(snapshot(ctx), after);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), /过期/);
  assert.throws(() => train(ctx), /已经学会/);
  assert.equal(snapshot(ctx), after);
  const saved = ctx.store.unit(ctx.player.id, unit.id)!;
  assert.equal(saved.exp, unit.exp);
  assert.equal(saved.level, unit.level);
  assert.deepEqual(saved.classMastery, unit.classMastery);
  switchClass(saved, 'commoner');
  ctx.store.saveUnit(saved, ctx.player.id);
  const reloaded = ctx.store.unit(ctx.player.id, unit.id)!;
  assert.ok(reloaded.learnedArts!.includes(training.art));
  reloaded.level = 99;
  reloaded.isProtagonist = false;
  reincarnate(reloaded, {}, 'commoner', DAYS_PER_YEAR, ctx.player.day);
  assert.deepEqual(reloaded.learnedArts, []);
});

test('direct training receipts and changed payload conflicts do not pay twice', () => {
  const ctx = setup();
  ready(ctx);
  const result = train(ctx, { commandId: 'direct-once' });
  const after = snapshot(ctx);
  assert.equal(JSON.stringify(train(ctx, { commandId: 'direct-once' })), JSON.stringify(result));
  assert.throws(() => train(ctx, { commandId: 'direct-once', art: ART_TRAINING[1].art }), /commandId/);
  assert.equal(snapshot(ctx), after);
});

test('invalid, unavailable or unaffordable training leaves all saved state unchanged', () => {
  for (const condition of ['unknown', 'no-base', 'gold', 'dead', 'retired', 'run', 'dispatch', 'lease', 'lifespan', 'battle', 'annual'] as const) {
    const ctx = setup();
    const unit = ready(ctx);
    let pattern = /该战技不是/;
    if (condition === 'no-base') { unit.learnedArts = []; pattern = /基础战技/; }
    if (condition === 'gold') { ctx.player.gold = 0; pattern = /金币/; }
    if (condition === 'dead' || condition === 'retired') { unit.status = condition; pattern = /现役/; }
    if (condition === 'run') { unit.lockedRunId = 'run-busy'; pattern = /远征/; }
    if (condition === 'dispatch') { unit.lockedDispatchId = 'dispatch-busy'; pattern = /派遣/; }
    if (condition === 'lease') { ctx.player.flags.controlLease = { owner: 'agent', expiresAt: Date.now() + 60_000 }; pattern = /控制权/; }
    ctx.store.saveUnit(unit, ctx.player.id);
    if (condition === 'lifespan') {
      const other = ctx.store.unit(ctx.player.id, 'u_karl')!;
      other.ageEpochDay = ctx.player.day;
      other.ageBaseDays = other.lifespanYears * DAYS_PER_YEAR - training.days;
      ctx.store.saveUnit(other, ctx.player.id);
      pattern = /寿终/;
    }
    if (condition === 'battle') {
      const battle = createFieldBattle([ctx.store.unit(ctx.player.id, 'u_karl')!], { region: 1, cleared: 0, day: ctx.player.day, seed: 'training-busy' });
      battle.playerId = ctx.player.id;
      ctx.store.saveBattle(battle);
      pattern = /战斗结束/;
    }
    if (condition === 'annual') { dispatch(ctx, OP.REGISTER_ANNUAL, { unitIds: ['u_karl', 'u_ig'] }); pattern = /大竞技场/; }
    ctx.store.savePlayer(ctx.player);
    const before = snapshot(ctx);
    assert.throws(() => train(ctx, { art: condition === 'unknown' ? unit.learnedArts![0] : training.art }), pattern, condition);
    assert.equal(snapshot(ctx), before, condition);
    if (condition !== 'unknown' && condition !== 'lease') {
      const listing = dispatch(ctx, OP.GET_ART_TRAINING, { unitId: unit.id }) as { choices: { art: string; available: boolean; blocker: string }[] };
      const row = listing.choices.find(row => row.art === training.art)!;
      assert.equal(row.available, false, condition);
      assert.match(row.blocker, pattern, condition);
      const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'art_training', unitId: unit.id, art: training.art }) as { quoteId: string; blockers: string[] };
      assert.ok(quote.blockers.length > 0, condition);
      assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), pattern, condition);
      assert.equal(snapshot(ctx), before, condition);
    }
  }
});

test('a quote is revalidated if the unit becomes busy without a player version change', () => {
  const ctx = setup();
  const unit = ready(ctx);
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'art_training', unitId: unit.id, art: training.art }) as { quoteId: string };
  unit.lockedDispatchId = 'now-busy';
  ctx.store.saveUnit(unit, ctx.player.id);
  const before = snapshot(ctx);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }), /派遣/);
  assert.equal(snapshot(ctx), before);
});
