import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldEncounter } from './encounters.ts';
import { chapterOpenDay } from './story.ts';
import { createFieldBattle, encounterMap } from './battles.ts';
import { createUnit } from './model.ts';
import { createEnemy } from './enemies.ts';
import { runScenarioEvents } from '../engine/scenario.ts';
import { canEnter } from '../maps/map.ts';
import { CLASSES } from '../data/classes.ts';
import type { BattleEvent } from '../engine/types.ts';

const party = (count: number) => Array.from({ length: count }, (_, i) => createUnit('erin', 50, `u${i}`, 0, true));

test('field armies scale with deployment capacity and chapters, with seeded variation and single hard scaling', () => {
  const earlyCounts = new Set<number>();
  for (let chapter = 1; chapter <= 8; chapter++) for (const available of [1, 3, 4, 6, 8, 12]) for (let seed = 0; seed < 30; seed++) {
    const args = [String(seed), chapterOpenDay(chapter), 1] as const;
    const normal = fieldEncounter(...args, 'normal', 'field', available, chapter);
    const hard = fieldEncounter(...args, 'hard', 'field', available, chapter);
    assert.deepEqual(normal, fieldEncounter(...args, 'normal', 'field', available, chapter));
    assert.ok(normal.maxUnits <= available);
    assert.equal(hard.enemyCount, normal.enemyCount + Math.ceil(normal.enemyCount / 2));
    assert.deepEqual([normal.seed, normal.layout, normal.width, normal.height], [hard.seed, hard.layout, hard.width, hard.height]);
    assert.equal(normal.turnLimit, 20 + 2 * (chapter - 1));
    assert.equal(normal.reinforcements!.length, Math.floor((chapter - 1) / 2));
    assert.ok(hard.enemyCount <= 64);
    if (chapter === 1) {
      assert.ok(normal.enemyCount >= 6 && normal.enemyCount <= 10);
      earlyCounts.add(normal.enemyCount);
    }
    if (chapter >= 6) assert.ok(normal.enemyCount >= 20, 'late chapters start with dozens of enemies');
    normal.reinforcements!.forEach((wave, i) => {
      assert.equal(hard.reinforcements![i].count, wave.count + Math.ceil(wave.count / 2));
      assert.equal(wave.turn, 5 + 4 * i);
      assert.ok(wave.turn < normal.turnLimit!);
    });
  }
  assert.deepEqual([...earlyCounts].sort((a, b) => a - b), [6, 7, 8, 9, 10]);
});

test('every chapter fits its planned opening army without reducing its advertised count', () => {
  for (let chapter = 1; chapter <= 8; chapter++) for (const difficulty of ['normal', 'hard'] as const) for (let seed = 0; seed < 5; seed++) {
    const plan = fieldEncounter(`capacity-${seed}`, chapterOpenDay(chapter), 1, difficulty, 'field', 8);
    const map = encounterMap(plan, chapterOpenDay(chapter));
    assert.equal(map.spawns.enemy.length, plan.enemyCount);
    assert.equal(map.spawns.player.length, plan.maxUnits);
  }
});

