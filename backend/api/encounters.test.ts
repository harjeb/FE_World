import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch, type Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { fieldEncounter } from '../common/game/encounters.ts';
import { chapterOpenDay } from '../common/game/story.ts';
import { createFieldBattle, encounterMap } from '../common/game/battles.ts';

function setup(): Context {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'encounters', undefined, 'Encounters');
  seedFullRoster(store, player);
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  return { store, accountId, player: syncPlayer(store, player), agentModel: null, push: () => {} };
}

test('plans keep slots, counts and same-average enemies stable across deployment sizes', () => {
  const ctx = setup();
  const roster = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').map(unit => ({ ...unit, level: 10 }));
  const layouts = new Set<string>(), limits = new Set<number>();
  for (let i = 0; i < 30; i++) {
    // 中后期（无人数限制）抽签验证三种布局与原上限 4／6／8 仍会出现；
    // 前期同一抽签会被门控压回集中出生的交错遭遇。
    const plan = fieldEncounter(String(i), chapterOpenDay(3) + 1, 1);
    layouts.add(plan.layout); limits.add(plan.maxUnits);
    const gated = fieldEncounter(String(i), 0, 1);
    if (plan.layout !== 'skirmish') assert.equal(gated.layout, 'skirmish', `early gates dispersed layouts: ${i}`);
    const options = { region: 1, cleared: 0, day: 0, seed: 'combat', encounter: gated };
    const one = createFieldBattle(roster.slice(0, 1), options).state;
    const full = createFieldBattle(roster.slice(0, gated.maxUnits), { ...options, seed: 'different-server-combat-seed' }).state;
    assert.notDeepEqual(one.rng, full.rng, 'enemy stability does not freeze combat RNG');
    assert.notDeepEqual(one.growthRng, full.growthRng, 'growth RNG remains independent');
    assert.deepEqual(one.map, full.map);
    assert.deepEqual(one.units[0].pos, full.units[0].pos);
    assert.equal(one.units.filter(u => u.side === 'enemy').length, gated.enemyCount);
    assert.deepEqual(one.units.filter(u => u.side === 'enemy'), full.units.filter(u => u.side === 'enemy'));
    assert.equal(fieldEncounter(String(i), 0, 1, 'hard').layout, 'skirmish');
  }
  assert.equal(layouts.size, 3);
  // 中后期出战上限恢复各图原值 4／6／8；前期门控后的所有布局统一为 4。
  assert.deepEqual([...limits].sort((a, b) => a - b), [4, 6, 8]);
  const earlyLimits = new Set<number>();
  for (let i = 0; i < 30; i++) earlyLimits.add(fieldEncounter(String(i), 0, 1).maxUnits);
  assert.deepEqual([...earlyLimits], [4]);
  // 中后期（默认第 3 章开啟日之后、显式可出战 12 人）：恢复各图原值 4／6／8。
  const late = new Set<number>();
  for (let i = 0; i < 30; i++) late.add(fieldEncounter(String(i), chapterOpenDay(3) + 1, 5, 'normal', 'field', 12).maxUnits);
  assert.deepEqual([...late].sort((a, b) => a - b), [4, 6, 8]);
});

test('early field armies have six to ten enemies before hard scaling and keep concentrated spawns', () => {
  // 少带人不减怪，前期仍保留三人队可用的集中出生布局。
  for (let i = 0; i < 30; i++) {
    for (const difficulty of ['normal', 'hard'] as const) {
      const early = fieldEncounter(String(i), 0, 1, difficulty, 'field', 3);
      assert.equal(early.maxUnits, 3, `availableUnits caps the plan: ${i}`);
      const normal = fieldEncounter(String(i), 0, 1, 'normal', 'field', 3);
      assert.ok(normal.enemyCount >= 6 && normal.enemyCount <= 10, `${i}: ${normal.enemyCount}`);
      assert.equal(early.enemyCount, difficulty === 'hard' ? normal.enemyCount + Math.ceil(normal.enemyCount / 2) : normal.enemyCount);
    }
  }
  // 前期可出战 < 8：分散布局退回集中出生的交错遭遇，且同一未花费日内固定。
  for (let i = 0; i < 30; i++) {
    const plan = fieldEncounter(String(i), 0, 1, 'normal', 'field', 6);
    if (plan.layout === 'pincer' || plan.layout === 'convergence') {
      assert.equal(fieldEncounter(String(i), 0, 1, 'normal', 'field', 6).layout, plan.layout);
    }
  }
  const concentrated = new Set<string>();
  for (let i = 0; i < 60; i++) concentrated.add(fieldEncounter(String(i), 0, 1, 'normal', 'field', 7).layout);
  assert.ok(!concentrated.has('convergence'), 'small early parties never get convergence');
  assert.ok(concentrated.has('skirmish'), 'small early parties keep varied layouts');
  // 可出战 ≥ 8 的中后期：分散布局重新可选且数值与旧版一致。
  const late = new Set<string>();
  for (let i = 0; i < 60; i++) late.add(fieldEncounter(String(i), chapterOpenDay(3) + 1, 5, 'normal', 'field', 12).layout);
  assert.equal(late.size, 3);
  assert.deepEqual(fieldEncounter('fixed', chapterOpenDay(3) + 1, 5, 'normal', 'field', 12), fieldEncounter('fixed', chapterOpenDay(3) + 1, 5, 'normal', 'field', 12), 'fixed seed stays stable');
});

