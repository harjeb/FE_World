// Frontend check for the shared item filter used by 整备 (central shop/warehouse) and the regional
// reputation shop: weapon-type filters, the grouped categories, chip counts and honest empty results.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { GAME_ITEMS } = await import('../../backend/common/game/items.ts');
const { WEAPONS } = await import('../../backend/common/data/weapons.ts');
const {
  filterCounts, isItemFilter, ITEM_FILTERS, KIND_ORDER, kindOrder, matchItemFilter, weaponTypeOf, WEAPON_FILTERS,
} = await import('../src/model/item-filter.ts');

test('the ten weapon-type filters label the shared weapon types in order', () => {
  assert.deepEqual([...WEAPON_FILTERS], ['sword', 'lance', 'axe', 'bow', 'fist', 'dagger', 'beast', 'dragon', 'tome', 'staff']);
  // Chip list: 全部 + ten weapon types + the grouped categories, in display order.
  assert.deepEqual(ITEM_FILTERS.map(([f]) => f), [
    'all', ...WEAPON_FILTERS, 'book', 'item', 'food', 'stat', 'material', 'key',
  ]);
});

test('weapon items match their weapon type and nothing else', () => {
  const sword = Object.keys(WEAPONS).find(id => WEAPONS[id].type === 'sword');
  const tome = Object.keys(WEAPONS).find(id => WEAPONS[id].type === 'tome');
  const staff = Object.keys(WEAPONS).find(id => WEAPONS[id].type === 'staff');
  assert.equal(weaponTypeOf(sword), 'sword');
  assert.ok(matchItemFilter(sword, 'sword'));
  assert.ok(!matchItemFilter(sword, 'lance'));
  assert.ok(matchItemFilter(tome, 'tome'));
  assert.ok(matchItemFilter(staff, 'staff'));
  // Weapon-type chips never pull in spellbook items (法术书) — those live under 'book'.
  const spellbookKey = Object.keys(GAME_ITEMS).find(k => GAME_ITEMS[k].kind === 'spellbook');
  assert.ok(!matchItemFilter(spellbookKey, 'tome'));
  assert.ok(!matchItemFilter(spellbookKey, 'staff'));
  assert.ok(matchItemFilter(spellbookKey, 'book'));
});

test('grouped categories keep the warehouse semantics (book/item/food/stat/material)', () => {
  const kind = k => GAME_ITEMS[k].kind;
  const consumable = Object.keys(GAME_ITEMS).find(k => kind(k) === 'consumable');
  const seal = Object.keys(GAME_ITEMS).find(k => kind(k) === 'seal');
  const manual = Object.keys(GAME_ITEMS).find(k => kind(k) === 'manual');
  const food = Object.keys(GAME_ITEMS).find(k => kind(k) === 'food');
  const stat = Object.keys(GAME_ITEMS).find(k => kind(k) === 'stat');
  const material = Object.keys(GAME_ITEMS).find(k => kind(k) === 'material');
  assert.ok(matchItemFilter(consumable, 'item') && matchItemFilter(seal, 'item'));
  assert.ok(matchItemFilter(manual, 'book'));
  assert.ok(matchItemFilter(food, 'food'));
  assert.ok(matchItemFilter(stat, 'stat'));
  assert.ok(matchItemFilter(material, 'material'));
  // 道具 does not swallow food or materials.
  assert.ok(!matchItemFilter(food, 'item'));
  assert.ok(!matchItemFilter(material, 'item'));
});

test('filterCounts gives honest per-chip numbers over a mixed list', () => {
  const keys = Object.keys(GAME_ITEMS);
  const counts = filterCounts(keys);
  // Everything lands in 全部; every weapon-type chip counts only weapon-kind items of that type.
  assert.equal(counts.all, keys.length);
  let weapons = 0;
  for (const key of keys) if (GAME_ITEMS[key].kind === 'weapon') weapons++;
  assert.equal(
    WEAPON_FILTERS.reduce((n, f) => n + (counts[f] ?? 0), 0),
    weapons,
    'weapon-type chips together count exactly the weapon-kind items',
  );
  // An empty list yields no counts, so a shop with no weapons shows no weapon numbers.
  assert.deepEqual(filterCounts(['herb']), { all: 1, material: 1 });
  // 任务物品只落在「任务」，不混进材料或道具。
  assert.deepEqual(filterCounts(['old_map']), { all: 1, key: 1 });
  assert.deepEqual(filterCounts([]), {});
});

test('isItemFilter and kindOrder support sorting and safe state resets', () => {
  assert.ok(isItemFilter('sword') && isItemFilter('book') && isItemFilter('all'));
  assert.ok(!isItemFilter('everything') && !isItemFilter('seal'));
  // Weapons first, materials last — the shop list keeps this order under every filter.
  assert.ok(kindOrder('iron_sword' in GAME_ITEMS ? 'iron_sword' : Object.keys(WEAPONS)[0]) === 0);
  assert.equal(kindOrder('herb'), KIND_ORDER.indexOf('material'));
  assert.equal(kindOrder('not_an_item'), KIND_ORDER.length);
});
