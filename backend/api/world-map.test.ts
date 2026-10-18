import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginOrRegister } from './auth.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer, stateView } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { createFieldBattle } from '../common/game/battles.ts';
import { createRun } from '../common/game/expedition.ts';
import { isArenaDay } from '../common/game/calendar.ts';
import type { Player } from './store.ts';

// 世界地图开荒（region-map 契约 + 特性门）：新档先选路线再解锁地区，旧档按真实证据认领。
function fresh(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  return { store, accountId, player };
}
function ctxFor(store: Store, accountId: string, player: Player): Context {
  return { store, accountId, player, agentModel: null, push: () => {} };
}
const HERO = { name: '星见', sex: 'female', portrait: 'sera', allocation: { hp: 18, str: 6, mag: 10, skl: 5, spd: 5, lck: 5, def: 5, res: 4, cha: 2 } };
function completeSetup(ctx: Context): void {
  dispatch(ctx, OP.COMPLETE_SETUP, { protagonist: HERO, companions: ['victor', 'lina'] });
}

type Features = Record<string, boolean>;

test('a fresh world is fully locked: no region, no sortie, safe empty reads everywhere', () => {
  const { store, accountId, player } = fresh('world-locked');
  const ctx = ctxFor(store, accountId, player);
  const state = stateView(store, player) as { regions: unknown[]; features: Features; world: { selectableRegions: number[]; unlockedRegions: number[]; nodes: { id: number; state: string }[] } };
  assert.deepEqual(state.regions, [], 'GET_STATE.regions 只发已解锁地区');
  assert.deepEqual(state.world.selectableRegions, [1, 2, 3, 4]);
  assert.deepEqual(state.world.unlockedRegions, []);
  assert.equal(state.world.nodes.filter(node => node.state === 'available').length, 4);
  assert.equal(state.world.nodes.filter(node => node.state === 'locked').length, 8);
  assert.equal(state.features.field, false);
  assert.equal(state.features.quests, false);
  assert.equal(state.features.dungeon, false);
  assert.equal(state.features.dispatch, false);
  assert.equal(state.features.arena, false);
  assert.equal(state.features.tower, false);
  assert.equal(state.features.workshop, false);
  assert.equal(state.features.tavern, false, '第一年且无伤亡时酒馆关闭');
  assert.equal(state.features.story, false);
  assert.equal(state.features.legacy, false);
  assert.equal(state.features.reports, false);
  assert.equal(state.features.annual, false);
  assert.equal(state.features.spectate, false);
  // 会话引导在锁定状态也会拉这些读接口：必须安全返回空，不抛错、不造记录。
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: unknown[]; actions: { key: string; available: boolean }[] };
  assert.deepEqual(today.sortieRegions, []);
  assert.equal(today.actions.find(a => a.key === 'sortie')!.available, false);
  const quests = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: unknown[] };
  assert.deepEqual(quests.regions, []);
  assert.deepEqual((dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: unknown[] }).floors, []);
  assert.deepEqual((dispatch(ctx, OP.GET_STORY, {}) as { chapters: unknown[] }).chapters, []);
  const production = dispatch(ctx, OP.GET_PRODUCTION, {}) as { facilities: unknown[]; recipes: unknown[] };
  assert.deepEqual(production.facilities, []);
  assert.deepEqual(production.recipes, []);
  assert.deepEqual((dispatch(ctx, OP.GET_TAVERN, {}) as { regions: unknown[] }).regions, []);
  const arena = dispatch(ctx, OP.GET_ARENA, {}) as { registered: boolean };
  assert.equal(typeof arena.registered, 'boolean');
  assert.equal(store.latestArenaDay(player.id), null, 'GET_ARENA 绝不自动创建竞技场日记录');
  // registered 的默认值不代表已解锁：竞技场日的懒生成也要过特性门。
  player.day = 124;
  assert.equal(isArenaDay(player.day), true);
  store.savePlayer(player);
  syncPlayer(store, player);
  assert.equal(store.latestArenaDay(player.id), null, '特性未开时懒结算不生成竞技场日');
  // 出击／报价按地区拦截。
  assert.throws(() => dispatch(ctx, OP.SORTIE, { region: 5 }), /尚未解锁/);
  const quote = dispatch(ctx, OP.PREVIEW_ACTION, { action: 'sortie', region: 5 }) as { blockers: string[] };
  assert.ok(quote.blockers.some(block => block.includes('尚未解锁')), '报价要给出地区阻挡原因');
  assert.throws(() => dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1 }), /开局/, '完成开局前不能选路线');
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'iron_sword' }), /王都/, '旧目录武器不能从王都商店购买');
});

