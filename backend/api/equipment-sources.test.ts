import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from './db.ts';
import { Store } from './store.ts';
import { loginForTest as loginOrRegister } from './test-support.ts';
import { seedFullRoster } from './test-support.ts';
import { dispatch } from './handlers.ts';
import type { Context } from './handlers.ts';
import { syncPlayer } from './services.ts';
import { OP } from '../common/protocol/ops.ts';
import { RANKS } from '../common/data/types.ts';
import { SPELLBOOKS } from '../common/data/spellbooks.ts';
import { BASIC_GEAR_POOL, GAME_ITEMS, manualItem, SHOP_STOCK, spellbookItem } from '../common/game/items.ts';
import type { ItemKey } from '../common/game/items.ts';
import { EQUIPMENT_QUALIFICATIONS, itemRank, rankReputation, regionShop } from '../common/game/quest-shop.ts';
import { RECIPES } from '../common/game/production.ts';
import { ALL_QUESTS, QUEST_REGIONS } from '../common/game/quests.ts';
import { CHALLENGE_FLOORS } from '../common/game/challenges.ts';

function setup(name: string) {
  const store = new Store(openDb(':memory:'));
  const { accountId, player } = loginOrRegister(store, name, undefined, '测试军团');
  seedFullRoster(store, player);
  return { store, accountId, player: syncPlayer(store, player) };
}
const ctxFor = (store: Store, accountId: string, player: ReturnType<typeof setup>['player']): Context => ({ store, accountId, player, agentModel: null, push: () => {} });

// Where each warehouse item can come from in normal play.
function acquisition(): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  const add = (item: string, from: string) => sources.set(item, [...(sources.get(item) ?? []), from]);
  for (const row of SHOP_STOCK) add(row.item, 'shop');
  for (const item of BASIC_GEAR_POOL) add(item, 'quartermaster');
  for (const region of QUEST_REGIONS) for (const row of regionShop(region, Infinity)) add(row.item, `region:${region}`);
  for (const recipe of RECIPES) add(recipe.output.item, `recipe:${recipe.id}`);
  for (const quest of ALL_QUESTS) {
    for (const [item] of quest.reward.items ?? []) add(item, `quest:${quest.id}`);
    if (quest.exclusive) add(quest.exclusive, `quest:${quest.id}`);
  }
  for (const floor of CHALLENGE_FLOORS) for (const weapon of floor.equipment) add(weapon, `tower:${floor.id}`);
  return sources;
}

test('every designed weapon, staff and spellbook has an acquisition route; limited ones only come from one-time rewards', () => {
  const source = JSON.parse(readFileSync(new URL('../../docs/data/fw-equipment-expansion.json', import.meta.url), 'utf8'));
  const design: { id: string; kind?: string }[] = [...source.baseline, ...source.weapons, ...source.spells];
  assert.equal(design.length, 170);
  const routes = acquisition();
  for (const row of design) {
    const key = row.kind === 'spellbook' || row.id.startsWith('fw_spell_') ? spellbookItem(row.id) : row.id;
    assert.ok(routes.get(key)?.length, `${row.id} has no acquisition route`);
  }
  for (const book of SPELLBOOKS) assert.ok(routes.get(spellbookItem(book.id))?.length, book.id);
  const limited: ItemKey[] = ['fw_weapon_8', spellbookItem('fw_spell_60'), spellbookItem('fw_spell_61'), spellbookItem('fw_spell_11'),
    manualItem('fw_spell_60'), manualItem('fw_spell_61'), manualItem('fw_spell_11')];
  for (const item of limited) assert.ok(routes.get(item)!.every(from => from.startsWith('quest:')), `${item}: ${routes.get(item)}`);
  assert.ok(routes.get('short_bow')!.includes('quest:gw1') && routes.get('short_bow')!.includes('quartermaster'), 'the short bow is a first-quest reward and a quartermaster item');
});

