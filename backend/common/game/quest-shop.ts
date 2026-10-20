import type { ItemKey } from './items.ts';
import { GAME_ITEMS, SHOP_STOCK, spellbookItem } from './items.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { RANKS } from '../data/types.ts';
import type { Rank } from '../data/types.ts';

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

// 装备与法术书的地区资格（docs/27「地区商店资格……按阶级开放」，本作首稿）：按地区特色分配，
// 声望门槛随武器／书的级别升高。十二地均可到 500；旧地区资格门槛保留，避免旧档已购资格倒退。
const CORE_REGIONS = [2, 3, 5];
const RANK_REPUTATION: Record<'core' | 'local', Record<Rank, number>> = {
  core: { E: 0, D: 0, C: 100, B: 250, A: 500, S: 500, SS: 500, SSS: 500 },
  local: { E: 0, D: 20, C: 60, B: 160, A: 160, S: 160, SS: 160, SSS: 160 },
};
const book = (id: string) => spellbookItem(id);
const EQUIPMENT_SHOPS: Record<number, ItemKey[]> = {
  // 奥伦平原：步兵与训练用基础武器。
  1: ['iron_sword', 'iron_lance', 'iron_axe', 'steel_sword', 'steel_lance', 'steel_axe',
    'fw_weapon_1', 'fw_weapon_2', 'fw_weapon_24', 'fw_weapon_25', 'fw_weapon_52', 'fw_weapon_53', 'fw_weapon_89', 'fw_weapon_90',
    'slim_sword', 'slim_lance', 'fw_weapon_66', 'fw_weapon_10', 'short_spear', 'steel_gauntlet'],
  // 希尔瓦林地：弓与轻装；短弓另由林道侦察首次奖励发放。
  2: ['iron_bow', 'fw_weapon_72', 'fw_weapon_73', 'short_bow', 'fw_weapon_79', 'fw_weapon_85', 'fw_weapon_159', 'fw_weapon_15', 'magic_bow', 'longbow', 'silver_bow', 'brave_bow'],
  // 托尔加丘陵：重甲、破甲与达·米纳工坊锻造品。
  3: ['killer_axe', 'hand_axe', 'armor_sword', 'hammer', 'heavy_spear', 'fw_weapon_61', 'fw_weapon_65', 'fw_weapon_57', 'fw_weapon_7', 'fw_weapon_31', 'fw_weapon_60', 'fw_weapon_83', 'fw_weapon_156',
    'tomahawk', 'fw_weapon_41', 'silver_lance', 'silver_axe', 'brave_lance', 'brave_axe'],
  // 瓦恩要塞：骑乘与特效配方。
  4: ['beastkiller', 'dragonslayer', 'killing_edge', 'javelin', 'horseslayer', 'poleaxe', 'rapier', 'fw_weapon_40', 'fw_weapon_32', 'fw_weapon_80'],
  // 莱斯米尔湖镇：治疗杖与白魔法治疗书。
  5: ['physic', 'fortify', book('fw_spell_12'), book('fw_spell_24'), book('fw_spell_25'), book('fw_spell_22'), book('fw_spell_26'), book('fw_spell_58'), book('fw_spell_50')],
  // 泽拉斯古都：魔法工坊的黑魔法书、魔道书与雷电剑。
  6: ['thunder', 'wind', 'flame_lance', 'levin_sword', book('fire'), book('fw_spell_4'), book('thunder'), book('fw_spell_6'), book('wind'), book('elfire'), book('fw_spell_7'), book('fw_spell_20'),
    book('flame_lance'), book('fw_spell_3'), book('fw_spell_8'), book('fw_spell_42'), book('fw_spell_34'), book('fw_spell_36'), book('fw_spell_52'),
    book('bolting'), book('meteor'), book('fw_spell_37')],
  // 巴尔格山岭：兽人媒介。
  7: ['beaststone_plus'],
  // 斯凯恩风崖：轻金属拳套、短刀与毒剑。
  8: ['gauntlet', 'fw_weapon_18', 'fw_weapon_157', 'fw_weapon_93', 'fw_weapon_94', 'fw_weapon_99', 'killer_gauntlet', 'poison_dagger', 'wo_dao', 'silver_dagger', 'silver_gauntlet'],
  // 萨鲁恩荒原：商旅带来的特殊剑。
  9: ['devil_sword', 'lancereaver', 'silver_sword', 'brave_sword'],
  // 德拉克莫龙谷：龙人媒介。
  10: ['dragonstone_plus'],
  // 莫尔达王陵：暗魔法与妨害杖。
  11: [book('dark'), book('fw_spell_10'), book('nosferatu'), book('fw_spell_62'), book('fw_spell_28'), book('fw_spell_23'), book('fw_spell_38'),
    'silence_staff', 'sleep_staff'],
  // 赛勒斯汀之门：神殿的白魔法攻击／辅助书与功能杖。
  12: [book('light'), book('fw_spell_45'), book('fw_spell_17'), book('fw_spell_18'), book('fw_spell_19'), book('fw_spell_48'), book('fw_spell_55'),
    book('fw_spell_9'), book('fw_spell_56'), book('fw_spell_47'), book('fw_spell_53'), book('fw_spell_40'), book('fw_spell_54'), book('fw_spell_49'),
    book('fw_spell_57'), 'rescue_staff', 'warp_staff'],
};

export function itemRank(item: ItemKey): Rank {
  const entry = GAME_ITEMS[item];
  if (entry.weapon) return WEAPONS[entry.weapon as WeaponId].rank;
  return SPELLBOOK_BY_ID.get(entry.spell ?? '')?.rank ?? 'E';
}

export function rankReputation(region: number, rank: Rank): number {
  return RANK_REPUTATION[CORE_REGIONS.includes(region) ? 'core' : 'local'][rank];
}

// 按阶级开放的装备／法术书资格行（供审计与测试）。
export const EQUIPMENT_QUALIFICATIONS: readonly { region: number; item: ItemKey; reputation: number }[] = Object.entries(EQUIPMENT_SHOPS)
  .flatMap(([region, items]) => items.map(item => ({ region: Number(region), item, reputation: rankReputation(Number(region), itemRank(item)) })));

for (const row of EQUIPMENT_QUALIFICATIONS) {
  // 既有显式条目保留原资格，避免迁店或补目录时给同一商品展示两行。
  if (!SHOPS[row.region].some(entry => entry.item === row.item)) SHOPS[row.region].push({ item: row.item, price: 0, reputation: row.reputation });
}

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

// 玩家此刻能买到的最高装备级：王都每月商店，加上已开通地区里声望已达标的武器／法术书。
// 密室随机宝箱按这一级再高一级掉落。
export function purchasableRank(regions: readonly number[], reputation: Readonly<Record<number, number>>): Rank {
  const items = [...SHOP_STOCK.map(row => row.item),
    ...regions.flatMap(region => regionShop(region, reputation[region] ?? 0).filter(row => row.unlocked).map(row => row.item))];
  return items.filter(item => GAME_ITEMS[item].kind === 'weapon' || GAME_ITEMS[item].kind === 'spellbook')
    .map(itemRank).reduce<Rank>((best, rank) => RANKS.indexOf(rank) > RANKS.indexOf(best) ? rank : best, 'E');
}