test('choosing a route costs no days, cannot skip adjacency and is idempotent per commandId', () => {
  const { store, accountId, player } = fresh('world-route');
  const ctx = ctxFor(store, accountId, player);
  completeSetup(ctx);
  const day = player.day;
  const version = player.version;
  const chosen = dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1, commandId: 'route-1' }) as
    { region: number; unlockedRegions: number[]; selectableRegions: number[]; world: { nodes: { id: number; state: string }[] } };
  assert.equal(player.day, day, '选路线不耗日');
  assert.equal(player.version, version + 1, '写命令推进 playerVersion');
  assert.deepEqual(chosen.unlockedRegions, [1]);
  assert.deepEqual(chosen.selectableRegions, [], '首次选择后要先讨伐才能再选相邻路线');
  const states = new Map(chosen.world.nodes.map(node => [node.id, node.state]));
  assert.equal(states.get(1), 'unlocked');
  assert.equal(states.get(2), 'locked', '只选了 1：其它起步路线仍锁定，世界地图视已选路线为准');
  assert.equal(states.get(9), 'locked');
  // 幂等收据：同 commandId 同负载返回原结果；换负载报冲突。
  const replay = dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1, commandId: 'route-1' }) as { region: number };
  assert.equal(replay.region, 1);
  assert.deepEqual(player.flags.unlockedRegions, [1], '重放不重复写入');
  assert.throws(() => dispatch(ctx, OP.CHOOSE_ROUTE, { region: 2, commandId: 'route-1' }), /IDEMPOTENCY_CONFLICT|同一个 commandId/);
  // 跳线与重复选择都被拒绝。
  assert.throws(() => dispatch(ctx, OP.CHOOSE_ROUTE, { region: 9 }), /可选路线/, '不能跳过相邻关系');
  assert.throws(() => dispatch(ctx, OP.CHOOSE_ROUTE, { region: 2 }), /可选路线/, '讨伐前相邻路线不可选');
  assert.throws(() => dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1.5 }), /整数/);
  // 路线互不排斥：讨伐地区 1 后可以继续选择 2 和 5。
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  const after = dispatch(ctx, OP.CHOOSE_ROUTE, { region: 5 }) as { selectableRegions: number[] };
  assert.deepEqual(after.selectableRegions, [2, 3], 'cleared 1 的相邻只剩 2 与内环 3；6 要先讨伐 5 才可选');
  const second = dispatch(ctx, OP.CHOOSE_ROUTE, { region: 2 }) as { unlockedRegions: number[] };
  assert.deepEqual(second.unlockedRegions, [1, 2, 5]);
  assert.deepEqual(playerRegionsOf(store, player), [1, 2, 5]);
});
function playerRegionsOf(store: Store, player: Player): number[] {
  return [...new Set([...(player.flags.unlockedRegions ?? []), ...player.flags.clearedRegions])].sort((a, b) => a - b);
}

