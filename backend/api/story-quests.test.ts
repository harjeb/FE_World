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
import { classicAdaptation } from '../common/game/classic-adaptation.ts';
import { validateClassicScenario } from '../common/game/classic-validation.ts';
import { FESTIVAL_DISCOUNT_MAX, FESTIVAL_DISCOUNT_MIN, festivalPrice } from '../common/game/festival.ts';
import { GAME_ITEMS } from '../common/game/items.ts';
import { COMPANION_QUESTS, STORY_CHAPTER_QUESTS, STORY_QUESTS, STORY_STEP_REWARDS, stepReward, storyClueKey, storyStepId } from '../common/game/story-quests.ts';
import { interactObject } from '../common/engine/scenario.ts';
import { createClassicBattle } from '../common/game/battles.ts';
import { createUnit } from '../common/game/model.ts';
import { createStoryDuel, duelClass, duelClassPool, duelLevel } from '../common/game/story-duel.ts';
import { CLASSES, classUnavailableReason } from '../common/data/classes.ts';
import { WEAPONS } from '../common/data/weapons.ts';
import { questById } from '../common/game/quests.ts';
import { completeDuelStep, grantStepRewards, recordStoryWin } from './story.ts';
import type { BattleState } from '../common/engine/types.ts';

const party = () => (['erin', 'victor', 'gustav'] as const).map((character, index) => createUnit(character, 20, `u${index}`, 0));

function setup(t: { after: (fn: () => void) => void }, day = 600): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'story-quests');
  seedFullRoster(store, player);
  player.day = day;
  // 聚焦当前章机制的旧测试默认已经完成更早的调查。
  player.flags.storyCompleted = Array.from({ length: Math.max(0, Math.min(7, Math.floor((day + 18) / 500) - 1)) }, (_, i) => i + 1);
  player.flags.regionReputation = { 2: 9999, 3: 9999, 5: 9999 };
  store.savePlayer(player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push() {} };
}

// 跳过前置任务（派遣＋提交材料），单独测试收尾战。
function skipSteps(ctx: Context, chapter: number) {
  ctx.player.flags.storyStepsDone = [...(ctx.player.flags.storyStepsDone ?? []), storyStepId(chapter, 'a'), storyStepId(chapter, 'b')];
  ctx.store.savePlayer(ctx.player);
}

