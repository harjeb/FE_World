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
import { createUnit, ROSTER_LIMIT } from '../common/game/model.ts';
import { questById } from '../common/game/quests.ts';
import type { CharacterId } from '../common/data/characters.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'quest', undefined, '任务军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

function playOut(ctx: Context, battleId: string): string {
  for (let guard = 0; guard < 2000; guard++) {
    const battle = ctx.store.battle(ctx.player.id, battleId);
    if (!battle || battle.state.result) return battle?.state.result?.winner ?? 'none';
    // 这个测试验证流程，不验证随机地图上 AI 的寻路耗时；须持久化后再由 handler 读取。
    if (battle.state.turnLimit < 60) {
      battle.state.turnLimit = battle.initial.turnLimit = 60;
      ctx.store.saveBattle(battle);
    }
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

function empower(store: Store, player: Player, ids: string[]): void {
  for (const id of ids) {
    const unit = store.unit(player.id, id)!;
    unit.level = 99;
    unit.stats = stats(150, 99, 99, 99, 99, 99, 99, 99);
    unit.hp = 150;
    store.saveUnit(unit, player.id);
  }
}

interface QuestView { id: string; available: boolean; done: boolean; claimed: boolean; kind: string }
function questView(ctx: Context, region: number): { reputation: number; tier: { name: string }; quests: QuestView[] } {
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; reputation: number; tier: { name: string }; quests: QuestView[] }[] };
  return view.regions.find(r => r.region === region)!;
}

test('a quest pays its days once, marks done on a win, and its first reward is claimable only once', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];
  empower(store, player, ids);

  const before = questView(ctx, 2);
  assert.ok(before.quests.find(q => q.id === 'gw1')!.available, 'gw1 is open from the start');
  assert.ok(!before.quests.find(q => q.id === 'gw2')!.available, 'gw2 waits for gw1');

  const day = player.day;
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'gw1', unitIds: ids }) as { battleId: string; goalText: string };
  assert.equal(player.day, day + 1, 'short quest costs 1 day, paid once');
  assert.equal(playOut(ctx, started.battleId), 'player');

  const afterWin = questView(ctx, 2);
  assert.ok(afterWin.quests.find(q => q.id === 'gw1')!.done, 'a win marks the quest done');
  assert.ok(!afterWin.quests.find(q => q.id === 'gw1')!.claimed, 'the reward is claimed separately');
  assert.ok(afterWin.quests.find(q => q.id === 'gw2')!.available, 'gw2 opens once gw1 is done');

  const gold = player.gold;
  const claimed = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw1' }) as { gold: number; reputation: { after: number; tier: { name: string } } };
  assert.equal(claimed.gold, 800);
  assert.equal(player.gold, gold + 800);
  assert.equal(claimed.reputation.after, 20);
  assert.equal(questView(ctx, 2).reputation, 20);
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw1' }), /已经领取过/);
  assert.equal(questView(ctx, 2).quests.find(q => q.id === 'gw1')!.claimed, true);
});

test('a full roster keeps a quest recruit claimable instead of losing the character', () => {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'quest-full', undefined, '任务军团');
  const ctx = ctxFor(store, accountId, player);
  player.flags.questsDone = ['gw6'];
  store.savePlayer(player);
  const active = () => store.units(player.id).filter(u => u.status === 'active');
  for (let i = active().length; i < ROSTER_LIMIT; i++) {
    store.addUnit(player.id, createUnit('karl' as CharacterId, 1, `fill_${i}`, player.day, true));
  }
  assert.equal(active().length, ROSTER_LIMIT);
  assert.ok(!store.units(player.id).some(u => u.character === 'ren'), 'ren is not owned yet');
  // 满员时领取失败，但不消耗领取资格（人物不丢失）。
  assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw6' }), /名册已满/);
  assert.ok(!(player.flags.questRewardsClaimed ?? []).includes('gw6'));
  assert.ok(!store.units(player.id).some(u => u.character === 'ren'));
  // 腾出位置后仍可领取并加入。
  const drop = active().find(u => !u.isProtagonist)!;
  dispatch(ctx, OP.DISMISS, { unitId: drop.id });
  const claimed = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'gw6' }) as { recruited: { character: string }[] };
  assert.equal(claimed.recruited[0]?.character, 'ren');
  assert.ok(store.units(player.id).some(u => u.character === 'ren'));
});

