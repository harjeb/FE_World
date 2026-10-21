import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { OP } from '../common/protocol/ops.ts';
import { createAnnualEntry } from '../common/game/annual.ts';
import { STORY_CHAPTER_QUESTS, storyQuestId } from '../common/game/story-quests.ts';
import { STORY_NARRATIVE } from '../common/game/story-narrative.ts';
import type { StoryScene } from '../common/game/story-narrative.ts';
import { CHALLENGE_FLOORS } from '../common/game/challenges.ts';

function setup(t: { after(fn: () => void): void }, day = 4000): Context {
  const store = new Store(openDb(':memory:'));
  t.after(() => store.db.close());
  const { player, accountId } = loginOrRegister(store, 'royal-capital');
  seedFullRoster(store, player);
  player.day = day;
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  return { store, player, accountId, agentModel: null, push() {} };
}
type StoryView = { postgame: object | null; chapters: { chapter: number; learned: string | null; quest: { available: boolean; scenes: StoryScene[]; steps: { id: string; scenes: StoryScene[] }[]; blocker: string | null }; finalBoss: { defeated: boolean } | null }[] };
const view = (ctx: Context) => dispatch(ctx, OP.GET_STORY, {}) as StoryView;
function save(ctx: Context) { ctx.store.savePlayer(ctx.player); }
function finish(ctx: Context, id: string, bossOnly = false) {
  const record = ctx.store.battle(ctx.player.id, id)!;
  const leader = record.state.units.find(unit => unit.side === 'player')!;
  for (const enemy of record.state.units.filter(unit => unit.side === 'enemy' && (!bossOnly || unit.id === (record.state.goal.kind === 'boss' ? record.state.goal.target : '')))) {
    enemy.hp = 0; enemy.alive = false;
  }
  if (record.state.goal.kind === 'seize') leader.pos = [...record.state.goal.throne];
  ctx.store.saveBattle(record);
  dispatch(ctx, OP.UNIT_ACT, { battleId: id, unitId: leader.id, moveTo: leader.pos, action: record.state.goal.kind === 'seize' ? 'seize' : 'wait' });
  return ctx.store.battle(ctx.player.id, id)!;
}

test('a late calendar cannot reveal later investigations or hand in their evidence', t => {
  const ctx = setup(t);
  assert.deepEqual(view(ctx).chapters.map(c => c.chapter), [1]);
  const text = JSON.stringify(view(ctx));
  for (const spoiler of ['汲取', '供体', '阿扎赫', '维洛', '复活', '邪神化']) assert.ok(!text.includes(spoiler), spoiler);
  assert.equal(view(ctx).postgame, null);
  const catalog = dispatch(ctx, OP.GET_CATALOG, {}) as { items: Record<string, { note?: string }> };
  const publicNotes = JSON.stringify(Object.entries(catalog.items).filter(([id]) => id.startsWith('story_')).map(([, item]) => item.note));
  for (const spoiler of ['复生', '供体', '阿扎赫', '维洛']) assert.ok(!publicNotes.includes(spoiler), `public item notes must not reveal ${spoiler}`);
  assert.throws(() => dispatch(ctx, OP.COMPLETE_STORY_STEP, { step: 'story-3-b' }), /此前章节/);
  assert.throws(() => dispatch(ctx, OP.START_STORY_DUEL, { step: 'story-3-a', unitId: 'u_erin' }), /此前章节/);
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'story-8', unitIds: ['u_erin'] }), /此前章节/);
  assert.equal(ctx.player.day, 4000);
  assert.deepEqual(ctx.player.flags.storyStepsDone ?? [], []);
});