test('first clear opens combat features; unlocked-but-uncleared does not', () => {
  const { store, accountId, player } = fresh('world-first-clear');
  const ctx = ctxFor(store, accountId, player);
  completeSetup(ctx);
  dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1 });
  let features = (stateView(store, player) as { features: Features }).features;
  assert.equal(features.field, true);
  assert.equal(features.quests, true);
  assert.equal(features.dungeon, false, '选了路线但未讨伐时副本仍锁定');
  assert.equal(features.dispatch, false);
  assert.equal(features.arena, false);
  assert.equal(features.tower, false);
  assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 5, unitIds: ['u_victor'] }), /讨伐/);
  assert.throws(() => dispatch(ctx, OP.ARENA_REGISTER, {}), /讨伐/);
  // 首次讨伐（显式夹具记录已 earned 的讨伐，不走真实战斗）后战斗类活动开放。
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  features = (stateView(store, player) as { features: Features }).features;
  assert.equal(features.dungeon, true);
  assert.equal(features.dispatch, true);
  assert.equal(features.arena, true);
  assert.equal(features.tower, true);
  const sent = dispatch(ctx, OP.START_DISPATCH, { region: 1, durationDays: 5, unitIds: ['u_victor'] }) as { dispatch: { region: number } };
  assert.equal(sent.dispatch.region, 1);
  dispatch(ctx, OP.ARENA_REGISTER, {});
  assert.equal(ctx.player.registered ?? true, true, '首讨后可报名竞技场');
  // 未解锁地区的派遣仍被拦截。
  assert.throws(() => dispatch(ctx, OP.START_DISPATCH, { region: 2, durationDays: 5, unitIds: ['u_lina'] }), /尚未解锁/);
});

test('starting the first battle keeps advanced modules locked until a victory', () => {
  const { store, accountId, player } = fresh('world-first-battle');
  const ctx = ctxFor(store, accountId, player);
  completeSetup(ctx);
  dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1 });
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_protagonist', 'u_victor', 'u_lina'] });
  const during = (stateView(store, player) as { features: Features }).features;
  assert.equal(during.spectate, true);
  for (const key of ['dungeon', 'dispatch', 'arena', 'tower']) assert.equal(during[key], false, key);
  dispatch(ctx, OP.RETREAT, {});
  const after = (stateView(store, player) as { features: Features }).features;
  assert.deepEqual(player.flags.clearedRegions, []);
  assert.equal(after.reports, true, 'the real retreat report is still accessible');
  assert.equal(after.spectate, true, 'the viewing page stays unlocked after the first battle');
  for (const key of ['dungeon', 'dispatch', 'arena', 'tower']) assert.equal(after[key], false, key);
});

test('legacy saves adopt regions only from real evidence, including the active battle', () => {
  const { store, accountId, player } = fresh('world-legacy');
  const ctx = ctxFor(store, accountId, player);
  // 构造旧档证据：讨伐 3、声望 6、任务完成（地区 5）、既有派遣（地区 9）、进行中的战斗（地区 8）。
  player.flags.clearedRegions = [3];
  player.flags.regionReputation = { 6: 100 };
  player.flags.questsDone = ['wl1'];
  const unit = store.units(player.id)[0];
  const dispatchRecord = { id: 'disp-legacy', playerId: player.id, state: 'returned', region: 9,
    startedDay: 0, durationDays: 5, returnDay: 5, classId: 'fighter', weaponType: 'sword',
    unitIds: [unit.id], result: null, createdAt: Date.now() };
  store.saveDispatch(dispatchRecord as never);
  const battle = createFieldBattle([unit], { region: 8, cleared: 0, day: player.day, seed: 'legacy-active' });
  battle.playerId = player.id;
  store.saveBattle(battle);
  // 旧档没有 unlockedRegions 字段：首次读取时懒认领并落账。
  const view = stateView(store, player) as { features: Features; regions: { id: number }[]; world: { selectableRegions: number[] } };
  assert.deepEqual(player.flags.unlockedRegions, [3, 5, 6, 8, 9], '只认真实证据，绝不开整图 12 地区');
  assert.deepEqual(view.regions.map(r => r.id), [3, 5, 6, 8, 9]);
  assert.equal(view.features.field, true);
  assert.equal(view.features.dungeon, true, '进行中的战斗让既有活动保持可继续');
  assert.equal(view.features.spectate, true);
  assert.equal(view.world.selectableRegions.includes(12), false, '没有证据的地区保持锁定');
  assert.deepEqual(view.world.selectableRegions, [1, 4, 7], '已讨伐前沿 3 的相邻地区成为可选路线');
  // 认领结果已持久化；重读不重复扫描也不改变结果。
  const again = (stateView(store, player) as { regions: { id: number }[] }).regions.map(r => r.id);
  assert.deepEqual(again, [3, 5, 6, 8, 9]);
  // 旧存档的进行中战斗可以继续（地区门已通过，撞到的是战斗占用而不是地区拦截）。
  assert.throws(() => dispatch(ctx, OP.SORTIE, { region: 8 }), /进行中的战斗/);
  // GET_TODAY 只显示认领后的地区。
  const today = dispatch(ctx, OP.GET_TODAY, {}) as { sortieRegions: { id: number }[] };
  assert.deepEqual(today.sortieRegions.map(r => r.id).sort((a, b) => a - b), [3, 5, 6, 8, 9]);
  player.flags.companions = ['victor', 'lina'];
  store.savePlayer(player);
  assert.equal(player.flags.setupCompleted, undefined, 'older completed setups may only have companions');
  assert.equal((dispatch(ctx, OP.CHOOSE_ROUTE, { region: 4 }) as { region: number }).region, 4);
});

