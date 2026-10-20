import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_CLASS_IDS, CLASSES } from './classes.ts';
import { allPromotionsFor, promotionsFor, PROMOTIONS } from './promotions.ts';

test('stage>=3 foot move is 6, mounted 7, armored keeps reference values, flying is always 7', () => {
  for (const id of CATALOG_CLASS_IDS) {
    const cls = CLASSES[id];
    if (cls.moveType === 'flying') assert.equal(cls.move, 7, id);
    else if (cls.stage >= 3 && !cls.armored) assert.equal(cls.move, cls.moveType === 'mounted' ? 7 : 6, id);
    else assert.ok(cls.move > 0, id);
  }
  // 飞行所有阶级一律 7；第 3 阶起步行 6、骑乘 7；重甲保留原值。
  assert.equal(CLASSES.pegasus.move, 7);
  assert.equal(CLASSES.falcon.move, 7);
  assert.equal(CLASSES.dragon_knight.move, 7);
  assert.equal(CLASSES.dragon_commander.move, 7);
  assert.equal(CLASSES.paladin.move, 7);
  assert.equal(CLASSES.divine_cavalier.move, 7);
  assert.equal(CLASSES.valkyrie.move, 7);
  assert.equal(CLASSES.high_epitaph.move, 7);
  assert.equal(CLASSES.cavalier.move, 6, '第 2 阶骑乘保留原值');
  assert.equal(CLASSES.blade.move, 6);
  assert.equal(CLASSES.dreadnought.move, 4);
  assert.equal(CLASSES.fortress.move, 4);
  assert.equal(CLASSES.great_knight.move, 6);
  assert.equal(CLASSES.cataphract.move, 5);
  assert.equal(CLASSES.knight.move, 4);
});

test('allPromotionsFor offers every qualified-rank catalog class except the current one', () => {
  for (const id of CATALOG_CLASS_IDS) {
    const options = allPromotionsFor(id);
    const targets = new Set(options.map(p => p.to));
    assert.equal(options.length, CATALOG_CLASS_IDS.length - 1, id);
    assert.ok(!targets.has(id), id);
    // 推荐路线的转职都在全职业列表里，且目标数据完整。
    for (const p of promotionsFor(id)) assert.ok(targets.has(p.to), `${id} -> ${p.to}`);
    for (const p of options) {
      assert.equal(CLASSES[p.to].name, p.name);
      assert.equal(p.from, id);
      assert.ok(p.weapons && p.growth && p.tagline);
    }
  }
  // 兽／龙职业也能看到全职业方向；种族限制仍由 classEntryReason 把关。
  const beast = allPromotionsFor('beast_fighter');
  assert.ok(beast.some(p => p.to === 'paladin'));
  const human = allPromotionsFor('swordsman');
  assert.ok(human.some(p => p.to === 'sage') && human.some(p => p.to === 'bishop'));
});
