// 共用的物品分类过滤（整备页与地区声望商店都用它）：纯函数，不读会话、不写状态。
// 武器按武器类别细分（剑（含短刀）/枪/斧/弓/拳/兽/龙/魔道书/杖），其余按仓库已有的类别归组。
import { GAME_ITEMS } from '@common/game/items.ts';
import type { GameItem, ItemKey } from '@common/game/items.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';

export const WEAPON_FILTERS = ['sword', 'lance', 'axe', 'bow', 'fist', 'beast', 'dragon', 'tome', 'staff'] as const;
export type WeaponFilter = (typeof WEAPON_FILTERS)[number];

export type ItemFilter = 'all' | WeaponFilter | 'book' | 'item' | 'food' | 'stat' | 'material' | 'key';

// 芯片顺序即显示顺序；武器在前，随后是法术书／道具／食物／能力药／材料／任务物品。
export const ITEM_FILTERS: readonly (readonly [ItemFilter, string])[] = [
  ['all', '全部'],
  ...WEAPON_FILTERS.map(f => [f, WEAPON_TYPE_NAMES[f]] as const),
  ['book', '法术书'], ['item', '道具'], ['food', '食物'], ['stat', '能力药'], ['material', '材料'], ['key', '任务'],
];

const byKey = (key: string): GameItem | undefined => (GAME_ITEMS as Record<string, GameItem | undefined>)[key];

// 武器类物品的武器类别；非武器（法术书、道具等）返回 null。
export function weaponTypeOf(key: string): WeaponType | null {
  const item = byKey(key);
  return item?.kind === 'weapon' && item.weapon ? WEAPONS[item.weapon as WeaponId].type : null;
}

export function isItemFilter(value: string): value is ItemFilter {
  return ITEM_FILTERS.some(([f]) => f === value);
}

// 一个物品键是否落在某个过滤里。未知键只出现在「全部」。
export function matchItemFilter(key: string, filter: ItemFilter): boolean {
  if (filter === 'all') return true;
  const item = byKey(key);
  if (!item) return false;
  if ((WEAPON_FILTERS as readonly string[]).includes(filter)) {
    return item.kind === 'weapon' && weaponTypeOf(key) === filter;
  }
  switch (filter) {
    case 'book': return item.kind === 'spellbook' || item.kind === 'manual';
    case 'item': return item.kind === 'consumable' || item.kind === 'seal';
    case 'food': return item.kind === 'food';
    case 'stat': return item.kind === 'stat';
    case 'material': return item.kind === 'material';
    case 'key': return item.kind === 'key';
    default: return false;
  }
}

// 每个过滤的命中数，用于芯片计数（0 的过滤不返回键）。
export function filterCounts(keys: readonly string[]): Partial<Record<ItemFilter, number>> {
  const counts: Partial<Record<ItemFilter, number>> = {};
  for (const key of keys) {
    const item = byKey(key);
    if (!item) continue;
    for (const [filter] of ITEM_FILTERS) {
      if (matchItemFilter(key, filter)) counts[filter] = (counts[filter] ?? 0) + 1;
    }
  }
  return counts;
}

// 仓库与商店通用的类别排序：武器 → 法术书 → 教材 → 战斗道具 → 食物 → 能力药 → 转职印 → 材料 → 任务物品。
export const KIND_ORDER = ['weapon', 'spellbook', 'manual', 'consumable', 'food', 'stat', 'seal', 'material', 'key'] as const;

export function kindOrder(key: string): number {
  const item = byKey(key);
  return item ? KIND_ORDER.indexOf(item.kind as (typeof KIND_ORDER)[number]) : KIND_ORDER.length;
}

export type { ItemKey };