function start(ctx: Context, questId: string) {
  return dispatch(ctx, OP.START_QUEST, { questId, unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
}

function win(ctx: Context, battleId: string, before?: (state: BattleState) => void) {
  const record = ctx.store.battle(ctx.player.id, battleId)!;
  const leader = record.state.units.find(unit => unit.side === 'player')!;
  before?.(record.state);
  for (const enemy of record.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
  if (record.state.goal.kind === 'seize') leader.pos = [...record.state.goal.throne];
  ctx.store.saveBattle(record);
  dispatch(ctx, OP.UNIT_ACT, { battleId, unitId: leader.id, moveTo: leader.pos, action: record.state.goal.kind === 'seize' ? 'seize' : 'wait' });
}

test('every story and companion map validates, and the story overlay lives only inside its own quest', () => {
  assert.equal(STORY_QUESTS.length, 8);
  assert.deepEqual(STORY_QUESTS.map(q => q.story), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set(STORY_CHAPTER_QUESTS.map(row => row.mapId)).size, 8, 'eight different maps');
  for (const quest of [...STORY_QUESTS, ...COMPANION_QUESTS]) assert.deepEqual(validateClassicScenario(quest.scenarioId!), [], quest.id);
  for (const quest of STORY_QUESTS) {
    const objects = classicAdaptation(quest.scenarioId!).objects;
    const moved = objects.filter(o => o.hideIn?.includes(quest.id));
    assert.ok(moved.length > 0, `${quest.id} moves at least one village or chest`);
    assert.ok(moved.every(o => o.kind === 'village' || o.kind === 'chest'));
    const added = objects.filter(o => o.secret?.quest === quest.id && o.id !== 'story-clue');
    assert.equal(added.length, moved.length, 'same number of villages and chests, new positions');
    for (const object of added) {
      assert.ok(!moved.some(old => old.pos[0] === object.pos[0] && old.pos[1] === object.pos[1]), `${object.id} actually moved`);
    }
    const clue = objects.find(o => o.id === 'story-clue')!;
    assert.deepEqual(clue.loot, { item: storyClueKey(quest.story!), count: 1 });
    assert.ok(Object.hasOwn(GAME_ITEMS, clue.loot!.item));
  }
});

test('a story chapter opens on the calendar; winning the quest completes it, pays once and records no region reputation', t => {
  const ctx = setup(t, 481);
  assert.throws(() => start(ctx, 'story-1'), /尚未开放/);
  assert.throws(() => start(ctx, 'story-2'), /尚未开放/);
  ctx.player.day = 482;
  skipSteps(ctx, 1);
  ctx.store.savePlayer(ctx.player);
  const view = dispatch(ctx, OP.GET_STORY, {}) as { chapters: { chapter: number; quest: { id: string; available: boolean; clue: { held: boolean; note: string | null } } | null }[] };
  assert.equal(view.chapters[0].quest!.id, 'story-1');
  assert.equal(view.chapters[0].quest!.available, true);
  assert.equal(view.chapters[0].quest!.clue.note, null, 'the clue text stays hidden until it is found');

  const started = start(ctx, 'story-1');
  const record = ctx.store.battle(ctx.player.id, started.battleId)!;
  const ids = record.state.objects!.map(o => o.id);
  assert.ok(ids.includes('story-clue') && ids.includes('story-village-0'), 'story objects are present in the story quest');
  assert.ok(!ids.some(id => id.startsWith('village-')), 'the original villages are moved away in this quest');
  win(ctx, started.battleId, state => {
    const leader = state.units.find(unit => unit.side === 'player')!;
    leader.pos = [...state.objects!.find(o => o.id === 'story-clue')!.pos];
    interactObject(state, leader, 'story-clue', []);
  });
  assert.ok((ctx.player.flags.questsDone ?? []).includes('story-1'));
  assert.ok((ctx.player.flags.storyCompleted ?? []).includes(1), 'winning the story quest completes the chapter event');
  assert.deepEqual(ctx.player.flags.clearedRegions, [], 'a story battle is not a region first-clear');
  assert.equal(ctx.store.countInventory(ctx.player.id, 'story_clue_1'), 1);
  assert.deepEqual(ctx.player.flags.secretsClaimed, ['fe6-ch14-main:story-clue']);

  const gold = ctx.player.gold;
  const claimed = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'story-1' }) as { gold: number };
  assert.equal(claimed.gold, 2_500);
  assert.equal(ctx.player.gold, gold + 2_500);
  assert.deepEqual(Object.keys(ctx.player.flags.regionReputation ?? {}).sort(), ['2', '3', '5'], 'region 0 gets no reputation entry');
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'story-1' }), /领取过/);
  assert.throws(() => start(ctx, 'story-1'), /已经完成/);
  dispatch(ctx, OP.CLAIM_REWARD, { rewardKey: 'chapter:1' });

  const after = dispatch(ctx, OP.GET_STORY, {}) as { chapters: { quest: { clue: { held: boolean; note: string | null }; done: boolean } }[] };
  assert.equal(after.chapters[0].quest.done, true);
  assert.equal(after.chapters[0].quest.clue.held, true);
  assert.ok(after.chapters[0].quest.clue.note, 'the clue text is shown once held');
  assert.throws(() => dispatch(ctx, OP.SELL, { item: 'story_clue_1', count: 1 }), /任务物品/);
});

test('a player who finished a chapter with the old button can still replay the story quest for its rewards', t => {
  const ctx = setup(t);
  ctx.player.flags.storyCompleted = [1];
  ctx.store.savePlayer(ctx.player);
  const view = dispatch(ctx, OP.GET_STORY, {}) as { chapters: { quest: { available: boolean; legacyCompleted: boolean; prerequisite: string | null } }[] };
  assert.equal(view.chapters[0].quest.legacyCompleted, true);
  assert.equal(view.chapters[0].quest.available, true, 'the old save is not held back by the new preliminary tasks');
  assert.equal(view.chapters[0].quest.prerequisite, null);
});

