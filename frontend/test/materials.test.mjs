import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@common/')
      ? new URL(`../../backend/common/${specifier.slice(8)}`, import.meta.url).href : specifier, context);
  },
});
const { MATERIAL_IDS, MATERIALS } = await import('@common/game/materials.ts');
const { REGIONS } = await import('@common/game/calendar.ts');
const { materialInfo, matchMaterialFilter, materialSourceLabel, matchRecipeSearch } = await import('../src/model/item-filter.ts');

test('category and tier filters expose every material, including unowned rare species', () => {
  assert.equal(MATERIAL_IDS.length, 72);
  for (const category of ['herb', 'ore', 'wood']) {
    for (let tier = 1; tier <= 6; tier++) {
      const ids = MATERIAL_IDS.filter(id => matchMaterialFilter(id, category, String(tier)));
      assert.equal(ids.length, 4);
      assert.equal(ids.filter(id => materialInfo(id).rare).length, 1);
    }
  }
  assert.equal(MATERIAL_IDS.filter(id => matchMaterialFilter(id, 'all', 'all')).length, 72);
  assert.equal(matchMaterialFilter('seed', 'all', 'all'), false);
  assert.equal(materialInfo('toString'), undefined);
});

test('material details resolve all habitats through the shared region names', () => {
  for (const id of MATERIAL_IDS) {
    assert.deepEqual(materialInfo(id), MATERIALS[id]);
    const names = MATERIALS[id].regions.map(region => REGIONS.find(r => r.id === region)?.name);
    assert.ok(names.every(Boolean), id);
    assert.equal(materialSourceLabel(id), names.join('、'));
  }
  assert.equal(materialSourceLabel('seed'), '');
});

test('recipe search finds recipe names, outputs and ingredients with whitespace and case normalization', () => {
  const recipe = { name: '试制配方', output: { item: 'herb' }, input: [{ item: 'ore' }, { item: 'worldtree_branch' }] };
  for (const query of ['', ' 试制 ', '止血草', '铁矿', '世界树枝', ' WORLDTree_BRANCH ']) {
    assert.equal(matchRecipeSearch(recipe, query), true, query);
  }
  assert.equal(matchRecipeSearch(recipe, '薄荷'), false);
});

test('workshop planting identifies the selected recipe and keeps facility selectors', async () => {
  const source = await readFile(new URL('../src/pages/WorkshopPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /OP\.PLANT, \{ recipeId: recipe\.id \}/);
  assert.doesNotMatch(source, /OP\.PLANT\)/);
  assert.match(source, /data-facility=\{f\.id\}/);
  assert.match(source, /className="eq recipes"/);
  assert.match(source, /itemName\('ore'\)/);
});
