import type { ItemKey } from './items.ts';
import { GAME_ITEMS } from './items.ts';

// 首版两条生产链（docs/00 §9.2）：种子→药草→治疗药；矿石／木材→铁匠铺→武器。
// 周期、工位与产销仍是草案，集中在这里方便一次平衡调整。

export type FacilityId = 'garden' | 'apothecary' | 'smithy';

export interface FacilityDef { id: FacilityId; name: string; slots: number }

export const FACILITIES: FacilityDef[] = [
  { id: 'garden', name: '药草田', slots: 2 },
  { id: 'apothecary', name: '炼药所', slots: 1 },
  { id: 'smithy', name: '铁匠铺', slots: 1 },
];

export interface Recipe {
  id: string;
  name: string;
  facility: FacilityId;
  days: number;
  input: { item: ItemKey; count: number }[];
  output: { item: ItemKey; count: number };
  kind: 'grow' | 'brew' | 'forge';
  // 声望解锁（docs/20 §5）：某地区达到该声望才能开工；缺省表示始终开放。
  requires?: { region: number; reputation: number };
}

export const RECIPES: Recipe[] = [
  { id: 'plant_herb', name: '播种药草', facility: 'garden', days: 20, input: [{ item: 'seed', count: 1 }], output: { item: 'herb', count: 2 }, kind: 'grow' },
  { id: 'brew_vulnerary', name: '炼制伤药', facility: 'apothecary', days: 3, input: [{ item: 'herb', count: 3 }], output: { item: 'vulnerary', count: 1 }, kind: 'brew' },
  { id: 'forge_iron_sword', name: '锻造铁剑', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_sword', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_lance', name: '锻造铁枪', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_lance', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_axe', name: '锻造铁斧', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_axe', count: 1 }, kind: 'forge' },
  // 声望配方：用地区声望换更好的武器与杖。
  { id: 'forge_killer_bow', name: '锻造必杀弓', facility: 'smithy', days: 12, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 3 }], output: { item: 'killer_bow', count: 1 }, kind: 'forge', requires: { region: 2, reputation: 100 } },
  { id: 'forge_killer_lance', name: '锻造必杀枪', facility: 'smithy', days: 12, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 3 }], output: { item: 'killer_lance', count: 1 }, kind: 'forge', requires: { region: 3, reputation: 100 } },
  { id: 'forge_armorslayer', name: '锻造破甲剑', facility: 'smithy', days: 14, input: [{ item: 'ore', count: 8 }, { item: 'wood', count: 3 }], output: { item: 'armorslayer', count: 1 }, kind: 'forge', requires: { region: 3, reputation: 250 } },
  { id: 'brew_recover', name: '调制恢复杖', facility: 'apothecary', days: 6, input: [{ item: 'herb', count: 8 }], output: { item: 'recover', count: 1 }, kind: 'brew', requires: { region: 5, reputation: 100 } },
  { id: 'brew_talisman', name: '缝制魔防符', facility: 'apothecary', days: 8, input: [{ item: 'herb', count: 10 }, { item: 'wood', count: 2 }], output: { item: 'talisman', count: 1 }, kind: 'brew', requires: { region: 5, reputation: 250 } },
  { id: 'cook_ether_ration', name: '烹制以太口粮', facility: 'apothecary', days: 1, input: [{ item: 'herb', count: 2 }, { item: 'seed', count: 1 }], output: { item: 'ether_ration', count: 1 }, kind: 'brew' },
  { id: 'cook_full_meal', name: '烹制完整料理', facility: 'apothecary', days: 2, input: [{ item: 'herb', count: 5 }, { item: 'seed', count: 2 }], output: { item: 'full_meal', count: 1 }, kind: 'brew' },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find(r => r.id === id);
}

// 声望是否达到配方的解锁门槛（docs/20 §5）。
export function recipeUnlocked(recipe: Recipe, reputation: Record<number, number>): boolean {
  if (!recipe.requires) return true;
  return (reputation[recipe.requires.region] ?? 0) >= recipe.requires.reputation;
}

export function facilityById(id: FacilityId): FacilityDef {
  const facility = FACILITIES.find(f => f.id === id);
  if (!facility) throw new Error(`没有工位 ${id}`);
  return facility;
}

export interface ProductionOrder {
  id: string;
  playerId: string;
  recipeId: string;
  facility: FacilityId;
  state: 'growing' | 'ready' | 'collected';
  startedDay: number;
  readyDay: number;
  output: { item: ItemKey; count: number };
  // 完美锻造（docs/00 §9.2.1）：首版默认关闭，订单只保存已结算结果，不允许客户端直接声称完美。
  quality: 'normal' | 'perfect';
}

export function createOrder(id: string, playerId: string, recipe: Recipe, startDay: number, quality: 'normal' | 'perfect' = 'normal'): ProductionOrder {
  return {
    id, playerId, recipeId: recipe.id, facility: recipe.facility, state: 'growing',
    startedDay: startDay, readyDay: startDay + recipe.days, output: { ...recipe.output }, quality,
  };
}

// 成熟只代表可领取，不自动发放，也不自动重播（docs/00 §9.2）。
export function mature(order: ProductionOrder, day: number): ProductionOrder {
  if (order.state === 'growing' && day >= order.readyDay) order.state = 'ready';
  return order;
}

export function slotsUsed(orders: ProductionOrder[], facility: FacilityId): number {
  return orders.filter(o => o.facility === facility && o.state !== 'collected').length;
}

export function canStart(orders: ProductionOrder[], recipe: Recipe): boolean {
  return slotsUsed(orders, recipe.facility) < facilityById(recipe.facility).slots;
}

export function describeOrder(order: ProductionOrder): { recipe: string; facility: string; output: string; readyDay: number; state: string } {
  const recipe = recipeById(order.recipeId);
  return {
    recipe: recipe?.name ?? order.recipeId,
    facility: facilityById(order.facility).name,
    output: `${GAME_ITEMS[order.output.item].name} ×${order.output.count}`,
    readyDay: order.readyDay,
    state: order.state,
  };
}
