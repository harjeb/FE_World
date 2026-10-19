import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveProtagonistTendency, PROTAGONIST_ALLOCATION_BUDGET, PROTAGONIST_ALLOCATION_DEFAULT, PROTAGONIST_BASE_STATS, PROTAGONIST_CLASS_ID, PROTAGONIST_GROWTH_TYPE, PROTAGONIST_MAX_ALLOCATION, PROTAGONIST_MIN_ALLOCATION, PROTAGONIST_TENDENCIES } from '../data/characters.ts';
import { CLASSES } from '../data/classes.ts';
import { RANKS, STAT_KEYS } from '../data/types.ts';
import type { Rank, StatKey, Stats } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import { createUnit, primaryWeaponType, RECRUIT_RANK_STEP_LEVELS, recruitRank, startingGearKit } from './model.ts';

const stat = (values: Partial<Record<StatKey, number>>): Stats =>
  Object.fromEntries(STAT_KEYS.map(key => [key, values[key] ?? 0])) as Stats;

test('protagonist keeps its fixed base, with 10 unspent bonus points and a 5-point cap on every stat', () => {
  assert.deepEqual(PROTAGONIST_BASE_STATS, { hp: 20, str: 6, mag: 4, skl: 6, spd: 6, lck: 5, def: 5, res: 4, cha: 4 });
  assert.equal(PROTAGONIST_ALLOCATION_BUDGET, 10);
  for (const key of STAT_KEYS) {
    assert.equal(PROTAGONIST_ALLOCATION_DEFAULT[key], 0, `${key} starts without bonus points`);
    assert.equal(PROTAGONIST_MIN_ALLOCATION[key], 0);
    assert.equal(PROTAGONIST_MAX_ALLOCATION[key], 5);
  }
  assert.equal(PROTAGONIST_CLASS_ID, 'commoner');
  assert.equal(PROTAGONIST_GROWTH_TYPE, 'growth');
});

test('tendency is derived from the allocation distribution: str×2 / mag×2 / skl+spd / def+res, ties → balanced', () => {
  // 未加点时四组同分，取均衡。
  assert.equal(deriveProtagonistTendency(PROTAGONIST_ALLOCATION_DEFAULT), 'balanced');
  assert.equal(deriveProtagonistTendency(stat({ str: 5, hp: 5 })), 'might');
  assert.equal(deriveProtagonistTendency(stat({ mag: 5, hp: 5 })), 'magic');
  assert.equal(deriveProtagonistTendency(stat({ skl: 5, spd: 5 })), 'skill');
  assert.equal(deriveProtagonistTendency(stat({ def: 5, res: 5 })), 'guard');
  // 任何最高分平手都回落均衡，推导是纯函数、重复调用结果一致。
  assert.equal(deriveProtagonistTendency(stat({ str: 3, skl: 3, spd: 3, hp: 1 })), 'balanced');
  assert.equal(deriveProtagonistTendency(stat({ str: 4, mag: 2, hp: 4 })), 'might');
  const allocation = stat({ mag: 5, spd: 5 });
  assert.equal(deriveProtagonistTendency(allocation), deriveProtagonistTendency(allocation), 'derivation is idempotent');
  // 五条倾向向量都在表里，名字与向量一一对应。
  assert.equal(Object.keys(PROTAGONIST_TENDENCIES).length, 5);
  assert.equal(PROTAGONIST_TENDENCIES.balanced.name, '均衡');
});

test("the 'basic' kit: all supported ranks E, one cheapest wooden/E weapon of the primary type, at most one beginner book", () => {
  // 平民只拿一把木剑：熟练度覆盖全部支持类型，但装备不铺满、也不送书。
  const hero = createUnit('erin', 1, 'u_p', 0, true, {
    classId: 'commoner', growthType: 'growth', base: PROTAGONIST_BASE_STATS, startingGear: 'basic',
  });
  assert.deepEqual(hero.weapons, ['fw_weapon_1']);
  assert.deepEqual(hero.spellbooks, []);
  assert.ok(Object.values(hero.ranks).every(rank => rank === 'E'));
  assert.deepEqual(Object.keys(hero.ranks).sort(), Object.keys(CLASSES.commoner.weapons).sort());
  assert.equal(primaryWeaponType('commoner'), 'sword');

  // 法术职业：一本 E 级入门书 + 一件 E 级主武器，不再是「四本强书」的旧演示套裝。
  const mage = createUnit('sera', 1, 'u_m', 0, true, { startingGear: 'basic' });
  assert.equal(primaryWeaponType('mage'), 'tome');
  assert.deepEqual(mage.weapons, ['fire']);
  assert.deepEqual(mage.spellbooks.map(b => b.id), ['fire']);
  assert.ok(mage.spellbooks.every(b => b.charges === b.maxCharges), 'books come with full charges');

  const cleric = createUnit('noah', 1, 'u_c', 0, true, { startingGear: 'basic' });
  assert.equal(primaryWeaponType('cleric'), 'staff');
  assert.deepEqual(cleric.weapons, ['heal']);
  assert.deepEqual(cleric.spellbooks.map(b => b.id), ['fw_spell_12']);

  // 每个 basic 武器都是 E 级、满耐久，并给一瓶满用量的伤药。
  const kit = startingGearKit('fighter', 1, 'basic');
  assert.equal(kit.weapons.length, 1);
  assert.ok(kit.weapons.every(id => WEAPONS[id].rank === 'E'));
  assert.ok(kit.items.every(([, uses]) => uses > 0), 'basic items come with full uses');
});

