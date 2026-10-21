import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixedDungeonStages, mixedDungeonMaxUnits, CLASSIC_DUNGEON_IDS } from './dungeon-plans.ts';
import { regionalDungeonName, CLASSIC_DUNGEON_NAMES } from './dungeon-names.ts';
import { STORY_CHAPTER_QUESTS } from './story-quests.ts';
import { CLASSIC_GAME_NAMES, CLASSIC_MAPS, classicMap } from './classic-catalog.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { CLASSIC_QUESTS } from './classic-quests.ts';
import { questById, QUESTS } from './quests.ts';
import { GAME_ITEMS } from './items.ts';
import { materialDrops } from './materials.ts';
import { nextU32, seedRng } from '../engine/rng.ts';

test('mixed plans are deterministic, independent of combat RNG, and reach all sixty regional finales', () => {
  const all = new Set<string>();
  const combat = seedRng('combat');
  for (let region = 1; region <= 12; region++) {
    const seen = new Set<string>();
    for (let sample = 0; sample < 200; sample++) {
      const seed = `plan-${sample}`;
      const stages = mixedDungeonStages(seed, region);
      nextU32(combat);
      assert.deepEqual(mixedDungeonStages(seed, region), stages);
      assert.equal(stages.length, 3);
      assert.equal(stages[0].scenarioId, undefined);
      assert.equal(stages[1].scenarioId, undefined);
      assert.ok(stages.every(stage => stage.name.length > 0));
      const map = classicMap(stages[2].scenarioId!);
      assert.ok(map.enemies.some(enemy => enemy.boss));
      assert.equal(CLASSIC_MAPS.indexOf(map) % 12, region - 1);
      seen.add(map.id);
      all.add(map.id);
    }
    assert.equal(seen.size, 5);
  }
  assert.equal(all.size, 60);
  assert.equal(new Set(Array.from({ length: 12 }, (_, i) => mixedDungeonStages('same', i + 1)[2].scenarioId)).size, 12);
  for (const region of [0, 13, 1.5, NaN]) assert.throws(() => mixedDungeonStages('seed', region));
});

test('deployment limits reserve enough space on every classic stage', () => {
  const stages = CLASSIC_MAPS.map(map => ({ scenarioId: map.id, name: map.name }));
  const min = Math.min(...CLASSIC_MAPS.map(map => classicAdaptation(map.id).deployment.max));
  assert.equal(mixedDungeonMaxUnits(stages, 99), min);
  assert.equal(mixedDungeonMaxUnits(stages, 1), 1);
  assert.equal(mixedDungeonMaxUnits([{ name: 'generated' }], 8), 8);
  assert.equal(mixedDungeonMaxUnits([], 8), 8);
  for (let region = 1; region <= 12; region++) {
    const plan = mixedDungeonStages('deployment', region);
    assert.equal(mixedDungeonMaxUnits(plan, 8), Math.min(8, classicAdaptation(plan[2].scenarioId!).deployment.max));
  }
});