test('companion quests unlock when the fixed recruit joins, and stay available after they fall', t => {
  const ctx = setup(t);
  const list = () => (dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; available: boolean; companion: string | null }[] }[] })
    .regions.flatMap(r => r.quests).filter(q => q.companion);
  assert.deepEqual(list(), [], 'hidden until the recruit has joined');
  assert.throws(() => start(ctx, 'companion-ren'), /未解锁/);

  ctx.player.flags.questRewardsClaimed = ['gw6'];
  ctx.store.savePlayer(ctx.player);
  assert.deepEqual(list().filter(q => q.available).map(q => q.id), ['companion-ren']);
  const unit = ctx.store.units(ctx.player.id).find(u => u.character === 'ren')!;
  unit.status = 'dead';
  ctx.store.saveUnit(unit, ctx.player.id);
  assert.deepEqual(list().filter(q => q.available).map(q => q.id), ['companion-ren'], 'a fallen recruit does not lock the quest');

  const started = start(ctx, 'companion-ren');
  win(ctx, started.battleId);
  assert.ok((ctx.player.flags.questsDone ?? []).includes('companion-ren'));
  const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'companion-ren' }) as { items: [string, number][] };
  assert.ok(reward.items.some(([item]) => item === 'killing_edge'));
  const row = list().find(q => q.id === 'companion-ren') as { epilogue?: string | null } | undefined;
  assert.match(row?.epilogue ?? '', /雷恩/, 'the finished quest shows its epilogue');
});

test('the capital shop is discounted 50-65% per item during the festival window and only then', t => {
  const ctx = setup(t, 100);
  const shop = () => (dispatch(ctx, OP.GET_SHOP, {}) as { items: { item: string; price: number; basePrice: number; discount: number }[] }).items;
  for (const row of shop()) assert.deepEqual([row.discount, row.price], [0, row.basePrice], 'no discount outside the festival');

  for (const day of [482, 490, 499]) {
    ctx.player.day = day;
    ctx.store.savePlayer(ctx.player);
    const rows = shop();
    assert.ok(rows.length > 10);
    const discounts = new Set<number>();
    for (const row of rows) {
      assert.ok(row.discount >= FESTIVAL_DISCOUNT_MIN && row.discount <= FESTIVAL_DISCOUNT_MAX, `${row.item} ${row.discount}`);
      assert.equal(row.price, festivalPrice(row.basePrice, row.discount));
      assert.ok(row.price <= Math.ceil(row.basePrice * 0.5) && row.price >= Math.floor(row.basePrice * 0.35) - 1);
      discounts.add(row.discount);
    }
    assert.ok(discounts.size > 3, 'items roll their own discount');
    assert.deepEqual(shop(), rows, 'reading again does not reroll');
  }
  ctx.player.day = 490;
  const first = shop();
  ctx.player.day = 499;
  assert.deepEqual(shop().map(r => r.discount), first.map(r => r.discount), 'one roll for the whole festival');

  const target = first.find(row => row.item === 'vulnerary')!;
  ctx.player.gold = 100_000;
  ctx.store.savePlayer(ctx.player);
  const bought = dispatch(ctx, OP.BUY, { item: 'vulnerary', count: 2 }) as { price: number; gold: number };
  assert.equal(bought.price, target.price * 2, 'the charged price is the discounted one');
  assert.equal(bought.gold, 100_000 - target.price * 2);

  ctx.player.day = 500;
  ctx.store.savePlayer(ctx.player);
  assert.ok(shop().every(row => row.discount === 0), 'the discount ends with the window');
});

type View = { id: string; kind: string; done: boolean; available: boolean; have?: number; wins?: number; held?: number; count?: number };
const storyView = (ctx: Context, chapter = 1) => (dispatch(ctx, OP.GET_STORY, {}) as { chapters: { chapter: number; quest: { steps: View[]; prerequisite: string | null; available: boolean } }[] })
  .chapters.find(c => c.chapter === chapter)!.quest;

