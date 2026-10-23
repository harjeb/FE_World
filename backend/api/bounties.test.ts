import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { BOUNTY_QUESTS } from '../common/game/bounties.ts';
import { questById } from '../common/game/quests.ts';
import { CLASSES } from '../common/data/classes.ts';
import { createEnemy } from '../common/game/enemies.ts';
import { BOARD_MAX, BOARD_MIN } from './quest-board.ts';
import { announceBounties, bountyRows, trackBattleBounties, trackDungeonBounties } from './bounties.ts';
import type { BattleState } from '../common/engine/types.ts';

function setup(t: { after: (fn: () => void) => void }, day = 100): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'bounties');
  seedFullRoster(store, player);
  player.day = day;
  store.savePlayer(player);
  return { store, player: syncPlayer(store, player), accountId, agentModel: null, push() {} };
}

// A finished field battle with the given enemy classes defeated (and optionally a player win).
function finished(classes: string[], won = true): { mode: string; state: BattleState } {
  const units = classes.map((classId, i) => ({ ...createEnemy(`e${i}`, { classId: classId as never, level: 5, pos: [i, 0] }), alive: false }));
  return { mode: 'field', state: { units, result: won ? { winner: 'player', reason: 'x' } : undefined } as unknown as BattleState };
}

type Row = { id: string; need: number; have: number; done: boolean; claimed: boolean; available: boolean };
type Entry = { id: string; label: 'main' | 'side'; state: string; title: string; summary: string; progress?: { have: number; need: number }; claim?: string };
const quests = (ctx: Context) => dispatch(ctx, OP.GET_QUESTS, {}) as { bounties: Row[]; board: Entry[] };

test('bounty quests are defined without a scenario and are labelled by chapter gating', () => {
  assert.ok(BOUNTY_QUESTS.length >= 10);
  for (const quest of BOUNTY_QUESTS) {
    assert.ok(quest.bounty && quest.region === 0 && !quest.scenarioId && !quest.scenarioIds, quest.id);
    assert.ok(quest.reward.gold > 0 && (quest.reward.items ?? []).length >= 1, `${quest.id} pays items`);
  }
  const sword = questById('bounty-c3-sword')!;
  assert.deepEqual([sword.bounty, sword.requires], [{ type: 'kill', count: 10, route: 'sword' }, { chapter: 3 }]);
  assert.match(sword.objective, /击败 10 名剑术职业敌军/);
});

test('kills count by class route after the gate opens, and a bounty cannot be accepted', t => {
  const ctx = setup(t, 1482);
  const swordClass = Object.keys(CLASSES).find(id => CLASSES[id as keyof typeof CLASSES].route === 'sword' && id === 'swordsman')!;
  const archerClass = 'archer';
  assert.equal(CLASSES[archerClass as keyof typeof CLASSES].route, 'bow');
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'bounty-c3-sword', unitIds: ['u_erin'] }), /不用接取/);

  // Chapter 3 opens on day 1482: three swordsmen and two archers fall in one battle.
  let done = trackBattleBounties(ctx.player, finished([swordClass, swordClass, swordClass, archerClass, archerClass]));
  assert.deepEqual(done, []);
  const progress = ctx.player.flags.questProgress!;
  assert.equal(progress['bounty-c3-sword'], 3, 'only the swordsmen count for the sword bounty');
  assert.equal(progress['bounty-c1-bow'], 2, 'the archers count for the chapter 1 bow bounty (chapter 1 is open)');
  assert.equal(progress['bounty-rookie'], 5, 'every defeated enemy counts for the plain kill bounty');
  // Seven more swordsmen finish it, and it lands in questsDone ready to be handed in.
  done = trackBattleBounties(ctx.player, finished(Array(7).fill(swordClass)));
  assert.ok(done.includes('bounty-c3-sword'));
  assert.ok(ctx.player.flags.questsDone!.includes('bounty-c3-sword'));
  assert.equal(progress['bounty-c3-sword'], 10);
  // A finished bounty stops counting; arena/festival battles never count.
  trackBattleBounties(ctx.player, finished([swordClass]));
  assert.equal(ctx.player.flags.questProgress!['bounty-c3-sword'], 10);
  const before = { ...ctx.player.flags.questProgress };
  trackBattleBounties(ctx.player, { ...finished([swordClass, swordClass]), mode: 'arena' });
  assert.deepEqual(ctx.player.flags.questProgress, before);
});

test('a chapter-gated bounty does not count anything before its chapter opens', t => {
  const ctx = setup(t, 1000); // chapters 1 and 2 are open, chapter 3 opens on day 1482
  trackBattleBounties(ctx.player, finished(Array(12).fill('swordsman')));
  assert.equal(ctx.player.flags.questProgress!['bounty-c3-sword'] ?? 0, 0);
  assert.equal(bountyRows(ctx.player).find(r => r.id === 'bounty-c3-sword')!.available, false);
  assert.ok(ctx.player.flags.questProgress!['bounty-rookie'] >= 10, 'the ungated rookie bounty did count');
});