for (const aiDifficulty of ['normal', 'hard'] as const) {
  test(`field/${aiDifficulty}: late preview and departure freeze large armies, waves, levels and default deployment`, () => {
    const ctx = setup();
    ctx.player.day = chapterOpenDay(8);
    ctx.player.flags.hardUnlocks = { regions: [1], dungeons: [], quests: [] };
    ctx.store.savePlayer(ctx.player);
    for (const unit of ctx.store.units(ctx.player.id)) {
      unit.level = 85;
      ctx.store.saveUnit(unit, ctx.player.id);
    }
    const data = { action: 'sortie', region: 1, aiDifficulty };
    const quote = dispatch(ctx, OP.PREVIEW_ACTION, { ...data, unitIds: ['u_erin'], level: 1 }) as any;
    const extra = aiDifficulty === 'hard' ? [2, 5] : [0, 0];
    for (const enemy of quote.encounter.enemies) {
      assert.ok(enemy.level >= (enemy.id === 'e0' ? 89 : 84) + extra[0]);
      assert.ok(enemy.level <= (enemy.id === 'e0' ? 89 : 86) + extra[1]);
    }
    const defaultQuote = dispatch(ctx, OP.PREVIEW_ACTION, data) as any;
    const ids = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').slice(0, defaultQuote.encounter.maxUnits).map(u => u.id);
    assert.deepEqual(defaultQuote.encounter, (dispatch(ctx, OP.PREVIEW_ACTION, { ...data, unitIds: ids }) as any).encounter);
    const result = dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }) as any;
    const battle = ctx.store.battle(ctx.player.id, result.battleId)!;
    assert.ok(quote.encounter.enemyCount >= 20);
    assert.equal(quote.encounter.reinforcements.length, 3);
    assert.deepEqual(battle.initial.encounter?.reinforcements, quote.encounter.reinforcements);
    assert.equal(battle.initial.turnLimit, quote.encounter.turnLimit);
    assert.equal(battle.initial.scenario?.events.filter(e => e.actions.some(a => a.kind === 'spawn')).length, 3);
    assert.deepEqual(battle.initial.units.filter(u => u.side === 'enemy').map(({ id, name, classId, level, hp, stats, pos, weapons }) =>
      ({ id, name, classId, level, hp, stats, pos, weapons })), quote.encounter.enemies);
  });
}

