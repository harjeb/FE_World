import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSES } from '../data/classes.ts';
import { WEAPONS } from '../data/weapons.ts';
import { weaponRankBonus } from '../data/weapon-proficiency.ts';
import { unitCombatStats } from '../engine/combat.ts';
import { attackWeapons } from '../engine/units.ts';
import { canEnter } from '../maps/map.ts';
import { createFieldBattle } from './battles.ts';
import { createEnemy, defaultBehavior, enemyStats } from './enemies.ts';
import { createUnit } from './model.ts';
import { fieldEncounter } from './encounters.ts';
import { QUESTS } from './quests.ts';

const party = () => Array.from({ length: 3 }, (_, i) => createUnit('erin', 1, `u${i}`, 0));
const stageAt = (level: number) => level >= 81 ? 5 : level >= 66 ? 4 : level >= 47 ? 3 : level >= 20 ? 2 : 1;

for (const aiDifficulty of ['normal', 'hard'] as const) {
  test(`field/${aiDifficulty}: the commander has the highest level and class-based high growth, with promotion four levels early`, () => {
    for (const level of [1, 8, 9, 15, 16, 19, 20, 21, 32, 33, 42, 43, 44, 45, 46, 47, 50]) for (let seed = 0; seed < 4; seed++) {
      const encounter = fieldEncounter(`boss-${seed}`, 0, 1, aiDifficulty);
      const record = createFieldBattle(party(), { region: 1, cleared: 0, level, aiDifficulty, seed: `boss-${seed}`, encounter });
      const enemies = record.state.units.filter(unit => unit.side === 'enemy');
      const boss = enemies.find(unit => unit.boss)!;
      const mobs = enemies.filter(unit => !unit.boss);
      assert.equal(enemies.filter(unit => unit.boss).length, 1);
      assert.ok(mobs.length > 0);
      assert.equal(CLASSES[boss.classId].stage, stageAt(level + 4));
      assert.notEqual(boss.behavior, 'healer');
      assert.ok(attackWeapons(boss).length > 0, `${boss.classId}: commander can fight`);
      assert.ok(boss.level >= level + 4 && boss.level <= level + (aiDifficulty === 'hard' ? 9 : 4));
      assert.equal(boss.hp, boss.stats.hp);
      const expected = createEnemy(boss.id, { classId: boss.classId, level: level + 4, pos: boss.pos,
        seed: `${encounter.seed}:foes:0`, aiDifficulty, highGrowth: true, boss: true, levelRanks: true });
      assert.deepEqual(boss.stats, expected.stats, 'boss stats depend only on its own class, level and difficulty');
      assert.deepEqual(boss.weapons, expected.weapons, 'proficiency does not upgrade equipment');
      assert.deepEqual(Object.keys(boss.ranks).sort(), Object.keys(CLASSES[boss.classId].weapons).sort());
      assert.deepEqual(boss.ranks, expected.ranks, 'boss proficiency follows its level with one extra rank, not template caps');
      for (const mob of mobs) {
        assert.ok(boss.level > mob.level, `${boss.level} > ${mob.level}`);
        assert.ok(CLASSES[mob.classId].stage <= stageAt(level), 'mobs keep their ordinary class limit');
        assert.deepEqual(mob.ranks, createEnemy(mob.id, { classId: mob.classId, level, pos: mob.pos,
          seed: `${encounter.seed}:foes:0`, aiDifficulty, levelRanks: true }).ranks, 'mobs follow level progression without the boss offset');
      }
      assert.ok(boss.stats.hp <= 150);
      for (const enemy of enemies) assert.ok(canEnter(record.state.map.tiles[enemy.pos[1]][enemy.pos[0]], CLASSES[enemy.classId].moveType));
      assert.deepEqual(record.initial, record.state, 'boss bonuses are frozen in the opening snapshot');
    }
  });
}

test('field boss proficiency applies existing combat bonuses without modifying base attributes', () => {
  const { state } = createFieldBattle(party(), { region: 1, cleared: 0, level: 16, seed: 'boss-2' });
  const boss = state.units.find(unit => unit.side === 'enemy' && unit.boss)!;
  const original = createEnemy(boss.id, { classId: boss.classId, level: boss.level, pos: boss.pos, highGrowth: true, levelRanks: true });
  assert.notDeepEqual(boss.ranks, original.ranks, 'a lower-rank template actually gains proficiency');
  assert.deepEqual(boss.stats, original.stats, 'proficiency does not add base attributes');
  const weapon = attackWeapons(boss)[0];
  const type = WEAPONS[weapon].type;
  const base = unitCombatStats(state, { ...boss, ranks: original.ranks }, weapon), boosted = unitCombatStats(state, boss, weapon);
  const bonus = weaponRankBonus(type, boss.ranks[type]);
  assert.deepEqual([boosted.attack - base.attack, boosted.hit - base.hit, boosted.crit - base.crit],
    [bonus.attack, bonus.hit, bonus.crit]);
  assert.ok(bonus.attack > 0 || bonus.hit > 0);
});

test('hard legacy reserves do not inherit the boss promotion, bonus level or proficiency', () => {
  const { state } = createFieldBattle(party().slice(0, 1), { region: 1, cleared: 0, level: 16, aiDifficulty: 'hard', legacyDeployment: true, seed: 'single-boss' });
  const boss = state.units.find(unit => unit.side === 'enemy' && unit.boss)!;
  const reserve = state.units.find(unit => unit.id.startsWith('reserve-'))!;
  assert.ok(reserve);
  assert.equal(CLASSES[boss.classId].stage, 2);
  assert.equal(CLASSES[reserve.classId].stage, 1);
  assert.ok(boss.level > reserve.level);
  const expected = createEnemy(reserve.id, { classId: reserve.classId, level: 16, pos: reserve.pos,
    seed: `${state.id}:reserves`, aiDifficulty: 'hard', levelRanks: true });
  assert.deepEqual(reserve.stats, expected.stats, 'reserves keep ordinary growth');
  assert.deepEqual(reserve.ranks, expected.ranks, 'reserves keep ordinary proficiency');
});

test('generated dungeon and quest commanders retain their configured progression and stats', () => {
  const quest = QUESTS.find(row => !row.scenarioId && !row.scenarioIds)!;
  for (const extra of [{ stageIndex: 0 }, { quest }]) {
    const { state } = createFieldBattle(party(), { region: 1, cleared: 0, level: 16, seed: 'ordinary-commander', ...extra });
    const boss = state.units.find(unit => unit.side === 'enemy' && unit.boss)!;
    assert.equal(CLASSES[boss.classId].stage, 1);
    assert.equal(boss.level, 16);
    assert.deepEqual(boss.stats, enemyStats(boss.classId, boss.level));
    assert.deepEqual(boss.ranks, createEnemy(boss.id, { classId: boss.classId, level: 16, pos: boss.pos }).ranks);
    assert.equal(boss.behavior, defaultBehavior(boss.classId));
  }
});
