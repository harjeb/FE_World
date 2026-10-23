import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, battleView, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { ALL_QUESTS, supportsHardQuest } from '../common/game/quests.ts';
import { createClassicBattle, createFieldBattle } from '../common/game/battles.ts';
import { createRun, runSummary } from '../common/game/expedition.ts';
import { enemyStats, HARD_ENEMY_RULES } from '../common/game/enemies.ts';
import { CLASSES } from '../common/data/classes.ts';
import { STAT_KEYS } from '../common/data/types.ts';
import type { UnitState } from '../common/engine/types.ts';
import { canWield } from '../common/engine/units.ts';

function assertBoosted(enemy: UnitState, field = false) {
  const base = enemyStats(enemy.classId, enemy.level, field && enemy.boss);
  for (const key of STAT_KEYS) {
    const low = key === 'hp' ? HARD_ENEMY_RULES.hpMin : HARD_ENEMY_RULES.statMin;
    const high = key === 'hp' ? HARD_ENEMY_RULES.hpMax : HARD_ENEMY_RULES.statMax;
    const cap = CLASSES[enemy.classId].caps[key] ?? Infinity;
    assert.ok(enemy.stats[key] >= Math.min(cap, base[key] + Math.max(1, Math.ceil(base[key] * low / 100))), `${enemy.id} ${key}: minimum bonus`);
    assert.ok(enemy.stats[key] <= Math.min(cap, base[key] + Math.max(1, Math.ceil(base[key] * high / 100))), `${enemy.id} ${key}: maximum bonus`);
  }
  assert.ok(enemy.con >= 9 && enemy.con <= 11);
  assert.ok(enemy.weapons.every(id => canWield(enemy, id)), `${enemy.id}: legal equipment`);
  assert.equal(enemy.hp, enemy.stats.hp);
}

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'difficulty', undefined, 'AI tests');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1];
  // These tests cover difficulty persistence; unlock progression has its own settlement regressions.
  player.flags.hardUnlocks = { regions: [1], dungeons: [1], quests: ALL_QUESTS.filter(supportsHardQuest).map(q => q.id) };
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push: () => {} };
}
const single = ALL_QUESTS.find(q => !q.scenarioId && !q.scenarioIds && q.tier !== 'region')!;
const randomMulti = ALL_QUESTS.find(q => !q.scenarioId && !q.scenarioIds && q.tier === 'region')!;
const classicSingle = ALL_QUESTS.find(q => q.scenarioId)!;
const classicMulti = ALL_QUESTS.find(q => !q.archived && q.scenarioIds?.length)!;
function unlock(ctx: Context, questId: string) {
  ctx.player.flags.questsDone = ALL_QUESTS.filter(q => q.id !== questId).map(q => q.id);
  ctx.player.flags.regionReputation = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 9999]));
  ctx.store.savePlayer(ctx.player);
}
function start(ctx: Context, op: number, args: Record<string, unknown>) {
  const result = dispatch(ctx, op, { unitIds: ['u_erin'], ...args }) as { battleId: string; battle: { aiDifficulty: string }; run?: { aiDifficulty: string } };
  if (result.battle.aiDifficulty === 'hard') {
    const record = ctx.store.battle(ctx.player.id, result.battleId)!;
    const field = !record.questId && !record.dungeon;
    for (const enemy of record.state.units.filter(u => u.side === 'enemy')) {
      assertBoosted(enemy, field);
    }
  }
  return result;
}
function win(ctx: Context, battleId: string) {
  const b = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = b.state.units.find(u => u.side === 'player')!;
  for (const enemy of b.state.units.filter(u => u.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (b.state.goal.kind === 'seize') leader.pos = [...b.state.goal.throne];
  ctx.store.saveBattle(b);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: leader.id, moveTo: leader.pos, action: b.state.goal.kind === 'seize' ? 'seize' : 'wait', aiDifficulty: 'normal' });
}

