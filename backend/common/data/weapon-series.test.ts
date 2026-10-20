import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPANDED_WEAPONS } from './expanded-weapons.ts';
import { TABLE, WEAPONS, WEAPON_SERIES, weaponSeriesTier } from './weapons.ts';
import type { WeaponId } from './weapons.ts';

test('five material tiers use valid distinct IDs, canonical names and increasing might', () => {
  const materials = ['木', '铜', '铁', '钢', '银'];
  const allIds = Object.values(WEAPON_SERIES).flat();
  assert.equal(new Set(allIds).size, 25);
  for (const [type, ids] of Object.entries(WEAPON_SERIES)) {
    assert.equal(ids.length, 5);
    ids.forEach((id, index) => {
      const weapon = WEAPONS[id];
      assert.ok(weapon, id);
      assert.equal(weapon.type, type);
      assert.ok(weapon.name.startsWith(materials[index]), weapon.name);
      assert.equal(weaponSeriesTier(id), index + 1);
      if (index < 3) assert.equal(weapon.rank, 'E');
      if (index > 0) assert.ok(weapon.might > WEAPONS[ids[index - 1]].might, id);
    });
  }
});

test('wood and copper reuse expanded IDs and preserve every non-name stat', () => {
  for (const ids of Object.values(WEAPON_SERIES)) {
    for (const id of ids.slice(0, 2)) {
      assert.ok(Object.hasOwn(EXPANDED_WEAPONS, id));
      const original = EXPANDED_WEAPONS[id as keyof typeof EXPANDED_WEAPONS];
      assert.deepEqual(TABLE[id], { ...original, name: TABLE[id].name });
    }
  }
});

test('original metal tiers preserve combat stats, ranks and fist brave distinction', () => {
  const expected = {
    sword: [[5, 90, 5, 0], [8, 75, 10, 0], [13, 80, 8, 0]],
    lance: [[7, 80, 8, 0], [10, 70, 13, 0], [14, 75, 10, 0]],
    axe: [[8, 75, 10, 0], [11, 65, 15, 0], [15, 70, 12, 0]],
    bow: [[6, 85, 5, 0], [9, 70, 9, 0], [13, 75, 6, 0]],
    fist: [[4, 90, 3, 0], [6, 80, 6, 0], [10, 85, 5, 5]],
  };
  for (const type of Object.keys(expected) as (keyof typeof expected)[]) {
    WEAPON_SERIES[type].slice(2).forEach((id, index) => {
      const w = WEAPONS[id];
      assert.deepEqual([w.might, w.hit, w.weight, w.crit], expected[type][index], id);
      assert.equal(w.rank, ['E', 'D', 'A'][index]);
      assert.deepEqual(w.range, type === 'bow' ? [2, 2] : [1, 1]);
    });
  }
  assert.equal(WEAPONS.gauntlet.brave, true);
  assert.equal(WEAPONS.steel_gauntlet.brave, true);
  assert.equal(WEAPONS.silver_gauntlet.brave, undefined);
});

test('legacy special weapons remain valid and outside material series', () => {
  const legacy: WeaponId[] = ['dagger', 'slim_sword', 'rapier', 'iron_blade', 'silver_dagger',
    'brave_sword', 'killing_edge', 'killer_gauntlet', 'royal_sword', 'divine_lance', 'dragonstone'];
  for (const id of legacy) {
    assert.ok(WEAPONS[id], id);
    assert.equal(weaponSeriesTier(id), undefined, id);
  }
  for (const id of Object.keys(EXPANDED_WEAPONS)) assert.ok(Object.hasOwn(WEAPONS, id), id);
  assert.equal(WEAPONS.dagger.type, 'sword');
  assert.equal(WEAPONS.royal_sword.rank, 'SS');
  assert.equal(WEAPONS.divine_lance.rank, 'SSS');
});