test('six public classic dungeons each retain three coherent stages and no solo prerequisite', () => {
  const quests = CLASSIC_QUESTS.filter(quest => !quest.archived);
  assert.equal(quests.length, 6);
  assert.deepEqual(quests.map(quest => quest.id), [...CLASSIC_DUNGEON_IDS]);
  assert.deepEqual(quests.map(quest => quest.classic?.game), ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']);
  assert.deepEqual(quests.map(quest => quest.region), [2, 3, 5, 2, 3, 5]);
  for (const quest of quests) {
    assert.equal(quest.dungeonOnly, true);
    assert.equal(quest.requires, undefined);
    assert.equal(quest.reward.gold, 3500);
    assert.equal(quest.reward.reputation, 0);
    const level = ['fe6', 'fe7', 'fe8'].includes(quest.classic!.game) ? 35 : 20;
    assert.deepEqual(quest.reward.items, materialDrops(quest.region, level, `classic:${quest.id}`, 8, 0)
      .map(({ item, count }) => [item, count]));
    assert.ok(quest.reward.items!.length > 0);
    for (const [item, count] of quest.reward.items!) {
      assert.equal(GAME_ITEMS[item].kind, 'material');
      assert.ok(Number.isInteger(count) && count > 0);
    }
    assert.equal(quest.stageDays, undefined);
    assert.equal(quest.costDays, 8);
    assert.equal(quest.classic?.stageCount, 3);
    assert.ok(quest.name.length > 0 && !/三图|远征|副本\s*\d/.test(quest.name));
    assert.ok(quest.objective.includes(classicMap(quest.scenarioIds![0]).name));
    assert.ok(!/\d\s*图/.test(quest.objective));
    const ids = quest.scenarioIds!;
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    const maps = ids.map(classicMap);
    assert.ok(maps.every(map => map.game === quest.classic?.game));
    const indexes = maps.map(map => CLASSIC_MAPS.indexOf(map));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
    assert.ok(!ids.some(id => /linus|jerme|ephraim/.test(id)));
    assert.ok(maps.at(-1)!.enemies.some(enemy => enemy.boss));
  }
  assert.ok(QUESTS.every(quest => !quest.archived && !quest.dungeonOnly));
});

test('dungeon and stage names are unique scene names without source titles or chapter numbers', () => {
  const regional = Array.from({ length: 12 }, (_, i) => regionalDungeonName(i + 1));
  const featured = CLASSIC_QUESTS.filter(q => !q.archived).map(q => q.name);
  assert.equal(new Set([...regional, ...featured]).size, 18);
  assert.equal(new Set(CLASSIC_MAPS.map(map => map.name)).size, 60);
  const names = [...regional, ...featured, ...CLASSIC_MAPS.map(map => map.name),
    ...Array.from({ length: 12 }, (_, i) => mixedDungeonStages('names', i + 1).slice(0, 2).map(stage => stage.name)).flat()];
  for (const name of names) {
    assert.ok(!/第.*章|古战场|三图|两张|外围突破|深入据点/.test(name), name);
    for (const source of Object.values(CLASSIC_GAME_NAMES)) assert.ok(!name.includes(source), name);
  }
});

test('story find clues name the dungeon route that actually contains the item', () => {
  for (const chapter of STORY_CHAPTER_QUESTS) for (const step of chapter.steps) {
    if (step.kind !== 'find') continue;
    const name = CLASSIC_DUNGEON_NAMES[step.route as keyof typeof CLASSIC_DUNGEON_NAMES];
    assert.ok(name && step.briefing.includes(name), `${step.id}: ${step.briefing}`);
    assert.ok(!/三图|封印之剑|烈火之剑|光之剑|圣魔之光石/.test(step.briefing));
  }
});

test('all legacy IDs retain their rewards, prerequisites and claim lookup', () => {
  assert.equal(CLASSIC_QUESTS.filter(quest => quest.archived).length, 78);
  for (const game of ['fe1', 'fe2', 'fe3', 'fe6', 'fe7', 'fe8']) {
    const maps = CLASSIC_MAPS.filter(map => map.game === game);
    maps.forEach((map, index) => {
      const quest = questById(`cl-${map.id}`)!;
      assert.equal(quest.archived, true);
      assert.equal(quest.scenarioId, map.id);
      assert.deepEqual(quest.reward, { gold: 900 + index * 120, reputation: 0 });
      assert.deepEqual(quest.requires, index ? { quest: `cl-${maps[index - 1].id}` } : undefined);
    });
    for (let index = 0; index < 3; index++) {
      const quest = questById(`cld-${game}-${index + 1}`)!;
      assert.equal(quest.archived, true);
      assert.deepEqual(quest.reward, { gold: 2500 + index * 800, reputation: 0 });
      assert.deepEqual(quest.requires, { quest: `cl-${quest.scenarioIds!.at(-1)}` });
      assert.equal(quest.stageDays, 2);
      assert.equal(quest.costDays, quest.scenarioIds!.length * 2);
    }
  }
});