test("the 'recruit' kit: bounded deterministic ranks from level AND class cap, modest iron/steel gear", () => {
  // 1 级永远是 E；每 12 级升一档；30 级封顶 C，绝不出现早期 S/SS/SSS。
  assert.equal(recruitRank(1, 'fighter', 'axe'), 'E');
  assert.equal(recruitRank(12, 'fighter', 'axe'), 'E');
  assert.equal(recruitRank(13, 'fighter', 'axe'), 'D');
  assert.equal(recruitRank(25, 'fighter', 'axe'), 'C');
  assert.equal(recruitRank(30, 'fighter', 'axe'), 'C');
  assert.equal(recruitRank(96, 'fighter', 'axe'), 'S', 'progression is bounded by the class rank cap');
  assert.equal(recruitRank(200, 'fighter', 'axe'), 'S', 'progression is bounded by the class rank cap');
  assert.equal(RECRUIT_RANK_STEP_LEVELS, 12);

  // 高级招募：16 级战士主斧 D + 铁/钢成套（主武器类型在前，总携带≤5），熟练度经验与等级一致。
  const veteran = createUnit('karl', 16, 'u_v', 0, true, { classId: 'fighter', startingGear: 'recruit' });
  assert.equal(veteran.ranks.axe, 'D');
  assert.deepEqual(veteran.weaponExp, { axe: 30, sword: 30, fist: 30 });
  assert.deepEqual(veteran.weapons, ['iron_axe', 'steel_axe', 'iron_sword', 'steel_sword', 'gauntlet']);
  assert.ok(veteran.weaponInstances!.every(row => row.durability === row.maxDurability));

  // 30 级招募到 C：钢系主力，仍是铁/钢档次，绝无 killer 系。
  const elite = createUnit('karl', 30, 'u_e', 0, true, { classId: 'fighter', startingGear: 'recruit' });
  assert.equal(elite.ranks.axe, 'C');
  assert.deepEqual(elite.weapons, ['steel_axe', 'iron_axe', 'steel_sword', 'iron_sword', 'steel_gauntlet']);

  // 法系招募：理排在最前且只带一本入门书。
  const battleMage = createUnit('sera', 20, 'u_bm', 0, true, { classId: 'mage', startingGear: 'recruit' });
  assert.equal(battleMage.ranks.tome, 'D');
  assert.deepEqual(battleMage.weapons, ['fire', 'thunder', 'iron_sword', 'steel_sword', 'gauntlet']);
  assert.deepEqual(battleMage.spellbooks.map(b => b.id), ['fire']);

  // 通用性质：任何招募的武器都能用（武器等级 ≤ 单位熟练度、职业有权限）、道具满用量、无必杀系。
  const FORBIDDEN = ['killing_edge', 'killer_lance', 'killer_axe', 'killer_bow', 'killer_gauntlet', 'silver_sword', 'brave_sword'];
  for (const level of [1, 5, 13, 24, 30]) {
    for (const classId of ['fighter', 'mage', 'cleric', 'cavalier', 'pegasus', 'knight', 'archer', 'ninja'] as const) {
      const kit = startingGearKit(classId, level, 'recruit');
      assert.ok(kit.weapons.length <= 5, `${classId} @${level} carries at most 5 weapons`);
      for (const id of kit.weapons) {
        const weapon = WEAPONS[id];
        assert.equal(CLASSES[classId].weapons[weapon.type] !== undefined, true, `${classId} may use ${weapon.type}`);
        assert.ok(RANKS.indexOf(weapon.rank) <= RANKS.indexOf(kit.ranks[weapon.type] as Rank), `${id} usable at the granted rank`);
        assert.ok(!FORBIDDEN.includes(id), `${id} is not scarce/killer free gear`);
      }
      assert.ok(kit.spellbooks.length <= 1, `${classId} @${level} carries at most one beginner book`);
      assert.ok(kit.items.every(([, uses]) => uses > 0));
    }
  }
});

test('the legacy demo kits stay untouched without an explicit startingGear', () => {
  const erin = createUnit('erin', 1, 'u_old', 0, true);
  assert.deepEqual(erin.weapons, ['killing_edge', 'steel_sword'], 'KITS still apply for unnamed fixture units');
  assert.equal(erin.ranks.sword, 'C');
  // 显式职业覆盖但仍未指定 startingGear：保持旧的每类一把 E 武器行为。
  const overridden = createUnit('erin', 1, 'u_over', 0, true, { classId: 'gladiator' });
  assert.deepEqual(overridden.weapons, ['slim_sword', 'iron_axe', 'gauntlet']);
  assert.deepEqual(overridden.spellbooks, []);
});
