import { RANKS } from '../data/types.ts';
import type { Rank, StatKey } from '../data/types.ts';
import { SPELLBOOKS } from '../data/spellbooks.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';
import { STORY_CHAPTER_QUESTS, storyClueKey } from './story-quests.ts';

// 职业法术书（cast 用）在仓库里以 spellbook:<法术 id> 存放，避免与同名的魔道书武器（火焰等）混淆；
// manual:<法术 id> 是限量法术的教材，用后为该角色解锁这门法术。
export type SpellbookItemKey = `spellbook:${string}`;
export type ManualItemKey = `manual:${string}`;
// 主线线索（docs/38）：每章一件任务物品，由对应主线地图里的隐藏箱给出。
export type StoryClueKey = 'story_clue_1' | 'story_clue_2' | 'story_clue_3' | 'story_clue_4' | 'story_clue_5' | 'story_clue_6' | 'story_clue_7' | 'story_clue_8';

// Everything that can sit in the warehouse. Battle items the engine understands (伤药) reuse the
// engine's ItemId; the rest exist only for the economy (docs/09「物品」, prices are drafts).
export type ItemKey = WeaponId | ItemId | 'seal_promote' | 'energy_drop' | 'secret_book' | 'speedwing'
  | 'goddess_icon' | 'dracoshield' | 'talisman' | 'herb' | 'ore' | 'wood' | 'seed'
  | 'reincarnation_core' | 'legacy_stone_growth' | 'legacy_stone_numeric' | 'ether_ration' | 'full_meal'
  | 'old_map' | 'cross_time_shard' | StoryClueKey | SpellbookItemKey | ManualItemKey;

// 唯一武器：任务专属 + 挑战塔 A 级以上签名武器。它们可以装备、修理、回收，
// 但不能出售；银系与勇者属于普通生产，不在此集合。
export const BOUND_WEAPONS = new Set<WeaponId>([
  'royal_sword', 'divine_lance', 'master_lance',
  'fw_weapon_88', 'fw_weapon_228', 'fw_weapon_225',
  'fw_weapon_71', 'fw_weapon_155', 'fw_weapon_213', 'fw_weapon_223',
  'fw_weapon_49', 'fw_weapon_48', 'fw_weapon_161', 'fw_weapon_215', 'fw_weapon_224',
]);

export const isBoundWeapon = (id: string): boolean => BOUND_WEAPONS.has(id as WeaponId);

export interface GameItem {
  name: string;
  // key：任务物品，只放仓库，用来开启隐藏内容；不能出售、使用或带进战斗。
  kind: 'weapon' | 'consumable' | 'seal' | 'stat' | 'material' | 'food' | 'spellbook' | 'manual' | 'key';
  price: number;
  // 唯一武器与任务物品绑定：仓库和整备页不允许出售。
  bound?: boolean;
  // Weapons carry the engine id; 伤药 uses uses; 能力药 names the stat and amount; 法术书／教材写法术 id。
  weapon?: WeaponId;
  item?: ItemId;
  spell?: string;
  uses?: number;
  stat?: StatKey;
  amount?: number;
  weight?: number;
  note?: string;
}

// Base weapon price: a rough function of might and rank, enough for a working shop (docs/09 open).
function priceFor(might: number, rank: Rank): number {
  return 300 + might * 120 + RANKS.indexOf(rank) * 500;
}

const WEAPON_ITEMS = Object.fromEntries(
  (Object.keys(WEAPONS) as WeaponId[]).map(id => [id, {
    name: WEAPONS[id].name, kind: 'weapon' as const, price: priceFor(WEAPONS[id].might, WEAPONS[id].rank), weapon: id,
    bound: BOUND_WEAPONS.has(id) || undefined,
  }]),
) as Record<WeaponId, GameItem>;

export const spellbookItem = (spell: string): SpellbookItemKey => `spellbook:${spell}`;
export const manualItem = (spell: string): ManualItemKey => `manual:${spell}`;

// 新书带满次数入库；之后剩余次数跟着这本书走（仓库行的 uses）。
const SPELLBOOK_ITEMS = Object.fromEntries(SPELLBOOKS.map(book => [spellbookItem(book.id), {
  name: `《${book.name}》`, kind: 'spellbook' as const, price: priceFor(book.might, book.rank), spell: book.id, uses: book.maxCharges,
  note: `${book.study === 'whiteMagic' ? '白魔法' : '黑魔法'} ${book.rank} · ${book.maxCharges} 次 · ${book.effect}`,
}])) as Record<SpellbookItemKey, GameItem>;

const MANUAL_ITEMS = Object.fromEntries(SPELLBOOKS.filter(book => book.effects.manual).map(book => [manualItem(book.id), {
  name: `${book.name}教材`, kind: 'manual' as const, price: 12_000, spell: book.id,
  note: `限量教材：让一名有${book.study === 'whiteMagic' ? '白魔法' : '黑魔法'}权限的角色学会${book.name}；施放仍要持有该书并达到 ${book.rank} 级`,
}])) as Record<ManualItemKey, GameItem>;

const STORY_CLUE_ITEMS = Object.fromEntries(STORY_CHAPTER_QUESTS.map(row => [storyClueKey(row.chapter), {
  name: `「${row.clue.name}」`, kind: 'key' as const, price: 0, bound: true, note: `主线线索（第 ${row.chapter} 章）：${row.clue.note}不能出售，也不能带进战斗`,
}])) as Record<StoryClueKey, GameItem>;

