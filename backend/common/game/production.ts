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
}

export const RECIPES: Recipe[] = [
  { id: 'plant_herb', name: '播种药草', facility: 'garden', days: 20, input: [{ item: 'seed', count: 1 }], output: { item: 'herb', count: 2 }, kind: 'grow' },
  { id: 'brew_vulnerary', name: '炼制伤药', facility: 'apothecary', days: 3, input: [{ item: 'herb', count: 3 }], output: { item: 'vulnerary', count: 1 }, kind: 'brew' },
  { id: 'forge_iron_sword', name: '锻造铁剑', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_sword', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_lance', name: '锻造铁枪', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_lance', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_axe', name: '锻造铁斧', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_axe', count: 1 }, kind: 'forge' },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find(r => r.id === id);
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

export function createOrder(id: string, playerId: string, recipe: Recipe, startDay: number): ProductionOrder {
  return {
    id, playerId, recipeId: recipe.id, facility: recipe.facility, state: 'growing',
    startedDay: startDay, readyDay: startDay + recipe.days, output: { ...recipe.output }, quality: 'normal',
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