for (const difficulty of ['normal', 'hard'] as const) {
  test(`${difficulty}: field waves warn in advance, spawn once on the player phase and retain deterministic mob rules after reload`, () => {
    const day = chapterOpenDay(8);
    const encounter = fieldEncounter('waves', day, 1, difficulty, 'field', 8);
    const options = { region: 1, cleared: 0, day, aiDifficulty: difficulty, encounter };
    const preview = createFieldBattle(party(1), { ...options, seed: encounter.seed });
    const actual = createFieldBattle(party(encounter.maxUnits), { ...options, seed: 'server-combat-uuid' });
    assert.equal(actual.state.turnLimit, encounter.turnLimit);
    assert.equal(actual.state.units.filter(u => u.side === 'enemy').length, encounter.enemyCount);
    assert.deepEqual(preview.state.scenario, actual.state.scenario, 'team size and server combat RNG do not reroll waves');
    assert.deepEqual(actual.initial, actual.state);
    const originalRng = structuredClone(actual.state.rng);
    const wave = encounter.reinforcements![0];
    const warning: BattleEvent[] = [];
    actual.state.turn = wave.turn - 1;
    runScenarioEvents(actual.state, warning);
    assert.ok(warning.some(e => e.t === 'scenario' && e.message.includes(`${wave.count}名`)));
    assert.equal(actual.state.units.filter(u => u.side === 'enemy').length, encounter.enemyCount);
    actual.state.turn = wave.turn; actual.state.phase = 'enemy';
    runScenarioEvents(actual.state, []);
    assert.equal(actual.state.units.filter(u => u.side === 'enemy').length, encounter.enemyCount, 'no enemy-phase ambush');
    actual.state.phase = 'player';
    const spawned: BattleEvent[] = [];
    runScenarioEvents(actual.state, spawned);
    const units = spawned.filter(e => e.t === 'spawn').map(e => e.spawned);
    assert.equal(units.length, wave.count, 'hard wave count is not multiplied a second time');
    assert.deepEqual(actual.state.rng, originalRng);
    const action = actual.state.scenario!.events.find(e => e.id === 'field-wave-0')!.actions[0];
    assert.equal(action.kind, 'spawn');
    if (action.kind !== 'spawn') throw new Error('missing spawn action');
    units.forEach((unit, i) => {
      const spec = action.units[i];
      const expected = createEnemy(unit.id, { classId: spec.classId, level: 50 + spec.levelOffset,
        aiDifficulty: difficulty, seed: `${encounter.seed}:field-wave-0`, pos: unit.pos,
        levelRanks: true, vision: difficulty === 'hard' ? 7 : 5 });
      assert.deepEqual(unit.stats, expected.stats);
      assert.deepEqual(unit.ranks, expected.ranks);
      assert.deepEqual(unit.weapons, expected.weapons);
      assert.equal(unit.vision, expected.vision);
      assert.ok(!unit.boss, 'reinforcements never inherit boss growth or rank bonuses');
      assert.ok(canEnter(actual.state.map.tiles[unit.pos[1]][unit.pos[0]], CLASSES[unit.classId].moveType));
    });
    assert.equal(new Set(actual.state.units.filter(u => u.alive).map(u => u.pos.join(','))).size,
      actual.state.units.filter(u => u.alive).length, 'occupied spawn points relocate without overlap');
    const restored = JSON.parse(JSON.stringify(actual.state));
    for (const next of encounter.reinforcements!.slice(1)) {
      actual.state.turn = restored.turn = next.turn;
      runScenarioEvents(actual.state, []); runScenarioEvents(restored, []);
    }
    assert.equal(JSON.stringify(actual.state), JSON.stringify(restored), 'saved fired events prevent duplicate or rerolled waves');
    const count = actual.state.units.length;
    runScenarioEvents(restored, []);
    assert.equal(restored.units.length, count);
    assert.equal(actual.state.units.filter(u => u.side === 'enemy').length,
      encounter.enemyCount + encounter.reinforcements!.reduce((sum, w) => sum + w.count, 0));
    const firstAction = preview.state.scenario!.events.find(e => e.id === 'field-wave-0')!.actions[0];
    assert.equal(firstAction.kind, 'spawn');
    preview.state.turn = wave.turn;
    runScenarioEvents(preview.state, []);
    assert.deepEqual(preview.state.units.filter(u => u.id.startsWith('scenario-field-wave-0')),
      actual.state.units.filter(u => u.id.startsWith('scenario-field-wave-0')), 'future enemies match preview despite different combat seeds');
  });
}

test('dungeons and encounters saved without wave metadata retain their original rules', () => {
  const day = chapterOpenDay(8);
  const dungeon = fieldEncounter('legacy', day, 1, 'normal', 'dungeon', 8);
  assert.equal(dungeon.reinforcements, undefined);
  assert.equal(dungeon.turnLimit, undefined);
  assert.ok(dungeon.enemyCount <= 8);
  const battle = createFieldBattle(party(1), { region: 1, cleared: 0, day, seed: 'dungeon', encounter: dungeon, stageIndex: 0 });
  assert.equal(battle.state.scenario, undefined);
  assert.equal(battle.state.turnLimit, 20);
  const saved = fieldEncounter('saved', day, 1, 'normal', 'field', 8);
  delete saved.reinforcements; delete saved.turnLimit;
  const legacy = createFieldBattle(party(1), { region: 1, cleared: 0, day, seed: 'legacy', encounter: saved });
  assert.equal(legacy.state.scenario, undefined);
  assert.equal(legacy.state.turnLimit, 20);
});
