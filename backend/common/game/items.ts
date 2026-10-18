import { RANKS } from '../data/types.ts';
import type { StatKey } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { ItemId, WeaponId } from '../data/weapons.ts';

// Everything that can sit in the warehouse. Battle items the engine understands (伤药) reuse the
// engine's ItemId; the rest exist only for the economy (docs/09「物品」, prices are drafts).
export type ItemKey = WeaponId | ItemId | 'seal_promote' | 'energy_drop' | 'secret_book' | 'speedwing'
  | 'goddess_icon' | 'dracoshield' | 'talisman' | 'herb' | 'ore' | 'wood' | 'seed'
  | 'reincarnation_core' | 'legacy_stone_growth' | 'legacy_stone_numeric' | 'ether_ration' | 'full_meal';

export interface GameItem {
  name: string;
  kind: 'weapon' | 'consumable' | 'seal' | 'stat' | 'material' | 'food';
  price: number;
  // Weapons carry the engine id; 伤药 uses uses; 能力药 names the stat and amount.
  weapon?: WeaponId;
  item?: ItemId;
  uses?: number;
  stat?: StatKey;
  amount?: number;
  weight?: number;
  note?: string;
}

// Base weapon price: a rough function of might and rank, enough for a working shop (docs/09 open).
function weaponPrice(id: WeaponId): number {
  const w = WEAPONS[id];
  return 300 + w.might * 120 + RANKS.indexOf(w.rank) * 500;
}

const WEAPON_ITEMS = Object.fromEntries(
  (Object.keys(WEAPONS) as WeaponId[]).map(id => [id, {
    name: WEAPONS[id].name, kind: 'weapon' as const, price: weaponPrice(id), weapon: id,
  }]),
) as Record<WeaponId, GameItem>;

export const GAME_ITEMS: Record<ItemKey, GameItem> = {
  ...WEAPON_ITEMS,
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
};

export const ITEM_KEYS = Object.keys(GAME_ITEMS) as ItemKey[];

export function isItemKey(value: unknown): value is ItemKey {
  return typeof value === 'string' && Object.hasOwn(GAME_ITEMS, value);
}

export function isWeaponKey(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.hasOwn(WEAPONS, value);
}

// Each round a character may use at most 5 of one 能力药 and 20 in total (docs/09.3).
export const DRUG_LIMIT_PER_STAT = 5;
export const DRUG_LIMIT_TOTAL = 20;

// The shop's standing stock. Materials and cheap weapons are always there; seals and 能力药 are the
// limited, expensive rows. Stock refills each game month (docs/09.1).
export const SHOP_STOCK: { item: ItemKey; stock: number }[] = [
  { item: 'beastkiller', stock: 4 }, { item: 'dragonslayer', stock: 4 },
  { item: 'gauntlet', stock: 8 }, { item: 'dagger', stock: 8 }, { item: 'beast_claw', stock: 8 }, { item: 'dragonstone', stock: 8 },
  { item: 'iron_sword', stock: 5 }, { item: 'iron_lance', stock: 5 }, { item: 'iron_axe', stock: 5 },
  { item: 'iron_bow', stock: 5 }, { item: 'fire', stock: 4 }, { item: 'heal', stock: 4 },
  { item: 'steel_sword', stock: 3 }, { item: 'steel_lance', stock: 3 }, { item: 'steel_axe', stock: 3 },
  { item: 'steel_bow', stock: 3 }, { item: 'thunder', stock: 3 }, { item: 'recover', stock: 2 },
  { item: 'javelin', stock: 3 }, { item: 'hand_axe', stock: 3 }, { item: 'restore', stock: 2 },
  { item: 'killing_edge', stock: 1 }, { item: 'killer_lance', stock: 1 }, { item: 'killer_axe', stock: 1 },
  { item: 'killer_bow', stock: 1 }, { item: 'wind', stock: 1 },
  { item: 'vulnerary', stock: 9 }, { item: 'immortal_shield', stock: 1 },
  { item: 'seal_promote', stock: 2 },
  { item: 'energy_drop', stock: 1 }, { item: 'secret_book', stock: 1 }, { item: 'speedwing', stock: 1 },
  { item: 'goddess_icon', stock: 1 }, { item: 'dracoshield', stock: 1 }, { item: 'talisman', stock: 1 },
  { item: 'herb', stock: 10 }, { item: 'ore', stock: 10 }, { item: 'wood', stock: 10 }, { item: 'seed', stock: 10 },
  { item: 'ether_ration', stock: 6 }, { item: 'full_meal', stock: 2 },
];