test('quest objectives reach the engine: seize, defend, escape, gather and escort', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah']);
  const start = (questId: string) => dispatch(ctx, OP.START_QUEST, { questId, unitIds: ['u_erin'] }) as { battleId: string };
  const retreat = (battleId: string) => dispatch(ctx, OP.RETREAT, { battleId });

  // 占领：ih2 需要 ih1。
  player.flags.questsDone = ['ih1'];
  store.savePlayer(player);
  const seize = start('ih2');
  const seizeGoal = store.battle(player.id, seize.battleId)!.state.goal;
  assert.equal(seizeGoal.kind, 'seize');
  assert.ok(seizeGoal.kind === 'seize' && seizeGoal.throne.length === 2);
  retreat(seize.battleId);

  // 坚守：gw5 需要 gw1–gw4 + 声望 100。
  player.flags.questsDone = ['gw1', 'gw2', 'gw3', 'gw4'];
  player.flags.regionReputation = { 2: 100 };
  store.savePlayer(player);
  const defend = start('gw5');
  const defendBattle = store.battle(player.id, defend.battleId)!;
  assert.equal(defendBattle.state.goal.kind, 'defend');
  assert.equal(defendBattle.state.turnLimit, 20);
  // 直接推进回合到上限：坚守图撑满回合即胜（store.battle 每次返回新对象，循环重新读取）。
  for (let i = 0; i < 60 && !store.battle(player.id, defend.battleId)!.state.result; i++) {
    dispatch(ctx, OP.END_PHASE, { battleId: defend.battleId });
  }
  assert.equal(store.battle(player.id, defend.battleId)!.state.result!.winner, 'player');

  // 撤离：wl1 无前置。
  const escape = start('wl1');
  const escapeGoal = store.battle(player.id, escape.battleId)!.state.goal;
  assert.equal(escapeGoal.kind, 'escape');
  assert.ok(escapeGoal.kind === 'escape' && escapeGoal.exits.length > 0);
  retreat(escape.battleId);

  // 抢物资：gw3 需要 gw1、gw2；地图上应有物资箱。
  player.flags.questsDone = ['gw1', 'gw2'];
  store.savePlayer(player);
  const gather = start('gw3');
  const gatherBattle = store.battle(player.id, gather.battleId)!;
  assert.equal(gatherBattle.state.goal.kind, 'gather');
  assert.ok((gatherBattle.state.boxes ?? []).length >= 1, 'gather maps place boxes');
  retreat(gather.battleId);

  // 护送：gw2 需要 gw1；生成玩家方 NPC。
  player.flags.questsDone = ['gw1'];
  store.savePlayer(player);
  const escort = start('gw2');
  const escortBattle = store.battle(player.id, escort.battleId)!;
  assert.equal(escortBattle.state.goal.kind, 'escort');
  assert.ok(escortBattle.state.units.some(u => u.npc && u.side === 'player'), 'escort maps add a player NPC');
});

test('a quest cannot start while another battle is in progress', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor']);
  dispatch(ctx, OP.START_QUEST, { questId: 'gw1', unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'ih1', unitIds: ['u_erin'] }), /进行中的战斗/);
});

test('the reputation shop gates items by reputation and spends gold once unlocked', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; shop: { item: string; price: number; unlocked: boolean }[] }[] };
  const shop = view.regions.find(r => r.region === 2)!.shop;
  const bow = shop.find(e => e.item === 'killer_bow')!;
  assert.equal(bow.unlocked, false, 'killer_bow needs reputation 100');
  assert.throws(() => dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 2, item: 'killer_bow' }), /声望/);
  player.flags.regionReputation = { 2: 100 };
  player.gold = 100_000;
  store.savePlayer(player);
  const bought = dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 2, item: 'killer_bow' }) as { price: number; gold: number };
  assert.equal(bought.price, bow.price);
  assert.equal(player.gold, 100_000 - bow.price);
  assert.ok(store.countInventory(player.id, 'killer_bow') > 0);
  // 购买不扣声望。
  assert.equal(player.flags.regionReputation[2], 100);
});

test('a region expedition runs three maps and only marks the quest done at the end', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];
  empower(store, player, ids);
  player.flags.questsDone = ['gw1', 'gw2', 'gw3', 'gw4', 'gw5'];
  player.flags.regionReputation = { 2: 100 };
  store.savePlayer(player);
  const day = player.day;
  const started = dispatch(ctx, OP.START_QUEST, { questId: 'gw6', unitIds: ids }) as { battleId: string; run: { stageIndex: number; state: string } };
  assert.equal(started.run.stageIndex, 0);
  assert.equal(player.day, day + 2, 'region expedition pays 2 days per map');
  assert.equal(store.battle(player.id, started.battleId)!.state.goal.kind, 'seize', 'map 1 探路 = seize');
  assert.equal(playOut(ctx, started.battleId), 'player');
  assert.ok(!(player.flags.questsDone ?? []).includes('gw6'), 'stage one does not complete the quest');
  const second = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 4);
  assert.equal(store.battle(player.id, second.battleId)!.state.goal.kind, 'rout', 'map 2 消耗战 = rout');
  assert.equal(playOut(ctx, second.battleId), 'player');
  const third = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
  assert.equal(player.day, day + 6);
  assert.equal(store.battle(player.id, third.battleId)!.state.goal.kind, 'boss', 'map 3 首领战 = boss');
  assert.equal(playOut(ctx, third.battleId), 'player');
  assert.ok(player.flags.questsDone!.includes('gw6'), 'finishing all three maps completes the quest');
});

