import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSES, CATALOG_CLASS_IDS } from '../data/classes.ts';
import { canWield } from '../engine/units.ts';
import { runScenarioEvents } from '../engine/scenario.ts';
import { createClassicBattle, createFieldBattle, createFestivalBattle } from './battles.ts';
import { CLASSIC_MAPS } from './classic-catalog.ts';
import { createEnemy, enemyClassForLevel } from './enemies.ts';
import { canEnter } from '../maps/map.ts';
import { createUnit } from './model.ts';
import type { BattleEvent } from '../engine/types.ts';

const party = (level = 1) => Array.from({ length: 3 }, (_, i) => createUnit('erin', level, `u${i}`, 0));
const stageAt = (level: number) => level >= 81 ? 5 : level >= 66 ? 4 : level >= 47 ? 3 : level >= 20 ? 2 : 1;

test('every class respects each stage boundary without replacing already eligible classes', () => {
  for (const level of [1, 19, 20, 46, 47, 65, 66, 80, 81, 95]) for (const classId of CATALOG_CLASS_IDS) {
    if (CLASSES[classId].stage === 0) continue;
    const eligible = enemyClassForLevel(classId, level);
    assert.ok(CLASSES[eligible].stage <= stageAt(level), `${classId} at Lv${level}`);
    if (CLASSES[classId].stage <= stageAt(level)) assert.equal(eligible, classId);
  }
});

test('field party levels and dungeon/annual date levels select eligible enemy classes', () => {
  for (const level of [1, 19, 20, 46, 47, 65, 66, 80, 81, 95]) {
    for (const aiDifficulty of ['normal', 'hard'] as const) {
      const field = createFieldBattle(party(level), { region: 1, cleared: 0, seed: `progress-${level}`, aiDifficulty });
      const dungeon = createFieldBattle(party(), { region: 1, cleared: 0, level, stageIndex: 2, seed: `dungeon-${level}`, aiDifficulty });
      const annual = createFestivalBattle(party(), 1, `annual-${level}`, { day: (level - 1) * 80 });
      for (const battle of [field, dungeon, annual]) for (const enemy of battle.state.units.filter(u => u.side === 'enemy')) {
        assert.ok(CLASSES[enemy.classId].stage <= stageAt(enemy.level), `${battle.id}: Lv${enemy.level} ${enemy.classId}`);
        assert.ok(enemy.weapons.every(id => canWield(enemy, id)));
      }
    }
  }
});

test('all classic openings and scripted reinforcements obey the same class progression', () => {
  for (const map of CLASSIC_MAPS) {
    const { state } = createClassicBattle(party(), { mapId: map.id, day: 0, seed: `early-${map.id}`, aiDifficulty: 'hard' });
    assert.equal(new Set(state.units.map(unit => unit.pos.join(','))).size, state.units.length, `${map.id}: no relocated overlaps`);
    for (const enemy of state.units.filter(u => u.side === 'enemy')) {
      assert.equal(CLASSES[enemy.classId].stage, 1, `${map.id}: ${enemy.classId}`);
      assert.ok(enemy.weapons.every(id => canWield(enemy, id)));
      assert.ok(canEnter(state.map.tiles[enemy.pos[1]][enemy.pos[0]], CLASSES[enemy.classId].moveType), `${map.id}: legal downgraded spawn`);
    }
  }
  const { state } = createClassicBattle(party(), { mapId: 'fe1-ch16', seed: 'reinforcement-progress', aiDifficulty: 'hard' });
  state.scenario!.baseLevel = 1;
  state.map.tiles[0][0] = 'mountain';
  state.scenario!.events = [{ id: 'promotion-probe', trigger: { kind: 'turn', turn: 1 }, actions: [
    { kind: 'spawn', units: [{ classId: 'dragon_commander', levelOffset: 0, pos: [0, 0] }] },
  ] }];
  const events: BattleEvent[] = [];
  runScenarioEvents(state, events);
  const spawned = events.filter(event => event.t === 'spawn');
  assert.ok(spawned.length > 0);
  for (const event of spawned) {
    assert.equal(CLASSES[event.spawned!.classId].stage, 1);
    const unit = event.spawned!;
    assert.ok(canEnter(state.map.tiles[unit.pos[1]][unit.pos[0]], CLASSES[unit.classId].moveType));
    assert.deepEqual(event.spawned, state.units.find(unit => unit.id === event.unit));
  }
});

test('generic enemy names describe factions or identities, not classes; explicit names remain intact', () => {
  for (const classId of CATALOG_CLASS_IDS) {
    const spec = { classId, level: 1, pos: [0, 0] as [number, number], seed: 'names' };
    const enemy = createEnemy('enemy', spec);
    assert.match(enemy.name, /军团|强盗|小偷|军$/);
    assert.deepEqual(createEnemy('enemy', spec), enemy, 'names do not reroll');
    assert.equal(createEnemy('boss', { ...spec, name: '布洛克' }).name, '布洛克');
  }
});
