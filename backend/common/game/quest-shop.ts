import type { ItemKey } from './items.ts';
import { GAME_ITEMS } from './items.ts';

// 地区声望商店（docs/20 §5）：声望给资格，金币/材料承担消费。达到声望档位才能购买，
// 购买不扣声望。装备偏向用途差异，不做成同数值更高。
export interface ShopEntry { item: ItemKey; price: number; reputation: number }

const SHOPS: Record<number, ShopEntry[]> = {
  // 希尔瓦林地：弓、轻装。
  2: [
    { item: 'steel_bow', price: 0, reputation: 0 },
    { item: 'killer_bow', price: 0, reputation: 100 },
    { item: 'speedwing', price: 0, reputation: 250 },
  ],
  // 托尔加丘陵：重甲、破甲、锻造。
  3: [
    { item: 'armorslayer', price: 0, reputation: 0 },
    { item: 'killer_lance', price: 0, reputation: 100 },
    { item: 'dracoshield', price: 0, reputation: 250 },
  ],
  // 其余地区：基础补给与本地资源，具体特色库存后续按内容表扩充。
  1: [{ item: 'herb', price: 0, reputation: 0 }, { item: 'ether_ration', price: 0, reputation: 100 }],
  4: [{ item: 'iron_sword', price: 0, reputation: 0 }, { item: 'full_meal', price: 0, reputation: 100 }],
  6: [{ item: 'fire', price: 0, reputation: 0 }, { item: 'restore', price: 0, reputation: 100 }],
  7: [{ item: 'beast_claw', price: 0, reputation: 0 }, { item: 'dracoshield', price: 0, reputation: 250 }],
  8: [{ item: 'iron_bow', price: 0, reputation: 0 }, { item: 'speedwing', price: 0, reputation: 250 }],
  9: [{ item: 'steel_axe', price: 0, reputation: 0 }, { item: 'dracoshield', price: 0, reputation: 250 }],
  10: [{ item: 'dragonstone', price: 0, reputation: 0 }, { item: 'talisman', price: 0, reputation: 250 }],
  11: [{ item: 'recover', price: 0, reputation: 0 }, { item: 'goddess_icon', price: 0, reputation: 250 }],
  12: [{ item: 'restore', price: 0, reputation: 0 }, { item: 'legacy_stone_growth', price: 0, reputation: 500 }],
  // 莱斯米尔湖镇：治疗、恢复、补给。
  5: [
    { item: 'recover', price: 0, reputation: 0 },
    { item: 'talisman', price: 0, reputation: 100 },
    { item: 'goddess_icon', price: 0, reputation: 250 },
  ],
};

// 价格未单独定价时按商品目录价。
const priceOf = (entry: ShopEntry) => entry.price || GAME_ITEMS[entry.item].price;

export function regionShop(region: number, reputation: number): { item: ItemKey; name: string; price: number; reputation: number; unlocked: boolean }[] {
  return (SHOPS[region] ?? []).map(entry => ({
    item: entry.item, name: GAME_ITEMS[entry.item].name, price: priceOf(entry), reputation: entry.reputation,
    unlocked: reputation >= entry.reputation,
  }));
}

export function shopEntry(region: number, item: string): { entry: ShopEntry; price: number } | null {
  const entry = (SHOPS[region] ?? []).find(e => e.item === item);
  return entry ? { entry, price: priceOf(entry) } : null;
}
