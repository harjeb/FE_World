import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyLevel } from './calendar.ts';
import { createFieldBattle, createFestivalBattle } from './battles.ts';
import { createUnit } from './model.ts';
import { fieldEncounter } from './encounters.ts';
import { CLASSES } from '../data/classes.ts';
import { enemyStats } from './enemies.ts';

test('enemy dates grow faster early and slower later, with a bounded regional offset', () => {
  for (const [day, expected] of [[0, 1], [100, 4], [250, 10], [499, 19], [500, 20], [1000, 35], [1500, 47], [2000, 57], [2500, 66], [3000, 74], [3500, 81], [4000, 87]]) {
    assert.equal(enemyLevel(day), expected);
    assert.equal(enemyLevel(day, 2), expected + 2);
  }
  assert.equal(enemyLevel(99999, 2), 95);
});

test('field mobs follow the floored deployment average with seeded -1/0/+1 variation', () => {
  const units = [createUnit('erin', 11, 'u1'), createUnit('erin', 16, 'u2')];
  const levels = new Set<number>();
  for (let i = 0; i < 24; i++) {
    const encounter = fieldEncounter(`levels-${i}`, 0, 1);
    const options = { region: 1, day: 0, cleared: 0, seed: 'combat', encounter };
    const battle = createFieldBattle(units, options);
    const foes = battle.state.units.filter(u => u.side === 'enemy');
    assert.equal(foes.find(u => u.boss)!.level, 17, 'floor(13.5) + 4');
    for (const mob of foes.filter(u => !u.boss)) {
      levels.add(mob.level);
      assert.ok(mob.level >= 12 && mob.level <= 14);
      assert.deepEqual(mob.stats, enemyStats(mob.classId, mob.level));
    }
    const reordered = createFieldBattle([...units].reverse(), { ...options, cleared: 12, day: 4000, seed: 'other-combat' });
    assert.deepEqual(reordered.state.units.filter(u => u.side === 'enemy'), foes, 'fixed encounter and average, not order, date or clear count');
    assert.notDeepEqual(battle.state.rng, reordered.state.rng);
    assert.deepEqual(battle.initial, battle.state);
  }
  assert.deepEqual([...levels].sort((a, b) => a - b), [12, 13, 14]);
  const solo = createFieldBattle(units.slice(0, 1), { region: 1, cleared: 0, seed: 'solo', level: 99 });
  assert.equal(solo.state.units.find(u => u.side === 'enemy' && u.boss)!.level, 15, 'only deployed units count');
});

test('field scaling has no level-50 limit and only caps at global level 99', () => {
  for (const aiDifficulty of ['normal', 'hard'] as const) for (const partyLevel of [1, 20, 49, 50, 66, 81, 95, 99]) {
    for (let i = 0; i < 12; i++) {
      const units = [createUnit('erin', partyLevel, 'u')];
      const { state } = createFieldBattle(units, { region: 1, cleared: 0, seed: `cap-${i}`, aiDifficulty, legacyDeployment: i % 2 === 0 });
      const base = partyLevel;
      for (const mob of state.units.filter(u => u.side === 'enemy' && !u.boss)) {
        assert.ok(mob.level >= 1 && mob.level <= 99, `${aiDifficulty}: ${mob.level}`);
        const hardMin = aiDifficulty === 'hard' ? 2 : 0, hardMax = aiDifficulty === 'hard' ? 5 : 0;
        assert.ok(mob.level >= Math.min(99, Math.max(1, base - 1) + hardMin));
        assert.ok(mob.level <= Math.min(99, base + 1 + hardMax));
        assert.ok(CLASSES[mob.classId].stage <= (mob.level >= 81 ? 5 : mob.level >= 66 ? 4 : mob.level >= 47 ? 3 : mob.level >= 20 ? 2 : 1));
        if (partyLevel >= 66) assert.ok(mob.level > 50);
      }
      const boss = state.units.find(u => u.side === 'enemy' && u.boss)!;
      assert.ok(boss.level >= Math.min(99, base + 4) && boss.level <= Math.min(99, base + (aiDifficulty === 'hard' ? 9 : 4)));
      if (partyLevel >= 50) assert.ok(boss.level > 50);
    }
  }
});

test('dungeon stages use the locked entry level even across calendar bands', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFieldBattle([unit], { region: 1, day: 360, cleared: 12, seed: 'locked', level: enemyLevel(239), stageIndex: 2 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 14);
});

test('annual opponents use the fixed edition date plus round difficulty', () => {
  const unit = createUnit('erin', 20, 'u', 0);
  const battle = createFestivalBattle([unit], 9, 'annual-date', { day: 240 });
  assert.equal(battle.state.units.find(u => u.side === 'enemy')!.level, 14);
});