test('wins and dungeon clears count, and the finished bounty is handed in through CLAIM_QUEST_REWARD once', t => {
  const ctx = setup(t, 700);
  trackBattleBounties(ctx.player, finished([], true));
  trackBattleBounties(ctx.player, finished([], false));
  trackBattleBounties(ctx.player, finished([], true));
  assert.equal(ctx.player.flags.questProgress!['bounty-wins'], 2, 'a lost battle is not a win');
  announceBounties(ctx.store, ctx.player, trackBattleBounties(ctx.player, finished([], true)));
  assert.ok(ctx.player.flags.questsDone!.includes('bounty-wins'));

  const gold = ctx.player.gold, potions = ctx.store.countInventory(ctx.player.id, 'vulnerary');
  const claimed = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'bounty-wins' }) as { gold: number; items: [string, number][] };
  assert.equal(claimed.gold, 300);
  assert.equal(ctx.player.gold, gold + 300);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'vulnerary'), potions + 2);
  assert.equal(ctx.store.countInventory(ctx.player.id, 'antidote') >= 1, true);
  assert.deepEqual(Object.keys(ctx.player.flags.regionReputation ?? {}), [], 'bounties give no reputation');
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'bounty-wins' }), /领取过/);
  trackBattleBounties(ctx.player, finished([], true));
  assert.equal(quests(ctx).bounties.find(r => r.id === 'bounty-wins')!.claimed, true);

  assert.deepEqual(trackDungeonBounties(ctx.player), ['bounty-c1-dungeon'], 'the first full dungeon clear finishes the one-clear bounty');
  assert.equal(ctx.player.flags.questProgress!['bounty-c1-dungeon'], 1);
  assert.deepEqual(trackDungeonBounties(ctx.player), [], 'a finished bounty does not count again');
  assert.ok(!('bounty-c6-dungeon' in ctx.player.flags.questProgress!), 'the chapter 6 dungeon bounty is not counting yet');
});

test('a new game already has a board of four to seven quests, each marked main or side', t => {
  const ctx = setup(t, 0);
  ctx.player.flags.unlockedRegions = [1, 2, 3, 4];
  ctx.store.savePlayer(ctx.player);
  const board = quests(ctx).board;
  assert.ok(board.length >= BOARD_MIN && board.length <= BOARD_MAX, `${board.length} entries: ${board.map(e => e.title).join('、')}`);
  assert.ok(board.every(e => e.label === 'main' || e.label === 'side'));
  assert.ok(board.some(e => e.label === 'main' && e.state === 'wait'), 'before chapter 1 the board teases the main story');
  assert.ok(!board.some(e => e.title.includes('盛会')), 'no chapter title is spoiled before it opens');
  assert.ok(board.some(e => e.label === 'side' && e.id === 'bounty-rookie' && e.progress && e.progress.need === 10), 'the rookie bounty is on the board with its counter');
  assert.equal(new Set(board.map(e => e.id)).size, board.length, 'no duplicates');
});

test('the board puts the current chapter first, hands in finished work, and never exceeds seven entries', t => {
  const ctx = setup(t, 1482);
  ctx.player.flags.unlockedRegions = Array.from({ length: 12 }, (_, i) => i + 1);
  ctx.player.flags.questsDone = ['bounty-rookie'];
  ctx.store.savePlayer(ctx.player);
  let board = quests(ctx).board;
  assert.ok(board.length >= BOARD_MIN && board.length <= BOARD_MAX);
  const turnin = board.filter(e => e.state === 'turnin');
  assert.deepEqual(turnin.map(e => e.claim), ['bounty-rookie'], 'finished bounties are handed in first');
  assert.equal(board[0].state, 'turnin');
  const main = board.filter(e => e.label === 'main');
  assert.ok(main.length >= 1 && main.length <= 3, `${main.length} main entries`);
  assert.ok(main.every(e => e.title.includes('第 1 章')), 'chapter 1 is the current chapter (its finale is not done)');
  assert.ok(board.some(e => e.label === 'side' && e.state !== 'turnin'));

  // After the chapter-1 finale is done and claimed the board moves to chapter 2.
  ctx.player.flags.questsDone = ['bounty-rookie', 'story-1'];
  ctx.player.flags.questRewardsClaimed = ['bounty-rookie', 'story-1'];
  ctx.store.savePlayer(ctx.player);
  board = quests(ctx).board;
  assert.ok(board.filter(e => e.label === 'main').every(e => e.title.includes('第 2 章')));
  assert.ok(board.length <= BOARD_MAX);
});