test('an old three-quest region can finish its new branches and claim the ending exactly once', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  player.flags.questsDone = ['r9-1', 'r9-2', 'r9-3'];
  player.flags.questRewardsClaimed = [...player.flags.questsDone];
  player.flags.regionReputation = { 9: 160 };
  store.savePlayer(player);
  assert.ok(questView(ctx, 9).quests.find(q => q.id === 'r9-4')!.available);
  assert.equal(questView(ctx, 9).quests.find(q => q.id === 'r9-7')!.available, false);
  for (const id of ['r9-4', 'r9-5', 'r9-6', 'r9-7', 'r9-8', 'r9-9']) {
    assert.ok(questView(ctx, 9).quests.find(q => q.id === id)!.available, id);
    // 已有引擎胜利与三图流程测试；此处只注入完成事实，检验旧进度的解锁、持久化与领奖幂等。
    player.flags.questsDone!.push(id);
    store.savePlayer(player);
    const gold = player.gold;
    const payload = { questId: id, commandId: `claim-${id}` };
    const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, payload);
    assert.deepEqual(dispatch(ctx, OP.CLAIM_QUEST_REWARD, payload), reward);
    assert.equal(player.gold, gold + questById(id)!.reward.gold);
    assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: id }), /已经领取过/);
  }
  assert.equal(store.getPlayer(player.id)!.flags.regionReputation![9], 500);
  assert.equal(player.flags.legacyUnlocked, undefined, 'new endings do not expand the legacy unlock sources');
  assert.equal(store.countInventory(player.id, 'royal_sword'), 0, 'old exclusive rewards are not issued again');
});

test('new core expeditions use their configured goals and cannot pay reputation after only one map', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  const ids = ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah'];
  empower(store, player, ids);
  player.flags.questsDone = ['r9-1', 'r9-2', 'r9-3', 'r9-4', 'r9-5', 'r9-6'];
  player.flags.regionReputation = { 9: 260 };
  store.savePlayer(player);
  const day = player.day;
  let started = dispatch(ctx, OP.START_QUEST, { questId: 'r9-7', unitIds: ids }) as { battleId: string };
  for (const [stage, kind] of ['rout', 'seize', 'boss'].entries()) {
    const battle = store.battle(player.id, started.battleId)!;
    assert.equal(battle.questId, 'r9-7');
    assert.equal(battle.state.goal.kind, kind);
    assert.equal(battle.costDays, 2);
    assert.equal(player.day, day + (stage + 1) * 2);
    // 本例验收逐图配置与结算边界：准备一手可胜的棋盘，避免随机地形下的 AI 寻路左右流程测试。
    const leader = battle.state.units.find(unit => unit.side === 'player')!;
    for (const enemy of battle.state.units.filter(unit => unit.side === 'enemy')) { enemy.alive = false; enemy.hp = 0; }
    if (battle.state.goal.kind === 'seize') leader.pos = [...battle.state.goal.throne];
    battle.initial = structuredClone(battle.state);
    store.saveBattle(battle);
    dispatch(ctx, OP.UNIT_ACT, { battleId: battle.id, unitId: leader.id, moveTo: leader.pos, action: kind === 'seize' ? 'seize' : 'wait' });
    assert.equal(store.battle(player.id, battle.id)!.state.result?.winner, 'player');
    if (stage < 2) {
      assert.ok(!player.flags.questsDone!.includes('r9-7'));
      assert.throws(() => dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'r9-7' }), /尚未完成/);
      started = dispatch(ctx, OP.CONTINUE_DUNGEON, {}) as { battleId: string };
    }
  }
  const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'r9-7' }) as { reputation: { after: number } };
  assert.equal(reward.reputation.after, 340);
});

test('new classic rewards preserve already earned reputation and still issue gold and loot', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  player.flags.regionReputation = { 2: 620 };
  player.flags.questsDone = ['cl-fe1-ch16'];
  store.savePlayer(player);
  const gold = player.gold;
  const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'cl-fe1-ch16' }) as { gold: number; reputation: { after: number } };
  assert.ok(reward.gold > 0);
  assert.equal(player.gold, gold + reward.gold);
  assert.equal(reward.reputation.after, 620);
});