test('invalid start/preview difficulty fails without changing stored player, units, battles or runs', () => {
  for (const [op, args] of [[OP.SORTIE, { region: 1 }], [OP.START_DUNGEON, { region: 1 }], [OP.START_QUEST, { questId: single.id }], [OP.PREVIEW_ACTION, { action: 'sortie', region: 1 }], [OP.PREVIEW_ACTION, { action: 'dungeon', region: 1 }]] as const) {
    const ctx = setup();
    const before = { player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) };
    for (const aiDifficulty of [null, '', 'HARD', 'easy', 1, true, {}]) {
      assert.throws(() => dispatch(ctx, op, { ...args, aiDifficulty }), { code: 'BAD_REQUEST' });
      assert.deepEqual({ player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) }, before);
      assert.equal(ctx.store.activeBattle(ctx.player.id), null);
      assert.equal(ctx.store.activeRun(ctx.player.id), null);
    }
  }
});

test('default and legacy records normalize to normal; hard survives actions and stored reload', () => {
  const ctx = setup();
  const started = start(ctx, OP.SORTIE, { region: 1 });
  assert.equal(started.battle.aiDifficulty, 'normal');
  const legacy = ctx.store.battle(ctx.player.id, started.battleId)!;
  delete legacy.state.aiDifficulty;
  assert.equal(battleView(legacy, false).aiDifficulty, 'normal');
  const run = createRun('legacy', ctx.player.id, 1, [], 1, 0);
  assert.equal(run.aiDifficulty, 'normal');
  delete run.aiDifficulty;
  assert.equal(runSummary(run).aiDifficulty, 'normal');
  dispatch(ctx, OP.RETREAT, {});
  const hard = start(ctx, OP.SORTIE, { region: 1, aiDifficulty: 'hard' });
  const record = ctx.store.battle(ctx.player.id, hard.battleId)!;
  const unit = record.state.units.find(u => u.side === 'player')!;
  dispatch(ctx, OP.UNIT_ACT, { battleId: hard.battleId, unitId: unit.id, moveTo: unit.pos, action: 'wait', aiDifficulty: 'normal' });
  const reload = new Store(ctx.store.db).battle(ctx.player.id, hard.battleId)!;
  assert.equal(reload.state.aiDifficulty, 'hard');
  assert.equal(reload.initial.aiDifficulty, 'hard');
  assert.deepEqual(reload.state.units.filter(u => u.side === 'enemy'), record.state.units.filter(u => u.side === 'enemy'));
});

for (const quest of [randomMulti, classicMulti]) {
  test(`quest ${quest.id} persists hard and multi-map continuation cannot override it`, () => {
    const ctx = setup();
    unlock(ctx, quest.id);
    let started = start(ctx, OP.START_QUEST, { questId: quest.id, aiDifficulty: 'hard' });
    assert.equal(started.battle.aiDifficulty, 'hard');
    assert.equal(ctx.store.battle(ctx.player.id, started.battleId)!.initial.aiDifficulty, 'hard');
    if (!started.run) return;
    const count = quest.scenarioIds?.length ?? 3;
    for (let i = 1; i < count; i++) {
      win(ctx, started.battleId);
      ctx.player = ctx.store.getPlayer(ctx.player.id)!;
      ctx.player.day += 31;
      ctx.store.savePlayer(ctx.player);
      started = start(ctx, OP.CONTINUE_DUNGEON, { aiDifficulty: 'normal' });
      assert.equal(started.battle.aiDifficulty, 'hard');
      assert.equal(started.run!.aiDifficulty, 'hard');
      assert.equal((dispatch(ctx, OP.GET_RUN, {}) as { run: { aiDifficulty: string } }).run.aiDifficulty, 'hard');
      assert.equal(ctx.store.battle(ctx.player.id, started.battleId)!.initial.aiDifficulty, 'hard');
    }
  });
}

for (const quest of [single]) {
  test(`single-map quest ${quest.id} remains normal-only even with other hard content unlocked`, () => {
    const ctx = setup();
    unlock(ctx, quest.id);
    const before = ctx.store.getPlayer(ctx.player.id);
    assert.throws(() => start(ctx, OP.START_QUEST, { questId: quest.id, aiDifficulty: 'hard' }), { code: 'FORBIDDEN' });
    assert.deepEqual(ctx.store.getPlayer(ctx.player.id), before);
    assert.equal(start(ctx, OP.START_QUEST, { questId: quest.id }).battle.aiDifficulty, 'normal');
  });
}