for (const action of ['sortie', 'dungeon'] as const) {
  for (const aiDifficulty of ['normal', 'hard'] as const) {
  test(`${action}/${aiDifficulty}: preview tracks the selected team and matches actual enemies, seasonal map, slots and costs`, () => {
    const ctx = setup();
    ctx.player.day = 375;
    ctx.player.flags.hardUnlocks = { regions: [1], dungeons: [1], quests: [] };
    ctx.store.savePlayer(ctx.player);
    for (const unit of ctx.store.units(ctx.player.id)) {
      unit.level = unit.id === 'u_erin' ? 10 : 30;
      ctx.store.saveUnit(unit, ctx.player.id);
    }
    const before = ctx.player.day;
    const unchanged = { player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) };
    const preview = (unitIds: string[]) => dispatch(ctx, OP.PREVIEW_ACTION, { action, region: 1, unitIds, aiDifficulty, seed: 'client-must-not-control-enemies' }) as any;
    const first = preview(['u_erin']);
    const ids = ctx.store.units(ctx.player.id).filter(u => u.status === 'active').slice(0, first.encounter.maxUnits).map(u => u.id).reverse();
    const quote = preview(ids);
    assert.deepEqual({ ...first.encounter, enemies: quote.encounter.enemies }, quote.encounter, 'changing average never rerolls the map or count');
    if (action === 'sortie') assert.notDeepEqual(first.encounter.enemies, quote.encounter.enemies, 'changing the selected average updates enemy levels');
    else assert.deepEqual(first.encounter.enemies, quote.encounter.enemies, 'dungeon levels remain date-based');
    assert.deepEqual(quote.encounter, preview([...ids].reverse()).encounter, 'same members in a different order do not reroll enemies');
    assert.deepEqual(quote.encounter, preview(ids).encounter);
    assert.equal(ctx.player.day, before);
    assert.deepEqual({ player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) }, unchanged);
    assert.equal(ctx.store.activeBattle(ctx.player.id), null);
    assert.equal(ctx.store.activeRun(ctx.player.id), null);
    const withoutClientSeed = dispatch(ctx, OP.PREVIEW_ACTION, { action, region: 1, unitIds: ids, aiDifficulty }) as any;
    assert.deepEqual(quote.encounter, withoutClientSeed.encounter);
    for (const enemy of quote.encounter.enemies) {
      assert.deepEqual(Object.keys(enemy).sort(), ['id', 'name', 'classId', 'level', 'hp', 'stats', 'pos', 'weapons'].sort());
    }
    const result = dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }) as any;
    const battle = ctx.store.battle(ctx.player.id, result.battleId)!;
    assert.deepEqual(battle.state.units.filter(u => u.side === 'player').map(u => u.id), ids, 'submitted order becomes deployment order');
    assert.equal(battle.state.units.find(u => u.side === 'player' && u.boss)?.id, ids[0]);
    assert.deepEqual(battle.state.map.tiles, quote.encounter.map.tiles);
    assert.deepEqual(battle.state.units.filter(u => u.side === 'player').map(u => u.pos), quote.encounter.map.spawns.player.slice(0, ids.length));
    assert.equal(battle.state.units.filter(u => u.side === 'enemy').length, quote.encounter.enemyCount);
    assert.deepEqual(quote.encounter.enemies, battle.state.units.filter(u => u.side === 'enemy').map(({ id, name, classId, level, hp, stats, pos, weapons }) =>
      ({ id, name, classId, level, hp, stats, pos, weapons })));
    assert.equal(ctx.player.day - before, quote.costDays);
    assert.notEqual(battle.seed, quote.encounter.seed);
    if (action === 'dungeon') {
      const run = ctx.store.activeRun(ctx.player.id)!;
      assert.equal(run.encounter?.maxUnits, quote.encounter.maxUnits);
      const b = ctx.store.battle(ctx.player.id, result.battleId)!;
      for (const enemy of b.state.units.filter(u => u.side === 'enemy')) { enemy.hp = 0; enemy.alive = false; }
      const leader = b.state.units.find(u => u.side === 'player')!;
      assert.equal(b.state.goal.kind, 'seize');
      if (b.state.goal.kind === 'seize') leader.pos = [...b.state.goal.throne];
      ctx.store.saveBattle(b);
      dispatch(ctx, OP.UNIT_ACT, { battleId: b.id, unitId: leader.id, moveTo: leader.pos, action: 'seize' });
      const day = ctx.player.day;
      const next = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as any;
      const state = ctx.store.battle(ctx.player.id, next.battleId)!.state;
      assert.deepEqual(state.units.filter(u => u.side === 'player').map(u => u.id), ids, 'continuation keeps the selected order');
      assert.equal(state.encounter?.maxUnits, run.encounter?.maxUnits);
      assert.equal(state.units.filter(u => u.side === 'enemy').length, run.encounter?.enemyCount);
      assert.deepEqual(state.map.tiles, encounterMap(run.encounter!, day, 1).tiles);
    }
  });
  }

  test(`${action}: invalid deployments reject before date, gold, locks or battles change`, () => {
    const ctx = setup();
    const roster = ctx.store.units(ctx.player.id);
    const dead = roster.find(u => u.id !== 'u_erin')!;
    dead.status = 'dead'; ctx.store.saveUnit(dead, ctx.player.id);
    const busy = roster.find(u => u.id !== dead.id && u.id !== 'u_erin')!;
    busy.lockedDispatchId = 'busy'; ctx.store.saveUnit(busy, ctx.player.id);
    const before = { player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) };
    for (const unitIds of [[], ['u_erin', 'u_erin'], ['missing'], [dead.id], [busy.id], [1], 'u_erin', Array.from({ length: 9 }, (_, i) => `id-${i}`)]) {
      for (const op of [action === 'sortie' ? OP.SORTIE : OP.START_DUNGEON, OP.PREVIEW_ACTION]) {
        assert.throws(() => dispatch(ctx, op, { action, region: 1, unitIds }));
        assert.deepEqual({ player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id) }, before);
        assert.equal(ctx.store.activeBattle(ctx.player.id), null);
        assert.equal(ctx.store.activeRun(ctx.player.id), null);
      }
    }
  });
}