test('each chapter has two preliminary tasks of different kinds before the finale', () => {
  const kinds = STORY_CHAPTER_QUESTS.map(row => row.steps.map(step => step.kind));
  assert.ok(kinds.every(pair => pair.length === 2 && pair[0] !== pair[1]), 'two different kinds in every chapter');
  assert.deepEqual([...new Set(kinds.flat())].sort(), ['arena', 'dispatch', 'duel', 'find', 'submit', 'tavern']);
  for (const row of STORY_CHAPTER_QUESTS) for (const step of row.steps) {
    if (step.kind === 'find') {
      assert.ok(Object.hasOwn(GAME_ITEMS, step.item));
      const chest = classicAdaptation(step.mapId).objects.find(o => o.id === `find-${row.chapter}`)!;
      assert.deepEqual(chest.loot, { item: step.item, count: 1 });
      assert.deepEqual(chest.secret, { quest: step.route, chapter: row.chapter });
      assert.deepEqual(validateClassicScenario(step.mapId), []);
    }
    if (step.kind === 'duel') assert.deepEqual(validateClassicScenario(step.mapId), []);
  }
});

test('arena wins and tavern wins count only after the chapter opens and finish the step', t => {
  const ctx = setup(t, 470);
  assert.deepEqual(recordStoryWin(ctx.player, 'arena'), [], 'nothing counts before chapter 1 opens');
  assert.deepEqual(ctx.player.flags.storyProgress ?? {}, {});
  ctx.player.day = 600;
  assert.deepEqual(recordStoryWin(ctx.player, 'arena'), []);
  assert.equal(ctx.player.flags.storyProgress!['story-1-b'], 1);
  assert.deepEqual(recordStoryWin(ctx.player, 'arena'), ['story-1-b'], 'two arena wins finish the chapter 1 step');
  assert.deepEqual(recordStoryWin(ctx.player, 'tavern'), []);
  assert.deepEqual(recordStoryWin(ctx.player, 'tavern'), ['story-1-a']);
  assert.deepEqual(ctx.player.flags.storyStepsDone, ['story-1-b', 'story-1-a']);
  assert.deepEqual(recordStoryWin(ctx.player, 'arena'), [], 'a finished step no longer counts');
});

test('a real arena victory and real minigame results feed the preliminary tasks', t => {
  const ctx = setup(t, 600);
  // Minigame: the story counter equals the number of plays that returned more than the bet.
  let wins = 0;
  for (let i = 0; i < 6; i++) {
    try {
      const result = dispatch(ctx, OP.PLAY_MINIGAME, { game: 'dice', bet: 20, choice: i % 2 ? 'big' : 'small' }) as { net: number };
      if (result.net > 0) wins++;
    } catch { break; }
  }
  assert.equal(ctx.player.flags.storyProgress?.['story-1-a'] ?? 0, Math.min(wins, 2));

  // Arena: surrender counts for nothing, a won attack counts one.
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { opponents: { id: string; deploy: number; bans: number }[]; isArenaDay: boolean };
  if (!arena.isArenaDay) return;
  const opponent = arena.opponents[0];
  const list = dispatch(ctx, OP.GET_OPPONENT, { opponentId: opponent.id }) as { list: { character: string }[] };
  const bans = list.list.slice(0, opponent.bans).map(u => u.character);
  dispatch(ctx, OP.ARENA_BAN, { opponentId: opponent.id, bans });
  const roster = (ctx.store.units(ctx.player.id)).map(u => u.character).filter(c => !bans.includes(c)).slice(0, opponent.deploy);
  const picks = roster.map((character, i) => ({ character, pos: [i % 3, 2 + Math.floor(i / 3)] }));
  const attack = dispatch(ctx, OP.ARENA_ATTACK, { opponentId: opponent.id, picks, commander: roster[0] }) as { battleId: string };
  win(ctx, attack.battleId);
  assert.equal(ctx.player.flags.storyProgress?.['story-1-b'] ?? 0, 1, 'one arena win counted');
});

