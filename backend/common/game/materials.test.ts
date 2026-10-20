import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { MATERIALS, MATERIAL_IDS, materialTier, materialSources, materialDrops } from './materials.ts';

test('classic supply chests stay local even where their former material category has no source', () => {
  const battle = createClassicBattle([createUnit('erin', 1, 'me', 0)], { mapId: 'fe6-ch13-main', region: 7, level: 1, seed: 'material-chest' });
  const supplies = battle.state.objects.filter(object => object.loot && object.loot.item in MATERIALS);
  assert.ok(supplies.length > 0);
  for (const object of supplies) assert.ok(materialSources(7, 1).includes(object.loot!.item as keyof typeof MATERIALS));
  assert.deepEqual(battle.initial.objects, battle.state.objects);
});

test('catalog has six tiers of three common and one rare species in every category', () => {
  assert.equal(MATERIAL_IDS.length, 72);
  for (const category of ['herb', 'ore', 'wood']) for (let tier = 1; tier <= 6; tier++) {
    const rows = Object.values(MATERIALS).filter(row => row.category === category && row.tier === tier);
    assert.equal(rows.length, 4);
    assert.equal(rows.filter(row => row.rare).length, 1);
  }
  for (const id of MATERIAL_IDS) {
    const regions = MATERIALS[id].regions;
    assert.ok(new Set(regions).size >= 2, id);
    assert.equal(new Set(regions).size, regions.length);
    for (const region of regions) assert.ok(region >= 1 && region <= 12);
  }
  assert.equal(MATERIALS.herb.name, '止血草');
  assert.equal(MATERIALS.ore.tier, 3);
  assert.equal(MATERIALS.wood.name, '白杨木');
  assert.equal(MATERIALS.copper_ore.tier, 2);
  assert.equal(MATERIALS.coal.tier, 4);
  assert.equal(MATERIALS.silver_ore.tier, 5);
});

test('tier boundaries, preview habitats and deterministic independent drops', () => {
  assert.deepEqual([1, 9, 10, 19, 20, 34, 35, 54, 55, 74, 75].map(materialTier), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  for (let region = 1; region <= 12; region++) for (const level of [1, 10, 20, 35, 55, 75]) {
    const sources = materialSources(region, level);
    assert.ok(sources.length > 0);
    const drops = materialDrops(region, level, 'repeatable', 100);
    materialDrops(12, 75, 'unrelated', 40);
    assert.deepEqual(materialDrops(region, level, 'repeatable', 100), drops);
    assert.equal(drops.reduce((sum, row) => sum + row.count, 0), 100);
    for (const row of drops) assert.ok(sources.includes(row.item));
    for (const id of sources) {
      assert.ok(MATERIALS[id].tier <= materialTier(level));
      assert.ok(MATERIALS[id].regions.includes(region));
    }
  }
});

test('rare roll can fail; zero chance never yields rare species', () => {
  assert.ok(materialDrops(9, 75, 'common', 1000, 0).every(row => !MATERIALS[row.item].rare));
  assert.ok(materialDrops(9, 75, 'rare', 100, 1).every(row => MATERIALS[row.item].rare));
  const successes = Array.from({ length: 200 }, (_, i) => materialDrops(9, 75, String(i), 1).some(row => MATERIALS[row.item].rare));
  assert.ok(successes.includes(true) && successes.includes(false));
  assert.deepEqual(materialDrops(1, 1, 'empty', 0), []);
});

test('invalid collection arguments fail before sampling', () => {
  for (const region of [0, 13, 1.5, NaN]) assert.throws(() => materialSources(region, 1), RangeError);
  for (const level of [0, -1, Infinity, NaN]) assert.throws(() => materialTier(level), RangeError);
  for (const rolls of [-1, 0.5, 10001, Infinity, NaN]) assert.throws(() => materialDrops(1, 1, 'bad', rolls), RangeError);
  for (const chance of [-1, 2, NaN]) assert.throws(() => materialDrops(1, 1, 'bad', 1, chance), RangeError);
});