test('regional equipment qualifications open by rank and never ask for more reputation than the region can give', () => {
  for (const region of QUEST_REGIONS) {
    const reachable = ALL_QUESTS.filter(quest => quest.region === region).reduce((sum, quest) => sum + quest.reward.reputation, 0);
    const gear = regionShop(region, Infinity).filter(row => ['weapon', 'spellbook'].includes(GAME_ITEMS[row.item].kind));
    for (const row of gear) assert.ok(row.reputation <= reachable, `${region}:${row.item} needs ${row.reputation}/${reachable}`);
    for (let i = 1; i < RANKS.length; i++) assert.ok(rankReputation(region, RANKS[i]) >= rankReputation(region, RANKS[i - 1]), `${region}:${RANKS[i]}`);
  }
  for (const row of EQUIPMENT_QUALIFICATIONS) {
    assert.equal(row.reputation, rankReputation(row.region, itemRank(row.item)), `${row.region}:${row.item}`);
    assert.ok(regionShop(row.region, row.reputation).find(entry => entry.item === row.item)!.unlocked);
  }
});

test('spellbooks are bought full, carried with their charges, capped per unit and never refilled by moving them', () => {
  const { store, accountId, player } = setup('books');
  const ctx = ctxFor(store, accountId, player);
  player.flags.regionReputation = { 6: 500, 12: 500 }; player.gold = 200_000_000; store.savePlayer(player);
  // 声望商店每季换一批、每件限购：往后翻季度，直到泽拉斯古都上架一本法术书。
  const onSale = () => (dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; shop: { item: string }[] }[] }).regions.find(r => r.region === 6)!.shop;
  const sera = store.unit(player.id, 'u_sera')!;
  const isBook = (item: string) => GAME_ITEMS[item as ItemKey].kind === 'spellbook' && !sera.spellbooks!.some(book => book.id === GAME_ITEMS[item as ItemKey].spell);
  for (let i = 0; i < 12 && !onSale().some(row => isBook(row.item)); i++) { player.day += 125; store.savePlayer(player); }
  const ice = onSale().find(row => isBook(row.item))!.item as ItemKey;
  const spell = GAME_ITEMS[ice].spell!;
  const charges = GAME_ITEMS[ice].uses!;
  dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 6, item: ice });
  assert.deepEqual(store.inventory(player.id).filter(row => row.item === ice).map(row => row.uses), [charges]);
  assert.throws(() => dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 6, item: ice }), /限购/, 'one copy a season');
  assert.throws(() => dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 6, item: 'iron_sword' }), /没有上架/);
  assert.equal(sera.spellbooks!.length, 4);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_sera', item: ice, action: 'toUnit' });
  assert.deepEqual(store.unit(player.id, 'u_sera')!.spellbooks!.find(row => row.id === spell), { id: spell, charges, maxCharges: charges });
  player.flags.regionShopBought = {}; store.savePlayer(player);
  dispatch(ctx, OP.BUY_QUEST_ITEM, { region: 6, item: ice });
  assert.throws(() => dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_sera', item: ice, action: 'toUnit' }), /携带栏已满|同一种/);
  // 用掉几次再放回仓库：剩余次数跟着书走，换人携带也不补满。
  const used = store.unit(player.id, 'u_sera')!;
  used.spellbooks!.find(row => row.id === spell)!.charges = 2;
  store.saveUnit(used, player.id);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_sera', item: ice, action: 'toWarehouse' });
  assert.ok(store.inventory(player.id).some(row => row.item === ice && row.uses === 2));
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_noah', item: ice, action: 'toUnit', uses: 2 });
  assert.equal(store.unit(player.id, 'u_noah')!.spellbooks!.find(row => row.id === spell)!.charges, 2);
});