test('a find task completes once the quest item from the dungeon chest is held, and the chest only exists after the chapter opens', t => {
  const ctx = setup(t, 1000);
  ctx.player.flags.clearedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  assert.equal(storyView(ctx, 2).steps[0].done, false);
  ctx.store.addInventory(ctx.player.id, 'story_find_2', 0, 1);
  const view = storyView(ctx, 2);
  assert.equal(view.steps[0].done, true, 'holding the item completes the find task');
  assert.deepEqual(ctx.player.flags.storyStepsDone, ['story-2-a']);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'story_find_2'), 1, 'the item is not consumed');
  assert.throws(() => dispatch(ctx, OP.SELL, { item: 'story_find_2', count: 1 }), /任务物品/);

  // Chapter 2 opens on day 982: before that the chest is not generated in the FE6 route.
  const before = createClassicBattle(party(), { mapId: 'fe6-ch23-main', seed: 'x', day: 981, stageIndex: 1, quest: questById('clx-fe6') });
  assert.ok(!before.state.objects!.some(o => o.id === 'find-2'));
  const after = createClassicBattle(party(), { mapId: 'fe6-ch23-main', seed: 'x', day: 982, stageIndex: 1, quest: questById('clx-fe6') });
  assert.equal(after.state.objects!.find(o => o.id === 'find-2')!.loot!.item, 'story_find_2');
  const elsewhere = createClassicBattle(party(), { mapId: 'fe6-ch23-main', seed: 'x', day: 982, stageIndex: 2 });
  assert.ok(!elsewhere.state.objects!.some(o => o.id === 'find-2'), 'only inside its own route');
  const claimed = createClassicBattle(party(), { mapId: 'fe6-ch23-main', seed: 'x', day: 982, stageIndex: 1, quest: questById('clx-fe6'), claimed: ['fe6-ch23-main:find-2'] });
  assert.ok(!claimed.state.objects!.some(o => o.id === 'find-2'), 'once per account');
});