test('the central shop only sells current stock; retired rows are hidden and rejected', () => {
  const { store, accountId, player } = fresh('world-shop');
  const ctx = ctxFor(store, accountId, player);
  // 模拟同季度旧档：shop 表还有已迁店的旧行，且伤药已被买空。
  store.setShopStock(player.id, 'iron_sword', 5);
  store.setShopStock(player.id, 'vulnerary', 0);
  store.ensureShopRows(player.id);
  const shop = dispatch(ctx, OP.GET_SHOP, {}) as { items: { item: string; stock: number }[] };
  const byItem = new Map(shop.items.map(row => [row.item, row.stock]));
  assert.equal(byItem.has('iron_sword'), false, '旧目录武器不再出现在王都商店');
  assert.equal(byItem.get('fw_weapon_1'), 8, '新增的 E 级基础装备行被补插');
  assert.equal(byItem.get('vulnerary'), 0, '已消耗的库存不被重置');
  assert.throws(() => dispatch(ctx, OP.BUY, { item: 'iron_sword' }), /王都|地区/, '旧 SQLite 行残留也不能绕过商店迁移');
  const goldBefore = ctx.player.gold;
  const bought = dispatch(ctx, OP.BUY, { item: 'fw_weapon_1' }) as { item: string; price: number };
  assert.equal(bought.item, 'fw_weapon_1');
  assert.equal(ctx.player.gold, goldBefore - bought.price);
});

test('workshop facilities follow their regions and existing orders stay usable', () => {
  const { store, accountId, player } = fresh('world-workshop');
  const ctx = ctxFor(store, accountId, player);
  completeSetup(ctx);
  // 先在已解锁地区 2 开一块药草田，再把解锁列表收窄到地区 1：进行中的订单必须保留。
  player.flags.unlockedRegions = [2];
  store.savePlayer(player);
  const planted = dispatch(ctx, OP.PLANT, {}) as { order: { id: string } };
  player.flags.unlockedRegions = [1];
  store.savePlayer(player);
  const view = dispatch(ctx, OP.GET_PRODUCTION, {}) as
    { facilities: { id: string }[]; recipes: { id: string }[]; orders: { id: string }[] };
  assert.deepEqual(view.facilities.map(f => f.id), ['garden'], '有进行中订单的设施保留可用，其余隐藏');
  assert.deepEqual(view.recipes.map(r => r.id), ['plant_herb'], '配方按设施与声望过滤');
  assert.deepEqual(view.orders.map(o => o.id), [planted.order.id], '既有订单始终可见');
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'forge_iron_sword' }), /解锁/, '铁匠铺（地区3）未解锁时不能开工');
  assert.throws(() => dispatch(ctx, OP.START_PRODUCTION, { recipeId: 'brew_vulnerary' }), /解锁/, '炼药所（地区5）未解锁时不能开工');
  dispatch(ctx, OP.PLANT, {});
  for (const order of store.productionOrders(player.id)) { order.state = 'collected'; store.saveProductionOrder(order); }
  assert.deepEqual((dispatch(ctx, OP.GET_PRODUCTION, {}) as { facilities: { id: string }[] }).facilities.map(f => f.id), ['garden'], 'a used legacy facility remains available after its final order is collected');
  // 全部锁定且无订单时是完全空视图。
  const other = fresh('world-workshop-empty');
  const empty = dispatch(ctxFor(other.store, other.accountId, other.player), OP.GET_PRODUCTION, {}) as { facilities: unknown[]; recipes: unknown[] };
  assert.deepEqual(empty.facilities, []);
  assert.deepEqual(empty.recipes, []);
});