export const GAME_ITEMS: Record<ItemKey, GameItem> = {
  ...WEAPON_ITEMS,
  ...STORY_CLUE_ITEMS,
  ...SPELLBOOK_ITEMS,
  ...MANUAL_ITEMS,
  vulnerary: { name: '伤药', kind: 'consumable', price: 300, item: 'vulnerary', uses: 3 },
  seal_promote: { name: '转职印', kind: 'seal', price: 5000, note: '转职消耗一枚' },
  energy_drop: { name: '天使之衣', kind: 'stat', price: 8000, stat: 'hp', amount: 5 },
  secret_book: { name: '秘传之书', kind: 'stat', price: 8000, stat: 'skl', amount: 2 },
  speedwing: { name: '速度之羽', kind: 'stat', price: 8000, stat: 'spd', amount: 2 },
  goddess_icon: { name: '女神像', kind: 'stat', price: 8000, stat: 'lck', amount: 2 },
  dracoshield: { name: '龙盾', kind: 'stat', price: 8000, stat: 'def', amount: 2 },
  talisman: { name: '护身符', kind: 'stat', price: 8000, stat: 'res', amount: 2 },
  herb: { name: '药草', kind: 'material', price: 80 },
  ore: { name: '矿石', kind: 'material', price: 120 },
  wood: { name: '木材', kind: 'material', price: 100 },
  seed: { name: '种子', kind: 'material', price: 60 },
  reincarnation_core: { name: '轮回核心', kind: 'material', price: 30_000, note: '轮回消耗一枚；来自主线后期或挑战塔' },
  legacy_stone_growth: { name: '成长传承石', kind: 'material', price: 12_000, note: '兑现成长遗产时消耗' },
  legacy_stone_numeric: { name: '数值传承石', kind: 'material', price: 12_000, note: '兑现数值遗产时消耗' },
  immortal_shield: { name: '不朽盾', kind: 'consumable', price: 6_000, uses: 1, weight: 1, note: '致命时消耗一枚，保留 1HP 并石化至下个己方阶段；只能战前携带' },
  ether_ration: { name: '以太口粮', kind: 'food', price: 300, note: '恢复一本法术书 25% 次数' },
  full_meal: { name: '完整料理', kind: 'food', price: 900, note: '恢复一本法术书全部次数' },
  cross_time_shard: { name: '时空碎片', kind: 'key', price: 0, bound: true, note: '固定兑换时空武将，每名消耗3枚；仅存仓库，不能出售、使用或带进战斗' },
  old_map: { name: '古旧地图', kind: 'key', price: 0, bound: true, note: '任务物品：标着巴尔格山岭深处的一条旧路；不能出售，也不能带进战斗' },
};

export const ITEM_KEYS = Object.keys(GAME_ITEMS) as ItemKey[];

export function isItemKey(value: unknown): value is ItemKey {
  return typeof value === 'string' && Object.hasOwn(GAME_ITEMS, value);
}

export function isWeaponKey(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.hasOwn(WEAPONS, value);
}

// 新入库时一件物品的次数：伤药 3 次、新书满次数，其余为 0。
export function stockUses(item: ItemKey): number {
  return GAME_ITEMS[item].uses ?? 0;
}

// Each round a character may use at most 5 of one 能力药 and 20 in total (docs/09.3).
export const DRUG_LIMIT_PER_STAT = 5;
export const DRUG_LIMIT_TOTAL = 20;

// 王都只卖E级基础装备和常用补给；进阶武器由沿途地区武器店提供。
// 仍保留每季限量的不朽盾与能力药，库存规则不因武器迁店改变。
export const SHOP_STOCK: { item: ItemKey; stock: number }[] = [
  { item: 'fw_weapon_1', stock: 8 }, { item: 'fw_weapon_24', stock: 8 }, { item: 'fw_weapon_52', stock: 8 },
  { item: 'fw_weapon_72', stock: 8 }, { item: 'fw_weapon_89', stock: 8 },
  { item: 'dagger', stock: 4 }, { item: 'beast_claw', stock: 4 }, { item: 'dragonstone', stock: 4 },
  { item: 'fire', stock: 4 }, { item: 'heal', stock: 4 },
  { item: 'spellbook:fire', stock: 4 }, { item: 'spellbook:fw_spell_12', stock: 4 },
  { item: 'vulnerary', stock: 9 }, { item: 'immortal_shield', stock: 1 },
  { item: 'seal_promote', stock: 2 },
  { item: 'energy_drop', stock: 1 }, { item: 'secret_book', stock: 1 }, { item: 'speedwing', stock: 1 },
  { item: 'goddess_icon', stock: 1 }, { item: 'dracoshield', stock: 1 }, { item: 'talisman', stock: 1 },
  { item: 'herb', stock: 10 }, { item: 'ore', stock: 10 }, { item: 'wood', stock: 10 }, { item: 'seed', stock: 10 },
  { item: 'ether_ration', stock: 6 }, { item: 'full_meal', stock: 2 },
];

const CENTRAL_SHOP_ITEMS = new Set<string>(SHOP_STOCK.map(row => row.item));
export const isCentralShopItem = (item: string): boolean => CENTRAL_SHOP_ITEMS.has(item);