test('a duel is one chosen unit against one named champion with real death, and winning completes the task', t => {
  const ctx = setup(t, 1000);
  assert.throws(() => dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_erin' }), /尚未开放/);
  ctx.player.day = 1482;
  ctx.player.flags.storyCompleted = [1, 2];
  ctx.store.savePlayer(ctx.player);
  assert.throws(() => dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-1-a', unitId: 'u_erin' }), /没有这个单挑任务/);
  const view = storyView(ctx, 3).steps[0] as View & { enemy?: string; level?: number };
  assert.equal(view.kind, 'duel');
  assert.equal(view.enemy, '刮名人');

  const day = ctx.player.day;
  const started = dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_erin' }) as { battleId: string };
  assert.equal(ctx.player.day, day + 1, 'a duel costs one day');
  const record = ctx.store.battle(ctx.player.id, started.battleId)!;
  assert.equal(record.mode, 'field', 'real death rules');
  assert.deepEqual(record.state.units.filter(u => u.side === 'player').map(u => u.id), ['u_erin']);
  const enemies = record.state.units.filter(u => u.side === 'enemy');
  assert.equal(enemies.length, 1);
  assert.match(enemies[0].name, /^.+（刮名人）$/, 'a random person, named with the step\'s title');
  assert.equal(enemies[0].boss, true);
  const highest = Math.max(...ctx.store.units(ctx.player.id).filter(u => u.status === 'active').map(u => u.level));
  assert.equal(enemies[0].level, highest + 1, `the champion is built from the roster's highest level (${highest})`);
  assert.equal(view.level, highest + 1, 'the page shows the same level');
  assert.equal(CLASSES[enemies[0].classId].stage, CLASSES[ctx.store.unit(ctx.player.id, 'u_erin')!.classId].stage, 'the class is of the same tier as the chosen duelist');
  assert.throws(() => dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_victor' }), /进行中的战斗/);

  // Losing leaves the task open and lets the player try again; winning completes it and pays no region first-clear.
  dispatch(ctx, OP.RETREAT, { battleId: started.battleId });
  assert.ok(!(ctx.player.flags.storyStepsDone ?? []).includes('story-3-a'));
  const again = dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_victor' }) as { battleId: string };
  win(ctx, again.battleId);
  assert.ok((ctx.player.flags.storyStepsDone ?? []).includes('story-3-a'));
  assert.deepEqual(ctx.player.flags.clearedRegions, [], 'a duel is not a region first-clear');
  assert.ok(!(ctx.player.flags.questsDone ?? []).includes('story-3-a'), 'it is a preliminary task, not a quest');
  assert.throws(() => dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_erin' }), /已经赢过/);
});

test('the finale waits for both preliminaries, in any order; materials and dispatch still work', t => {
  const ctx = setup(t, 1482);
  ctx.player.flags.clearedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  // Chapter 3 = duel + submit. Order does not matter: hand in the ore first.
  assert.equal(storyView(ctx, 3).prerequisite, '刮名人');
  assert.throws(() => start(ctx, 'story-3'), /先完成本章前置任务「刮名人」/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-a' }), /不用提交/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'nope' }), /没有这个前置任务/);
  ctx.store.addInventory(ctx.player.id, 'ore', 0, 5);
  const ore = ctx.store.countInventory(ctx.player.id, 'ore');
  ctx.store.takeInventory(ctx.player.id, 'ore', ore - 5);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' }), /需要 8 份铁矿，仓库里只有 5 份/);
  ctx.store.addInventory(ctx.player.id, 'ore', 0, 4);
  dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' });
  assert.equal(ctx.store.countInventory(ctx.player.id, 'ore'), 1, 'eight ore were handed in');
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' }), /已经完成/);
  assert.equal(storyView(ctx, 3).prerequisite, '刮名人');
  completeDuelStep(ctx.player, 'story-3-a');
  ctx.store.savePlayer(ctx.player);
  assert.equal(storyView(ctx, 3).prerequisite, null);
  assert.ok(start(ctx, 'story-3').battleId, 'the finale opens once both preliminaries are done');
});

test('a dispatch started before the chapter opened does not count, and one dispatch serves one chapter', t => {
  // Chapter 5 (dispatch + duel) opens on day 2482; chapter 2's dispatch task is already done here.
  const ctx = setup(t, 2470);
  ctx.player.flags.clearedRegions = [1];
  ctx.player.flags.storyStepsDone = ['story-2-b'];
  ctx.player.flags.storyCompleted = [1, 2, 3, 4];
  ctx.store.savePlayer(ctx.player);
  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 20, unitIds: ['u_victor'] });
  ctx.player.day = 2495;
  syncPlayer(ctx.store, ctx.player);
  assert.deepEqual(ctx.player.flags.storyStepsDone, ['story-2-b'], 'started on day 2470, before chapter 5 opened on day 2482');

  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 5, unitIds: ['u_lina'] });
  ctx.player.day = 2505;
  syncPlayer(ctx.store, ctx.player);
  assert.deepEqual(ctx.player.flags.storyStepsDone, ['story-2-b', 'story-5-a'], 'a dispatch started after the chapter opened completes it');

  // With the earlier chapter's dispatch task still open, one dispatch only counts for that chapter.
  const both = setup(t, 2500);
  both.player.flags.clearedRegions = [1];
  both.store.savePlayer(both.player);
  dispatch(both, OP.START_DISPATCH, { region: 1, durationDays: 6, unitIds: ['u_victor'] });
  both.player.day = 2510;
  syncPlayer(both.store, both.player);
  assert.deepEqual(both.player.flags.storyStepsDone, ['story-2-b'], 'chapters 2 and 5 are both open but one dispatch completes only the earliest');
});

test('the duel opponent is a random class of the same tier, never one that cannot attack, and is deterministic per seed', () => {
  for (const id of ['commoner', 'swordsman', 'archer', 'cleric', 'paladin', 'sage'] as const) {
    const pool = duelClassPool(id);
    assert.ok(pool.length >= 2, `${id} has several same-tier classes to draw from`);
    for (const candidate of pool) {
      assert.equal(CLASSES[candidate].stage, CLASSES[id].stage, `${candidate} is the same tier as ${id}`);
      assert.notEqual(CLASSES[candidate].source, 'species');
      assert.equal(classUnavailableReason(candidate), null);
    }
    assert.equal(duelClass(id, 's1'), duelClass(id, 's1'), 'the same seed picks the same class');
    assert.ok(new Set(Array.from({ length: 40 }, (_, i) => duelClass(id, `seed-${i}`))).size > 1, `${id}: different seeds draw different classes`);
  }
  // A pure healer is not a pool member, so its tier-mates are all fighters.
  assert.ok(!duelClassPool('cleric').includes('cleric'));
  const step = STORY_CHAPTER_QUESTS[2].steps[0] as Extract<typeof STORY_CHAPTER_QUESTS[2]['steps'][number], { kind: 'duel' }>;
  assert.equal(duelLevel([{ level: 12, status: 'active' }, { level: 30, status: 'dead' }, { level: 25, status: 'active' }], step), 26, 'fallen units do not count');
  const hero = createUnit('erin', 20, 'u0', 0);
  const enemyOf = (unit: typeof hero, seed: string) => createStoryDuel(unit, step, { seed, day: 1482, level: 30 }).state.units.find(u => u.side === 'enemy')!;
  const a = enemyOf(hero, 'fixed'), b = enemyOf(hero, 'fixed'), c = enemyOf(hero, 'other');
  assert.deepEqual([a.name, a.classId, a.stats], [b.name, b.classId, b.stats]);
  assert.notEqual(a.name, c.name, 'another seed rolls another person');
  const healer = enemyOf(createUnit('noah', 20, 'u1', 0), 'fixed');
  assert.ok(healer.weapons.some(id => !WEAPONS[id].heal), 'the opponent of a healer can fight');
  assert.equal(CLASSES[healer.classId].stage, CLASSES[createUnit('noah', 20, 'u1', 0).classId].stage);
});

test('every preliminary task has its own reward: consumables and weapons, only a little gold', () => {
  for (const row of STORY_CHAPTER_QUESTS) for (const step of row.steps) {
    const reward = stepReward(step, row.chapter);
    assert.ok(reward.gold >= 100 && reward.gold <= 600, `${step.id} gold ${reward.gold}`);
    assert.ok((reward.items ?? []).length >= 1, `${step.id} gives items, not just gold`);
    for (const [item] of reward.items ?? []) {
      assert.ok(Object.hasOwn(GAME_ITEMS, item), `${step.id}: ${item} exists`);
      assert.ok(!GAME_ITEMS[item].bound, `${step.id}: ${item} is an ordinary tradable item`);
    }
    assert.equal(reward.bexp !== undefined, step.kind === 'duel', `${step.id}: only duels give shared experience`);
  }
  const kinds = new Set(STORY_CHAPTER_QUESTS.flatMap(row => row.steps.flatMap(step => (stepReward(step).items ?? []).map(([item]) => GAME_ITEMS[item].kind === 'weapon' ? 'weapon' : item))));
  for (const wanted of ['vulnerary', 'elixir', 'antidote', 'weapon', 'ether_ration']) assert.ok(kinds.has(wanted), `some task rewards ${wanted}`);
  assert.deepEqual(Object.keys(STORY_STEP_REWARDS).sort(), STORY_CHAPTER_QUESTS.flatMap(row => row.steps.map(step => step.id)).sort(), 'no reward without a task and no task without a reward');
});

test('each reward is paid once, in items as well as gold, when its task completes', t => {
  const ctx = setup(t, 1482);
  ctx.player.flags.clearedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  const held = (item: Parameters<typeof ctx.store.countInventory>[1]) => ctx.store.countInventory(ctx.player.id, item);
  const snapshot = () => ({ gold: ctx.player.gold, bexp: ctx.player.bexp, elixir: held('elixir'), antidote: held('antidote'), vulnerary: held('vulnerary'), sword: held('killing_edge'), lance: held('killer_lance') });
  const diff = (before: ReturnType<typeof snapshot>) => Object.fromEntries(Object.entries(snapshot()).map(([k, v]) => [k, v - before[k as keyof typeof before]]).filter(([, v]) => v !== 0));

  // Hand-in (chapter 3): the ore is spent, the reward is paid once.
  ctx.store.addInventory(ctx.player.id, 'ore', 0, 20);
  let before = snapshot();
  const handIn = dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' }) as { reward: { gold: number }; message: string };
  assert.deepEqual(diff(before), { gold: 250, elixir: 1, vulnerary: 2 });
  assert.equal(handIn.reward.gold, 250);
  assert.match(handIn.message, /修复卷宗.*金币 \+250.*特效药 ×1.*伤药 ×2/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' }), /已经完成/);
  assert.deepEqual(diff(before), { gold: 250, elixir: 1, vulnerary: 2 }, 'no second payment');

  // Find (chapter 2): a weapon and an antidote, paid the first time the item is noticed.
  before = snapshot();
  ctx.store.addInventory(ctx.player.id, 'story_find_2', 0, 1);
  dispatch(ctx, OP.GET_STORY, {});
  dispatch(ctx, OP.GET_STORY, {});
  assert.deepEqual(diff(before), { gold: 200, antidote: 1, lance: 1 });

  // Dispatch (chapter 2): potions when the team returns.
  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 3, unitIds: ['u_lina'] });
  before = snapshot();
  ctx.player.day += 3;
  syncPlayer(ctx.store, ctx.player);
  assert.deepEqual(diff(before), { gold: 200, vulnerary: 3 });

  // Duel (chapter 3): gold, shared experience, a weapon, an elixir and potions on the win.
  const started = dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_erin' }) as { battleId: string };
  before = snapshot();
  win(ctx, started.battleId);
  assert.deepEqual(diff(before), { gold: 300, bexp: 300, elixir: 1, vulnerary: 2, sword: 1 });

  // Each payment is an event, and the step view shows what it paid.
  const paid = ctx.store.events(ctx.player.id, 0, 1000).filter(e => e.kind === 'story' && e.text.includes('完成主线前置任务'));
  assert.equal(paid.length, 4);
  assert.ok(paid.some(e => e.text.includes('刮名人') && e.text.includes('公共经验 +300') && e.text.includes('杀手剑 ×1') && e.text.includes('特效药 ×1')));
  const shown = (dispatch(ctx, OP.GET_STORY, {}) as { chapters: { chapter: number; quest: { steps: { id: string; done: boolean; reward: { gold: number; items: [string, number][] } }[] } }[] })
    .chapters.find(c => c.chapter === 3)!.quest.steps;
  assert.deepEqual(shown.map(step => [step.id, step.done, step.reward.gold]), [['story-3-a', true, 300], ['story-3-b', true, 250]]);
  assert.ok(shown[0].reward.items.some(([item]) => item === 'killing_edge'));
});

