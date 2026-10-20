import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, MATERIAL_IDS } from './materials.ts';
import { GAME_ITEMS, SHOP_STOCK } from './items.ts';
import { RECIPES, recipeById, createOrder, recipeUnlocked } from './production.ts';
import { WEAPON_SERIES } from '../data/weapons.ts';

test('every material is registered and consumed by a usable recipe', () => {
  assert.equal(new Set(RECIPES.map(row => row.id)).size, RECIPES.length);
  for (const id of MATERIAL_IDS) {
    assert.equal(GAME_ITEMS[id].name, MATERIALS[id].name);
    assert.equal(GAME_ITEMS[id].material?.tier, MATERIALS[id].tier);
    assert.ok(RECIPES.some(recipe => recipe.input.some(row => row.item === id)), id);
  }
  for (const recipe of RECIPES) {
    assert.ok(GAME_ITEMS[recipe.output.item], recipe.id);
    assert.ok(recipe.days > 0 && recipe.output.count > 0);
    assert.equal(new Set(recipe.input.map(row => row.item)).size, recipe.input.length, recipe.id);
    for (const row of recipe.input) assert.ok(GAME_ITEMS[row.item] && row.count > 0, recipe.id);
    if (recipe.kind === 'grow') {
      const material = MATERIALS[recipe.output.item as keyof typeof MATERIALS];
      assert.equal(material.rare, false);
      if (material.tier > 1) assert.ok(recipe.input.some(row => row.item === recipe.output.item));
      if (material.tier >= 3) assert.ok(recipe.requires);
    }
  }
  assert.ok(!SHOP_STOCK.some(row => row.item === 'ore'));
  for (const row of SHOP_STOCK) if (GAME_ITEMS[row.item].material) {
    assert.ok(GAME_ITEMS[row.item].material!.tier === 1 || row.item === 'copper_ore');
    assert.ok(row.stock <= 10);
  }
});

test('five weapon grades use wood copper iron steel and actual silver', () => {
  const inputs = [
    [{ item: 'wood', count: 3 }],
    [{ item: 'copper_ore', count: 3 }, { item: 'wood', count: 1 }],
    [{ item: 'ore', count: 3 }, { item: 'wood', count: 1 }],
    [{ item: 'ore', count: 4 }, { item: 'coal', count: 2 }, { item: 'hard_wood', count: 2 }],
    [{ item: 'silver_ore', count: 6 }, { item: 'hard_wood', count: 3 }],
  ];
  for (const [family, weapons] of Object.entries(WEAPON_SERIES)) for (let tier = 0; tier < 5; tier++) {
    const recipe = recipeById(`forge_${['wood', 'copper', 'iron', 'steel', 'silver'][tier]}_${family === 'fist' ? 'gauntlet' : family}`)!;
    assert.equal(recipe.output.item, weapons[tier]);
    assert.deepEqual(recipe.input, inputs[tier]);
    if (tier === 4) {
      assert.equal(recipeUnlocked(recipe, {}), false);
      assert.equal(recipeUnlocked(recipe, { 9: 100 }), true);
    }
  }
  for (const recipe of RECIPES.filter(row => row.id.startsWith('forge_silver_'))) assert.ok(recipe.input.some(row => row.item === 'silver_ore'));
});

test('orders freeze recipe outputs independently of subsequent recipe changes', () => {
  const recipe = { ...recipeById('forge_iron_sword')!, output: { item: 'iron_sword' as const, count: 1 } };
  const order = createOrder('order', 'player', recipe, 10);
  recipe.output.count = 9;
  assert.deepEqual(order.output, { item: 'iron_sword', count: 1 });
  assert.equal(order.readyDay, 18);
});