test('tome and staff charges stay with the item when it moves between units', () => {
  const { store, accountId, player } = setup('tomes');
  const ctx = ctxFor(store, accountId, player);
  const sera = store.unit(player.id, 'u_sera')!;
  sera.bookInstances!.find(row => row.id === 'thunder')!.charges = 3;
  store.saveUnit(sera, player.id);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_sera', item: 'thunder', action: 'toWarehouse' });
  assert.ok(!store.unit(player.id, 'u_sera')!.bookInstances!.some(row => row.id === 'thunder'));
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_noah', item: 'thunder', action: 'toUnit' });
  assert.equal(store.unit(player.id, 'u_noah')!.bookInstances!.find(row => row.id === 'thunder')!.charges, 3);
});

test('limited manuals teach their spell once, need the school, and reincarnation clears them and returns the books', () => {
  const { store, accountId, player } = setup('manuals');
  const ctx = ctxFor(store, accountId, player);
  // GET_QUESTS 只展示可接或已完成的任务：先标记 wl7 完成让专属武器预览可见。
  player.flags.questsDone = ['wl7'];
  store.savePlayer(player);
  const quests = dispatch(ctx, OP.GET_QUESTS, {}) as { regions: { region: number; quests: { id: string; exclusive: { item: string } | null }[] }[] };
  assert.equal(quests.regions.find(r => r.region === 5)!.quests.find(q => q.id === 'wl7')!.exclusive!.item, 'fw_weapon_8');
  player.flags.questsDone = ['wl7', 'wl8']; store.savePlayer(player);
  const reward = dispatch(ctx, OP.CLAIM_QUEST_REWARD, { questId: 'wl8' }) as { items: [string, number][] };
  // 地区核心任务（-8）另给一枚按地区轮换的成长药（地区 5 是龙盾），书和教材仍是原来的限量投放。
  assert.deepEqual(reward.items.map(([item]) => item).filter(item => GAME_ITEMS[item as ItemKey].kind !== 'material'), ['dracoshield', spellbookItem('fw_spell_60'), manualItem('fw_spell_60')]);
  assert.ok(store.inventory(player.id).some(row => row.item === spellbookItem('fw_spell_60') && row.uses === 1));
  assert.throws(() => dispatch(ctx, OP.USE_ITEM, { unitId: 'u_erin', item: manualItem('fw_spell_60') }), /权限/);
  dispatch(ctx, OP.USE_ITEM, { unitId: 'u_sera', item: manualItem('fw_spell_60') });
  assert.deepEqual(store.unit(player.id, 'u_sera')!.learnedSpells, ['fw_spell_60']);
  assert.equal(store.countInventory(player.id, manualItem('fw_spell_60')), 0);
  assert.throws(() => dispatch(ctx, OP.USE_ITEM, { unitId: 'u_sera', item: manualItem('fw_spell_60') }), /没有这件教材|已经学会/);
  const sera = store.unit(player.id, 'u_sera')!;
  sera.level = 99; sera.spellbooks!.find(row => row.id === 'fire')!.charges = 7;
  store.saveUnit(sera, player.id);
  store.addInventory(player.id, 'reincarnation_core', 0, 1);
  player.gold = 1_000_000; store.savePlayer(player);
  dispatch(ctx, OP.REINCARNATE_UNIT, { unitId: 'u_sera', allocation: {} });
  const reborn = store.unit(player.id, 'u_sera')!;
  assert.deepEqual(reborn.learnedSpells, []); assert.deepEqual(reborn.spellbooks, []);
  assert.ok(store.inventory(player.id).some(row => row.item === spellbookItem('fire') && row.uses === 7));
});

test('a unit fielded in the active battle cannot move items mid-fight', () => {
  const { store, accountId, player } = setup('mid-battle');
  const ctx = ctxFor(store, accountId, player);
  dispatch(ctx, OP.SORTIE, { region: 1, unitIds: ['u_erin'] });
  assert.throws(() => dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_erin', item: 'killing_edge', action: 'toWarehouse' }), /战斗/);
  dispatch(ctx, OP.TRANSFER_ITEM, { unitId: 'u_noah', item: 'heal', action: 'toWarehouse' });
});