for (const questId of ['gw1', 'gw2', 'gw3', 'gw4', 'gw5', 'gw6', 'clx-fe1', 'story-1', 'cross-time-throne']) {
  const single = ['gw1', 'gw2', 'gw3', 'gw4', 'gw5', 'story-1'].includes(questId);
  for (const aiDifficulty of (single ? ['normal'] : ['normal', 'hard'])) {
    test(`quest ${questId}/${aiDifficulty}: public preview matches departure without side effects`, () => {
      const ctx = setup();
      ctx.player.day = 1001;
      ctx.player.flags.questsDone = single ? ['gw1', 'gw2', 'gw3', 'gw4', 'gw5'].filter(id => id !== questId) : ['gw1', 'gw2', 'gw3', 'gw4', 'gw5', questId];
      ctx.player.flags.storyStepsDone = ['story-1-a', 'story-1-b'];
      ctx.player.flags.hardUnlocks = { regions: [1, 2], dungeons: [], quests: [questId] };
      ctx.player.flags.crossTime = { clearedNormal: true };
      ctx.player.flags.unlockedRegions = [1, 2];
      ctx.player.flags.regionReputation = { 1: 100, 2: 100 };
      ctx.store.savePlayer(ctx.player);
      const data = { action: 'quest', questId, aiDifficulty, region: 1, unitIds: ['u_erin'] };
      const before = { player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id), inventory: ctx.store.inventory(ctx.player.id) };
      const quote = dispatch(ctx, OP.PREVIEW_ACTION, data) as any;
      assert.deepEqual(quote.encounter, (dispatch(ctx, OP.PREVIEW_ACTION, { ...data, seed: 'injected' }) as any).encounter);
      assert.deepEqual({ player: ctx.store.getPlayer(ctx.player.id), units: ctx.store.units(ctx.player.id), inventory: ctx.store.inventory(ctx.player.id) }, before);
      assert.equal(ctx.store.activeRun(ctx.player.id), null);
      assert.equal(ctx.store.activeBattle(ctx.player.id), null);
      assert.deepEqual(quote.blockers, []);
      const result = dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }) as any;
      const battle = ctx.store.battle(ctx.player.id, result.battleId)!;
      assert.deepEqual(battle.state.map.tiles, quote.encounter.map.tiles);
      const goal = battle.state.goal;
      const marker = quote.encounter.map.objective;
      if (goal.kind === 'boss') {
        assert.equal(marker.kind, 'boss');
        assert.deepEqual(marker.position, battle.state.units.find(unit => unit.id === goal.target)!.pos);
      } else if (goal.kind === 'seize') {
        assert.equal(marker.kind, 'seize');
        assert.deepEqual(marker.position, goal.throne);
      } else if ('exits' in goal) {
        assert.equal(marker.label, '撤离点');
        assert.deepEqual(marker.position, goal.exits[0]);
      } else assert.equal(marker, undefined, 'no false capture marker for rout/defend');
      assert.deepEqual(battle.state.units.filter(u => u.side === 'enemy').map(({ id, name, classId, level, hp, stats, pos, weapons }) => ({ id, name, classId, level, hp, stats, pos, weapons })), quote.encounter.enemies);
      assert.equal(ctx.player.day - before.player!.day, quote.costDays);
      assert.deepEqual(battle.state.units.filter(u => u.side === 'player' && !u.npc).map(u => u.pos), quote.encounter.map.spawns.player);
      for (const enemy of quote.encounter.enemies) assert.deepEqual(Object.keys(enemy).sort(), ['id', 'name', 'classId', 'level', 'hp', 'stats', 'pos', 'weapons'].sort());
    });
  }
}

test('locked quest preview reports blockers without revealing enemies and keeps lifecycle checks', () => {
  const ctx = setup();
  const day = ctx.player.day;
  const data = { action: 'quest', questId: 'gw6', unitIds: ['u_erin'] };
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, data) as any;
  assert.equal(quote.encounter, undefined);
  assert.ok(quote.blockers.length);
  assert.throws(() => dispatch(ctx, OP.EXECUTE_ACTION, { quoteId: quote.quoteId }));
  assert.throws(() => dispatch(ctx, OP.START_QUEST, data));
  assert.equal(ctx.store.activeBattle(ctx.player.id), null);
  assert.equal(ctx.store.activeRun(ctx.player.id), null);
  assert.equal(ctx.player.day, day);
});