test('all eight chapters reveal task testimony, battle dialogue and conclusions only after the corresponding progress', t => {
  const ctx = setup(t);
  const seen = new Set<string>();
  for (let chapter = 1; chapter <= 8; chapter++) {
    const current = () => view(ctx).chapters.find(c => c.chapter === chapter)!;
    const before = current();
    assert.equal(before.learned, null);
    assert.deepEqual(before.quest.scenes.map(s => s.id), [`story-${chapter}-opening`]);
    assert.ok(before.quest.steps.every(step => step.scenes.length === 1));
    const steps = STORY_CHAPTER_QUESTS[chapter - 1].steps;
    ctx.player.flags.storyStepsDone = [...(ctx.player.flags.storyStepsDone ?? []), steps[1].id];
    save(ctx);
    const one = current();
    assert.equal(one.quest.steps[0].scenes.length, 1, 'other task outcome is still concealed');
    assert.equal(one.quest.steps[1].scenes.length, 2);
    assert.equal(one.quest.scenes.length, 1, 'battle waits for both tasks');
    ctx.player.flags.storyStepsDone.push(steps[0].id); save(ctx);
    const ready = current();
    assert.equal(ready.quest.available, true);
    assert.deepEqual(ready.quest.scenes.map(s => s.id), [`story-${chapter}-opening`, `story-${chapter}-battle`]);
    const { battleId } = dispatch(ctx, OP.START_QUEST, { questId: storyQuestId(chapter), unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
    finish(ctx, battleId, chapter === 8);
    const done = current();
    assert.ok(done.learned);
    assert.equal(done.quest.scenes.at(-1)!.id, `story-${chapter}-ending`);
    const allScenes = [...done.quest.scenes, ...done.quest.steps.flatMap(step => step.scenes)];
    for (const scene of allScenes) {
      assert.ok(!seen.has(scene.id), scene.id); seen.add(scene.id);
      assert.ok(scene.lines.length >= 2);
    }
    assert.equal(seen.size, chapter * 7);
    if (chapter < 8) assert.ok(view(ctx).chapters.some(c => c.chapter === chapter + 1));
  }
  assert.ok(view(ctx).postgame);
  assert.equal(view(ctx).chapters[7].finalBoss!.defeated, true);
  assert.match(view(ctx).chapters[4].learned!, /仍然活着/);
  assert.match(view(ctx).chapters[6].learned!, /复活亡妻/);
  assert.equal(Object.keys(STORY_NARRATIVE).length, 8);
});

test('the capital finale waits for the eighth tournament, but requires neither participation nor the championship', t => {
  const ctx = setup(t, 3982);
  ctx.player.flags.storyCompleted = [1, 2, 3, 4, 5, 6, 7];
  ctx.player.flags.storyStepsDone = ['story-8-a', 'story-8-b']; save(ctx);
  assert.match(view(ctx).chapters[7].quest.blocker!, /竞技场落幕/);
  assert.ok(!view(ctx).chapters[7].quest.scenes.some(s => s.id === 'story-8-battle'));
  const start = () => dispatch(ctx, OP.START_QUEST, { questId: 'story-8', unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  assert.throws(start, /竞技场落幕/);
  const entry = createAnnualEntry('eighth', ctx.player.id, 8, ['u_erin']);
  entry.state = 'eliminated'; ctx.store.saveAnnualEntry(entry);
  assert.equal(view(ctx).chapters[7].quest.available, true, 'an eliminated entrant can still investigate');
  const { battleId } = start();
  const battle = ctx.store.battle(ctx.player.id, battleId)!;
  assert.equal(battle.state.goal.kind, 'boss');
  const boss = battle.state.units.find(unit => unit.boss && unit.side === 'enemy')!;
  assert.equal(boss.name, '邪神化教首·洛德里克');
  assert.equal(boss.classId, 'high_epitaph');
  assert.match(battle.goalText, /洛德里克/);
  const finished = finish(ctx, battleId, true);
  assert.equal(finished.state.result?.winner, 'player', 'killing the named boss wins without seizing the original throne');
  assert.ok(finished.state.units.some(unit => unit.side === 'enemy' && unit.alive), 'other guards need not be exterminated');
  assert.ok(ctx.player.flags.storyCompleted!.includes(8));
});

test('a nonentrant can reach the finale after the eighth tournament window closes', t => {
  const ctx = setup(t, 3999);
  ctx.player.flags.storyCompleted = [1, 2, 3, 4, 5, 6, 7];
  ctx.player.flags.storyStepsDone = ['story-8-a', 'story-8-b']; save(ctx);
  assert.equal(view(ctx).chapters[7].quest.available, false);
  ctx.player.day = 4000; save(ctx);
  assert.equal(view(ctx).chapters[7].quest.available, true);
  assert.equal(view(ctx).chapters[7].quest.blocker, null);
});

test('forbidden land opens after the capital case, enforces its route and creates three actual hard boss fights', t => {
  const ctx = setup(t);
  const floors = () => (dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: { id: string; available: boolean; claimedEquipment: boolean }[] }).floors;
  const start = (floorId: string) => dispatch(ctx, OP.START_CHALLENGE, { floorId, unitIds: ['u_erin', 'u_victor'] }) as { battleId: string };
  assert.deepEqual(floors().map(f => f.id), ['tower-1', 'tower-2']);
  assert.throws(() => start('forbidden-abyss'), /第八章/);
  ctx.player.flags.storyCompleted = [8]; save(ctx);
  assert.equal(floors().length, 5);
  assert.throws(() => start('forbidden-altar'), /缚门者/);
  assert.throws(() => start('forbidden-abyss'), /逆祷者/);
  for (const floor of CHALLENGE_FLOORS.filter(f => f.postgame)) {
    assert.equal(floors().find(f => f.id === floor.id)!.available, true);
    const { battleId } = start(floor.id);
    const battle = ctx.store.battle(ctx.player.id, battleId)!;
    assert.equal(battle.state.aiDifficulty, 'hard');
    assert.equal(battle.state.goal.kind, 'boss');
    assert.equal(battle.initial.units.find(u => u.boss && u.side === 'enemy')!.name, floor.boss!.name);
    assert.equal(finish(ctx, battleId, true).state.result?.winner, 'player');
    assert.ok(ctx.player.flags.towerCleared!.includes(floor.id));
    const claim = () => dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: floor.id }) as { gold: number };
    assert.equal(claim().gold, floor.first.gold);
    assert.equal(claim().gold, floor.repeat.gold);
    assert.throws(claim, /已经领取/);
    assert.equal(floors().find(f => f.id === floor.id)!.claimedEquipment, true);
  }
});

test('legacy completed chapters keep their evidence and equipment reward eligibility', t => {
  const ctx = setup(t, 3982);
  ctx.player.flags.storyCompleted = [8];
  ctx.player.flags.towerCleared = ['tower-3']; save(ctx);
  const last = view(ctx).chapters.find(c => c.chapter === 8)!;
  assert.equal(last.quest.blocker, null, 'old completion is never put behind the new tournament condition');
  assert.equal(last.finalBoss!.defeated, true);
  const claim = dispatch(ctx, OP.CLAIM_CHALLENGE_REWARD, { floorId: 'tower-3' }) as { equipment: string[] };
  assert.deepEqual(claim.equipment, CHALLENGE_FLOORS[2].equipment);
  assert.ok(view(ctx).postgame);
});
