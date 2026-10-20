import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASIC_GEAR_POOL, GAME_ITEMS, SHOP_STOCK, rotatingBasicGear, BASIC_ROTATION_SIZE } from '../common/game/items.ts';
import { REGION_STOCK_SIZE, isAdvancedStock, itemRank, regionShop, regionStock } from '../common/game/quest-shop.ts';
import { NEW_GAME_GOLD } from './store.ts';
import { QUEST_REGIONS } from '../common/game/quests.ts';

test('reputation shops hold only advanced items; basic gear lives in the capital quartermaster rotation', () => {
  for (const region of QUEST_REGIONS) {
    const pool = regionShop(region, Infinity);
    assert.ok(pool.length >= 1, `region ${region} sells something`);
    for (const row of pool) {
      assert.ok(isAdvancedStock(row.item), `${region}:${row.item} is advanced`);
      const entry = GAME_ITEMS[row.item];
      if (entry.kind === 'weapon' || entry.kind === 'spellbook') assert.ok(!['E', 'D'].includes(itemRank(row.item)), `${region}:${row.item} is rank C or better`);
      assert.ok(!['food', 'material'].includes(entry.kind) || row.item === 'legacy_stone_growth', `${region}:${row.item} is not a supply item`);
    }
  }
  // Nothing was lost: every low-grade item that used to be in a region shop is in the quartermaster pool or the fixed stock.
  const fixed = new Set(SHOP_STOCK.map(row => row.item));
  assert.equal(BASIC_GEAR_POOL.length, 46);
  assert.ok(BASIC_GEAR_POOL.every(item => !fixed.has(item)), 'the pool does not duplicate the fixed stock');
  for (const item of BASIC_GEAR_POOL) assert.ok(['E', 'D'].includes(itemRank(item)), `${item} is basic gear`);
});

test('a region puts only a few items on sale per season, fixed within the season and rotating across seasons', () => {
  for (const region of QUEST_REGIONS) {
    const pool = regionShop(region, 0);
    const now = regionStock(region, 0, 'acct:1');
    assert.equal(now.length, Math.min(REGION_STOCK_SIZE, pool.length), `region ${region}`);
    assert.deepEqual(regionStock(region, 500, 'acct:1').map(r => r.item), now.map(r => r.item), 'reputation does not change the stock');
    for (const row of now) assert.ok(pool.some(p => p.item === row.item) && row.limit >= 1);
  }
  // Over a long run every item of a large pool gets its turn, so all advanced gear stays obtainable.
  for (const region of [3, 6, 12]) {
    const pool = regionShop(region, 0).map(r => r.item);
    const seen = new Set<string>();
    for (let season = 0; season < 200; season++) for (const row of regionStock(region, 0, `acct:${season}`)) seen.add(row.item);
    assert.equal(seen.size, pool.length, `region ${region}: all ${pool.length} items appear over time`);
  }
  assert.notDeepEqual(regionStock(6, 0, 'acct:1').map(r => r.item), regionStock(6, 0, 'acct:2').map(r => r.item));
});

test('the quartermaster rotates a handful of basic items per season and the starting gold is small', () => {
  const a = rotatingBasicGear('p:1'), b = rotatingBasicGear('p:2');
  assert.equal(a.length, BASIC_ROTATION_SIZE);
  assert.equal(new Set(a).size, a.length, 'no duplicates in one season');
  assert.deepEqual(rotatingBasicGear('p:1'), a, 'fixed within a season');
  assert.notDeepEqual(a, b, 'a different season rolls a different batch');
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) for (const item of rotatingBasicGear(`p:${i}`)) seen.add(item);
  assert.equal(seen.size, BASIC_GEAR_POOL.length, 'every basic item is sold sooner or later');
  assert.ok(NEW_GAME_GOLD <= 2_000, `a new game starts with ${NEW_GAME_GOLD} gold, not enough for a big shopping trip`);
});