test('quest views filter to unlocked regions and keep done and ongoing quests visible', () => {
  const { store, accountId, player } = fresh('world-quests');
  const ctx = ctxFor(store, accountId, player);
  player.flags.unlockedRegions = [1];
  player.flags.questsDone = ['r1-1'];
  store.savePlayer(player);
  const run = createRun('run-ongoing', player.id, 1, ['u_erin'], 5, 0, { questId: 'r1-3' });
  run.state = 'between_maps';
  store.saveRun(run);
  const view = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; available: boolean; done: boolean }[] }[] };
  assert.deepEqual(view.regions.map(r => r.region), [1], '未解锁地区的任务页签整块隐藏');
  const region1 = view.regions[0];
  const byId = new Map(region1.quests.map(q => [q.id, q]));
  assert.equal(byId.get('r1-1')!.done, true, '已完成（含可领奖）的任务保留显示');
  assert.equal(byId.get('r1-1')!.available, false);
  assert.equal(byId.get('r1-2')!.available, true, '前置已满足的可接任务保留');
  assert.equal(byId.get('r1-3')!.available, false);
  assert.ok(byId.has('r1-3'), '进行中的地区远征任务不因可接条件消失');
  assert.equal(byId.has('r2-1'), false);
  // 未解锁地区不能接任务，也不能在声望商店购物。
  assert.throws(() => dispatch(ctx, OP.START_QUEST, { questId: 'gw1' }), /尚未解锁|远征/, '地区门先于其它拦截');
  assert.throws(() => dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 2, item: 'steel_bow' }), /尚未解锁/);
});

test('story and challenge pages hide locked chapters and floors', () => {
  const { store, accountId, player } = fresh('world-story');
  const ctx = ctxFor(store, accountId, player);
  completeSetup(ctx);
  dispatch(ctx, OP.CHOOSE_ROUTE, { region: 1 });
  assert.deepEqual((dispatch(ctx, OP.GET_STORY, {}) as { chapters: unknown[] }).chapters, [], '第一年没有开放章节');
  player.flags.storyCompleted = [2];
  store.savePlayer(player);
  const story = dispatch(ctx, OP.GET_STORY, {}) as { chapters: { chapter: number; available: boolean; completed: boolean; title: string | null }[] };
  assert.deepEqual(story.chapters.map(c => c.chapter), [2], '未开放且未完成的章节整行隐藏，已完成的保留');
  assert.equal(story.chapters[0].completed, true);
  assert.equal(story.chapters[0].title, null, '未开放章节不下发标题');
  assert.deepEqual((dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: unknown[] }).floors, [], '特性未开时挑战塔无层可选');
  player.flags.clearedRegions = [1];
  store.savePlayer(player);
  const floors = dispatch(ctx, OP.GET_CHALLENGES, {}) as { floors: { id: string; available: boolean }[] };
  assert.deepEqual(floors.floors.map(f => f.id), ['tower-1', 'tower-2'], '首讨后开放前两层，终层仍需第八章');
});
