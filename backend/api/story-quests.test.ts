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
import { COMPANION_QUESTS, STORY_CHAPTER_QUESTS, STORY_QUESTS, storyClueKey, storyStepId } from '../common/game/story-quests.ts';
import { interactObject } from '../common/engine/scenario.ts';
import type { BattleState } from '../common/engine/types.ts';

function setup(t: { after: (fn: () => void) => void }, day = 600): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'story-quests');
  seedFullRoster(store, player);
  player.day = day;
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

test('each chapter chains a dispatch, a material hand-in and then the battle', t => {
  assert.ok(STORY_CHAPTER_QUESTS.every(row => row.steps.length === 2 && row.steps[0].kind === 'dispatch' && row.steps[1].kind === 'submit'));
  const ctx = setup(t, 482);
  ctx.player.flags.clearedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  type Step = { id: string; kind: string; done: boolean; available: boolean; held?: number; count?: number; optional: boolean };
  const view = () => (dispatch(ctx, OP.GET_STORY, {}) as { chapters: { quest: { steps: Step[]; prerequisite: string | null; available: boolean } }[] }).chapters[0].quest;

  assert.deepEqual(view().steps.map(step => [step.id, step.done, step.available]), [['story-1-a', false, true], ['story-1-b', false, false]]);
  assert.equal(view().prerequisite, '城外的传闻');
  assert.equal(view().available, false);
  assert.throws(() => start(ctx, 'story-1'), /先完成本章前置任务「城外的传闻」/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-1-b' }), /先完成前置任务/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-1-a' }), /自动完成/);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'nope' }), /没有这个前置任务/);

  // A dispatch that is too short does not count; one that is long enough completes it on return.
  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 2, unitIds: ['u_victor'] });
  ctx.player.day += 2;
  syncPlayer(ctx.store, ctx.player);
  assert.equal(view().steps[0].done, false, 'a 2-day dispatch is shorter than the required 3');
  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 3, unitIds: ['u_victor'] });
  assert.equal(view().steps[0].done, false, 'not until the dispatch returns');
  ctx.player.day += 3;
  syncPlayer(ctx.store, ctx.player);
  assert.equal(view().steps[0].done, true);
  assert.equal(view().steps[1].available, true);
  assert.equal(view().prerequisite, '安置伤者');

  // The hand-in checks the count, then takes the materials.
  ctx.store.addInventory(ctx.player.id, 'herb', 0, 5);
  const herb = ctx.store.countInventory(ctx.player.id, 'herb');
  ctx.store.takeInventory(ctx.player.id, 'herb', herb - 5);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-1-b' }), /需要 6 份药草，仓库里只有 5 份/);
  ctx.store.addInventory(ctx.player.id, 'herb', 0, 4);
  dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-1-b' });
  assert.equal(ctx.store.countInventory(ctx.player.id, 'herb'), 3, 'six herbs were handed in');
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-1-b' }), /已经完成/);
  assert.equal(view().prerequisite, null);
  assert.equal(view().available, true);
  assert.ok(start(ctx, 'story-1').battleId, 'the finale opens once both preliminaries are done');
});

test('a dispatch started before the chapter opened does not count, and one dispatch serves one chapter', t => {
  const ctx = setup(t, 470);
  ctx.player.flags.clearedRegions = [1];
  ctx.store.savePlayer(ctx.player);
  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 20, unitIds: ['u_victor'] });
  ctx.player.day = 495;
  syncPlayer(ctx.store, ctx.player);
  assert.deepEqual(ctx.player.flags.storyStepsDone ?? [], [], 'started on day 470, before chapter 1 opened on day 482');

  dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 6, unitIds: ['u_lina'] });
  ctx.player.day = 1000;
  syncPlayer(ctx.store, ctx.player);
  assert.deepEqual(ctx.player.flags.storyStepsDone, ['story-1-a'], 'chapters 1 and 2 are both open but one dispatch completes only the earliest');
});