test('arena and tavern wins pay their reward when the count is reached', t => {
  const ctx = setup(t, 600);
  const held = (item: Parameters<typeof ctx.store.countInventory>[1]) => ctx.store.countInventory(ctx.player.id, item);
  const g0 = ctx.player.gold, e0 = held('elixir'), a0 = held('antidote'), v0 = held('vulnerary');
  grantStepRewards(ctx.store, ctx.player, recordStoryWin(ctx.player, 'arena'));
  assert.deepEqual([ctx.player.gold - g0, held('elixir') - e0], [0, 0], 'the first of two arena wins pays nothing yet');
  grantStepRewards(ctx.store, ctx.player, recordStoryWin(ctx.player, 'arena'));
  assert.deepEqual([ctx.player.gold - g0, held('elixir') - e0, held('vulnerary') - v0], [150, 1, 3], 'chapter 1 arena task');
  grantStepRewards(ctx.store, ctx.player, recordStoryWin(ctx.player, 'tavern'));
  grantStepRewards(ctx.store, ctx.player, recordStoryWin(ctx.player, 'tavern'));
  assert.deepEqual([ctx.player.gold - g0, held('antidote') - a0, held('vulnerary') - v0], [300, 2, 5], 'chapter 1 tavern task adds gold, antidotes and potions');
  grantStepRewards(ctx.store, ctx.player, recordStoryWin(ctx.player, 'arena'));
  assert.equal(ctx.player.gold - g0, 300, 'a finished task never pays twice');
});
