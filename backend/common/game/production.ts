import { MATERIALS, MATERIAL_IDS } from './materials.ts';
import { WEAPONS, WEAPON_SERIES } from '../data/weapons.ts';
import type { ItemKey } from './items.ts';
import { GAME_ITEMS } from './items.ts';

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

const LEGACY_RECIPES: Recipe[] = [
  { id: 'plant_herb', name: '播种药草', facility: 'garden', days: 20, input: [{ item: 'seed', count: 1 }], output: { item: 'herb', count: 2 }, kind: 'grow' },
  { id: 'brew_vulnerary', name: '炼制伤药', facility: 'apothecary', days: 3, input: [{ item: 'herb', count: 3 }], output: { item: 'vulnerary', count: 1 }, kind: 'brew' },
  { id: 'forge_iron_sword', name: '锻造铁剑', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_sword', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_lance', name: '锻造铁枪', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_lance', count: 1 }, kind: 'forge' },
  { id: 'forge_iron_axe', name: '锻造铁斧', facility: 'smithy', days: 8, input: [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }], output: { item: 'iron_axe', count: 1 }, kind: 'forge' },
  { id: 'forge_killer_bow', name: '锻造必杀弓', facility: 'smithy', days: 12, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 3 }], output: { item: 'killer_bow', count: 1 }, kind: 'forge', requires: { region: 2, reputation: 100 } },
  { id: 'forge_killer_lance', name: '锻造必杀枪', facility: 'smithy', days: 12, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 3 }], output: { item: 'killer_lance', count: 1 }, kind: 'forge', requires: { region: 3, reputation: 100 } },
  { id: 'forge_armorslayer', name: '锻造破甲枪', facility: 'smithy', days: 14, input: [{ item: 'ore', count: 8 }, { item: 'wood', count: 3 }], output: { item: 'armorslayer', count: 1 }, kind: 'forge', requires: { region: 3, reputation: 250 } },
  { id: 'forge_silver_sword', name: '锻造银剑', facility: 'smithy', days: 16, input: [{ item: 'ore', count: 8 }, { item: 'wood', count: 3 }], output: { item: 'silver_sword', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_lance', name: '锻造银枪', facility: 'smithy', days: 16, input: [{ item: 'ore', count: 8 }, { item: 'wood', count: 3 }], output: { item: 'silver_lance', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_axe', name: '锻造银斧', facility: 'smithy', days: 16, input: [{ item: 'ore', count: 8 }, { item: 'wood', count: 3 }], output: { item: 'silver_axe', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_bow', name: '锻造银弓', facility: 'smithy', days: 16, input: [{ item: 'ore', count: 7 }, { item: 'wood', count: 5 }], output: { item: 'silver_bow', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_blade', name: '锻造银刃', facility: 'smithy', days: 18, input: [{ item: 'ore', count: 9 }, { item: 'wood', count: 3 }], output: { item: 'silver_blade', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_dagger', name: '锻造银短刀', facility: 'smithy', days: 14, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 2 }], output: { item: 'silver_dagger', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_silver_gauntlet', name: '锻造银手甲', facility: 'smithy', days: 14, input: [{ item: 'ore', count: 6 }, { item: 'wood', count: 2 }], output: { item: 'silver_gauntlet', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 100 } },
  { id: 'forge_brave_sword', name: '锻造勇者之剑', facility: 'smithy', days: 20, input: [{ item: 'ore', count: 10 }, { item: 'wood', count: 5 }], output: { item: 'brave_sword', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 250 } },
  { id: 'forge_brave_lance', name: '锻造勇者之枪', facility: 'smithy', days: 20, input: [{ item: 'ore', count: 10 }, { item: 'wood', count: 5 }], output: { item: 'brave_lance', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 250 } },
  { id: 'forge_brave_axe', name: '锻造勇者之斧', facility: 'smithy', days: 20, input: [{ item: 'ore', count: 10 }, { item: 'wood', count: 5 }], output: { item: 'brave_axe', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 250 } },
  { id: 'forge_brave_bow', name: '锻造勇者之弓', facility: 'smithy', days: 20, input: [{ item: 'ore', count: 9 }, { item: 'wood', count: 6 }], output: { item: 'brave_bow', count: 1 }, kind: 'forge', requires: { region: 9, reputation: 250 } },
  { id: 'brew_recover', name: '调制恢复杖', facility: 'apothecary', days: 6, input: [{ item: 'herb', count: 8 }], output: { item: 'recover', count: 1 }, kind: 'brew', requires: { region: 5, reputation: 100 } },
  { id: 'brew_talisman', name: '缝制魔防符', facility: 'apothecary', days: 8, input: [{ item: 'herb', count: 10 }, { item: 'wood', count: 2 }], output: { item: 'talisman', count: 1 }, kind: 'brew', requires: { region: 5, reputation: 250 } },
  { id: 'cook_ether_ration', name: '烹制以太口粮', facility: 'apothecary', days: 1, input: [{ item: 'herb', count: 2 }, { item: 'seed', count: 1 }], output: { item: 'ether_ration', count: 1 }, kind: 'brew' },
  { id: 'cook_full_meal', name: '烹制完整料理', facility: 'apothecary', days: 2, input: [{ item: 'herb', count: 5 }, { item: 'seed', count: 2 }], output: { item: 'full_meal', count: 1 }, kind: 'brew' },
];

// Recipe IDs remain stable; orders already started keep their own frozen output.
const baseRecipes = LEGACY_RECIPES.map((recipe): Recipe => {
  if (recipe.kind === 'forge') {
    const silver = recipe.id.startsWith('forge_silver_');
    const brave = recipe.id.startsWith('forge_brave_');
    const specialty = recipe.id.includes('killer') || recipe.id.includes('armorslayer');
    return { ...recipe, input: recipe.input.map(row => ({ ...row,
      item: row.item === 'ore' && silver ? 'silver_ore' : row.item === 'ore' && brave ? 'adamantite'
        : row.item === 'wood' && (silver || brave || specialty) ? 'hard_wood' : row.item,
    })), ...(specialty ? { input: [{ item: 'ore', count: 6 }, { item: 'coal', count: 2 }, { item: 'hard_wood', count: 3 }] } : {}) };
  }
  if (recipe.id === 'brew_recover') return { ...recipe, input: [{ item: 'astragalus', count: 4 }, { item: 'hard_wood', count: 1 }] };
  if (recipe.id === 'brew_talisman') return { ...recipe, input: [{ item: 'spirit_leaf', count: 6 }, { item: 'jade_orchid', count: 1 }, { item: 'fragrant_wood', count: 2 }] };
  return recipe;
});

const SERIES_MATERIALS: Recipe['input'][] = [
  [{ item: 'wood', count: 3 }],
  [{ item: 'copper_ore', count: 3 }, { item: 'wood', count: 1 }],
  [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }],
  [{ item: 'ore', count: 4 }, { item: 'coal', count: 2 }, { item: 'hard_wood', count: 2 }],
  [{ item: 'silver_ore', count: 6 }, { item: 'hard_wood', count: 3 }],
];
const seriesRecipes: Recipe[] = Object.entries(WEAPON_SERIES).flatMap(([family, weapons]) => weapons.map((item, index): Recipe => {
  const grade = ['wood', 'copper', 'iron', 'steel', 'silver'][index];
  const id = `forge_${grade}_${family === 'fist' ? 'gauntlet' : family}`;
  const previous = baseRecipes.find(recipe => recipe.id === id);
  return { id, name: `制作${WEAPONS[item].name}`, facility: 'smithy', days: [4, 6, 8, 12, 16][index],
    input: SERIES_MATERIALS[index].map(row => ({ ...row })), output: { item, count: 1 }, kind: 'forge',
    ...(previous?.requires ? { requires: previous.requires } : index === 4 ? { requires: { region: 9, reputation: 100 } } : {}),
  };
}));

// Local species are fixed alternatives: stronger herbs improve medicine yields, minerals form
// medicinal powders/alloys, and timber becomes bow bodies or staves. No recipe manufactures rare plants.
const speciesRecipes: Recipe[] = MATERIAL_IDS.flatMap(id => {
  const material = MATERIALS[id];
  const { tier, category, rare, name } = material;
  const requires = tier >= 3 ? { region: material.regions[0], reputation: [0, 0, 50, 100, 200, 300][tier - 1] } : undefined;
  const recipes: Recipe[] = [];
  if (category === 'herb') {
    const output: ItemKey = tier <= 2 ? 'vulnerary' : tier <= 4 ? 'antidote' : 'elixir';
    recipes.push({ id: `brew_${id}_medicine`, name: `${name}药剂`, facility: 'apothecary', days: tier + 2,
      input: [{ item: id, count: rare ? 1 : 3 }], output: { item: output, count: tier === 2 || tier === 4 || rare ? 2 : 1 }, kind: 'brew', requires });
    if (!rare && id !== 'herb') recipes.push({ id: `plant_${id}`, name: `培育${name}`, facility: 'garden', days: 20 + tier * 4,
      input: [{ item: 'seed', count: tier }, ...(tier >= 2 ? [{ item: id, count: 1 }] : [])],
      output: { item: id, count: 2 }, kind: 'grow', requires });
  } else if (category === 'ore') {
    if (tier <= 2) recipes.push({ id: `compound_${id}`, name: `${name}矿物解毒剂`, facility: 'apothecary', days: 4,
      input: [{ item: id, count: rare ? 1 : 3 }, { item: 'herb', count: 2 }], output: { item: 'antidote', count: rare ? 2 : 1 }, kind: 'brew' });
    else recipes.push({ id: `forge_${id}_alloy`, name: `${name}合金剑`, facility: 'smithy', days: tier * 3,
      input: [{ item: id, count: rare ? 2 : 4 }, { item: tier >= 5 ? 'silver_ore' : 'ore', count: 2 }, { item: 'coal', count: 2 }, { item: 'hard_wood', count: 1 }],
      output: { item: tier >= 6 ? 'brave_sword' : tier >= 5 ? 'silver_sword' : 'steel_sword', count: 1 }, kind: 'forge',
      requires: tier >= 5 ? { region: 9, reputation: tier === 6 ? 250 : 100 } : requires });
  } else {
    recipes.push({ id: `craft_${id}_bow`, name: `${name}弓身`, facility: 'smithy', days: tier * 3 + 2,
      input: [{ item: id, count: rare ? 2 : 4 }, ...(tier >= 2 ? [{ item: (tier >= 5 ? 'silver_ore' : tier >= 3 ? 'ore' : 'copper_ore') as ItemKey, count: 3 }] : []), ...(tier === 4 ? [{ item: 'coal' as const, count: 2 }] : [])],
      output: { item: tier === 6 ? 'brave_bow' : WEAPON_SERIES.bow[Math.min(tier, 5) - 1], count: 1 }, kind: 'forge',
      requires: tier >= 5 ? { region: 9, reputation: tier === 6 ? 250 : 100 } : requires });
  }
  return recipes.map(recipe => {
    const counts = new Map<ItemKey, number>();
    for (const row of recipe.input) counts.set(row.item, (counts.get(row.item) ?? 0) + row.count);
    return { ...recipe, input: [...counts].map(([item, count]) => ({ item, count })) };
  });
});

export const RECIPES: Recipe[] = [
  ...baseRecipes.filter(recipe => !seriesRecipes.some(series => series.id === recipe.id)),
  ...seriesRecipes, ...speciesRecipes,
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
