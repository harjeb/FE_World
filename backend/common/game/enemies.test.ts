import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_CLASS_IDS, CLASSES } from '../data/classes.ts';
import { createEnemy, enemyStats, templateFor } from './enemies.ts';
import { STAT_KEYS } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import { canUseWeapon, weaponRange } from '../engine/units.ts';
import { movementBudget } from '../engine/movement.ts';
import { createClassicBattle } from './battles.ts';
import { createUnit } from './model.ts';

import { runScenarioEvents } from '../engine/scenario.ts';
import type { BattleEvent } from '../engine/types.ts';

test('normal creation preserves template stats, gear, ranks and metadata exactly', () => {
  for (const classId of CATALOG_CLASS_IDS) {
    const tpl = templateFor(classId), stats = enemyStats(classId, 1);
    const spec = { classId, level: 1, pos: [1, 2] as [number, number], boss: true, behavior: 'hold' as const, name: 'probe', tags: ['demon'] as const };
    const normal = createEnemy('enemy', { ...spec, tags: [...spec.tags] });
    assert.deepEqual(normal, {
      id: 'enemy', name: 'probe', side: 'enemy', classId, level: 1, exp: 0, stats, con: 8, hp: stats.hp,
      pos: [1, 2], weapons: tpl.weapons, items: [], ranks: tpl.ranks, boss: true, behavior: 'hold', acted: false, alive: true, tags: ['demon'],
    });
    assert.deepEqual(createEnemy('enemy', { ...spec, tags: [...spec.tags], seed: 'ignored', aiDifficulty: 'normal' }), normal);
  }
});

test('hard rolls are repeatable and vary by explicit seed and unit ID', () => {
  const spec = { classId: 'fighter' as const, level: 1, pos: [0, 0] as [number, number], aiDifficulty: 'hard' as const };
  const first = createEnemy('enemy', spec);
  createEnemy('unrelated', spec);
  assert.deepEqual(createEnemy('enemy', spec), first);
  assert.deepEqual(createEnemy('enemy', { ...spec, seed: 'enemy' }), first);
  const rolls = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(createEnemy('enemy', { ...spec, seed: `seed-${i}` }).stats)));
  assert.ok(rolls.size > 1);
  assert.notDeepEqual(createEnemy('other', spec).stats, first.stats);
});

test('hard levels, every stat including zero bases, constitution and movement obey bounds', () => {
  const { state } = createClassicBattle([createUnit('erin', 1, 'player')], { mapId: 'fe1-ch16', seed: 'caps' });
  let zeroBoosts = 0, capped = 0;
  for (const classId of CATALOG_CLASS_IDS) for (const level of [1, 50, 98, 99, 10000]) {
    const spec = { classId, level, pos: [0, 0] as [number, number] };
    const normal = createEnemy('enemy', spec);
    const hard = createEnemy('enemy', { ...spec, aiDifficulty: 'hard' });
    assert.ok(hard.level >= Math.max(level, Math.min(99, level + 2)));
    assert.ok(hard.level <= Math.max(level, Math.min(99, level + 5)));
    const base = enemyStats(classId, hard.level);
    for (const key of STAT_KEYS) {
      const cap = CLASSES[classId].caps[key] ?? Infinity;
      const min = key === 'hp' ? 20 : 10, max = key === 'hp' ? 35 : 25;
      assert.ok(hard.stats[key] >= Math.min(cap, base[key] + Math.max(1, Math.ceil(base[key] * min / 100))), `${classId} ${key} minimum`);
      assert.ok(hard.stats[key] <= Math.min(cap, base[key] + Math.max(1, Math.ceil(base[key] * max / 100))), `${classId} ${key} maximum`);
      if (base[key] === 0 && cap > 0) { assert.equal(hard.stats[key], 1); zeroBoosts++; }
      if (hard.stats[key] === cap) capped++;
    }
    assert.ok(hard.con >= 9 && hard.con <= 11);
    assert.equal(hard.hp, hard.stats.hp);
    assert.equal(hard.classId, normal.classId);
    assert.equal(movementBudget(state, hard), movementBudget(state, normal));
  }
  assert.ok(zeroBoosts > 0 && capped > 0);
});

test('all catalog classes get legal stronger gear while retaining original tactical options', () => {
  for (const classId of CATALOG_CLASS_IDS) {
    const normal = createEnemy('enemy', { classId, level: 1, pos: [0, 0] });
    const hard = createEnemy('enemy', { classId, level: 1, pos: [0, 0], aiDifficulty: 'hard' });
    assert.equal(new Set(hard.weapons).size, hard.weapons.length);
    for (const id of hard.weapons) assert.ok(canUseWeapon(hard, id), `${classId}: ${id}`);
    for (const id of normal.weapons) {
      assert.ok(hard.weapons.includes(id), `${classId} retains ${id}`);
      const original = WEAPONS[id];
      if (!original.heal) assert.ok(hard.weapons.some(candidate => WEAPONS[candidate].type === original.type && WEAPONS[candidate].might > original.might), `${classId} improves ${id}`);
      else {
        assert.equal(hard.behavior, 'healer');
        assert.equal(hard.weapons.find(candidate => WEAPONS[candidate].heal), 'recover');
        if (id === 'recover') {
          assert.ok(hard.weapons.includes('physic'));
          assert.ok(weaponRange(hard, 'physic')[1] > 1);
        }
      }
    }
  }
});

test('scripted reinforcements inherit hard bonuses once and persist them in spawn events', () => {
  const party = [createUnit('erin', 1, 'player')];
  const spawned = [];
  for (const aiDifficulty of ['normal', 'hard'] as const) {
    const { state } = createClassicBattle(party, { mapId: 'fe1-ch16', seed: 'reinforcements', aiDifficulty });
    const initial = structuredClone(state.units);
    const event = { id: 'boost-probe', trigger: { kind: 'turn' as const, turn: 1 }, actions: [
      { kind: 'spawn' as const, units: [{ classId: 'fighter' as const, levelOffset: 0, pos: [0, 0] as [number, number] }] },
    ] };
    state.scenario!.baseLevel = 1;
    state.scenario!.events = [event];
    const events: BattleEvent[] = [];
    runScenarioEvents(state, events);
    const spawn = events.find(e => e.t === 'spawn');
    assert.ok(spawn?.t === 'spawn' && spawn.spawned);
    const enemy = state.units.find(u => u.id === spawn.unit)!;
    assert.deepEqual(spawn.spawned, enemy);
    assert.deepEqual(state.units.slice(0, initial.length), initial, 'existing enemies are never rebuffed');
    const restored = JSON.parse(JSON.stringify(state));
    runScenarioEvents(restored, []);
    assert.deepEqual(restored, JSON.parse(JSON.stringify(state)), 'saved event cannot grant a second bonus or spawn twice');
    spawned.push(enemy);
  }
  assert.equal(spawned[0].hp, 22);
  assert.equal(spawned[0].level, 1);
  assert.ok(spawned[1].level >= 3 && spawned[1].level <= 6);
  const base = enemyStats('fighter', spawned[1].level);
  for (const key of STAT_KEYS) {
    const percentMin = key === 'hp' ? 20 : 10, percentMax = key === 'hp' ? 35 : 25;
    assert.ok(spawned[1].stats[key] >= base[key] + Math.max(1, Math.ceil(base[key] * percentMin / 100)));
    assert.ok(spawned[1].stats[key] <= base[key] + Math.max(1, Math.ceil(base[key] * percentMax / 100)));
  }
  assert.ok(spawned[1].weapons.includes('steel_axe'));
});
