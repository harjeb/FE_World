import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { decide } from '../common/engine/index.ts';
import { stats } from '../common/data/types.ts';
import type { Player } from './store.ts';

function setup() {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, 'quest', undefined, '任务军团');
  return { store, accountId, player: syncPlayer(store, player) };
}

function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}

function playOut(ctx: Context, battleId: string): string {
  for (let guard = 0; guard < 2000; guard++) {
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
  assert.equal(player.day, day + 4, 'short quest costs 4 days, paid once');
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

test('quest objectives reach the engine: seize maps get a throne, defend maps survive the turn limit', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor', 'u_gustav', 'u_lina', 'u_owen', 'u_noah']);
  // gw2（占领）只需 gw1 完成；gw5（坚守）需要 gw1–gw4。
  player.flags.questsDone = ['gw1'];
  player.flags.regionReputation = { 2: 100 };
  store.savePlayer(player);

  const seize = dispatch(ctx, OP.START_QUEST, { questId: 'gw2', unitIds: ['u_erin'] }) as { battleId: string };
  const seizeBattle = store.battle(player.id, seize.battleId)!;
  assert.equal(seizeBattle.state.goal.kind, 'seize');
  assert.ok(seizeBattle.state.goal.kind === 'seize' && seizeBattle.state.goal.throne.length === 2);
  assert.equal(seizeBattle.questId, 'gw2');
  // 撤退结束这一场，避免下一场撞上“已有进行中的战斗”。
  dispatch(ctx, OP.RETREAT, { battleId: seize.battleId });

  player.flags.questsDone = ['gw1', 'gw2', 'gw3', 'gw4'];
  store.savePlayer(player);
  const defend = dispatch(ctx, OP.START_QUEST, { questId: 'gw5', unitIds: ['u_erin'] }) as { battleId: string };
  const defendBattle = store.battle(player.id, defend.battleId)!;
  assert.equal(defendBattle.state.goal.kind, 'defend');
  assert.equal(defendBattle.state.turnLimit, 20);
  // 直接推进回合到上限：坚守图撑满回合即胜（store.battle 每次返回新对象，循环重新读取）。
  for (let i = 0; i < 60 && !store.battle(player.id, defend.battleId)!.state.result; i++) {
    dispatch(ctx, OP.END_PHASE, { battleId: defend.battleId });
  }
  assert.equal(store.battle(player.id, defend.battleId)!.state.result!.winner, 'player');
});

test('a quest cannot start while another battle is in progress', () => {
  const { store, accountId, player } = setup();
  const ctx = ctxFor(store, accountId, player);
  empower(store, player, ['u_erin', 'u_victor']);
  dispatch(ctx, OP.START_QUEST, { questId: 'gw1', unitIds: ['u_erin', 'u_victor'] });
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'ih1', unitIds: ['u_erin'] }), /进行中的战斗/);
});