for (const action of ['sortie', 'dungeon']) {
  test(`${action} quotes and execution preserve the approved difficulty`, () => {
    for (const aiDifficulty of [undefined, 'hard']) {
      const ctx = setup();
      const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action, region: 1, unitIds: ['u_erin'], aiDifficulty }) as { quoteId: string; aiDifficulty: string; aiDifficultyText: string; payload: { aiDifficulty: string } };
      assert.equal(quote.payload.aiDifficulty, aiDifficulty ?? 'normal');
      assert.equal(quote.aiDifficulty, aiDifficulty ?? 'normal');
      assert.ok(quote.aiDifficultyText.includes(aiDifficulty ?? 'normal'));
      if (aiDifficulty === 'hard') {
        for (const text of ['50%', '2', '5', '20', '35', '10', '25', '体格', '装备', '移动']) assert.ok(quote.aiDifficultyText.includes(text), text);
      }
      const started = start(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId, aiDifficulty: 'normal' });
      assert.equal(started.battle.aiDifficulty, aiDifficulty ?? 'normal');
      if (action === 'dungeon') {
        win(ctx, started.battleId);
        const continued = start(ctx, OP.CONTINUE_DUNGEON, { aiDifficulty: 'normal' });
        assert.equal(continued.battle.aiDifficulty, aiDifficulty ?? 'normal');
      }
    }
  });
}

test('hard expands and upgrades enemies deterministically while preserving players, NPCs, map, combat RNG and costs', () => {
  const ctx = setup();
  const units = [ctx.store.unit(ctx.player.id, 'u_erin')!];
  const escort = ALL_QUESTS.find(q => q.kind === 'escort');
  assert.ok(escort);
  for (const create of [
    (aiDifficulty: 'normal' | 'hard') => createFieldBattle(units, { region: 1, cleared: 0, seed: 'same', aiDifficulty }),
    (aiDifficulty: 'normal' | 'hard') => createFieldBattle(units, { region: 1, cleared: 0, seed: 'same', aiDifficulty, quest: escort }),
    (aiDifficulty: 'normal' | 'hard') => createClassicBattle(units, { mapId: classicSingle.scenarioId!, seed: 'same', aiDifficulty }),
  ]) {
    const normal = create('normal');
    const hard = create('hard');
    const normalEnemies = normal.state.units.filter(u => u.side === 'enemy');
    const hardEnemies = hard.state.units.filter(u => u.side === 'enemy');
    assert.equal(hardEnemies.length, normalEnemies.length + Math.ceil(normalEnemies.length * HARD_ENEMY_RULES.extraRatio));
    const field = !hard.state.scenario && !hard.questId && !hard.dungeon;
    for (const enemy of hardEnemies) assertBoosted(enemy, field);
    for (const original of normalEnemies) {
      const enemy = hardEnemies.find(u => u.id === original.id)!;
      assert.ok(enemy.level >= Math.min(99, original.level + 2) && enemy.level <= Math.min(99, original.level + 5));
      assert.ok(enemy.weapons.some(id => !original.weapons.includes(id)), `${enemy.id}: gear upgrade`);
      assert.deepEqual(enemy.pos, original.pos);
    }
    assert.equal(new Set(hard.state.units.map(u => u.pos.join(','))).size, hard.state.units.length);
    assert.deepEqual(hard.initial, hard.state);
    assert.deepEqual(hard.state, create('hard').state, 'same seed fixes roster, levels, stats and equipment');
    if (normal.state.encounter) {
      assert.equal(hard.state.encounter?.layout, normal.state.encounter.layout);
      assert.deepEqual(hard.state.rng, normal.state.rng);
      assert.deepEqual(hard.state.units.filter(u => u.side === 'player'), normal.state.units.filter(u => u.side === 'player'));
    } else assert.deepEqual({ ...hard.state, aiDifficulty: 'normal', units: hard.state.units.filter(u => u.side !== 'enemy') },
      { ...normal.state, units: normal.state.units.filter(u => u.side !== 'enemy') });
    assert.equal(hard.costDays, normal.costDays);
    assert.equal(hard.seed, normal.seed);
  }
});
